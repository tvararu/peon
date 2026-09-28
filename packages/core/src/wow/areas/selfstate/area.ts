import { defineArea } from "#wow/areas/contract";
import { SELFSTATE_OPCODES } from "#wow/areas/selfstate/opcodes";
import {
  FLAG_OPCODES,
  parseMirrorTimer,
  parseMultipleMoves,
  parsePreResurrect,
  parseStandState,
  parseStopMirrorTimer,
  parseTransferAborted,
} from "#wow/areas/selfstate/protocol";
import { selfstateRuntime } from "#wow/areas/selfstate/runtime";
import { SelfstateStore } from "#wow/areas/selfstate/store";
import { parseMoveCounter } from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";

export const selfstateArea = defineArea({
  name: "selfstate",
  opcodes: SELFSTATE_OPCODES,
  eventTypes: ["stand_changed", "mirror_timer", "breath_low", "ghost_pending"],
  store: (deps, core) => new SelfstateStore(deps, core),
  register: (wire, store) => {
    for (const [opcode, change] of FLAG_OPCODES)
      wire.on(opcode, (r) =>
        store.receiveMoveFlag(change, parseMoveCounter(r)),
      );
    wire.on(GameOpcode.SMSG_MULTIPLE_MOVES, (r) =>
      store.receiveMultipleMoves(parseMultipleMoves(r).entries),
    );
    wire.on(GameOpcode.SMSG_STANDSTATE_UPDATE, (r) =>
      store.receiveStandState(parseStandState(r)),
    );
    wire.on(GameOpcode.SMSG_START_MIRROR_TIMER, (r) =>
      store.receiveMirrorTimer(parseMirrorTimer(r)),
    );
    wire.on(GameOpcode.SMSG_STOP_MIRROR_TIMER, (r) =>
      store.receiveStopMirrorTimer(parseStopMirrorTimer(r)),
    );
    wire.on(GameOpcode.SMSG_PRE_RESURRECT, (r) =>
      store.receivePreResurrect(parsePreResurrect(r)),
    );
    wire.on(GameOpcode.SMSG_TRANSFER_ABORTED, (r) =>
      store.receiveTransferAborted(parseTransferAborted(r)),
    );
  },
  runtime: (ctx, store) => selfstateRuntime(ctx, store),
});
