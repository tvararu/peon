import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  spellsChannelStartBody,
  spellsChannelUpdateBody,
  spellsSpellFailedOtherBody,
  spellsSpellFailureBody,
  spellsSpellGoBody,
  spellsSpellStartBody,
} from "#test-support/areas/spells";
import { spell } from "#test-support/spell-fixtures";
import type { SpellsEvent } from "#wow/areas/spells/store";
import type { CombatChange } from "#wow/combat-store";
import type { UnitEntity } from "#wow/entity-store";
import { registerCombatHandlers } from "#wow/gameplay-handlers";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";
import type { WorldConn } from "#wow/world-conn";

const ME = 0x2an;
const MOB = 0xf1_30_00_3e_ea_00_0a_bcn;
const OTHER = 0xf1_30_00_3e_ea_00_0a_bdn;
const SHADOW_BOLT = 9613;
const FROSTBOLT = 116;
const EVOCATION = 12_051;
const INTERRUPTED = 40;

function selfEntity(target: bigint): UnitEntity {
  return {
    class_: 8,
    displayId: 1,
    entry: 0,
    factionTemplate: 1,
    gender: 0,
    guid: ME,
    health: 200,
    level: 10,
    maxHealth: 200,
    maxPower: [0, 0, 0, 0, 0, 0, 0],
    name: "Mage",
    npcFlags: 0,
    objectType: ObjectType.PLAYER,
    position: undefined,
    power: [0, 0, 0, 0, 0, 0, 0],
    race: 10,
    rawFields: new Map([
      [UNIT_FIELDS.TARGET.offset, Number(target & 0xff_ff_ff_ffn)],
      [UNIT_FIELDS.TARGET.offset + 1, Number(target >> 32n)],
    ]),
    scale: 1,
    target: 0n,
    unitFlags: 0,
  };
}

function setup() {
  let now = 1000;
  let selfTarget = 0n;
  const rig = areaRig("spells", {
    getEntity: (guid) => (guid === ME ? selfEntity(selfTarget) : undefined),
    now: () => now,
    register: (dispatch, stores) =>
      registerCombatHandlers(
        { dispatch } as unknown as WorldConn,
        stores as Pick<typeof stores, "combat" | "motion" | "self">,
      ),
    selfGuid: ME,
  });
  const names: Record<number, string> = {
    [EVOCATION]: "Evocation",
    [FROSTBOLT]: "Frostbolt",
    [SHADOW_BOLT]: "Shadow Bolt",
  };
  jest.spyOn(rig.stores.combat, "definition").mockImplementation((id) => {
    const name = names[id];
    return name === undefined ? undefined : { ...spell(), name };
  });
  const seen: SpellsEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  const start = (init: {
    caster?: bigint;
    spellId?: number;
    timer?: number;
    target?: bigint;
  }) =>
    rig.inject(
      GameOpcode.SMSG_SPELL_START,
      spellsSpellStartBody({
        castCount: 1,
        caster: init.caster ?? MOB,
        flags: 2,
        spellId: init.spellId ?? SHADOW_BOLT,
        target: init.target,
        timer: init.timer ?? 2500,
      }),
    );
  const go = (caster = MOB, spellId = SHADOW_BOLT) =>
    rig.inject(
      GameOpcode.SMSG_SPELL_GO,
      spellsSpellGoBody({
        caster,
        extraCasts: 1,
        flags: 0x1_00,
        hits: [ME],
        spellId,
        target: ME,
        timestamp: 5,
      }),
    );
  const failBody = (caster = MOB, spellId = SHADOW_BOLT) =>
    spellsSpellFailureBody({
      castCount: 1,
      caster,
      result: INTERRUPTED,
      spellId,
    });
  return {
    advance: (ms: number) => {
      now += ms;
    },
    failBody,
    failure: (caster = MOB, spellId = SHADOW_BOLT) =>
      rig.inject(GameOpcode.SMSG_SPELL_FAILURE, failBody(caster, spellId)),
    failedOther: (caster = MOB, spellId = SHADOW_BOLT) =>
      rig.inject(
        GameOpcode.SMSG_SPELL_FAILED_OTHER,
        spellsSpellFailedOtherBody({
          castCount: 1,
          caster,
          result: INTERRUPTED,
          spellId,
        }),
      ),
    go,
    rig,
    seen,
    setSelfTarget: (guid: bigint) => {
      selfTarget = guid;
    },
    start,
  };
}

describe("spells unit casts", () => {
  test("SMSG_SPELL_START of another caster records the cast and emits unit_cast_start (Spell.cpp:4924)", () => {
    const { rig, seen, start } = setup();
    try {
      start({ target: ME });
      expect(seen).toEqual([
        {
          durationMs: 2500,
          guid: MOB,
          kind: "cast",
          relevant: 0,
          spellId: SHADOW_BOLT,
          spellName: "Shadow Bolt",
          type: "unit_cast_start",
        },
      ]);
      expect(rig.handle.state().unitCasts).toEqual([
        {
          durationMs: 2500,
          guid: MOB,
          kind: "cast",
          relevant: false,
          spellId: SHADOW_BOLT,
          startedAt: 1000,
          target: ME,
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("an instant cast (timer 0) and the caster's own cast create nothing", () => {
    const { go, rig, seen, start } = setup();
    try {
      start({ timer: 0 });
      go();
      start({ caster: ME });
      expect(seen).toEqual([]);
      expect(rig.handle.state().unitCasts).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_SPELL_GO ends the cast succeeded, and a second go is ignored", () => {
    const { go, rig, seen, start } = setup();
    try {
      start({});
      go();
      go();
      expect(seen.map((e) => e.type)).toEqual([
        "unit_cast_start",
        "unit_cast_end",
      ]);
      expect(seen[1]).toEqual({
        guid: MOB,
        outcome: "succeeded",
        relevant: 0,
        spellId: SHADOW_BOLT,
        spellName: "Shadow Bolt",
        type: "unit_cast_end",
      });
      expect(rig.handle.state().unitCasts).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_SPELL_GO for a guid with no entry is ignored", () => {
    const { go, rig, seen } = setup();
    try {
      go(OTHER);
      expect(seen).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_SPELL_FAILURE then SMSG_SPELL_FAILED_OTHER end it interrupted once (Spell.cpp:5332-5339)", () => {
    const { failedOther, failure, rig, seen, start } = setup();
    try {
      start({});
      failure();
      failedOther();
      const ends = seen.filter((e) => e.type === "unit_cast_end");
      expect(ends).toEqual([
        {
          guid: MOB,
          outcome: "interrupted",
          relevant: 0,
          spellId: SHADOW_BOLT,
          spellName: "Shadow Bolt",
          type: "unit_cast_end",
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_SPELL_FAILED_OTHER alone interrupts a cast", () => {
    const { failedOther, rig, seen, start } = setup();
    try {
      start({});
      failedOther();
      expect(seen.at(-1)).toMatchObject({
        outcome: "interrupted",
        type: "unit_cast_end",
      });
      expect(rig.handle.state().unitCasts).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a failure of a different spell leaves the cast running", () => {
    const { failedOther, failure, rig, start } = setup();
    try {
      start({});
      failure(MOB, FROSTBOLT);
      failedOther(MOB, FROSTBOLT);
      expect(rig.handle.state().unitCasts).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_SPELL_FAILED_OTHER for self is ignored", () => {
    const { failedOther, rig, seen } = setup();
    try {
      failedOther(ME);
      expect(seen).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("an own interrupted cast fires cast_interrupted exactly once although the server sends both packets (Spell.cpp:5332,5339)", () => {
    const { failedOther, failure, rig } = setup();
    try {
      rig.stores.combat.applyInitialSpells({
        cooldowns: [],
        spells: [{ spellId: FROSTBOLT }],
      });
      const changes: CombatChange[] = [];
      rig.stores.combat.onChange((change) => changes.push(change));
      rig.stores.combat.casts.send(() => undefined, FROSTBOLT, MOB);
      failure(ME, FROSTBOLT);
      failedOther(ME, FROSTBOLT);
      expect(
        changes.filter((change) => change.type === "cast_interrupted"),
      ).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });

  test("another caster's channel start and update 0 settle to finished", () => {
    jest.useFakeTimers();
    const { advance, rig, seen } = setup();
    try {
      rig.inject(
        GameOpcode.MSG_CHANNEL_START,
        spellsChannelStartBody({
          caster: MOB,
          duration: 8000,
          spellId: EVOCATION,
        }),
      );
      expect(seen).toEqual([
        {
          durationMs: 8000,
          guid: MOB,
          kind: "channel",
          relevant: 0,
          spellId: EVOCATION,
          spellName: "Evocation",
          type: "unit_cast_start",
        },
      ]);
      expect(rig.handle.state().channel).toBeUndefined();
      advance(8000);
      rig.inject(
        GameOpcode.MSG_CHANNEL_UPDATE,
        spellsChannelUpdateBody({ caster: MOB, time: 0 }),
      );
      expect(seen.filter((e) => e.type === "unit_cast_end")).toEqual([]);
      jest.advanceTimersByTime(1000);
      expect(seen.at(-1)).toMatchObject({
        outcome: "finished",
        type: "unit_cast_end",
      });
      expect(rig.handle.state().unitCasts).toEqual([]);
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("an endless channel of another caster creates no entry", () => {
    const { rig, seen } = setup();
    try {
      rig.inject(
        GameOpcode.MSG_CHANNEL_START,
        spellsChannelStartBody({
          caster: MOB,
          duration: 0xff_ff_ff_ff,
          spellId: EVOCATION,
        }),
      );
      expect(seen).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a channel update with time left for another caster changes nothing", () => {
    const { rig, seen } = setup();
    try {
      rig.inject(
        GameOpcode.MSG_CHANNEL_START,
        spellsChannelStartBody({
          caster: MOB,
          duration: 8000,
          spellId: EVOCATION,
        }),
      );
      rig.inject(
        GameOpcode.MSG_CHANNEL_UPDATE,
        spellsChannelUpdateBody({ caster: MOB, time: 3000 }),
      );
      expect(seen).toHaveLength(1);
      expect(rig.handle.state().unitCasts).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });

  test("a channel of another caster does not disturb the character's own channel", () => {
    const { rig } = setup();
    try {
      rig.inject(
        GameOpcode.MSG_CHANNEL_START,
        spellsChannelStartBody({
          caster: ME,
          duration: 3000,
          spellId: EVOCATION,
        }),
      );
      rig.inject(
        GameOpcode.MSG_CHANNEL_UPDATE,
        spellsChannelUpdateBody({ caster: MOB, time: 0 }),
      );
      expect(rig.handle.state().channel?.spellId).toBe(EVOCATION);
    } finally {
      rig.dispose();
    }
  });

  test("an entry reads as expired 1000 ms after its end and emits expired on the next unit-cast packet", () => {
    const { advance, go, rig, seen, start } = setup();
    try {
      start({ timer: 2500 });
      advance(3499);
      expect(rig.handle.state().unitCasts).toHaveLength(1);
      advance(1);
      expect(rig.handle.state().unitCasts).toEqual([]);
      go(OTHER);
      expect(seen.at(-1)).toMatchObject({
        guid: MOB,
        outcome: "expired",
        type: "unit_cast_end",
      });
    } finally {
      rig.dispose();
    }
  });

  test("the caster's disappear drops the entry without an event", () => {
    const { rig, seen, start } = setup();
    try {
      start({});
      rig.events.entity.emit({ guid: MOB, type: "disappear" });
      expect(rig.handle.state().unitCasts).toEqual([]);
      expect(seen.map((e) => e.type)).toEqual(["unit_cast_start"]);
    } finally {
      rig.dispose();
    }
  });

  test("a caster that targets the character, or attacks it, is relevant", () => {
    const { rig, seen, setSelfTarget, start } = setup();
    try {
      setSelfTarget(MOB);
      start({});
      jest.spyOn(rig.stores.combat, "isAttackingSelf").mockReturnValue(true);
      start({ caster: OTHER });
      start({ caster: 0x77n });
      expect(
        seen.map((e) => (e.type === "unit_cast_start" ? e.relevant : -1)),
      ).toEqual([1, 1, 1]);
      expect(rig.handle.state().unitCasts.map((c) => c.relevant)).toEqual([
        true,
        true,
        true,
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("an unrelated caster is not relevant", () => {
    const { rig, seen, start } = setup();
    try {
      start({});
      expect(seen[0]).toMatchObject({ relevant: 0 });
    } finally {
      rig.dispose();
    }
  });

  test("a second start of the same caster replaces its entry", () => {
    const { rig, start } = setup();
    try {
      start({});
      start({ spellId: FROSTBOLT, timer: 1500 });
      expect(rig.handle.state().unitCasts).toMatchObject([
        { durationMs: 1500, spellId: FROSTBOLT },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("the store keeps at most 64 entries and drops the oldest", () => {
    const { rig, start } = setup();
    try {
      for (let i = 0; i < 65; i++) start({ caster: BigInt(1000 + i) });
      const casts = rig.handle.state().unitCasts;
      expect(casts).toHaveLength(64);
      expect(casts.some((c) => c.guid === 1000n)).toBe(false);
      expect(casts.some((c) => c.guid === 1064n)).toBe(true);
    } finally {
      rig.dispose();
    }
  });

  test("castOf gives the live entry of one caster", () => {
    const { rig, start } = setup();
    try {
      start({ target: ME });
      expect(rig.stores.areas.spells.castOf(MOB)).toMatchObject({
        spellId: SHADOW_BOLT,
      });
      expect(rig.stores.areas.spells.castOf(OTHER)).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });
});
