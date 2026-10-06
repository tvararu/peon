import { describe, expect, test } from "bun:test";
import {
  type AreaEventOf,
  type AreaState,
  ObjectType,
  UNIT_FIELDS,
} from "@peon/core";
import type { EngageAfter } from "#harness/contract/details";
import { engageSpec } from "#harness/tools/engage";
import { decisionKind } from "#harness/tools/engage-tally";
import {
  field,
  KILL,
  lootsFang,
  outcome,
  STALKER,
  STALKER_2,
  tactics,
  xp,
} from "#test-support/engage-fixtures";
import { toolCtx } from "#test-support/ops-fixtures";

const ME = 0x2an;
const BOAR = 0xf1_30_00_0c_1a_00_0a_bcn;
const PET = 0xf1_40_00_0c_82_00_01_b2n;
const PET_LOW = 0x82_00_01_b2;
const PET_HIGH = 0xf1_40_00_0c;

type LogEvent = AreaEventOf<"combatlog">;

type LogEntry = AreaState<"combatlog">["entries"][number];
type Field = Awaited<ReturnType<typeof field>>;
type Feed = { emit: (...rows: LogEntry[]) => void };

const RING = 500;

function feedLog(t: Field): Feed {
  const combat = t.handle.getCombatState();
  t.handle.getCombatState = () => ({
    ...combat,
    self: { ...combat.self, guid: ME },
  });
  t.handle.spellDefinition = (id) =>
    id === 122 ? ({ id, name: "Frost Nova" } as never) : undefined;
  const listeners = new Set<(event: LogEvent) => void>();
  const kept: LogEntry[] = [];
  Object.assign(t.handle, {
    combatlog: {
      act: {},
      onEvent: (cb: (event: LogEvent) => void) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      state: () => ({
        comboPoints: undefined,
        dropped: 0,
        entries: kept.slice(-RING),
        fight: undefined,
        immunities: [],
        kills: [],
        lastFight: undefined,
      }),
    },
  });
  return {
    emit: (...rows) => {
      for (const entry of rows) {
        kept.push({ ...entry, at: t.clock.now() });
        const { crit, ...plain } = entry;
        for (const cb of listeners)
          cb({ ...plain, ...(crit ? { crit: 1 } : {}), type: "entry" });
      }
    },
  };
}

function row(over: Partial<LogEntry>): LogEntry {
  return { amount: 0, at: 0, kind: "melee", source: ME, target: BOAR, ...over };
}

function withPet(t: Field): { dismiss: () => void } {
  const alive = { pet: true };
  const unit = (fields: [number, number][]) => ({
    createComplete: true,
    health: 100,
    maxHealth: 100,
    name: "Ravager",
    objectType: ObjectType.UNIT,
    rawFields: new Map(fields),
    target: 0n,
  });
  Object.assign(t.handle, {
    getEntity: (guid: bigint) => {
      if (guid === ME)
        return unit([
          [UNIT_FIELDS.SUMMON.offset, PET_LOW],
          [UNIT_FIELDS.SUMMON.offset + 1, PET_HIGH],
        ]);
      return guid === PET && alive.pet ? unit([]) : undefined;
    },
  });
  return {
    dismiss: () => {
      alive.pet = false;
    },
  };
}

test("Jev decision cards name hunter actions by what they do", () => {
  expect(decisionKind("pet_attack")).toBe("attack");
  expect(decisionKind("spell:75:target")).toBe("spell");
  expect(decisionKind("attack")).toBe("attack");
  expect(decisionKind("stop_auto_shot")).toBe("wait");
});

describe("engage fight totals", () => {
  test("the DONE line and the after block carry the fight totals", async () => {
    const t = await field();
    const log = feedLog(t);
    tactics(t.handle, (runId) => {
      log.emit(
        row({ amount: 200 }),
        row({ amount: 112, kind: "spell_damage", spellId: 133 }),
        row({ amount: 145, source: BOAR, target: ME }),
        row({ outcome: "dodge" }),
        row({ kind: "immune", spellId: 122 }),
      );
      xp(t.handle, STALKER, 108);
      outcome(t.handle, runId, KILL);
    });
    lootsFang(t.handle);
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(res.detail).toContain("Dealt 312, took 145");
    expect(res.detail).toContain("avoided: dodge x1");
    expect(res.detail).toContain("immune: Frost Nova");
    expect(res.after).toMatchObject({
      avoided: [{ count: 1, word: "dodge" }],
      castErrors: [{ count: 1, word: "immune" }],
      dealt: 312,
      healed: 0,
      immune: ["Frost Nova"],
      taken: 145,
    });
  });

  test("the totals cover the whole run even when it outgrows the log ring", async () => {
    const t = await field();
    const log = feedLog(t);
    tactics(t.handle, (runId) => {
      log.emit(...Array.from({ length: 700 }, () => row({ amount: 2 })));
      log.emit(
        ...Array.from({ length: 600 }, () =>
          row({ amount: 1, source: BOAR, target: ME }),
        ),
      );
      xp(t.handle, STALKER, 108);
      outcome(t.handle, runId, KILL);
    });
    lootsFang(t.handle);
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(res.after).toMatchObject({ dealt: 1400, taken: 600 });
  });

  test("the totals keep the damage of a pet that is gone by the result", async () => {
    const t = await field();
    const log = feedLog(t);
    const pet = withPet(t);
    tactics(t.handle, (runId) => {
      log.emit(row({ amount: 100 }), row({ amount: 40, source: PET }));
      pet.dismiss();
      log.emit(row({ amount: 25, source: PET }), row({ amount: 10 }));
      xp(t.handle, STALKER, 108);
      outcome(t.handle, runId, KILL);
    });
    lootsFang(t.handle);
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(res.after).toMatchObject({ dealt: 175 });
  });

  test("a unit that never was the pet of the character adds nothing", async () => {
    const t = await field();
    const log = feedLog(t);
    withPet(t);
    tactics(t.handle, (runId) => {
      log.emit(row({ amount: 10 }), row({ amount: 99, source: STALKER_2 }));
      xp(t.handle, STALKER, 108);
      outcome(t.handle, runId, KILL);
    });
    lootsFang(t.handle);
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(res.after).toMatchObject({ dealt: 10 });
  });

  test("a fight with nothing in the combat log adds no totals line", async () => {
    const t = await field();
    feedLog(t);
    tactics(t.handle, (runId) => {
      xp(t.handle, STALKER, 108);
      outcome(t.handle, runId, KILL);
    });
    lootsFang(t.handle);
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(res.detail).not.toContain("Dealt");
    expect(res.after).toMatchObject({
      avoided: [],
      castErrors: [],
      dealt: 0,
      immune: [],
      taken: 0,
    });
  });
});
