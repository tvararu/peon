import { describe, expect, test } from "bun:test";
import type { OpsCtx } from "#harness/contract/services";
import { type InterruptRules, watchInterrupts } from "#harness/ops/danger";
import { createRefTable } from "#harness/ops/refs";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { nearbyRow, setWorld, unitEntity } from "#test-support/world-fixtures";

const ALL: InterruptRules = { death: true, newAttacker: true, rooted: true };

async function setup(signal = new AbortController().signal) {
  const { handle, rt } = await createTestRuntime({
    parts: { refs: createRefTable() },
  });
  setWorld(handle, {
    combat: { attackers: [0x50n] },
    rows: [nearbyRow(unitEntity({ guid: 0x60n, name: "Mana Wyrm" }))],
  });
  const ctx: OpsCtx = {
    handle,
    progress: () => {},
    rt,
    signal,
    toolCallId: "c1",
  };
  return { ctx, handle };
}

describe("watchInterrupts", () => {
  test("a new attacker aborts; the attacker at the start does not", async () => {
    const { ctx, handle } = await setup();
    const watch = watchInterrupts(ctx, ALL);
    handle.triggerCombatEvent({
      attacker: 0x50n,
      state: handle.getCombatState(),
      type: "attacked",
    });
    expect(watch.signal.aborted).toBe(false);
    handle.triggerCombatEvent({
      attacker: 0x60n,
      state: handle.getCombatState(),
      type: "attacked",
    });
    expect(watch.signal.aborted).toBe(true);
    expect(watch.cause()).toEqual({
      attacker: 0x60n,
      code: "attacked",
      detail: "Mana Wyrm u1 attacked you.",
    });
    watch.dispose();
  });

  test("before C5 it finds the new attacker in state.attackers", async () => {
    const { ctx, handle } = await setup();
    const watch = watchInterrupts(ctx, ALL);
    handle.triggerCombatEvent({
      state: { ...handle.getCombatState(), attackers: [0x50n, 0x60n] },
      type: "attacked",
    });
    expect(watch.cause()?.attacker).toBe(0x60n);
    watch.dispose();
  });

  test("newAttacker false lets the run go on", async () => {
    const { ctx, handle } = await setup();
    const watch = watchInterrupts(ctx, { ...ALL, newAttacker: false });
    handle.triggerCombatEvent({
      attacker: 0x60n,
      state: handle.getCombatState(),
      type: "attacked",
    });
    expect(watch.signal.aborted).toBe(false);
    watch.dispose();
  });

  test("an ignored attacker lets the run go on, another one stops it", async () => {
    const { ctx, handle } = await setup();
    const watch = watchInterrupts(ctx, {
      ...ALL,
      ignoreAttacker: (guid) => guid === 0x60n,
    });
    handle.triggerCombatEvent({
      attacker: 0x60n,
      state: handle.getCombatState(),
      type: "attacked",
    });
    expect(watch.signal.aborted).toBe(false);
    handle.triggerCombatEvent({
      attacker: 0x70n,
      state: handle.getCombatState(),
      type: "attacked",
    });
    expect(watch.cause()?.attacker).toBe(0x70n);
    watch.dispose();
  });

  test("rooted aborts", async () => {
    const { ctx, handle } = await setup();
    const watch = watchInterrupts(ctx, ALL);
    handle.triggerControlEvent({
      state: { ...handle.getControlState(), blockedReason: "rooted" },
      type: "control_changed",
    });
    expect(watch.cause()).toEqual({
      attacker: undefined,
      code: "rooted",
      detail: "you cannot move (rooted).",
    });
    watch.dispose();
  });

  test("death aborts", async () => {
    const { ctx, handle } = await setup();
    const watch = watchInterrupts(ctx, ALL);
    handle.triggerRecoveryEvent({
      at: 0,
      state: { ...handle.getRecoveryState(), life: "dead" },
      type: "life_observed",
    });
    expect(watch.cause()?.code).toBe("died");
    expect(watch.signal.reason).toEqual(new Error("died"));
    watch.dispose();
  });

  test("a parent abort aborts the watch without a cause", async () => {
    const parent = new AbortController();
    const { ctx } = await setup(parent.signal);
    const watch = watchInterrupts(ctx, ALL);
    parent.abort(new Error("human_stop"));
    expect(watch.signal.aborted).toBe(true);
    expect(watch.signal.reason).toEqual(new Error("human_stop"));
    expect(watch.cause()).toBeUndefined();
    watch.dispose();
  });

  test("dispose unsubscribes", async () => {
    const { ctx, handle } = await setup();
    const watch = watchInterrupts(ctx, ALL);
    watch.dispose();
    handle.triggerCombatEvent({
      attacker: 0x60n,
      state: handle.getCombatState(),
      type: "attacked",
    });
    expect(watch.signal.aborted).toBe(false);
  });
});
