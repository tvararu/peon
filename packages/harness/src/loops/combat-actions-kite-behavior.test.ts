import { describe, expect, jest, test } from "bun:test";
import { spell } from "@peon/core/test-support/spell-fixtures";
import {
  KITE_CLOSING_RANGE_YD,
  KITE_MASK_MS,
  KITE_RANGE_MARGIN_YD,
  KITE_SELF_SNARE_YD,
  slowFirst,
} from "#harness/loops/combat-actions-kite";
import {
  COMBAT_MELEE_LEEWAY_YD,
  meleeReachOf,
  targetGap,
} from "#harness/loops/combat-actions-moves";
import type { TacticsFrame } from "#harness/loops/tactics";
import { context, setup } from "#test-support/combat-actions-fixtures";

const kite = { ...context, kite: true as const };

function idsOf(frame: TacticsFrame): string[] {
  return frame.candidates.map((candidate) => candidate.id);
}

function rangedSpell(maxHostile: number, applyAura = 0) {
  const definition = spell();
  definition.range = { flags: 0, id: 2, maxHostile, minHostile: 0 };
  if (applyAura !== 0) {
    const [effect] = definition.effects;
    if (effect) effect.applyAura = applyAura;
  }
  return definition;
}

test("kite melee reach adds the moving leeway; non-kite reach is unchanged", () => {
  const { combat, store } = setup();
  const state = combat.snapshot(2n);
  const lookup = (guid: bigint) => store.get(guid);
  expect(meleeReachOf(state, lookup)).toBe(5);
  expect(meleeReachOf(state, lookup, true)).toBeCloseTo(
    5 + COMBAT_MELEE_LEEWAY_YD,
    3,
  );
  store.update(1n, { combatReach: 3 });
  store.update(2n, { combatReach: 3 });
  expect(meleeReachOf(state, lookup)).toBeCloseTo(7.333, 3);
  expect(meleeReachOf(state, lookup, true)).toBeCloseTo(
    7.333 + COMBAT_MELEE_LEEWAY_YD,
    3,
  );
  expect(targetGap(state, lookup, true)).toBeCloseTo(
    (targetGap(state, lookup) ?? 0) - COMBAT_MELEE_LEEWAY_YD,
    1,
  );
});

test("closing compares against the last dispatched frame, not a legality check", () => {
  const now = 1000;
  const { actions, combat, motion } = setup(() => now);
  const definition = jest.spyOn(combat, "definition").mockReturnValue(spell());
  try {
    expect(actions.observe(kite).observation["melee"]).toMatchObject({
      closing: "unknown",
    });
    motion.observe(2n, { mapId: 530, orientation: 0, x: 12, y: 0, z: 0 });
    actions.execute("wait", kite);
    motion.observe(2n, { mapId: 530, orientation: 0, x: 14, y: 0, z: 0 });
    expect(actions.observe(kite).observation["melee"]).toMatchObject({
      closing: "opening",
    });
  } finally {
    definition.mockRestore();
  }
});

test("kite offers run_away but not back_up when the gap is short", () => {
  const { actions, combat } = setup();
  const definition = jest.spyOn(combat, "definition").mockReturnValue(spell());
  try {
    const found = idsOf(actions.observe(kite));
    expect(found).toContain("run_away");
    expect(found).not.toContain("back_up");
    expect(found).toContain("spell:17:target");
    expect(found).toContain("wait");
    expect(found).toContain("stop");
    const plain = idsOf(actions.observe(context));
    expect(plain).toContain("back_up");
    expect(plain).not.toContain("run_away");
  } finally {
    definition.mockRestore();
  }
});

test("kite offers approach moves only beyond spell range", () => {
  const { actions, combat, motion } = setup();
  const definition = jest.spyOn(combat, "definition").mockReturnValue(spell());
  try {
    motion.observe(2n, { mapId: 530, orientation: 0, x: 40, y: 0, z: 0 });
    const far = idsOf(actions.observe(kite));
    expect(far).toContain("run_ahead");
    expect(far).not.toContain("run_away");
    motion.observe(2n, { mapId: 530, orientation: 0, x: 30, y: 0, z: 0 });
    const edge = idsOf(actions.observe(kite));
    expect(edge).not.toContain("run_ahead");
    expect(edge).not.toContain("run_away");
    expect(edge).toContain("stop");
    expect(edge).toContain("spell:17:target");
  } finally {
    definition.mockRestore();
  }
});

test("kite withholds run_away when the leg would leave spell range", () => {
  const { actions, combat, motion } = setup();
  const definition = jest.spyOn(combat, "definition").mockReturnValue(spell());
  try {
    motion.observe(2n, {
      mapId: 530,
      orientation: 0,
      x: 30 - KITE_RANGE_MARGIN_YD - 10 + 1,
      y: 0,
      z: 0,
    });
    const found = idsOf(actions.observe(kite));
    expect(found).not.toContain("run_away");
  } finally {
    definition.mockRestore();
  }
});

test("wait stops when the current direction is no longer legal", () => {
  const blocked = { wall: false };
  const { actions, combat, control } = setup(() => 1000, {
    ground: {
      height: (_mapId, _x, _y, from) => from?.z,
      pathClear: () => !blocked.wall,
    },
  });
  const definition = jest.spyOn(combat, "definition").mockReturnValue(spell());
  try {
    actions.execute("run_ahead", context);
    expect(control.snapshot().moving).toBe(true);
    blocked.wall = true;
    actions.execute("wait", context);
    expect(control.snapshot().moving).toBe(false);
  } finally {
    definition.mockRestore();
  }
});

test("a refused kite move is masked without ending the fight", () => {
  const blocked = { wall: false };
  const { actions, combat, control } = setup(() => 1000, {
    ground: {
      height: (_mapId, _x, _y, from) => from?.z,
      pathClear: () => !blocked.wall,
    },
  });
  const definition = jest.spyOn(combat, "definition").mockReturnValue(spell());
  try {
    actions.execute("run_away", kite);
    expect(control.snapshot().moving).toBe(true);
    actions.execute("stop", kite);
    blocked.wall = true;
    expect(() => control.drive({ move: "forward" }, 1500)).toThrow(
      "obstructed",
    );
    expect(control.snapshot().blockedReason).toBe("obstructed");
    const frame = actions.observe(kite);
    expect(frame.outcome).toBeUndefined();
    expect(idsOf(frame)).not.toContain("run_away");
    actions.execute("face_target", kite);
    expect(idsOf(actions.observe(kite))).toContain("spell:17:target");
    const plain = actions.observe(context);
    expect(plain.outcome).toEqual({
      reason: "obstructed",
      status: "blocked",
    });
  } finally {
    definition.mockRestore();
  }
});

test("a refused move mask expires after a few seconds", () => {
  let now = 1000;
  const blocked = { wall: false };
  const { actions, combat, control } = setup(() => now, {
    ground: {
      height: (_mapId, _x, _y, from) => from?.z,
      pathClear: () => !blocked.wall,
    },
  });
  const definition = jest.spyOn(combat, "definition").mockReturnValue(spell());
  try {
    actions.execute("run_away", kite);
    actions.execute("stop", kite);
    blocked.wall = true;
    expect(() => control.drive({ move: "forward" }, 1500)).toThrow(
      "obstructed",
    );
    blocked.wall = false;
    expect(idsOf(actions.observe(kite))).not.toContain("run_away");
    now += KITE_MASK_MS + 1;
    expect(idsOf(actions.observe(kite))).toContain("run_away");
  } finally {
    definition.mockRestore();
  }
});

function closingOutcome(kiting: boolean) {
  let now = 1000;
  const { actions, combat, motion } = setup(() => now);
  const definition = jest
    .spyOn(combat, "definition")
    .mockReturnValue(rangedSpell(5));
  try {
    motion.observe(2n, {
      mapId: 530,
      orientation: 0,
      x: KITE_CLOSING_RANGE_YD - 1,
      y: 0,
      z: 0,
    });
    const first = actions.observe(kiting ? kite : context).outcome;
    now += 6000;
    motion.observe(2n, {
      mapId: 530,
      orientation: 0,
      x: KITE_CLOSING_RANGE_YD - 1.5,
      y: 0,
      z: 0,
    });
    const second = actions.observe(kiting ? kite : context).outcome;
    return { first, second };
  } finally {
    definition.mockRestore();
  }
}

test("the unreachable timer holds while the target closes inside spell range", () => {
  const { first, second } = closingOutcome(true);
  expect(first).toBeUndefined();
  expect(second).toBeUndefined();
});

test("the unreachable timer fires without kite while the target closes", () => {
  const { first, second } = closingOutcome(false);
  expect(first).toBeUndefined();
  expect(second).toEqual({
    reason: "target_unreachable",
    status: "blocked",
  });
});

test("the unreachable timer holds inside spell range below minimum range", () => {
  let now = 1000;
  const short = rangedSpell(30);
  short.range = { flags: 0, id: 2, maxHostile: 30, minHostile: 8 };
  const { actions, combat, motion } = setup(() => now);
  const definition = jest.spyOn(combat, "definition").mockReturnValue(short);
  try {
    motion.observe(2n, { mapId: 530, orientation: 0, x: 5, y: 0, z: 0 });
    expect(actions.observe(kite).outcome).toBeUndefined();
    now += 6000;
    expect(actions.observe(kite).outcome).toBeUndefined();
  } finally {
    definition.mockRestore();
  }
});

test("kite names root and slow spells in candidates and the melee block", () => {
  const { actions, combat } = setup();
  const definition = jest
    .spyOn(combat, "definition")
    .mockImplementation((id) => {
      if (id === 17) return rangedSpell(30, 33);
      return spell();
    });
  try {
    const frame = actions.observe(kite);
    const cast = frame.candidates.find(
      (candidate) => candidate.id === "spell:17:target",
    );
    expect(cast?.description).toContain("slows the target");
    expect(frame.observation["melee"]).toMatchObject({
      kite: expect.objectContaining({ retreat: true }),
    });
    const plain = actions.observe(context);
    const plainCast = plain.candidates.find(
      (candidate) => candidate.id === "spell:17:target",
    );
    expect(plainCast?.description).not.toContain("slows the target");
    expect(plain.observation["melee"]).not.toHaveProperty("kite");
  } finally {
    definition.mockRestore();
  }
});

describe("slowFirst", () => {
  const SELF = 1n;
  const FOE = 2n;
  const fireball = { effects: [{ applyAura: 0, effect: 2 }] };
  const frostbolt = {
    effects: [
      { applyAura: 0, effect: 2 },
      { applyAura: 33, effect: 6 },
    ],
  };
  const nova = { effects: [{ applyAura: 26, effect: 6 }] };
  const ready = [
    { id: "fireball", spell: fireball, target: FOE },
    { id: "frostbolt", spell: frostbolt, target: FOE },
    { id: "nova", spell: nova, target: SELF },
  ];
  const ids = (list: readonly { id: string }[]) => list.map((a) => a.id);

  test("an unsnared target at range is offered only the targeted slow", () => {
    expect(
      ids(slowFirst(ready, { distance: 25, selfGuid: SELF, snared: false })),
    ).toEqual(["frostbolt"]);
  });

  test("a self-centred root joins once the target is close", () => {
    expect(
      ids(
        slowFirst(ready, {
          distance: KITE_SELF_SNARE_YD,
          selfGuid: SELF,
          snared: false,
        }),
      ),
    ).toEqual(["frostbolt", "nova"]);
  });

  test("a snared target, or no snare to cast, keeps every spell", () => {
    expect(
      ids(slowFirst(ready, { distance: 25, selfGuid: SELF, snared: true })),
    ).toEqual(["fireball", "frostbolt", "nova"]);
    expect(
      ids(
        slowFirst(ready.slice(0, 1), {
          distance: 25,
          selfGuid: SELF,
          snared: false,
        }),
      ),
    ).toEqual(["fireball"]);
  });
});
