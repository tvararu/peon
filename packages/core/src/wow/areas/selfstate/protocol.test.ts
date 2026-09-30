import { describe, expect, test } from "bun:test";
import {
  selfstateCorpseMapPositionQueryResponseBody,
  selfstateForcePitchRateChangeBody,
  selfstateMoveSetCollisionHeightBody,
  selfstateMultipleMovesBody,
  selfstatePreResurrectBody,
  selfstateStandstateUpdateBody,
  selfstateStartMirrorTimerBody,
  selfstateStopMirrorTimerBody,
  selfstateTransferAbortedBody,
} from "#test-support/areas/selfstate";
import { must } from "#test-support/must";
import {
  buildCorpseMapPositionQuery,
  buildStandStateChange,
  MIRROR_TIMERS,
  parseCollisionHeight,
  parseCorpseMapPosition,
  parseMirrorTimer,
  parseMultipleMoves,
  parsePreResurrect,
  parseStandState,
  parseStopMirrorTimer,
  parseTransferAborted,
  STAND_STATES,
  TRANSFER_ABORT_REASONS,
} from "#wow/areas/selfstate/protocol";
import { parseForceSpeed, speedAckFor } from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const read = (bytes: Uint8Array) => new PacketReader(bytes);

describe("selfstate protocol", () => {
  test("SMSG_START_MIRROR_TIMER reads a draining breath timer with a signed scale (AC Server/Packets/MiscPackets.cpp:101-111, Entities/Player/Player.cpp:909)", () => {
    const body = selfstateStartMirrorTimerBody({
      timer: 1,
      valueMs: 180_000,
      maxMs: 180_000,
      scale: -1,
      paused: 0,
      spellId: 0,
    });
    expect(hex(body)).toBe("0100000020bf020020bf0200ffffffff0000000000");
    const r = read(body);
    expect(parseMirrorTimer(r)).toEqual({
      timer: 1,
      valueMs: 180_000,
      maxMs: 180_000,
      scale: -1,
      paused: false,
      spellId: 0,
    });
    expect(r.remaining).toBe(0);
  });

  test("SMSG_START_MIRROR_TIMER reads a regenerating fatigue timer (AC Entities/Player/Player.cpp:973)", () => {
    const body = selfstateStartMirrorTimerBody({
      timer: 0,
      valueMs: 30_000,
      maxMs: 60_000,
      scale: 10,
      paused: 1,
      spellId: 7,
    });
    expect(parseMirrorTimer(read(body))).toEqual({
      timer: 0,
      valueMs: 30_000,
      maxMs: 60_000,
      scale: 10,
      paused: true,
      spellId: 7,
    });
  });

  test("the timer ids are AzerothCore's fatigue 0, breath 1, fire 2 (AC Entities/Player/Player.h:557-562)", () => {
    expect(MIRROR_TIMERS).toEqual(["fatigue", "breath", "fire"]);
  });

  test("SMSG_STOP_MIRROR_TIMER reads the timer id (AC Server/Packets/MiscPackets.cpp:121-126)", () => {
    const body = selfstateStopMirrorTimerBody(2);
    expect(hex(body)).toBe("02000000");
    expect(parseStopMirrorTimer(read(body))).toBe(2);
  });

  test("SMSG_STANDSTATE_UPDATE reads one byte (AC Entities/Unit/Unit.cpp:12690-12701)", () => {
    const body = selfstateStandstateUpdateBody(8);
    expect(hex(body)).toBe("08");
    expect(parseStandState(read(body))).toBe(8);
  });

  test("CMSG_STANDSTATECHANGE writes the state as a uint32 (AC Handlers/MiscHandler.cpp:560-563)", () => {
    expect(hex(buildStandStateChange("sit"))).toBe("01000000");
    expect(hex(buildStandStateChange("kneel"))).toBe("08000000");
    expect(STAND_STATES.stand).toBe(0);
    expect(STAND_STATES.sleep).toBe(3);
    expect(STAND_STATES.dead).toBe(7);
  });

  test("SMSG_PRE_RESURRECT reads a packed guid (AC Entities/Player/Player.cpp:4508-4512)", () => {
    const body = selfstatePreResurrectBody(0x0e01n);
    expect(hex(body)).toBe("03010e");
    expect(parsePreResurrect(read(body))).toBe(0x0e01n);
  });

  test("SMSG_MULTIPLE_MOVES ghost login: one water walk entry (AC Entities/Player/Player.cpp:11866-11912)", () => {
    const body = selfstateMultipleMovesBody([
      { counter: 5, guid: 0x0764n, opcode: GameOpcode.SMSG_MOVE_WATER_WALK },
    ]);
    expect(hex(body)).toBe("0a00000009de0003640705000000");
    expect(parseMultipleMoves(read(body))).toEqual({
      entries: [
        { counter: 5, guid: 0x0764n, opcode: GameOpcode.SMSG_MOVE_WATER_WALK },
      ],
      skipped: [],
    });
  });

  test("SMSG_MULTIPLE_MOVES full case: root, feather fall, water walk and hover in wire order (AC Entities/Player/Player.cpp:11866-11912)", () => {
    const guid = 0x0700_0000_0000_0764n;
    const opcodes = [
      GameOpcode.SMSG_FORCE_MOVE_ROOT,
      GameOpcode.SMSG_MOVE_FEATHER_FALL,
      GameOpcode.SMSG_MOVE_WATER_WALK,
      GameOpcode.SMSG_MOVE_SET_HOVER,
    ];
    expect(opcodes).toEqual([0xe8, 0xf2, 0xde, 0xf4]);
    const entries = opcodes.map((opcode, i) => ({
      counter: 1 + i,
      guid,
      opcode,
    }));
    const r = read(selfstateMultipleMovesBody(entries));
    expect(parseMultipleMoves(r)).toEqual({ entries, skipped: [] });
    expect(r.remaining).toBe(0);
  });

  test("SMSG_MULTIPLE_MOVES skips an unknown inner opcode by its length and reports it", () => {
    const body = selfstateMultipleMovesBody([
      {
        counter: 1,
        extra: [0, 0, 0x80, 0x3f],
        guid: 0x0764n,
        opcode: GameOpcode.SMSG_MOVE_SET_COLLISION_HGT,
      },
      { counter: 2, guid: 0x0764n, opcode: GameOpcode.SMSG_MOVE_WATER_WALK },
    ]);
    expect(parseMultipleMoves(read(body))).toEqual({
      entries: [
        { counter: 2, guid: 0x0764n, opcode: GameOpcode.SMSG_MOVE_WATER_WALK },
      ],
      skipped: [GameOpcode.SMSG_MOVE_SET_COLLISION_HGT],
    });
  });
});

describe("SMSG_TRANSFER_ABORTED (AC Entities/Player/Player.cpp:11956-11972)", () => {
  test("reasons 7, 8 and 9 carry a u8 arg after the map and reason", () => {
    expect(TRANSFER_ABORT_REASONS.insuf_expan_lvl).toBe(7);
    expect(TRANSFER_ABORT_REASONS.difficulty).toBe(8);
    expect(TRANSFER_ABORT_REASONS.unique_message).toBe(9);
    const bodies = [36, 574, 631].map((mapId, i) =>
      selfstateTransferAbortedBody({ arg: 1, mapId, reason: 7 + i }),
    );
    expect(bodies.map(hex)).toEqual([
      "240000000701",
      "3e0200000801",
      "770200000901",
    ]);
    const last = bodies[2];
    if (!last) throw new Error("missing body");
    expect(parseTransferAborted(read(last))).toEqual({
      arg: 1,
      mapId: 631,
      reason: 9,
    });
  });

  test("reason 5 ends after the reason byte", () => {
    const body = selfstateTransferAbortedBody({ mapId: 36, reason: 5 });
    expect(hex(body)).toBe("2400000005");
    const r = read(body);
    expect(parseTransferAborted(r)).toEqual({
      arg: undefined,
      mapId: 36,
      reason: 5,
    });
    expect(r.remaining).toBe(0);
  });

  test("too_many_instances is reason 4 with no arg (AC Maps/MapMgr.cpp:230-244)", () => {
    expect(TRANSFER_ABORT_REASONS.too_many_instances).toBe(4);
    const r = read(selfstateTransferAbortedBody({ mapId: 36, reason: 4 }));
    expect(parseTransferAborted(r)).toEqual({
      arg: undefined,
      mapId: 36,
      reason: 4,
    });
    expect(r.remaining).toBe(0);
  });
});

describe("SMSG_MOVE_SET_COLLISION_HGT (AC Entities/Unit/Unit.cpp:10272-10275)", () => {
  test("reads the guid, the counter and the height", () => {
    const body = selfstateMoveSetCollisionHeightBody({
      counter: 5,
      guid: 0x0764n,
      height: 3.1,
    });
    const r = read(body);
    const parsed = parseCollisionHeight(r);
    expect(parsed.guid).toBe(0x0764n);
    expect(parsed.counter).toBe(5);
    expect(parsed.height).toBeCloseTo(3.1, 4);
    expect(r.remaining).toBe(0);
  });

  test("SMSG_FORCE_PITCH_RATE_CHANGE reads guid, counter and speed through the speed acks (AC Entities/Unit/Unit.h:661)", () => {
    const spec = must(speedAckFor(GameOpcode.SMSG_FORCE_PITCH_RATE_CHANGE));
    const body = selfstateForcePitchRateChangeBody({
      counter: 9,
      guid: 0x0764n,
      speed: 3.14,
    });
    const r = read(body);
    const parsed = parseForceSpeed(r, spec);
    expect(parsed.guid).toBe(0x0764n);
    expect(parsed.counter).toBe(9);
    expect(parsed.speed).toBeCloseTo(3.14, 4);
    expect(r.remaining).toBe(0);
  });
});

describe("corpse map position query (AC Handlers/QueryHandler.cpp:399-410)", () => {
  test("CMSG_CORPSE_MAP_POSITION_QUERY is one u32 zero (AC Server/Packets/QueryPackets.cpp:55-58)", () => {
    expect(hex(buildCorpseMapPositionQuery())).toBe("00000000");
  });

  test("the response is the all-zero writer body and consumes the packet (AC Handlers/QueryHandler.cpp:399-410)", () => {
    const body = selfstateCorpseMapPositionQueryResponseBody();
    expect(body.length).toBe(16);
    const r = read(body);
    expect(parseCorpseMapPosition(r)).toEqual([0, 0, 0, 0]);
    expect(r.remaining).toBe(0);
  });
});

describe("corpse map position float decoding (synthetic, not protocol proof)", () => {
  test("four floats decode and consume the packet", () => {
    const r = read(
      selfstateCorpseMapPositionQueryResponseBody([1.5, -2.25, 0, 4]),
    );
    expect(parseCorpseMapPosition(r)).toEqual([1.5, -2.25, 0, 4]);
    expect(r.remaining).toBe(0);
  });
});
