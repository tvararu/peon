import { describe, expect, jest, test } from "bun:test";
import type { WorldHandle } from "@peon/core";
import {
  fakeAwait,
  fakeMsUntilSettled,
  fakeRejection,
  withFakeTimers,
} from "@peon/core/test-support/fake-time";
import { createMockHandle } from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/selfstate-swim";

type Selfstate = WorldHandle["selfstate"];

function context(args: Record<string, string>, mounted = true) {
  const handle = createMockHandle();
  const realSelf = handle.selfstate;
  const calls: string[] = [];
  const dismount = jest.fn(async () => {
    calls.push("dismount");
    return { status: "ok" } as const;
  });
  const selfstate: Selfstate = {
    ...realSelf,
    act: { ...realSelf.act, dismount } as Selfstate["act"],
    state: () => ({ ...realSelf.state(), mounted }),
  };
  Object.assign(handle, { selfstate });
  jest.spyOn(handle, "setSwimming").mockImplementation((on: boolean) => {
    calls.push(`swim:${on}`);
  });
  jest.spyOn(handle, "setFlying").mockImplementation((on: boolean) => {
    calls.push(`fly:${on}`);
  });
  jest.spyOn(handle, "pitch").mockImplementation((kind: unknown) => {
    calls.push(`pitch:${kind}`);
  });
  jest.spyOn(handle, "ascend").mockImplementation((kind: string) => {
    calls.push(`ascend:${kind}`);
  });
  jest.spyOn(handle, "descend").mockImplementation(() => {
    calls.push("descend");
  });
  const ctx: FlowContext = { args, handle, settle: settleWithin(2000) };
  return { calls, ctx, handle };
}

describe("selfstate-swim flow", () => {
  test("swims, pitches each way and always leaves the water", () =>
    withFakeTimers(async () => {
      const { calls, ctx } = context({ hold: "100" });
      await fakeAwait(flow.run(ctx), 2000);
      expect(calls).toEqual([
        "swim:true",
        "pitch:up",
        "pitch:stop",
        "pitch:down",
        "pitch:stop",
        "pitch:0.25",
        "swim:false",
      ]);
    }));

  test("lead waits before the first send", () =>
    withFakeTimers(async () => {
      const { calls, ctx } = context({ hold: "100", lead: "3000" });
      const run = flow.run(ctx);
      await fakeMsUntilSettled(Promise.race([run, Bun.sleep(2500)]), 2600);
      expect(calls).toEqual([]);
      await fakeAwait(run, 4000);
      expect(calls[0]).toBe("swim:true");
    }));

  test("stops swimming when a pitch send is refused", () =>
    withFakeTimers(async () => {
      const { calls, ctx, handle } = context({ hold: "100" });
      jest.spyOn(handle, "pitch").mockImplementation(() => {
        throw new Error("rooted");
      });
      expect(await fakeRejection(flow.run(ctx), 2000)).toBe("rooted");
      expect(calls).toEqual(["swim:true", "swim:false"]);
    }));

  test("fly mode mounts, waits for CAN_FLY, climbs, descends, lands and dismounts", () =>
    withFakeTimers(async () => {
      const { calls, ctx, handle } = context({
        hold: "100",
        mode: "fly",
        spell: "32243",
      });
      let refusals = 2;
      jest.spyOn(handle, "setFlying").mockImplementation((on: boolean) => {
        if (on && refusals-- > 0) throw new Error("cannot_fly");
        calls.push(`fly:${on}`);
      });
      await fakeAwait(flow.run(ctx), 4000);
      expect(handle.cast).toHaveBeenCalledWith(32_243, 0n);
      expect(calls).toEqual([
        "fly:true",
        "ascend:start",
        "ascend:stop",
        "descend",
        "ascend:stop",
        "fly:false",
        "dismount",
      ]);
    }));

  test("fly mode lands and dismounts when the climb is refused", () =>
    withFakeTimers(async () => {
      const { calls, ctx, handle } = context({
        hold: "100",
        mode: "fly",
        spell: "32243",
      });
      jest.spyOn(handle, "ascend").mockImplementation(() => {
        throw new Error("rooted");
      });
      expect(await fakeRejection(flow.run(ctx), 4000)).toBe("rooted");
      expect(calls).toEqual(["fly:true", "fly:false", "dismount"]);
    }));

  test("fly mode fails when the server never grants CAN_FLY", () =>
    withFakeTimers(async () => {
      const { calls, ctx, handle } = context({ mode: "fly", spell: "32243" });
      jest.spyOn(handle, "setFlying").mockImplementation(() => {
        throw new Error("cannot_fly");
      });
      expect(await fakeRejection(flow.run(ctx), 6000)).toContain(
        "SMSG_MOVE_SET_CAN_FLY",
      );
      expect(calls).toEqual(["dismount"]);
    }));

  test("fly mode fails when the mount never appears", () =>
    withFakeTimers(async () => {
      const { calls, ctx } = context({ mode: "fly", spell: "32243" }, false);
      expect(await fakeRejection(flow.run(ctx), 6000)).toContain(
        "never mounted",
      );
      expect(calls).toEqual([]);
    }));

  test.each([
    [{ hold: "0" }, "hold="],
    [{ hold: "abc" }, "hold="],
    [{ lead: "-1" }, "lead="],
    [{ mode: "dive" }, "mode=swim or mode=fly"],
    [{ mode: "fly" }, "spell="],
    [{ mode: "fly", spell: "x" }, "spell="],
  ])("rejects %p before sending", (args, message) =>
    withFakeTimers(async () => {
      const { calls, ctx } = context(args);
      expect(await fakeRejection(flow.run(ctx), 1000)).toContain(message);
      expect(calls).toEqual([]);
    }),
  );
});
