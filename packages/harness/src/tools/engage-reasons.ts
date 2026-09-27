import type { EngageTarget } from "#harness/contract/details";

export type StopInit = {
  kills: number;
  name: string;
  targets: readonly EngageTarget[];
  wanted: number;
  why: string;
};

const QUEUE_EXHAUSTED = "queue_exhausted";
const REJECTED = "server_action_rejected:";
const PLAIN: Record<string, string> = {
  "loot_denied:loot_source_unavailable":
    "the last corpse despawned or left view",
  "loot_denied:release_only": "the last corpse was out of loot range",
  "loot_denied:timeout": "the last corpse did not open for looting",
  manual_override: "stopped by a manual command",
  max_starts_reached: "the fight limit for one call was reached",
  no_supported_combat_actions:
    "no usable attack from here; move into melee range",
  objective_targets_absent: "no quest targets are in view",
  objective_targets_out_of_reach: "the quest targets in view cannot be reached",
  out_of_range: "out of range",
  "server_action_rejected:line_of_sight": "out of line of sight",
  tapped: "tapped by another player",
  target_dead_without_server_credit: "killed by another player",
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

export function failText(init: StopInit): string {
  const skipped = skippedText(init.targets);
  if (init.why === QUEUE_EXHAUSTED && skipped)
    return `0 of ${init.wanted} kills: ${skipped}.`;
  return `${init.name} was not killed: ${plainReason(init.why)}.`;
}
