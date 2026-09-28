import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import { guidText, type RuleInput } from "#harness/events/rules";

type CombatlogEvent = AreaEventOf<"combatlog">;
type Of<T extends CombatlogEvent["type"]> = Extract<
  CombatlogEvent,
  { type: T }
>;

const HIGH = 0x1_00_00_00_00_00_00n;
const ENTRY_UNIT = 0x1_00_00_00n;
const CREATURE_HIGHS = new Set([0xf1_30n, 0xf1_50n]);
const IMMUNE_OUTCOMES = new Set(["immune", "immune2"]);
const STOLEN_BY = new Set(["player", "pet"]);

const highOf = (guid: bigint) => BigInt.asUintN(16, guid / HIGH);
const isPet = (guid: bigint) => highOf(guid) === 0xf1_40n;

function creatureEntry(guid: bigint): number | undefined {
  if (!CREATURE_HIGHS.has(highOf(guid))) return undefined;
  return Number(BigInt.asUintN(24, guid / ENTRY_UNIT));
}

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
  const ours = e.source === rc.selfGuid || isPet(e.source);
  if (!(ours && isImmune(e)) || e.target === rc.selfGuid) return [];
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
  if (!STOLEN_BY.has(e.killerKind)) return [];
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

function combatlogRows(e: CombatlogEvent, seen: Set<string>, rc: RuleInput) {
  switch (e.type) {
    case "entry":
      return onEntry(e, seen, rc);
    case "kill":
      return onKill(e, rc);
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
