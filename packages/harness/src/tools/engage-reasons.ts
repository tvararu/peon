import type { EngageTarget } from "#harness/contract/details";
import type { VitalsView } from "#harness/contract/views";
import { manaText } from "#harness/ops/views";

export type StopInit = {
  kills: number;
  name: string;
  targets: readonly EngageTarget[];
  wanted: number;
  why: string;
};

const QUEUE_EXHAUSTED = "queue_exhausted";
const REJECTED = "server_action_rejected:";
const LOOT_DENIED = "loot_denied:";
const NO_CREDIT_CODE = "target_dead_without_server_credit";
const NO_CREDIT = "died; no XP to you (another player's tap or a gray target)";
const NO_XP: Record<string, string> = {
  gray: "gray target",
  no_xp_kill: "no kill XP from the server",
};
const PLAIN: Record<string, string> = {
  died: "you died",
  engaged_by_other: "fighting another player",
  "loot_denied:loot_source_unavailable":
    "the last corpse despawned or left view",
  "loot_denied:release_only": "the last corpse was out of loot range",
  "loot_denied:timeout": "the last corpse did not open for looting",
  low_health: "your health is too low for another pull",
  low_mana: "your mana is too low for another pull",
  manual_override: "stopped by a manual command",
  max_starts_reached: "the fight limit for one call was reached",
  no_supported_combat_actions:
    "no usable attack from here; move into melee range",
  objective_targets_absent: "no quest targets are in view",
  objective_targets_out_of_reach: "the nearest quest target has no route",
  obstructed: "the way there was blocked",
  out_of_range: "out of range",
  queue_exhausted: "no more targets in view",
  "server_action_rejected:line_of_sight": "out of line of sight",
  tapped: "tapped by another player",
  tapped_by_other: "tapped by another player",
  target_dead: "already dead",
  target_dead_tapped_by_other: "killed by another player",
  target_dead_without_server_credit: NO_CREDIT,
  target_death_unconfirmed: "its death was not confirmed",
  target_friendly: "not hostile",
  target_lost: "lost from view",
  target_not_attackable: "cannot be attacked",
  target_not_observed: "not in view",
  target_unobserved: "not in view",
  target_unreachable: "could not be reached",
};

export function plainReason(code: string): string {
  const known = PLAIN[code];
  if (known) return known;
  if (code.startsWith(LOOT_DENIED)) return "the corpse could not be looted";
  return code.startsWith(REJECTED)
    ? `the server rejected the attack (${code.slice(REJECTED.length).replaceAll("_", " ")})`
    : code;
}

function listed(refs: string[]): string {
  const last = refs.pop();
  return refs.length === 0 ? (last ?? "") : `${refs.join(", ")} and ${last}`;
}

export function skippedText(targets: readonly EngageTarget[]): string {
  const groups = new Map<string, string[]>();
  for (const target of targets) {
    if (target.outcome === "killed") continue;
    const words = plainReason(target.reason ?? "stopped");
    groups.set(words, [...(groups.get(words) ?? []), target.ref]);
  }
  return [...groups]
    .map(([words, refs]) => `${listed(refs)} ${words}`)
    .join(", ");
}

function still(left: number): string {
  if (left <= 0) return "";
  return `; ${left} ${left === 1 ? "kill" : "kills"} still needed`;
}

export function stopText(init: StopInit): string {
  const { kills, name, targets, wanted, why } = init;
  const base =
    why === QUEUE_EXHAUSTED
      ? skippedText(targets) || `no more ${name} in view`
      : plainReason(why);
  return `${base}${still(wanted - kills)}`;
}

export function noXpText(targets: readonly EngageTarget[]): string {
  const words = targets.flatMap((target) => {
    const known = target.outcome === "killed" && NO_XP[target.reason ?? ""];
    return known ? [known] : [];
  });
  return [...new Set(words)].join(" or ");
}

export function failText(init: StopInit): string {
  if (init.why === NO_CREDIT_CODE) return `${init.name} ${NO_CREDIT}.`;
  const skipped = skippedText(init.targets);
  if (init.why === QUEUE_EXHAUSTED)
    return skipped
      ? `0 of ${init.wanted} kills: ${skipped}.`
      : `${init.name} was not killed: no more ${init.name} in view.`;
  return `${init.name} was not killed: ${plainReason(init.why)}.`;
}

export function lowText(
  why: string,
  done: { kills: number; wanted: number },
  vitals: VitalsView,
): string | undefined {
  const kills = `${done.kills} of ${done.wanted} kills.`;
  const pct = (value: number, max: number) =>
    Math.round((value / Math.max(1, max)) * 100);
  if (why === "low_mana")
    return `${kills} You have ${manaText(vitals) ?? `${pct(vitals.power, vitals.maxPower)}% mana`}.`;
  if (why === "low_health")
    return `${kills} You are at ${pct(vitals.hp, vitals.maxHp)}% HP.`;
  return undefined;
}

export function unreachedText(far: {
  name: string;
  ref: string;
  distance: number;
}): string {
  return `${far.name} ${far.ref} is ${far.distance} yd away and no route to it was found.`;
}
