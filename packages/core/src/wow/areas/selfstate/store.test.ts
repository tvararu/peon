import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  selfstateMoveFeatherFallBody,
  selfstateMoveGravityDisableBody,
  selfstateMoveGravityEnableBody,
  selfstateMoveLandWalkBody,
  selfstateMoveNormalFallBody,
  selfstateMoveSetCollisionHeightBody,
  selfstateMoveSetHoverBody,
  selfstateMoveUnsetHoverBody,
  selfstateMoveWaterWalkBody,
  selfstateMultipleMovesBody,
  selfstatePreResurrectBody,
  selfstateStandstateUpdateBody,
  selfstateStartMirrorTimerBody,
  selfstateStopMirrorTimerBody,
  selfstateTransferAbortedBody,
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
      {
        counter: 5,
        enable: true,
        flag: "water_walk",
        type: "move_flag",
        guid: SELF,
      },
      {
        counter: 6,
        enable: false,
        flag: "water_walk",
        type: "move_flag",
        guid: SELF,
      },
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
      {
        counter: 11,
        enable: true,
        flag: "hover",
        type: "move_flag",
        guid: SELF,
      },
      {
        counter: 12,
        enable: false,
        flag: "hover",
        type: "move_flag",
        guid: SELF,
      },
    ]);
    rig.dispose();
  });

  test("a flag packet for another guid forwards with its guid", () => {
    const { rig, events } = rigWithEvents();
    rig.inject(
      GameOpcode.SMSG_MOVE_WATER_WALK,
      selfstateMoveWaterWalkBody({ counter: 5, guid: OTHER }),
    );
    rig.inject(
      GameOpcode.SMSG_MOVE_UNSET_HOVER,
      selfstateMoveUnsetHoverBody({ counter: 6, guid: OTHER }),
    );
    expect(events).toEqual([
      {
        counter: 5,
        enable: true,
        flag: "water_walk",
        type: "move_flag",
        guid: OTHER,
      },
      {
        counter: 6,
        enable: false,
        flag: "hover",
        type: "move_flag",
        guid: OTHER,
      },
    ]);
    rig.dispose();
  });
});

describe("selfstate feather fall, gravity and the login compound", () => {
  test("SMSG_MOVE_FEATHER_FALL and SMSG_MOVE_NORMAL_FALL become move_flag self events (AC Entities/Unit/Unit.cpp:16199-16214)", () => {
    const { rig, events } = rigWithEvents();
    rig.inject(
      GameOpcode.SMSG_MOVE_FEATHER_FALL,
      selfstateMoveFeatherFallBody({ counter: 3, guid: SELF }),
    );
    rig.inject(
      GameOpcode.SMSG_MOVE_NORMAL_FALL,
      selfstateMoveNormalFallBody({ counter: 4, guid: SELF }),
    );
    expect(events).toEqual([
      {
        counter: 3,
        enable: true,
        flag: "feather_fall",
        type: "move_flag",
        guid: SELF,
      },
      {
        counter: 4,
        enable: false,
        flag: "feather_fall",
        type: "move_flag",
        guid: SELF,
      },
    ]);
    rig.dispose();
  });

  test("SMSG_MOVE_GRAVITY_DISABLE and SMSG_MOVE_GRAVITY_ENABLE become move_flag self events (AC Entities/Unit/Unit.cpp:16103-16114)", () => {
    const { rig, events } = rigWithEvents();
    rig.inject(
      GameOpcode.SMSG_MOVE_GRAVITY_DISABLE,
      selfstateMoveGravityDisableBody({ counter: 8, guid: SELF }),
    );
    rig.inject(
      GameOpcode.SMSG_MOVE_GRAVITY_ENABLE,
      selfstateMoveGravityEnableBody({ counter: 9, guid: SELF }),
    );
    rig.inject(
      GameOpcode.SMSG_MOVE_GRAVITY_DISABLE,
      selfstateMoveGravityDisableBody({ counter: 10, guid: OTHER }),
    );
    expect(events).toEqual([
      {
        counter: 8,
        enable: true,
        flag: "gravity_off",
        type: "move_flag",
        guid: SELF,
      },
      {
        counter: 9,
        enable: false,
        flag: "gravity_off",
        type: "move_flag",
        guid: SELF,
      },
      {
        counter: 10,
        enable: true,
        flag: "gravity_off",
        type: "move_flag",
        guid: OTHER,
      },
    ]);
    rig.dispose();
  });

  test("SMSG_MULTIPLE_MOVES gives one self event per entry in wire order, each with its own counter (AC Entities/Player/Player.cpp:11866-11912)", () => {
    const { rig, events } = rigWithEvents();
    rig.inject(
      GameOpcode.SMSG_MULTIPLE_MOVES,
      selfstateMultipleMovesBody([
        { counter: 1, guid: SELF, opcode: GameOpcode.SMSG_FORCE_MOVE_ROOT },
        { counter: 2, guid: SELF, opcode: GameOpcode.SMSG_MOVE_FEATHER_FALL },
        { counter: 3, guid: SELF, opcode: GameOpcode.SMSG_MOVE_WATER_WALK },
        { counter: 4, guid: SELF, opcode: GameOpcode.SMSG_MOVE_SET_HOVER },
      ]),
    );
    expect(events).toEqual([
      { counter: 1, guid: SELF, type: "force_root" },
      {
        counter: 2,
        enable: true,
        flag: "feather_fall",
        type: "move_flag",
        guid: SELF,
      },
      {
        counter: 3,
        enable: true,
        flag: "water_walk",
        type: "move_flag",
        guid: SELF,
      },
      {
        counter: 4,
        enable: true,
        flag: "hover",
        type: "move_flag",
        guid: SELF,
      },
    ]);
    rig.dispose();
  });

  test("SMSG_MULTIPLE_MOVES forwards a non-self flag entry and skips an unknown inner opcode", () => {
    const { rig, events } = rigWithEvents();
    rig.inject(
      GameOpcode.SMSG_MULTIPLE_MOVES,
      selfstateMultipleMovesBody([
        { counter: 1, guid: OTHER, opcode: GameOpcode.SMSG_FORCE_MOVE_ROOT },
        {
          counter: 2,
          extra: [0, 0, 0x80, 0x3f],
          guid: SELF,
          opcode: GameOpcode.SMSG_MOVE_SET_COLLISION_HGT,
        },
        { counter: 3, guid: SELF, opcode: GameOpcode.SMSG_MOVE_WATER_WALK },
        { counter: 4, guid: OTHER, opcode: GameOpcode.SMSG_MOVE_SET_HOVER },
      ]),
    );
    expect(events).toEqual([
      {
        counter: 3,
        enable: true,
        flag: "water_walk",
        type: "move_flag",
        guid: SELF,
      },
      {
        counter: 4,
        enable: true,
        flag: "hover",
        type: "move_flag",
        guid: OTHER,
      },
    ]);
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

describe("selfstate transfer aborted", () => {
  test("SMSG_TRANSFER_ABORTED records the abort and emits transfer_aborted (AC Entities/Player/Player.cpp:11956-11972)", () => {
    const { rig, events } = rigWithAreaEvents(() => 9000);
    try {
      rig.inject(
        GameOpcode.SMSG_TRANSFER_ABORTED,
        selfstateTransferAbortedBody({ mapId: 36, reason: 4 }),
      );
      expect(rig.handle.state().lastTransferAbort).toEqual({
        arg: undefined,
        at: 9000,
        mapId: 36,
        reason: 4,
      });
      expect(events).toContainEqual({
        arg: undefined,
        at: 9000,
        mapId: 36,
        reason: 4,
        type: "transfer_aborted",
      });
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_TRANSFER_ABORTED fires one area event with the arg reason (AC Entities/Player/Player.cpp:11964-11970)", () => {
    const { rig, events } = rigWithAreaEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_TRANSFER_ABORTED,
        selfstateTransferAbortedBody({ arg: 2, mapId: 631, reason: 8 }),
      );
      expect(events).toEqual([
        { arg: 2, at: 0, mapId: 631, reason: 8, type: "transfer_aborted" },
      ]);
    } finally {
      rig.dispose();
    }
  });
});

describe("selfstate collision height", () => {
  test("SMSG_MOVE_SET_COLLISION_HGT stores the height and forwards collision_height to control (AC Entities/Unit/Unit.cpp:10272-10275)", () => {
    const { rig, events } = rigWithEvents();
    rig.inject(
      GameOpcode.SMSG_MOVE_SET_COLLISION_HGT,
      selfstateMoveSetCollisionHeightBody({
        counter: 5,
        guid: SELF,
        height: 3.1,
      }),
    );
    expect(rig.handle.state().collisionHeight).toBeCloseTo(3.1, 4);
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event?.type).toBe("collision_height");
    if (event?.type !== "collision_height") throw new Error("wrong event");
    expect(event.counter).toBe(5);
    expect(event.height).toBeCloseTo(3.1, 4);
    rig.dispose();
  });

  test("a collision height packet for another guid stores and forwards nothing", () => {
    const { rig, events } = rigWithEvents();
    rig.inject(
      GameOpcode.SMSG_MOVE_SET_COLLISION_HGT,
      selfstateMoveSetCollisionHeightBody({
        counter: 6,
        guid: OTHER,
        height: 1.5,
      }),
    );
    expect(rig.handle.state().collisionHeight).toBeUndefined();
    expect(events).toEqual([]);
    rig.dispose();
  });
});
