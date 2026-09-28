import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  selfstateMoveLandWalkBody,
  selfstateMoveSetHoverBody,
  selfstateMoveUnsetHoverBody,
  selfstateMoveWaterWalkBody,
  selfstatePreResurrectBody,
  selfstateStandstateUpdateBody,
  selfstateStartMirrorTimerBody,
  selfstateStopMirrorTimerBody,
} from "#test-support/areas/selfstate";
import type { SelfstateEvent } from "#wow/areas/selfstate/store";
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

function rigWithAreaEvents(now = () => 0) {
  const rig = areaRig("selfstate", { now, selfGuid: SELF });
  const events: SelfstateEvent[] = [];
  rig.handle.onEvent((event) => events.push(event));
  return { events, rig };
}

const BREATH = {
  timer: 1,
  valueMs: 180_000,
  maxMs: 180_000,
  scale: -1,
  paused: 0,
  spellId: 0,
};
const FATIGUE = {
  timer: 0,
  valueMs: 30_000,
  maxMs: 60_000,
  scale: 10,
  paused: 0,
  spellId: 0,
};

describe("selfstate store", () => {
  test("SMSG_STANDSTATE_UPDATE sets the stand state and fires stand_changed on a change only (AC Entities/Unit/Unit.cpp:12690-12701)", () => {
    const { rig, events } = rigWithAreaEvents();
    try {
      expect(rig.handle.state().standState).toBeUndefined();
      rig.inject(
        GameOpcode.SMSG_STANDSTATE_UPDATE,
        selfstateStandstateUpdateBody(1),
      );
      rig.inject(
        GameOpcode.SMSG_STANDSTATE_UPDATE,
        selfstateStandstateUpdateBody(1),
      );
      rig.inject(
        GameOpcode.SMSG_STANDSTATE_UPDATE,
        selfstateStandstateUpdateBody(0),
      );
      expect(rig.handle.state().standState).toBe("stand");
      expect(events).toEqual([
        { type: "stand_changed", from: undefined, to: "sit" },
        { type: "stand_changed", from: "sit", to: "stand" },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_START_MIRROR_TIMER fills the timer and SMSG_STOP_MIRROR_TIMER clears it (AC Server/Packets/MiscPackets.cpp:101-126)", () => {
    const { rig, events } = rigWithAreaEvents(() => 4200);
    try {
      rig.inject(
        GameOpcode.SMSG_START_MIRROR_TIMER,
        selfstateStartMirrorTimerBody(BREATH),
      );
      const breath = {
        valueMs: 180_000,
        maxMs: 180_000,
        scale: -1,
        paused: false,
        spellId: 0,
        at: 4200,
      };
      expect(rig.handle.state().timers).toEqual({ breath });
      rig.inject(
        GameOpcode.SMSG_STOP_MIRROR_TIMER,
        selfstateStopMirrorTimerBody(1),
      );
      expect(rig.handle.state().timers).toEqual({});
      expect(events).toEqual([
        {
          type: "mirror_timer",
          timer: "breath",
          change: "started",
          value: breath,
        },
        { type: "mirror_timer", timer: "breath", change: "stopped" },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("the death stop set leaves all three timers empty (AC Entities/Player/Player.h:2088-2093)", () => {
    const { rig, events } = rigWithAreaEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_START_MIRROR_TIMER,
        selfstateStartMirrorTimerBody(BREATH),
      );
      rig.inject(
        GameOpcode.SMSG_START_MIRROR_TIMER,
        selfstateStartMirrorTimerBody(FATIGUE),
      );
      expect(Object.keys(rig.handle.state().timers).sort()).toEqual([
        "breath",
        "fatigue",
      ]);
      for (const timer of [0, 1, 2])
        rig.inject(
          GameOpcode.SMSG_STOP_MIRROR_TIMER,
          selfstateStopMirrorTimerBody(timer),
        );
      expect(rig.handle.state().timers).toEqual({});
      expect(
        events
          .filter((e) => e.type === "mirror_timer" && e.change === "stopped")
          .map((e) => e.type === "mirror_timer" && e.timer),
      ).toEqual(["fatigue", "breath"]);
    } finally {
      rig.dispose();
    }
  });

  test("an unknown timer id changes nothing", () => {
    const { rig, events } = rigWithAreaEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_START_MIRROR_TIMER,
        selfstateStartMirrorTimerBody({ ...BREATH, timer: 3 }),
      );
      rig.inject(
        GameOpcode.SMSG_STOP_MIRROR_TIMER,
        selfstateStopMirrorTimerBody(3),
      );
      expect(rig.handle.state().timers).toEqual({});
      expect(events).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_PRE_RESURRECT for the self guid sets ghostPending; another guid does nothing (AC Entities/Player/Player.cpp:4508-4512)", () => {
    const { rig, events } = rigWithAreaEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_PRE_RESURRECT,
        selfstatePreResurrectBody(OTHER),
      );
      expect(rig.handle.state().ghostPending).toBe(false);
      expect(events).toEqual([]);
      rig.inject(
        GameOpcode.SMSG_PRE_RESURRECT,
        selfstatePreResurrectBody(SELF),
      );
      expect(rig.handle.state().ghostPending).toBe(true);
      expect(events).toEqual([{ type: "ghost_pending" }]);
    } finally {
      rig.dispose();
    }
  });
});
