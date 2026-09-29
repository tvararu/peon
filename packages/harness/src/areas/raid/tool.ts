import type { PartyMember } from "@peon/core";
import {
  type Answer,
  emptyGroup,
  findMember,
  type GroupAfter,
  type GroupArgs,
  type GroupCtx,
  type GroupDo,
  groupParams,
  isAssistant,
  isLeader,
  KICK_SETTLE_MS,
  type RaidGroup,
  sameName,
} from "#harness/areas/raid/tool-shared";
import { statusTool } from "#harness/areas/raid/tool-status";
import type { ToolResult } from "#harness/contract/result";
import { Refusal } from "#harness/ops/refusal";
import { settle } from "#harness/ops/settle";
import { defineGameTool, result } from "#harness/tools/define";
import type { GameToolSpec, ToolRenderers } from "#harness/tools/game-tool";
import { askHuman, nextCall } from "#harness/tools/next-call";
import { argText } from "#harness/ui/draw";
import {
  type CallInit,
  callLine,
  callRenderer,
  resultRenderer,
} from "#harness/ui/renderers/line";

function subscribeKick(ctx: GroupCtx, cb: (answer: Answer) => void) {
  const offRaid = ctx.handle.raid.onEvent((event) =>
    cb({ event, kind: "raid" }),
  );
  const offGroup = ctx.handle.onGroupEvent((event) => {
    if (event.type === "leader_changed")
      cb({ kind: "group", name: event.name });
  });
  return () => {
    offRaid();
    offGroup();
  };
}

function kickSettled(target: string, answer: Answer | undefined) {
  if (
    answer?.kind === "raid" &&
    answer.event.type === "group_list" &&
    answer.event.changes.some(
      (change) => change.kind === "left" && sameName(change.name, target),
    )
  ) {
    return {
      after: {
        ...emptyGroup(),
        confirmed: true,
        do: "kick" as GroupDo,
        member: target,
        to: target,
      },
      detail: `removed ${target} from the group.`,
      status: "DONE" as const,
    };
  }
  if (answer?.kind === "raid" && answer.event.type === "disbanded") {
    return {
      after: {
        ...emptyGroup(),
        confirmed: true,
        do: "kick" as GroupDo,
        member: target,
        to: target,
      },
      detail: `removed ${target}; the group disbanded.`,
      status: "DONE" as const,
    };
  }
  if (
    answer?.kind === "raid" &&
    answer.event.type === "command_result" &&
    answer.event.operation === "uninvite" &&
    answer.event.result !== "ok"
  ) {
    return {
      after: { ...emptyGroup(), do: "kick" as GroupDo, to: target },
      detail: `the server refused the kick of ${target}.`,
      next: askHuman(`The kick of ${target} failed. What should I do?`),
      reason: answer.event.result,
      status: "FAILED" as const,
    };
  }
}

async function kickTool(
  args: GroupArgs,
  ctx: GroupCtx,
): Promise<ToolResult<GroupAfter>> {
  const party = ctx.handle.getPartyState();
  const group = ctx.handle.raid.state().group;
  if (!group) {
    throw new Refusal({
      detail: "you are not in a group.",
      next: askHuman("I am not in a group. What should I do?"),
      reason: "not_in_group",
    });
  }
  const resolved = resolveKickTarget(
    group,
    { inGroup: party.inGroup, members: party.members },
    args.to,
    ctx,
  );
  const reason = (args.text ?? "").slice(0, 40);
  let answer: Answer | undefined;
  try {
    answer = await settle<Answer>({
      match: (candidate) =>
        kickSettled(resolved.target, candidate) !== undefined,
      send: () =>
        ctx.rt.mutex.run(() =>
          ctx.handle.raid.act.uninviteGuid(resolved.target, reason),
        ),
      signal: ctx.signal,
      subscribe: (cb) => subscribeKick(ctx, cb),
      timeoutMs: KICK_SETTLE_MS,
    });
  } catch (error) {
    if (ctx.signal?.aborted) throw error;
    throw error instanceof Refusal
      ? error
      : new Refusal({
          detail: `the kick of ${resolved.target} failed.`,
          next: nextCall("look"),
          reason: "error",
          status: "FAILED",
        });
  }
  const outcome = kickSettled(resolved.target, answer);
  if (outcome) return { ...outcome, body: [] };
  return result("UNCONFIRMED", {
    after: { ...emptyGroup(), do: "kick" as GroupDo, to: resolved.target },
    detail: `removed ${resolved.target} is not confirmed yet.`,
    next: `end your turn; a [game] message comes if ${resolved.target} leaves.`,
    reason: "no_answer",
  });
}

function resolveKickTarget(
  group: RaidGroup,
  party: { inGroup: boolean; members: readonly PartyMember[] },
  to: string | undefined,
  ctx: GroupCtx,
): { target: string } {
  if (!party.inGroup) {
    throw new Refusal({
      detail: "you are not in a group.",
      next: askHuman("I am not in a group. What should I do?"),
      reason: "not_in_group",
    });
  }
  const name = to?.trim();
  if (!name) {
    throw new Refusal({
      detail: "name the group member to remove.",
      next: "end your turn.",
      reason: "needs_name",
    });
  }
  const member = findMember(party.members, name);
  if (!member) {
    throw new Refusal({
      detail: `${name} is not in your group. Members: ${party.members.map((entry) => entry.name).join(", ")}.`,
      next: "end your turn.",
      reason: "not_a_member",
    });
  }
  if (group.dungeonFinder !== undefined) {
    throw new Refusal({
      detail: "the dungeon finder runs this group's votes.",
      next: "end your turn.",
      reason: "lfg_vote_kick",
    });
  }
  if (!(isLeader(group, ctx) || isAssistant(group, ctx))) {
    throw new Refusal({
      detail: "only the leader or an assistant removes members.",
      next: "end your turn.",
      reason: "not_leader",
    });
  }
  if (member.guid === group.leader) {
    throw new Refusal({
      detail: `${member.name} leads the group; pass the lead first.`,
      next: "end your turn.",
      reason: "target_is_leader",
    });
  }
  return { target: member.name };
}

function subscribeLead(ctx: GroupCtx, cb: (answer: Answer) => void) {
  return ctx.handle.onGroupEvent((event) => {
    if (event.type === "leader_changed")
      cb({ kind: "group", name: event.name });
  });
}

async function leadTool(
  args: GroupArgs,
  ctx: GroupCtx,
): Promise<ToolResult<GroupAfter>> {
  const party = ctx.handle.getPartyState();
  const group = ctx.handle.raid.state().group;
  if (!(party.inGroup && group)) {
    throw new Refusal({
      detail: "you are not in a group.",
      next: askHuman("I am not in a group. What should I do?"),
      reason: "not_in_group",
    });
  }
  const name = args.to?.trim();
  if (!name) {
    throw new Refusal({
      detail: "name the group member to lead.",
      next: "end your turn.",
      reason: "needs_name",
    });
  }
  const member = findMember(party.members, name);
  if (!member) {
    throw new Refusal({
      detail: `${name} is not in your group. Members: ${party.members.map((entry) => entry.name).join(", ")}.`,
      next: "end your turn.",
      reason: "not_a_member",
    });
  }
  if (!isLeader(group, ctx)) {
    throw new Refusal({
      detail: "only the leader passes the lead.",
      next: "end your turn.",
      reason: "not_leader",
    });
  }
  const target = member.name;
  const answer = await settle<Answer>({
    match: (candidate) =>
      candidate.kind === "group" && sameName(candidate.name, target),
    send: () => ctx.rt.mutex.run(() => ctx.handle.setLeader(target)),
    signal: ctx.signal,
    subscribe: (cb) => subscribeLead(ctx, cb),
    timeoutMs: KICK_SETTLE_MS,
  });
  if (answer?.kind === "group") {
    return result("DONE", {
      after: {
        ...emptyGroup(),
        confirmed: true,
        do: "lead" as GroupDo,
        member: target,
        to: target,
      },
      detail: `${target} leads the group now.`,
    });
  }
  return result("UNCONFIRMED", {
    after: { ...emptyGroup(), do: "lead" as GroupDo, to: target },
    detail: `the lead of ${target} is not confirmed yet.`,
    next: `end your turn; a [game] message comes if ${target} leads.`,
    reason: "no_answer",
  });
}

function groupRun(
  args: GroupArgs,
  ctx: GroupCtx,
): Promise<ToolResult<GroupAfter>> {
  const ops: Record<GroupDo, string> = {
    kick: "kick",
    lead: "lead",
    status: "status",
  };
  const op =
    ops[
      (["status", "kick", "lead"] as const).find(
        (known) => known === args.do,
      ) ?? "status"
    ];
  if (op === "kick") return kickTool(args, ctx);
  if (op === "lead") return leadTool(args, ctx);
  return statusTool(args, ctx);
}

function groupCall(args: unknown, theme: CallInit["theme"]): string {
  const doing = argText(args, "do") ?? "status";
  return callLine({
    icon: "party",
    parts: [doing, argText(args, "to"), argText(args, "text")],
    theme,
    verb: "group",
  });
}

function groupBody({
  after,
  expanded,
}: {
  after: GroupAfter;
  expanded: boolean;
}): string[] {
  if (!expanded) return [];
  return after.member ? [after.member] : [];
}

export const groupRenderers: ToolRenderers<"group", GroupAfter> = {
  renderCall: callRenderer(groupCall),
  renderResult: resultRenderer("group", groupBody),
};

export const groupSpec: GameToolSpec<typeof groupParams, "group", GroupAfter> =
  {
    fallback: emptyGroup,
    kind: "action",
    maxLines: 24,
    minimalArgs: {},
    name: "group",
    parameters: groupParams,
    renderers: groupRenderers,
    run: groupRun,
    text: {
      description:
        "Shows the group roster, removes a member, or passes the lead. Status lists each member's subgroup, role, health and state. Kick and lead act only when Peon leads or assists, never in a dungeon-finder group, and kick needs a reason.",
      guidelines: ["Call status first to learn the exact member name."],
      label: "Group",
    },
  };

export const groupTool = defineGameTool(groupSpec);
