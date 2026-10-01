import type {
  EquipmentSetEntry,
  EquipmentSetSavedPacket,
  SetDeletedEvent,
  SetSavedEvent,
  SetSaveRequestedEvent,
  SetsListedEvent,
  SetUsedEvent,
  SetUseRequestedEvent,
  UseStatus,
} from "#wow/areas/items/protocol-sets";
import type {
  DeleteRequest,
  SaveOutcome,
  SaveRequest,
  SetSlice,
  UseRequest,
} from "#wow/areas/items/sets";

type SetWireEvent =
  | SetsListedEvent
  | SetSaveRequestedEvent
  | SetSavedEvent
  | SetUseRequestedEvent
  | SetUsedEvent
  | SetDeletedEvent;

type Emit = { emit: (event: SetWireEvent) => void };

import {
  type InventoryChangeFailure,
  inventoryResultName,
} from "#wow/protocol/inventory";

export type SetsHost = {
  sets: SetSlice;
  saveIcons: Map<SaveRequest, string>;
  useFailures: string[];
  events: Emit;
  now: () => number;
  startClaims: () => void;
  noteClaims: () => void;
  releaseClaims: () => void;
};

export const emitSave = (
  host: SetsHost,
  outcome: SaveOutcome,
  name: string,
): void => {
  host.events.emit({
    type: "set_saved",
    index: outcome.index,
    setGuid: outcome.setGuid,
    kind: outcome.request.kind,
    name,
    status: outcome.status,
    reason: outcome.reason,
  });
};

const saveListBehavior = (host: SetsHost) => ({
  receiveSetList: (sets: EquipmentSetEntry[]): void => {
    const listed = host.sets.list(sets);
    host.events.emit({ type: "sets_listed", sets: listed });
  },

  pendingSaveName: (): { name: string; icon: string } | undefined => {
    const request = host.sets.snapshot().savePending;
    if (!request) return undefined;
    const icons = host.saveIcons.get(request);
    return { name: request.name, icon: icons ?? "" };
  },
});

const saveRequestBehavior = (host: SetsHost) => ({
  beginSave: (request: SaveRequest, icon = ""): void => {
    host.startClaims();
    host.saveIcons.set(request, icon);
    host.sets.beginSave(request);
    host.noteClaims();
    host.events.emit({
      type: "set_save_requested",
      index: request.index,
      kind: request.kind,
      name: request.name,
    });
  },

  confirmSaved: (
    packet: EquipmentSetSavedPacket,
    name: string,
    icon: string,
  ): SaveOutcome | undefined => {
    const request = host.sets.snapshot().savePending;
    if (request?.kind !== "create") return undefined;
    if (packet.index !== request.index || packet.setGuid === 0n)
      return undefined;
    const outcome = host.sets.applySaved({
      request,
      packet,
      name,
      icon,
      now: host.now(),
    });
    host.saveIcons.delete(request);
    host.releaseClaims();
    emitSave(host, outcome, name);
    return outcome;
  },

  confirmUpdated: (name: string, icon: string): SaveOutcome | undefined => {
    const request = host.sets.snapshot().savePending;
    if (request?.kind !== "update") return undefined;
    host.saveIcons.delete(request);
    const outcome = host.sets.confirmUpdate(request, name, icon, host.now());
    host.releaseClaims();
    emitSave(host, outcome, name);
    return outcome;
  },
});

const saveTimeoutBehavior = (host: SetsHost) => ({
  expireSave: (): void => {
    const request = host.sets.snapshot().savePending;
    if (!request) return;
    const outcome = {
      index: request.index,
      observedAt: host.now(),
      reason: "server_unanswered",
      request,
      setGuid: host.sets.at(request.index)?.setGuid ?? 0n,
      status: request.kind === "update" ? "saved_unconfirmed" : "unanswered",
    } as const;
    host.sets.settleSave(outcome);
    host.saveIcons.delete(request);
    host.releaseClaims();
    host.events.emit({
      type: "set_saved",
      index: outcome.index,
      setGuid: outcome.setGuid,
      kind: request.kind,
      name: request.name,
      status: outcome.status,
      reason: outcome.reason,
    });
  },

  abandonSave: (): void => {
    const request = host.sets.snapshot().savePending;
    if (request) host.saveIcons.delete(request);
    host.sets.abandonSave();
    host.releaseClaims();
  },
});

const settleUseEvent = (
  host: SetsHost,
  request: UseRequest,
  status: UseStatus,
  reason: string | undefined,
): void => {
  const last = host.sets.snapshot().lastUse;
  host.useFailures.length = 0;
  host.releaseClaims();
  host.events.emit({
    type: "set_used",
    index: request.index,
    status,
    reason: reason ?? last?.reason,
    failures: last ? [...last.failures] : [],
  });
};

const useRequestBehavior = (host: SetsHost) => ({
  beginUse: (request: UseRequest): void => {
    host.startClaims();
    host.sets.beginUse(request);
    host.useFailures.length = 0;
    host.noteClaims();
    host.events.emit({ type: "set_use_requested", index: request.index });
  },

  receiveUseResult: (result: number): void => {
    const request = host.sets.snapshot().usePending;
    if (!request) return;
    const status = result === 4 ? "bags_full" : "ok";
    host.sets.settleUse({
      status,
      reason: result === 4 ? "bags_full" : undefined,
      request,
      failures: [...host.useFailures],
      observedAt: host.now(),
    });
    settleUseEvent(
      host,
      request,
      status,
      result === 4 ? "bags_full" : undefined,
    );
  },

  expireUse: (): void => {
    const request = host.sets.snapshot().usePending;
    if (!request) return;
    host.sets.settleUse({
      status: "unanswered",
      reason: "server_unanswered",
      request,
      failures: [...host.useFailures],
      observedAt: host.now(),
    });
    settleUseEvent(host, request, "unanswered", "server_unanswered");
  },

  abandonUse: (): void => {
    host.sets.abandonUse();
    host.useFailures.length = 0;
    host.releaseClaims();
  },

  beginDelete: (request: DeleteRequest): EquipmentSetEntry | undefined => {
    const removed = host.sets.beginDelete(request);
    if (!removed) return undefined;
    host.events.emit({
      type: "set_deleted",
      index: removed.index,
      setGuid: removed.setGuid,
    });
    return removed;
  },
});

export const setsBehavior = (host: SetsHost) => ({
  ...saveListBehavior(host),
  ...saveRequestBehavior(host),
  ...saveTimeoutBehavior(host),
  ...useRequestBehavior(host),
});

export type SetsBehavior = ReturnType<typeof setsBehavior>;

export const noteUseFailure = (
  host: Pick<SetsHost, "sets" | "useFailures">,
  packet: Extract<InventoryChangeFailure, { kind: "error" }>,
): void => {
  const request = host.sets.snapshot().usePending;
  if (!request) return;
  if (packet.item1 === 0n || packet.item1 === 1n) return;
  if (!request.items.includes(packet.item1)) return;
  const name = inventoryResultName(packet.result);
  if (name === "none") return;
  host.useFailures.push(name);
};
