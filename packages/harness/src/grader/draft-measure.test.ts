import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { scratchDir } from "@peon/core/test-support/scratch";
import { observedChecks } from "#harness/grader/draft-fill";
import type { ScenarioCheck } from "#harness/grader/scenarios";

const T0 = 1_790_494_000_000;

type Extra = { guid?: string; ref?: string; ts?: number };

const row = (
  seq: number,
  event: string,
  data: Record<string, unknown>,
  { guid, ref, ts = T0 + seq * 1000 }: Extra = {},
) =>
  JSON.stringify({
    char: "Fevala",
    class: "passive",
    data,
    domain: event.split("/")[0],
    event,
    guid,
    ref,
    seq,
    text: `${event} ${seq}`,
    ts,
    v: 1,
  });

async function fill(lines: string[], check: ScenarioCheck) {
  const dir = scratchDir("measure");
  await writeFile(`${dir}/gamelog.jsonl`, `${lines.join("\n")}\n`);
  const [filled] = await observedChecks(dir, [check]);
  return filled;
}

const killXp: ScenarioCheck = {
  expect: "GL kill XP > 0",
  id: "total-xp",
  measure: "kill_xp",
  source: "game_log",
};

const oneAtATime: ScenarioCheck = {
  expect: "at least one GL fight, and at most one attacker in each",
  id: "one-at-a-time",
  measure: "max_attackers",
  source: "game_log",
};

const xp = (seq: number, amount: number, victim: string, source: string) =>
  row(seq, "xp/gain", { amount, next: 23_200, source, total: 0, victim });

const world = (seq: number, attackers: string[], ts?: number) =>
  row(
    seq,
    "snapshot/world",
    {
      attackers: attackers.map((guid) => ({ distance: 3, guid, name: "Cat" })),
      cause: "tick",
    },
    { ts },
  );

describe("kill_xp", () => {
  test("XP with no kill credit counts as other XP, not kill XP", async () => {
    const check = await fill(
      [xp(23, 63, "0", "other"), xp(113, 63, "0", "other")],
      killXp,
    );
    expect(check?.observed).toMatchObject({
      kills: 0,
      killXp: 0,
      otherXp: 126,
    });
    expect(check?.ref).toBeUndefined();
    expect(check?.met).toBe(false);
  });

  test("XP whose victim has a kill credit counts as kill XP", async () => {
    const check = await fill(
      [
        xp(1, 63, "0", "other"),
        row(2, "combat/kill_credit", { name: "Cat", xp: 80 }, { guid: "f1" }),
        xp(3, 80, "f1", "kill"),
        xp(4, 40, "f9", "kill"),
      ],
      killXp,
    );
    expect(check?.observed).toMatchObject({
      kills: 1,
      killXp: 80,
      otherXp: 103,
      rows: [{ data: { victim: "f1" }, line: 3 }],
    });
    expect(check?.ref).toBe("gamelog.jsonl:3");
  });
});

describe("max_attackers", () => {
  test("a run with no fight is observed as no fight", async () => {
    const check = await fill([world(1, []), world(2, ["a", "b"])], oneAtATime);
    expect(check?.observed).toBe("no fight");
    expect(check?.met).toBe(false);
  });

  test("each fight gets the most attackers of the snapshots inside it", async () => {
    const check = await fill(
      [
        world(1, ["x", "y", "z"]),
        row(2, "fight/start", { name: "Cat" }, { guid: "f1", ref: "u1" }),
        world(3, ["f1"]),
        row(4, "snapshot/world", { unchanged: true }),
        row(5, "fight/end", { name: "Cat" }, { guid: "f1", ref: "u1" }),
        world(6, ["p", "q"]),
        row(7, "fight/start", { name: "Lynx" }, { guid: "f2", ref: "u2" }),
        world(8, ["f2", "f3"]),
        world(9, ["f2"]),
      ],
      oneAtATime,
    );
    expect(check?.observed).toEqual({
      fights: [
        { line: 2, maxAttackers: 1, name: "Cat", ref: "u1" },
        { line: 7, maxAttackers: 2, name: "Lynx", ref: "u2" },
      ],
      maxAttackers: 2,
    });
    expect(check?.ref).toBe("gamelog.jsonl:8");
  });
});

describe("talents_spent", () => {
  const spent: ScenarioCheck = {
    expect: "both points spent",
    id: "spent",
    measure: "talents_spent",
    source: "game_log",
  };

  const learned = (
    seq: number,
    talentId: number,
    rank: number,
    freePoints: number,
  ) => row(seq, "talents/learned", { freePoints, rank, talentId });

  test("two ranks of one talent in one row spend both points", async () => {
    const check = await fill([learned(1, 124, 3, 0)], spent);
    expect(check?.met).toBe(true);
    expect(check?.ref).toBe("gamelog.jsonl:1");
  });

  test("two rows that end on no free points spend both points", async () => {
    const check = await fill(
      [learned(1, 124, 1, 1), learned(2, 125, 1, 0)],
      spent,
    );
    expect(check?.met).toBe(true);
    expect(check?.observed).toMatchObject({ freePoints: 0, spent: 2 });
  });

  test("a point left unspent is not met", async () => {
    const check = await fill([learned(1, 124, 2, 1)], spent);
    expect(check?.met).toBe(false);
  });

  test("a run that learned nothing is not met", async () => {
    const check = await fill(
      [row(1, "talents/points", { freePoints: 2 })],
      spent,
    );
    expect(check?.met).toBe(false);
  });
});
