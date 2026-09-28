import { describe, expect, test } from "bun:test";
import { must } from "#test-support/must";
import { combatParts } from "#test-support/session-fixtures";
import type { CombatEvent } from "#wow/combat";
import { EntityStore } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import type { MonsterMovePath } from "#wow/protocol/monster-move";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CastFailed, SpellStart } from "#wow/protocol/spell";
import type { SpellCatalog } from "#wow/spell-catalog";

function path(over: Partial<MonsterMovePath>): MonsterMovePath {
  return {
    kind: "move",
    guid: 2n,
    extra: 0,
    start: { x: 0, y: 0, z: 3 },
    splineId: 1,
    facing: { kind: "none" },
    flags: 0,
    duration: 1000,
    points: [
      { x: 0, y: 0, z: 3 },
      { x: 10, y: 0, z: 3 },
    ],
    interpolation: "linear",
    cyclic: false,
    ...over,
  };
}

function setup() {
  let now = 1000;
  const sent: number[] = [];
  const {
    combat,
    store: combatStore,
    motion,
  } = combatParts({
    send: (opcode) => {
      sent.push(opcode);
    },
    now: () => now,
    selfGuid: () => 1n,
    selectedGuid: () => 2n,
    getEntity: () => undefined,
    selfPose: () => undefined,
  });
  combatStore.applyInitialSpells({ spells: [{ spellId: 17 }], cooldowns: [] });
  return {
    combat,
    combatStore,
    motion,
    sent,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

function failure(castCount: number, result = 90): CastFailed {
  return { castCount, spellId: 17, result, extra: [] };
}

describe("combat observations", () => {
  test("manual learned cast without metadata awaits server and HALT cancels an unacknowledged attack", async () => {
    const { combat, sent } = setup();
    expect(combat.snapshot().unknownLearned).toEqual([17]);
    expect(() => combat.spellbook()).toThrow("missing_spell_data");
    combat.cast(17, 2n);
    combat.attack(2n);
    expect(combat.snapshot().lastOutcome?.status).toBe("sent");
    expect(combat.snapshot().casting).toBeUndefined();
    expect(combat.snapshot().attacking).toBe(false);
    combat.halt();
    expect(sent.slice(-2)).toEqual([
      GameOpcode.CMSG_CANCEL_CAST,
      GameOpcode.CMSG_ATTACKSTOP,
    ]);
    expect(combat.snapshot().pendingCast?.cancelRequested).toBe(true);
    expect(combat.snapshot().lastOutcome?.status).not.toBe("succeeded");
  });

  test("late failure from a prior count cannot clear the new pending cast", () => {
    const { combat, combatStore } = setup();
    combat.cast(17, 2n);
    combatStore.applyCastFailed(failure(1));
    expect(combat.snapshot().pendingCast).toBeUndefined();
    combat.cast(17, 2n);
    combatStore.applyCastFailed(failure(1));
    expect(combat.snapshot().pendingCast?.count).toBe(2);
    expect(combat.snapshot().lastOutcome?.status).toBe("sent");
    combatStore.applyCastFailed(failure(2));
    expect(combat.snapshot().pendingCast).toBeUndefined();
    expect(combat.snapshot().lastOutcome?.status).toBe("failed");
  });

  test("full aura snapshots replace stale slots and duration expiry is reflected", () => {
    const { combat, advance, combatStore } = setup();
    combatStore.applyAuraAll({
      unit: 1n,
      auras: [
        {
          unit: 1n,
          slot: 0,
          removed: false,
          spellId: 17,
          flags: 0x28,
          level: 10,
          stacks: 1,
          duration: 1000,
          timeLeft: 500,
        },
        {
          unit: 1n,
          slot: 1,
          removed: false,
          spellId: 18,
          flags: 0x28,
          level: 10,
          stacks: 1,
          duration: 1000,
          timeLeft: 500,
        },
      ],
    });
    expect(combat.snapshot().auras.map((aura) => aura.spellId)).toEqual([
      17, 18,
    ]);
    advance(501);
    expect(combat.snapshot().auras).toEqual([]);
    combatStore.applyAuraAll({ unit: 1n, auras: [] });
    expect(combat.snapshot().auras).toEqual([]);
  });

  test("foreign cooldown packets cannot block self and clears release observed cooldown", () => {
    const { combat, combatStore } = setup();
    const cooldown = (guid: bigint) => ({
      guid,
      flags: 0,
      cooldowns: [{ spellId: 17, time: 3000 }],
    });
    combatStore.applyCooldown(cooldown(2n));
    expect(combat.snapshot().cooldowns).toEqual([]);
    combatStore.applyCooldown(cooldown(1n));
    expect(combat.snapshot().cooldowns[0]?.remainingMs).toBe(3000);
    combatStore.applyClearCooldown({ spellId: 17, guid: 1n });
    expect(combat.snapshot().cooldowns).toEqual([]);
  });

  test("attack stop on a dead victim does not fabricate kill credit", () => {
    const { combat, combatStore } = setup();
    combatStore.applyAttackStop({ attacker: 1n, victim: 2n, dead: 1 });
    expect(combat.snapshot().lastXp).toBeUndefined();
    combatStore.applyXp({
      victim: 2n,
      total: 55,
      kind: "kill",
      original: 55,
      groupRate: 1,
      recruitAFriend: false,
    });
    expect(combat.snapshot().lastXp).toMatchObject({
      victim: 2n,
      kind: "kill",
      total: 55,
    });
  });

  test("a victimless attack stop clears the pending swing as failed", () => {
    const { combat, combatStore } = setup();
    combat.attack(0xf1300000000000ffn);
    combatStore.applyAttackStop({
      attacker: 1n,
      victim: undefined,
      dead: undefined,
    });
    const state = combat.snapshot();
    expect(state.pendingAttack).toBeUndefined();
    expect(state.attacking).toBe(false);
    expect(state.lastOutcome).toMatchObject({
      kind: "attack",
      status: "failed",
    });
    expect(state.lastOutcome?.target).toBeUndefined();
  });

  test("spline predictions preserve observed provenance and disappear clears motion", () => {
    const { combat, advance, combatStore, motion } = setup();
    motion.observe(2n, {
      mapId: 530,
      x: 0,
      y: 0,
      z: 3,
      orientation: 1,
    });
    motion.monsterMove(path({}), 530);
    advance(500);
    const target = must(combat.snapshot().target);
    expect(target.pose).toMatchObject({ source: "predicted", x: 5 });
    expect(target.serverPose).toMatchObject({
      source: "server",
      x: 0,
      updatedAt: 1000,
    });
    advance(500);
    expect(combat.snapshot().target?.serverPose?.updatedAt).toBe(1000);
    combatStore.forget(2n);
    motion.forget(2n);
    expect(combat.snapshot().target?.pose).toBeUndefined();
  });
});

test("cancellation intent survives START and repeated server failures", () => {
  const { combat, combatStore } = setup();
  combat.cast(17, 2n);
  combat.cancelCast();
  const start: SpellStart = {
    castItem: 1n,
    caster: 1n,
    castCount: 1,
    spellId: 17,
    flags: 0,
    timer: 1500,
    targets: { flags: 2, objectGuid: 2n },
  };
  combatStore.applySpellStart(start);
  expect(combat.snapshot().casting?.cancelRequested).toBe(true);
  combatStore.applyCastFailed(failure(1, 40));
  expect(combat.snapshot().lastOutcome?.kind).toBe("cancel");
  combatStore.applySpellFailure({
    caster: 1n,
    extraCasts: 1,
    spellId: 17,
    result: 40,
  });
  expect(combat.snapshot().casting).toBeUndefined();
  expect(combat.snapshot().lastOutcome?.kind).toBe("cancel");
});

test("a new cast does not inherit the previous cancellation intent", () => {
  const { combat, combatStore } = setup();
  combat.cast(17, 2n);
  combat.cancelCast();
  combatStore.applyCastFailed(failure(1, 40));
  combat.cast(17, 2n);
  combatStore.applyCastFailed(failure(2, 40));
  expect(combat.snapshot().lastOutcome).toMatchObject({
    kind: "cast",
    status: "failed",
  });
});

test("cancellation requests do not hide other server errors", () => {
  const { combat, combatStore } = setup();
  combat.cast(17, 2n);
  combat.cancelCast();
  combatStore.applyCastFailed(failure(1, 41));
  expect(combat.snapshot().lastOutcome).toMatchObject({
    kind: "cast",
    status: "failed",
    result: 41,
  });
});

test("failed and interrupted casts name the server result next to its code", () => {
  const { combat, combatStore } = setup();
  const events: { type: string; reason?: string }[] = [];
  combat.onEvent((event) => events.push(event));
  combat.cast(17, 2n);
  combatStore.applyCastFailed(failure(1, 97));
  expect(combat.snapshot().lastOutcome).toMatchObject({
    status: "failed",
    result: 97,
    reason: "out_of_range",
  });
  combat.cast(17, 2n);
  combatStore.applySpellFailure({
    caster: 1n,
    extraCasts: 2,
    spellId: 17,
    result: 40,
  });
  expect(combat.snapshot().lastOutcome).toMatchObject({
    status: "interrupted",
    result: 40,
    reason: "interrupted",
  });
  expect(
    events
      .filter((event) => event.type.startsWith("cast_") && event.reason)
      .map((event) => event.reason),
  ).toEqual(["cast_failed:out_of_range", "spell_failure:interrupted"]);
});

test("full creature aura snapshots preserve unsigned GUID halves", () => {
  const guid = 0xf130003fd20009e5n;
  const { combat, store: combatStore } = combatParts({
    send() {},
    now: () => 1,
    selfGuid: () => 1n,
    selectedGuid: () => guid,
    getEntity: () => undefined,
    selfPose: () => undefined,
  });
  combatStore.applyAuraAll({
    unit: guid,
    auras: [
      {
        unit: guid,
        slot: 2,
        removed: false,
        spellId: 17,
        flags: 8,
        level: 10,
        stacks: 1,
      },
    ],
  });
  expect(combat.snapshot().targetAuras[0]).toMatchObject({
    spellId: 17,
    caster: guid,
  });
  expect(combat.snapshot().auras).toEqual([]);
});

test("a new open Catmull packet cannot promote old facing to authoritative launch yaw", () => {
  const { combat, motion } = setup();
  motion.observe(2n, { mapId: 530, x: 0, y: 0, z: 0, orientation: 0 });
  motion.monsterMove(
    path({
      start: { x: 0, y: 2, z: 0 },
      flags: 0x4_00_00,
      points: [
        { x: 0, y: 2, z: 0 },
        { x: 0, y: 5, z: 0 },
        { x: 0, y: 10, z: 0 },
      ],
      interpolation: "catmullrom",
    }),
    530,
  );
  const target = must(combat.snapshot().target);
  expect(target.serverPose).toMatchObject({
    y: 2,
    source: "server",
    orientation: undefined,
  });
  expect(target.motion?.unsupportedReason).toBe("unknown_launch_orientation");
  expect(target.pose).toBeUndefined();
});

test("incoming attack start registers attacker against self and stop clears it", () => {
  const { combat, combatStore } = setup();
  expect(combat.isAttackingSelf(0x10n)).toBe(false);
  combatStore.applyAttackStart({ attacker: 0x10n, victim: 1n });
  expect(combat.isAttackingSelf(0x10n)).toBe(true);
  expect(combat.isAttackingSelf(0x20n)).toBe(false);
  combatStore.applyAttackStop({ attacker: 0x10n, victim: 1n, dead: 0 });
  expect(combat.isAttackingSelf(0x10n)).toBe(false);
});

test("dead incoming attacker is cleared on check", () => {
  const store = new EntityStore();
  store.create(0x10n, ObjectType.UNIT, { health: 50 });
  const { combat, store: combatStore } = combatParts({
    send() {},
    now: () => 1000,
    selfGuid: () => 1n,
    selectedGuid: () => 2n,
    getEntity: (guid) => store.get(guid),
    selfPose: () => undefined,
  });
  combatStore.applyAttackStart({ attacker: 0x10n, victim: 1n });
  expect(combat.isAttackingSelf(0x10n)).toBe(true);
  store.update(0x10n, { health: 0 });
  expect(combat.isAttackingSelf(0x10n)).toBe(false);
});

test("cast events carry the spell name when spell data is loaded", () => {
  const { combat, combatStore } = setup();
  const events: CombatEvent[] = [];
  combat.onEvent((event) => events.push(event));
  combat.cast(17, 2n);
  combatStore.applyCastFailed(failure(1, 97));
  expect(events.at(-1)?.spellName).toBeUndefined();
  combat.setCatalog({
    get: (id: number) =>
      id === 17 ? { name: "Power Word: Shield" } : undefined,
  } as unknown as SpellCatalog);
  combat.cast(17, 2n);
  combatStore.applyCastFailed(failure(2, 97));
  expect(events.at(-1)).toMatchObject({
    spellName: "Power Word: Shield",
    type: "cast_failed",
  });
  combatStore.applyXp({
    kind: "kill",
    recruitAFriend: false,
    total: 40,
    victim: 2n,
  });
  expect(events.at(-1)?.spellName).toBeUndefined();
});

test("self auras carry the spell name once spell data is loaded", () => {
  const { combat, combatStore } = setup();
  combat.setCatalog({
    get: (id: number) =>
      id === 17 ? { name: "Power Word: Shield" } : undefined,
  } as unknown as SpellCatalog);
  combatStore.applyAuraAll({
    unit: 1n,
    auras: [
      {
        unit: 1n,
        slot: 0,
        removed: false,
        spellId: 17,
        flags: 0x28,
        level: 10,
        stacks: 1,
      },
    ],
  });
  expect(combat.snapshot().auras[0]?.name).toBe("Power Word: Shield");
});

test("attackers lists live incoming attackers and attacked names each one", () => {
  const { combat, combatStore } = setup();
  const events: CombatEvent[] = [];
  combat.onEvent((event) => events.push(event));
  combatStore.applyAttackStart({ attacker: 0x10n, victim: 1n });
  combatStore.applyAttackStart({ attacker: 0x20n, victim: 1n });
  expect(combat.snapshot().attackers).toEqual([0x10n, 0x20n]);
  const attacked = events.filter((event) => event.type === "attacked");
  expect(attacked.map((event) => event.attacker)).toEqual([0x10n, 0x20n]);
  expect(attacked.at(-1)?.state.attackers).toEqual([0x10n, 0x20n]);
});

test("a dead or stopped attacker leaves attackers", () => {
  const store = new EntityStore();
  store.create(0x10n, ObjectType.UNIT, { health: 50 });
  store.create(0x20n, ObjectType.UNIT, { health: 50 });
  const { combat, store: combatStore } = combatParts({
    send() {},
    now: () => 1000,
    selfGuid: () => 1n,
    selectedGuid: () => undefined,
    getEntity: (guid) => store.get(guid),
    selfPose: () => undefined,
  });
  combatStore.applyAttackStart({ attacker: 0x10n, victim: 1n });
  combatStore.applyAttackStart({ attacker: 0x20n, victim: 1n });
  store.update(0x10n, { health: 0 });
  combatStore.applyAttackStop({ attacker: 0x20n, victim: 1n, dead: 0 });
  expect(combat.snapshot().attackers).toEqual([]);
});

test("a bad cast request is named before an in-progress cast", () => {
  const { combat } = setup();
  combat.cast(17, 2n);
  expect(() => combat.cast(0, 2n)).toThrow("invalid_spell");
  expect(() => combat.cast(99, 2n)).toThrow("unknown_spell");
  expect(() => combat.cast(17, 2n)).toThrow("cast_in_progress");
});

describe("combat halt with a channel", () => {
  test("halt cancels a running channel with CMSG_CANCEL_CHANNELLING", () => {
    const { combat, combatStore, sent } = setup();
    combatStore.casts.beginChannel({
      durationMs: 3000,
      spellId: 17,
      target: 2n,
    });
    combat.halt();
    expect(sent).toContain(GameOpcode.CMSG_CANCEL_CHANNELLING);
    expect(sent).not.toContain(GameOpcode.CMSG_CANCEL_CAST);
    expect(combatStore.casts.channel?.cancelRequested).toBe(true);
  });
});
