import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  selfstateMoveLandWalkBody,
  selfstateMoveSetHoverBody,
  selfstateMoveUnsetHoverBody,
  selfstateMoveWaterWalkBody,
} from "#test-support/areas/selfstate";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { SelfEvent } from "#wow/self-store";

const SELF = 0x0764n;
const OTHER = 0x0765n;

function rigWithEvents() {
  const rig = areaRig("selfstate", { selfGuid: SELF });
  const events: SelfEvent[] = [];
  rig.stores.self.onEvent((event) => events.push(event));
  return { events, rig };
}

describe("selfstate move flags", () => {
  test("SMSG_MOVE_WATER_WALK and SMSG_MOVE_LAND_WALK become move_flag self events (AC Entities/Unit/Unit.cpp:16297-16302)", () => {
    const { rig, events } = rigWithEvents();
    rig.inject(
      GameOpcode.SMSG_MOVE_WATER_WALK,
      selfstateMoveWaterWalkBody({ counter: 5, guid: SELF }),
    );
    rig.inject(
      GameOpcode.SMSG_MOVE_LAND_WALK,
      selfstateMoveLandWalkBody({ counter: 6, guid: SELF }),
    );
    expect(events).toEqual([
      { counter: 5, enable: true, flag: "water_walk", type: "move_flag" },
      { counter: 6, enable: false, flag: "water_walk", type: "move_flag" },
    ]);
    rig.dispose();
  });

  test("SMSG_MOVE_SET_HOVER and SMSG_MOVE_UNSET_HOVER become move_flag self events (AC Entities/Unit/Unit.cpp:16261-16268)", () => {
    const { rig, events } = rigWithEvents();
    rig.inject(
      GameOpcode.SMSG_MOVE_SET_HOVER,
      selfstateMoveSetHoverBody({ counter: 11, guid: SELF }),
    );
    rig.inject(
      GameOpcode.SMSG_MOVE_UNSET_HOVER,
      selfstateMoveUnsetHoverBody({ counter: 12, guid: SELF }),
    );
    expect(events).toEqual([
      { counter: 11, enable: true, flag: "hover", type: "move_flag" },
      { counter: 12, enable: false, flag: "hover", type: "move_flag" },
    ]);
    rig.dispose();
  });

  test("a flag packet for another guid gives no event", () => {
    const { rig, events } = rigWithEvents();
    rig.inject(
      GameOpcode.SMSG_MOVE_WATER_WALK,
      selfstateMoveWaterWalkBody({ counter: 5, guid: OTHER }),
    );
    rig.inject(
      GameOpcode.SMSG_MOVE_UNSET_HOVER,
      selfstateMoveUnsetHoverBody({ counter: 6, guid: OTHER }),
    );
    expect(events).toEqual([]);
    rig.dispose();
  });
});
