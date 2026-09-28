import { defineArea } from "#wow/areas/contract";
import { SELFSTATE_OPCODES } from "#wow/areas/selfstate/opcodes";
import { FLAG_OPCODES } from "#wow/areas/selfstate/protocol";
import { SelfstateStore } from "#wow/areas/selfstate/store";
import { parseMoveCounter } from "#wow/protocol/movement";

export const selfstateArea = defineArea({
  name: "selfstate",
  opcodes: SELFSTATE_OPCODES,
  eventTypes: [],
  store: (deps, core) => new SelfstateStore(deps, core),
  register: (wire, store) => {
    for (const [opcode, change] of FLAG_OPCODES)
      wire.on(opcode, (r) =>
        store.receiveMoveFlag(change, parseMoveCounter(r)),
      );
  },
});
