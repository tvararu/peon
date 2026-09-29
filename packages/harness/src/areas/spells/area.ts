import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";

type SpellsEvent = AreaEventOf<"spells">;

function scalar(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString(10);
  const plain =
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean";
  return plain ? value : undefined;
}

function quiet(event: SpellsEvent): AreaDraft {
  const fields = Object.entries(event).flatMap(([key, value]) => {
    const kept = scalar(value);
    return kept === undefined ? [] : [[key, kept] as const];
  });
  return {
    class: "log",
    data: { ...Object.fromEntries(fields), fallback: true },
    name: event.type,
    text: `spells ${event.type}`,
  };
}

function channelStart(
  event: Extract<SpellsEvent, { type: "channel_start" }>,
): AreaDraft {
  const label = `spell ${event.spellId}`;
  return {
    class: "log",
    data: {
      durationMs: event.durationMs ?? null,
      spellId: event.spellId,
      target: event.target === undefined ? null : event.target.toString(10),
    },
    name: "channel_start",
    text: `Channelling ${label}.`,
  };
}

function channelEnd(
  event: Extract<SpellsEvent, { type: "channel_end" }>,
): AreaDraft {
  const label = `spell ${event.spellId}`;
  return {
    class: "log",
    data: { reason: event.reason, spellId: event.spellId },
    name: "channel_end",
    text: `${label} ended (${event.reason}).`,
  };
}
function totemName(
  event: Extract<SpellsEvent, { type: "totem_created" | "totem_gone" }>,
): string {
  return typeof event.spellName === "string" && event.spellName !== ""
    ? event.spellName
    : `spell ${event.spellId}`;
}

function totemElement(slot: number): string {
  return ["fire", "earth", "water", "air"][slot] ?? `slot ${slot}`;
}

function totemCreated(
  event: Extract<SpellsEvent, { type: "totem_created" }>,
): AreaDraft {
  return {
    class: "log",
    data: {
      durationMs: event.durationMs,
      guid: event.guid.toString(10),
      slot: event.slot,
      spellId: event.spellId,
    },
    name: "totem_created",
    text: `${totemName(event)} placed (${totemElement(event.slot)}).`,
  };
}

function totemGone(
  event: Extract<SpellsEvent, { type: "totem_gone" }>,
): AreaDraft {
  return {
    class: "log",
    data: {
      guid: event.guid.toString(10),
      reason: event.reason,
      slot: event.slot,
      spellId: event.spellId,
    },
    name: "totem_gone",
    text: `${totemName(event)} gone (${totemElement(event.slot)}, ${event.reason}).`,
  };
}

export const spellsHarness = defineHarnessArea({
  area: "spells",
  rules: () => ({
    event: (event) => {
      if (event.type === "spell_visual") return [];
      if (event.type === "channel_start") return [channelStart(event)];
      if (event.type === "channel_end") return [channelEnd(event)];
      if (event.type === "totem_created") return [totemCreated(event)];
      if (event.type === "totem_gone") return [totemGone(event)];
      if (event.type === "unit_cast_start" || event.type === "unit_cast_end")
        return [];
      return [quiet(event)];
    },
  }),
  worldActs: ["cancelAura", "destroyTotem", "setActionButton"],
});
