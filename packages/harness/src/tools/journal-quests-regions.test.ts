import { describe, expect, jest, test } from "bun:test";
import type { AreaState, QuestLogSlot } from "@peon/core";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { createRunRegistry } from "#harness/runs/registry";
import { journalTool } from "#harness/tools/journal";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { runTool } from "#test-support/tool-harness";
import { selfPose, selfRow, setWorld } from "#test-support/world-fixtures";

const NOW = 1_000_000;

type Poi =
  AreaState<"quests">["pois"] extends ReadonlyMap<number, infer E> ? E : never;

function slot(
  questId: number | undefined,
  index: number,
  flags: number,
  counters: QuestLogSlot["counters"],
): QuestLogSlot {
  return { counters, expiresAtSeconds: undefined, flags, questId, slot: index };
}

function knownPoi(
  objectiveIndex: number,
  x: number,
  y: number,
  poiId: number,
): Poi {
  return {
    at: NOW,
    pois: [
      {
        areaId: 0,
        floorId: 0,
        mapId: 530,
        objectiveIndex,
        poiId,
        points: [{ x, y }],
        unk3: 0,
        unk4: 0,
      },
    ],
    status: "known",
  };
}

describe("journal quest regions", () => {
  test("quests names the objective region and offers the walk", async () => {
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
    const tool = journalTool.definition(rt);
    const state = handle.getQuestState();
    const slots = [
      slot(8326, 1, 0, [0, 0, 0, 0]),
      slot(8330, 2, 3, [0, 0, 0, 0]),
    ];
    handle.getQuestState = () => ({
      ...state,
      items: [],
      log: { complete: true, slots },
      queries: [],
    });
    setWorld(handle, {
      pose: selfPose(NOW, { x: 10_293, y: -6357 }),
      rows: [selfRow()],
    });
    jest.spyOn(handle.quests, "state").mockReturnValue({
      completed: undefined,
      gossipPoi: undefined,
      marks: new Map(),
      pois: new Map([
        [8326, knownPoi(4, 10_385, -6316, 0)],
        [8330, { at: NOW, pois: [], status: "none" }],
      ]),
      texts: new Map(),
    });
    const out = await runTool(tool, { about: "quests" });
    expect(out.text).toContain("objective region around 10385, -6316");
    expect(out.details.result.next).toBe('travel(to: "10385, -6316")');
    expect(out.text).toContain("no map region");
  });

  test("quests names the turn-in region when the quest is done", async () => {
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
    const tool = journalTool.definition(rt);
    const state = handle.getQuestState();
    handle.getQuestState = () => ({
      ...state,
      items: [],
      log: { complete: true, slots: [slot(8326, 1, 1, [0, 0, 0, 0])] },
      queries: [],
    });
    setWorld(handle, {
      pose: selfPose(NOW, { x: 10_293, y: -6357 }),
      rows: [selfRow()],
    });
    jest.spyOn(handle.quests, "state").mockReturnValue({
      completed: undefined,
      gossipPoi: undefined,
      marks: new Map(),
      pois: new Map([[8326, knownPoi(-1, 10_358, -6370, 1)]]),
      texts: new Map(),
    });
    const out = await runTool(tool, { about: "quests" });
    expect(out.text).toContain("turn-in region around 10358, -6370");
  });
});
