import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import { guidText, type RuleInput } from "#harness/events/rules";

type BuybackEvent = AreaEventOf<"buyback">;
type Listed = Extract<BuybackEvent, { type: "listed" }>;
type BoughtBack = Extract<BuybackEvent, { type: "bought_back" }>;

function itemName(entry: number | undefined, rc: RuleInput): string {
  if (entry === undefined) return "an item";
  return rc.lookup.itemName(entry) ?? `item ${entry}`;
}

function boughtBackRow(
  event: BoughtBack,
  seen: Map<bigint, Listed["list"][number]>,
  rc: RuleInput,
): AreaDraft {
  const sold = seen.get(event.guid);
  const name = itemName(event.entry ?? sold?.entry, rc);
  const price = sold?.price;
  return {
    class: "log",
    data: {
      entry: event.entry,
      guid: guidText(event.guid),
      price,
      slot: event.slot,
    },
    guid: guidText(event.guid),
    name: "bought_back",
    ref: rc.refOf(event.guid),
    text:
      price === undefined
        ? `Bought back ${name}.`
        : `Bought back ${name} for ${price} copper.`,
  };
}

function onEvent(
  event: BuybackEvent,
  seen: Map<bigint, Listed["list"][number]>,
  rc: RuleInput,
): readonly AreaDraft[] {
  if (event.type === "listed") {
    seen.clear();
    for (const row of event.list) seen.set(row.guid, row);
    return [];
  }
  if (event.type === "bought_back") return [boughtBackRow(event, seen, rc)];
  if (event.type === "bought_in_slot")
    return [
      {
        class: "log",
        data: {
          bag: event.bag,
          count: event.count,
          itemId: event.itemId,
          slot: event.slot,
          vendorSlot: event.vendorSlot,
        },
        name: "bought_in_slot",
        text: `Bought ${itemName(event.itemId, rc)} into bag ${event.bag} slot ${event.slot}.`,
      },
    ];
  if (event.type === "refused")
    return [
      {
        class: "wake",
        data: { kind: event.kind, reason: event.reason },
        name: "refused",
        text: `The buyback was refused (${event.reason}).`,
      },
    ];
  return [
    {
      class: "wake",
      data: { kind: event.kind },
      name: "unanswered",
      text: "The buyback went unanswered.",
    },
  ];
}

export const buybackHarness = defineHarnessArea({
  area: "buyback",
  rules: () => {
    const seen = new Map<bigint, Listed["list"][number]>();
    return { event: (event, rc) => onEvent(event, seen, rc) };
  },
  worldActs: ["buyback"],
});
