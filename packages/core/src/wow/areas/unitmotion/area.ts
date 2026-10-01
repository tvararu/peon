import { type AreaRegister, defineArea } from "#wow/areas/contract";
import { UNITMOTION_OPCODES } from "#wow/areas/unitmotion/opcodes";
import { parseSplineUnitState } from "#wow/areas/unitmotion/protocol";
import { unitmotionRuntime } from "#wow/areas/unitmotion/runtime";
import { UnitmotionStore } from "#wow/areas/unitmotion/store";
import { GameOpcode } from "#wow/protocol/opcodes";

function registerSpeeds(wire: AreaRegister, store: UnitmotionStore): void {
  wire.on(GameOpcode.SMSG_SPLINE_SET_WALK_SPEED, (r) =>
    store.receiveSpline(
      parseSplineUnitState(GameOpcode.SMSG_SPLINE_SET_WALK_SPEED, r),
    ),
  );
  wire.on(GameOpcode.SMSG_SPLINE_SET_RUN_SPEED, (r) =>
    store.receiveSpline(
      parseSplineUnitState(GameOpcode.SMSG_SPLINE_SET_RUN_SPEED, r),
    ),
  );
  wire.on(GameOpcode.SMSG_SPLINE_SET_RUN_BACK_SPEED, (r) =>
    store.receiveSpline(
      parseSplineUnitState(GameOpcode.SMSG_SPLINE_SET_RUN_BACK_SPEED, r),
    ),
  );
  wire.on(GameOpcode.SMSG_SPLINE_SET_SWIM_SPEED, (r) =>
    store.receiveSpline(
      parseSplineUnitState(GameOpcode.SMSG_SPLINE_SET_SWIM_SPEED, r),
    ),
  );
  wire.on(GameOpcode.SMSG_SPLINE_SET_SWIM_BACK_SPEED, (r) =>
    store.receiveSpline(
      parseSplineUnitState(GameOpcode.SMSG_SPLINE_SET_SWIM_BACK_SPEED, r),
    ),
  );
  wire.on(GameOpcode.SMSG_SPLINE_SET_FLIGHT_SPEED, (r) =>
    store.receiveSpline(
      parseSplineUnitState(GameOpcode.SMSG_SPLINE_SET_FLIGHT_SPEED, r),
    ),
  );
  wire.on(GameOpcode.SMSG_SPLINE_SET_FLIGHT_BACK_SPEED, (r) =>
    store.receiveSpline(
      parseSplineUnitState(GameOpcode.SMSG_SPLINE_SET_FLIGHT_BACK_SPEED, r),
    ),
  );
  wire.on(GameOpcode.SMSG_SPLINE_SET_TURN_RATE, (r) =>
    store.receiveSpline(
      parseSplineUnitState(GameOpcode.SMSG_SPLINE_SET_TURN_RATE, r),
    ),
  );
  wire.on(GameOpcode.SMSG_SPLINE_SET_PITCH_RATE, (r) =>
    store.receiveSpline(
      parseSplineUnitState(GameOpcode.SMSG_SPLINE_SET_PITCH_RATE, r),
    ),
  );
}

function registerToggles(wire: AreaRegister, store: UnitmotionStore): void {
  wire.on(GameOpcode.SMSG_SPLINE_MOVE_UNSET_HOVER, (r) =>
    store.receiveSpline(
      parseSplineUnitState(GameOpcode.SMSG_SPLINE_MOVE_UNSET_HOVER, r),
    ),
  );
  wire.on(GameOpcode.SMSG_SPLINE_MOVE_GRAVITY_ENABLE, (r) =>
    store.receiveSpline(
      parseSplineUnitState(GameOpcode.SMSG_SPLINE_MOVE_GRAVITY_ENABLE, r),
    ),
  );
  wire.on(GameOpcode.SMSG_SPLINE_MOVE_ROOT, (r) =>
    store.receiveSpline(
      parseSplineUnitState(GameOpcode.SMSG_SPLINE_MOVE_ROOT, r),
    ),
  );
  wire.on(GameOpcode.SMSG_SPLINE_MOVE_UNROOT, (r) =>
    store.receiveSpline(
      parseSplineUnitState(GameOpcode.SMSG_SPLINE_MOVE_UNROOT, r),
    ),
  );
  wire.on(GameOpcode.SMSG_SPLINE_MOVE_SET_WALK_MODE, (r) =>
    store.receiveSpline(
      parseSplineUnitState(GameOpcode.SMSG_SPLINE_MOVE_SET_WALK_MODE, r),
    ),
  );
  wire.on(GameOpcode.SMSG_SPLINE_MOVE_SET_RUN_MODE, (r) =>
    store.receiveSpline(
      parseSplineUnitState(GameOpcode.SMSG_SPLINE_MOVE_SET_RUN_MODE, r),
    ),
  );
  wire.on(GameOpcode.SMSG_SPLINE_MOVE_START_SWIM, (r) =>
    store.receiveSpline(
      parseSplineUnitState(GameOpcode.SMSG_SPLINE_MOVE_START_SWIM, r),
    ),
  );
  wire.on(GameOpcode.SMSG_SPLINE_MOVE_STOP_SWIM, (r) =>
    store.receiveSpline(
      parseSplineUnitState(GameOpcode.SMSG_SPLINE_MOVE_STOP_SWIM, r),
    ),
  );
}

export const unitmotionArea = defineArea({
  name: "unitmotion",
  opcodes: UNITMOTION_OPCODES,
  eventTypes: ["speed", "flag", "removed"],
  store: (deps, core) => new UnitmotionStore(deps, core),
  register: (wire, store) => {
    registerSpeeds(wire, store);
    registerToggles(wire, store);
  },
  runtime: unitmotionRuntime,
});
