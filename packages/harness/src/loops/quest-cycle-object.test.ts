import { describe, expect, jest, test } from "bun:test";
import { cycleStop } from "#harness/loops/cycle-stop";
import type { CycleObjective } from "#harness/loops/cycle-types";
import { questCycleObjective } from "#harness/loops/quest-cycle";
import type {
  ObjectivePick,
  ObjectiveProgress,
} from "#harness/loops/quest-objective";
import { fakeRecovery } from "#test-support/cycle-recovery-fixtures";
import {
  advanceUntilSettled,
  fakeControl,
  fakeLoot,
  fakeTactics,
  makeCycle,
} from "#test-support/encounter-cycle-fixtures";
import {
  CRATE_ENTRY,
  CRATE_GUID,
  KEY,
  OPEN_SPELL,
  QUEST,
  questCycle,
  run,
  template,
  world,
} from "#test-support/quest-object-world";

describe("the quest cycle visits objects", () => {
  test("walks to the chest, opens it with its spell, takes the quest item", async () => {
    const t = world({ x: 12 });
    t.loot.onEvent((event) => {
      if (event.type === "loot_removed") t.state.flags = 1;
    });
    const { runtime, tactics } = await run(t);
    const state = runtime.snapshot();
    expect(tactics.calls()).toBe(0);
    expect(t.walked.length).toBeGreaterThan(0);
    expect(t.order).toEqual(["lock", "use", "open"]);
    expect(t.acts.open).toHaveBeenCalledWith(CRATE_GUID, OPEN_SPELL);
    expect(t.loot.taken()).toEqual([1]);
    expect(state.queue).toMatchObject([
      { guid: CRATE_GUID, loot: "looted", status: "done" },
    ]);
    expect(state.stopCause).toBe("objective_complete");
  });

  test("a key-locked chest is opened with the key item and looted", async () => {
    const t = world();
    jest
      .spyOn(t.acts, "openLockSpell")
      .mockResolvedValue({ by: "item", entry: KEY });
    jest.spyOn(t.acts, "useItemOn").mockImplementation(async () => {
      t.order.push("useItem");
      t.loot.open(CRATE_GUID);
      return { ok: true };
    });
    t.loot.onEvent((event) => {
      if (event.type === "loot_removed") t.state.flags = 1;
    });
    const { runtime } = await run(t);
    expect(t.order).toEqual(["use", "useItem"]);
    expect(t.acts.useItemOn).toHaveBeenCalledWith(KEY, CRATE_GUID);
    expect(t.acts.open).not.toHaveBeenCalled();
    expect(runtime.snapshot().queue).toMatchObject([
      { guid: CRATE_GUID, loot: "looted", status: "done" },
    ]);
    expect(runtime.snapshot().stopCause).toBe("objective_complete");
  });

  test("a key the character does not carry is skipped with the refusal", async () => {
    const t = world();
    jest
      .spyOn(t.acts, "openLockSpell")
      .mockResolvedValue({ by: "item", entry: KEY });
    jest
      .spyOn(t.acts, "useItemOn")
      .mockResolvedValue({ ok: false, reason: "no_item" });
    const { runtime } = await run(t);
    expect(t.acts.open).not.toHaveBeenCalled();
    expect(runtime.snapshot().queue[0]).toMatchObject({
      cause: "open_no_item",
      status: "skipped",
    });
  });

  test("a chest that no walk can reach is skipped as unreachable", async () => {
    const t = world({ x: 30 });
    t.handle.walkTowardPoint = jest.fn(async () => ({
      pose: t.pose,
      status: "stopped" as const,
      traveled: 0,
    }));
    const { runtime } = await run(t);
    expect(runtime.snapshot().queue).toMatchObject([
      { cause: "target_unreachable", status: "skipped" },
      { cause: "target_unreachable", status: "skipped" },
    ]);
    expect(t.acts.use).not.toHaveBeenCalled();
  });

  test("an unopened chest is skipped after the loot window never opens", async () => {
    jest.useFakeTimers();
    try {
      const t = world();
      jest.spyOn(t.acts, "open").mockImplementation(() => ({ ok: true }));
      const abandoned = jest.spyOn(t.loot, "abandonOpen");
      const { objective } = await questCycleObjective(t.handle, QUEST, []);
      const { runtime } = questCycle(t);
      await advanceUntilSettled(
        runtime.start({
          guids: [],
          instruction: "get the crates",
          maxStarts: 1,
          objective,
        }),
        20_000,
      );
      expect(runtime.snapshot().queue).toMatchObject([
        { cause: "loot_denied:timeout", status: "skipped" },
      ]);
      expect(abandoned).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  test("a plain object is used once and progress comes from quest events", async () => {
    jest.useFakeTimers();
    try {
      const t = world({ templates: [template({ lockId: 0, type: 10 })] });
      jest.spyOn(t.acts, "use").mockImplementation(() => {
        queueMicrotask(() =>
          t.handle.triggerQuestEvent({
            source: "packet",
            state: t.handle.getQuestState(),
            type: "progress",
          }),
        );
        return { ok: true, record: { entry: CRATE_ENTRY, guid: CRATE_GUID } };
      });
      const { objective } = await questCycleObjective(t.handle, QUEST, []);
      const { runtime } = questCycle(t);
      await advanceUntilSettled(
        runtime.start({
          guids: [],
          instruction: "use it",
          maxStarts: 1,
          objective,
        }),
        20_000,
      );
      expect(t.acts.open).not.toHaveBeenCalled();
      expect(runtime.snapshot().queue).toMatchObject([{ status: "done" }]);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("the cycle's visit hook", () => {
  const objectPick: ObjectivePick = {
    distance: 5,
    entry: CRATE_ENTRY,
    guid: 9n,
    kind: "object",
  };

  function withVisit(visit: CycleObjective["visit"]) {
    const picks: ObjectivePick[] = [objectPick];
    const source: CycleObjective = {
      pick: () => picks.shift() ?? cycleStop("objective_targets_absent"),
      progress: () => undefined,
      visit,
    };
    const tactics = fakeTactics([]);
    const runtime = makeCycle({
      control: fakeControl(),
      loot: fakeLoot({}),
      now: () => 0,
      recovery: fakeRecovery({ life: ["alive"] }),
      tactics,
    });
    return { runtime, source, tactics };
  }

  test("an object pick without a visit stops the run and never fights", async () => {
    const { runtime, source, tactics } = withVisit(undefined);
    await runtime.start({ guids: [], instruction: "x", objective: source });
    expect(runtime.snapshot().stopCause).toBe("objective_object_unsupported");
    expect(tactics.calls()).toBe(0);
  });

  test("an object that moves no counter is picked twice, then retired", async () => {
    const picked: bigint[] = [];
    const source: CycleObjective = {
      pick: (tried) => {
        if (tried.has(objectPick.guid))
          return cycleStop("objective_targets_absent");
        picked.push(objectPick.guid);
        return objectPick;
      },
      progress: () => undefined,
      visit: async () => ({ cause: "target_unreachable", ok: true }),
    };
    const { runtime } = withVisit(undefined);
    await runtime.start({ guids: [], instruction: "x", objective: source });
    expect(picked).toHaveLength(2);
    expect(runtime.snapshot().stopCause).toBe("objective_targets_absent");
  });

  test("an object whose visits move the counter is not retired", async () => {
    let counter = 0;
    const progress = (): ObjectiveProgress => ({
      complete: false,
      items: [],
      kills: [],
      objects: [
        { current: counter, entry: CRATE_ENTRY, index: 0, required: 4 },
      ],
      questId: QUEST,
      slot: 0,
    });
    const source: CycleObjective = {
      pick: (tried) =>
        counter >= 4 || tried.has(objectPick.guid)
          ? cycleStop("objective_targets_absent")
          : objectPick,
      progress,
      visit: async () => {
        counter++;
        return { ok: true };
      },
    };
    const { runtime } = withVisit(undefined);
    await runtime.start({ guids: [], instruction: "x", objective: source });
    expect(counter).toBe(4);
    expect(runtime.snapshot().queue).toHaveLength(4);
  });

  test("a chest whose loot was taken is not visited again", async () => {
    let counter = 0;
    const source: CycleObjective = {
      pick: (tried) =>
        tried.has(objectPick.guid)
          ? cycleStop("objective_targets_absent")
          : objectPick,
      progress: () => ({
        complete: false,
        items: [],
        kills: [],
        objects: [
          { current: counter, entry: CRATE_ENTRY, index: 0, required: 4 },
        ],
        questId: QUEST,
        slot: 0,
      }),
      visit: async () => {
        counter++;
        return {
          ok: true,
          record: {
            coinageAfter: 0,
            coinageBefore: 0,
            guid: "9",
            moneyTaken: 0,
            slotsLeft: [],
            slotsTaken: [0],
          },
        };
      },
    };
    const { runtime } = withVisit(undefined);
    await runtime.start({ guids: [], instruction: "x", objective: source });
    expect(counter).toBe(1);
    expect(runtime.snapshot().stopCause).toBe("objective_targets_absent");
  });

  test("a visit stop ends the run with its own cause", async () => {
    const { runtime, source } = withVisit(async () =>
      cycleStop("loot_denied:unexpected_phase"),
    );
    await runtime.start({ guids: [], instruction: "x", objective: source });
    expect(runtime.snapshot().stopCause).toBe("loot_denied:unexpected_phase");
  });
});
