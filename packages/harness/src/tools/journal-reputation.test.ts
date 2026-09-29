import { describe, expect, test } from "bun:test";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { createRunRegistry } from "#harness/runs/registry";
import { journalTool } from "#harness/tools/journal";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { expectSendKind, runTool } from "#test-support/tool-harness";

const NOW = 1_000_000;

async function world() {
  const clock = { now: () => NOW };
  const log = createGameLog({
    char: () => "Fgklibhlflc",
    clock,
    file: undefined,
  });
  const runs = createRunRegistry({
    clock,
    log,
    sink: createJsonlSink({ file: undefined }),
  });
  const { handle, rt } = await createTestRuntime({
    parts: { clock, log, runs },
  });
  return { handle, rt, tool: journalTool.definition(rt) };
}

describe("journal about reputation", () => {
  test("returns the lines and an After of about reputation", async () => {
    const { handle, tool } = await world();
    const rep = handle.reputation.state();
    Object.assign(handle.reputation, {
      state: () => ({
        ...rep,
        catalog: true,
        factions: [
          {
            atWar: false,
            changedAt: 20,
            factionId: 911,
            inactive: false,
            name: "Silvermoon City",
            rank: 4,
            rankCeiling: 8999,
            rankFloor: 3000,
            repListId: 55,
            standing: 4250,
            visible: true,
            watched: false,
          },
          {
            atWar: true,
            changedAt: 10,
            factionId: 21,
            inactive: false,
            name: "Booty Bay",
            rank: 3,
            rankCeiling: 2999,
            rankFloor: 0,
            repListId: 3,
            standing: 0,
            visible: true,
            watched: false,
          },
        ],
      }),
    });
    const out = await runTool(tool, { about: "reputation" });
    expect(out.text).toBe(
      [
        "DONE 2 factions. This is your reputation with each faction.",
        "Silvermoon City: Friendly 1250/6000.",
        "Booty Bay: Neutral 0/3000, at war.",
      ].join("\n"),
    );
    expect(out.details.result.after).toEqual({
      about: "reputation",
      factions: ["Silvermoon City", "Booty Bay"],
    });
  });

  test("find filters by faction name", async () => {
    const { handle, tool } = await world();
    const rep = handle.reputation.state();
    Object.assign(handle.reputation, {
      state: () => ({
        ...rep,
        catalog: true,
        factions: [
          {
            atWar: false,
            changedAt: 20,
            factionId: 911,
            inactive: false,
            name: "Silvermoon City",
            rank: 4,
            rankCeiling: 8999,
            rankFloor: 3000,
            repListId: 55,
            standing: 4250,
            visible: true,
            watched: false,
          },
        ],
      }),
    });
    const out = await runTool(tool, { about: "reputation", find: "booty" });
    expect(out.text).toContain('No faction matches "booty".');
  });

  test("the tool stays kind read and sends nothing", async () => {
    await expectSendKind(journalTool, { about: "reputation" });
    expect(journalTool.kind).toBe("read");
  });
});
