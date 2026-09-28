import { describe, expect, test } from "bun:test";
import {
  selfstatePreResurrectBody,
  selfstateStandstateUpdateBody,
  selfstateStartMirrorTimerBody,
  selfstateStopMirrorTimerBody,
} from "#test-support/areas/selfstate";
import {
  buildStandStateChange,
  MIRROR_TIMERS,
  parseMirrorTimer,
  parsePreResurrect,
  parseStandState,
  parseStopMirrorTimer,
  STAND_STATES,
} from "#wow/areas/selfstate/protocol";
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
});
