import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  channelsModeChangeBody,
  channelsNotifyBareBody,
  channelsYouJoinedBody,
  channelsYouLeftBody,
} from "#test-support/areas/channels";
import type { ChannelsEvent } from "#wow/areas/channels/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const ME = 0xde1n;

function rigWithEvents() {
  const rig = areaRig("channels", { selfGuid: ME });
  const seen: ChannelsEvent[] = [];
  const off = rig.stores.areas.channels.onEvent((event) => seen.push(event));
  return {
    dispose: () => {
      off();
      rig.dispose();
    },
    inject: rig.inject,
    seen,
    snapshot: () => rig.stores.areas.channels.snapshot(),
  };
}

describe("channels area", () => {
  test("you_joined updates the store and emits channel_notice", () => {
    const rig = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_CHANNEL_NOTIFY,
        channelsYouJoinedBody({
          channel: "peonab12cd",
          channelId: 7,
          flags: 3,
        }),
      );
      expect(rig.snapshot().channels.map((row) => row.name)).toEqual([
        "peonab12cd",
      ]);
      expect(rig.seen.map((event) => event.notice.type)).toEqual([
        "you_joined",
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("you_left removes the channel from the store", () => {
    const rig = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_CHANNEL_NOTIFY,
        channelsYouJoinedBody({
          channel: "peonab12cd",
          channelId: 7,
          flags: 3,
        }),
      );
      rig.inject(
        GameOpcode.SMSG_CHANNEL_NOTIFY,
        channelsYouLeftBody({
          channel: "peonab12cd",
          channelId: 7,
          constant: false,
        }),
      );
      expect(rig.snapshot().channels).toEqual([]);
      expect(rig.seen.map((event) => event.notice.type)).toEqual([
        "you_joined",
        "you_left",
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("other notices emit without touching the channel rows", () => {
    const rig = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_CHANNEL_NOTIFY,
        channelsYouJoinedBody({
          channel: "peonab12cd",
          channelId: 7,
          flags: 3,
        }),
      );
      rig.inject(
        GameOpcode.SMSG_CHANNEL_NOTIFY,
        channelsNotifyBareBody({ channel: "peonab12cd", type: "not_member" }),
      );
      rig.inject(
        GameOpcode.SMSG_CHANNEL_NOTIFY,
        channelsModeChangeBody({
          channel: "peonab12cd",
          guid: ME,
          newFlags: 3,
          oldFlags: 0,
        }),
      );
      expect(rig.snapshot().channels).toHaveLength(1);
      expect(rig.seen.map((event) => event.notice.type)).toEqual([
        "you_joined",
        "not_member",
        "mode_change",
      ]);
    } finally {
      rig.dispose();
    }
  });
});
