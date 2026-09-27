import { describe, expect, test } from "bun:test";
import type { RecoveryEvent, RewardsEvent } from "@peon/core";
import { createMockHandle } from "@peon/core/test-support/mock-handle";
import type { RunEnd, RunKind } from "#harness/contract/runs";
import { routerSetup } from "#test-support/router-fixture";

type Ending = RunEnd<number>["status"];

function world() {
  const setup = routerSetup();
  const handle = createMockHandle();
  setup.router.attach(handle);
  const start = (kind: RunKind, args: Record<string, unknown> = {}) => {
    let finish: (status: Ending) => void = () => {};
    const run = setup.runs.start({
      args,
      kind,
      launch: () =>
        new Promise<RunEnd<number>>((resolve) => {
          finish = (status) => resolve({ status, summary: "end", value: 1 });
        }),
      toolCallId: `call-${kind}`,
    });
    const end = async (status: Ending) => {
      finish(status);
      await run.done;
    };
    return { end, id: run.id };
  };
  const recoveryBase = handle.getRecoveryState();
  const life = (state: RecoveryEvent["state"]["life"]) =>
    handle.triggerRecoveryEvent({
      at: 0,
      state: { ...recoveryBase, life: state },
      type: "life_observed",
    });
  const rewardsBase = handle.getRewardsState();
  const rewards = (type: RewardsEvent["type"], coinage: number) =>
    handle.triggerRewardsEvent({
      at: 0,
      state: {
        ...rewardsBase,
        inventory: { ...rewardsBase.inventory, coinage },
      },
      type,
    });
  const row = (event: string) =>
    setup.log.since(0).find((entry) => entry.event === event);
  return { ...setup, handle, life, rewards, row, start };
}

describe("rows a tool result already covered", () => {
  test("a death during an awaited run is consumed by its call", async () => {
    const w = world();
    w.life("alive");
    const run = w.start("engage");
    w.life("dead");
    await run.end("failed");
    expect(w.row("life/dead")).toMatchObject({
      class: "wake",
      consumedBy: "call-engage",
      runId: run.id,
    });
  });

  test("a death during a run the agent no longer awaits still wakes", async () => {
    const w = world();
    w.life("alive");
    const run = w.start("engage");
    w.runs.release(run.id);
    w.life("dead");
    await run.end("failed");
    expect(w.row("life/dead")?.consumedBy).toBeUndefined();
  });

  test("release, return to life and the teleport belong to recover", async () => {
    const w = world();
    w.life("alive");
    w.life("dead");
    const run = w.start("recover");
    w.life("ghost");
    const pose = {
      mapId: 530,
      orientation: 0,
      source: "server" as const,
      updatedAt: 0,
      x: 8710,
      y: -6672,
      z: 70,
    };
    w.handle.triggerControlEvent({
      reason: "teleport",
      state: { ...w.handle.getControlState(), pose, serverPose: pose },
      type: "server_correction",
    });
    w.life("alive");
    await run.end("succeeded");
    expect(w.row("control/teleport")?.consumedBy).toBe("call-recover");
    expect(w.row("life/dead")?.consumedBy).toBeUndefined();
    expect(w.row("life/released")?.consumedBy).toBe("call-recover");
    expect(w.row("life/alive")?.consumedBy).toBe("call-recover");
  });

  test("quest progress inside a quest engage is consumed", async () => {
    const w = world();
    const run = w.start("engage", { quest: 8325 });
    w.handle.triggerQuestEvent({
      questId: 8325,
      source: "packet",
      state: w.handle.getQuestState(),
      type: "completed",
    });
    await run.end("succeeded");
    expect(w.row("quest/completed")?.consumedBy).toBe("call-engage");
  });

  test("loot money just after an engage ends belongs to it", async () => {
    const w = world();
    w.rewards("inventory_observed", 100);
    const run = w.start("engage");
    await run.end("partly");
    w.rewards("money_notice", 100);
    w.rewards("inventory_observed", 104);
    expect(w.row("money/change")).toMatchObject({
      consumedBy: "call-engage",
      runId: run.id,
    });
  });
});
