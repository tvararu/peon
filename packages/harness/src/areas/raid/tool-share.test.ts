import type { Mock } from "bun:test";
import { describe, expect, jest, test } from "bun:test";
import type { AreaEventOf } from "@peon/core";
import { elapse, withFakeTimers } from "@peon/core/test-support/fake-time";
import {
  partyMember,
  partyState,
} from "@peon/core/test-support/party-fixtures";
import { groupSpec, groupTool } from "#harness/areas/raid/tool";
import type { GroupAfter } from "#harness/areas/raid/tool-shared";
import { toolCtx } from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { runTool } from "#test-support/tool-harness";

type Share = Extract<AreaEventOf<"quests">, { type: "share" }>["share"];

const TOM = 0x100n;
const ANN = 0x200n;
const QUEST = 8329;
const OTHER = 8325;
const SHARER = 0x300n;

type Setup = {
  inGroup?: boolean;
  log?: readonly number[];
  titles?: Record<number, string>;
  life?: "alive" | "dead" | "ghost";
  offer?: { kind: "share" | "confirm"; questId: number } | undefined;
};

async function world(setup: Setup = {}) {
  const t = await createTestRuntime();
  const inGroup = setup.inGroup ?? true;
  const party = inGroup
    ? partyState({
        inGroup: true,
        leader: "Tom",
        members: [
          partyMember({ guid: TOM, name: "Tom" }),
          partyMember({ guid: ANN, name: "Ann" }),
        ],
      })
    : partyState();
  const base = t.handle.getQuestState();
  const recovery = t.handle.getRecoveryState();
  const quests = t.handle.quests.state();
  const offer = setup.offer
    ? {
        at: 0,
        from: SHARER,
        kind: setup.offer.kind,
        questId: setup.offer.questId,
        title: "Unfortunate Measures",
      }
    : undefined;
  (t.handle.getPartyState as Mock<() => typeof party>).mockReturnValue(party);
  const raidState = {
    group: inGroup
      ? {
          battleground: false,
          counter: 1,
          difficulty: undefined,
          dungeonFinder: undefined,
          groupGuid: 1n,
          kind: "party" as const,
          leader: TOM,
          loot: undefined,
          members: (inGroup
            ? [
                partyMember({ guid: TOM, name: "Tom" }),
                partyMember({ guid: ANN, name: "Ann" }),
              ]
            : []
          ).map((member) => ({
            flags: member.flags,
            guid: member.guid,
            name: member.name,
            roles: member.roles,
            status: member.status,
            subgroup: member.subgroup,
          })),
          self: { flags: 0, roles: 0, subgroup: 0 },
        }
      : undefined,
    marks: Array.from({ length: 8 }, () => 0n),
    stats: new Map(),
  };
  jest.spyOn(t.handle.raid, "state").mockReturnValue(raidState as never);
  const withLog = (ids: readonly number[]) => ({
    ...base,
    log: {
      complete: true,
      slots: ids.map((questId, slot) => ({
        counters: [0, 0, 0, 0],
        expiresAtSeconds: 0,
        flags: 0,
        questId,
        slot,
      })),
    },
    queries: Object.entries(setup.titles ?? {}).map(([id, title]) => ({
      data: { title },
      questId: Number(id),
      status: "known" as const,
    })),
  });
  const state = withLog(setup.log ?? [QUEST]);
  (t.handle.getQuestState as unknown as Mock<() => unknown>).mockReturnValue(
    state as never,
  );
  jest
    .spyOn(t.handle, "getRecoveryState")
    .mockReturnValue({ ...recovery, life: setup.life ?? "alive" });
  jest.spyOn(t.handle.quests, "state").mockReturnValue({
    ...quests,
    share: { dropped: 0, offer, push: undefined },
  });
  const share = (change: Share) =>
    t.handle.triggerAreaEvent("quests", { share: change, type: "share" });
  return { ...t, share, tool: groupTool.definition(t.rt), withLog };
}

describe("group tool share_quest", () => {
  test("refuses outside a group without sending", async () => {
    const t = await world({ inGroup: false });
    const act = jest.spyOn(t.handle.quests.act, "shareQuest");
    const out = await runTool(t.tool, { do: "share_quest", quest: QUEST });
    expect(out.text).toContain("not_in_group");
    expect(act).not.toHaveBeenCalled();
  });

  test("refuses a quest that is not in the log and an empty slot", async () => {
    const t = await world({ log: [0, QUEST] });
    const act = jest.spyOn(t.handle.quests.act, "shareQuest");
    const missing = await runTool(t.tool, {
      do: "share_quest",
      quest: OTHER,
    });
    expect(missing.text).toContain("REFUSED unknown_quest");
    const empty = await runTool(t.tool, { do: "share_quest", quest: 0 });
    expect(empty.text).toContain("REFUSED unknown_quest");
    const none = await runTool(t.tool, { do: "share_quest" });
    expect(none.text).toContain("REFUSED needs_quest");
    expect(act).not.toHaveBeenCalled();
  });

  test("shares by title and lists each member's answer", async () => {
    const t = await world({ titles: { [QUEST]: "Unfortunate Measures" } });
    jest.spyOn(t.handle.quests.act, "shareQuest").mockImplementation(() => {
      t.share({ questId: QUEST, type: "pushed" });
      t.share({ guid: TOM, questId: QUEST, result: 0, type: "result" });
      t.share({ guid: ANN, questId: QUEST, result: 6, type: "result" });
      t.share({ guid: TOM, questId: QUEST, result: 2, type: "relayed" });
      t.share({ questId: QUEST, reason: "complete", type: "closed" });
      return { ok: true };
    });
    const out = await runTool(t.tool, {
      do: "share_quest",
      quest: "unfortunate",
    });
    expect(t.handle.quests.act.shareQuest).toHaveBeenCalledWith(QUEST);
    expect(out.text).toContain("DONE ");
    expect(out.text).toContain("Tom: sharing");
    expect(out.text).toContain("Tom: accepted");
    expect(out.text).toContain("Ann: has it");
  });

  test("names the declined and busy answers", async () => {
    const t = await world();
    jest.spyOn(t.handle.quests.act, "shareQuest").mockImplementation(() => {
      t.share({ guid: TOM, questId: QUEST, result: 4, type: "result" });
      t.share({ guid: ANN, questId: QUEST, result: 0, type: "result" });
      t.share({ guid: ANN, questId: QUEST, result: 3, type: "relayed" });
      t.share({ questId: QUEST, reason: "complete", type: "closed" });
      return { ok: true };
    });
    const out = await runTool(t.tool, { do: "share_quest", quest: QUEST });
    expect(out.text).toContain("Tom: busy");
    expect(out.text).toContain("Ann: declined");
  });

  test("ignores rows for another quest", async () => {
    const t = await world({ log: [QUEST, OTHER] });
    jest.spyOn(t.handle.quests.act, "shareQuest").mockImplementation(() => {
      t.share({ guid: TOM, questId: OTHER, result: 6, type: "result" });
      t.share({ questId: OTHER, reason: "complete", type: "closed" });
      t.share({ guid: ANN, questId: QUEST, result: 1, type: "result" });
      t.share({ questId: QUEST, reason: "complete", type: "closed" });
      return { ok: true };
    });
    const out = await runTool(t.tool, { do: "share_quest", quest: QUEST });
    expect(out.text).toContain("Ann: cannot take it");
    expect(out.text).not.toContain("Tom");
  });

  test("a no_answer close within 3 s is UNCONFIRMED", async () => {
    const t = await world();
    jest.spyOn(t.handle.quests.act, "shareQuest").mockImplementation(() => {
      t.share({ questId: QUEST, type: "pushed" });
      return { ok: true };
    });
    const out = await withFakeTimers(async () => {
      const run = runTool(t.tool, { do: "share_quest", quest: QUEST });
      await elapse(2999);
      t.share({ questId: QUEST, reason: "no_answer", type: "closed" });
      return run;
    });
    expect(out.text).toContain("UNCONFIRMED no_answer");
  });

  test("a silent server also ends the wait", async () => {
    const t = await world();
    jest
      .spyOn(t.handle.quests.act, "shareQuest")
      .mockImplementation(() => ({ ok: true }));
    const out = await withFakeTimers(async () => {
      const run = runTool(t.tool, { do: "share_quest", quest: QUEST });
      await elapse(3600);
      return run;
    });
    expect(out.text).toContain("UNCONFIRMED no_answer");
  });

  test("refuses while a push is open", async () => {
    const t = await world();
    jest
      .spyOn(t.handle.quests.act, "shareQuest")
      .mockReturnValue({ ok: false, reason: "busy" });
    const out = await runTool(t.tool, { do: "share_quest", quest: QUEST });
    expect(out.text).toContain("busy");
  });

  test("a throwing send rejects and frees the subscription", async () => {
    const t = await world();
    jest.spyOn(t.handle.quests.act, "shareQuest").mockImplementation(() => {
      throw new Error("socket closed");
    });
    const out = await runTool(t.tool, { do: "share_quest", quest: QUEST });
    expect(out.text).toContain("FAILED");
  });

  test("an aborted share sends nothing", async () => {
    const t = await world();
    const act = jest.spyOn(t.handle.quests.act, "shareQuest");
    const abort = new AbortController();
    abort.abort(new Error("cancelled"));
    await expect(
      groupSpec.run(
        { do: "share_quest", quest: QUEST },
        toolCtx<GroupAfter>(t, abort.signal),
      ),
    ).rejects.toThrow("cancelled");
    expect(act).not.toHaveBeenCalled();
  });

  test("a self-only refusal closes the share as FAILED refused", async () => {
    const t = await world();
    jest.spyOn(t.handle.quests.act, "shareQuest").mockImplementation(() => {
      t.share({ questId: QUEST, type: "pushed" });
      t.share({
        guid: 0x1n,
        questId: QUEST,
        result: 8,
        type: "result",
      });
      t.share({ questId: QUEST, reason: "refused", type: "closed" });
      return { ok: true };
    });
    const out = await runTool(t.tool, { do: "share_quest", quest: QUEST });
    expect(out.text).toContain("FAILED refused");
  });
});

describe("group tool accept_quest and decline_quest", () => {
  test("refuse without an open offer", async () => {
    const t = await world();
    const act = jest.spyOn(t.handle.quests.act, "answerShare");
    const accept = await runTool(t.tool, { do: "accept_quest" });
    expect(accept.text).toContain("REFUSED no_offer");
    const decline = await runTool(t.tool, { do: "decline_quest" });
    expect(decline.text).toContain("REFUSED no_offer");
    expect(act).not.toHaveBeenCalled();
  });

  test("refuse while dead", async () => {
    const t = await world({
      life: "dead",
      offer: { kind: "share", questId: QUEST },
    });
    const act = jest.spyOn(t.handle.quests.act, "answerShare");
    const out = await runTool(t.tool, { do: "accept_quest" });
    expect(out.text).toContain("REFUSED dead");
    expect(act).not.toHaveBeenCalled();
  });

  test("decline sends the decline and is done", async () => {
    const t = await world({ offer: { kind: "share", questId: QUEST } });
    const act = jest
      .spyOn(t.handle.quests.act, "answerShare")
      .mockReturnValue(true);
    const out = await runTool(t.tool, { do: "decline_quest" });
    expect(act).toHaveBeenCalledWith("decline");
    expect(out.text).toContain("DONE ");
  });

  test("a decline the store no longer owes is refused", async () => {
    const t = await world({ offer: { kind: "share", questId: QUEST } });
    jest.spyOn(t.handle.quests.act, "answerShare").mockReturnValue(false);
    const out = await runTool(t.tool, { do: "decline_quest" });
    expect(out.text).toContain("REFUSED no_offer");
  });

  test("accept is done when the quest enters the log", async () => {
    const t = await world({
      log: [OTHER],
      offer: { kind: "share", questId: QUEST },
    });
    const act = jest
      .spyOn(t.handle.quests.act, "answerShare")
      .mockImplementation(() => {
        const next = t.withLog([OTHER, QUEST]);
        (
          t.handle.getQuestState as unknown as Mock<() => unknown>
        ).mockReturnValue(next as never);
        t.handle.triggerQuestEvent({
          source: "quest_log",
          state: next as never,
          type: "log",
        });
        return true;
      });
    const out = await runTool(t.tool, { do: "accept_quest" });
    expect(act).toHaveBeenCalledWith("accept");
    expect(out.text).toContain("DONE ");
  });

  test("a log event without the quest does not confirm", async () => {
    const t = await world({
      log: [OTHER],
      offer: { kind: "confirm", questId: QUEST },
    });
    jest.spyOn(t.handle.quests.act, "answerShare").mockImplementation(() => {
      t.handle.triggerQuestEvent({
        source: "quest_log",
        state: t.handle.getQuestState(),
        type: "log",
      });
      return true;
    });
    const out = await withFakeTimers(async () => {
      const run = runTool(t.tool, { do: "accept_quest" });
      await elapse(5100);
      return run;
    });
    expect(out.text).toContain("UNCONFIRMED");
  });

  test("a throwing accept fails without hanging", async () => {
    const t = await world({
      log: [OTHER],
      offer: { kind: "share", questId: QUEST },
    });
    jest.spyOn(t.handle.quests.act, "answerShare").mockImplementation(() => {
      throw new Error("socket closed");
    });
    const out = await runTool(t.tool, { do: "accept_quest" });
    expect(out.text).toContain("FAILED");
  });
});
