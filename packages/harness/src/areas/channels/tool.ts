import { StringEnum, Type } from "@earendil-works/pi-ai";
import { channelRun } from "#harness/areas/channels/tool-run";
import type { ChannelAfter } from "#harness/areas/channels/tool-types";
import { defineGameTool } from "#harness/tools/define";
import type { GameToolSpec, ToolRenderers } from "#harness/tools/game-tool";
import { argText } from "#harness/ui/draw";
import {
  type BodyInit,
  type CallInit,
  callLine,
  callRenderer,
  resultRenderer,
} from "#harness/ui/renderers/line";

export const channelParams = Type.Object({
  channel: Type.Optional(
    Type.String({
      description: "The channel name, like a custom channel you own.",
    }),
  ),
  display: Type.Optional(
    Type.Boolean({
      description: "For list: true shows the channel roster window too.",
    }),
  ),
  do: StringEnum(
    [
      "join",
      "leave",
      "list",
      "count",
      "kick",
      "ban",
      "unban",
      "announce",
      "moderate",
      "mute",
      "unmute",
      "moderator",
      "unmoderator",
      "owner",
      "set_owner",
      "password",
      "invite",
    ],
    {
      description:
        "join: enter a channel. leave: leave it. list: read its members. count: read its member count. kick, ban, unban, announce, moderate, mute, unmute, moderator, unmoderator, owner, set_owner, password, invite: run that admin action on the channel.",
    },
  ),
  password: Type.Optional(
    Type.String({
      description: "For join: the channel password. For password: the new one.",
    }),
  ),
  player: Type.Optional(
    Type.String({
      description:
        "For kick, ban and the other player verbs: the character name.",
    }),
  ),
});

function channelCall(args: unknown, theme: CallInit["theme"]): string {
  return callLine({
    icon: "friendly",
    parts: [
      argText(args, "do") ?? "list",
      argText(args, "channel") ?? argText(args, "player"),
    ],
    theme,
    verb: "channel",
  });
}

function channelBody({
  expanded,
  result: out,
}: BodyInit<ChannelAfter>): string[] {
  return expanded ? out.body : [];
}

const channelRenderers: ToolRenderers<"channel", ChannelAfter> = {
  renderCall: callRenderer(channelCall),
  renderResult: resultRenderer("channel", channelBody),
};

export const channelSpec: GameToolSpec<
  typeof channelParams,
  "channel",
  ChannelAfter
> = {
  allowStopped: (args) => ["list", "count", "owner"].includes(args.do),
  fallback: () => ({ channel: undefined, do: "list", player: undefined }),
  kind: "action",
  minimalArgs: { do: "list" },
  name: "channel",
  parameters: channelParams,
  renderers: channelRenderers,
  run: channelRun as GameToolSpec<
    typeof channelParams,
    "channel",
    ChannelAfter
  >["run"],
  text: {
    description:
      "Join and leave chat channels, list their members, and run admin actions on a channel you moderate: kick, ban, unban, announce, moderate, invite and the rest.",
    guidelines: [
      "Join the channel first, then act on it. Kicking, banning and the other admin verbs need you to moderate the channel, usually as its owner.",
    ],
    label: "Channel",
  },
};

export const channelTool = defineGameTool(channelSpec);
