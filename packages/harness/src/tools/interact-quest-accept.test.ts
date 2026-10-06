import { describe, expect, jest, test } from "bun:test";
import type { AreaState, QuestLogSlot, QuestQuery } from "@peon/core";
import {
  fakeMsUntilSettled,
  withFakeTimers,
} from "@peon/core/test-support/fake-time";
import type { InteractAfter } from "#harness/contract/details";
import { interactSpec } from "#harness/tools/interact";
import { ANSWER_MS } from "#harness/tools/interact-quest";
import { moveTo, toolCtx } from "#test-support/ops-fixtures";
import {
  answer,
  detailsDialog,
  listDialog,
  talkQuery,
  velan,
} from "#test-support/quest-fixtures";

type PoiSpot = {
  index: number;
  mapId?: number;
  polygon?: { x: number; y: number }[];
  x: number;
  y: number;
};

function logged(questId: number): QuestLogSlot {
  return {
    counters: [0, 0, 0, 0],
    expiresAtSeconds: undefined,
    flags: 0,
    questId,
    slot: 0,
  };
}

function knownPoiState(questId: number, spot: PoiSpot): AreaState<"quests"> {
  return {
    completed: undefined,
    gossipPoi: undefined,
    marks: new Map(),
    pois: new Map([
      [
        questId,
        {
          at: 1,
          pois: [
            {
              areaId: 0,
              floorId: 0,
              mapId: spot.mapId ?? 530,
              objectiveIndex: spot.index,
              poiId: 0,
              points: spot.polygon ?? [{ x: spot.x, y: spot.y }],
              unk3: 0,
              unk4: 0,
            },
          ],
          status: "known",
        },
      ],
    ]),
    texts: new Map(),
  };
}

describe("accept with a quest region", () => {
  test("an explore quest travels to the area trigger by its region", async () => {
    const { t } = await velan();
    const state = t.handle.getQuestState();
    t.handle.getQuestState = () => ({
      ...state,
      log: { complete: true, slots: [logged(62)] },
      queries: [talkQuery(62, "Explore the Fargodeep Mine.")],
    });
    jest
      .spyOn(t.handle.quests, "state")
      .mockReturnValue(
        knownPoiState(62, { index: 0, mapId: 0, x: -9844, y: 92 }),
      );
    t.handle.objects.act.triggersNear = () => [
      { id: 88, x: -9843.54, y: 127.525, z: 5.37 },
    ];
    const control = t.handle.getControlState();
    const lands = { mapId: 0, x: -9870, y: 213 };
    t.handle.getControlState = () => ({
      ...control,
      pose: control.pose && { ...control.pose, ...lands },
      serverPose: control.serverPose && { ...control.serverPose, ...lands },
    });
    t.handle.talk = () =>
      answer(t.handle, "dialog", {
        dialog: listDialog([
          { icon: 2, level: 4, questId: 62, title: "The Fargodeep Mine" },
        ]),
      });
    t.handle.selectQuest = () =>
      answer(t.handle, "dialog", {
        dialog: detailsDialog(
          62,
          "The Fargodeep Mine",
          "Explore the Fargodeep Mine.",
        ),
      });
    t.handle.acceptQuest = () =>
      answer(
        t.handle,
        "accepted",
        { dialog: undefined, log: { complete: true, slots: [logged(62)] } },
        62,
      );
    const res = await interactSpec.run(
      { do: "accept", npc: "Velan Brightoak", what: "1" },
      toolCtx<InteractAfter>(t),
    );
    expect(res.next).toBe('travel(to: "-9843.54, 127.53, 5.37")');
  });
  test("points at the journal's region when the objective is far", async () => {
    const { t } = await velan();
    const state = t.handle.getQuestState();
    t.handle.getQuestState = () => ({
      ...state,
      log: { complete: true, slots: [logged(8326)] },
    });
    jest
      .spyOn(t.handle.quests, "state")
      .mockReturnValue(knownPoiState(8326, { index: 0, x: 10_385, y: -6316 }));
    moveTo(t.handle, { x: 10_293, y: -6357 });
    t.handle.talk = () =>
      answer(t.handle, "dialog", {
        dialog: listDialog([
          { icon: 2, level: 1, questId: 8326, title: "Thirst Unending" },
        ]),
      });
    t.handle.selectQuest = () =>
      answer(t.handle, "dialog", {
        dialog: detailsDialog(8326, "Thirst Unending", "Slay 8 Manawraiths."),
      });
    t.handle.acceptQuest = () =>
      answer(
        t.handle,
        "accepted",
        {
          dialog: undefined,
          log: { complete: true, slots: [logged(8326)] },
        },
        8326,
      );
    const res = await interactSpec.run(
      { do: "accept", npc: "Velan Brightoak", what: "1" },
      toolCtx<InteractAfter>(t),
    );
    expect(res.detail).toContain("10385, -6316");
    expect(res.next).toBe('journal(about: "quests")');
  });
});
describe("accept while the quest region is still pending", () => {
  async function setup() {
    const { t } = await velan();
    const state = t.handle.getQuestState();
    t.handle.getQuestState = () => ({
      ...state,
      log: { complete: true, slots: [logged(8326)] },
    });
    const known = knownPoiState(8326, { index: 0, x: 10_385, y: -6316 });
    const pending: AreaState<"quests"> = {
      ...known,
      pois: new Map([[8326, { at: 1, pois: [], status: "pending" }]]),
    };
    const spy = jest.spyOn(t.handle.quests, "state").mockReturnValue(pending);
    moveTo(t.handle, { x: 10_293, y: -6357 });
    t.handle.talk = () =>
      answer(t.handle, "dialog", {
        dialog: listDialog([
          { icon: 2, level: 1, questId: 8326, title: "Thirst Unending" },
        ]),
      });
    t.handle.selectQuest = () =>
      answer(t.handle, "dialog", {
        dialog: detailsDialog(8326, "Thirst Unending", "Slay 8 Manawraiths."),
      });
    t.handle.acceptQuest = () =>
      answer(
        t.handle,
        "accepted",
        { dialog: undefined, log: { complete: true, slots: [logged(8326)] } },
        8326,
      );
    return { known, spy, t };
  }

  test("waits for the region reply before naming the next step", async () => {
    await withFakeTimers(async () => {
      const { known, spy, t } = await setup();
      t.handle.acceptQuest = () => {
        answer(
          t.handle,
          "accepted",
          { dialog: undefined, log: { complete: true, slots: [logged(8326)] } },
          8326,
        );
        setTimeout(() => {
          spy.mockReturnValue(known);
          t.handle.triggerAreaEvent("quests", {
            pois: [],
            questIds: [8326],
            type: "poi",
          });
        }, 11);
      };
      const run = interactSpec.run(
        { do: "accept", npc: "Velan Brightoak", what: "1" },
        toolCtx<InteractAfter>(t),
      );
      await fakeMsUntilSettled(run, ANSWER_MS);
      const res = await run;
      expect(res.next).toBe('journal(about: "quests")');
    });
  });

  test("gives up waiting when the region reply never comes", async () => {
    await withFakeTimers(async () => {
      const { t } = await setup();
      const run = interactSpec.run(
        { do: "accept", npc: "Velan Brightoak", what: "1" },
        toolCtx<InteractAfter>(t),
      );
      const ms = await fakeMsUntilSettled(run, 2 * ANSWER_MS);
      const res = await run;
      expect(ms).toBeGreaterThanOrEqual(ANSWER_MS);
      expect(res.status).toBe("DONE");
      expect(res.next).not.toContain("travel");
    });
  });
});

describe("accept an explore quest with several area triggers", () => {
  const square = [
    { x: -9850, y: 100 },
    { x: -9830, y: 100 },
    { x: -9830, y: 140 },
    { x: -9850, y: 140 },
  ];

  async function accept(
    triggers: { id: number; x: number; y: number; z: number }[],
    quest: { id: number; objectives: string; title: string } = {
      id: 62,
      objectives: "Explore the Fargodeep Mine.",
      title: "The Fargodeep Mine",
    },
    query: QuestQuery | null = talkQuery(quest.id, quest.objectives),
  ) {
    const { t } = await velan();
    const state = t.handle.getQuestState();
    t.handle.getQuestState = () => ({
      ...state,
      log: { complete: true, slots: [logged(quest.id)] },
      queries: query ? [query] : [],
    });
    jest.spyOn(t.handle.quests, "state").mockReturnValue(
      knownPoiState(quest.id, {
        index: 0,
        mapId: 0,
        polygon: square,
        x: -9840,
        y: 120,
      }),
    );
    t.handle.objects.act.triggersNear = () => triggers;
    const control = t.handle.getControlState();
    const lands = { mapId: 0, x: -9870, y: 213 };
    t.handle.getControlState = () => ({
      ...control,
      pose: control.pose && { ...control.pose, ...lands },
      serverPose: control.serverPose && { ...control.serverPose, ...lands },
    });
    t.handle.talk = () =>
      answer(t.handle, "dialog", {
        dialog: listDialog([
          { icon: 2, level: 4, questId: quest.id, title: quest.title },
        ]),
      });
    t.handle.selectQuest = () =>
      answer(t.handle, "dialog", {
        dialog: detailsDialog(quest.id, quest.title, quest.objectives),
      });
    t.handle.acceptQuest = () =>
      answer(
        t.handle,
        "accepted",
        {
          dialog: undefined,
          log: { complete: true, slots: [logged(quest.id)] },
        },
        quest.id,
      );
    return interactSpec.run(
      { do: "accept", npc: "Velan Brightoak", what: "1" },
      toolCtx<InteractAfter>(t),
    );
  }

  test("prefers a trigger inside the region over one nearer its centre", async () => {
    const res = await accept([
      { id: 197, x: -9796.18, y: 157.77, z: 25.39 },
      { id: 88, x: -9843.54, y: 127.525, z: 5.37 },
    ]);
    expect(res.next).toBe('travel(to: "-9843.54, 127.53, 5.37")');
  });

  test("picks the inside trigger nearest the character first", async () => {
    const res = await accept([
      { id: 1, x: -9840, y: 105, z: 10 },
      { id: 2, x: -9840, y: 135, z: 10 },
    ]);
    expect(res.next).toBe('travel(to: "-9840, 135, 10")');
    expect(res.detail).toContain("-9840, 105, 10");
  });

  test("falls back to the trigger nearest the centre when none is inside", async () => {
    const res = await accept([
      { id: 197, x: -9796.18, y: 157.77, z: 25.39 },
      { id: 300, x: -9700, y: 200, z: 30 },
    ]);
    expect(res.next).toBe('travel(to: "-9796.18, 157.77, 25.39")');
  });

  test("a collection quest whose region holds triggers points at the journal instead", async () => {
    const query = talkQuery(47, "Collect 10 Gold Dust.");
    if (query.status !== "known") throw new Error("query not known");
    const collecting = {
      ...query,
      data: { ...query.data, requiredItems: [{ count: 10, itemId: 1 }] },
    };
    const res = await accept(
      [
        { id: 197, x: -9796.18, y: 157.77, z: 25.39 },
        { id: 88, x: -9843.54, y: 127.525, z: 5.37 },
      ],
      {
        id: 47,
        objectives: "Collect 10 Gold Dust.",
        title: "Gold Dust Exchange",
      },
      collecting,
    );
    expect(res.next).toBe('journal(about: "quests")');
  });

  test("a quest whose template query is still pending does not route to a trigger", async () => {
    const res = await accept(
      [
        { id: 197, x: -9796.18, y: 157.77, z: 25.39 },
        { id: 88, x: -9843.54, y: 127.525, z: 5.37 },
      ],
      {
        id: 47,
        objectives: "Collect 10 Gold Dust.",
        title: "Gold Dust Exchange",
      },
      null,
    );
    expect(res.next).toBe('journal(about: "quests")');
  });
});
