import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { scratchDir } from "@peon/core/test-support/scratch";
import { observedChecks } from "#harness/grader/draft-fill";
import type { ScenarioCheck } from "#harness/grader/scenarios";

const ACC = "FAC0123456789";
const GROUP_TEXT = "Group type: Raid and consists of 6 players.";

const check = (id: string, match: string): ScenarioCheck => ({
  evidence: { console: { match, read: "group" } },
  expect: "the agent is in a raid",
  id,
  source: "console",
});

const row = (id: string, code: number, text: string) =>
  JSON.stringify({ account: ACC, code, id, text, verb: "group", who: "agent" });

async function runDir(lines: string[]): Promise<string> {
  const dir = `${scratchDir("draft-console")}/run`;
  await mkdir(dir, { recursive: true });
  if (lines.length > 0)
    await writeFile(`${dir}/console.jsonl`, `${lines.join("\n")}\n`);
  return dir;
}

describe("observedChecks with console checks", () => {
  test("a matching row of the group list reply (cs_group.cpp:224) fills the check met", async () => {
    const dir = await runDir([
      row("other", 0, "Fevala is not in a group!"),
      row("in-raid", 0, GROUP_TEXT),
    ]);
    const [filled] = await observedChecks(dir, [
      check("in-raid", "^Group type: Raid"),
    ]);
    expect(filled).toEqual({
      blockedBy: undefined,
      expected: "the agent is in a raid",
      id: "in-raid",
      met: true,
      observed: {
        account: ACC,
        arg: undefined,
        code: 0,
        match: "^Group type: Raid",
        matched: true,
        text: GROUP_TEXT,
        verb: "group",
      },
      ref: "console.jsonl:2",
      source: "console",
    });
  });

  test("a non-matching row fills it unmet with the text", async () => {
    const dir = await runDir([row("in-raid", 0, GROUP_TEXT)]);
    const [filled] = await observedChecks(dir, [
      check("in-raid", "consists of 2 players"),
    ]);
    expect(filled?.met).toBe(false);
    expect(filled?.observed).toMatchObject({
      matched: false,
      text: GROUP_TEXT,
    });
  });

  test("a matching text with a non-zero exit is unmet", async () => {
    const dir = await runDir([row("in-raid", 1, GROUP_TEXT)]);
    const [filled] = await observedChecks(dir, [check("in-raid", "Raid")]);
    expect(filled?.met).toBe(false);
    expect(filled?.observed).toMatchObject({ code: 1, matched: true });
  });

  test("a missing row is unmet with the reason", async () => {
    const dir = await runDir([]);
    const [filled] = await observedChecks(dir, [check("in-raid", "Raid")]);
    expect(filled?.met).toBe(false);
    expect(filled?.observed).toEqual({
      reason: "console.jsonl has no row for in-raid",
    });
  });
});
