import { defineArea } from "#wow/areas/contract";
import { REFERRAL_OPCODES } from "#wow/areas/referral/opcodes";
import {
  parseProposeLevelGrant,
  parseReferAFriendFailure,
} from "#wow/areas/referral/protocol";
import { referralRuntime } from "#wow/areas/referral/runtime";
import { ReferralStore } from "#wow/areas/referral/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const referralArea = defineArea({
  name: "referral",
  opcodes: REFERRAL_OPCODES,
  eventTypes: ["level_grant"],
  store: (deps) => new ReferralStore(deps),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_PROPOSE_LEVEL_GRANT, (reader) => {
      store.receiveProposal(parseProposeLevelGrant(reader));
    });
    wire.on(GameOpcode.SMSG_REFER_A_FRIEND_FAILURE, (reader) => {
      store.receiveFailure(parseReferAFriendFailure(reader));
    });
  },
  runtime: referralRuntime,
});
