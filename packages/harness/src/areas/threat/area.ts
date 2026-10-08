import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import { guidText, type RuleInput } from "#harness/events/rules";

type ThreatEvent = AreaEventOf<"threat">;
type Of<T extends ThreatEvent["type"]> = Extract<ThreatEvent, { type: T }>;
type Memory = { engaged: Set<bigint>; warned: Map<bigint, Set<bigint>> };

const PULL_MELEE = 1.1;
const NEAR = 0.9;

const HIGH = 0x1_00_00_00_00_00_00n;

const highOf = (guid: bigint) => BigInt.asUintN(16, guid / HIGH);
const isPet = (guid: bigint) => highOf(guid) === 0xf1_40n;
const isOtherPlayer = (guid: bigint, rc: RuleInput) =>
  highOf(guid) === 0n && guid !== rc.selfGuid;

function named(guid: bigint, rc: RuleInput): string {
  return `${rc.lookup.unitName(guid) ?? "A unit"} ${rc.refOf(guid)}`;
}

function who(guid: bigint, rc: RuleInput): string {
  return guid === rc.selfGuid ? "you" : named(guid, rc);
}

function row(
  unit: bigint,
  rc: RuleInput,
  draft: Pick<AreaDraft, "class" | "name" | "text"> & {
    data?: Record<string, unknown>;
  },
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

function engage(unit: bigint, mem: Memory, rc: RuleInput): AreaDraft[] {
  if (mem.engaged.has(unit)) return [];
  mem.engaged.add(unit);
  return [
    row(unit, rc, {
      class: rc.runActive ? "log" : "wake",
      name: "engaged",
      text: `${named(unit, rc)} is fighting you.`,
    }),
  ];
}

function pullWarning(e: Of<"table">, mem: Memory, rc: RuleInput) {
  const { unit, victim } = e;
  if (victim === undefined || !isOtherPlayer(victim, rc)) return [];
  const top = e.entries.find((entry) => entry.victim === victim)?.threat ?? 0;
  const mine = e.entries.find((entry) => entry.victim === rc.selfGuid)?.threat;
  const pullAt = top * PULL_MELEE;
  if (mine === undefined || top === 0 || mine < pullAt * NEAR) return [];
  const warned = mem.warned.get(unit) ?? new Set<bigint>();
  if (warned.has(victim)) return [];
  mem.warned.set(unit, warned.add(victim));
  const share = Math.round((mine * 100) / top);
  return [
    row(unit, rc, {
      class: "log",
      data: {
        mine,
        pullAt,
        victim: guidText(victim),
        victimThreat: top,
      },
      name: "pull_warning",
      text: `Your threat on ${named(unit, rc)} is near pulling it off ${named(victim, rc)}: ${share}% of theirs; it turns at 110% in melee range, 130% at range.`,
    }),
  ];
}

function onTable(e: Of<"table">, mem: Memory, rc: RuleInput): AreaDraft[] {
  if (!e.entries.some((entry) => entry.victim === rc.selfGuid)) return [];
  return [...engage(e.unit, mem, rc), ...pullWarning(e, mem, rc)];
}

function relevant(guid: bigint, rc: RuleInput): boolean {
  return guid === rc.selfGuid || isPet(guid) || isOtherPlayer(guid, rc);
}

function aggroSwitch(e: Of<"victim_changed">, mem: Memory, rc: RuleInput) {
  const { from, to, unit } = e;
  if (from === undefined) return [];
  const mine = from === rc.selfGuid || to === rc.selfGuid;
  const near =
    mem.engaged.has(unit) && (relevant(from, rc) || relevant(to, rc));
  if (!(mine || near)) return [];
  const wake = to === rc.selfGuid && isOtherPlayer(from, rc);
  return [
    row(unit, rc, {
      class: wake ? "wake" : "log",
      data: { fromVictim: guidText(from), toVictim: guidText(to) },
      name: "aggro_switch",
      text: `${named(unit, rc)} turned from ${who(from, rc)} to ${who(to, rc)}.`,
    }),
  ];
}

function onSwitch(e: Of<"victim_changed">, mem: Memory, rc: RuleInput) {
  const engaged = e.to === rc.selfGuid ? engage(e.unit, mem, rc) : [];
  return [...engaged, ...aggroSwitch(e, mem, rc)];
}

function forget(unit: bigint, mem: Memory): AreaDraft[] {
  mem.engaged.delete(unit);
  mem.warned.delete(unit);
  return [];
}

function onBroken(e: Of<"target_broken">, mem: Memory, rc: RuleInput) {
  if (!mem.engaged.has(e.unit)) return [];
  forget(e.unit, mem);
  return [
    row(e.unit, rc, {
      class: "log",
      data: { hostileOnly: e.hostileOnly },
      name: "target_lost",
      text: `Your target ${named(e.unit, rc)} vanished from targeting.`,
    }),
  ];
}

function onReaction(e: Of<"reaction">, rc: RuleInput): AreaDraft[] {
  if (e.reaction !== "alert") return [];
  return [
    row(e.unit, rc, {
      class: "wake",
      name: "alerted",
      text: `${named(e.unit, rc)} noticed you.`,
    }),
  ];
}

function threatRows(e: ThreatEvent, mem: Memory, rc: RuleInput): AreaDraft[] {
  switch (e.type) {
    case "table":
      return onTable(e, mem, rc);
    case "victim_changed":
      return onSwitch(e, mem, rc);
    case "removed":
      return e.victim === rc.selfGuid ? forget(e.unit, mem) : [];
    case "cleared":
      return forget(e.unit, mem);
    case "reaction":
      return onReaction(e, rc);
    case "target_broken":
      return onBroken(e, mem, rc);
    default:
      return [];
  }
}

export const threatHarness = defineHarnessArea({
  area: "threat",
  glyph: "combat",
  rules: () => {
    const mem: Memory = { engaged: new Set(), warned: new Map() };
    return { event: (e, rc) => threatRows(e, mem, rc) };
  },
});
