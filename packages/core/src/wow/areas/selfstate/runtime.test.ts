import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  selfstateCorpseMapPositionQueryResponseBody,
  selfstatePreResurrectBody,
  selfstateStandstateUpdateBody,
  selfstateStartMirrorTimerBody,
  selfstateStopMirrorTimerBody,
} from "#test-support/areas/selfstate";
import { spell } from "#test-support/spell-fixtures";
import type { SelfstateEvent } from "#wow/areas/selfstate/store";
import type { Entity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PLAYER_FIELDS, UNIT_FIELDS } from "#wow/protocol/update-fields";
import type { SpellCatalog } from "#wow/spell-catalog";

const SELF = 0x0e01n;
const OTHER = 0x0e02n;
const BYTES_1 = UNIT_FIELDS.BYTES_1.offset;
const FLAGS = PLAYER_FIELDS.FLAGS.offset;
const HEALTH = UNIT_FIELDS.HEALTH.offset;
const SELF_RES = PLAYER_FIELDS.SELF_RES_SPELL.offset;
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

function rigWithSelf(entity: Entity | undefined) {
  const held = { current: entity };
  const rig = areaRig("selfstate", {
    getEntity: (guid) => (guid === SELF ? held.current : undefined),
    selfGuid: SELF,
  });
  const events: SelfstateEvent[] = [];
  rig.handle.onEvent((event) => events.push(event));
  const update = (next: Entity) => {
    held.current = next;
    rig.events.entity.emit({
      changed: ["rawFields"],
      entity: next,
      type: "update",
    });
  };
  return { events, held, rig, update };
}

const selfRes = (events: readonly SelfstateEvent[]) =>
  events.filter((event) => event.type === "self_res_available");

describe("selfstate runtime: self-resurrection spell", () => {
  test("PLAYER_SELF_RES_SPELL turning non-zero fires self_res_available once with the spell name (AC Entities/Player/Player.cpp:1133)", () => {
    const { rig, events, update } = rigWithSelf(undefined);
    try {
      rig.stores.combat.setCatalog({
        get: (id: number) =>
          id === 21_169 ? { ...spell(), id, name: "Reincarnation" } : undefined,
      } as unknown as SpellCatalog);
      update(player(SELF, [[SELF_RES, 0]]));
      expect(rig.handle.state().selfResSpell).toBe(0);
      expect(selfRes(events)).toEqual([]);
      update(player(SELF, [[SELF_RES, 21_169]]));
      update(player(SELF, [[SELF_RES, 21_169]]));
      expect(rig.handle.state().selfResSpell).toBe(21_169);
      expect(selfRes(events)).toEqual([
        { name: "Reincarnation", spellId: 21_169, type: "self_res_available" },
      ]);
      update(player(SELF, [[SELF_RES, 0]]));
      expect(rig.handle.state().selfResSpell).toBe(0);
      update(player(SELF, [[SELF_RES, 20_707]]));
      expect(selfRes(events)).toEqual([
        { name: "Reincarnation", spellId: 21_169, type: "self_res_available" },
        { name: undefined, spellId: 20_707, type: "self_res_available" },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("another player's field is not read", () => {
    const { rig, events, update } = rigWithSelf(undefined);
    try {
      update(player(OTHER, [[SELF_RES, 21_169]]));
      expect(rig.handle.state().selfResSpell).toBe(0);
      expect(selfRes(events)).toEqual([]);
    } finally {
      rig.dispose();
    }
  });
});

describe("selfstate runtime: selfResurrect", () => {
  test("an alive character is refused not_dead and nothing is sent", async () => {
    const { rig } = rigWithSelf(
      player(SELF, [
        [HEALTH, 100],
        [FLAGS, 0],
        [SELF_RES, 21_169],
      ]),
    );
    try {
      expect(await rig.handle.act.selfResurrect()).toEqual({
        reason: "not_dead",
        status: "refused",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a dead character with no self-res spell is refused no_self_res and nothing is sent", async () => {
    const { rig } = rigWithSelf(
      player(SELF, [
        [HEALTH, 0],
        [FLAGS, 0],
        [SELF_RES, 0],
      ]),
    );
    try {
      expect(await rig.handle.act.selfResurrect()).toEqual({
        reason: "no_self_res",
        status: "refused",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a dead character sends an empty CMSG_SELF_RES and resolves when health turns positive (AC Handlers/SpellHandler.cpp:707-721)", async () => {
    const { rig, update } = rigWithSelf(
      player(SELF, [
        [HEALTH, 0],
        [FLAGS, 0],
        [SELF_RES, 21_169],
      ]),
    );
    try {
      const pending = rig.handle.act.selfResurrect();
      expect(rig.sent).toEqual([
        { body: new Uint8Array(), opcode: GameOpcode.CMSG_SELF_RES },
      ]);
      update(
        player(SELF, [
          [HEALTH, 40],
          [FLAGS, 0],
          [SELF_RES, 0],
        ]),
      );
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("a ghost is alive again once the ghost bit clears with health", async () => {
    const { rig, update } = rigWithSelf(
      player(SELF, [
        [HEALTH, 1],
        [FLAGS, 0x10],
        [SELF_RES, 21_169],
      ]),
    );
    try {
      const pending = rig.handle.act.selfResurrect();
      expect(rig.sent).toHaveLength(1);
      update(
        player(SELF, [
          [HEALTH, 1],
          [FLAGS, 0x10],
          [SELF_RES, 21_169],
        ]),
      );
      update(
        player(SELF, [
          [HEALTH, 30],
          [FLAGS, 0],
          [SELF_RES, 0],
        ]),
      );
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("silence for 5 s settles no_answer and releases the wait (AC Handlers/SpellHandler.cpp:713-716)", async () => {
    jest.useFakeTimers();
    const { rig, update } = rigWithSelf(
      player(SELF, [
        [HEALTH, 0],
        [FLAGS, 0],
        [SELF_RES, 21_169],
      ]),
    );
    try {
      const pending = rig.handle.act.selfResurrect();
      jest.advanceTimersByTime(4999);
      update(
        player(SELF, [
          [HEALTH, 0],
          [FLAGS, 0],
          [SELF_RES, 21_169],
        ]),
      );
      jest.advanceTimersByTime(1);
      expect(await pending).toEqual({ status: "no_answer" });
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("disposing the area rejects the pending wait and clears its timer", async () => {
    jest.useFakeTimers();
    const { rig } = rigWithSelf(
      player(SELF, [
        [HEALTH, 0],
        [FLAGS, 0],
        [SELF_RES, 21_169],
      ]),
    );
    try {
      const pending = rig.handle.act.selfResurrect();
      rig.dispose();
      const outcome = await pending.then(
        () => "resolved",
        () => "rejected",
      );
      expect(outcome).toBe("rejected");
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("selfstate runtime: queryCorpseMapPosition", () => {
  test("sends the query and resolves with the four floats (AC Handlers/QueryHandler.cpp:399-410)", async () => {
    const { rig } = rigWithSelf(undefined);
    try {
      const pending = rig.handle.act.queryCorpseMapPosition();
      expect(rig.sent).toEqual([
        {
          body: new Uint8Array(4),
          opcode: GameOpcode.CMSG_CORPSE_MAP_POSITION_QUERY,
        },
      ]);
      rig.inject(
        GameOpcode.SMSG_CORPSE_MAP_POSITION_QUERY_RESPONSE,
        selfstateCorpseMapPositionQueryResponseBody(),
      );
      expect(await pending).toEqual({
        position: [0, 0, 0, 0],
        status: "ok",
      });
    } finally {
      rig.dispose();
    }
  });

  test("a reply that arrives with nobody asking is read without error", () => {
    const { rig } = rigWithSelf(undefined);
    try {
      rig.inject(
        GameOpcode.SMSG_CORPSE_MAP_POSITION_QUERY_RESPONSE,
        selfstateCorpseMapPositionQueryResponseBody(),
      );
    } finally {
      rig.dispose();
    }
  });

  test("no reply in 3 s settles no_answer", async () => {
    jest.useFakeTimers();
    const { rig } = rigWithSelf(undefined);
    try {
      const pending = rig.handle.act.queryCorpseMapPosition();
      jest.advanceTimersByTime(3000);
      expect(await pending).toEqual({ status: "no_answer" });
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("disposing the area rejects a pending query", async () => {
    jest.useFakeTimers();
    const { rig } = rigWithSelf(undefined);
    try {
      const pending = rig.handle.act.queryCorpseMapPosition();
      rig.dispose();
      const outcome = await pending.then(
        () => "resolved",
        () => "rejected",
      );
      expect(outcome).toBe("rejected");
    } finally {
      jest.useRealTimers();
    }
  });
});
