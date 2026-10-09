import { expect, jest, test } from "bun:test";
import { ObjectType, UNIT_FIELDS } from "@peon/core";
import { ControlRuntime, EntityStore } from "@peon/core/test-support/internals";
import { combatParts } from "@peon/core/test-support/session-fixtures";
import { spell } from "@peon/core/test-support/spell-fixtures";
import { CombatActions } from "#harness/loops/combat-actions";
import {
  context,
  MOVE_IDS,
  setup,
} from "#test-support/combat-actions-fixtures";
import { routedControl } from "#test-support/navigation-fixtures";

test("transient cooldown and cancellation waits do not block an encounter", () => {
  const { actions, combat } = setup();
  const definition = jest.spyOn(combat, "definition").mockReturnValue(spell());
  const cooldown = jest.spyOn(combat, "readyAt").mockReturnValue(2500);
  try {
    let frame = actions.observe(context);
    expect(frame.outcome).toBeUndefined();
    expect(frame.candidates.map((candidate) => candidate.id)).toEqual([
      "wait",
      ...MOVE_IDS,
    ]);
    combat.cast(17, 2n);
    combat.cancelCast();
    definition.mockReturnValue(undefined);
    frame = actions.observe(context);
    expect(frame.outcome).toBeUndefined();
    expect(frame.candidates.map((candidate) => candidate.id)).toEqual(["wait"]);
  } finally {
    cooldown.mockRestore();
    definition.mockRestore();
  }
});

test("an unsupported spellbook does not block facing and melee engagement", () => {
  const { actions, combat, store, motion } = setup();
  store.update(1n, { combatReach: 1.5 });
  store.update(2n, { combatReach: 1.5 });
  motion.observe(2n, {
    mapId: 530,
    x: -1,
    y: 0,
    z: 0,
    orientation: 0,
  });
  expect(actions.observe(context).outcome).toBeUndefined();
  actions.execute("face_target", context);
  actions.execute("attack", context);
  expect(combat.snapshot().pendingAttack).toBe(2n);
});

test("root blocks movement but not a supported stationary spell", () => {
  const { actions, combat, control } = setup();
  const definition = jest.spyOn(combat, "definition").mockReturnValue(spell());
  try {
    control.forceRoot(1);
    const frame = actions.observe(context);
    expect(frame.outcome).toBeUndefined();
    expect(
      frame.candidates.some((candidate) => candidate.id === "spell:17:target"),
    ).toBe(true);
  } finally {
    definition.mockRestore();
  }
});

test("dead target waits for real credit and offers no attack or spell", () => {
  const { actions, combat, store } = setup();
  store.update(2n, {}, new Map([[UNIT_FIELDS.HEALTH.offset, 0]]));
  const definition = jest.spyOn(combat, "definition").mockReturnValue(spell());
  try {
    const frame = actions.observe(context);
    expect(frame.outcome).toBeUndefined();
    expect(frame.candidates.map((candidate) => candidate.id)).toEqual(["wait"]);
  } finally {
    definition.mockRestore();
  }
});

test("a target out of reach is routed to once Jev stops closing in", () => {
  let time = 1000;
  const { actions, combat, goTos, motion } = setup(() => time);
  const definition = jest.spyOn(combat, "definition").mockReturnValue(spell());
  try {
    motion.observe(2n, { mapId: 530, x: 50, y: 0, z: 0, orientation: 0 });
    let frame = actions.observe(context);
    expect(frame.outcome).toBeUndefined();
    expect(frame.candidates.map((candidate) => candidate.id)).toEqual([
      "wait",
      ...MOVE_IDS,
    ]);
    time = 5999;
    expect(actions.observe(context).outcome).toBeUndefined();
    expect(goTos).toEqual([]);
    time = 6000;
    frame = actions.observe(context);
    expect(frame.outcome).toBeUndefined();
    expect(goTos).toEqual([2n]);
    expect(frame.candidates.map((candidate) => candidate.id)).toEqual(["wait"]);
  } finally {
    definition.mockRestore();
  }
});

test("a refused route is reported as unreachable", () => {
  let time = 1000;
  const { actions, combat, goTos, motion, plan } = setup(() => time);
  const definition = jest.spyOn(combat, "definition").mockReturnValue(spell());
  try {
    plan.refusal = "pathfind_find_path failed (UNKNOWN_PATH)";
    motion.observe(2n, { mapId: 530, x: 50, y: 0, z: 0, orientation: 0 });
    expect(actions.observe(context).outcome).toBeUndefined();
    time = 6000;
    expect(actions.observe(context).outcome).toEqual({
      status: "blocked",
      reason: "target_unreachable",
    });
    expect(goTos).toEqual([2n]);
  } finally {
    definition.mockRestore();
  }
});

test("a route that ends blocked is reported as unreachable", () => {
  let time = 1000;
  const { actions, combat, motion, routes } = setup(() => time);
  const definition = jest.spyOn(combat, "definition").mockReturnValue(spell());
  try {
    motion.observe(2n, { mapId: 530, x: 50, y: 0, z: 0, orientation: 0 });
    expect(actions.observe(context).outcome).toBeUndefined();
    time = 6000;
    expect(actions.observe(context).outcome).toBeUndefined();
    routes.refuse(undefined, "pathfind_find_path failed (UNKNOWN_PATH)");
    time = 6500;
    expect(actions.observe(context).outcome).toEqual({
      status: "blocked",
      reason: "target_unreachable",
    });
  } finally {
    definition.mockRestore();
  }
});

test("a wait chosen as the stall expires leaves the harness route running", () => {
  let time = 1000;
  const { actions, combat, control, goTos, motion, plan } = setup(() => time);
  const definition = jest.spyOn(combat, "definition").mockReturnValue(spell());
  try {
    plan.to = { x: 40, y: 0, z: 0 };
    motion.observe(2n, { mapId: 530, x: 50, y: 0, z: 0, orientation: 0 });
    actions.observe(context);
    time = 6000;
    actions.execute("wait", context);
    expect(goTos).toEqual([2n]);
    expect(control.navigationState().active).toBe(true);
    time = 6100;
    expect(actions.observe(context).outcome).toBeUndefined();
  } finally {
    definition.mockRestore();
  }
});

test("a route interrupted for a non-path cause is retried, not unreachable", () => {
  let time = 1000;
  const { actions, combat, goTos, motion, plan, routes } = setup(() => time);
  const definition = jest.spyOn(combat, "definition").mockReturnValue(spell());
  try {
    plan.to = { x: 40, y: 0, z: 0 };
    motion.observe(2n, { mapId: 530, x: 50, y: 0, z: 0, orientation: 0 });
    actions.observe(context);
    time = 6000;
    actions.observe(context);
    routes.refuse(undefined, "navigation_origin_changed");
    time = 6100;
    expect(actions.observe(context).outcome).toBeUndefined();
    time = 11_099;
    expect(actions.observe(context).outcome).toBeUndefined();
    expect(goTos).toEqual([2n]);
    time = 11_100;
    expect(actions.observe(context).outcome).toBeUndefined();
    expect(goTos).toEqual([2n, 2n]);
  } finally {
    definition.mockRestore();
  }
});

test("a routed approach ends and hands back to Jev once in reach", () => {
  let time = 1000;
  const { actions, combat, control, motion, plan } = setup(() => time);
  const definition = jest.spyOn(combat, "definition").mockReturnValue(spell());
  try {
    plan.to = { x: 40, y: 0, z: 0 };
    motion.observe(2n, { mapId: 530, x: 50, y: 0, z: 0, orientation: 0 });
    actions.observe(context);
    time = 6000;
    actions.observe(context);
    expect(control.navigationState().active).toBe(true);
    motion.observe(2n, { mapId: 530, x: 10, y: 0, z: 0, orientation: 0 });
    const frame = actions.observe(context);
    expect(frame.outcome).toBeUndefined();
    expect(control.navigationState().active).toBe(false);
    expect(
      frame.candidates.some((candidate) => candidate.id === "spell:17:target"),
    ).toBe(true);
  } finally {
    definition.mockRestore();
  }
});

test("a target re-entering range resets the stall threshold", () => {
  let time = 1000;
  const { actions, combat, goTos, motion } = setup(() => time);
  const definition = jest.spyOn(combat, "definition").mockReturnValue(spell());
  try {
    motion.observe(2n, {
      mapId: 530,
      x: 50,
      y: 0,
      z: 0,
      orientation: 0,
    });
    expect(actions.observe(context).outcome).toBeUndefined();
    time = 3000;
    motion.observe(2n, {
      mapId: 530,
      x: 10,
      y: 0,
      z: 0,
      orientation: 0,
    });
    const frame = actions.observe(context);
    expect(frame.outcome).toBeUndefined();
    expect(
      frame.candidates.some((candidate) => candidate.id === "spell:17:target"),
    ).toBe(true);
    time = 4000;
    motion.observe(2n, {
      mapId: 530,
      x: 50,
      y: 0,
      z: 0,
      orientation: 0,
    });
    expect(actions.observe(context).outcome).toBeUndefined();
    time = 6000;
    expect(actions.observe(context).outcome).toBeUndefined();
    expect(goTos).toEqual([]);
    time = 9000;
    expect(actions.observe(context).outcome).toBeUndefined();
    expect(goTos).toEqual([2n]);
  } finally {
    definition.mockRestore();
  }
});

test("closing on an out-of-range target restarts the stall bound", () => {
  let time = 1000;
  const { actions, combat, goTos, motion } = setup(() => time);
  const definition = jest.spyOn(combat, "definition").mockReturnValue(spell());
  const at = (ms: number, x: number) => {
    time = ms;
    motion.observe(2n, { mapId: 530, x, y: 0, z: 0, orientation: 0 });
    return actions.observe(context).outcome;
  };
  try {
    expect(at(1000, 50)).toBeUndefined();
    expect(at(4000, 48.5)).toBeUndefined();
    expect(at(8000, 47)).toBeUndefined();
    expect(at(12_000, 46.5)).toBeUndefined();
    expect(at(12_999, 47.5)).toBeUndefined();
    expect(goTos).toEqual([]);
    expect(at(13_000, 46.5)).toBeUndefined();
    expect(goTos).toEqual([2n]);
  } finally {
    definition.mockRestore();
  }
});

test("facing remains recoverable and does not stop as unreachable", () => {
  let time = 1000;
  const { actions, combat, control } = setup(() => time);
  const definition = jest.spyOn(combat, "definition").mockReturnValue(spell());
  try {
    control.observeSelf({
      position: { mapId: 530, x: 0, y: 0, z: 0, orientation: Math.PI },
      runSpeed: 7,
      runBackSpeed: 4,
    });
    let frame = actions.observe(context);
    expect(frame.outcome).toBeUndefined();
    expect(frame.candidates.map((c) => c.id)).toContain("face_target");
    time = 10_000;
    frame = actions.observe(context);
    expect(frame.outcome).toBeUndefined();
    expect(frame.candidates.map((c) => c.id)).toContain("face_target");
  } finally {
    definition.mockRestore();
  }
});

test("an attacking creature whose faction relation is unknown can be engaged", () => {
  const store = new EntityStore();
  const fields = new Map<number, number>([
    [UNIT_FIELDS.HEALTH.offset, 100],
    [UNIT_FIELDS.MAXHEALTH.offset, 100],
    [UNIT_FIELDS.BYTES_0.offset, 1],
    [0x7a, 0x28_01],
    [UNIT_FIELDS.POWER1.offset, 15],
    [UNIT_FIELDS.MAXPOWER1.offset, 1000],
    [UNIT_FIELDS.BASE_MANA.offset, 100],
  ]);
  store.create(1n, ObjectType.PLAYER, {
    health: 100,
    maxHealth: 100,
    factionTemplate: 1610,
    rawFields: fields,
  });
  store.create(2n, ObjectType.UNIT, {
    health: 100,
    maxHealth: 100,
    unitFlags: 0,
    target: 0n,
    factionTemplate: 7,
    rawFields: new Map([[UNIT_FIELDS.HEALTH.offset, 100]]),
  });
  const runtime = new ControlRuntime({
    send() {},
    now: () => 1000,
    ticks: () => 0,
    selfGuid: () => 1n,
    ground: { height: () => undefined, pathClear: () => false },
  });
  const { control } = routedControl(runtime, () => 1000);

  control.observeSelf({
    position: { mapId: 530, x: 0, y: 0, z: 0, orientation: 0 },
    runSpeed: 7,
    runBackSpeed: 4,
  });
  const {
    combat,
    store: combatStore,
    motion,
  } = combatParts({
    send() {},
    now: () => 1000,
    selfGuid: () => 1n,
    selectedGuid: () => 2n,
    getEntity: (guid) => store.get(guid),
    selfPose: () => control.snapshot().pose,
  });
  motion.observe(2n, { mapId: 530, x: 10, y: 0, z: 0, orientation: 0 });
  combatStore.applyInitialSpells({ spells: [{ spellId: 17 }], cooldowns: [] });
  const actions = new CombatActions({
    combat: {
      attack: (targetGuid: bigint) => combat.attack(targetGuid),
      cancelCast: () => combat.cancelCast(),
      cast: (spellId: number, targetGuid: bigint) =>
        combat.cast(spellId, targetGuid),
      channel: () => combatStore.casts.channel,
      definition: (spellId: number) => combat.definition(spellId),
      halt: () => combat.halt(),
      isAttackingSelf: (guid: bigint) => combat.isAttackingSelf(guid),
      petAttack: (petGuid: bigint, targetGuid: bigint) =>
        combat.petAttack(petGuid, targetGuid),
      readyAt: (spellId: number) => combat.readyAt(spellId),
      snapshot: (targetGuid?: bigint) => combat.snapshot(targetGuid),
      stopAttack: () => combat.stopAttack(),
      stopAutoRepeat: () => combat.stopAutoRepeat(),
    },
    control,
    entity: (guid) => store.get(guid),
    relation: () => "unknown",
    now: () => 1000,
  });

  expect(() => actions.activate(context)).toThrow(
    "unverified_hostile_relation",
  );

  combatStore.applyAttackStart({ attacker: 2n, victim: 1n });

  expect(() => actions.activate(context)).not.toThrow();

  combatStore.applyAttackStop({ attacker: 2n, victim: 1n, dead: 0 });

  expect(() => actions.activate(context)).toThrow(
    "unverified_hostile_relation",
  );
});
