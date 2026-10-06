import { describe, expect, test } from "bun:test";
import type { PilotAfter } from "#harness/contract/details";
import { pilotSpec } from "#harness/tools/pilot";
import { moveTo, setSelf, toolCtx } from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

async function ready() {
  const t = await createTestRuntime();
  setSelf(t.handle);
  t.handle.capabilities = () => ({
    factions: true,
    jev: true,
    navigation: true,
    spells: true,
  });
  return t;
}

describe("pilot refusals", () => {
  test("no Jev key refuses no_combat_helper before any run starts", async () => {
    const t = await ready();
    t.handle.capabilities = () => ({
      factions: true,
      jev: false,
      navigation: true,
      spells: true,
    });
    await expect(
      pilotSpec.run({ to: { x: 10, y: 0 } }, toolCtx<PilotAfter>(t)),
    ).rejects.toMatchObject({ reason: "no_combat_helper" });
    expect(t.rt.runs.active()).toBeUndefined();
  });

  test("a pilot port is ready without a Jev key", async () => {
    const t = await ready();
    t.handle.capabilities = () => ({
      factions: true,
      jev: false,
      navigation: true,
      pilot: true,
      spells: true,
    });
    t.handle.startPilot = (async () => {}) as never;
    const res = await pilotSpec.run(
      { minutes: 0, to: { x: 10, y: 0 } },
      toolCtx<PilotAfter>(t),
    );
    expect(res.reason).not.toBe("no_combat_helper");
    expect(res.runId).toBeDefined();
  });
  test("a map without navigation refuses unsupported_map", async () => {
    const t = await ready();
    t.handle.capabilities = () => ({
      factions: true,
      jev: true,
      navigation: false,
      spells: true,
    });
    await expect(
      pilotSpec.run({ to: { x: 10, y: 0 } }, toolCtx<PilotAfter>(t)),
    ).rejects.toMatchObject({ reason: "unsupported_map" });
  });

  test("a dead character refuses dead", async () => {
    const t = await ready();
    setSelf(t.handle, { life: "dead" });
    await expect(
      pilotSpec.run({ to: { x: 10, y: 0 } }, toolCtx<PilotAfter>(t)),
    ).rejects.toMatchObject({ reason: "dead" });
  });
  test("neither or both of to and circle refuse bad_objective", async () => {
    const t = await ready();
    await expect(
      pilotSpec.run({}, toolCtx<PilotAfter>(t)),
    ).rejects.toMatchObject({ reason: "bad_objective" });
    await expect(
      pilotSpec.run(
        {
          circle: { direction: "clockwise", radius: 5, x: 0, y: 0 },
          to: { x: 1, y: 1 },
        },
        toolCtx<PilotAfter>(t),
      ),
    ).rejects.toMatchObject({ reason: "bad_objective" });
  });
});

describe("pilot steering report", () => {
  test("counts every applied decision and the walked path past 200", async () => {
    const t = await ready();
    const completed = (call: number) => ({
      actionId: call % 10 === 0 ? "jump_ahead" : "run_ahead",
      ageMs: 5,
      call,
      runId: "p1",
      type: "applied" as const,
    });
    t.handle.startPilot = (async () => {
      for (let call = 1; call <= 250; call += 1) {
        moveTo(t.handle, { x: call, y: 0 });
        t.handle.triggerPilotEvent({
          framing: "none",
          instruction: "pilot",
          objective: { kind: "reach", x: 300, y: 0 },
          runId: "p1",
          targetGuid: undefined,
          type: "started",
        });
        if (call === 1) continue;
        t.handle.triggerPilotEvent(completed(call));
      }
      t.handle.triggerPilotEvent({
        reason: "goal_reached",
        runId: "p1",
        status: "completed",
        type: "outcome",
      });
    }) as never;
    const res = await pilotSpec.run(
      { to: { x: 300, y: 0 } },
      toolCtx<PilotAfter>(t),
    );
    expect(res.after.decisions).toBe(249);
    expect(res.after.jumps).toBe(25);
    expect(res.after.walkedYd).toBeCloseTo(250, 5);
    expect(res.after.decisionLog.length).toBeLessThanOrEqual(20);
  });
});
