import type {
  ControlEvent,
  ControlPose,
  EntityEvent,
  NoticeEvent,
  TrainerEvent,
  VendorEvent,
  VendorOutcome,
  VendorRequest,
} from "@peon/core";
import type { LogDraft, LogEvent } from "#harness/contract/log";
import {
  type Drafts,
  guidText,
  type PoseMemo,
  type RuleInput,
  unitIds,
} from "#harness/events/rules";
import { exploredDrafts } from "#harness/events/rules-xp";
import { itemIdText } from "#harness/ops/item-names";

const TELEPORTS = new Set(["teleport", "near_teleport", "new_world"]);
const DRIFT_PASSIVE_YD = 5;
const LISTED_NAMES_SHOWN = 8;
const VENDOR_SETTLED = new Set<VendorEvent["type"]>([
  "bought",
  "sold",
  "repaired",
  "refused",
  "partial",
  "unanswered",
]);
const TRAINER_SETTLED = new Set<TrainerEvent["type"]>([
  "trained",
  "refused",
  "unanswered",
]);
const VENDOR_EVENTS: Record<VendorOutcome["action"], LogEvent> = {
  buy: "vendor/buy",
  list: "vendor/list",
  repair: "vendor/repair",
  sell: "vendor/sell",
};

type Correction = {
  before: PoseMemo | undefined;
  to: PoseMemo | undefined;
  reason: string;
};

function tenth(value: number): number {
  return Math.round(value * 10) / 10;
}

export function poseMemo(pose: ControlPose | undefined): PoseMemo | undefined {
  return (
    pose && {
      mapId: pose.mapId,
      x: tenth(pose.x),
      y: tenth(pose.y),
      z: tenth(pose.z),
    }
  );
}

function where(pose: PoseMemo | undefined): string {
  return pose
    ? `${Math.round(pose.x)}, ${Math.round(pose.y)}`
    : "an unknown position";
}

function drift(from: PoseMemo | undefined, to: PoseMemo | undefined): number {
  if (!(from && to)) return 0;
  return tenth(Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z));
}

function correction({ before, to, reason }: Correction): LogDraft {
  if (TELEPORTS.has(reason)) {
    const text = `You were moved (${reason}) to ${where(to)}.`;
    return {
      class: "passive",
      data: { reason, to },
      domain: "control",
      event: "control/teleport",
      text,
    };
  }
  const driftYd = drift(before, to);
  const text = `The server corrected your position by ${driftYd} yd.`;
  const cls = driftYd > DRIFT_PASSIVE_YD ? "passive" : "log";
  return {
    class: cls,
    data: { driftYd, from: before, reason, to },
    domain: "control",
    event: "control/server_correction",
    text,
  };
}

function moveRow(event: ControlEvent, pose: PoseMemo | undefined): LogDraft {
  const cause = event.reason;
  if (event.type === "movement_started")
    return {
      class: "log",
      data: { cause, pose },
      domain: "control",
      event: "control/move_start",
      text: "You start to move.",
    };
  const text = cause ? `You stop (${cause}).` : "You stop.";
  return {
    class: "log",
    data: { cause, pose },
    domain: "control",
    event: "control/move_stop",
    text,
  };
}

function placeRow(rc: RuleInput): LogDraft {
  const { area, zone } = rc.lookup.place();
  const name =
    [area, zone].filter((part) => part !== undefined).join(", ") ||
    "an unknown area";
  return {
    class: "log",
    data: { area, zone },
    domain: "control",
    event: "control/place_changed",
    text: `You entered ${name}.`,
  };
}

export function controlDrafts(event: ControlEvent, rc: RuleInput): Drafts {
  const before = rc.memo.pose;
  const pose = poseMemo(event.state.pose);
  rc.memo.pose = pose ?? before;
  if (event.type === "server_correction") {
    const to = poseMemo(event.state.serverPose) ?? pose;
    return [correction({ before, reason: event.reason ?? "observed", to })];
  }
  if (event.type === "movement_started" || event.type === "movement_stopped")
    return [moveRow(event, pose)];
  if (event.type === "place_changed") return [placeRow(rc)];
  if (event.type === "area_explored" && event.explored)
    return exploredDrafts(event.explored, rc);
  return [];
}

type VendorWindow = VendorEvent["state"]["window"];

function stackItems(
  request: VendorRequest,
  window: VendorWindow,
): number | undefined {
  if (request.action !== "buy") return;
  const good = window?.items.find(
    (item) => item.slot === request.slot && item.itemId === request.itemId,
  );
  return good && good.buyCount > 1 ? good.buyCount * request.count : undefined;
}

function vendorDeal(
  outcome: VendorOutcome,
  window: VendorWindow,
  rc: RuleInput,
): LogDraft {
  const { action, moneyDelta, reason, request, status } = outcome;
  const itemId = "itemId" in request ? request.itemId : undefined;
  const count = "count" in request ? request.count : undefined;
  const items = stackItems(request, window);
  const name = itemId === undefined ? undefined : rc.lookup.itemName(itemId);
  const what = [
    name ?? (itemId === undefined ? undefined : itemIdText(itemId)),
    count === undefined ? undefined : `x${count}`,
    items === undefined ? undefined : `(${items} items)`,
  ];
  const words = [
    `Vendor ${action}`,
    ...what.filter((part) => part !== undefined),
  ].join(" ");
  const why = reason ? ` (${reason})` : "";
  const data = {
    cost: moneyDelta === undefined ? undefined : Math.abs(moneyDelta),
    count,
    itemId,
    items,
    name,
    npc: guidText(request.guid),
    outcome: status,
    reason,
  };
  return {
    class: "passive",
    data,
    domain: "vendor",
    event: VENDOR_EVENTS[action],
    ...unitIds(request.guid, rc),
    text: `${words}: ${status}${why}.`,
  };
}

function vendorList(
  window: VendorEvent["state"]["window"],
  rc: RuleInput,
): LogDraft {
  const names = (window?.items ?? []).map(
    ({ itemId }) => rc.lookup.itemName(itemId) ?? itemIdText(itemId),
  );
  const shown = names.slice(0, LISTED_NAMES_SHOWN).join(", ");
  const more =
    names.length > LISTED_NAMES_SHOWN
      ? `, +${names.length - LISTED_NAMES_SHOWN} more`
      : "";
  const list = names.length > 0 ? `: ${shown}${more}` : "";
  return {
    class: "log",
    data: { items: names.length, names, npc: window && guidText(window.guid) },
    domain: "vendor",
    event: "vendor/list",
    ...unitIds(window?.guid, rc),
    text: `The vendor lists ${names.length} items${list}.`,
  };
}

function freshList(row: LogDraft, rc: RuleInput): Drafts {
  const npc = row.guid;
  const key = JSON.stringify(row.data["names"]);
  if (rc.memo.vendorLists.get(npc) === key) return [];
  rc.memo.vendorLists.set(npc, key);
  return [row];
}

function noteVendorAction(event: VendorEvent, rc: RuleInput): void {
  const action = event.state.pending?.action;
  const noted = rc.memo.vendorAction;
  if (event.type.endsWith("_requested") && action && action !== "list")
    rc.memo.vendorAction = { action, charged: false, settledAt: undefined };
  else if (noted && event.type !== "listed")
    rc.memo.vendorAction = { ...noted, settledAt: noted.settledAt ?? rc.now };
}

export function vendorDrafts(event: VendorEvent, rc: RuleInput): Drafts {
  noteVendorAction(event, rc);
  const { lastOutcome, window } = event.state;
  if (event.type === "listed") return freshList(vendorList(window, rc), rc);
  if (!(lastOutcome && VENDOR_SETTLED.has(event.type))) return [];
  return [vendorDeal(lastOutcome, window, rc)];
}

export function trainerDrafts(event: TrainerEvent, rc: RuleInput): Drafts {
  const { lastOutcome, offer } = event.state;
  if (event.type === "listed") {
    const spells = offer?.spells.length ?? 0;
    return [
      {
        class: "log",
        data: { spells },
        domain: "trainer",
        event: "trainer/list",
        text: `The trainer lists ${spells} spells.`,
      },
    ];
  }
  if (!(lastOutcome && TRAINER_SETTLED.has(event.type))) return [];
  const request = lastOutcome.request;
  if (request.action !== "train") return [];
  const why = lastOutcome.reason ? ` (${lastOutcome.reason})` : "";
  const data = {
    cost: request.cost,
    learned: lastOutcome.learnedSpells,
    npc: guidText(request.guid),
    outcome: lastOutcome.status,
    reason: lastOutcome.reason,
    spellId: request.spellId,
  };
  const text = `Train spell ${request.spellId}: ${lastOutcome.status}${why}.`;
  return [
    {
      class: "passive",
      data,
      domain: "trainer",
      event: "trainer/learn",
      ...unitIds(request.guid, rc),
      text,
    },
  ];
}

export function entityDrafts(
  event: EntityEvent,
  rc: RuleInput & { logEntities: boolean },
): Drafts {
  if (!rc.logEntities || event.type === "update") return [];
  if (event.type === "disappear") {
    const text = `${event.name ?? "A unit"} left view.`;
    return [
      {
        class: "log",
        data: { name: event.name },
        domain: "entity",
        event: "entity/disappear",
        guid: guidText(event.guid),
        text,
      },
    ];
  }
  const { entity } = event;
  const data = {
    entry: entity.entry,
    name: entity.name,
    objectType: entity.objectType,
  };
  const text = `${entity.name ?? `Object ${entity.entry}`} came into view.`;
  return [
    {
      class: "log",
      data,
      domain: "entity",
      event: "entity/appear",
      guid: guidText(entity.guid),
      text,
    },
  ];
}

export function packetErrorDrafts(
  opcode: number,
  error: Error,
  _rc: RuleInput,
): Drafts {
  const text = `Packet 0x${opcode.toString(16)} failed: ${error.message}`;
  return [
    {
      class: "log",
      data: { message: error.message, opcode },
      domain: "packet",
      event: "packet/error",
      text,
    },
  ];
}

export function noticeDrafts(event: NoticeEvent, _rc: RuleInput): Drafts {
  const data = { label: event.label, opcode: event.opcode };
  return [
    {
      class: "log",
      data,
      domain: "notice",
      event: "notice/not_implemented",
      text: event.text,
      ts: event.at,
    },
  ];
}
