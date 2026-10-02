import { ignoreFailure } from "#lib/ignore-failure";
import {
  type ChannelListActs,
  channelListActs,
} from "#wow/areas/channels/list";
import type { ChannelNotice } from "#wow/areas/channels/notice";
import {
  buildChannelInvite,
  buildChannelModerator,
  buildChannelMute,
  buildChannelOwnerQuery,
  buildChannelPassword,
  buildChannelSetOwner,
  buildChannelUnmoderator,
  buildChannelUnmute,
  CHANNEL_ADMIN_OPCODES,
  type ChannelAdminAction,
} from "#wow/areas/channels/protocol";
import type { ChannelStore, ChannelsEvent } from "#wow/areas/channels/store";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import type { CoreStores } from "#wow/session-stores";

export const MAX_CHANNEL_PASSWORD = 31;
export const CHANNEL_ANSWER_MS = 2000;

export type ChannelAdminResult =
  | { ok: true; notice: ChannelNotice | undefined }
  | { ok: false; reason: "too_long" | "bad_name" | "not_member" };

export type ChannelsActs = ChannelListActs & {
  channelAdmin: (
    channel: string,
    action: ChannelAdminAction,
    arg?: string,
    options?: { signal?: AbortSignal },
  ) => Promise<ChannelAdminResult>;
};

type AdminCall = {
  channel: string;
  action: ChannelAdminAction;
  arg: string | undefined;
};

function adminBody(call: AdminCall): Uint8Array {
  const builders: Record<ChannelAdminAction, () => Uint8Array> = {
    password: () => buildChannelPassword(call.channel, call.arg ?? ""),
    set_owner: () => buildChannelSetOwner(call.channel, call.arg ?? ""),
    owner: () => buildChannelOwnerQuery(call.channel),
    moderator: () => buildChannelModerator(call.channel, call.arg ?? ""),
    unmoderator: () => buildChannelUnmoderator(call.channel, call.arg ?? ""),
    mute: () => buildChannelMute(call.channel, call.arg ?? ""),
    unmute: () => buildChannelUnmute(call.channel, call.arg ?? ""),
    invite: () => buildChannelInvite(call.channel, call.arg ?? ""),
  };
  return builders[call.action]();
}

type AdminRefusal = {
  ok: false;
  reason: "too_long" | "bad_name" | "not_member";
};

function refuseAdmin(
  store: ChannelStore,
  channel: string,
  action: ChannelAdminAction,
  arg: string | undefined,
): AdminRefusal | undefined {
  if (action === "password" && (arg?.length ?? 0) > MAX_CHANNEL_PASSWORD)
    return { ok: false, reason: "too_long" };
  if (
    action !== "owner" &&
    (arg === undefined || arg.length === 0 || arg.includes(" "))
  )
    return { ok: false, reason: "bad_name" };
  if (!store.has(channel)) return { ok: false, reason: "not_member" };
  return undefined;
}

async function settleAdmin(
  settled: Promise<ChannelsEvent>,
): Promise<ChannelAdminResult> {
  try {
    const event = await settled;
    if (event.type !== "channel_notice") return { ok: true, notice: undefined };
    return { ok: true, notice: event.notice };
  } catch (error) {
    if (error instanceof Error && error.message === "timeout")
      return { ok: true, notice: undefined };
    throw error;
  }
}

export function channelsRuntime(
  ctx: AreaRuntimeCtx<ChannelsEvent>,
  store: ChannelStore,
  _core: CoreStores,
): AreaRuntime<ChannelsActs> {
  function channelAdmin(
    channel: string,
    action: ChannelAdminAction,
    arg?: string,
    options?: { signal?: AbortSignal },
  ): Promise<ChannelAdminResult> {
    const refused = refuseAdmin(store, channel, action, arg);
    if (refused !== undefined) return Promise.resolve(refused);
    const body = adminBody({ action, arg, channel });
    const wanted = channel.toLowerCase();
    const cancel = new AbortController();
    const settled = ctx.until(
      (event) =>
        event.type === "channel_notice" &&
        event.notice.channel.toLowerCase() === wanted,
      {
        signal: options?.signal ?? cancel.signal,
        timeoutMs: CHANNEL_ANSWER_MS,
      },
    );
    try {
      ctx.send(CHANNEL_ADMIN_OPCODES[action], body);
    } catch (error) {
      cancel.abort();
      settled.catch(ignoreFailure);
      throw error;
    }
    return settleAdmin(settled);
  }

  return {
    act: { channelAdmin, ...channelListActs(ctx) },
    dispose: () => undefined,
  };
}
