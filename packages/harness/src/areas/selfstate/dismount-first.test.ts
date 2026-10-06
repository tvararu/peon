import { describe, expect, jest, test } from "bun:test";
import { fakeAwait, withFakeTimers } from "@peon/core/test-support/fake-time";
import { dismountFirst } from "#harness/areas/selfstate/dismount-first";
import { Refusal } from "#harness/ops/refusal";
import { toolCtx } from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

function mountState(handle: { selfstate: { state: () => object } }) {
  jest.spyOn(handle.selfstate, "state").mockReturnValue({
    collisionHeight: undefined,
    condition: {
      drunkState: "sober",
      drunkValue: 0,
      restedXp: 0,
      resting: false,
      restState: "unknown",
    },
    ghostPending: false,
    lastTransferAbort: undefined,
    mountDisplayId: 1234,
    mounted: true,
    selfResSpell: 0,
    standState: "stand",
    timers: {},
  });
}

describe("dismountFirst", () => {
  test("returns not_mounted and never calls the act when on foot", async () => {
    const t = await createTestRuntime();
    const spy = jest.spyOn(t.handle.selfstate.act, "dismount");
    expect(await dismountFirst(toolCtx<never>(t))).toBe("not_mounted");
    expect(spy).toHaveBeenCalledTimes(0);
  });

  test("a dismount answered ok returns dismounted", async () =>
    withFakeTimers(async () => {
      const t = await createTestRuntime();
      mountState(t.handle);
      const { promise, resolve } = Promise.withResolvers<{ status: "ok" }>();
      t.handle.selfstate.act.dismount = () => promise;
      const pending = dismountFirst(toolCtx<never>(t));
      const settled = fakeAwait(pending, 1000);
      resolve({ status: "ok" });
      expect(await settled).toBe("dismounted");
    }));

  test("a taxi mount stops the tool with in_flight", async () => {
    const t = await createTestRuntime();
    mountState(t.handle);
    t.handle.selfstate.act.dismount = async () => ({
      reason: "in_flight",
      status: "refused",
    });
    await expect(dismountFirst(toolCtx<never>(t))).rejects.toMatchObject({
      reason: "in_flight",
    });
  });

  test("no server answer stops the tool unconfirmed with no_reply", async () => {
    const t = await createTestRuntime();
    mountState(t.handle);
    t.handle.selfstate.act.dismount = async () => ({ status: "no_answer" });
    await expect(dismountFirst(toolCtx<never>(t))).rejects.toMatchObject({
      reason: "no_reply",
      status: "UNCONFIRMED",
    });
  });

  test("an abort while dismounting rejects the caller", async () => {
    const t = await createTestRuntime();
    mountState(t.handle);
    const { promise } = Promise.withResolvers<{ status: "ok" }>();
    t.handle.selfstate.act.dismount = () => promise;
    const control = new AbortController();
    const pending = dismountFirst(toolCtx<never>(t, control.signal));
    const settled = fakeAwait(pending, 1000);
    control.abort(new Refusal({ detail: "stop", reason: "cancelled" }));
    await expect(settled).rejects.toMatchObject({ reason: "cancelled" });
  });
});
