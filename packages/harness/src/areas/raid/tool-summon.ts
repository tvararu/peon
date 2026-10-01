import type { ControlEvent } from "@peon/core";
import {
  emptyGroup,
  type GroupAfter,
  type GroupArgs,
  type GroupCtx,
} from "#harness/areas/raid/tool-shared";
import type { ToolResult } from "#harness/contract/result";
import { Refusal } from "#harness/ops/refusal";
import { settle } from "#harness/ops/settle";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

const ANSWER_STATES: Record<string, boolean> = {
  accept: true,
  decline: false,
};

const SUMMON_WAIT_MS = 5000;

function needsName(ctx: GroupCtx): string {
  const pending = ctx.handle.raid.state().summon;
  if (!pending)
    throw new Refusal({
      detail: "no summon is pending.",
      next: "end your turn; a [game] message comes if someone summons you.",
      reason: "no_summon",
    });
  return pending.name;
}

function openBody(ctx: GroupCtx): void {
  const recovery = ctx.handle.getRecoveryState();
  if (recovery.life !== "alive")
    throw new Refusal({
      detail: "you cannot answer a summon while dead.",
      next: nextCall("look"),
      reason: "dead",
    });
  const combat = ctx.handle.getCombatState();
  if (combat.attackers.length > 0 || combat.attacking)
    throw new Refusal({
      detail: "you cannot answer a summon in combat.",
      next: nextCall("look"),
      reason: "in_combat",
    });
}

function summonArgs(args: GroupArgs): boolean {
  const named = args.what?.trim().toLowerCase() ?? "";
  if (!Object.hasOwn(ANSWER_STATES, named))
    throw new Refusal({
      detail: "answer the summon with accept or decline.",
      next: "end your turn.",
      reason: "bad_answer",
    });
  return named === "accept";
}

function after(summoner: string): GroupAfter {
  return { ...emptyGroup(), confirmed: true, do: "summon", member: summoner };
}

function arrived(event: ControlEvent): boolean {
  if (event.type !== "server_correction") return false;
  return (
    event.reason === "teleport" ||
    event.reason === "new_world" ||
    event.reason === "near_teleport"
  );
}

async function declineSummon(ctx: GroupCtx): Promise<void> {
  try {
    await ctx.rt.mutex.run(() => ctx.handle.raid.act.answerSummon(false));
  } catch (error) {
    if (ctx.signal?.aborted) throw error;
    if (error instanceof Refusal) throw error;
    throw refusalFor(error);
  }
}

async function acceptSummon(ctx: GroupCtx): Promise<ControlEvent | undefined> {
  try {
    return await settle<ControlEvent>({
      match: arrived,
      send: () =>
        ctx.rt.mutex.run(() => ctx.handle.raid.act.answerSummon(true)),
      signal: ctx.signal,
      subscribe: (cb) => ctx.handle.onControlEvent(cb),
      timeoutMs: SUMMON_WAIT_MS,
    });
  } catch (error) {
    if (ctx.signal?.aborted) throw error;
    if (error instanceof Refusal) throw error;
    throw refusalFor(error);
  }
}

function refusalFor(error: unknown): Refusal {
  const expired = error instanceof Error && error.message === "no_summon";
  return new Refusal({
    detail: expired
      ? "the summon expired before the answer was sent."
      : "the summon answer failed to send.",
    next: expired ? "end your turn." : nextCall("look"),
    reason: expired ? "no_summon" : "error",
    status: expired ? undefined : "FAILED",
  });
}

export async function summonTool(
  args: GroupArgs,
  ctx: GroupCtx,
): Promise<ToolResult<GroupAfter>> {
  const accept = summonArgs(args);
  const summoner = needsName(ctx);
  openBody(ctx);
  const afterSummon = after(summoner);
  if (!accept) {
    await declineSummon(ctx);
    return result("DONE", {
      after: afterSummon,
      detail: `declined ${summoner}'s summon.`,
    });
  }
  const moved = await acceptSummon(ctx);
  if (moved)
    return result("DONE", {
      after: afterSummon,
      detail: "accepted the summon.",
    });
  return result("UNCONFIRMED", {
    after: afterSummon,
    detail: "the summon move is not confirmed yet.",
    next: "end your turn; a [game] message comes if the summon moves you.",
    reason: "no_answer",
  });
}
