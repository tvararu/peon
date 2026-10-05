import { expect, jest, test } from "bun:test";
import type { NearbyRow } from "@peon/core";
import { spell } from "@peon/core/test-support/spell-fixtures";
import { fightInstruction } from "#harness/loops/fight-instruction";
import { context, setup } from "#test-support/combat-actions-fixtures";
import { unitRow } from "#test-support/ops-fixtures";

function slowSpell() {
  const base = spell();
  return {
    ...base,
    effects: base.effects.map((effect) => ({ ...effect, applyAura: 33 })),
  };
}

function description(
  frame: ReturnType<ReturnType<typeof setup>["actions"]["observe"]>,
  id: string,
): string {
  return frame.candidates.find((candidate) => candidate.id === id)
    ?.description as string;
}

function withReaches() {
  const fixture = setup();
  fixture.store.update(1n, { combatReach: 1.5 });
  fixture.store.update(2n, { combatReach: 1.5 });
  return fixture;
}

test("the frame says how far the target is outside its melee reach", () => {
  const { actions } = withReaches();
  const text = actions.observe(context).observation["targetReach"];
  expect(text).toContain("10 yd away, 5 yd outside its melee reach (5 yd;");
  expect(text).toContain("closing speed not observed yet");
});

test("the closing speed comes from successive target poses", () => {
  let now = 1000;
  const fixture = setup(() => now);
  fixture.store.update(1n, { combatReach: 1.5 });
  fixture.store.update(2n, { combatReach: 1.5 });
  fixture.actions.observe(context);
  now += 1000;
  fixture.motion.observe(2n, { mapId: 530, orientation: 0, x: 6, y: 0, z: 0 });
  const text = fixture.actions.observe(context).observation["targetReach"];
  expect(text).toContain("closing at 4 yd/s (observed)");
});

test("while kiting, a cast the closing target would outrun is unavailable", () => {
  let now = 1000;
  const fixture = setup(() => now);
  fixture.store.update(1n, { combatReach: 1.5 });
  fixture.store.update(2n, { combatReach: 1.5 });
  const slowCast = {
    ...spell(),
    castTime: { castTimeMs: 1500, id: 1, minCastTimeMs: 1500, perLevelMs: 0 },
    interruptFlags: 1,
  };
  const definition = jest
    .spyOn(fixture.combat, "definition")
    .mockReturnValue(slowCast);
  const kite = { ...context, instruction: fightInstruction(undefined, true) };
  try {
    fixture.actions.observe(kite);
    now += 1000;
    fixture.motion.observe(2n, {
      mapId: 530,
      orientation: 0,
      x: 6,
      y: 0,
      z: 0,
    });
    fixture.actions.observe(kite);
    now += 100;
    expect(fixture.actions.observe(kite).observation["unavailable"]).toEqual([
      { id: "spell:17:target", reason: "target_reaches_you_first" },
    ]);
    const plain = fixture.actions.observe(context);
    expect(plain.candidates.map((candidate) => candidate.id)).toContain(
      "spell:17:target",
    );
  } finally {
    definition.mockRestore();
  }
});

test("a slowed target is reported from its aura", () => {
  const { actions, combat, combatStore } = withReaches();
  const definition = jest
    .spyOn(combat, "definition")
    .mockReturnValue(slowSpell());
  try {
    combatStore.applyAura({
      flags: 0,
      level: 1,
      removed: false,
      slot: 0,
      spellId: 17,
      stacks: 1,
      timeLeft: 5000,
      unit: 2n,
    });
    const frame = actions.observe(context);
    expect(frame.observation["targetImpaired"]).toEqual([
      expect.stringContaining("slowed by"),
    ]);
  } finally {
    definition.mockRestore();
  }
});

test("a kited target just beyond spell range stays reachable; a plain fight gives up", () => {
  let now = 1000;
  const fixture = setup(() => now);
  const definition = jest
    .spyOn(fixture.combat, "definition")
    .mockReturnValue(spell());
  const kite = { ...context, instruction: fightInstruction(undefined, true) };
  try {
    fixture.motion.observe(2n, {
      mapId: 530,
      orientation: 0,
      x: 35,
      y: 0,
      z: 0,
    });
    expect(fixture.actions.observe(kite).outcome).toBeUndefined();
    now += 10_000;
    expect(fixture.actions.observe(kite).outcome).toBeUndefined();
    expect(fixture.actions.observe(context).outcome).toBeUndefined();
    now += 10_000;
    expect(fixture.actions.observe(context).outcome).toEqual({
      reason: "target_unreachable",
      status: "blocked",
    });
  } finally {
    definition.mockRestore();
  }
});

test("while kiting, standing still is not offered when the target would reach you within 2 s", () => {
  let now = 1000;
  const fixture = setup(() => now);
  fixture.store.update(1n, { combatReach: 1.5 });
  fixture.store.update(2n, { combatReach: 1.5 });
  const kite = { ...context, instruction: fightInstruction(undefined, true) };
  const ids = (frame: { candidates: readonly { id: string }[] }) =>
    frame.candidates.map((candidate) => candidate.id);
  fixture.actions.observe(kite);
  now += 1000;
  fixture.motion.observe(2n, { mapId: 530, orientation: 0, x: 7, y: 0, z: 0 });
  fixture.actions.observe(kite);
  now += 100;
  const kiting = fixture.actions.observe(kite);
  expect(ids(kiting)).not.toContain("stop");
  expect(ids(kiting)).toContain("turn_around");
  expect(ids(fixture.actions.observe(context))).toContain("stop");
});

test("each move says where the target would be and whether it ends outside its reach", () => {
  const { actions } = withReaches();
  const frame = actions.observe(context);
  expect(description(frame, "back_up")).toContain("would be 14.5 yd");
  expect(description(frame, "back_up")).toContain("outside its melee reach");
  expect(description(frame, "run_ahead")).toContain("inside its melee reach");
  expect(description(frame, "stop")).toContain("10 yd");
});

function others(): readonly NearbyRow[] {
  return [
    {
      ...unitRow({
        distance: 0,
        guid: 1n,
        level: 10,
        name: "Self",
        x: 0,
        y: 0,
      }),
      self: true,
    },
    unitRow({ distance: 10, guid: 2n, level: 10, name: "Target", x: 10, y: 0 }),
    unitRow({
      distance: 22.5,
      guid: 3n,
      level: 10,
      name: "Bystander",
      x: 0,
      y: -22.5,
    }),
  ];
}

test("another creature's aggro range masks moves into it, but the target adds none", () => {
  const { actions } = setup(undefined, { nearby: others });
  const ids = actions.observe(context).candidates.map((c) => c.id);
  expect(ids).not.toContain("strafe_right");
  expect(ids).toContain("strafe_left");
  expect(ids).toContain("run_ahead");
});

test("a creature already attacking adds no range", () => {
  const { actions, combatStore } = setup(undefined, { nearby: others });
  combatStore.applyAttackStart({ attacker: 3n, victim: 1n });
  const ids = actions.observe(context).candidates.map((c) => c.id);
  expect(ids).toContain("strafe_right");
});

test("five harmless creatures near do not hide another creature's range in a fight", () => {
  const grays = Array.from({ length: 5 }, (_, index) =>
    unitRow({
      distance: 1 + index * 0.2,
      guid: BigInt(index + 10),
      level: 4,
      name: "Harmless Rat",
      x: 0,
      y: 1 + index * 0.2,
    }),
  );
  const { actions } = setup(undefined, {
    nearby: () => [...grays, ...others()],
  });
  const ids = actions.observe(context).candidates.map((c) => c.id);
  expect(ids).not.toContain("strafe_right");
});
