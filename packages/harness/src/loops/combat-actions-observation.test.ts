import { expect, jest, test } from "bun:test";
import { type AreaState, ObjectType, UNIT_FIELDS } from "@peon/core";
import { spell } from "@peon/core/test-support/spell-fixtures";
import { CombatActions } from "#harness/loops/combat-actions";
import { context, setup } from "#test-support/combat-actions-fixtures";

type SpellsState = AreaState<"spells">;
type LogState = AreaState<"combatlog">;
type LogEntry = LogState["entries"][number];

const NOW = 100_000;
const SELF = 1n;
const CREATURE = 0xf1_30_00_0c_1a_00_0a_bcn;
const OTHER = 0xf1_30_00_0c_1b_00_0a_bdn;
const AT_CREATURE = { ...context, targetGuid: CREATURE };

function logState(over: Partial<LogState> = {}): LogState {
  return {
    comboPoints: undefined,
    dropped: 0,
    entries: [],
    fight: undefined,
    immunities: [],
    kills: [],
    lastFight: undefined,
    ...over,
  };
}

function logEntry(over: Partial<LogEntry>): LogEntry {
  return {
    amount: 0,
    at: NOW - 1000,
    kind: "melee",
    source: CREATURE,
    target: SELF,
    ...over,
  };
}

function withLog(state: LogState, spells?: SpellsState) {
  const parts = setup(() => NOW);
  const { combat, combatStore, motion, store } = parts;
  store.create(CREATURE, ObjectType.UNIT, {
    health: 100,
    maxHealth: 100,
    rawFields: new Map([[UNIT_FIELDS.HEALTH.offset, 100]]),
    target: SELF,
    unitFlags: 0x8_00_00,
  });
  motion.observe(CREATURE, { mapId: 530, orientation: 0, x: 10, y: 0, z: 0 });
  const definition = jest.spyOn(combat, "definition").mockReturnValue(spell());
  const actions = new CombatActions({
    combat: {
      attack: (guid) => combat.attack(guid),
      cancelCast: () => combat.cancelCast(),
      cast: (id, guid) => combat.cast(id, guid),
      channel: () => combatStore.casts.channel,
      definition: (id) => combat.definition(id),
      halt: () => combat.halt(),
      isAttackingSelf: (guid) => combat.isAttackingSelf(guid),
      petAttack: (pet, guid) => combat.petAttack(pet, guid),
      readyAt: (id) => combat.readyAt(id),
      snapshot: (guid) => combat.snapshot(guid),
      stopAttack: () => combat.stopAttack(),
      stopAutoRepeat: () => combat.stopAutoRepeat(),
    },
    combatLog: () => state,
    ...(spells ? { spells: () => spells } : {}),
    control: parts.control,
    entity: (guid) => store.get(guid),
    now: () => NOW,
    relation: () => "unknown",
  });
  actions.activate(AT_CREATURE);
  return { actions, definition };
}

function observed(state: LogState, spells?: SpellsState) {
  const { actions, definition } = withLog(state, spells);
  try {
    const frame = actions.observe(AT_CREATURE);
    return JSON.parse(JSON.stringify({ ...frame, actions: undefined }));
  } finally {
    definition.mockRestore();
  }
}

test("a retained goto creature target serializes as a hex GUID for Jev", () => {
  const { actions, routes } = setup();
  routes.refuse(
    { x: 5, y: 0 },
    "pathfind_find_height failed (UNKNOWN_HEIGHT)",
    { target: 0xf130003d2108604dn },
  );
  const frame = actions.observe(context);
  const sent = JSON.parse(JSON.stringify(frame.observation));

  expect(sent.navigation).toMatchObject({
    active: false,
    refusal: "stop",
    target: "0xf130003d2108604d",
  });
});

test("a fact the client never observed reaches Jev as null, not a missing key", () => {
  const { actions } = setup(() => 1000, { observeTargetPosition: false });
  const sent = JSON.parse(JSON.stringify(actions.observe(context).observation));

  expect(sent.target).toMatchObject({ health: 100, pose: null });
  expect(sent.attackTarget).toBeNull();
});

test("a running channel suppresses the cast timeouts", () => {
  let time = 1000;
  const { actions, combat, combatStore } = setup(() => time);
  jest.spyOn(combat, "definition").mockReturnValue(spell());
  combatStore.casts.send(() => {}, 17, 2n);
  combatStore.casts.beginChannel({
    durationMs: 30_000,
    spellId: 17,
    target: 2n,
  });
  time += 20_000;
  expect(combatStore.casts.channel).toBeDefined();
  expect(actions.observe(context).outcome).toBeUndefined();
});

test("the observation names damage taken in the last 6 s by source and school", () => {
  const sent = observed(
    logState({
      entries: [
        logEntry({ amount: 5, schoolMask: 1 }),
        logEntry({ amount: 4, at: NOW - 100, schoolMask: 1 }),
        logEntry({ amount: 7, kind: "spell_damage", schoolMask: 4 }),
        logEntry({ amount: 9, at: NOW - 6001, schoolMask: 1 }),
        logEntry({ amount: 8, source: OTHER, target: SELF }),
        logEntry({ amount: 6, source: SELF, target: CREATURE }),
      ],
    }),
  );
  expect(sent.observation.combatLog.damageTaken).toEqual([
    { amount: 9, schoolMask: 1, source: `0x${CREATURE.toString(16)}` },
    { amount: 7, schoolMask: 4, source: `0x${CREATURE.toString(16)}` },
    { amount: 8, schoolMask: null, source: `0x${OTHER.toString(16)}` },
  ]);
});

test("the observation counts the character's own misses in the last 6 s", () => {
  const sent = observed(
    logState({
      entries: [
        logEntry({ outcome: "dodge", source: SELF, target: CREATURE }),
        logEntry({ outcome: "dodge", source: SELF, target: CREATURE }),
        logEntry({ outcome: "miss", source: SELF, target: CREATURE }),
        logEntry({
          at: NOW - 6001,
          outcome: "parry",
          source: SELF,
          target: CREATURE,
        }),
        logEntry({ outcome: "dodge" }),
      ],
    }),
  );
  expect(sent.observation.combatLog.misses).toEqual([
    { count: 2, outcome: "dodge" },
    { count: 1, outcome: "miss" },
  ]);
});

test("the observation shows the target's immunities and the combo points on it", () => {
  const sent = observed(
    logState({
      comboPoints: { points: 3, target: CREATURE },
      immunities: [
        { at: 1, entry: 3098, spellId: 122 },
        { at: 2, entry: 3099, spellId: 116 },
      ],
    }),
  );
  expect(sent.observation.combatLog).toMatchObject({
    comboPoints: 3,
    immunities: [122],
  });
  expect(
    observed(logState({ comboPoints: { points: 2, target: OTHER } }))
      .observation.combatLog.comboPoints,
  ).toBe(0);
});

test("a spell the target is immune to is no candidate and reads immune", () => {
  const free = observed(logState());
  expect(free.candidates.map((c: { id: string }) => c.id)).toContain(
    "spell:17:target",
  );
  const sent = observed(
    logState({ immunities: [{ at: 1, entry: 3098, spellId: 17 }] }),
  );
  expect(sent.candidates.map((c: { id: string }) => c.id)).not.toContain(
    "spell:17:target",
  );
  expect(sent.observation.unavailable).toContainEqual({
    id: "spell:17:target",
    reason: "immune",
  });
});

test("an immunity of another creature or spell leaves the spell a candidate", () => {
  const sent = observed(
    logState({
      immunities: [
        { at: 1, entry: 3099, spellId: 17 },
        { at: 1, entry: 3098, spellId: 18 },
      ],
    }),
  );
  expect(sent.candidates.map((c: { id: string }) => c.id)).toContain(
    "spell:17:target",
  );
});

function spellsState(casts: SpellsState["unitCasts"]): SpellsState {
  return {
    barToggles: undefined,
    channel: undefined,
    inactiveRanks: [],
    modifiers: { flat: {}, pct: {} },
    runes: undefined,
    skills: [],
    totems: [],
    unitCasts: casts,
    mirrorImages: [],
  };
}

function unitCast(over: Partial<SpellsState["unitCasts"][number]>) {
  return {
    durationMs: 2500,
    guid: CREATURE,
    kind: "cast" as const,
    relevant: true,
    spellId: 17,
    startedAt: NOW - 500,
    target: undefined,
    ...over,
  };
}

test("Jev sees what the target is casting and how long is left", () => {
  const sent = observed(logState(), spellsState([unitCast({})]));
  expect(sent.observation.targetCast).toEqual({
    durationMs: 2500,
    kind: "cast",
    remainingMs: 2000,
    spellId: 17,
    spellName: "Fixture spell",
  });
});

test("Jev sees no target cast for another caster, an overdue cast or no state", () => {
  const other = spellsState([unitCast({ guid: OTHER })]);
  const overdue = spellsState([unitCast({ startedAt: NOW - 9000 })]);
  expect(observed(logState(), other).observation.targetCast).toBeNull();
  expect(observed(logState(), overdue).observation.targetCast).toBeNull();
  expect(observed(logState()).observation.targetCast).toBeNull();
});
