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
  const engageStart = (ts: number, target: string, line = 1) =>
    row(line, "run/started", ts, {
      args: { kite: true, target },
      id: "e1",
      kind: "engage",
    });
  const kill = (line: number, ts: number, name = "Springpaw Stalker") => ({
    ...row(line, "combat/kill_credit", ts, { name, xp: 80 }),
    guid: "f1",
  });
  const world = (line: number, ts: number, hp: number, maxHp = 500) =>
    row(line, "snapshot/world", ts, {
      attackers: [],
      self: { hp, maxHp },
    });
  const context = (
    packets: unknown[] | null = [],
    jev: unknown[] | null = [],
  ) => ({ jev, packets, steers: [] });
  const separated = (ts: number, separation: number) => ({
    loop: "combat",
    observation: { separation },
    ts,
    type: "request",
  });
  const fight = () => [
    engageStart(1000, "Springpaw Stalker"),
    world(2, 1100, 480),
    world(3, 2000, 430),
    kill(4, 3000),
  ];
  const awayContext = () =>
    context(
      [
        { at: 1500, dir: "out", opcode: "MSG_MOVE_START_BACKWARD" },
        { at: 2500, dir: "out", opcode: "MSG_MOVE_START_STRAFE_LEFT" },
      ],
      [separated(1200, 8), separated(1800, 14), separated(2800, 18)],
    );

  test("a kill with no swings in the fight is met with health and moves", () => {
    const measured = pilotKite(fight(), awayContext());
    expect(measured.met).toBe(true);
    expect(measured.line).toBe(4);
    expect(measured.observed).toMatchObject({
      endHealthPct: 86,
      movesAway: 2,
      movesTotal: 2,
      swings: 0,
    });
  });

  test("a swing between engage and the kill fails", () => {
    const measured = pilotKite(
      [
        engageStart(1000, "Springpaw Stalker"),
        row(2, "combatlog/swing_in", 2000, { outcome: "hits" }),
        kill(3, 3000),
      ],
      context(),
    );
    expect(measured.met).toBe(false);
    expect(measured.observed).toMatchObject({ swings: 1 });
  });

  test("swings before engage or after the kill do not count", () => {
    const measured = pilotKite(
      [
        row(1, "combatlog/swing_in", 500, { outcome: "miss" }),
        ...fight(),
        row(6, "combatlog/swing_in", 4000, { outcome: "hits" }),
      ],
      context(),
    );
    expect(measured.met).toBe(true);
  });

  test("no kill fails, and a kill for another creature does not count", () => {
    const missing = pilotKite(
      [engageStart(1000, "Springpaw Stalker")],
      context(),
    );
    expect(missing.met).toBe(false);
    const other = pilotKite(
      [
        engageStart(1000, "Springpaw Stalker"),
        kill(2, 2000, "Eversong Tender"),
      ],
      context(),
    );
    expect(other.met).toBe(false);
  });

  test("death after the kill fails", () => {
    const measured = pilotKite(
      [...fight(), row(5, "life/dead", 4000, {})],
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
