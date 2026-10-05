import { describe, expect, test } from "bun:test";
import type { GameLogRow } from "#harness/grader/draft-gamelog";
import { kiteClean } from "#harness/grader/draft-measure-kite";

const row = (
  line: number,
  event: string,
  ts: number,
  data: unknown = {},
): GameLogRow => ({
  data,
  event,
  guid: "g1",
  line,
  seq: line,
  text: event,
  ts,
});

const start = row(1, "fight/start", 1000, { name: "Cat", target: "g1" });
const end = (status: string) =>
  row(9, "fight/end", 5000, { outcome: status, reason: "killed" });

describe("kiteClean", () => {
  test("a completed fight with no swing and no death is met", () => {
    const measured = kiteClean([
      row(0, "combat/swung_at", 500, { outcome: "miss" }),
      start,
      row(3, "combat/attacked", 2000),
      end("completed"),
    ]);
    expect(measured.met).toBe(true);
    expect(measured.observed).toMatchObject({ deaths: 0, swings: 0 });
  });

  test("a swing inside the fight fails and names the first one", () => {
    const measured = kiteClean([
      start,
      row(2, "combat/swung_at", 2000, { outcome: "hit" }),
      row(3, "combat/swung_at", 3000, { outcome: "miss" }),
      end("completed"),
    ]);
    expect(measured.met).toBe(false);
    expect(measured.line).toBe(2);
    expect(measured.observed).toMatchObject({
      firstSwing: { line: 2 },
      swings: 2,
    });
  });

  test("a swing after the fight ended does not count", () => {
    const measured = kiteClean([
      start,
      end("completed"),
      row(10, "combat/swung_at", 6000),
    ]);
    expect(measured.met).toBe(true);
  });

  test("a fight that did not complete is not met", () => {
    expect(kiteClean([start, end("failed")]).met).toBe(false);
    expect(kiteClean([start]).met).toBe(false);
  });

  test("a death in the run fails even when the fight completed", () => {
    const measured = kiteClean([
      start,
      end("completed"),
      row(11, "life/dead", 7000),
    ]);
    expect(measured.met).toBe(false);
    expect(measured.observed).toMatchObject({ deaths: 1 });
  });

  test("no fight is not met", () => {
    expect(kiteClean([row(1, "combat/attacked", 10)])).toEqual({
      met: false,
      observed: { reason: "no fight" },
    });
  });
});
