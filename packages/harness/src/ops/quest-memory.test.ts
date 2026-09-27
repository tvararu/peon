import { describe, expect, test } from "bun:test";
import type { QuestLogSlot, QuestState } from "@peon/core";
import type { ToolResult } from "#harness/contract/result";
import {
  completeQuestIds,
  enderIn,
  noteQuestsDone,
  turnInNext,
} from "#harness/ops/quest-memory";
import { createTestRuntime } from "#test-support/runtime-fixture";

function logged(questId: number, flags: number): QuestLogSlot {
  return {
    counters: [0, 0, 0, 0],
    expiresAtSeconds: undefined,
    flags,
    questId,
    slot: 0,
  };
}

function withLog(state: QuestState, slots: QuestLogSlot[]): QuestState {
  return { ...state, log: { complete: true, slots } };
}

describe("enderIn", () => {
  test("finds the NPC a talk or return goal names", () => {
    expect(enderIn("Speak with Marshal McBride.")).toBe("Marshal McBride");
    expect(enderIn("Report to Magistrix Erona at Sunstrider Isle.")).toBe(
      "Magistrix Erona",
    );
    expect(
      enderIn(
        "Kill 8 Mana Wyrms, then return to Magistrix Erona on Sunstrider Isle.",
      ),
    ).toBe("Magistrix Erona");
    expect(enderIn("Bring 8 Wolf Meat to Deputy Willem in Northshire.")).toBe(
      "Deputy Willem",
    );
  });

  test("finds no NPC in a goal that names none", () => {
    expect(enderIn("Kill 10 Kobold Vermin.")).toBeUndefined();
    expect(enderIn("")).toBeUndefined();
  });
});

describe("quest completion notes", () => {
  test("a quest that became complete adds the turn-in step", async () => {
    const { handle, rt } = await createTestRuntime();
    const base = handle.getQuestState();
    const before = completeQuestIds(withLog(base, [logged(8325, 0)]));
    handle.getQuestState = () => withLog(base, [logged(8325, 1)]);
    rt.quests.set(8325, {
      ender: undefined,
      giver: "Magistrix Erona",
      objectives: "Kill 8 Mana Wyrms.",
      title: "Reclaiming Sunstrider Isle",
    });
    const report: ToolResult<null> = {
      after: null,
      body: [],
      detail: "killed Mana Wyrm u4 in 9 s, server kill credit.",
      status: "DONE",
    };
    expect(noteQuestsDone({ handle, rt }, before, report)).toMatchObject({
      detail:
        "killed Mana Wyrm u4 in 9 s, server kill credit. Quest 8325 complete.",
      next: 'interact(do: "turn_in", npc: "Magistrix Erona")',
    });
  });

  test("a quest that was complete before adds nothing", async () => {
    const { handle, rt } = await createTestRuntime();
    const state = withLog(handle.getQuestState(), [logged(8325, 1)]);
    handle.getQuestState = () => state;
    const report: ToolResult<null> = {
      after: null,
      body: [],
      detail: "looted Mana Wyrm: 3 copper.",
      status: "DONE",
    };
    expect(
      noteQuestsDone({ handle, rt }, completeQuestIds(state), report),
    ).toBe(report);
  });

  test("with no known giver or ender the turn-in step looks for questgivers", async () => {
    const { handle, rt } = await createTestRuntime();
    expect(turnInNext({ handle, rt }, 8325)).toBe('look(find: "questgiver")');
  });
});
