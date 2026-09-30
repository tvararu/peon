import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  spellsChannelStartBody,
  spellsChannelUpdateBody,
  spellsSpellFailedOtherBody,
} from "#test-support/areas/spells";
import type { SpellsEvent } from "#wow/areas/spells/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const ME = 0x2an;
const MOB = 0xf1_30_00_3e_ea_00_0a_bcn;
const EVOCATION = 12_051;
const INTERRUPTED = 40;

function setup() {
  let now = 1000;
  const rig = areaRig("spells", { now: () => now, selfGuid: ME });
  const seen: SpellsEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  return {
    advance: (ms: number) => {
      now += ms;
    },
    failedOther: (caster = MOB, spellId = EVOCATION) =>
      rig.inject(
        GameOpcode.SMSG_SPELL_FAILED_OTHER,
        spellsSpellFailedOtherBody({
          castCount: 1,
          caster,
          result: INTERRUPTED,
          spellId,
        }),
      ),
    rig,
    seen,
  };
}

describe("spells unit casts near the end of a channel", () => {
  const channelEnd = (rig: ReturnType<typeof setup>["rig"]) =>
    rig.inject(
      GameOpcode.MSG_CHANNEL_UPDATE,
      spellsChannelUpdateBody({ caster: MOB, time: 0 }),
    );
  const channelBegin = (rig: ReturnType<typeof setup>["rig"]) =>
    rig.inject(
      GameOpcode.MSG_CHANNEL_START,
      spellsChannelStartBody({
        caster: MOB,
        duration: 8000,
        spellId: EVOCATION,
      }),
    );
  const ends = (seen: SpellsEvent[]) =>
    seen.filter((event) => event.type === "unit_cast_end");

  test("followed by the failure in the same tick is interrupted", () => {
    jest.useFakeTimers();
    const { advance, failedOther, rig, seen } = setup();
    try {
      channelBegin(rig);
      advance(7800);
      channelEnd(rig);
      failedOther(MOB, EVOCATION);
      jest.advanceTimersByTime(1000);
      expect(ends(seen)).toEqual([
        expect.objectContaining({
          outcome: "interrupted",
          spellId: EVOCATION,
        }),
      ]);
      expect(rig.handle.state().unitCasts).toEqual([]);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("with no failure is finished once the packets of that tick are done", () => {
    jest.useFakeTimers();
    const { advance, rig, seen } = setup();
    try {
      channelBegin(rig);
      advance(7800);
      channelEnd(rig);
      expect(ends(seen)).toEqual([]);
      jest.advanceTimersByTime(1000);
      expect(ends(seen)).toEqual([
        expect.objectContaining({ outcome: "finished", spellId: EVOCATION }),
      ]);
      expect(rig.handle.state().unitCasts).toEqual([]);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  const channelRemaining = (
    rig: ReturnType<typeof setup>["rig"],
    time: number,
  ) =>
    rig.inject(
      GameOpcode.MSG_CHANNEL_UPDATE,
      spellsChannelUpdateBody({ caster: MOB, time }),
    );

  test("shortened by pushback finishes at the shortened end", () => {
    jest.useFakeTimers();
    const { advance, rig, seen } = setup();
    try {
      channelBegin(rig);
      advance(2000);
      channelRemaining(rig, 4000);
      advance(4000);
      channelEnd(rig);
      jest.advanceTimersByTime(1000);
      expect(ends(seen)).toEqual([
        expect.objectContaining({ outcome: "finished", spellId: EVOCATION }),
      ]);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("shortened by pushback and stopped early is interrupted", () => {
    jest.useFakeTimers();
    const { advance, rig, seen } = setup();
    try {
      channelBegin(rig);
      advance(2000);
      channelRemaining(rig, 4000);
      advance(1000);
      channelEnd(rig);
      expect(ends(seen)).toEqual([
        expect.objectContaining({
          outcome: "interrupted",
          spellId: EVOCATION,
        }),
      ]);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("pushed back twice follows the last update", () => {
    jest.useFakeTimers();
    const { advance, rig, seen } = setup();
    try {
      channelBegin(rig);
      advance(1000);
      channelRemaining(rig, 5000);
      advance(1000);
      channelRemaining(rig, 3000);
      advance(3000);
      channelEnd(rig);
      jest.advanceTimersByTime(1000);
      expect(ends(seen)).toEqual([
        expect.objectContaining({ outcome: "finished", spellId: EVOCATION }),
      ]);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("is not finished after the store is disposed", () => {
    jest.useFakeTimers();
    const { advance, rig, seen } = setup();
    try {
      channelBegin(rig);
      advance(7800);
      channelEnd(rig);
      rig.dispose();
      jest.advanceTimersByTime(1000);
      expect(ends(seen)).toEqual([]);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });
});
