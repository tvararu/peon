import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  selfstatePreResurrectBody,
  selfstateStandstateUpdateBody,
  selfstateStartMirrorTimerBody,
  selfstateStopMirrorTimerBody,
} from "#test-support/areas/selfstate";
import type { SelfstateEvent } from "#wow/areas/selfstate/store";
import type { Entity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PLAYER_FIELDS, UNIT_FIELDS } from "#wow/protocol/update-fields";

const SELF = 0x0e01n;
const OTHER = 0x0e02n;
const BYTES_1 = UNIT_FIELDS.BYTES_1.offset;
const FLAGS = PLAYER_FIELDS.FLAGS.offset;
const ALWAYS_STAND = 0x01 << 16;

function player(
  guid: bigint,
  fields: [number, number][],
  objectType: 3 | 4 = ObjectType.PLAYER,
): Entity {
  return {
    entry: 0,
    guid,
    name: undefined,
    objectType,
    position: undefined,
    rawFields: new Map(fields),
    scale: 1,
  };
}

function rigWith(now: () => number = () => 0) {
  const rig = areaRig("selfstate", { now, selfGuid: SELF });
  const events: SelfstateEvent[] = [];
  rig.handle.onEvent((event) => events.push(event));
  const update = (entity: Entity) =>
    rig.events.entity.emit({ changed: ["rawFields"], entity, type: "update" });
  return { events, rig, update };
}

function breath(valueMs: number, scale = -1) {
  return selfstateStartMirrorTimerBody({
    timer: 1,
    valueMs,
    maxMs: 180_000,
    scale,
    paused: 0,
    spellId: 0,
  });
}

function lows(events: readonly SelfstateEvent[]) {
  return events.filter((event) => event.type === "breath_low");
}

describe("selfstate runtime: self fields", () => {
  test("stand state starts from UNIT_FIELD_BYTES_1 byte 0 and follows it (AC Entities/Unit/UnitDefines.h:26)", () => {
    const { rig, events, update } = rigWith();
    try {
      rig.events.entity.emit({
        entity: player(SELF, [[BYTES_1, ALWAYS_STAND | 1]]),
        type: "appear",
      });
      expect(rig.handle.state().standState).toBe("sit");
      expect(events).toEqual([]);
      rig.inject(
        GameOpcode.SMSG_STANDSTATE_UPDATE,
        selfstateStandstateUpdateBody(0),
      );
      update(player(SELF, [[BYTES_1, ALWAYS_STAND]]));
      update(player(SELF, [[BYTES_1, 8]]));
      expect(rig.handle.state().standState).toBe("kneel");
      expect(events).toEqual([
        { type: "stand_changed", from: "sit", to: "stand" },
        { type: "stand_changed", from: "stand", to: "kneel" },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("another guid or a unit with the self guid is not read", () => {
    const { rig, update } = rigWith();
    try {
      update(player(OTHER, [[BYTES_1, 1]]));
      update(player(SELF, [[BYTES_1, 3]], ObjectType.UNIT));
      expect(rig.handle.state().standState).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("the ghost bit 0x10 in PLAYER_FLAGS clears ghostPending (AC Entities/Player/Player.h:463)", () => {
    const { rig, update } = rigWith();
    try {
      rig.inject(
        GameOpcode.SMSG_PRE_RESURRECT,
        selfstatePreResurrectBody(SELF),
      );
      update(player(SELF, [[FLAGS, 0x08]]));
      expect(rig.handle.state().ghostPending).toBe(true);
      update(player(SELF, [[FLAGS, 0x18]]));
      expect(rig.handle.state().ghostPending).toBe(false);
    } finally {
      rig.dispose();
    }
  });
});

describe("selfstate runtime: breath_low", () => {
  test("fires once when the draining breath falls to 10 s (AC Entities/Player/Player.cpp:909)", () => {
    jest.useFakeTimers();
    let clock = 1000;
    const { rig, events } = rigWith(() => clock);
    const advance = (ms: number) => {
      clock += ms;
      jest.advanceTimersByTime(ms);
    };
    try {
      rig.inject(GameOpcode.SMSG_START_MIRROR_TIMER, breath(30_000));
      advance(19_999);
      expect(lows(events)).toEqual([]);
      advance(1);
      expect(lows(events)).toEqual([
        { type: "breath_low", remainingMs: 10_000 },
      ]);
      advance(20_000);
      expect(lows(events)).toHaveLength(1);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("a stop cancels the deadline", () => {
    jest.useFakeTimers();
    let clock = 0;
    const { rig, events } = rigWith(() => clock);
    try {
      rig.inject(GameOpcode.SMSG_START_MIRROR_TIMER, breath(30_000));
      clock += 10_000;
      jest.advanceTimersByTime(10_000);
      rig.inject(
        GameOpcode.SMSG_STOP_MIRROR_TIMER,
        selfstateStopMirrorTimerBody(1),
      );
      clock += 30_000;
      jest.advanceTimersByTime(30_000);
      expect(lows(events)).toEqual([]);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("a start already under 10 s fires at once; a regenerating timer never fires (AC Entities/Player/Player.cpp:924,935)", () => {
    jest.useFakeTimers();
    const { rig, events } = rigWith();
    try {
      rig.inject(GameOpcode.SMSG_START_MIRROR_TIMER, breath(60_000, 10));
      jest.advanceTimersByTime(120_000);
      expect(lows(events)).toEqual([]);
      rig.inject(GameOpcode.SMSG_START_MIRROR_TIMER, breath(4000));
      expect(lows(events)).toEqual([{ type: "breath_low", remainingMs: 4000 }]);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });
});

describe("selfstate runtime: setStandState", () => {
  test("sends CMSG_STANDSTATECHANGE and resolves on SMSG_STANDSTATE_UPDATE (AC Handlers/MiscHandler.cpp:560-576)", async () => {
    const { rig } = rigWith();
    try {
      const pending = rig.handle.act.setStandState("sit");
      expect(rig.sent).toEqual([
        {
          opcode: GameOpcode.CMSG_STANDSTATECHANGE,
          body: new Uint8Array([1, 0, 0, 0]),
        },
      ]);
      rig.inject(
        GameOpcode.SMSG_STANDSTATE_UPDATE,
        selfstateStandstateUpdateBody(1),
      );
      expect(await pending).toEqual({ status: "ok" });
      expect(rig.handle.state().standState).toBe("sit");
    } finally {
      rig.dispose();
    }
  });

  test("a state the server refuses in silence is refused and sends nothing (AC Handlers/MiscHandler.cpp:565-574)", async () => {
    const { rig } = rigWith();
    try {
      expect(await rig.handle.act.setStandState("dead")).toEqual({
        status: "refused",
        reason: "invalid_state",
      });
      expect(await rig.handle.act.setStandState("sit_chair")).toEqual({
        status: "refused",
        reason: "invalid_state",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("the state the character already holds settles ok and sends nothing", async () => {
    const { rig } = rigWith();
    try {
      rig.inject(
        GameOpcode.SMSG_STANDSTATE_UPDATE,
        selfstateStandstateUpdateBody(1),
      );
      expect(await rig.handle.act.setStandState("sit")).toEqual({
        status: "ok",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("no reply in 2 s settles no_answer", async () => {
    jest.useFakeTimers();
    const { rig } = rigWith();
    try {
      const pending = rig.handle.act.setStandState("sleep");
      jest.advanceTimersByTime(2000);
      expect(await pending).toEqual({ status: "no_answer" });
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });
});
