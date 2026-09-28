import { describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { scratchDir } from "@peon/core/test-support/scratch";
import { consoleArgv, readConsole } from "#harness/grader/console-read";
import type { ConsoleRead, ScenarioCheck } from "#harness/grader/scenarios";
import { failed, fakeExec, ok } from "#test-support/fake-exec";

const ACC = "FAC0123456789";
const PARTNER = "FAC0000000002";
const GROUP_TEXT = "Group type: Party and consists of 2 players.";
const NOT_IN_GROUP = "Fevala is not in a group!";

const partnerNames = {
  account: PARTNER,
  character: "Xelani",
  preset: "eversong10",
  wrapper: `/wt/tmp/puppet-${PARTNER}`,
};

const groupCheck = (overrides: Partial<ScenarioCheck> = {}): ScenarioCheck => ({
  evidence: { console: { match: "consists of 2 players", read: "group" } },
  expect: "the agent is in a party of two",
  id: "in-group",
  source: "console",
  ...overrides,
});

const gmReply = (account: string, command: string, text: string) =>
  JSON.stringify({ account, command, ok: true, text, verb: "read" });

async function runDir(): Promise<string> {
  const dir = `${scratchDir("console")}/run`;
  await mkdir(dir, { recursive: true });
  return dir;
}

const rowsOf = async (dir: string) =>
  (await Bun.file(`${dir}/console.jsonl`).text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

describe("readConsole", () => {
  test("group list reply from cs_group.cpp:224 and acore_string 1149 gives one read and one row", async () => {
    const dir = await runDir();
    const { calls, exec } = fakeExec(() =>
      ok(`${gmReply(ACC, `group list ${ACC}`, GROUP_TEXT)}\n`),
    );
    await readConsole({
      agent: ACC,
      checks: [groupCheck()],
      exec,
      partners: [],
      runDir: dir,
    });
    expect(calls.map(({ argv }) => argv)).toEqual([
      [
        "bun",
        "packages/factory/src/main.ts",
        "soap",
        "gm",
        ACC,
        "read",
        "group",
      ],
    ]);
    expect(await rowsOf(dir)).toEqual([
      {
        account: ACC,
        code: 0,
        id: "in-group",
        text: GROUP_TEXT,
        verb: "group",
        who: "agent",
      },
    ]);
  });

  test("a partner check reads the partner's account", async () => {
    const dir = await runDir();
    const { calls, exec } = fakeExec(() => ok(gmReply(PARTNER, "g", "x")));
    await readConsole({
      agent: ACC,
      checks: [
        groupCheck({
          evidence: {
            console: { match: "x", read: "group" },
            who: "partner1",
          },
        }),
      ],
      exec,
      partners: [{ names: partnerNames, role: "partner1" }],
      runDir: dir,
    });
    expect(calls[0]?.argv[4]).toBe(PARTNER);
    expect((await rowsOf(dir))[0]).toMatchObject({
      account: PARTNER,
      who: "partner1",
    });
  });

  test("a non-zero exit is recorded, not thrown", async () => {
    const dir = await runDir();
    const refused = {
      account: ACC,
      command: `group list ${ACC}`,
      ok: false,
      text: NOT_IN_GROUP,
      verb: "read",
    };
    const { exec } = fakeExec(() => failed(1, "", JSON.stringify(refused)));
    await readConsole({
      agent: ACC,
      checks: [groupCheck()],
      exec,
      partners: [],
      runDir: dir,
    });
    expect((await rowsOf(dir))[0]).toMatchObject({
      code: 1,
      text: NOT_IN_GROUP,
    });
  });

  test("a refused argument records stderr as the text", async () => {
    const dir = await runDir();
    const { exec } = fakeExec(() =>
      failed(1, "invalid guild name: Stormwind\n"),
    );
    await readConsole({
      agent: ACC,
      checks: [
        groupCheck({
          evidence: {
            console: { arg: "Stormwind", match: "x", read: "guild" },
          },
        }),
      ],
      exec,
      partners: [],
      runDir: dir,
    });
    expect((await rowsOf(dir))[0]).toMatchObject({
      arg: "Stormwind",
      code: 1,
      text: "invalid guild name: Stormwind",
      verb: "guild",
    });
  });

  test("skips checks of other sources and characters the run never made", async () => {
    const dir = await runDir();
    const { calls, exec } = fakeExec(() => ok());
    const rows = await readConsole({
      agent: ACC,
      checks: [
        { expect: "alive", id: "alive", source: "truth" },
        groupCheck({
          evidence: { console: { match: "x", read: "pet" }, who: "partner" },
        }),
      ],
      exec,
      partners: [],
      runDir: dir,
    });
    expect(calls).toEqual([]);
    expect(rows).toEqual([]);
  });

  test("every console argv is a soap gm read", () => {
    const reads: ConsoleRead["read"][] = [
      "group",
      "mail",
      "pet",
      "titles",
      "reputation",
      "pinfo",
    ];
    for (const read of reads)
      expect(consoleArgv(ACC, { match: "x", read }).slice(3)).toEqual([
        "gm",
        ACC,
        "read",
        read,
      ]);
    expect(
      consoleArgv(ACC, { arg: "7", match: "x", read: "arena" }).slice(3),
    ).toEqual(["gm", ACC, "read", "arena", "7"]);
  });
});
