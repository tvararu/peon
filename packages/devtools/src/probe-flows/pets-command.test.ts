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
import { flow } from "#tools/probe-flows/pets-command";

type Row = ReturnType<WorldHandle["queryNearby"]>[number];
type Pets = WorldHandle["pets"];

const ME = 0x2an;
const PET = 0xf1_40_00_0c_a9_00_02_0bn;
const MOB = 0xf1_30_00_3e_8b_00_12_34n;
const OK = { ok: true } as const;
const BAR = {
  command: "follow" as const,
  durationMs: 0,
  family: 31,
  flags: 0,
  guid: PET,
  react: "passive" as const,
  receivedAt: 0,
  slots: [],
  spells: [],
};

function row(guid: bigint, extra: Partial<Row>): Row {
  return {
    attackable: false,
    distance: 5,
    entity: { guid, objectType: 3 },
    relation: "friendly",
    self: false,
    tappedByOther: false,
    targetOf: undefined,
    ...extra,
  } as unknown as Row;
}

function context(what: string) {
  const handle = createMockHandle();
  const act = {
    petCommand: jest.fn((_order: string) => OK),
    petStance: jest.fn((_stance: string) => OK),
    petStopAttack: jest.fn(() => OK),
    requestPetInfo: jest.fn(() => OK),
  };
  const real = handle.pets;
  const pets: Pets = {
    act: act as unknown as Pets["act"],
    onEvent: real.onEvent,
    state: () => ({ ...real.state(), bar: BAR }),
  };
  Object.assign(handle, { pets });
  const ctx: FlowContext & { handle: MockHandle } = {
    args: { do: what },
    handle,
    settle: settleWithin(100),
  };
  return { act, ctx };
}

function nextBar(handle: MockHandle) {
  handle.triggerAreaEvent("pets", { bar: BAR, cleared: false, type: "bar" });
}

describe("pets-command flow", () => {
  test("refuses an unknown do value", () =>
    withFakeTimers(async () => {
      const { ctx } = context("sit");
      expect(await fakeRejection(flow.run(ctx), 1000)).toContain(
        "pets-command needs do=",
      );
    }));

  test("a stance calls petStance and waits for the next bar", () =>
    withFakeTimers(async () => {
      const { act, ctx } = context("aggressive");
      const running = flow.run(ctx);
      await elapse(200);
      expect(act.petStance).toHaveBeenCalledWith("aggressive");
      nextBar(ctx.handle);
      expect(await fakeAwait(running, 1000)).toMatchObject({
        steps: [{ do: "aggressive", replied: true, result: OK }],
      });
    }));

  test("stay,follow calls petCommand for each in turn, each after the last bar", () =>
    withFakeTimers(async () => {
      const { act, ctx } = context("stay,follow");
      const running = flow.run(ctx);
      await elapse(200);
      expect(act.petCommand.mock.calls).toEqual([["stay"]]);
      nextBar(ctx.handle);
      await elapse(200);
      expect(act.petCommand.mock.calls).toEqual([["stay"], ["follow"]]);
      nextBar(ctx.handle);
      expect(await fakeAwait(running, 1000)).toMatchObject({
        steps: [
          { do: "stay", replied: true },
          { do: "follow", replied: true },
        ],
      });
    }));

  test("stop sends the pet at the nearest hostile, stops it and waits for its target to clear", () =>
    withFakeTimers(async () => {
      const { act, ctx } = context("stop");
      let target: bigint | undefined;
      ctx.handle.queryNearby = () => [
        row(ME, { self: true }),
        row(PET, { targetOf: target }),
        row(MOB, { attackable: true, distance: 20, relation: "hostile" }),
      ];
      ctx.handle.petAttack = jest.fn(() => {
        target = MOB;
      });
      act.petStopAttack.mockImplementation(() => {
        target = undefined;
        return OK;
      });
      expect(await fakeAwait(flow.run(ctx), 1000)).toMatchObject({
        steps: [
          {
            cleared: true,
            engaged: true,
            target: `0x${MOB.toString(16)}`,
            targetAfter: null,
            targetBefore: `0x${MOB.toString(16)}`,
          },
        ],
      });
      expect(ctx.handle.petAttack).toHaveBeenCalledWith(PET, MOB);
    }));
});
