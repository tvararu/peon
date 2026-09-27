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
