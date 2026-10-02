import { parseChannelNotice } from "#wow/areas/channels/notice";
import { CHANNELS_OPCODES } from "#wow/areas/channels/opcodes";
import { channelsRuntime } from "#wow/areas/channels/runtime";
import { ChannelStore } from "#wow/areas/channels/store";
import { defineArea } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";

export const channelsArea = defineArea({
  name: "channels",
  opcodes: CHANNELS_OPCODES,
  eventTypes: ["channel_notice"],
  store: (deps, core) => new ChannelStore(deps, core),
  register: (wire, store) => {
    wire.peek(GameOpcode.SMSG_CHANNEL_NOTIFY, (r) =>
      store.notice(parseChannelNotice(r)),
    );
  },
  runtime: channelsRuntime,
});
