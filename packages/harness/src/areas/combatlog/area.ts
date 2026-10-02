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
const HEAL_KINDS = new Set(["heal", "periodic_heal"]);
const HEAL_ROW_GAP_MS = 10_000;

const ENVIRONMENT_TYPES = [
  "exhausted",
  "drowning",
  "fall",
  "lava",
  "slime",
  "fire",
];

type RuleState = { seen: Set<string>; healAt: Map<bigint, number> };

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

function onHealIn(
  e: Of<"entry">,
  healAt: Map<bigint, number>,
  rc: RuleInput,
): AreaDraft[] {
  if (e.target !== rc.selfGuid || e.source === rc.selfGuid) return [];
  if (e.source === 0n || e.amount <= 0) return [];
  const last = healAt.get(e.source);
  if (last !== undefined && e.at - last < HEAL_ROW_GAP_MS) return [];
  healAt.set(e.source, e.at);
  const healer = rc.lookup.unitName(e.source) ?? "A unit";
  return [
    unitRow(e.source, rc, {
      class: "passive",
      data: { amount: e.amount, spellId: e.spellId ?? 0 },
      name: "heal_in",
      text: `${healer} heals you for ${e.amount}.`,
    }),
  ];
}

function onEnvironmental(e: Of<"entry">, rc: RuleInput): AreaDraft[] {
  if (e.target !== rc.selfGuid) return [];
  const wire = e.extra ?? 0;
  const type = ENVIRONMENT_TYPES[wire] ?? `unknown_${wire}`;
  return [
    {
      class: rc.runActive ? "log" : "wake",
      data: {
        absorbed: e.absorbed ?? 0,
        amount: e.amount,
        resisted: e.resisted ?? 0,
        type,
      },
      name: "environmental",
      text: `You took ${e.amount} ${type} damage.`,
    },
  ];
}

function onDispelled(e: Of<"entry">, rc: RuleInput): AreaDraft[] {
  if (e.target !== rc.selfGuid || e.source === rc.selfGuid) return [];
  if (e.source === 0n) return [];
  const verb = e.kind === "steal" ? "steals" : "dispels";
  return [
    unitRow(e.source, rc, {
      class: "log",
      data: {
        aura: e.extra,
        kind: e.kind,
        source: guidText(e.source),
        spellId: e.spellId,
      },
      name: "dispelled",
      text: `${named(e.source, rc)} ${verb} spell ${e.extra} from you.`,
    }),
  ];
}

function onEntry(e: Of<"entry">, state: RuleState, rc: RuleInput) {
  if (e.kind === "dispel" || e.kind === "steal") return onDispelled(e, rc);
  if (e.kind === "environmental") return onEnvironmental(e, rc);
  if (HEAL_KINDS.has(e.kind)) return onHealIn(e, state.healAt, rc);
  const { seen } = state;
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

function combatlogRows(e: CombatlogEvent, state: RuleState, rc: RuleInput) {
  switch (e.type) {
    case "entry":
      return onEntry(e, state, rc);
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
    const state: RuleState = { healAt: new Map(), seen: new Set() };
    return { event: (e, rc) => combatlogRows(e, state, rc) };
  },
  worldActs: [],
});
