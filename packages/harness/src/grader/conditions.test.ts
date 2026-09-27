import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { conditionsOf, scenarioSha } from "#harness/grader/conditions";
import { validateResult } from "#harness/grader/result";
import { loadScenario } from "#harness/grader/scenarios";

const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    dirs.map((dir) => rm(dir, { force: true, recursive: true })),
  );
});

async function runDir(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "peon-conditions-"));
  dirs.push(dir);
  for (const [name, body] of Object.entries(files))
    await Bun.write(join(dir, name), body);
  return dir;
}

const scenario = loadScenario("t0-self-state");

test("conditions come from the harness meta, the Jev log and the scenario", async () => {
  const dir = await runDir({
    "jev.jsonl": [
      '{"type":"request","model":"jev-latest"}',
      '{"type":"result","model":"jev-1.13.0"}',
      "not json",
      '{"type":"result","model":"jev-1.12.0"}',
      '{"type":"result","model":"jev-1.13.0"}',
    ].join("\n"),
    "meta.json": JSON.stringify({
      gitSha: "abc123",
      model: "openai-codex/gpt-6-luna",
      thinking: "off",
    }),
  });
  const conditions = await conditionsOf(dir, scenario);
  expect(conditions).toEqual({
    harnessSha: "abc123",
    jevModels: ["jev-1.12.0", "jev-1.13.0"],
    model: "openai-codex/gpt-6-luna",
    scenarioSha: scenarioSha(scenario),
    thinking: "off",
  });
  expect(
    validateResult({ conditions }).filter((error) =>
      error.startsWith("$.conditions"),
    ),
  ).toEqual([]);
  expect(
    validateResult({ conditions: { ...conditions, scenarioSha: "x" } }),
  ).toContainEqual(expect.stringContaining("$.conditions.scenarioSha"));
});

test("a run that never started still names its scenario", async () => {
  const conditions = await conditionsOf(await runDir({}), scenario);
  expect(conditions).toEqual({
    harnessSha: undefined,
    jevModels: [],
    model: undefined,
    scenarioSha: scenarioSha(scenario),
    thinking: undefined,
  });
});

test("an edited scenario gets another hash", () => {
  const edited = { ...scenario, task: `${scenario.task} Quickly.` };
  expect(scenarioSha(edited)).not.toBe(scenarioSha(scenario));
  expect(scenarioSha(scenario)).toMatch(/^[0-9a-f]{12}$/);
});
