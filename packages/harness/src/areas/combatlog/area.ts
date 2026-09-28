import type { AreaEventOf } from "@peon/core";
import { creatureEntry, fightText } from "#harness/areas/combatlog/totals";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import { guidText, type RuleInput } from "#harness/events/rules";

type CombatlogEvent = AreaEventOf<"combatlog">;
type Of<T extends CombatlogEvent["type"]> = Extract<
  CombatlogEvent,
  { type: T }
>;

const IMMUNE_OUTCOMES = new Set(["immune", "immune2"]);

function named(guid: bigint, rc: RuleInput): string {
  return `${rc.lookup.unitName(guid) ?? "A unit"} ${rc.refOf(guid)}`;
}

function isImmune(e: Of<"entry">): boolean {
  if (e.kind === "immune") return true;
  if (e.kind === "miss") return IMMUNE_OUTCOMES.has(e.outcome ?? "");
  return e.kind === "melee" && e.outcome === "immune";
}

function unitRow(
  unit: bigint,
  rc: RuleInput,
  draft: Omit<AreaDraft, "guid" | "ref">,
): AreaDraft {
  return {
    ...draft,
    data: {
      name: rc.lookup.unitName(unit),
      unit: guidText(unit),
      ...draft.data,
    },
    guid: guidText(unit),
    ref: rc.refOf(unit),
  };
}

function onEntry(e: Of<"entry">, seen: Set<string>, rc: RuleInput) {
  if (e.source !== rc.selfGuid || e.target === rc.selfGuid) return [];
  if (!isImmune(e)) return [];
  const spellId = e.spellId ?? 0;
  const entry = creatureEntry(e.target);
  const key = `${entry ?? guidText(e.target)}:${spellId}`;
  if (seen.has(key)) return [];
  seen.add(key);
  const what = spellId === 0 ? "your attacks" : `spell ${spellId}`;
  return [
    unitRow(e.target, rc, {
      class: "log",
      data: { entry, source: guidText(e.source), spellId },
      name: "immune",
      text: `${named(e.target, rc)} is immune to ${what}.`,
    }),
  ];
}

function onKill(e: Of<"kill">, rc: RuleInput): AreaDraft[] {
  if (e.bySelf === 1 || e.ourTarget !== 1) return [];
  if (e.killerKind !== "player") return [];
  return [
    unitRow(e.victim, rc, {
      class: "log",
      data: {
        killer: guidText(e.killer),
        killerKind: e.killerKind,
        killerName: rc.lookup.unitName(e.killer),
      },
      name: "killing_blow",
      text: `${named(e.killer, rc)} killed your target ${named(e.victim, rc)}.`,
    }),
  ];
}

function onFightClosed(e: Of<"fight_closed">): AreaDraft[] {
  const { crits, dealt, healed, lastAt, misses, startedAt, taken } = e;
  return [
    {
      class: "log",
      data: {
        crits,
        dealt,
        durationMs: lastAt - startedAt,
        healed,
        misses,
        taken,
      },
      name: "fight",
      text: fightText({ dealt, healed, misses, taken }),
    },
  ];
}

function combatlogRows(e: CombatlogEvent, seen: Set<string>, rc: RuleInput) {
  switch (e.type) {
    case "entry":
      return onEntry(e, seen, rc);
    case "kill":
      return onKill(e, rc);
    case "fight_closed":
      return onFightClosed(e);
    default:
      return [];
  }
}

export const combatlogHarness = defineHarnessArea({
  area: "combatlog",
  rules: () => {
    const seen = new Set<string>();
    return { event: (e, rc) => combatlogRows(e, seen, rc) };
  },
  worldActs: [],
});
