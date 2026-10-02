import { parseChannelNotice } from "#wow/areas/channels/notice";
import { CHANNELS_OPCODES } from "#wow/areas/channels/opcodes";
import {
  parseChannelList,
  parseChannelMemberCount,
} from "#wow/areas/channels/protocol";
import { channelsRuntime } from "#wow/areas/channels/runtime";
import { ChannelStore } from "#wow/areas/channels/store";
import { defineArea } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";

export const channelsArea = defineArea({
  name: "channels",
  opcodes: CHANNELS_OPCODES,
  eventTypes: ["channel_notice", "channel_members"],
  store: (deps, core) => new ChannelStore(deps, core),
  register: (wire, store) => {
    wire.peek(GameOpcode.SMSG_CHANNEL_NOTIFY, (r) =>
      store.notice(parseChannelNotice(r)),
    );
    wire.on(GameOpcode.SMSG_CHANNEL_LIST, (r) =>
      store.list(parseChannelList(r)),
    );
    wire.on(GameOpcode.SMSG_CHANNEL_MEMBER_COUNT, (r) =>
      store.count(parseChannelMemberCount(r)),
    );
  },
  runtime: channelsRuntime,
});
