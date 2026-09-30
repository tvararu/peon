import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import { guidText, type RuleInput } from "#harness/events/rules";

type ItemsEvent = AreaEventOf<"items">;
type Moved = Extract<ItemsEvent, { type: "moved" }>;
type Received = Extract<ItemsEvent, { type: "item_received" }>;

const MOVED_ROW: Record<string, { name: string; verb: string }> = {
  ammo: { name: "ammo", verb: "Loaded" },
  equip: { name: "equipped", verb: "Equipped" },
  equip_slot: { name: "equipped", verb: "Equipped" },
  split: { name: "split", verb: "Split" },
  swap: { name: "moved", verb: "Moved" },
  unequip: { name: "unequipped", verb: "Took off" },
};

function movedRow(event: Moved, rc: RuleInput): AreaDraft {
  const row = MOVED_ROW[event.kind] ?? { name: "moved", verb: "Moved" };
  const label =
    event.entry === undefined
      ? guidText(event.itemGuid)
      : (rc.lookup.itemName(event.entry) ?? `item ${event.entry}`);
  return {
    class: "log",
    data: {
      entry: event.entry,
      item: guidText(event.itemGuid),
      kind: event.kind,
    },
    guid: guidText(event.itemGuid),
    name: row.name,
    ref: guidText(event.itemGuid),
    text: `${row.verb} ${label}.`,
  };
}

function receivedRow(event: Received, rc: RuleInput): AreaDraft[] {
  if (event.wornItemLevel === undefined) return [];
  if (event.itemLevel <= event.wornItemLevel) return [];
  const name = rc.lookup.itemName(event.entry) ?? `item ${event.entry}`;
  return [
    {
      class: "wake",
      data: {
        entry: event.entry,
        itemLevel: event.itemLevel,
        wornItemLevel: event.wornItemLevel,
      },
      name: "upgrade",
      text: `Better item: ${name} (item level ${event.itemLevel}, worn ${event.wornItemLevel}).`,
    },
  ];
}

const WAKE_UNDER_SECONDS = 60;

function itemLabel(entry: number | undefined, rc: RuleInput): string {
  if (entry === undefined) return "An item";
  return rc.lookup.itemName(entry) ?? `item ${entry}`;
}

function span(seconds: number): string {
  if (seconds >= 3600) {
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${Math.floor(seconds / 3600)} h${minutes > 0 ? ` ${minutes} min` : ""}`;
  }
  if (seconds >= 60) return `${Math.floor(seconds / 60)} min`;
  return `${seconds} s`;
}

function timerRows(event: ItemsEvent, rc: RuleInput): readonly AreaDraft[] {
  if (event.type === "item_cooldown")
    return [
      {
        class: "log",
        data: { entry: event.entry, spell: event.spell },
        guid: guidText(event.itemGuid),
        name: "cooldown",
        ref: guidText(event.itemGuid),
        text: `${itemLabel(event.entry, rc)} is on cooldown.`,
      },
    ];
  if (event.type === "item_time" || event.type === "item_enchant_time") {
    const enchant = event.type === "item_enchant_time";
    const label = itemLabel(event.entry, rc);
    const left = span(event.seconds);
    return [
      {
        class: event.seconds < WAKE_UNDER_SECONDS ? "wake" : "passive",
        data: {
          entry: event.entry,
          seconds: event.seconds,
          ...(enchant && { enchantSlot: event.slot }),
        },
        guid: guidText(event.itemGuid),
        name: "expiring",
        ref: guidText(event.itemGuid),
        text: enchant
          ? `The temporary enchant on ${label} ends in ${left}.`
          : `${label} expires in ${left}.`,
      },
    ];
  }
  if (event.type === "durability_loss")
    return [
      {
        class: "wake",
        data: {},
        name: "durability_loss",
        text: "Dying damaged your equipment; repair it at a vendor.",
      },
    ];
  if (event.type === "proficiency" && event.names.length > 0)
    return [
      {
        class: "log",
        data: { kind: event.kind, mask: event.mask, names: event.names },
        name: "proficiency",
        text: `You can now use ${event.names.join(", ")}.`,
      },
    ];
  return [];
}

function eventRow(event: ItemsEvent, rc: RuleInput): readonly AreaDraft[] {
  if (event.type === "moved") return [movedRow(event, rc)];
  if (event.type === "move_refused")
    return [
      {
        class: "wake",
        data: { entry: event.entry, reason: event.reason },
        guid: guidText(event.itemGuid),
        name: "refused",
        ref: guidText(event.itemGuid),
        text: `Move refused: ${event.reason}.`,
      },
    ];
  if (event.type === "move_unanswered")
    return [
      {
        class: "wake",
        data: { entry: event.entry, kind: event.kind },
        guid: guidText(event.itemGuid),
        name: "unanswered",
        ref: guidText(event.itemGuid),
        text: "The move went unanswered.",
      },
    ];
  if (event.type === "item_received") return receivedRow(event, rc);
  if (event.type === "read_ok")
    return [
      {
        class: "log",
        data: { entry: event.entry },
        guid: guidText(event.itemGuid),
        name: "read",
        ref: guidText(event.itemGuid),
        text: `Read ${guidText(event.itemGuid)}.`,
      },
    ];
  if (event.type === "item_text")
    return [
      {
        class: "log",
        data: { text: event.text },
        guid: guidText(event.guid),
        name: "read",
        ref: guidText(event.guid),
        text: event.text,
      },
    ];
  return timerRows(event, rc);
}

export const itemsHarness = defineHarnessArea({
  area: "items",
  glyph: "bag",
  rules: () => ({ event: (event, rc) => eventRow(event, rc) }),
  worldActs: [
    "equip",
    "equipTo",
    "move",
    "open",
    "read",
    "setAmmo",
    "split",
    "unequip",
  ],
});
