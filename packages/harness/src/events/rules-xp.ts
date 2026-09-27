import type { AreaExplored, CombatEvent, QuestEvent } from "@peon/core";
import type { LogDraft } from "#harness/contract/log";
import {
  type Drafts,
  guidText,
  type PendingXp,
  type RuleInput,
  unitIds,
} from "#harness/events/rules";

export const XP_SOURCE_WAIT_MS = 1000;

type Source = "kill" | "exploration" | "quest" | "other";

function afterGain(amount: number, rc: RuleInput) {
  const { next, xp } = rc.lookup.experience();
  if (xp === undefined) return { next, total: undefined };
  const sum = xp + amount;
  if (next !== undefined && sum >= next)
    return { levelUp: true, next: undefined, total: sum - next };
  return { next, total: sum };
}

function pendingOf(amount: number, victim: bigint, rc: RuleInput): PendingXp {
  return { amount, armed: false, victim, ...afterGain(amount, rc) };
}

function sourceText(source: Source, data: Record<string, unknown>) {
  if (source === "kill") return "kill";
  if (source === "exploration")
    return `exploring ${String(data["area"] ?? `area ${data["areaId"]}`)}`;
  if (source === "quest")
    return `quest ${String(data["title"] ?? data["questId"])}`;
}

function gainRow(
  gain: PendingXp,
  source: Source,
  extra: Record<string, unknown> = {},
): LogDraft {
  const { amount, levelUp, next, total, victim } = gain;
  const data = {
    amount,
    next,
    source,
    total,
    victim: guidText(victim),
    ...(levelUp ? { levelUp } : {}),
    ...extra,
  };
  const now =
    total === undefined
      ? undefined
      : `now ${total}${next === undefined ? "" : ` of ${next}`}`;
  const parts = [
    sourceText(source, data),
    levelUp ? "level up" : undefined,
    now,
  ].filter((part) => part !== undefined);
  const why = parts.length > 0 ? ` (${parts.join(", ")})` : "";
  return {
    class: "passive",
    data,
    domain: "xp",
    event: "xp/gain",
    text: `You gain ${amount} XP${why}.`,
  };
}

function takePending(rc: RuleInput): PendingXp | undefined {
  const pending = rc.memo.pendingXp;
  rc.memo.pendingXp = undefined;
  return pending;
}

export function flushPendingXp(rc: RuleInput): Drafts {
  const pending = takePending(rc);
  return pending ? [gainRow(pending, "other")] : [];
}

export function exploredDrafts(area: AreaExplored, rc: RuleInput): Drafts {
  const pending = takePending(rc);
  if (!pending) return [];
  const { areaId } = area;
  return [gainRow(pending, "exploration", { area: area.area, areaId })];
}

export function questXpDrafts(event: QuestEvent, rc: RuleInput): Drafts {
  const pending = takePending(rc);
  if (!pending) return [];
  const { questId } = event;
  const title =
    questId === undefined
      ? undefined
      : (rc.lookup.questTitle(questId) ?? rc.memo.questTitles.get(questId));
  return [gainRow(pending, "quest", { questId, title })];
}

export function xpDrafts(event: CombatEvent, rc: RuleInput): Drafts {
  const xp = event.state.lastXp;
  const key = xp && `${xp.at}:${xp.kind}:${xp.total}`;
  if (!xp || rc.memo.xpAt === key) return [];
  rc.memo.xpAt = key;
  const earlier = flushPendingXp(rc);
  const gain = pendingOf(xp.total, xp.victim, rc);
  if (xp.kind !== "kill") {
    rc.memo.pendingXp = gain;
    return earlier;
  }
  const credit: LogDraft = {
    class: "passive",
    data: { name: rc.lookup.unitName(xp.victim), xp: xp.total },
    domain: "combat",
    event: "combat/kill_credit",
    ...unitIds(xp.victim, rc),
    text: `Kill credit: ${rc.lookup.unitName(xp.victim) ?? "A unit"} ${rc.refOf(xp.victim)} (+${xp.total} XP).`,
  };
  return [...earlier, credit, gainRow(gain, "kill")];
}

export function levelDrafts(event: CombatEvent, rc: RuleInput): Drafts {
  const up = event.state.lastLevelUp;
  if (!up || rc.memo.levelAt === up.at) return [];
  rc.memo.levelAt = up.at;
  return [
    {
      class: "passive",
      data: { level: up.level },
      domain: "xp",
      event: "xp/level_up",
      text: `You reached level ${up.level}.`,
    },
  ];
}
