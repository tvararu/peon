import { describe, expect, test } from "bun:test";
import type { GameLogRow } from "#harness/grader/draft-gamelog";
import {
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
});
