import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import { guidText, type RuleInput } from "#harness/events/rules";

type ItemsEvent = AreaEventOf<"items">;
type Moved = Extract<ItemsEvent, { type: "moved" }>;
type Received = Extract<ItemsEvent, { type: "item_received" }>;

const MOVED_ROW: Record<string, { name: string; verb: string }> = {
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
  return [];
}

export const itemsHarness = defineHarnessArea({
  area: "items",
  glyph: "bag",
  rules: () => ({ event: (event, rc) => eventRow(event, rc) }),
  worldActs: ["equip", "equipTo", "unequip", "move", "split", "open", "read"],
});
