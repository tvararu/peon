import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { scratchDir } from "@peon/core/test-support/scratch";
import { observedChecks } from "#harness/grader/draft-fill";
import type { CheckEvidence, ScenarioCheck } from "#harness/grader/scenarios";

const row = (seq: number, event: string, data: Record<string, unknown>) =>
  JSON.stringify({
    char: "Fevala",
    class: "log",
    data,
    domain: event.split("/")[0],
    event,
    seq,
    text: `${event} ${seq}`,
    ts: 1_790_489_540_000 + seq,
    v: 1,
  });

async function runDir(files: Record<string, string>): Promise<string> {
  const dir = scratchDir("fill");
  for (const [name, text] of Object.entries(files))
    await writeFile(`${dir}/${name}`, text);
  return dir;
}

const gl = (id: string, evidence?: CheckEvidence): ScenarioCheck => ({
  evidence,
  expect: id,
  id,
  source: "game_log",
});

describe("observedChecks on game_log", () => {
  const gamelog = [
    row(1, "quest/accepted", { questId: 8325 }),
    row(2, "quest/progress", { questId: 8325 }),
    row(3, "quest/rewarded", { money: 30, questId: 8325, xp: 100 }),
    row(4, "xp/gain", { amount: 55 }),
  ].join("\n");

  test("puts the row of the named event and id in observed with a ref", async () => {
    const dir = await runDir({ "gamelog.jsonl": `${gamelog}\n` });
    const [check] = await observedChecks(dir, [
      gl("rewarded-packet", { events: ["quest/rewarded"], ids: [8325] }),
    ]);
    expect(check?.ref).toBe("gamelog.jsonl:3");
    expect(check?.observed).toMatchObject({
      count: 1,
      events: ["quest/rewarded"],
      match: { data: { questId: 8325 }, event: "quest/rewarded", line: 3 },
    });
    expect(check?.met).toBe(false);
  });

  test("a missing event gives a null match and the last related row", async () => {
    const dir = await runDir({ "gamelog.jsonl": gamelog });
    const [check] = await observedChecks(dir, [
      gl("rewarded-packet", { events: ["quest/rewarded"], ids: [783] }),
    ]);
    expect(check?.ref).toBeUndefined();
    expect(check?.observed).toMatchObject({
      count: 0,
      match: null,
      related: { event: "quest/rewarded", line: 3 },
    });
  });

  test("ids keep only the named events that hold one of them", async () => {
    const dir = await runDir({
      "gamelog.jsonl": [
        row(1, "combat/cast", { spellId: 2050 }),
        row(2, "combat/cast", { spellId: 75 }),
        row(3, "combat/cast", { spellId: 3044 }),
      ].join("\n"),
    });
    const [check] = await observedChecks(dir, [
      gl("ranged-cast", { events: ["combat/cast"], ids: [75, 3044] }),
    ]);
    expect(check?.observed).toMatchObject({
      count: 2,
      ids: [75, 3044],
      match: { line: 2 },
      rows: [{ line: 2 }, { line: 3 }],
    });
  });

  test("a wildcard event matches every event with that prefix", async () => {
    const dir = await runDir({
      "gamelog.jsonl": [
        row(1, "control/move_start", {}),
        row(2, "control/move_stop", {}),
      ].join("\n"),
    });
    const [check] = await observedChecks(dir, [
      gl("halted", { events: ["control/move_*"] }),
    ]);
    expect(check?.observed).toMatchObject({
      count: 2,
      last: { event: "control/move_stop", line: 2 },
      match: { event: "control/move_start", line: 1 },
    });
  });

  test("a disband row fills a kicked-left check that names the disband event", async () => {
    const dir = await runDir({
      "gamelog.jsonl": [
        row(34, "raid/roster", { change: "leader" }),
        row(39, "group/disbanded", {}),
        row(41, "raid/roster", {}),
      ].join("\n"),
    });
    const [check] = await observedChecks(dir, [
      gl("kicked-left", { events: ["group/disbanded"] }),
    ]);
    expect(check?.observed).toMatchObject({
      count: 1,
      match: { event: "group/disbanded", line: 2 },
    });
    expect(check?.ref).toBe("gamelog.jsonl:2");
  });

  test("a check that names no event stays null", async () => {
    const dir = await runDir({ "gamelog.jsonl": gamelog });
    const filled = await observedChecks(dir, [
      gl("vitals"),
      gl("vitals", { events: [] }),
    ]);
    expect(filled.map((check) => check.observed)).toEqual([null, null]);
  });

  test("a check that names no event and a missing game log stay null", async () => {
    const dir = await runDir({});
    const filled = await observedChecks(dir, [
      gl("vitals"),
      gl("kill", { events: ["combat/kill_credit"] }),
    ]);
    expect(filled.map((check) => check.observed)).toEqual([null, null]);
  });
});
