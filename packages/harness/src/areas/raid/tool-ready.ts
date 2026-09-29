import { needGroup, runRaidSettled } from "#harness/areas/raid/tool-settle";
import {
  emptyGroup,
  type GroupAfter,
  type GroupArgs,
  type GroupCtx,
  type GroupDo,
  isAssistant,
  isLeader,
  type RaidGroup,
} from "#harness/areas/raid/tool-shared";
import type { ToolResult } from "#harness/contract/result";
import { Refusal } from "#harness/ops/refusal";
import { result } from "#harness/tools/define";

const READY_STATES: Record<string, boolean> = { no: false, yes: true };

function readyArgs(args: GroupArgs): boolean {
  const named = args.what?.trim().toLowerCase() ?? "";
  if (!Object.hasOwn(READY_STATES, named))
    throw new Refusal({
      detail: "answer the ready check with yes or no.",
      next: "end your turn.",
      reason: "bad_answer",
    });
  return named === "yes";
}

function readyCheck(group: RaidGroup, ctx: GroupCtx): void {
  if (group.dungeonFinder !== undefined)
    throw new Refusal({
      detail: "the dungeon finder runs this group's votes.",
      next: "end your turn.",
      reason: "lfg_vote",
    });
  if (!(isLeader(group, ctx) || isAssistant(group, ctx)))
    throw new Refusal({
      detail: "only the leader or an assistant starts a ready check.",
      next: "end your turn.",
      reason: "not_leader",
    });
}

function after(doing: GroupDo, confirmed: boolean): GroupAfter {
  return {
    ...emptyGroup(),
    confirmed,
    do: doing,
    member: undefined,
    to: undefined,
  };
}

export function readyCheckTool(
  _args: GroupArgs,
  ctx: GroupCtx,
): Promise<ToolResult<GroupAfter>> {
  const { group } = needGroup(ctx);
  readyCheck(group, ctx);
  const self = ctx.handle.getControlState().selfGuid;
  return runRaidSettled(
    ctx,
    () => ctx.handle.raid.act.startReadyCheck(),
    (answer) => {
      if (answer?.kind !== "raid") return;
      if (answer.event.type !== "ready_check_started") return;
      if (answer.event.initiator !== self) return;
      return {
        after: after("ready_check", true),
        detail: "ready check started.",
        status: "DONE" as const,
      };
    },
    {
      after: after("ready_check", false),
      detail: "the ready check start is not confirmed yet.",
      failedDetail: "the ready check failed to start.",
      next: "end your turn; a [game] message comes if the check starts.",
    },
  );
}

function openCheck(ctx: GroupCtx): void {
  const check = ctx.handle.raid.state().readyCheck;
  if (check === undefined || check.finishedAt !== undefined)
    throw new Refusal({
      detail: "no ready check is open.",
      next: "end your turn.",
      reason: "no_check",
    });
}

export async function readyTool(
  args: GroupArgs,
  ctx: GroupCtx,
): Promise<ToolResult<GroupAfter>> {
  needGroup(ctx);
  openCheck(ctx);
  const answer = readyArgs(args);
  await ctx.rt.mutex.run(() => ctx.handle.raid.act.answerReadyCheck(answer));
  return result("DONE", {
    after: after("ready", true),
    detail: answer ? "you are ready." : "you are not ready.",
  });
}
