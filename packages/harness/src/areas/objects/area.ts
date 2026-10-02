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

function triggerSentRow(
  event: Extract<ObjectsEvent, { type: "trigger_sent" }>,
): AreaDraft {
  return {
    class: "log",
    data: { map: event.map, triggerId: event.triggerId },
    name: "trigger",
    text: `Entered area trigger ${event.triggerId}.`,
  };
}

function triggerMessageRow(
  event: Extract<ObjectsEvent, { type: "trigger_message" }>,
  rc: RuleInput,
): AreaDraft {
  return {
    class: rc.runActive ? "passive" : "wake",
    data: { text: event.text },
    name: "message",
    text: event.text,
  };
}

function fishHookedRow(
  event: Extract<ObjectsEvent, { type: "fish_hooked" }>,
  rc: RuleInput,
): AreaDraft {
  return {
    class: "wake",
    data: { bobber: guidText(event.bobber) },
    guid: guidText(event.bobber),
    name: "fish_bite",
    ref: rc.refOf(event.bobber),
    text: "The bobber splashes; the fish is hooked.",
  };
}

function fishResultRow(
  event:
    | Extract<ObjectsEvent, { type: "fish_not_hooked" }>
    | Extract<ObjectsEvent, { type: "fish_escaped" }>,
): AreaDraft {
  const fled = event.type === "fish_escaped";
  return {
    class: "passive",
    data: { result: fled ? "escaped" : "not_hooked" },
    name: "fish",
    text: fled ? "The fish escaped." : "Reeled in too early; no fish was hooked.",
  };
}

function fallbackRow(event: ObjectsEvent): AreaDraft {
  const fields = Object.entries(event).flatMap(([key, value]) => {
    const plain =
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean";
    if (!plain) return [];
    return [[key, value] as const];
  });
  return {
    class: "log",
    data: { ...Object.fromEntries(fields), fallback: true },
    name: event.type,
    text: `objects ${event.type}`,
  };
}

export const objectsHarness = defineHarnessArea({
  area: "objects",
  glyph: "lootable",
  rules: () => ({
    event: (event, rc) => {
      switch (event.type) {
        case "used":
          return [usedRow(event, rc)];
        case "page_read":
          return [pageRow(event)];
        case "trigger_sent":
          return [triggerSentRow(event)];
        case "trigger_message":
          return [triggerMessageRow(event, rc)];
        case "fish_hooked":
          return [fishHookedRow(event, rc)];
        case "fish_not_hooked":
        case "fish_escaped":
          return [fishResultRow(event)];
        default:
          return [fallbackRow(event)];
      }
    },
  }),
  worldActs: ["use", "open", "readPage"],
});
