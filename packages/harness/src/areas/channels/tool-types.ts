import type { AreaActsOf } from "@peon/core";
import type { ToolCtx } from "#harness/contract/services";

export type ChannelDo =
  | "join"
  | "leave"
  | "list"
  | "count"
  | "kick"
  | "ban"
  | "unban"
  | "announce"
  | "moderate"
  | "mute"
  | "unmute"
  | "moderator"
  | "unmoderator"
  | "owner"
  | "set_owner"
  | "password"
  | "invite";

export type ChannelArgs = {
  do: ChannelDo;
  channel?: string;
  player?: string;
  password?: string;
  display?: boolean;
};

export type ChannelAfter = {
  do: ChannelDo;
  channel: string | undefined;
  player: string | undefined;
};

export type ChannelCtx = ToolCtx<ChannelAfter>;

export type ChannelAdminOutcome = Awaited<
  ReturnType<AreaActsOf<"channels">["channelAdmin"]>
>;

export type ChannelListOutcome = Awaited<
  ReturnType<AreaActsOf<"channels">["listChannel"]>
>;
