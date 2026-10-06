import { describe, expect, test } from "bun:test";
import { copyFile, writeFile } from "node:fs/promises";
import { scratchDir } from "@peon/core/test-support/scratch";
import { observedChecks } from "#harness/grader/draft-fill";
import {
  type CheckEvidence,
  loadScenario,
  type ScenarioCheck,
} from "#harness/grader/scenarios";

const FIXTURES = `${import.meta.dir}/fixtures/halt-resume`;
const T0 = 1_790_000_000_000;

const scenario = loadScenario("t7-halt-resume");
const steers = scenario.steers.map((steer) => steer.text);

async function draftFixture(name: string) {
  const dir = scratchDir("window");
  await copyFile(`${FIXTURES}/${name}.jsonl`, `${dir}/gamelog.jsonl`);
  const drafted = await observedChecks(dir, scenario.checks, steers);
  return (id: string) => drafted.find((check) => check.id === id);
}

describe("t7-halt-resume drafts from retained runs", () => {
  test("a clean halt drafts halted as met (round 329 replica 2)", async () => {
    const check = (await draftFixture("round-329-replica-2"))("halted");
    expect(check?.met).toBe(true);
    expect(check?.observed).toMatchObject({ count: 0 });
  });

  test("a clean halt drafts halted as met (round 591 replica 1)", async () => {
    const check = (await draftFixture("round-591-replica-1"))("halted");
    expect(check?.met).toBe(true);
  });

  test("a re-engage after the grace drafts halted as unmet (round 329 replica 1)", async () => {
    const check = (await draftFixture("round-329-replica-1"))("halted");
    expect(check?.met).toBe(false);
    expect(check?.observed).toMatchObject({ count: 5 });
    expect(check?.ref).toMatch(/^gamelog\.jsonl:\d+$/);
  });

  test("smite-only-kills drops Smite and consumed items after resume", async () => {
    const after = (await draftFixture("round-329-replica-1"))(
      "smite-only-kills",
    );
    expect(after?.observed).toMatchObject({ count: 0 });
    expect(after?.met).toBe(true);
    const seen = after?.observed as { related: { text: string } | null };
    expect(seen.related?.text).toBe("Cast Food succeeded.");
  });
});

const row = (
  seq: number,
  event: string,
  data: Record<string, unknown>,
  at: number,
) => JSON.stringify({ data, event, seq, text: event, ts: T0 + at });

const steerRow = (seq: number, text: string, at: number) =>
  row(seq, "human/input", { text }, at);

const cast = (seq: number, name: string, at: number) =>
  row(seq, "combat/cast", { name, result: "succeeded" }, at);

async function draft(
  lines: string[],
  evidence: CheckEvidence,
  texts = ["stop", "resume"],
) {
  const dir = scratchDir("window");
  await writeFile(`${dir}/gamelog.jsonl`, `${lines.join("\n")}\n`);
  const check: ScenarioCheck = {
    evidence,
    expect: "windowed",
    id: "windowed",
    source: "game_log",
  };
  const [filled] = await observedChecks(dir, [check], texts);
  return filled;
}

describe("evidence windows", () => {
  const events = ["combat/cast"];

  test("rows before the offset and after the end steer are outside", async () => {
    const lines = [
      steerRow(1, "stop", 0),
      cast(2, "Smite", 2000),
      cast(3, "Smite", 8000),
      steerRow(4, "resume", 20_000),
      cast(5, "Smite", 25_000),
    ];
    const filled = await draft(lines, {
      events,
      window: { afterMs: 5000, max: 0, steer: 0, untilSteer: 1 },
    });
    expect(filled?.observed).toMatchObject({ count: 1 });
    expect(filled?.met).toBe(false);
    expect(filled?.ref).toBe("gamelog.jsonl:3");
  });

  test("an empty window meets a max of 0 and a count at the max is met", async () => {
    const lines = [
      steerRow(1, "stop", 0),
      cast(2, "Smite", 8000),
      steerRow(3, "resume", 20_000),
    ];
    const empty = await draft(lines, {
      events,
      window: { afterMs: 10_000, max: 0, steer: 0, untilSteer: 1 },
    });
    expect(empty?.met).toBe(true);
    const one = await draft(lines, {
      events,
      window: { afterMs: 5000, max: 1, steer: 0, untilSteer: 1 },
    });
    expect(one?.met).toBe(true);
  });

  test("forMs ends the window after the offset", async () => {
    const lines = [
      steerRow(1, "stop", 0),
      cast(2, "Smite", 6000),
      cast(3, "Smite", 12_000),
    ];
    const filled = await draft(lines, {
      events,
      window: { afterMs: 5000, forMs: 3000, max: 0, steer: 0 },
    });
    expect(filled?.observed).toMatchObject({ count: 1 });
  });

  test("a window with no end runs to the end of the log", async () => {
    const lines = [
      steerRow(1, "stop", 0),
      cast(2, "Smite", 6000),
      cast(3, "Smite", 12_000),
    ];
    const filled = await draft(lines, {
      events,
      window: { max: 5, steer: 0 },
    });
    expect(filled?.observed).toMatchObject({ count: 2 });
    expect(filled?.met).toBe(true);
  });

  test("exceptNames drops rows of those spells from the window", async () => {
    const lines = [
      steerRow(1, "stop", 0),
      cast(2, "Smite", 6000),
      cast(3, "Mind Blast", 7000),
    ];
    const filled = await draft(lines, {
      events,
      window: { exceptNames: ["Smite"], max: 0, steer: 0 },
    });
    expect(filled?.observed).toMatchObject({ count: 1 });
    expect(filled?.met).toBe(false);
  });

  test("a steer that never landed leaves the window unmet", async () => {
    const filled = await draft([cast(1, "Smite", 6000)], {
      events,
      window: { max: 0, steer: 0 },
    });
    expect(filled?.met).toBe(false);
    expect(filled?.ref).toBeUndefined();
  });

  test("without max the draft reports the window but never meets", async () => {
    const filled = await draft(
      [steerRow(1, "stop", 0), cast(2, "Smite", 6000)],
      { events, window: { steer: 0 } },
    );
    expect(filled?.observed).toMatchObject({ count: 1 });
    expect(filled?.met).toBe(false);
  });
});

describe("t4-spells-stop-channel drafts", () => {
  const t4 = loadScenario("t4-spells-stop-channel");
  const stop = t4.steers.map((steer) => steer.text);

  async function t4Draft(lines: string[]) {
    const dir = scratchDir("window");
    await writeFile(`${dir}/gamelog.jsonl`, `${lines.join("\n")}\n`);
    const drafted = await observedChecks(dir, t4.checks, stop);
    return (id: string) => drafted.find((check) => check.id === id);
  }

  const interrupted = (seq: number, at: number) =>
    row(
      seq,
      "combat/cast",
      { name: "Evocation", result: "interrupted", spellId: 12_051 },
      at,
    );
  const channelEnd = (seq: number, at: number) =>
    row(
      seq,
      "spells/channel_end",
      { reason: "cancelled", spellId: 12_051 },
      at,
    );

  test("a cancelled channel leaves channel-cancelled to the grader", async () => {
    const find = await t4Draft([
      steerRow(1, stop[0] ?? "", 0),
      channelEnd(2, 100),
      interrupted(3, 100),
    ]);
    expect(find("channel-cancelled")?.observed).toMatchObject({ count: 1 });
    expect(find("channel-cancelled")?.met).toBe(false);
  });

  test("a missing channel_end row is not drafted as met", async () => {
    const find = await t4Draft([steerRow(1, stop[0] ?? "", 0)]);
    expect(find("channel-cancelled")?.met).toBe(false);
    expect(find("channel-cancelled")?.observed).toMatchObject({ count: 0 });
  });

  test("the interrupted Evocation alone drafts no-recast as met", async () => {
    const find = await t4Draft([
      steerRow(1, stop[0] ?? "", 0),
      interrupted(2, 100),
    ]);
    expect(find("no-recast")?.met).toBe(true);
  });

  test("a recast 3 s after the stop drafts no-recast as unmet", async () => {
    const find = await t4Draft([
      steerRow(1, stop[0] ?? "", 0),
      interrupted(2, 100),
      cast(3, "Frostbolt", 3000),
    ]);
    expect(find("no-recast")?.met).toBe(false);
  });

  test("a channel_end after 2 s is outside the cancelled window", async () => {
    const find = await t4Draft([
      steerRow(1, stop[0] ?? "", 0),
      channelEnd(2, 2500),
    ]);
    expect(find("channel-cancelled")?.observed).toMatchObject({ count: 0 });
  });
});

describe("t6-die-and-recover drafts", () => {
  const t6 = loadScenario("t6-die-and-recover");
  const texts = t6.steers.map((entry) => entry.text);
  const steer = texts[0] ?? "";

  const dead = (seq: number, at: number) =>
    row(seq, "life/dead", { killerName: "Springpaw Stalker" }, at);
  const released = (seq: number, at: number) =>
    row(seq, "life/released", {}, at);
  const alive = (seq: number, at: number) =>
    row(seq, "life/alive", { via: "corpse" }, at);

  async function t6Draft(lines: string[]) {
    const dir = scratchDir("window-t6");
    await writeFile(`${dir}/gamelog.jsonl`, `${lines.join("\n")}\n`);
    const drafted = await observedChecks(dir, t6.checks, texts);
    return (id: string) => drafted.find((check) => check.id === id);
  }

  test("a death before the death-triggered steer still drafts the order", async () => {
    const find = await t6Draft([
      dead(1, 0),
      released(2, 1000),
      steerRow(3, steer, 2000),
      alive(4, 3000),
    ]);
    expect(find("death-order")?.observed).toMatchObject({ count: 3 });
    expect(find("death-order")?.ref).toBe("gamelog.jsonl:1");
  });
});
