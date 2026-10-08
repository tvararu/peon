import { describe, expect, test } from "bun:test";
import type { GameObjectEntity } from "@peon/core";
import type { InteractAfter } from "#harness/contract/details";
import { createRefTable } from "#harness/ops/refs";
import { interactSpec } from "#harness/tools/interact";
import {
  contentOf,
  driveGoto,
  limitProblem,
  objectRow,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import {
  answer,
  detailsDialog,
  listDialog,
  MCBRIDE,
  OFFERED,
  offerDialog,
  requestDialog,
  talkQuery,
  VELAN,
  velan,
} from "#test-support/quest-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

describe("interact", () => {
  test("talk lists the offers as the design example does, then closes the window", async () => {
    const { t, cancels } = await velan();
    t.handle.talk = () =>
      answer(t.handle, "dialog", { dialog: listDialog(OFFERED) });
    const res = await interactSpec.run(
      { npc: "Velan Brightoak" },
      toolCtx<InteractAfter>(t),
    );
    const ref = res.after.npc.ref;
    const text = contentOf(res);
    expect(limitProblem(text)).toBeUndefined();
    expect(text).toBe(
      [
        `DONE Velan Brightoak (${ref}) offers:`,
        "1. The Wayward Apprentice #9254 (level 9), available",
        "2. Situation at Sunsail Anchorage #8892 (level 10), available",
        "Ready to turn in: none. Not a vendor or trainer.",
        `Next: interact(do: "accept", npc: "${ref}", what: "1")`,
      ].join("\n"),
    );
    expect(cancels()).toBe(1);
  });

  test("talk that opens no quest dialog says so", async () => {
    const { t } = await velan();
    t.handle.talk = () => answer(t.handle, "window", {});
    const res = await interactSpec.run(
      { npc: "Velan Brightoak" },
      toolCtx<InteractAfter>(t),
    );
    expect(res.status).toBe("DONE");
    expect(res.detail).toContain("opened no dialog");
    expect(res.detail).toContain("3 s");
  });

  test("accept selects the quest, accepts it and points at engage", async () => {
    const { t } = await velan();
    const selected: number[] = [];
    t.handle.talk = () =>
      answer(t.handle, "dialog", { dialog: listDialog(OFFERED) });
    t.handle.selectQuest = (questId) => {
      selected.push(questId);
      answer(t.handle, "dialog", {
        dialog: detailsDialog(questId, "The Wayward Apprentice"),
      });
    };
    t.handle.acceptQuest = () => answer(t.handle, "accepted", {}, 9254);
    const res = await interactSpec.run(
      { do: "accept", npc: "Velan Brightoak", what: "1" },
      toolCtx<InteractAfter>(t),
    );
    expect(selected).toEqual([9254]);
    expect(res).toMatchObject({
      detail: "accepted The Wayward Apprentice #9254.",
      next: 'engage(quest: "9254")',
      status: "DONE",
    });
  });

  test("an NPC on a map without navigation data asks the human, not travel", async () => {
    const { t } = await velan(40);
    driveGoto(t.handle, [
      { refuse: "stop: unsupported map 0 (only Expansion01/530)" },
    ]);
    const refusal = interactSpec.run(
      { npc: "Velan Brightoak" },
      toolCtx<InteractAfter>(t),
    );
    await expect(refusal).rejects.toMatchObject({
      next: 'ask the human: "This map has no navigation data, so I cannot walk to Velan Brightoak. Can you move me there?"',
      reason: "unsupported_map_0",
      status: "FAILED",
    });
  });

  test("accept of a quest with nothing to kill or collect points at an NPC in view that its goal names", async () => {
    const { t } = await velan();
    setUnits(t.handle, [
      ...t.handle.queryNearby(),
      unitRow({
        distance: 56,
        guid: MCBRIDE,
        name: "Marshal McBride",
        relation: "friendly",
        roles: ["questgiver", "gossip"],
        x: 56,
        y: 0,
      }),
    ]);
    const threat = { questId: 783, title: "A Threat Within" };
    t.handle.talk = () =>
      answer(t.handle, "dialog", {
        dialog: listDialog([{ ...threat, icon: 2, level: 1 }]),
      });
    t.handle.selectQuest = () =>
      answer(t.handle, "dialog", { dialog: detailsDialog(783, threat.title) });
    t.handle.acceptQuest = () =>
      answer(
        t.handle,
        "accepted",
        { queries: [talkQuery(783, "Find Marshal McBride.")] },
        783,
      );
    const res = await interactSpec.run(
      { do: "accept", npc: "Velan Brightoak", what: "1" },
      toolCtx<InteractAfter>(t),
    );
    const ref = t.rt.refs.refOf(MCBRIDE);
    expect(res).toMatchObject({
      detail: `accepted A Threat Within #783. Goal: Find Marshal McBride (${ref}, 56 yd N). It has nothing to kill or collect.`,
      next: `interact(do: "turn_in", npc: "${ref}")`,
      status: "DONE",
    });
  });

  test("accept of a quest whose goal names no NPC in view looks for questgivers", async () => {
    const { t } = await velan();
    t.handle.talk = () =>
      answer(t.handle, "dialog", {
        dialog: listDialog([
          { icon: 2, level: 1, questId: 783, title: "A Threat Within" },
        ]),
      });
    t.handle.selectQuest = () =>
      answer(t.handle, "dialog", {
        dialog: detailsDialog(783, "A Threat Within"),
      });
    t.handle.acceptQuest = () =>
      answer(
        t.handle,
        "accepted",
        { queries: [talkQuery(783, "Find the lost scroll.")] },
        783,
      );
    const res = await interactSpec.run(
      { do: "accept", npc: "Velan Brightoak", what: "1" },
      toolCtx<InteractAfter>(t),
    );
    expect(res.next).toBe('look(find: "questgiver")');
  });

  test("accept without what refuses with the numbered offers", async () => {
    const { t } = await velan();
    t.handle.talk = () =>
      answer(t.handle, "dialog", { dialog: listDialog(OFFERED) });
    await expect(
      interactSpec.run(
        { do: "accept", npc: "Velan Brightoak" },
        toolCtx<InteractAfter>(t),
      ),
    ).rejects.toMatchObject({
      body: [
        "1. The Wayward Apprentice #9254 (level 9), available",
        "2. Situation at Sunsail Anchorage #8892 (level 10), available",
      ],
      reason: "which_quest",
    });
  });

  test("turn_in refuses with the reward choices, then takes the chosen one", async () => {
    const { t } = await velan();
    const log = {
      complete: true,
      slots: [
        {
          counters: [0, 0, 0, 0] as [number, number, number, number],
          expiresAtSeconds: 0,
          flags: 1,
          questId: 8325,
          slot: 0,
        },
      ],
    };
    const chosen: number[] = [];
    t.handle.talk = () =>
      answer(t.handle, "dialog", {
        dialog: listDialog([
          { icon: 4, level: 5, questId: 8325, title: "Thinning the Ranks" },
        ]),
        log,
      });
    t.handle.completeQuest = (questId) =>
      answer(t.handle, "dialog", {
        dialog: offerDialog(questId, "Thinning the Ranks"),
      });
    t.handle.chooseQuestReward = (index) => {
      chosen.push(index);
      answer(t.handle, "rewarded", {}, 8325);
    };
    await expect(
      interactSpec.run(
        { do: "turn_in", npc: "Velan Brightoak" },
        toolCtx<InteractAfter>(t),
      ),
    ).rejects.toMatchObject({
      body: ["1. Green Chain Boots (mail)", "2. Sunstrider Axe (axe)"],
      reason: "reward_needed",
    });
    const res = await interactSpec.run(
      { do: "turn_in", npc: "Velan Brightoak", reward: 2 },
      toolCtx<InteractAfter>(t),
    );
    expect(chosen).toEqual([1]);
    expect(res).toMatchObject({
      detail: "turned in Thinning the Ranks #8325. Reward: Sunstrider Axe.",
      status: "DONE",
    });
  });

  test("talk reads a completed request-items dialog as ready to turn in", async () => {
    const { t } = await velan();
    t.handle.talk = () =>
      answer(t.handle, "dialog", {
        dialog: requestDialog(8326, "Unfortunate Measures", 3),
      });
    const res = await interactSpec.run(
      { npc: "Velan Brightoak" },
      toolCtx<InteractAfter>(t),
    );
    expect(res.after.offers).toMatchObject([{ id: 8326, state: "ready" }]);
    expect(res.body).toContain(
      "Ready to turn in: 1. Unfortunate Measures #8326. Not a vendor or trainer.",
    );
  });

  test("talk reads an unfinished request-items dialog as incomplete", async () => {
    const { t } = await velan();
    t.handle.talk = () =>
      answer(t.handle, "dialog", {
        dialog: requestDialog(8326, "Unfortunate Measures", 0),
      });
    const res = await interactSpec.run(
      { npc: "Velan Brightoak" },
      toolCtx<InteractAfter>(t),
    );
    expect(res.after.offers).toMatchObject([{ id: 8326, state: "incomplete" }]);
  });

  test("turn_in from a completed request-items dialog asks for the reward", async () => {
    const { t } = await velan();
    const sent: string[] = [];
    t.handle.talk = () =>
      answer(t.handle, "dialog", {
        dialog: requestDialog(8326, "Unfortunate Measures", 3),
      });
    t.handle.completeQuest = () => {
      sent.push("complete");
    };
    t.handle.requestQuestReward = () => {
      sent.push("request");
      answer(t.handle, "dialog", {
        dialog: offerDialog(8326, "Unfortunate Measures"),
      });
    };
    t.handle.chooseQuestReward = (index) => {
      sent.push(`choose ${index}`);
      answer(t.handle, "rewarded", {}, 8326);
    };
    const res = await interactSpec.run(
      { do: "turn_in", npc: "Velan Brightoak", reward: 1 },
      toolCtx<InteractAfter>(t),
    );
    expect(sent).toEqual(["request", "choose 0"]);
    expect(res).toMatchObject({
      detail:
        "turned in Unfortunate Measures #8326. Reward: Green Chain Boots.",
      status: "DONE",
    });
  });

  test("turn_in refuses an unfinished request-items quest", async () => {
    const { t } = await velan();
    t.handle.talk = () =>
      answer(t.handle, "dialog", {
        dialog: requestDialog(8326, "Unfortunate Measures", 0),
      });
    await expect(
      interactSpec.run(
        { do: "turn_in", npc: "Velan Brightoak" },
        toolCtx<InteractAfter>(t),
      ),
    ).rejects.toMatchObject({ reason: "not_complete" });
  });

  test("turn_in refuses a reward number past the choices", async () => {
    const { t } = await velan();
    const chosen: number[] = [];
    t.handle.talk = () =>
      answer(t.handle, "dialog", {
        dialog: requestDialog(8326, "Unfortunate Measures", 3),
      });
    t.handle.requestQuestReward = () =>
      answer(t.handle, "dialog", {
        dialog: offerDialog(8326, "Unfortunate Measures"),
      });
    t.handle.chooseQuestReward = (index) => {
      chosen.push(index);
    };
    await expect(
      interactSpec.run(
        { do: "turn_in", npc: "Velan Brightoak", reward: 3 },
        toolCtx<InteractAfter>(t),
      ),
    ).rejects.toMatchObject({
      body: ["1. Green Chain Boots (mail)", "2. Sunstrider Axe (axe)"],
      detail:
        "reward 3 is not one of the 2 choices; pick a reward for Unfortunate Measures.",
      reason: "reward_needed",
    });
    expect(chosen).toEqual([]);
  });

  test("an NPC out of talk range is walked to first", async () => {
    const { t } = await velan(12);
    const goTo = driveGoto(t.handle, [{ arrive: { x: 9, y: 0 } }]);
    t.handle.talk = () =>
      answer(t.handle, "dialog", { dialog: listDialog(OFFERED) });
    await interactSpec.run(
      { npc: "Velan Brightoak" },
      toolCtx<InteractAfter>(t),
    );
    expect(goTo).toHaveBeenCalledWith({ guid: VELAN, kind: "guid" });
  });

  test("talk to a type-2 object uses it and opens the quest window", async () => {
    const t = await statueWorld(2);
    const used: bigint[] = [];
    const talked: bigint[] = [];
    t.handle.talk = (at) => {
      talked.push(at);
    };
    t.handle.objects.act.use = (at: bigint) => {
      used.push(at);
      answer(t.handle, "dialog", { dialog: listDialog(OFFERED) });
      return { ok: true as const, record: { entry: 1, guid: at } };
    };
    const res = await interactSpec.run(
      { npc: "o1" },
      toolCtx<InteractAfter>(t),
    );
    expect(used).toEqual([STATUE]);
    expect(talked).toEqual([]);
    expect(contentOf(res).split("\n")[0]).toBe(
      "DONE Ancient Statue (o1) offers:",
    );
    expect(res.after.offers.map((offer) => offer.id)).toEqual([9254, 8892]);
  });

  test("an object that is not a quest giver refuses without a use", async () => {
    const t = await statueWorld(0);
    const used: bigint[] = [];
    t.handle.objects.act.use = (at: bigint) => {
      used.push(at);
      return { ok: true as const, record: { entry: 1, guid: at } };
    };
    await expect(
      interactSpec.run({ npc: "o1" }, toolCtx<InteractAfter>(t)),
    ).rejects.toMatchObject({ reason: "not_quest_giver" });
    expect(used).toEqual([]);
  });
});

const STATUE = 0xf110_0000_0000_0070n;

async function statueWorld(type: number) {
  const t = await createTestRuntime({ parts: { refs: createRefTable() } });
  setSelf(t.handle);
  const row = objectRow({
    distance: 3,
    guid: STATUE,
    name: "Ancient Statue",
    x: 3,
    y: 0,
  });
  setUnits(t.handle, [
    {
      ...row,
      entity: { ...row.entity, gameObjectType: type } as GameObjectEntity,
    },
  ]);
  t.rt.refs.refOf(STATUE);
  t.handle.cancelInteraction = () => undefined;
  return t;
}
