import type {
  QuestEvent,
  QuestState,
  RewardsEvent,
  RewardsState,
} from "@tuicraft/core";
import type { LogDraft, LogEvent } from "#harness/contract/log";
import { type Drafts, guidText, type RuleInput } from "#harness/events/rules";
import { questXpDrafts } from "#harness/events/rules-xp";
import { itemIdText } from "#harness/ops/item-names";

export const MONEY_NOTICE_MS = 2000;

type QuestRow = {
  event: LogEvent;
  data: Record<string, unknown>;
  text: string;
};
type Objective = { count: number; objective: number; required: number };
type ItemPush = NonNullable<RewardsState["lastItemPush"]>;
type LootRelease = NonNullable<RewardsState["lastRelease"]>;

function questRow({ event, data, text }: QuestRow): LogDraft {
  return { class: "passive", data, domain: "quest", event, text };
}

function objective(
  progress: QuestState["lastProgress"],
): Objective | undefined {
  if (progress?.kind === "kill") {
    const { currentCount, npcOrGoId, requiredCount } = progress.data;
    return {
      count: currentCount,
      objective: npcOrGoId,
      required: requiredCount,
    };
  }
  if (progress?.kind === "collect")
    return {
      count: progress.carried,
      objective: progress.itemId,
      required: progress.required,
    };
}

function dialogTitles(dialog: QuestState["dialog"]): [number, string][] {
  if (dialog?.kind === "gossip" || dialog?.kind === "list")
    return dialog.data.quests.map((entry) => [entry.questId, entry.title]);
  if (dialog) return [[dialog.data.questId, dialog.data.title]];
  return [];
}

function noteTitles(event: QuestEvent, rc: RuleInput): void {
  for (const [questId, title] of dialogTitles(event.state.dialog))
    if (title) rc.memo.questTitles.set(questId, title);
}

function repeated(questId: number, step: Objective, rc: RuleInput): boolean {
  const key = `${questId}:${step.objective}`;
  if (rc.memo.questProgress.get(key) === step.count) return true;
  rc.memo.questProgress.set(key, step.count);
  return false;
}

function forget(questId: number, rc: RuleInput): void {
  for (const key of rc.memo.questProgress.keys())
    if (key.startsWith(`${questId}:`)) rc.memo.questProgress.delete(key);
}

function progressRows(
  event: QuestEvent,
  base: { questId: number },
  label: string,
  rc: RuleInput,
): Drafts {
  const step = objective(event.state.lastProgress);
  if (step && repeated(base.questId, step, rc)) return [];
  return [progressRow(step, base, label)];
}

function progressRow(
  step: Objective | undefined,
  base: Record<string, unknown>,
  label: string,
): LogDraft {
  const text = step
    ? `${label}: ${step.count}/${step.required}.`
    : `${label}: progress.`;
  return questRow({
    data: { ...base, ...step },
    event: "quest/progress",
    text,
  });
}

function rewardRow(
  event: QuestEvent,
  base: Record<string, unknown>,
  label: string,
): LogDraft {
  const reward = event.state.lastReward;
  const xp = reward?.experience ?? 0;
  const money = reward?.money ?? 0;
  const text = `Quest rewarded: ${label} (+${xp} XP, ${money} copper).`;
  return questRow({
    data: { ...base, money, xp },
    event: "quest/rewarded",
    text,
  });
}

export function questDrafts(event: QuestEvent, rc: RuleInput): Drafts {
  noteTitles(event, rc);
  const { questId } = event;
  if (questId === undefined) return [];
  const title =
    rc.lookup.questTitle(questId) ?? rc.memo.questTitles.get(questId);
  const label = title ?? `quest ${questId}`;
  const base = { questId, title };
  switch (event.type) {
    case "accepted":
      forget(questId, rc);
      return [
        questRow({
          data: base,
          event: "quest/accepted",
          text: `Quest accepted: ${label} (#${questId}).`,
        }),
      ];
    case "completed":
      return [
        questRow({
          data: base,
          event: "quest/completed",
          text: `Quest complete: ${label} (#${questId}). Turn it in.`,
        }),
      ];
    case "progress":
      return progressRows(event, base, label, rc);
    case "rewarded":
      return [rewardRow(event, base, label), ...questXpDrafts(event, rc)];
    default:
      return [];
  }
}

function itemSource({ created, received }: ItemPush): string {
  if (created === 1) return "created";
  return received === 1 ? "received" : "loot";
}

function itemRow(push: ItemPush, rc: RuleInput): Drafts {
  if (push.guid !== rc.selfGuid) return [];
  const name = rc.lookup.itemName(push.itemId);
  const data = {
    bag: push.bagSlot,
    count: push.count,
    itemId: push.itemId,
    name,
    slot: push.slot,
    source: itemSource(push),
    total: push.totalCount,
  };
  const text = `You receive ${name ?? itemIdText(push.itemId)} x${push.count}.`;
  return [{ class: "passive", data, domain: "loot", event: "loot/item", text }];
}

function lootOpenRow(data: Record<string, unknown>, text: string): LogDraft {
  return { class: "log", data, domain: "loot", event: "loot/open", text };
}

function openedRow(loot: RewardsState["loot"], rc: RuleInput): Drafts {
  if (loot.phase !== "open") return [];
  const guid = guidText(loot.guid);
  rc.memo.lootOpen = guid;
  const data = { guid, money: loot.money, slots: loot.items.length };
  const text = `Loot window open: ${loot.items.length} items, ${loot.money} copper.`;
  return [lootOpenRow(data, text)];
}

function releaseRows(release: LootRelease, rc: RuleInput): Drafts {
  const guid = guidText(release.guid);
  const opened = rc.memo.lootOpen === guid;
  rc.memo.lootOpen = undefined;
  const empty = { empty: true, guid, money: 0, slots: 0 };
  const data = { guid, status: release.status };
  return [
    ...(opened ? [] : [lootOpenRow(empty, "Loot window: nothing to loot.")]),
    {
      class: "log",
      data,
      domain: "loot",
      event: "loot/release",
      text: "Loot window closed.",
    },
  ];
}

export function lootDrafts(
  { type, state }: RewardsEvent,
  rc: RuleInput,
): Drafts {
  const { lastItemPush, lastRelease, loot } = state;
  if (type === "item_push" && lastItemPush) return itemRow(lastItemPush, rc);
  if (type === "loot_opened") return openedRow(loot, rc);
  if (type === "loot_release_observed" && lastRelease)
    return releaseRows(lastRelease, rc);
  return [];
}

function moneyReason(rc: RuleInput): string {
  const notice = rc.memo.moneyNoticeAt;
  if (notice !== undefined && rc.now - notice < MONEY_NOTICE_MS) return "loot";
  const vendor = rc.memo.vendorAction;
  if (!vendor) return "other";
  const { action, charged, settledAt } = vendor;
  if (settledAt !== undefined) rc.memo.vendorAction = undefined;
  const late = settledAt !== undefined && rc.now - settledAt >= MONEY_NOTICE_MS;
  if (late || (charged && settledAt !== undefined)) return "other";
  vendor.charged = true;
  return `vendor_${action}`;
}

export function moneyDrafts({ state }: RewardsEvent, rc: RuleInput): Drafts {
  const after = state.inventory.coinage;
  const before = rc.memo.coinage;
  rc.memo.coinage = after ?? before;
  if (after === undefined || before === undefined || after === before)
    return [];
  const reason = moneyReason(rc);
  const delta = after - before;
  const text = `Money ${delta > 0 ? "+" : ""}${delta} copper (now ${after}).`;
  return [
    {
      class: "passive",
      data: { after, before, delta, reason },
      domain: "money",
      event: "money/change",
      text,
    },
  ];
}

export function rewardsDrafts(event: RewardsEvent, rc: RuleInput): Drafts {
  if (event.type === "money_notice") rc.memo.moneyNoticeAt = rc.now;
  return [...lootDrafts(event, rc), ...moneyDrafts(event, rc)];
}
