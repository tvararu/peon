import type { AreaActsOf } from "@peon/core";
import { abortable } from "@peon/core/lib/abort";
import type {
  ChannelAdminOutcome,
  ChannelAfter,
  ChannelArgs,
  ChannelCtx,
  ChannelDo,
  ChannelListOutcome,
} from "#harness/areas/channels/tool-types";
import type { ToolResult } from "#harness/contract/result";
import { Refusal } from "#harness/ops/refusal";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

const ADMIN_VERBS: Record<string, ChannelDo> = {
  announce: "announce",
  ban: "ban",
  invite: "invite",
  kick: "kick",
  moderate: "moderate",
  moderator: "moderator",
  mute: "mute",
  owner: "owner",
  password: "password",
  set_owner: "set_owner",
  unban: "unban",
  unmoderator: "unmoderator",
  unmute: "unmute",
};
const PLAYER_VERBS: Record<string, true> = {
  ban: true,
  invite: true,
  kick: true,
  moderator: true,
  mute: true,
  password: true,
  set_owner: true,
  unban: true,
  unmoderator: true,
  unmute: true,
};

function channelOf(args: ChannelArgs): string {
  const channel = args.channel?.trim() ?? "";
  if (channel === "")
    throw new Refusal({
      detail: "name the channel to act on.",
      next: nextCall("channel", { do: args.do }),
      reason: "missing_channel",
    });
  return channel;
}

function playerOf(args: ChannelArgs, verb: string): string {
  const player = args.player?.trim() ?? "";
  if (player === "")
    throw new Refusal({
      detail: `name the player to ${verb}.`,
      next: nextCall("channel", { do: args.do, channel: args.channel }),
      reason: "missing_player",
    });
  return player;
}

async function guarded<T>(ctx: ChannelCtx, act: () => Promise<T>): Promise<T> {
  const queued = ctx.rt.mutex.run(async () => {
    ctx.signal.throwIfAborted();
    return await act();
  });
  queued.then(
    () => undefined,
    () => undefined,
  );
  return await abortable(queued, ctx.signal);
}

function adminDetail(verb: ChannelDo, result: ChannelAdminOutcome): string {
  if (!result.ok) {
    if (result.reason === "not_member")
      return `you are not on that channel, so ${verb} went nowhere.`;
    if (result.reason === "bad_name")
      return `that player name is not usable for ${verb}.`;
    return `the password is longer than 31 characters, so it went nowhere.`;
  }
  if (result.notice === undefined)
    return `the server gave no answer to ${verb}; the journal shows whether it landed.`;
  return `the server answered ${verb} with ${result.notice.type}.`;
}

function settleAdmin(
  do_: ChannelDo,
  channel: string,
  player: string | undefined,
  outcome: ChannelAdminOutcome,
): ToolResult<ChannelAfter> {
  if (!outcome.ok && outcome.reason === "not_member")
    throw new Refusal({
      detail: `you are not on ${channel}.`,
      next: nextCall("channel", { do: "join", channel }),
      reason: "not_member",
    });
  if (!outcome.ok)
    throw new Refusal({
      detail: adminDetail(do_, outcome),
      next: nextCall("channel", { do: do_, channel }),
      reason: outcome.reason,
    });
  const status = outcome.notice === undefined ? "UNCONFIRMED" : "DONE";
  return result(status, {
    after: { channel, do: do_, player },
    detail: `${do_} on ${channel}${player ? ` for ${player}` : ""}: ${adminDetail(do_, outcome)}`,
    reason: status === "UNCONFIRMED" ? "no_answer" : undefined,
  });
}

async function runAdmin(
  args: ChannelArgs,
  ctx: ChannelCtx,
  verb: ChannelDo,
): Promise<ToolResult<ChannelAfter>> {
  const channel = channelOf(args);
  const player =
    PLAYER_VERBS[verb] === true
      ? playerOf(args, verb)
      : args.player?.trim() || undefined;
  type AdminAction = Parameters<AreaActsOf<"channels">["channelAdmin"]>[1];
  const action = (verb === "announce" ? "announcements" : verb) as AdminAction;
  const outcome = await guarded(ctx, () =>
    ctx.handle.channels.act.channelAdmin(channel, action, player ?? ""),
  );
  return settleAdmin(verb, channel, player, outcome);
}

async function runList(
  args: ChannelArgs,
  ctx: ChannelCtx,
): Promise<ToolResult<ChannelAfter>> {
  const channel = channelOf(args);
  const outcome: ChannelListOutcome = await guarded(ctx, () =>
    ctx.handle.channels.act.listChannel(channel, {
      display: args.display === true,
    }),
  );
  if (!outcome.ok)
    throw new Refusal({
      detail: `you are not on ${channel}.`,
      next: nextCall("channel", { do: "join", channel }),
      reason: "not_member",
    });
  const names = outcome.members.length;
  return result("DONE", {
    after: { channel, do: "list", player: undefined },
    body: [`${channel} holds ${names} member${names === 1 ? "" : "s"}.`],
    detail: `${channel} holds ${names} member${names === 1 ? "" : "s"}.`,
  });
}

async function runCount(
  args: ChannelArgs,
  ctx: ChannelCtx,
): Promise<ToolResult<ChannelAfter>> {
  const channel = channelOf(args);
  const count = await guarded(ctx, () =>
    ctx.handle.channels.act.channelMemberCount(channel),
  );
  if (count === undefined)
    return result("UNCONFIRMED", {
      after: { channel, do: "count", player: undefined },
      detail: `the server gave no member count for ${channel}.`,
      next: nextCall("channel", { do: "join", channel }),
      reason: "no_answer",
    });
  return result("DONE", {
    after: { channel, do: "count", player: undefined },
    detail: `${channel} holds ${count} member${count === 1 ? "" : "s"}.`,
  });
}

async function runJoin(
  args: ChannelArgs,
  ctx: ChannelCtx,
): Promise<ToolResult<ChannelAfter>> {
  const channel = channelOf(args);
  await guarded(ctx, async () => {
    ctx.handle.joinChannel(channel, args.password);
  });
  return result("UNCONFIRMED", {
    after: { channel, do: "join", player: undefined },
    detail: `you asked to join ${channel}; the journal shows whether the server let you in.`,
    reason: "no_answer",
  });
}

async function runLeave(
  args: ChannelArgs,
  ctx: ChannelCtx,
): Promise<ToolResult<ChannelAfter>> {
  const channel = channelOf(args);
  await guarded(ctx, async () => {
    ctx.handle.leaveChannel(channel);
  });
  return result("DONE", {
    after: { channel, do: "leave", player: undefined },
    detail: `you left ${channel}.`,
  });
}

export async function channelRun(
  args: ChannelArgs,
  ctx: ChannelCtx,
): Promise<ToolResult<ChannelAfter>> {
  const verb = ADMIN_VERBS[args.do];
  if (verb !== undefined) return runAdmin(args, ctx, verb);
  if (args.do === "list") return runList(args, ctx);
  if (args.do === "count") return runCount(args, ctx);
  if (args.do === "join") return runJoin(args, ctx);
  if (args.do === "leave") return runLeave(args, ctx);
  throw new Refusal({
    detail: `Unknown channel verb ${String(args.do)}. Use join, leave, list, count, kick, ban, unban, announce, moderate, invite or one of the other admin verbs.`,
    next: nextCall("channel", { do: "list" }),
    reason: "unknown_verb",
  });
}
