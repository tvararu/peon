import { CHANNELS_OPCODES } from "#wow/areas/channels/opcodes";
import { defineArea, emptyStore } from "#wow/areas/contract";

export const channelsArea = defineArea({
  name: "channels",
  opcodes: CHANNELS_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
