import { describe, expect, jest, test } from "bun:test";
import type { AreaActsOf, QuestDialog } from "@peon/core";
import { withFakeTimers } from "@peon/core/test-support/fake-time";
import type { InteractAfter } from "#harness/contract/details";
import { interactSpec } from "#harness/tools/interact";
import { DIALOG_MS } from "#harness/tools/interact-quest";
import { interactParams } from "#harness/tools/params-interact";
import { contentOf, limitProblem, toolCtx } from "#test-support/ops-fixtures";
import { answer, VELAN, velan } from "#test-support/quest-fixtures";
import type { TestRuntime } from "#test-support/runtime-fixture";

type ResetResult = AreaActsOf<"talents">["resetTalents"] extends (
  ...args: never[]
) => Promise<infer R>
  ? R
  : never;
type ResetRequest = AreaActsOf<"talents">["resetTalents"] extends (
  request: infer Q,
) => Promise<unknown>
  ? Q
  : never;
type GossipOption = {
  boxText: string;
  coded: number;
  icon: number;
  money: number;
  optionIndex: number;
  text: string;
};
function option(optionIndex: number, text: string): GossipOption {
  return { boxText: "", coded: 0, icon: 0, money: 0, optionIndex, text };
}
function gossip(...options: GossipOption[]): QuestDialog {
  return {
    data: {
      guid: VELAN,
      menuId: 4000,
      options,
      quests: [],
      titleTextId: 1,
    },
    kind: "gossip",
  };
}

async function trainer(
  dialog: QuestDialog | undefined,
  outcome: ResetResult | Error,
): Promise<{ calls: ResetRequest[]; t: TestRuntime }> {
  const { t } = await velan();
  const calls: ResetRequest[] = [];
  t.handle.talk = () => {
    if (dialog) answer(t.handle, "dialog", { dialog });
  };
  Object.assign(t.handle.talents.act, {
    resetTalents: async (request: ResetRequest) => {
      calls.push(request);
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  });
  const inventory = t.handle.getInventoryState();
  t.handle.getInventoryState = () => ({ ...inventory, coinage: 25_000 });
  return { calls, t };
}

const OFFERED = gossip(
  option(0, "Train me."),
  option(3, "i wish to UNLEARN my talents."),
);

async function run(t: TestRuntime, args: { max_cost?: number } = {}) {
  return await interactSpec.run(
    { do: "reset_talents", npc: "Velan Brightoak", ...args },
    toolCtx<InteractAfter>(t),
  );
}

describe("interact reset_talents", () => {
  test("without max_cost it names the cost and pays nothing", async () => {
    const { calls, t } = await trainer(OFFERED, {
      cost: 10_000,
      outcome: "too_expensive",
    });
    const failure = await run(t).catch((error: unknown) => error);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ maxCost: 0, optionIndex: 3 });
    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(failure).toMatchObject({ reason: "too_expensive" });
    const detail = String((failure as { detail: string }).detail);
    expect(detail).toContain("costs 1g");
    expect(detail).toContain("max_cost 10000");
    expect(String((failure as { next?: string }).next)).toContain(
      "max_cost: 10000",
    );
    expect(String((failure as { next?: string }).next)).toContain(
      'do: "reset_talents"',
    );
  });

  test("with max_cost it resets and reports the points and the price", async () => {
    const { calls, t } = await trainer(OFFERED, {
      cost: 10_000,
      freePoints: 3,
      outcome: "reset",
    });
    const res = await run(t, { max_cost: 10_000 });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(res.status).toBe("DONE");
    expect(res.detail).toContain("3 points free");
    expect(res.detail).toContain("Paid 1g");
    expect(res.after).toMatchObject({ action: "reset_talents" });
    expect(limitProblem(contentOf(res))).toBeUndefined();
  });

  test("one free point reads singular", async () => {
    const { t } = await trainer(OFFERED, {
      cost: 0,
      freePoints: 1,
      outcome: "reset",
    });
    const res = await run(t, { max_cost: 5 });
    expect(res.detail).toContain("1 point free");
    expect(res.detail).toContain("Paid 0 copper");
  });

  test("a trainer without the option is reported and nothing is sent", async () => {
    const { calls, t } = await trainer(gossip(option(0, "Train me.")), {
      outcome: "nothing_to_reset",
    });
    const failure = await run(t, { max_cost: 10_000 }).catch(
      (error: unknown) => error,
    );
    expect(calls).toEqual([]);
    expect(failure).toMatchObject({ reason: "option_not_offered" });
    expect(String((failure as { detail: string }).detail)).toContain(
      "level 10",
    );
  });

  test("an NPC that opens no gossip does not offer it either", async () => {
    const { calls, t } = await trainer(undefined, {
      outcome: "nothing_to_reset",
    });
    t.handle.talk = () => {
      jest.advanceTimersByTime(DIALOG_MS);
    };
    const failure = await withFakeTimers(() => run(t)).catch(
      (error: unknown) => error,
    );
    expect(calls).toEqual([]);
    expect(failure).toMatchObject({ reason: "option_not_offered" });
  });

  test.each([
    ["not_enough_money", "money"],
    ["nothing_to_reset", "no talents"],
  ] as const)("%s has its own line", async (outcome, word) => {
    const { t } = await trainer(OFFERED, { outcome });
    const failure = await run(t, { max_cost: 10_000 }).catch(
      (error: unknown) => error,
    );
    expect(failure).toMatchObject({ reason: outcome });
    expect(
      String((failure as { detail: string }).detail).toLowerCase(),
    ).toContain(word);
  });

  test("a silent server is unconfirmed", async () => {
    const { t } = await trainer(OFFERED, { outcome: "no_reply" });
    const res = await run(t, { max_cost: 10_000 });
    expect(res.status).toBe("UNCONFIRMED");
    expect(res).toMatchObject({ reason: "no_reply" });
  });

  test("a failure in the act reaches the caller", async () => {
    const { t } = await trainer(OFFERED, new Error("talent_request_busy"));
    await expect(run(t, { max_cost: 10_000 })).rejects.toThrow(
      "talent_request_busy",
    );
  });

  test("the parameters name the verb and a non-negative max_cost", () => {
    const schema = JSON.stringify(interactParams);
    expect(schema).toContain("reset_talents");
    expect(schema).toContain("max_cost");
  });
});
