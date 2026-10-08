import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { scratchDir } from "@peon/core/test-support/scratch";
import { observedChecks } from "#harness/grader/draft-fill";
import type { ScenarioCheck } from "#harness/grader/scenarios";

const T0 = 1_790_494_000_000;
const TASK = "Get this new character to level 10 as fast as you can.";
const MIN = 60_000;

type Extra = { text?: string; ts?: number };

const row = (
  seq: number,
  event: string,
  data: Record<string, unknown>,
  { text = `${event} ${seq}`, ts = T0 + seq * 1000 }: Extra = {},
) =>
  JSON.stringify({
    char: "Fevala",
    class: "passive",
    data,
    domain: event.split("/")[0],
    event,
    seq,
    text,
    ts,
    v: 1,
  });

const input = (seq: number, text: string, ts?: number) =>
  row(seq, "human/input", { text }, { text: `Human: ${text}`, ts });
const gain = (seq: number, amount: number, ts?: number) =>
  row(seq, "xp/gain", { amount, source: "kill", victim: "0" }, { ts });
const up = (seq: number, level: number, ts?: number) =>
  row(seq, "xp/level_up", { level }, { ts });
const dead = (seq: number, ts?: number) => row(seq, "life/dead", {}, { ts });
const tick = (seq: number, ts?: number) =>
  row(seq, "snapshot/world", {}, { ts });

async function fill(lines: string[], task: string = TASK) {
  const dir = scratchDir("level-pace");
  await writeFile(`${dir}/gamelog.jsonl`, `${lines.join("\n")}\n`);
  const check: ScenarioCheck = {
    expect: "level 10 within an hour of the task row",
    id: "time-to-ten",
    measure: "level_pace",
    source: "game_log",
  };
  const [filled] = await observedChecks(dir, [check], [], task);
  return filled;
}

describe("level_pace", () => {
  test("levels carry seconds from the task and xpFirstHour cuts at 60 minutes", async () => {
    const check = await fill([
      input(1, TASK, T0),
      gain(2, 100, T0 + 10 * MIN),
      up(3, 2, T0 + 10 * MIN),
      gain(4, 200, T0 + 70 * MIN),
      up(5, 3, T0 + 70 * MIN),
      tick(6, T0 + 71 * MIN),
    ]);
    expect(check?.observed).toMatchObject({
      finalLevel: 3,
      levels: [
        { level: 2, seconds: 600 },
        { level: 3, seconds: 4200 },
      ],
      start: T0,
      xp: 300,
      xpFirstHour: 100,
    });
    expect(check?.met).toBe(false);
  });

  test("a level 10 two seconds past the hour keeps its exact time and line", async () => {
    const check = await fill([
      input(1, TASK, T0),
      gain(2, 27_600, T0 + 60 * MIN + 2000),
      up(3, 10, T0 + 60 * MIN + 2000),
      tick(4, T0 + 61 * MIN),
    ]);
    expect(check?.observed).toMatchObject({
      finalLevel: 10,
      levels: [{ level: 10, seconds: 3602 }],
      xpFirstHour: 0,
    });
    expect(check?.ref).toBe("gamelog.jsonl:3");
  });

  test("the start anchors on the task text past an earlier input", async () => {
    const check = await fill([
      input(1, "/login", T0 - MIN),
      gain(2, 50, T0 - MIN / 2),
      input(3, TASK, T0),
      gain(4, 100, T0 + 5 * MIN),
      up(5, 2, T0 + 5 * MIN),
      tick(6, T0 + 6 * MIN),
    ]);
    expect(check?.observed).toMatchObject({
      finalLevel: 2,
      start: T0,
      xp: 100,
    });
    expect(check?.ref).toBe("gamelog.jsonl:3");
  });

  test("stalls include the tail gap and skip gaps under 5 minutes", async () => {
    const check = await fill([
      input(1, TASK, T0),
      gain(2, 100, T0 + 2 * MIN),
      gain(3, 100, T0 + 4 * MIN),
      gain(4, 100, T0 + 12 * MIN),
      tick(5, T0 + 20 * MIN),
    ]);
    expect(check?.observed).toMatchObject({
      longestGapMinutes: 8,
      stalls: [
        { fromMinute: 4, minutes: 8 },
        { fromMinute: 12, minutes: 8 },
      ],
    });
  });

  test("a gap just under 5 minutes is no stall and exactly 5 minutes is", async () => {
    const check = await fill([
      input(1, TASK, T0),
      gain(2, 100, T0 + 5 * MIN - 2000),
      gain(3, 100, T0 + 10 * MIN - 2000),
      tick(4, T0 + 10 * MIN),
    ]);
    expect(check?.observed).toMatchObject({
      stalls: [{ fromMinute: 5, minutes: 5 }],
    });
  });

  test("deaths count only after the start", async () => {
    const check = await fill([
      dead(1, T0 - MIN),
      input(2, TASK, T0),
      dead(3, T0 + MIN),
      dead(4, T0 + 2 * MIN),
      gain(5, 100, T0 + 3 * MIN),
      tick(6, T0 + 4 * MIN),
    ]);
    expect(check?.observed).toMatchObject({ deaths: 2 });
  });

  test("no task row gives a null start", async () => {
    const check = await fill(
      [input(1, "something else", T0), gain(2, 100, T0 + MIN)],
      "a task that never lands",
    );
    expect(check?.observed).toEqual({ start: null });
    expect(check?.ref).toBeUndefined();
  });
});
