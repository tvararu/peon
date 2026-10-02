import type {
  EquipmentSetEntry,
  EquipmentSetSavedPacket,
  SaveKind,
  SaveStatus,
  UseStatus,
} from "#wow/areas/items/protocol-sets";
export type SaveRequest = {
  kind: SaveKind;
  index: number;
  name: string;
  items: readonly bigint[];
  requestedAt: number;
};
export type SaveOutcome = {
  status: SaveStatus;
  reason: string | undefined;
  request: SaveRequest;
  index: number;
  setGuid: bigint;
  observedAt: number;
};
export type UseRequest = {
  index: number;
  items: readonly bigint[];
  outgoing: readonly bigint[];
  requestedAt: number;
};
export type UseOutcome = {
  status: UseStatus;
  reason: string | undefined;
  request: UseRequest;
  failures: readonly string[];
  observedAt: number;
};
export type DeleteRequest = {
  index: number;
  setGuid: bigint;
  requestedAt: number;
};
export type SetsState = {
  sets: EquipmentSetEntry[];
  savePending: SaveRequest | undefined;
  lastSave: SaveOutcome | undefined;
  usePending: UseRequest | undefined;
  lastUse: UseOutcome | undefined;
  known: boolean;
};

export class SetSlice {
  private sets: EquipmentSetEntry[] = [];
  private savePending: SaveRequest | undefined;
  private lastSave: SaveOutcome | undefined;
  private usePending: UseRequest | undefined;
  private lastUse: UseOutcome | undefined;
  private known = false;

  snapshot(): SetsState {
    return {
      sets: [...this.sets],
      savePending: this.savePending,
      lastSave: this.lastSave,
      usePending: this.usePending,
      lastUse: this.lastUse,
      known: this.known,
    };
  }

  list(sets: EquipmentSetEntry[]): EquipmentSetEntry[] {
    this.known = true;
    this.sets = sets.map((set) => ({ ...set, items: [...set.items] }));
    return this.sets;
  }

  at(index: number): EquipmentSetEntry | undefined {
    return this.sets.find((set) => set.index === index);
  }

  byGuid(setGuid: bigint): EquipmentSetEntry | undefined {
    return this.sets.find((set) => set.setGuid === setGuid);
  }

  applySaved(init: {
    request: SaveRequest;
    packet: EquipmentSetSavedPacket;
    name: string;
    icon: string;
    now: number;
  }): SaveOutcome {
    const { request, packet, name, icon, now } = init;
    const entry: EquipmentSetEntry = {
      icon,
      index: request.index,
      items: [...request.items],
      name,
      setGuid: packet.setGuid,
    };
    const slot = this.sets.findIndex((set) => set.index === request.index);
    if (slot < 0) this.sets.push(entry);
    else this.sets[slot] = entry;
    this.savePending = undefined;
    this.lastSave = {
      index: packet.index,
      observedAt: now,
      reason: undefined,
      request,
      setGuid: packet.setGuid,
      status: "saved",
    };
    return this.lastSave;
  }

  confirmUpdate(
    request: SaveRequest,
    name: string,
    icon: string,
    now: number,
  ): SaveOutcome {
    const slot = this.sets.findIndex((set) => set.index === request.index);
    if (slot >= 0)
      this.sets[slot] = {
        icon,
        index: request.index,
        items: [...request.items],
        name,
        setGuid: this.sets[slot]?.setGuid ?? 0n,
      };
    this.savePending = undefined;
    this.lastSave = {
      index: request.index,
      observedAt: now,
      reason: "the server sends no reply for a set update",
      request,
      setGuid: this.sets[slot]?.setGuid ?? 0n,
      status: "saved_unconfirmed",
    };
    return this.lastSave;
  }

  settleSave(outcome: SaveOutcome): void {
    this.savePending = undefined;
    this.lastSave = outcome;
  }

  beginSave(request: SaveRequest): void {
    this.savePending = request;
    this.lastSave = undefined;
  }

  abandonSave(): void {
    this.savePending = undefined;
  }

  beginUse(request: UseRequest): void {
    this.usePending = request;
    this.lastUse = undefined;
  }

  settleUse(outcome: UseOutcome): void {
    this.usePending = undefined;
    this.lastUse = outcome;
  }

  abandonUse(): void {
    this.usePending = undefined;
  }

  beginDelete(request: DeleteRequest): EquipmentSetEntry | undefined {
    const slot = this.sets.findIndex((set) => set.index === request.index);
    if (slot < 0) return undefined;
    const [removed] = this.sets.splice(slot, 1);
    return removed;
  }

  place(entry: EquipmentSetEntry): void {
    const slot = this.sets.findIndex((set) => set.index === entry.index);
    if (slot < 0) this.sets.push({ ...entry, items: [...entry.items] });
    else this.sets[slot] = { ...entry, items: [...entry.items] };
  }

  clear(): void {
    this.sets = [];
    this.savePending = undefined;
    this.lastSave = undefined;
    this.usePending = undefined;
    this.lastUse = undefined;
    this.known = false;
  }
}
