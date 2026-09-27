import type { CombatEvent, EntityEvent } from "@peon/core";
import type { LogClass, LogDraft } from "#harness/contract/log";
import {
  type AuraMemo,
  type Drafts,
  guidText,
  type RuleInput,
  unitIds,
} from "#harness/events/rules";
import { watchUnit } from "#harness/events/rules-death";
import { levelDrafts, xpDrafts } from "#harness/events/rules-xp";
import type { CycleEvent } from "#harness/loops/encounter-cycle";
import type { TacticsEvent, TacticsOutcome } from "#harness/loops/tactics";

const LOW_HEALTH = [50, 25];
const REARM_POINTS = 10;
const CYCLE_STEPS = new Set<CycleEvent["type"]>([
  "target_done",
  "loot_done",
  "recovery",
  "recovered",
]);

function named(guid: bigint, rc: RuleInput): string {
  return `${rc.lookup.unitName(guid) ?? "A unit"} ${rc.refOf(guid)}`;
}

function attackedDrafts(event: CombatEvent, rc: RuleInput): Drafts {
  const attacker = event.attacker ?? event.state.attackers.at(-1);
  const name =
    attacker === undefined ? undefined : rc.lookup.unitName(attacker);
  const text = `${attacker === undefined ? "A unit" : named(attacker, rc)} attacks you.`;
  const data = {
    attacker: attacker === undefined ? undefined : guidText(attacker),
    name,
  };
  if (attacker !== undefined) watchUnit(attacker, rc);
  const cls = rc.runActive ? "log" : "wake";
  return [
    {
      class: cls,
      data,
      domain: "combat",
      event: "combat/attacked",
      ...unitIds(attacker, rc),
      text,
    },
  ];
}

function attackStartDrafts(event: CombatEvent, rc: RuleInput): Drafts {
  const target = event.state.attackTarget;
  if (target === undefined) return [];
  watchUnit(target, rc);
  const text = `You attack ${named(target, rc)}.`;
  const data = { name: rc.lookup.unitName(target), target: guidText(target) };
  return [
    {
      class: "log",
      data,
      domain: "combat",
      event: "combat/attack_start",
      text,
    },
  ];
}

function petAttackDrafts(event: CombatEvent, rc: RuleInput): Drafts {
  const command = event.state.petCommand;
  if (event.reason !== "pet_attack" || !command) return [];
  const { pet, target } = command;
  watchUnit(target, rc);
  const name = rc.lookup.unitName(target);
  const data = { name, pet: guidText(pet), target: guidText(target) };
  return [
    {
      class: "log",
      data,
      domain: "combat",
      event: "combat/pet_attack",
      text: `You send your pet at ${named(target, rc)}.`,
    },
  ];
}

function castDrafts(event: CombatEvent): Drafts {
  const outcome = event.state.lastOutcome;
  const result = event.type.slice("cast_".length);
  const name = event.spellName ?? `spell ${outcome?.spellId ?? "?"}`;
  const why = event.reason ? ` (${event.reason})` : "";
  const target =
    outcome?.target === undefined ? undefined : guidText(outcome.target);
  const data = {
    name,
    reason: event.reason,
    result,
    spellId: outcome?.spellId,
    target,
  };
  return [
    {
      class: "log",
      data,
      domain: "combat",
      event: "combat/cast",
      text: `Cast ${name} ${result}${why}.`,
    },
  ];
}

function auraRow(
  event: "aura/gain" | "aura/fade",
  slot: number,
  aura: AuraMemo,
): LogDraft {
  const verb = event === "aura/gain" ? "gained" : "faded";
  return {
    class: "log",
    data: { name: aura.name, slot, spellId: aura.spellId },
    domain: "aura",
    event,
    text: `${aura.name ?? `spell ${aura.spellId}`} ${verb}.`,
  };
}

function auraDrafts(event: CombatEvent, rc: RuleInput): Drafts {
  const current = new Map(
    event.state.auras.map((aura) => [
      aura.slot,
      { name: aura.name, spellId: aura.spellId },
    ]),
  );
  const drafts: Drafts = [];
  for (const [slot, aura] of rc.memo.auras)
    if (current.get(slot)?.spellId !== aura.spellId)
      drafts.push(auraRow("aura/fade", slot, aura));
  for (const [slot, aura] of current)
    if (rc.memo.auras.get(slot)?.spellId !== aura.spellId)
      drafts.push(auraRow("aura/gain", slot, aura));
  rc.memo.auras = current;
  return drafts;
}

export function combatDrafts(event: CombatEvent, rc: RuleInput): Drafts {
  switch (event.type) {
    case "attacked":
      return attackedDrafts(event, rc);
    case "attack_started":
      return attackStartDrafts(event, rc);
    case "outcome":
      return petAttackDrafts(event, rc);
    case "cast_succeeded":
    case "cast_failed":
    case "cast_interrupted":
      return castDrafts(event);
    case "xp":
      return xpDrafts(event, rc);
    case "level_up":
      return levelDrafts(event, rc);
    case "aura":
      return auraDrafts(event, rc);
    default:
      return [];
  }
}

function armed(rc: RuleInput, line: number): boolean {
  return rc.memo.lowHealth.get(line) ?? true;
}

export function vitalsDrafts(event: EntityEvent, rc: RuleInput): Drafts {
  if (
    event.type !== "update" ||
    event.entity.guid !== rc.selfGuid ||
    !event.changed.includes("health")
  )
    return [];
  const { entity } = event;
  if (!("health" in entity) || entity.health <= 0 || entity.maxHealth <= 0)
    return [];
  const pct = (entity.health * 100) / entity.maxHealth;
  const crossed = LOW_HEALTH.filter((line) => armed(rc, line) && pct < line);
  for (const line of LOW_HEALTH)
    if (pct >= line + REARM_POINTS) rc.memo.lowHealth.set(line, true);
  for (const line of crossed) rc.memo.lowHealth.set(line, false);
  if (crossed.length === 0) return [];
  const shown = Math.round(pct);
  const data = {
    hp: entity.health,
    maxHp: entity.maxHealth,
    pct: shown,
    threshold: Math.min(...crossed),
  };
  const text = `You are at ${shown}% HP (${entity.health}/${entity.maxHealth}).`;
  return [
    {
      class: rc.runActive ? "log" : "wake",
      data,
      domain: "life",
      event: "life/low_health",
      text,
    },
  ];
}

function fightClass(rc: RuleInput): LogClass {
  return rc.memo.cycleActive ? "passive" : "log";
}

function fightStart(runId: string, guid: bigint, rc: RuleInput): Drafts {
  rc.memo.fights.set(runId, { at: rc.now, guid });
  watchUnit(guid, rc);
  const vitals = rc.lookup.selfVitals();
  const data = {
    hpBefore: vitals?.hp,
    jevRun: runId,
    level: rc.lookup.unitLevel(guid),
    manaBefore: vitals?.power,
    maxHp: vitals?.maxHp,
    name: rc.lookup.unitName(guid),
    target: guidText(guid),
  };
  const text = `Fight started: ${named(guid, rc)}.`;
  return [
    {
      class: fightClass(rc),
      data,
      domain: "fight",
      event: "fight/start",
      ...unitIds(guid, rc),
      text,
    },
  ];
}

function fightEnd(
  runId: string,
  outcome: TacticsOutcome,
  rc: RuleInput,
): Drafts {
  const fight = rc.memo.fights.get(runId);
  if (!fight) return [];
  rc.memo.fights.delete(runId);
  const { guid } = fight;
  const data = {
    durationMs: rc.now - fight.at,
    jevRun: runId,
    name: rc.lookup.unitName(guid),
    outcome: outcome.status,
    reason: outcome.reason,
    target: guidText(guid),
  };
  const text = `Fight ended: ${named(guid, rc)} ${outcome.status} (${outcome.reason}).`;
  return [
    {
      class: fightClass(rc),
      data,
      domain: "fight",
      event: "fight/end",
      ...unitIds(guid, rc),
      text,
    },
  ];
}

export function tacticsDrafts(event: TacticsEvent, rc: RuleInput): Drafts {
  if (event.type === "started")
    return fightStart(event.runId, BigInt(event.targetGuid), rc);
  if (event.type === "outcome")
    return fightEnd(
      event.runId,
      { reason: event.reason, status: event.status },
      rc,
    );
  if (event.type !== "stopped") return [];
  const outcome: TacticsOutcome = event.state.lastOutcome ?? {
    reason: event.reason,
    status: "failed",
  };
  return fightEnd(event.runId, outcome, rc);
}

function countFights(event: CycleEvent, rc: RuleInput) {
  const count = rc.memo.cycleFights;
  if (event.type === "started") {
    if (!rc.runActive) count.used = 0;
    count.base = count.used;
  }
  const { maxStarts, startsUsed } = event.state;
  count.used = Math.max(count.used, count.base + startsUsed);
  return { fights: count.used, maxFights: count.base + maxStarts };
}

export function cycleDrafts(event: CycleEvent, rc: RuleInput): Drafts {
  if (event.type === "started") rc.memo.cycleActive = true;
  if (event.type === "stopped") rc.memo.cycleActive = false;
  const { fights, maxFights } = countFights(event, rc);
  if (!CYCLE_STEPS.has(event.type)) return [];
  const { maxStarts, startsUsed } = event.state;
  const text = `cycle ${event.type.replace("_", " ")} (${fights} of ${maxFights} fights)`;
  const data = { cycle: event.type, fights, maxFights, maxStarts, startsUsed };
  return [{ class: "log", data, domain: "run", event: "run/progress", text }];
}
