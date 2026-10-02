import { describe, expect, test } from "bun:test";
import type { CombatEvent, CombatOutcome, NearbyRow } from "@peon/core";
import { fakeAwait, withFakeTimers } from "@peon/core/test-support/fake-time";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/spells-mirror";

const SPELL = 55_342;
const IMAGE = 0x77n;

function context(options: {
  images: boolean;
  failure?: CombatOutcome;
}): FlowContext & { handle: MockHandle } {
  const handle = createMockHandle();
  handle.queryNearby = () =>
    (options.images
      ? [{ entity: { entry: 31_216, guid: IMAGE } }]
      : []) as unknown as NearbyRow[];
  handle.cast = ((spellId: number) => {
    const outcome = options.failure;
    if (!outcome) return;
    const event: CombatEvent = {
      reason: `cast_failed:${outcome.reason}`,
      state: { ...handle.getCombatState(), lastOutcome: outcome },
      type: "cast_failed",
    };
    handle.triggerCombatEvent(event);
    return spellId;
  }) as unknown as MockHandle["cast"];
  return { args: { spell: String(SPELL) }, handle, settle: settleWithin(200) };
}

function failure(spell: number): CombatOutcome {
  return {
    at: 1,
    kind: "cast",
    reason: "not_enough_mana",
    spellId: spell,
    status: "failed",
  };
}

describe("spells-mirror flow", () => {
  test("a refused cast reports the server's reason even when images are nearby", () =>
    withFakeTimers(async () => {
      const ctx = context({ failure: failure(SPELL), images: true });
      const result = await fakeAwait(flow.run(ctx), 20_000);
      expect(result).toMatchObject({ cast: "not_enough_mana", spell: SPELL });
    }));

  test("a failure for another spell does not change the outcome", () =>
    withFakeTimers(async () => {
      const ctx = context({ failure: failure(1), images: false });
      const result = await fakeAwait(flow.run(ctx), 20_000);
      expect(result).toMatchObject({ cast: "no_images" });
    }));

  test("an accepted cast with no summons reports no_images", () =>
    withFakeTimers(async () => {
      const result = await fakeAwait(
        flow.run(context({ images: false })),
        20_000,
      );
      expect(result).toMatchObject({ cast: "no_images", images: [] });
    }));

  test("the combat subscription is released after the run and when cast throws", () =>
    withFakeTimers(async () => {
      const ctx = context({ images: false });
      let live = 0;
      const subscribe = ctx.handle.onCombatEvent;
      ctx.handle.onCombatEvent = ((cb) => {
        live += 1;
        const off = subscribe(cb);
        return () => {
          live -= 1;
          off();
        };
      }) as MockHandle["onCombatEvent"];
      await fakeAwait(flow.run(ctx), 20_000);
      expect(live).toBe(0);
      ctx.handle.cast = (() => {
        throw new Error("not_ready");
      }) as unknown as MockHandle["cast"];
      await expect(flow.run(ctx)).rejects.toThrow("not_ready");
      expect(live).toBe(0);
    }));
});
