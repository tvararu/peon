import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import type { RuleInput } from "#harness/events/rules";

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

function castLabel(event: {
  spellId: number;
  spellName: string | undefined;
}): string {
  return typeof event.spellName === "string" && event.spellName !== ""
    ? event.spellName
    : `spell ${event.spellId}`;
}

function targetStart(
  event: Extract<SpellsEvent, { type: "unit_cast_start" }>,
  rc: RuleInput,
): AreaDraft {
  const caster = rc.lookup.unitName(event.guid) ?? "A unit";
  const verb = event.kind === "channel" ? "channelling" : "casting";
  return {
    class: "log",
    data: {
      durationMs: event.durationMs,
      guid: event.guid.toString(10),
      kind: event.kind,
      spellId: event.spellId,
      spellName: event.spellName,
    },
    name: "target_start",
    text: `${caster} starts ${verb} ${castLabel(event)}.`,
  };
}

function targetInterrupted(
  event: Extract<SpellsEvent, { type: "unit_cast_end" }>,
  rc: RuleInput,
): AreaDraft {
  const caster = rc.lookup.unitName(event.guid) ?? "A unit";
  return {
    class: "log",
    data: {
      guid: event.guid.toString(10),
      spellId: event.spellId,
      spellName: event.spellName,
    },
    name: "target_interrupted",
    text: `${caster}'s ${castLabel(event)} interrupted.`,
  };
}

function unitCastRows(
  event: Extract<SpellsEvent, { type: "unit_cast_start" | "unit_cast_end" }>,
  rc: RuleInput,
): readonly AreaDraft[] {
  if (event.relevant !== 1) return [];
  if (event.type === "unit_cast_start") return [targetStart(event, rc)];
  return event.outcome === "interrupted" ? [targetInterrupted(event, rc)] : [];
}

function skillChanged(
  event: Extract<SpellsEvent, { type: "skill_changed" }>,
  rc: RuleInput,
  seen: Map<number, number>,
): readonly AreaDraft[] {
  const at = seen.get(event.id) ?? Number.NEGATIVE_INFINITY;
  if (rc.now - at < 60_000) return [];
  seen.set(event.id, rc.now);
  const text =
    event.from === undefined
      ? `${event.name} learned, ${event.to}/${event.max}.`
      : `${event.name} is now ${event.to}/${event.max}.`;
  return [
    {
      class: "log",
      data: {
        from: event.from ?? null,
        id: event.id,
        max: event.max,
        to: event.to,
      },
      name: "skill_changed",
      text,
    },
  ];
}

function skillRemoved(
  event: Extract<SpellsEvent, { type: "skill_removed" }>,
): AreaDraft {
  return {
    class: "log",
    data: { id: event.id },
    name: "skill_removed",
    text: `${event.name} dropped.`,
  };
}

function knownRows(
  event: SpellsEvent,
  rc: RuleInput,
): readonly AreaDraft[] | undefined {
  if (event.type === "spell_visual") return [];
  if (event.type === "mirror_image") return [];
  if (event.type === "projectile_moved") return [];
  if (event.type === "channel_start") return [channelStart(event)];
  if (event.type === "channel_end") return [channelEnd(event)];
  if (event.type === "totem_created") return [totemCreated(event)];
  if (event.type === "totem_gone") return [totemGone(event)];
  if (event.type === "unit_cast_start" || event.type === "unit_cast_end")
    return unitCastRows(event, rc);
  return undefined;
}

export const spellsHarness = defineHarnessArea({
  area: "spells",
  rules: () => {
    const seen = new Map<number, number>();
    return {
      event: (event, rc) => {
        const known = knownRows(event, rc);
        if (known) return known;
        if (event.type === "skill_changed")
          return skillChanged(event, rc, seen);
        if (event.type === "skill_removed") return [skillRemoved(event)];
        return [quiet(event)];
      },
    };
  },
  worldActs: ["cancelAura", "destroyTotem", "setActionButton", "unlearnSkill"],
});
