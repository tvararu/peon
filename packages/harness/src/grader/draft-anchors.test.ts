import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { observedChecks } from "#harness/grader/draft-fill";
import type { ScenarioCheck } from "#harness/grader/scenarios";

const T0 = 1_790_494_000_000;

type Extra = { guid?: string; text?: string; ts?: number };

const row = (
  seq: number,
  event: string,
  data: Record<string, unknown>,
  { guid, text = `${event} ${seq}`, ts = T0 + seq * 1000 }: Extra = {},
) =>
  JSON.stringify({
    char: "Fevala",
    class: "passive",
    data,
    domain: event.split("/")[0],
    event,
    guid,
    seq,
    text,
    ts,
    v: 1,
  });

type Files = { gamelog: string[]; jev?: unknown[]; steers?: string[] };

async function fill(
  { gamelog, jev, steers = [] }: Files,
  check: ScenarioCheck,
) {
  const dir = await mkdtemp(`${tmpdir()}/anchors-`);
  await writeFile(`${dir}/gamelog.jsonl`, `${gamelog.join("\n")}\n`);
  if (jev !== undefined)
    await writeFile(
      `${dir}/jev.jsonl`,
      `${jev.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    );
  const [filled] = await observedChecks(dir, [check], steers);
  return filled;
}

const petAttack: ScenarioCheck = {
  expect: "GL combat/pet_attack at the kill target",
  id: "pet-attack",
  measure: "pet_attack",
  source: "game_log",
};

const kill = (seq: number, guid: string) =>
  row(
    seq,
    "combat/kill_credit",
    { name: "Springpaw Stalker", xp: 80 },
    { guid },
  );

const sent = (seq: number, target: string) =>
  row(seq, "combat/pet_attack", { name: "Cat", pet: "p1", target });

const jevPet = (onTarget: boolean, target: string) => ({
  observation: { pet: { onTarget, target } },
  runId: "r1",
  ts: T0,
  type: "request",
});

describe("pet_attack", () => {
  test("a pet sent at the kill target with Jev pet.onTarget meets the check", async () => {
    const check = await fill(
      {
        gamelog: [sent(1, "f9"), sent(2, "f1"), kill(3, "f1")],
        jev: [jevPet(false, "0xf1"), jevPet(true, "0xf1")],
      },
      petAttack,
    );
    expect(check?.met).toBe(true);
    expect(check?.ref).toBe("gamelog.jsonl:2");
    expect(check?.observed).toMatchObject({
      jevOnTarget: 1,
      killTargets: ["f1"],
      petAttacks: [{ data: { target: "f1" }, line: 2 }],
    });
  });

  test("a pet sent only at another unit does not meet it", async () => {
    const check = await fill(
      { gamelog: [sent(1, "f9"), kill(2, "f1")], jev: [] },
      petAttack,
    );
    expect(check?.met).toBe(false);
    expect(check?.ref).toBeUndefined();
    expect(check?.observed).toMatchObject({ jevOnTarget: 0, petAttacks: [] });
  });

  test("the GL row without Jev pet.onTarget does not meet it", async () => {
    const withoutJev = await fill(
      { gamelog: [sent(1, "f1"), kill(2, "f1")] },
      petAttack,
    );
    expect(withoutJev?.met).toBe(false);
    expect(withoutJev?.observed).toMatchObject({ jevOnTarget: null });
    const offTarget = await fill(
      { gamelog: [sent(1, "f1"), kill(2, "f1")], jev: [jevPet(false, "0xf9")] },
      petAttack,
    );
    expect(offTarget?.met).toBe(false);
    expect(offTarget?.ref).toBe("gamelog.jsonl:1");
  });
});

const QUESTION = "How much health and mana do you have right now?";
const STOP = "Stop, we're done.";
const STEERS = [QUESTION, STOP];

const human = (seq: number, text: string, ts?: number) =>
  row(seq, "human/input", { text }, { text: `Human: ${text}`, ts });
const said = (seq: number, text: string, ts?: number) =>
  row(seq, "agent/message", {}, { text, ts });
const credit = (seq: number, guid: string) =>
  row(seq, "combat/kill_credit", { name: "Cat", xp: 80 }, { guid });
const fight = (seq: number, ts?: number) =>
  row(seq, "fight/start", { name: "Cat" }, { guid: `f${seq}`, ts });
const world = (seq: number, hp: number, power: number) =>
  row(seq, "snapshot/world", {
    self: { hp, maxHp: 200, maxPower: 300, power },
  });

const t7Log = [
  human(1, "Grind the cats north of town until I say stop."),
  said(2, "On it."),
  credit(3, "c1"),
  credit(4, "c2"),
  world(5, 150, 240),
  human(6, QUESTION),
  said(7, "Health 150/200 (75%), mana 240/300 (80%)."),
  credit(8, "c3"),
  fight(9),
  human(10, STOP),
  said(11, "Stopping."),
  fight(12, T0 + 30_000),
];

const t7 = (
  id: string,
  measure: ScenarioCheck["measure"],
  source = "game_log",
) => ({ expect: id, id, measure, source }) as ScenarioCheck;

describe("t7-question-while-acting anchors", () => {
  test("kept-grinding anchors on the first kill after the answer", async () => {
    const check = await fill(
      { gamelog: t7Log, steers: STEERS },
      t7("kept-grinding", "kill_after_answer"),
    );
    expect(check?.ref).toBe("gamelog.jsonl:8");
    expect(check?.met).toBe(true);
    expect(check?.observed).toMatchObject({
      answer: { line: 7 },
      kill: { guid: "c3", line: 8 },
    });
  });

  test("stopped anchors on the first fight after the stop steer", async () => {
    const check = await fill(
      { gamelog: t7Log, steers: STEERS },
      t7("stopped", "no_fight_after_stop"),
    );
    expect(check?.ref).toBe("gamelog.jsonl:12");
    expect(check?.met).toBe(true);
    expect(check?.observed).toMatchObject({
      firstFightAfterSec: 20,
      steer: { line: 10 },
      within10s: [],
    });
  });

  test("a fight within 10 s of the stop does not meet stopped", async () => {
    const check = await fill(
      {
        gamelog: [...t7Log.slice(0, 11), fight(12, T0 + 15_000)],
        steers: STEERS,
      },
      t7("stopped", "no_fight_after_stop"),
    );
    expect(check?.met).toBe(false);
    expect(check?.observed).toMatchObject({ within10s: [{ line: 12 }] });
  });

  test("answer-time fills from the steer and the answer", async () => {
    const check = await fill(
      { gamelog: t7Log, steers: STEERS },
      t7("answer-time", "answer_time", "session"),
    );
    expect(check?.ref).toBe("gamelog.jsonl:7");
    expect(check?.met).toBe(true);
    expect(check?.observed).toMatchObject({
      answer: { line: 7, text: "Health 150/200 (75%), mana 240/300 (80%)." },
      seconds: 1,
      steer: { line: 6 },
    });
  });

  test("answer-values fills the answer and the truth before it", async () => {
    const check = await fill(
      {
        gamelog: t7Log,
        jev: [
          {
            observation: { self: { health: 149, maxHealth: 200 } },
            ts: T0 + 6500,
            type: "request",
          },
        ],
        steers: STEERS,
      },
      t7("answer-values", "answer_values"),
    );
    expect(check?.ref).toBe("gamelog.jsonl:7");
    expect(check?.met).toBe(false);
    expect(check?.observed).toMatchObject({
      answer: { line: 7 },
      jev: { self: { health: 149 }, ts: T0 + 6500 },
      world: { line: 5, self: { hp: 150, power: 240 } },
    });
  });

  test("with no answer after the question nothing is anchored", async () => {
    const check = await fill(
      { gamelog: t7Log.slice(0, 6), steers: STEERS },
      t7("kept-grinding", "kill_after_answer"),
    );
    expect(check?.met).toBe(false);
    expect(check?.ref).toBeUndefined();
    expect(check?.observed).toMatchObject({ answer: null, kill: null });
  });
});
