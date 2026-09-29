import { defineArea, emptyStore } from "#wow/areas/contract";
import { RAID_OPCODES } from "#wow/areas/raid/opcodes";

export const raidArea = defineArea({
  name: "raid",
  opcodes: RAID_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
