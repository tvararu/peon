import { describe, expect, mock, test } from "bun:test";
import {
  elapse,
  fakeAwait,
  fakeRejection,
  withFakeTimers,
} from "@peon/core/test-support/fake-time";
import { createMockHandle } from "@peon/core/test-support/mock-handle";
import { type FlowContext, loadFlows, settleWithin } from "#tools/probe-flows";

const BOBBER = 0xf1_10_8b_07_00_00_00_01n;
const flows = await loadFlows();
const fish = flows.get("objects-fish");

function context(args: Record<string, string> = {}): FlowContext {
  const handle = createMockHandle();
  handle.getControlState = (() => ({ selfGuid: 0x42n })) as never;
  handle.queryNearby = () => [{ entity: { guid: 1n } }] as never;
  return { args, handle, settle: settleWithin(50) };
}

function emitter(ctx: FlowContext) {
  let cb: ((event: unknown) => void) | undefined;
  Object.defineProperty(ctx.handle.objects, "onEvent", {
    value: (fn: (event: unknown) => void) => {
      cb = fn;
      return () => undefined;
    },
  });
  return (event: unknown) => cb?.(event);
}

function waiting(ctx: FlowContext) {
  Object.defineProperty(ctx.handle.objects, "state", {
    value: mock(
      () => ({ fishing: { bobber: BOBBER, phase: "waiting" } }) as never,
    ),
  });
  const use = mock(() => ({ ok: true as const }));
  Object.defineProperty(ctx.handle.objects, "act", { value: { use } });
  return use;
}

describe("objects-fish flow", () => {
  test("casts Fishing with no target and reports the waiting state", () =>
    withFakeTimers(async () => {
      const ctx = context({ seconds: "1" });
      waiting(ctx);
      const result = (await fakeAwait(fish?.run(ctx), 5000)) as Record<
        string,
        unknown
      >;
      expect(ctx.handle.cast).toHaveBeenCalledWith(7620, 0n);
      expect(result).toMatchObject({
        fishing: { bobber: "0xf1108b0700000001", phase: "waiting" },
        seen: [],
      });
    }));

  test("rejects a bad seconds argument", () =>
    withFakeTimers(async () => {
      const message = await fakeRejection(
        fish?.run(context({ seconds: "0" })),
        100,
      );
      expect(message).toContain("objects-fish needs seconds=");
    }));

  test("rejects a bad facing argument", () =>
    withFakeTimers(async () => {
      const message = await fakeRejection(
        fish?.run(context({ facing: "north" })),
        100,
      );
      expect(message).toContain("objects-fish needs facing=");
    }));
});

describe("objects-fish flow bite handling", () => {
  test("uses the bobber once, at once on the bite, when use is hooked", () =>
    withFakeTimers(async () => {
      const ctx = context({ seconds: "30", use: "hooked" });
      const use = waiting(ctx);
      const emit = emitter(ctx);
      const running = fish?.run(ctx);
      await elapse(500);
      expect(use).not.toHaveBeenCalled();
      emit({ bobber: BOBBER, type: "fish_hooked" });
      emit({ bobber: BOBBER, type: "fish_hooked" });
      const result = (await fakeAwait(running, 5000)) as { seen: unknown[] };
      expect(use).toHaveBeenCalledTimes(1);
      expect(use).toHaveBeenCalledWith(BOBBER);
      expect(result.seen).toContainEqual({
        bobber: "0xf1108b0700000001",
        event: "fish_hooked",
      });
    }));

  test("does not use the bobber on the bite without use", () =>
    withFakeTimers(async () => {
      const ctx = context({ seconds: "2" });
      const use = waiting(ctx);
      const emit = emitter(ctx);
      const running = fish?.run(ctx);
      await elapse(500);
      emit({ bobber: BOBBER, type: "fish_hooked" });
      await fakeAwait(running, 5000);
      expect(use).not.toHaveBeenCalled();
    }));

  test("ends before the deadline when the fish escapes", () =>
    withFakeTimers(async () => {
      const ctx = context({ seconds: "60" });
      waiting(ctx);
      const emit = emitter(ctx);
      const running = fish?.run(ctx);
      await elapse(500);
      emit({ type: "fish_escaped" });
      const result = (await fakeAwait(running, 5000)) as { seen: unknown[] };
      expect(result.seen).toEqual([{ event: "fish_escaped" }]);
    }));

  test("ends before the deadline when the early use is not hooked", () =>
    withFakeTimers(async () => {
      const ctx = context({ seconds: "60", use: "1" });
      const use = waiting(ctx);
      const emit = emitter(ctx);
      const running = fish?.run(ctx);
      await elapse(1500);
      expect(use).toHaveBeenCalledWith(BOBBER);
      emit({ type: "fish_not_hooked" });
      const result = (await fakeAwait(running, 5000)) as { seen: unknown[] };
      expect(result.seen).toEqual([{ event: "fish_not_hooked" }]);
    }));
});

describe("objects-fish flow staging arguments", () => {
  test("faces the water before the cast", () =>
    withFakeTimers(async () => {
      const ctx = context({ facing: "1.5", seconds: "1" });
      waiting(ctx);
      await fakeAwait(fish?.run(ctx), 5000);
      expect(ctx.handle.face).toHaveBeenCalledWith(1.5);
      const faceMock = ctx.handle.face as unknown as {
        mock: { invocationCallOrder: number[] };
      };
      const castMock = ctx.handle.cast as unknown as {
        mock: { invocationCallOrder: number[] };
      };
      expect(faceMock.mock.invocationCallOrder[0]).toBeLessThan(
        castMock.mock.invocationCallOrder[0] ?? 0,
      );
    }));
});
