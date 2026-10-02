import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import { guidText, type RuleInput } from "#harness/events/rules";

type ObjectsEvent = AreaEventOf<"objects">;

function usedRow(
  event: Extract<ObjectsEvent, { type: "used" }>,
  rc: RuleInput,
): AreaDraft {
  const name = rc.lookup.unitName(event.guid) ?? `object ${event.entry}`;
  const verb =
    event.how === "cast" ? `Cast ${event.spellId ?? "a spell"} on` : "Used";
  return {
    class: "log",
    data: { entry: event.entry, guid: guidText(event.guid), how: event.how },
    guid: guidText(event.guid),
    name: "used",
    ref: rc.refOf(event.guid),
    text: `${verb} ${name}.`,
  };
}

function pageRow(
  event: Extract<ObjectsEvent, { type: "page_read" }>,
): AreaDraft {
  const text = event.pages.map((page) => page.text).join("\n");
  return {
    class: "log",
    data: { firstPageId: event.firstPageId, pages: event.pages.length, text },
    name: "page",
    text: `Read page ${event.firstPageId} (${event.pages.length} page(s)).`,
  };
}

export const objectsHarness = defineHarnessArea({
  area: "objects",
  glyph: "lootable",
  rules: () => ({
    event: (event, rc) => {
      if (event.type === "used") return [usedRow(event, rc)];
      if (event.type === "page_read") return [pageRow(event)];
      if (event.type === "trigger_sent")
        return [
          {
            class: "log",
            data: { map: event.map, triggerId: event.triggerId },
            name: "trigger",
            text: `Entered area trigger ${event.triggerId}.`,
          },
        ];
      if (event.type === "trigger_message")
        return [
          {
            class: rc.runActive ? "passive" : "wake",
            data: { text: event.text },
            name: "message",
            text: event.text,
          },
        ];
      if (event.type === "fish_hooked")
        return [
          {
            class: "wake",
            data: { bobber: guidText(event.bobber) },
            guid: guidText(event.bobber),
            name: "fish_bite",
            ref: rc.refOf(event.bobber),
            text: "The bobber splashes; the fish is hooked.",
          },
        ];
      if (event.type === "fish_not_hooked" || event.type === "fish_escaped")
        return [
          {
            class: "log",
            data: {},
            name:
              event.type === "fish_not_hooked" ? "fish_missed" : "fish_fled",
            text:
              event.type === "fish_not_hooked"
                ? "Reeled in too early; no fish was hooked."
                : "The fish escaped.",
          },
        ];
      const fields = Object.entries(event).flatMap(([key, value]) => {
        const plain =
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean";
        if (!plain) return [];
        return [[key, value] as const];
      });
      return [
        {
          class: "log",
          data: { ...Object.fromEntries(fields), fallback: true },
          name: event.type,
          text: `objects ${event.type}`,
        },
      ];
    },
  }),
  worldActs: ["use", "open", "readPage"],
});
