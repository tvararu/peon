import { describe, expect, test } from "bun:test";
import type { GameLogRow } from "#harness/grader/draft-gamelog";
import {
  pilotKite,
  pilotNoAggro,
  travelNoAggro,
} from "#harness/grader/draft-measure-pilot-units";

const row = (
  line: number,
  event: string,
  ts: number,
  data: unknown = {},
): GameLogRow => ({ data, event, line, seq: line, text: event, ts });

const pilotStart = (ts: number, runId = "p1") =>
  row(1, "pilot/started", ts, { objective: { x: 1, y: 2 }, runId });
const pilotEnd = (line: number, ts: number, status: string, runId = "p1") =>
  row(line, "pilot/ended", ts, { runId, status });
const travelStart = (ts: number, id = "t1") =>
  row(1, "run/started", ts, { id, kind: "travel" });
const travelEnd = (line: number, ts: number, status: string, id = "t1") =>
  row(line, "run/ended", ts, { id, status });

describe("pilotNoAggro", () => {
  test("a completed run with no offending rows is met", () => {
    const measured = pilotNoAggro([
      pilotStart(1000),
      row(2, "pilot/decision", 1100, { runId: "p1" }),
      row(3, "snapshot/world", 1200, { attackers: [] }),
      pilotEnd(4, 1300, "completed"),
    ]);
    expect(measured.met).toBe(true);
  });

  test("an attacked row fails and names the first offender", () => {
    const measured = pilotNoAggro([
      pilotStart(1000),
      row(2, "combat/attacked", 1100),
      pilotEnd(3, 1300, "completed"),
    ]);
    expect(measured.met).toBe(false);
    expect(measured.line).toBe(2);
  });

  test("a threat row or an attacker snapshot fails", () => {
    const threatened = pilotNoAggro([
      pilotStart(1000),
      row(2, "threat/engaged", 1100),
      pilotEnd(3, 1300, "completed"),
    ]);
    expect(threatened.met).toBe(false);
    const snapped = pilotNoAggro([
      pilotStart(1000),
      row(2, "snapshot/world", 1100, { attackers: ["mob"] }),
      pilotEnd(3, 1300, "completed"),
    ]);
    expect(snapped.met).toBe(false);
  });

  test("a correction or an incomplete run fails", () => {
    const corrected = pilotNoAggro([
      pilotStart(1000),
      row(2, "control/server_correction", 1100),
      pilotEnd(3, 1300, "completed"),
    ]);
    expect(corrected.met).toBe(false);
    const stopped = pilotNoAggro([
      pilotStart(1000),
      pilotEnd(2, 1300, "stopped"),
    ]);
    expect(stopped.met).toBe(false);
  });

  test("rows outside the run window do not count", () => {
    const measured = pilotNoAggro([
      row(1, "combat/attacked", 500),
      pilotStart(1000),
      pilotEnd(2, 1300, "completed"),
      row(3, "threat/engaged", 1400),
    ]);
    expect(measured.met).toBe(true);
  });

  test("an attack during an earlier pilot run fails a later clean run", () => {
    const measured = pilotNoAggro([
      pilotStart(1000, "p1"),
      row(2, "combat/attacked", 1100),
      pilotEnd(3, 1200, "stopped", "p1"),
      row(4, "pilot/started", 2000, { objective: { x: 1, y: 2 }, runId: "p2" }),
      row(5, "pilot/decision", 2100, { runId: "p2", x: 1, y: 2 }),
      pilotEnd(6, 2500, "completed", "p2"),
    ]);
    expect(measured.met).toBe(false);
    expect(measured.line).toBe(2);
  });
});

describe("travelNoAggro", () => {
  test("a succeeded travel run with no offending rows is met", () => {
    const measured = travelNoAggro([
      travelStart(1000),
      row(2, "snapshot/world", 1200, { attackers: [] }),
      travelEnd(3, 1300, "succeeded"),
    ]);
    expect(measured.met).toBe(true);
  });

  test("an attacked row fails the travel variant", () => {
    const measured = travelNoAggro([
      travelStart(1000),
      row(2, "combat/attacked", 1100),
      travelEnd(3, 1300, "succeeded"),
    ]);
    expect(measured.met).toBe(false);
    expect(measured.line).toBe(2);
  });

  test("an attack during an earlier travel run fails a later clean run", () => {
    const measured = travelNoAggro([
      travelStart(1000, "t1"),
      row(2, "combat/attacked", 1100),
      travelEnd(3, 1200, "failed", "t1"),
      row(4, "run/started", 2000, { id: "t2", kind: "travel" }),
      travelEnd(5, 2500, "succeeded", "t2"),
    ]);
    expect(measured.met).toBe(false);
    expect(measured.line).toBe(2);
  });
});

describe("pilotKite", () => {
  const STALKER = { entry: 15_651, name: "Springpaw Stalker" };
  const engageStart = (
    ts: number,
    args: Record<string, unknown> = { kite: true, target: STALKER.name },
    line = 1,
  ) => row(line, "run/started", ts, { args, id: "e1", kind: "engage" });
  const fightStart = (
    line: number,
    ts: number,
    over: { guid?: string; ref?: string; runId?: string } = {},
  ) => ({
    ...row(line, "fight/start", ts),
    guid: over.guid ?? "f1",
    ref: over.ref ?? "u9",
    runId: over.runId ?? "e1",
  });
  const kill = (
    line: number,
    ts: number,
    name = STALKER.name,
    guid = "f1",
  ) => ({ ...row(line, "combat/kill_credit", ts, { name, xp: 80 }), guid });
  const world = (line: number, ts: number, hp: number, maxHp = 500) =>
    row(line, "snapshot/world", ts, {
      attackers: [],
      self: { hp, maxHp },
    });
  const swing = (line: number, ts: number, guid = "f1") => ({
    ...row(line, "combatlog/swing_in", ts, { outcome: "hits", source: guid }),
    guid,
  });
  const context = (
    packets: unknown[] | null = [],
    jev: unknown[] | null = [],
  ) => ({ creature: STALKER, jev, packets, steers: [] });
  const separated = (ts: number, separation: number) => ({
    loop: "combat",
    observation: { separation },
    ts,
    type: "request",
  });
  const fight = () => [
    engageStart(1000),
    fightStart(2, 1050),
    world(3, 1100, 480),
    world(4, 2000, 430),
    kill(5, 3000),
  ];
  const awayContext = () =>
    context(
      [
        { at: 1500, dir: "out", opcode: "MSG_MOVE_START_BACKWARD" },
        { at: 2500, dir: "out", opcode: "MSG_MOVE_START_STRAFE_LEFT" },
      ],
      [separated(1200, 8), separated(1800, 14), separated(2800, 18)],
    );

  test("a clean kill after a kite engage is met with health and moves", () => {
    const measured = pilotKite(fight(), awayContext());
    expect(measured.met).toBe(true);
    expect(measured.line).toBe(5);
    expect(measured.observed).toMatchObject({
      endHealthPct: 86,
      movesAway: 2,
      movesTotal: 2,
      swings: 0,
    });
  });

  test("a u-ref or an omitted target binds through the fight's guid", () => {
    const byRef = pilotKite(
      [
        engageStart(1000, { kite: true, target: "u9" }),
        fightStart(2, 1050),
        kill(3, 3000),
      ],
      context(),
    );
    expect(byRef.met).toBe(true);
    const omitted = pilotKite(
      [engageStart(1000, { kite: true }), fightStart(2, 1050), kill(3, 3000)],
      context(),
    );
    expect(omitted.met).toBe(true);
  });

  test("the wrong mob killed fails, by name and by guid", () => {
    const byName = pilotKite(
      [
        engageStart(1000, { kite: true, target: "u9" }),
        fightStart(2, 1050, { guid: "f2", ref: "u9", runId: "e1" }),
        kill(3, 3000, "Eversong Tender", "f2"),
      ],
      context(),
    );
    expect(byName.met).toBe(false);
    expect(byName.observed).toMatchObject({
      reason: "no combat/kill_credit for Springpaw Stalker",
    });
    const byGuid = pilotKite(
      [
        engageStart(1000, { kite: true, target: "u9" }),
        fightStart(2, 1050, { guid: "f2", ref: "u9", runId: "e1" }),
        kill(3, 3000, STALKER.name, "f1"),
      ],
      context(),
    );
    expect(byGuid.met).toBe(false);
    expect(byGuid.observed).toMatchObject({
      reason:
        "no engage with kite: true on the guid of the Springpaw Stalker kill",
    });
  });

  test("a kill whose entry differs from the scenario's fails", () => {
    const measured = pilotKite(
      [
        engageStart(1000),
        fightStart(2, 1050),
        row(3, "entity/appear", 1060, { entry: 15_652 }),
        kill(4, 3000),
      ].map((entry) =>
        entry.event === "entity/appear" ? { ...entry, guid: "f1" } : entry,
      ),
      context(),
    );
    expect(measured.met).toBe(false);
  });

  test("no engage with kite: true fails", () => {
    const plain = pilotKite(
      [
        engageStart(1000, { target: STALKER.name }),
        fightStart(2, 1050),
        kill(3, 3000),
      ],
      context(),
    );
    expect(plain.met).toBe(false);
    const explicitFalse = pilotKite(
      [
        engageStart(1000, { kite: false, target: STALKER.name }),
        fightStart(2, 1050),
        kill(3, 3000),
      ],
      context(),
    );
    expect(explicitFalse.met).toBe(false);
  });

  test("a kill before the kite engage fails", () => {
    const measured = pilotKite(
      [
        fightStart(1, 500),
        kill(2, 900),
        engageStart(1000),
        fightStart(4, 1050),
      ],
      context(),
    );
    expect(measured.met).toBe(false);
  });

  test("a swing between engage and the kill fails", () => {
    const measured = pilotKite(
      [engageStart(1000), fightStart(2, 1050), swing(3, 2000), kill(4, 3000)],
      context(),
    );
    expect(measured.met).toBe(false);
    expect(measured.observed).toMatchObject({ swings: 1 });
  });

  test("a swing before the engage but in the fight fails", () => {
    const measured = pilotKite(
      [
        swing(1, 700),
        engageStart(1000, undefined, 2),
        fightStart(3, 1050),
        kill(4, 3000),
      ],
      context(),
    );
    expect(measured.met).toBe(false);
    expect(measured.observed).toMatchObject({ fightFrom: 700, swings: 1 });
  });

  test("a fight started by a travel run counts from its first contact", () => {
    const measured = pilotKite(
      [
        fightStart(1, 500, { runId: "t1" }),
        swing(2, 700),
        engageStart(1000, undefined, 3),
        fightStart(4, 1050),
        kill(5, 3000),
      ],
      context(),
    );
    expect(measured.met).toBe(false);
    expect(measured.observed).toMatchObject({ fightFrom: 500, swings: 1 });
  });

  test("swings from other creatures before the fight or after the kill do not count", () => {
    const measured = pilotKite(
      [
        swing(1, 500, "f9"),
        ...fight(),
        row(6, "combatlog/swing_in", 4000, { outcome: "hits" }),
      ],
      context(),
    );
    expect(measured.met).toBe(true);
  });

  test("no kill fails, and a check without a creature fails", () => {
    const missing = pilotKite([engageStart(1000)], context());
    expect(missing.met).toBe(false);
    const unnamed = pilotKite(fight(), { jev: [], packets: [], steers: [] });
    expect(unnamed.met).toBe(false);
  });

  test("death after the kill fails", () => {
    const measured = pilotKite(
      [...fight(), row(6, "life/dead", 4000, {})],
      context(),
    );
    expect(measured.met).toBe(false);
  });

  test("no engage fails", () => {
    const measured = pilotKite([kill(1, 1000)], context());
    expect(measured.met).toBe(false);
  });

  test("only moves that open the separation count as away", () => {
    const measured = pilotKite(
      fight(),
      context(
        [
          { at: 1500, dir: "out", opcode: "MSG_MOVE_START_BACKWARD" },
          { at: 2500, dir: "out", opcode: "MSG_MOVE_START_FORWARD" },
          { at: 2600, dir: "out", opcode: "MSG_MOVE_START_TURN_LEFT" },
          { at: 2700, dir: "in", opcode: "MSG_MOVE_START_BACKWARD" },
        ],
        [separated(1200, 8), separated(1800, 14), separated(2800, 10)],
      ),
    );
    expect(measured.met).toBe(true);
    expect(measured.observed).toMatchObject({ movesAway: 1, movesTotal: 2 });
  });

  test("missing packets or jev leaves moves null with a reason", () => {
    const measured = pilotKite(fight(), context(null, null));
    expect(measured.met).toBe(true);
    expect(measured.observed).toMatchObject({
      movesAway: null,
      reason: "packets.jsonl or jev.jsonl is missing",
    });
  });
});
