import { ignoreFailure } from "#lib/ignore-failure";
import {
  buildChannelDisplayList,
  buildChannelList,
  buildChannelMemberCountQuery,
  type ChannelMember,
} from "#wow/areas/channels/protocol";
import type { ChannelsEvent } from "#wow/areas/channels/store";
import type { AreaRuntimeCtx } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";

export const CHANNEL_LIST_MS = 3000;

export type ChannelListResult =
  | { ok: true; flags: number; members: readonly ChannelMember[] }
  | { ok: false; reason: "not_member" | "timeout" };

export type ChannelListActs = {
  listChannel: (
    channel: string,
    options?: { display?: boolean; signal?: AbortSignal },
  ) => Promise<ChannelListResult>;
  channelMemberCount: (
    channel: string,
    options?: { signal?: AbortSignal },
  ) => Promise<number | undefined>;
};

async function settleReply(
  settled: Promise<ChannelsEvent>,
): Promise<ChannelsEvent | undefined> {
  try {
    return await settled;
  } catch (error) {
    if (error instanceof Error && error.message === "timeout") return undefined;
    throw error;
  }
}

type Ctx = AreaRuntimeCtx<ChannelsEvent>;

type Reply = {
  channel: string;
  wantMembers: boolean;
  signal: AbortSignal | undefined;
  send: () => void;
};

function awaitReply(
  ctx: Ctx,
  { channel, wantMembers, signal, send }: Reply,
): Promise<ChannelsEvent | undefined> {
  const wanted = channel.toLowerCase();
  const cancel = new AbortController();
  const settled = ctx.until(
    (event) =>
      event.type === "channel_notice"
        ? event.notice.type === "not_member" &&
          event.notice.channel.toLowerCase() === wanted
        : event.channel.toLowerCase() === wanted &&
          (event.members !== undefined) === wantMembers,
    { signal: signal ?? cancel.signal, timeoutMs: CHANNEL_LIST_MS },
  );
  try {
    send();
  } catch (error) {
    cancel.abort();
    settled.catch(ignoreFailure);
    throw error;
  }
  return settleReply(settled);
}

async function listChannel(
  ctx: Ctx,
  channel: string,
  options?: { display?: boolean; signal?: AbortSignal },
): Promise<ChannelListResult> {
  const display = options?.display === true;
  const event = await awaitReply(ctx, {
    channel,
    send: () =>
      ctx.send(
        display
          ? GameOpcode.CMSG_CHANNEL_DISPLAY_LIST
          : GameOpcode.CMSG_CHANNEL_LIST,
        display ? buildChannelDisplayList(channel) : buildChannelList(channel),
      ),
    signal: options?.signal,
    wantMembers: true,
  });
  if (event === undefined) return { ok: false, reason: "timeout" };
  if (event.type === "channel_members")
    return { flags: event.flags, members: event.members ?? [], ok: true };
  return { ok: false, reason: "not_member" };
}

async function channelMemberCount(
  ctx: Ctx,
  channel: string,
  options?: { signal?: AbortSignal },
): Promise<number | undefined> {
  const event = await awaitReply(ctx, {
    channel,
    send: () =>
      ctx.send(
        GameOpcode.CMSG_GET_CHANNEL_MEMBER_COUNT,
        buildChannelMemberCountQuery(channel),
      ),
    signal: options?.signal,
    wantMembers: false,
  });
  return event?.type === "channel_members" ? event.count : undefined;
}

export function channelListActs(ctx: Ctx): ChannelListActs {
  return {
    channelMemberCount: (channel, options) =>
      channelMemberCount(ctx, channel, options),
    listChannel: (channel, options) => listChannel(ctx, channel, options),
  };
}
