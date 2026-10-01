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
  test("it learns the talent and waits for the pet_info event", () =>
    withFakeTimers(async () => {
      const { act, ctx } = context({ talent: "2214" });
      const running = flow.run(ctx);
      await elapse(200);
      expect(act.learnPetTalent).toHaveBeenCalledWith(2214, 0);
      ctx.handle.triggerAreaEvent("talents", {
        freePoints: 0,
        talents: [],
        type: "pet_info",
      });
      expect(await fakeAwait(running, 1000)).toMatchObject({
        confirmed: true,
        talent: 2214,
      });
    }));

  test("it refuses without a talent id", () =>
    withFakeTimers(async () => {
      const { ctx } = context();
      expect(await fakeRejection(flow.run(ctx), 1000)).toContain("talent=<id>");
    }));
});
