import { defineArea } from "#wow/areas/contract";
import { TALENTS_OPCODES } from "#wow/areas/talents/opcodes";
import {
  parseTalentsInfo,
  parseTalentWipeOffer,
} from "#wow/areas/talents/protocol";
import { talentsRuntime } from "#wow/areas/talents/runtime";
import { TalentsStore } from "#wow/areas/talents/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import { parseBuyFailed } from "#wow/protocol/vendor";

export const talentsArea = defineArea({
  name: "talents",
  opcodes: TALENTS_OPCODES,
  eventTypes: [
    "info",
    "points",
    "pet_info",
    "refused",
    "wipe_offer",
    "wipe_refused",
  ],
  store: (deps, core) => new TalentsStore(deps, core),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_TALENTS_INFO, (r) =>
      store.info(parseTalentsInfo(r)),
    );
    wire.on(GameOpcode.MSG_TALENT_WIPE_CONFIRM, (r) =>
      store.offer(parseTalentWipeOffer(r)),
    );
    wire.peek(GameOpcode.SMSG_BUY_FAILED, (r) =>
      store.buyFailed(parseBuyFailed(r)),
    );
  },
  runtime: talentsRuntime,
});
