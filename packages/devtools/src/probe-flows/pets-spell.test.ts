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
import { flow } from "#tools/probe-flows/pets-spell";

type Row = ReturnType<WorldHandle["queryNearby"]>[number];
type Pets = WorldHandle["pets"];

const PET = 0xf1_40_00_0c_a9_00_02_0bn;
const MOB = 0xf1_30_00_3e_8b_00_12_34n;
const GROWL = 2649;
const BITE = 17_253;
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
  spells: [
    { autocast: "off" as const, spell: GROWL },
    { autocast: "on" as const, spell: BITE },
  ],
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

function context(args: Record<string, string>) {
  const handle = createMockHandle();
  const act = {
    petAutocast: jest.fn((_spell: number, _on: boolean) => OK),
    petCast: jest.fn((_spell: number, _target: unknown) => ({
      castCount: 1,
      ok: true as const,
    })),
    petSwapActions: jest.fn((_a: number, _b: number) => OK),
    requestPetInfo: jest.fn(() => OK),
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
  handle.spellDefinition = jest.fn((id: number) =>
    id === GROWL
      ? { name: "Growl" }
      : id === BITE
        ? { name: "Bite" }
        : undefined,
  ) as unknown as WorldHandle["spellDefinition"];
  const ctx: FlowContext & { handle: MockHandle } = {
    args,
    handle,
    settle: settleWithin(100),
  };
  return { act, ctx };
}

describe("pets-spell flow", () => {
  test("needs a spell, autocast or swap argument", () =>
    withFakeTimers(async () => {
      const { ctx } = context({});
      expect(await fakeRejection(flow.run(ctx), 1000)).toContain(
        "pets-spell needs",
      );
    }));

  test("spell casts the named bar spell at the nearest hostile", () =>
    withFakeTimers(async () => {
      const { act, ctx } = context({ spell: "Growl", target: "nearest" });
      ctx.handle.queryNearby = () => [
        row(PET, { self: true }),
        row(MOB, { attackable: true, distance: 20, relation: "hostile" }),
      ];
      const running = flow.run(ctx);
      await elapse(3200);
      expect(await fakeAwait(running, 1000)).toMatchObject({
        result: { castCount: 1, ok: true },
        target: `0x${MOB.toString(16)}`,
      });
      expect(act.petCast).toHaveBeenCalledWith(
        GROWL,
        expect.objectContaining({ kind: "unit" }),
      );
    }));

  test("spell refuses an unknown name", () =>
    withFakeTimers(async () => {
      const { ctx } = context({ spell: "Howl" });
      expect(await fakeRejection(flow.run(ctx), 1000)).toContain(
        "the pet bar has no Howl.",
      );
    }));

  test("autocast toggles the named spell and waits for the next bar", () =>
    withFakeTimers(async () => {
      const { act, ctx } = context({ autocast: "Bite:off" });
      const running = flow.run(ctx);
      await elapse(200);
      expect(act.petAutocast).toHaveBeenCalledWith(BITE, false);
      ctx.handle.triggerAreaEvent("pets", {
        bar: BAR,
        cleared: false,
        type: "bar",
      });
      expect(await fakeAwait(running, 1000)).toMatchObject({
        replied: true,
        result: OK,
        was: "on",
      });
    }));

  test("swap refreshes the bar first, swaps two slots, then asks for the bar again", () =>
    withFakeTimers(async () => {
      const { act, ctx } = context({ swap: "3,4" });
      const running = flow.run(ctx);
      await elapse(200);
      expect(act.requestPetInfo).toHaveBeenCalled();
      expect(act.petSwapActions).not.toHaveBeenCalled();
      ctx.handle.triggerAreaEvent("pets", {
        bar: BAR,
        cleared: false,
        type: "bar",
      });
      await elapse(200);
      expect(act.petSwapActions).toHaveBeenCalledWith(3, 4);
      ctx.handle.triggerAreaEvent("pets", {
        bar: BAR,
        cleared: false,
        type: "bar",
      });
      expect(await fakeAwait(running, 1000)).toMatchObject({
        replied: true,
        result: OK,
      });
    }));
});
