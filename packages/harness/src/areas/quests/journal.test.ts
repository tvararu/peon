import { describe, expect, jest, test } from "bun:test";
import type { QuestLogSlot } from "@peon/core";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { createRunRegistry } from "#harness/runs/registry";
import { journalTool } from "#harness/tools/journal";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { runTool } from "#test-support/tool-harness";

const NOW = 1_000_000;

function slot(questId: number | undefined, index: number): QuestLogSlot {
  return {
    counters: [0, 0, 0, 0],
    expiresAtSeconds: undefined,
    flags: 0,
    questId,
    slot: index,
  };
}

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

describe("quests daily journal", () => {
  test("a quest in daily but not in the log shows done today", async () => {
    const { handle, tool } = await world();
    const state = handle.getQuestState();
    handle.getQuestState = () => ({
      ...state,
      items: [],
      log: { complete: true, slots: [] },
      queries: [],
    });
    jest.spyOn(handle.quests, "state").mockReturnValue({
      completed: undefined,
      daily: new Set([14_179]),
      gossipPoi: undefined,
      marks: new Map(),
      pois: new Map(),
      texts: new Map(),
    });
    const out = await runTool(tool, { about: "quests" });
    expect(out.text).toContain("#14179");
    expect(out.text).toContain("quest 14179");
    expect(out.text).toContain("done today");
  });

  test("a quest both logged and done today shows the log line only", async () => {
    const { handle, tool } = await world();
    const state = handle.getQuestState();
    handle.getQuestState = () => ({
      ...state,
      items: [],
      log: { complete: true, slots: [slot(14_179, 0)] },
      queries: [],
    });
    jest.spyOn(handle.quests, "state").mockReturnValue({
      completed: undefined,
      daily: new Set([14_179]),
      gossipPoi: undefined,
      marks: new Map(),
      pois: new Map(),
      texts: new Map(),
    });
    const out = await runTool(tool, { about: "quests" });
    expect(out.text).not.toContain("done today");
    expect(out.text).toContain("#14179");
  });

  test("daily lines come after the log lines", async () => {
    const { handle, tool } = await world();
    const state = handle.getQuestState();
    handle.getQuestState = () => ({
      ...state,
      items: [],
      log: { complete: true, slots: [slot(8326, 1)] },
      queries: [],
    });
    jest.spyOn(handle.quests, "state").mockReturnValue({
      completed: undefined,
      daily: new Set([14_179]),
      gossipPoi: undefined,
      marks: new Map(),
      pois: new Map(),
      texts: new Map(),
    });
    const out = await runTool(tool, { about: "quests" });
    const logIndex = out.text.indexOf("#8326");
    const dailyIndex = out.text.indexOf("#14179");
    expect(logIndex).toBeGreaterThanOrEqual(0);
    expect(dailyIndex).toBeGreaterThan(logIndex);
  });
});
