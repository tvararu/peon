import type { AreaEventOf, QuestEvent } from "@peon/core";
import {
  emptyGroup,
  type GroupAfter,
  type GroupArgs,
  type GroupCtx,
  type GroupDo,
} from "#harness/areas/raid/tool-shared";
import type { ToolResult } from "#harness/contract/result";
import { questTitle } from "#harness/ops/quest-memory";
import { Refusal } from "#harness/ops/refusal";
import { settle } from "#harness/ops/settle";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

type ShareChange = Extract<AreaEventOf<"quests">, { type: "share" }>["share"];

const SHARE_SETTLE_MS = 3500;
const ACCEPT_SETTLE_MS = 5000;

const RESULT_TEXT: Record<number, string> = {
  0: "sharing",
  1: "cannot take it",
  2: "accepted",
  3: "declined",
  4: "busy",
  5: "log full",
  6: "has it",
  7: "done it",
  8: "cannot be shared today",
  9: "timer expired",
  10: "not in the party",
};

function refuse(
  reason: string,
  detail: string,
  next = "end your turn.",
): never {
  throw new Refusal({ detail, next, reason });
}

function questParam(ctx: GroupCtx, args: GroupArgs): number {
  const raw = args.quest;
  const id = typeof raw === "number" ? raw : undefined;
  const text = typeof raw === "string" ? raw.trim() : "";
  const state = ctx.handle.getQuestState();
  const logged = state.log.slots.flatMap((slot) =>
    slot.questId === undefined || slot.questId === 0 ? [] : [slot.questId],
  );
  if (id !== undefined) {
    if (logged.includes(id)) return id;
    refuse(
      "unknown_quest",
      `no quest #${id} in your quest log.`,
      nextCall("journal", { about: "quests" }),
    );
  }
  if (raw === undefined || text === "")
    refuse("needs_quest", "name the quest to share with quest.");
  const wanted = text.toLowerCase();
  const found = logged.find((questId) =>
    questTitle(ctx, questId).toLowerCase().includes(wanted),
  );
  if (found !== undefined) return found;
  refuse(
    "unknown_quest",
    `no quest "${text}" in your quest log.`,
    nextCall("journal", { about: "quests" }),
  );
}

function memberName(ctx: GroupCtx, guid: bigint): string {
  const member = ctx.handle
    .getPartyState()
    .members.find((entry) => entry.guid === guid);
  return member?.name ?? "a member";
}

function shareText(
  rows: { guid: bigint; result: number }[],
  ctx: GroupCtx,
): string {
  return rows
    .map(
      (row) =>
        `${memberName(ctx, row.guid)}: ${RESULT_TEXT[row.result] ?? `result ${row.result}`}`,
    )
    .join("; ");
}

function shareOutcome(
  title: string,
  rows: { guid: bigint; result: number }[],
  ctx: GroupCtx,
  flags: { noAnswer: boolean; refused: boolean },
): ToolResult<GroupAfter> {
  const listed = rows.length > 0 ? shareText(rows, ctx) : "no member answered";
  const after = { ...emptyGroup(), do: "share_quest" as GroupDo };
  if (flags.refused)
    return result("FAILED", {
      after,
      detail: `cannot share ${title} today. ${listed}.`,
      next: nextCall("look"),
      reason: "refused",
    });
  if (flags.noAnswer || rows.length === 0)
    return result("UNCONFIRMED", {
      after,
      detail: `no answer: the quest cannot be shared. ${listed}.`,
      next: `end your turn; a [quests] message comes if someone answers the share of ${title}.`,
      reason: "no_answer",
    });
  return result("DONE", {
    after: { ...after, confirmed: true },
    detail: `shared ${title}: ${listed}.`,
  });
}

function shareMatch(
  questId: number,
  rows: { guid: bigint; result: number }[],
  flags: { noAnswer: boolean; refused: boolean },
): (change: ShareChange) => boolean {
  return (change) => {
    if (change.questId !== questId) return false;
    if (change.type === "result" || change.type === "relayed") {
      rows.push({ guid: change.guid, result: change.result });
      return false;
    }
    if (change.type === "closed") {
      flags.noAnswer = change.reason === "no_answer" && rows.length === 0;
      flags.refused = change.reason === "refused";
      return change.reason !== "no_answer" || rows.length === 0;
    }
    return false;
  };
}

async function shareQuestTool(
  args: GroupArgs,
  ctx: GroupCtx,
): Promise<ToolResult<GroupAfter>> {
  if (!ctx.handle.getPartyState().inGroup)
    refuse("not_in_group", "you are not in a group.");
  const questId = questParam(ctx, args);
  const title = questTitle(ctx, questId);
  const rows: { guid: bigint; result: number }[] = [];
  const flags = { noAnswer: false, refused: false };
  try {
    await settle<ShareChange>({
      match: shareMatch(questId, rows, flags),
      send: () =>
        ctx.rt.mutex.run(() => {
          const started = ctx.handle.quests.act.shareQuest(questId);
          if (!started.ok)
            refuse(started.reason, `cannot share ${title}: ${started.reason}.`);
        }),
      signal: ctx.signal,
      subscribe: (cb) =>
        ctx.handle.quests.onEvent((event) => {
          if (event.type === "share") cb(event.share);
        }),
      timeoutMs: SHARE_SETTLE_MS,
    });
  } catch (error) {
    if (ctx.signal?.aborted) throw error;
    throw error instanceof Refusal
      ? error
      : new Refusal({
          detail: `sharing ${title} failed.`,
          next: nextCall("look"),
          reason: "error",
          status: "FAILED",
        });
  }
  return shareOutcome(title, rows, ctx, flags);
}

function acceptSettled(ctx: GroupCtx, questId: number): boolean {
  return ctx.handle
    .getQuestState()
    .log.slots.some((slot) => slot.questId === questId);
}

async function acceptQuestTool(
  args: GroupArgs,
  ctx: GroupCtx,
): Promise<ToolResult<GroupAfter>> {
  const life = ctx.handle.getRecoveryState().life;
  if (life !== "alive") refuse("dead", "you are dead.", nextCall("recover"));
  const offer = ctx.handle.quests.state().share?.offer;
  if (!offer) refuse("no_offer", "no shared quest is offered.");
  const title = offer.title;
  let confirmed = acceptSettled(ctx, offer.questId);
  if (!confirmed) {
    try {
      await settle<QuestEvent>({
        match: () => acceptSettled(ctx, offer.questId),
        send: () =>
          ctx.rt.mutex.run(() => {
            if (!ctx.handle.quests.act.answerShare("accept"))
              refuse("no_offer", "no shared quest is offered.");
          }),
        signal: ctx.signal,
        subscribe: (cb) => ctx.handle.onQuestEvent(cb),
        timeoutMs: ACCEPT_SETTLE_MS,
      });
    } catch (error) {
      if (ctx.signal?.aborted) throw error;
      throw error instanceof Refusal
        ? error
        : new Refusal({
            detail: `accepting ${title} failed.`,
            next: nextCall("look"),
            reason: "error",
            status: "FAILED",
          });
    }
    confirmed = acceptSettled(ctx, offer.questId);
  }
  if (confirmed)
    return result("DONE", {
      after: { ...emptyGroup(), confirmed: true, do: args.do as GroupDo },
      detail: `accepted ${title}.`,
    });
  return result("UNCONFIRMED", {
    after: { ...emptyGroup(), do: args.do as GroupDo },
    detail: `${title} is not in your quest log yet.`,
    next: `end your turn; a [quests] message comes if ${title} arrives.`,
    reason: "no_answer",
  });
}

async function declineQuestTool(
  args: GroupArgs,
  ctx: GroupCtx,
): Promise<ToolResult<GroupAfter>> {
  const offer = ctx.handle.quests.state().share?.offer;
  if (!offer) refuse("no_offer", "no shared quest is offered.");
  await ctx.rt.mutex.run(() => {
    if (!ctx.handle.quests.act.answerShare("decline"))
      refuse("no_offer", "no shared quest is offered.");
  });
  return result("DONE", {
    after: { ...emptyGroup(), confirmed: true, do: args.do as GroupDo },
    detail: `declined ${offer.title}.`,
  });
}

export function shareTool(
  args: GroupArgs,
  ctx: GroupCtx,
): Promise<ToolResult<GroupAfter>> {
  if (args.do === "share_quest") return shareQuestTool(args, ctx);
  if (args.do === "accept_quest") return acceptQuestTool(args, ctx);
  return declineQuestTool(args, ctx);
}
