import { describe, expect, jest, test } from "bun:test";
import type { WorldHandle } from "@peon/core";
import {
  elapse,
  fakeAwait,
  fakeRejection,
  withFakeTimers,
} from "@peon/core/test-support/fake-time";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/pets-talent";

type Pets = WorldHandle["pets"];

const PET = 0xf1_40_00_0c_a9_00_02_0bn;
const OK = { ok: true } as const;
const BAR = {
  command: "follow" as const,
  durationMs: 0,
  family: 31,
  flags: 0,
  guid: PET,
  react: "defensive" as const,
  receivedAt: 0,
  slots: [],
  spells: [],
};

function context(args: Record<string, string> = {}) {
  const handle = createMockHandle();
  const act = {
    learnPetTalent: jest.fn((_talent: number, _rank: number) => OK),
    learnPetTalents: jest.fn(
      (_picks: readonly { talent: number; rank: number }[]) => OK,
    ),
  };
  const real = handle.pets;
  const pets: Pets = {
    act: act as unknown as Pets["act"],
    onEvent: real.onEvent,
    state: () => ({
      ...real.state(),
      bar: BAR,
      cooldowns: [],
      lastRefusal: undefined,
    }),
  };
  Object.assign(handle, { pets });
  const ctx: FlowContext & { handle: MockHandle } = {
    args,
    handle,
    settle: settleWithin(100),
  };
  return { act, ctx };
}

describe("pets-talent flow", () => {
  test("it confirms only when the reply holds the requested talent", () =>
    withFakeTimers(async () => {
      const { act, ctx } = context({ talent: "2214" });
      const running = flow.run(ctx);
      await elapse(200);
      expect(act.learnPetTalent).toHaveBeenCalledWith(2214, 0);
      ctx.handle.triggerAreaEvent("talents", {
        freePoints: 0,
        talents: [{ rank: 0, talentId: 2214 }],
        type: "pet_info",
      });
      expect(await fakeAwait(running, 1000)).toMatchObject({
        confirmed: true,
        talent: 2214,
      });
    }));

  test("it reports unconfirmed when the reply lacks the talent", () =>
    withFakeTimers(async () => {
      const { act, ctx } = context({ talent: "2214" });
      const running = flow.run(ctx);
      await elapse(200);
      expect(act.learnPetTalent).toHaveBeenCalledWith(2214, 0);
      ctx.handle.triggerAreaEvent("talents", {
        freePoints: 1,
        talents: [],
        type: "pet_info",
      });
      expect(await fakeAwait(running, 1000)).toMatchObject({
        confirmed: false,
        talent: 2214,
      });
    }));

  test("it reports unconfirmed when the reply holds another talent", () =>
    withFakeTimers(async () => {
      const { ctx } = context({ talent: "2214" });
      const running = flow.run(ctx);
      await elapse(200);
      ctx.handle.triggerAreaEvent("talents", {
        freePoints: 0,
        talents: [{ rank: 0, talentId: 2118 }],
        type: "pet_info",
      });
      expect(await fakeAwait(running, 1000)).toMatchObject({
        confirmed: false,
      });
    }));

  test("it confirms a higher rank than requested", () =>
    withFakeTimers(async () => {
      const { ctx } = context({ rank: "0", talent: "2214" });
      const running = flow.run(ctx);
      await elapse(200);
      ctx.handle.triggerAreaEvent("talents", {
        freePoints: 0,
        talents: [{ rank: 1, talentId: 2214 }],
        type: "pet_info",
      });
      expect(await fakeAwait(running, 1000)).toMatchObject({
        confirmed: true,
      });
    }));

  test("it previews several talents and confirms only when all are held", () =>
    withFakeTimers(async () => {
      const { act, ctx } = context({ talents: "2119,2120:1" });
      const running = flow.run(ctx);
      await elapse(200);
      expect(act.learnPetTalents).toHaveBeenCalledWith([
        { rank: 0, talent: 2119 },
        { rank: 1, talent: 2120 },
      ]);
      expect(act.learnPetTalent).not.toHaveBeenCalled();
      ctx.handle.triggerAreaEvent("talents", {
        freePoints: 0,
        talents: [
          { rank: 0, talentId: 2119 },
          { rank: 1, talentId: 2120 },
        ],
        type: "pet_info",
      });
      expect(await fakeAwait(running, 1000)).toMatchObject({
        confirmed: true,
        freePoints: 0,
      });
    }));

  test("it reports a preview unconfirmed when one pick is missing", () =>
    withFakeTimers(async () => {
      const { ctx } = context({ talents: "2119,2120" });
      const running = flow.run(ctx);
      await elapse(200);
      ctx.handle.triggerAreaEvent("talents", {
        freePoints: 1,
        talents: [{ rank: 0, talentId: 2119 }],
        type: "pet_info",
      });
      expect(await fakeAwait(running, 1000)).toMatchObject({
        confirmed: false,
      });
    }));

  test("it refuses a malformed talents list", () =>
    withFakeTimers(async () => {
      const { ctx } = context({ talents: "2119,x" });
      expect(await fakeRejection(flow.run(ctx), 1000)).toContain("talents=");
    }));

  test("it refuses without a talent id", () =>
    withFakeTimers(async () => {
      const { ctx } = context();
      expect(await fakeRejection(flow.run(ctx), 1000)).toContain("talent=<id>");
    }));
});
