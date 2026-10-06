import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import { guidText, type RuleInput } from "#harness/events/rules";

type ChannelsEvent = AreaEventOf<"channels">;
type Notice = Extract<ChannelsEvent, { type: "channel_notice" }>["notice"];
type PairNotice = Extract<
  Notice,
  { type: "player_kicked" | "player_banned" | "player_unbanned" }
>;

function nameOf(guid: bigint, rc: RuleInput): string {
  return rc.lookup.unitName(guid) ?? `player ${guidText(guid)}`;
}

function pairRow(notice: PairNotice, rc: RuleInput, verb: string): AreaDraft {
  return {
    class: "log",
    data: {
      actor: guidText(notice.actor),
      channel: notice.channel,
      target: guidText(notice.target),
    },
    guid: guidText(notice.target),
    name: verb,
    ref: rc.refOf(notice.target),
    text: `${nameOf(notice.actor, rc)} ${verb} ${nameOf(notice.target, rc)} on ${notice.channel}.`,
  };
}

function noticeRow(notice: Notice, rc: RuleInput): AreaDraft[] {
  switch (notice.type) {
    case "player_kicked":
      return [pairRow(notice, rc, "kicked")];
    case "player_banned":
      return [pairRow(notice, rc, "banned")];
    case "player_unbanned":
      return [pairRow(notice, rc, "unbanned")];
    case "joined":
      return [
        {
          class: "log",
          data: { channel: notice.channel, guid: guidText(notice.guid) },
          guid: guidText(notice.guid),
          name: "joined",
          ref: rc.refOf(notice.guid),
          text: `${nameOf(notice.guid, rc)} joined ${notice.channel}.`,
        },
      ];
    case "left":
      return [
        {
          class: "log",
          data: { channel: notice.channel, guid: guidText(notice.guid) },
          guid: guidText(notice.guid),
          name: "left",
          ref: rc.refOf(notice.guid),
          text: `${nameOf(notice.guid, rc)} left ${notice.channel}.`,
        },
      ];
    case "invite":
      return [
        {
          class: "wake",
          data: { channel: notice.channel, inviter: guidText(notice.inviter) },
          guid: guidText(notice.inviter),
          name: "invited",
          ref: rc.refOf(notice.inviter),
          text: `${nameOf(notice.inviter, rc)} invited you to ${notice.channel}.`,
        },
      ];
    case "announcements_on":
    case "announcements_off":
      return [
        {
          class: "log",
          data: { channel: notice.channel },
          name:
            notice.type === "announcements_on"
              ? "announcements_on"
              : "announcements_off",
          text: `${notice.channel} announcements are ${notice.type === "announcements_on" ? "on" : "off"}.`,
        },
      ];
    case "moderation_on":
    case "moderation_off":
      return [
        {
          class: "log",
          data: { channel: notice.channel },
          name:
            notice.type === "moderation_on"
              ? "moderation_on"
              : "moderation_off",
          text: `${notice.channel} moderation is ${notice.type === "moderation_on" ? "on" : "off"}.`,
        },
      ];
    default:
      return [];
  }
}

function onEvent(event: ChannelsEvent, rc: RuleInput): readonly AreaDraft[] {
  if (event.type === "channel_notice") return noticeRow(event.notice, rc);
  if (event.type === "channel_userlist") {
    const joined = event.change !== "remove";
    return [
      {
        class: "log",
        data: {
          change: event.change,
          channel: event.channel,
          guid: guidText(event.guid),
        },
        guid: guidText(event.guid),
        name: joined ? "userlist_joined" : "userlist_left",
        ref: rc.refOf(event.guid),
        text: `${nameOf(event.guid, rc)} ${joined ? "joined" : "left"} ${event.channel}.`,
      },
    ];
  }
  if (event.type === "channel_members")
    return [
      {
        class: "log",
        data: { channel: event.channel, count: event.count },
        name: "listed",
        text: `${event.channel} holds ${event.count} member${event.count === 1 ? "" : "s"}.`,
      },
    ];
  return [];
}

export const channelsHarness = defineHarnessArea({
  area: "channels",
  rules: () => ({ event: (event, rc) => onEvent(event, rc) }),
  worldActs: [
    "channelAdmin",
    "listChannel",
    "channelMemberCount",
    "setChannelWatch",
    "clearChannelWatch",
    "declineChannelInvite",
  ],
});
