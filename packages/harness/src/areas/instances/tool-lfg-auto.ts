import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import {
  type DungeonCtx,
  type LfgEvent,
  roleNames,
} from "#harness/areas/instances/tool-lfg-base";

const ROLE_CHECK_TIMEOUT_MS = 60_000;

export type QueuePick = { entries: number[]; roles: number };

export type QueueWatch = {
  answerRoleCheck: (event: Extract<LfgEvent, { type: "role_check" }>) => void;
  answerProposal: (event: Extract<LfgEvent, { type: "proposal" }>) => void;
  stop: () => void;
};

const watches = new WeakMap<object, QueueWatch>();

function appendAnswerRow(
  ctx: DungeonCtx,
  event: "lfg/role_answered" | "lfg/proposal_answered" | "lfg/role_unanswered",
  text: string,
  data: Record<string, unknown>,
): void {
  ctx.rt.log.append({
    class: "log",
    data,
    domain: "lfg",
    event,
    text,
  });
}

function settleAnswer(
  promise: Promise<unknown>,
  onSettled: (outcome: unknown) => void,
): void {
  promise.then(onSettled, ignoreFailure).catch(ignoreFailure);
}

function answerRoleAuto(
  ctx: DungeonCtx,
  pick: QueuePick,
  finish: { proposal: boolean; role: boolean },
): void {
  finish.role = true;
  settleAnswer(ctx.handle.lfg.act.setRoles(pick.roles), (outcome) => {
    const result = outcome as { status: string; reason?: string };
    if (result.status === "ok")
      appendAnswerRow(
        ctx,
        "lfg/role_answered",
        `Answered the role check as ${roleNames(pick.roles)}.`,
        { roles: pick.roles },
      );
    else
      appendAnswerRow(
        ctx,
        "lfg/role_answered",
        `The role answer did not land (${result.reason ?? "no_answer"}).`,
        { reason: result.reason, roles: pick.roles },
      );
  });
}

function answerProposalAuto(
  ctx: DungeonCtx,
  event: Extract<LfgEvent, { type: "proposal" }>,
  finish: { proposal: boolean; role: boolean },
): void {
  finish.proposal = true;
  settleAnswer(ctx.handle.lfg.act.answerProposal(true), (outcome) => {
    const result = outcome as { status: string; reason?: string };
    if (result.status === "ok")
      appendAnswerRow(
        ctx,
        "lfg/proposal_answered",
        "Accepted the dungeon group proposal.",
        { accepted: true, id: event.id },
      );
    else
      appendAnswerRow(
        ctx,
        "lfg/proposal_answered",
        `The proposal answer did not land (${result.reason ?? "no_answer"}).`,
        { accepted: true, id: event.id, reason: result.reason },
      );
  });
}

function leaveAfterRoleSilence(ctx: DungeonCtx, stop: () => void): void {
  stop();
  settleAnswer(ctx.handle.lfg.act.leave(), (outcome) => {
    const result = outcome as { status: string };
    if (result.status === "ok")
      appendAnswerRow(
        ctx,
        "lfg/role_unanswered",
        "No role answer in 60 s: left the queue.",
        {},
      );
  });
}

export function startWatch(
  ctx: DungeonCtx,
  pick: QueuePick,
  auto: boolean,
): void {
  stopWatch(ctx);
  const finish = { proposal: false, role: false };
  const holder: { timer: ReturnType<typeof setTimeout> | undefined } = {
    timer: undefined,
  };
  const clearRoleTimeout = () => {
    if (holder.timer !== undefined) {
      clearTimeout(holder.timer);
      holder.timer = undefined;
    }
  };
  const stop = () => {
    finish.proposal = true;
    finish.role = true;
    clearRoleTimeout();
    watches.delete(ctx.rt);
    off();
  };
  const armRoleTimeout = () => {
    clearRoleTimeout();
    holder.timer = setTimeout(
      () => leaveAfterRoleSilence(ctx, stop),
      ROLE_CHECK_TIMEOUT_MS,
    );
  };
  const watch: QueueWatch = {
    answerProposal: (event) => {
      if (!auto || finish.proposal) return;
      if (event.state !== 0 || event.selfAnswered) return;
      answerProposalAuto(ctx, event, finish);
    },
    answerRoleCheck: (event) => {
      if (finish.role) return;
      if (event.stateName !== "initializing") {
        clearRoleTimeout();
        return;
      }
      if (auto) answerRoleAuto(ctx, pick, finish);
      else armRoleTimeout();
    },
    stop,
  };
  const off = ctx.handle.lfg.onEvent((event) => {
    if (event.type === "role_check") watch.answerRoleCheck(event);
    else if (event.type === "proposal") watch.answerProposal(event);
    else if (event.type === "role_chosen") clearRoleTimeout();
    else if (event.type === "status" && event.status === "none") watch.stop();
  });
  watches.set(ctx.rt, watch);
}
export function answerOpenRoleCheck(ctx: DungeonCtx): void {
  watches.get(ctx.rt)?.answerRoleCheck({
    state: 2,
    stateName: "initializing",
    type: "role_check",
  });
}

export function stopWatch(ctx: DungeonCtx): void {
  watches.get(ctx.rt)?.stop();
}
