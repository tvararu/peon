import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  spellsChannelStartBody,
  spellsChannelUpdateBody,
  spellsSpellFailureBody,
} from "#test-support/areas/spells";
import type { SpellsEvent } from "#wow/areas/spells/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const ME = 0x2an;
const MOB = 0xf1_30_00_3e_ea_00_0a_bcn;
const MISSILES = 5143;
const INTERRUPTED = 40;

function setup() {
  let now = 1000;
  const rig = areaRig("spells", { now: () => now, selfGuid: ME });
  const seen: SpellsEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  const start = (caster = ME, duration = 3000) =>
    rig.inject(
      GameOpcode.MSG_CHANNEL_START,
      spellsChannelStartBody({ caster, duration, spellId: MISSILES }),
    );
  const update = (time: number, caster = ME) =>
    rig.inject(
      GameOpcode.MSG_CHANNEL_UPDATE,
      spellsChannelUpdateBody({ caster, time }),
    );
  const failure = (caster = ME) =>
    rig.inject(
      GameOpcode.SMSG_SPELL_FAILURE,
      spellsSpellFailureBody({
        castCount: 1,
        caster,
        result: INTERRUPTED,
        spellId: MISSILES,
      }),
    );
  return {
    advance: (ms: number) => {
      now += ms;
    },
    failure,
    rig,
    seen,
    start,
    update,
  };
}

describe("spells channel wiring", () => {
  test("MSG_CHANNEL_START for self starts the channel in the cast tracker (Spell.cpp:5362-5385)", () => {
    const { rig, seen, start } = setup();
    try {
      rig.stores.combat.applyInitialSpells({
        cooldowns: [],
        spells: [{ spellId: MISSILES }],
      });
      rig.stores.combat.casts.send(() => undefined, MISSILES, MOB);
      start();
      expect(seen).toEqual([
        {
          durationMs: 3000,
          spellId: MISSILES,
          target: MOB,
          type: "channel_start",
        },
      ]);
      expect(rig.handle.state().channel).toMatchObject({
        durationMs: 3000,
        spellId: MISSILES,
        startedAt: 1000,
        target: MOB,
      });
      expect(rig.handle.state().channel).toEqual(
        rig.stores.combat.casts.channel,
      );
    } finally {
      rig.dispose();
    }
  });

  test("a pushback update then time 0 at the expected end is finished (Spell.cpp:4583-4586, 8173)", () => {
    const { advance, rig, seen, start, update } = setup();
    try {
      start();
      advance(1000);
      update(2000);
      expect(rig.handle.state().channel?.remainingMs).toBe(2000);
      advance(2000);
      update(0);
      expect(seen.at(-1)).toEqual({
        reason: "finished",
        spellId: MISSILES,
        type: "channel_end",
      });
      expect(rig.handle.state().channel).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("time 0 before the expected end, then SMSG_SPELL_FAILURE, is interrupted (Spell.cpp:3845-3846)", () => {
    const { advance, failure, rig, seen, start, update } = setup();
    try {
      start();
      advance(1200);
      update(0);
      failure();
      expect(seen.filter((e) => e.type === "channel_end")).toEqual([
        { reason: "interrupted", spellId: MISSILES, type: "channel_end" },
      ]);
      expect(rig.handle.state().channel).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("a peeked SMSG_SPELL_FAILURE for the channel spell before time 0 marks it interrupted", () => {
    const { advance, failure, rig, seen, start, update } = setup();
    try {
      start();
      advance(3000);
      failure();
      update(0);
      expect(seen.at(-1)).toMatchObject({ reason: "interrupted" });
    } finally {
      rig.dispose();
    }
  });

  test("a second time 0 after the channel ended is ignored (Spell.cpp:8155-8173)", () => {
    const { advance, rig, seen, start, update } = setup();
    try {
      start();
      advance(3000);
      update(0);
      update(0);
      expect(seen.filter((e) => e.type === "channel_end")).toHaveLength(1);
      expect(rig.handle.state().channel).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("an endless channel that ends without a cancel is interrupted (Spell.cpp:4247-4250)", () => {
    const { advance, seen, start, update, rig } = setup();
    try {
      start(ME, 0xff_ff_ff_ff);
      expect(seen[0]).toMatchObject({ durationMs: undefined });
      advance(60_000);
      update(0);
      expect(seen.at(-1)).toMatchObject({ reason: "interrupted" });
    } finally {
      rig.dispose();
    }
  });

  test("another caster's channel changes no self state", () => {
    const { advance, failure, rig, seen, start, update } = setup();
    try {
      start(MOB);
      advance(500);
      update(1000, MOB);
      update(0, MOB);
      failure(MOB);
      expect(
        seen.filter(
          (e) => e.type === "channel_start" || e.type === "channel_end",
        ),
      ).toEqual([]);
      expect(seen.map((e) => e.type)).toEqual([
        "unit_cast_start",
        "unit_cast_end",
      ]);
      expect(seen.at(-1)).toMatchObject({ outcome: "interrupted" });
      expect(rig.handle.state().channel).toBeUndefined();
      expect(rig.stores.combat.casts.channel).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("another caster's channel update 0 at full duration is finished", () => {
    const { advance, rig, seen, start, update } = setup();
    try {
      start(MOB);
      advance(3000);
      update(0, MOB);
      const ends = seen.filter((e) => e.type === "unit_cast_end");
      expect(ends).toHaveLength(1);
      expect(ends[0]).toMatchObject({ outcome: "finished" });
    } finally {
      rig.dispose();
    }
  });
});
