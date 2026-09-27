import { describe, expect, test } from "bun:test";
import {
  type CombatAura,
  type CombatEvent,
  type CombatState,
  type EntityEvent,
  ObjectType,
  type RecoveryEvent,
  type TacticsEvent,
  type UnitEntity,
} from "@tuicraft/core";
import { createMockHandle } from "@tuicraft/core/test-support/mock-handle";
import {
  combatDrafts,
  cycleDrafts,
  recoveryDrafts,
  tacticsDrafts,
  vitalsDrafts,
} from "#harness/events/rules-combat";
import { testLookup, testRuleInput } from "#test-support/rule-fixtures";

const handle = createMockHandle();
const combatBase = handle.getCombatState();
const recoveryBase = handle.getRecoveryState();
const cycleBase = handle.getCycleState();
const stalker = testLookup({
  unitLevel: () => 7,
  unitName: () => "Springpaw Stalker",
});

function combat(
  type: CombatEvent["type"],
  state: Partial<CombatState> = {},
  over: Partial<CombatEvent> = {},
): CombatEvent {
  return { state: { ...combatBase, ...state }, type, ...over };
}

function aura(slot: number, spellId: number, name?: string): CombatAura {
  return {
    ...(name === undefined ? {} : { name }),
    caster: 1n,
    duration: 30_000,
    flags: 0,
    level: 10,
    slot,
    spellId,
    stacks: 1,
    timeLeft: 30_000,
  };
}

function self(health: number, guid = 1n): UnitEntity {
  return {
    class_: 5,
    displayId: 0,
    entry: 0,
    factionTemplate: 0,
    gender: 0,
    guid,
    health,
    level: 10,
    maxHealth: 100,
    maxPower: [],
    name: "Fgk",
    npcFlags: 0,
    objectType: ObjectType.PLAYER,
    position: undefined,
    power: [],
    race: 10,
    rawFields: new Map(),
    scale: 1,
    target: 0n,
    unitFlags: 0,
  };
}

function hp(health: number, changed = ["health"]): EntityEvent {
  return { changed, entity: self(health), type: "update" };
}

function life(state: RecoveryEvent["state"]["life"]): RecoveryEvent {
  return {
    at: 0,
    state: { ...recoveryBase, life: state },
    type: "life_observed",
  };
}

describe("combatDrafts", () => {
  test("an attack wakes only while no run is active", () => {
    const rc = testRuleInput({ lookup: stalker });
    expect(
      combatDrafts(combat("attacked", {}, { attacker: 0x2an }), rc),
    ).toEqual([
      {
        class: "wake",
        data: { attacker: "2a", name: "Springpaw Stalker" },
        domain: "combat",
        event: "combat/attacked",
        guid: "2a",
        ref: "u42",
        text: "Springpaw Stalker u42 attacks you.",
      },
    ]);
    expect(
      combatDrafts(combat("attacked", {}, { attacker: 0x2an }), {
        ...rc,
        runActive: true,
      })[0]?.class,
    ).toBe("log");
  });

  test("attack start and casts are log rows", () => {
    const rc = testRuleInput({ lookup: stalker });
    expect(
      combatDrafts(combat("attack_started", { attackTarget: 0x2an }), rc)[0],
    ).toMatchObject({
      class: "log",
      event: "combat/attack_start",
      text: "You attack Springpaw Stalker u42.",
    });
    const lastOutcome = {
      at: 0,
      kind: "cast" as const,
      reason: "out_of_range",
      spellId: 585,
      status: "failed" as const,
      target: 0x2an,
    };
    const failed = combat(
      "cast_failed",
      { lastOutcome },
      { reason: "cast_failed:out_of_range", spellName: "Smite" },
    );
    expect(combatDrafts(failed, rc)).toEqual([
      {
        class: "log",
        data: {
          name: "Smite",
          reason: "cast_failed:out_of_range",
          result: "failed",
          spellId: 585,
          target: "2a",
        },
        domain: "combat",
        event: "combat/cast",
        text: "Cast Smite failed (cast_failed:out_of_range).",
      },
    ]);
    expect(combatDrafts(combat("cast_sent"), rc)).toEqual([]);
  });

  test("a kill gives kill credit and xp once", () => {
    const rc = testRuleInput({
      lookup: testLookup({
        experience: () => ({ next: 8000, xp: 4200 }),
        unitName: () => "Springpaw Stalker",
      }),
    });
    const event = combat("xp", {
      lastXp: { at: 10, kind: "kill", total: 130, victim: 0x2an },
    });
    expect(combatDrafts(event, rc)).toEqual([
      {
        class: "passive",
        data: { name: "Springpaw Stalker", xp: 130 },
        domain: "combat",
        event: "combat/kill_credit",
        guid: "2a",
        ref: "u42",
        text: "Kill credit: Springpaw Stalker u42 (+130 XP).",
      },
      {
        class: "passive",
        data: {
          amount: 130,
          next: 8000,
          source: "kill",
          total: 4200,
          victim: "2a",
        },
        domain: "xp",
        event: "xp/gain",
        text: "You gain 130 XP.",
      },
    ]);
    expect(combatDrafts(event, rc)).toEqual([]);
  });

  test("a level up is passive once", () => {
    const rc = testRuleInput();
    const event = combat("level_up", {
      lastLevelUp: {
        at: 11,
        healthDelta: 10,
        level: 11,
        powerDeltas: [],
        statDeltas: [],
      },
    });
    expect(combatDrafts(event, rc)[0]).toMatchObject({
      class: "passive",
      data: { level: 11 },
      event: "xp/level_up",
      text: "You reached level 11.",
    });
    expect(combatDrafts(event, rc)).toEqual([]);
  });

  test("auras are logged as gains and fades by slot", () => {
    const rc = testRuleInput();
    const events = (auras: CombatAura[]) =>
      combatDrafts(combat("aura", { auras }), rc).map((draft) => [
        draft.event,
        draft.data["spellId"],
      ]);
    expect(events([aura(0, 433)])).toEqual([["aura/gain", 433]]);
    expect(events([])).toEqual([["aura/fade", 433]]);
    expect(events([aura(0, 433), aura(1, 1243)])).toEqual([
      ["aura/gain", 433],
      ["aura/gain", 1243],
    ]);
  });

  test("aura rows name the spell and keep its name for the fade", () => {
    const rc = testRuleInput();
    const rows = (auras: CombatAura[]) =>
      combatDrafts(combat("aura", { auras }), rc).map((draft) => [
        draft.text,
        draft.data["name"],
      ]);
    expect(rows([aura(0, 17, "Power Word: Shield"), aura(1, 433)])).toEqual([
      ["Power Word: Shield gained.", "Power Word: Shield"],
      ["spell 433 gained.", undefined],
    ]);
    expect(rows([])).toEqual([
      ["Power Word: Shield faded.", "Power Word: Shield"],
      ["spell 433 faded.", undefined],
    ]);
  });
});

describe("vitalsDrafts", () => {
  test("wakes once per line and re-arms 10 points above it", () => {
    const rc = testRuleInput();
    const lines = (health: number) =>
      vitalsDrafts(hp(health), rc).map((draft) => draft.data["threshold"]);
    expect(lines(80)).toEqual([]);
    expect(lines(45)).toEqual([50]);
    expect(lines(40)).toEqual([]);
    expect(lines(20)).toEqual([25]);
    expect(lines(70)).toEqual([]);
    expect(lines(40)).toEqual([50]);
  });

  test("a big drop gives one row at the lowest line", () => {
    const [draft] = vitalsDrafts(hp(20), testRuleInput());
    expect(draft).toEqual({
      class: "wake",
      data: { hp: 20, maxHp: 100, pct: 20, threshold: 25 },
      domain: "life",
      event: "life/low_health",
      text: "You are at 20% HP (20/100).",
    });
    expect(
      vitalsDrafts(hp(20), testRuleInput({ runActive: true }))[0]?.class,
    ).toBe("log");
  });

  test("ignores other units, other fields and death", () => {
    const rc = testRuleInput();
    expect(
      vitalsDrafts(
        { changed: ["health"], entity: self(10, 7n), type: "update" },
        rc,
      ),
    ).toEqual([]);
    expect(vitalsDrafts(hp(10, ["level"]), rc)).toEqual([]);
    expect(vitalsDrafts(hp(0), rc)).toEqual([]);
  });
});

describe("tacticsDrafts and cycleDrafts", () => {
  const started: TacticsEvent = {
    framing: "none",
    instruction: "fight",
    runId: "t1",
    targetGuid: "0x2a",
    type: "started",
  };

  test("logs a fight start and end with its duration", () => {
    const rc = testRuleInput({
      lookup: testLookup({
        selfVitals: () => ({ hp: 190, maxHp: 217, maxPower: 300, power: 250 }),
        unitLevel: () => 7,
        unitName: () => "Springpaw Stalker",
      }),
    });
    expect(tacticsDrafts(started, rc)).toEqual([
      {
        class: "log",
        data: {
          hpBefore: 190,
          jevRun: "t1",
          level: 7,
          manaBefore: 250,
          maxHp: 217,
          name: "Springpaw Stalker",
          target: "2a",
        },
        domain: "fight",
        event: "fight/start",
        guid: "2a",
        ref: "u42",
        text: "Fight started: Springpaw Stalker u42.",
      },
    ]);
    const end = tacticsDrafts(
      {
        reason: "server_kill_credit",
        runId: "t1",
        status: "completed",
        type: "outcome",
      },
      { ...rc, now: rc.now + 9000 },
    );
    expect(end[0]).toMatchObject({
      data: {
        durationMs: 9000,
        outcome: "completed",
        reason: "server_kill_credit",
      },
      event: "fight/end",
      text: "Fight ended: Springpaw Stalker u42 completed (server_kill_credit).",
    });
    expect(
      tacticsDrafts(
        {
          reason: "done",
          runId: "t1",
          state: handle.getTacticsState(),
          type: "stopped",
        },
        rc,
      ),
    ).toEqual([]);
  });

  test("a stop without an outcome ends the fight with the last outcome", () => {
    const rc = testRuleInput();
    tacticsDrafts(started, rc);
    const state = {
      ...handle.getTacticsState(),
      lastOutcome: { reason: "target_lost", status: "blocked" as const },
    };
    const [end] = tacticsDrafts(
      { reason: "halt", runId: "t1", state, type: "stopped" },
      rc,
    );
    expect(end?.data).toMatchObject({
      outcome: "blocked",
      reason: "target_lost",
    });
  });

  test("fights inside a cycle are passive; cycle steps are run progress", () => {
    const rc = testRuleInput();
    expect(
      cycleDrafts({ at: 0, state: cycleBase, type: "started" }, rc),
    ).toEqual([]);
    expect(tacticsDrafts(started, rc)[0]?.class).toBe("passive");
    const done = cycleDrafts(
      {
        at: 0,
        state: { ...cycleBase, maxStarts: 3, startsUsed: 1 },
        type: "target_done",
      },
      rc,
    );
    expect(done).toEqual([
      {
        class: "log",
        data: {
          cycle: "target_done",
          fights: 1,
          maxFights: 3,
          maxStarts: 3,
          startsUsed: 1,
        },
        domain: "run",
        event: "run/progress",
        text: "cycle target done (1 of 3 fights)",
      },
    ]);
    cycleDrafts({ at: 0, state: cycleBase, type: "stopped" }, rc);
    expect(tacticsDrafts({ ...started, runId: "t2" }, rc)[0]?.class).toBe(
      "log",
    );
  });
});

describe("recoveryDrafts", () => {
  test("wakes on each change of life only", () => {
    const rc = testRuleInput({
      lookup: testLookup({
        lastAttacker: () => 0x2an,
        unitName: () => "Springpaw Stalker",
      }),
    });
    expect(recoveryDrafts(life("alive"), rc)).toEqual([]);
    expect(recoveryDrafts(life("dead"), rc)[0]).toMatchObject({
      class: "wake",
      data: { killer: "2a", killerName: "Springpaw Stalker" },
      event: "life/dead",
      ref: "u42",
      text: "You died (last hit by Springpaw Stalker u42).",
    });
    expect(recoveryDrafts(life("dead"), rc)).toEqual([]);
    expect(recoveryDrafts(life("ghost"), rc)[0]).toMatchObject({
      class: "wake",
      event: "life/released",
    });
    expect(recoveryDrafts(life("alive"), rc)[0]).toMatchObject({
      class: "wake",
      data: { from: "ghost" },
      event: "life/alive",
      text: "You are alive again.",
    });
  });

  test("a resurrection offer is passive", () => {
    const resurrection = {
      delayMs: undefined,
      guid: 7n,
      name: "Bob",
      readyAt: undefined,
      receivedAt: 0,
      reserved: 0,
      response: "unanswered" as const,
      sickness: 0,
    };
    const event: RecoveryEvent = {
      at: 0,
      state: { ...recoveryBase, resurrection },
      type: "resurrection_offered",
    };
    expect(recoveryDrafts(event, testRuleInput())).toEqual([
      {
        class: "passive",
        data: { from: "Bob" },
        domain: "life",
        event: "life/resurrect_offer",
        text: "Bob offers to resurrect you.",
      },
    ]);
  });
});
