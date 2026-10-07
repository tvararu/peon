import { defineArea, emptyStore } from "#wow/areas/contract";
import { REFERRAL_OPCODES } from "#wow/areas/referral/opcodes";

export const referralArea = defineArea({
  name: "referral",
  opcodes: REFERRAL_OPCODES,
  eventTypes: [],
  store: () => emptyStore(),
  register: () => undefined,
});
