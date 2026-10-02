import { COMPLAINTS_OPCODES } from "#wow/areas/complaints/opcodes";
import { parseComplainResult } from "#wow/areas/complaints/protocol";
import { complaintsRuntime } from "#wow/areas/complaints/runtime";
import { ComplaintStore } from "#wow/areas/complaints/store";
import { defineArea } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";

export const complaintsArea = defineArea({
  name: "complaints",
  opcodes: COMPLAINTS_OPCODES,
  eventTypes: ["complaint_received"],
  store: () => new ComplaintStore(),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_COMPLAIN_RESULT, (r) =>
      store.received(parseComplainResult(r)),
    );
  },
  runtime: complaintsRuntime,
});
