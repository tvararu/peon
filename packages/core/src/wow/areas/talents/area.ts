import { defineArea } from "#wow/areas/contract";
import { TALENTS_OPCODES } from "#wow/areas/talents/opcodes";
import { parseTalentsInfo } from "#wow/areas/talents/protocol";
import { TalentsStore } from "#wow/areas/talents/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const talentsArea = defineArea({
  name: "talents",
  opcodes: TALENTS_OPCODES,
  eventTypes: ["info", "points", "pet_info"],
  store: (deps, core) => new TalentsStore(deps, core),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_TALENTS_INFO, (r) =>
      store.info(parseTalentsInfo(r)),
    );
  },
});
