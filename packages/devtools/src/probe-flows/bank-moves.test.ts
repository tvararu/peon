import { describe, expect, jest, test } from "bun:test";
import type { WorldHandle } from "@peon/core";
import {
  fakeAwait,
  fakeRejection,
  withFakeTimers,
} from "@peon/core/test-support/fake-time";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/bank-moves";

type Row = ReturnType<WorldHandle["queryNearby"]>[number];

const BANKER = 0xf1_30_00_00_00_00_00_55n;
const CLOTH = 0x40_00_00_00_00_00_00_21n;

function bankerRow(distance: number | null): Row {
  return {
    attackable: false,
    attackingMe: false,
    bearingRadians: null,
    distance,
    entity: {
      entry: 16_615,
      guid: BANKER,
      name: "Novia",
      objectType: 3,
      position: { mapId: 530, orientation: 0, x: 0, y: 0, z: 0 },
      rawFields: new Map(),
      scale: 1,
    },
    horizontalDistance: distance,
    lootable: false,
    originSource: null,
    originUpdatedAt: null,
    position: { mapId: 530, orientation: 0, x: 0, y: 0, z: 0 },
    positionKind: null,
    positionObservedAt: null,
    positionSource: null,
    preparedAt: 0,
    relation: "friendly",
    remotePose: undefined,
    roles: ["banker"],
    self: false,
    tapped: false,
    tappedByOther: false,
    targetOf: undefined,
    turnRadians: null,
  };
}

function filled(args: {
  bag: number;
  entry?: number | undefined;
  region?: string;
  slot: number;
}): Record<string, unknown> {
  return {
    bag: args.bag,
    guid: CLOTH,
    item: {
      contained: undefined,
      count: 20,
      creator: undefined,
      durability: undefined,
      enchantments: undefined,
      entry: args.entry ?? 2589,
      flags: undefined,
      giftCreator: undefined,
      guid: CLOTH,
      maxDurability: undefined,
      owner: undefined,
      randomPropertyId: undefined,
      spellCharges: undefined,
    },
    region: args.region ?? "backpack",
    slot: args.slot,
    status: "occupied",
  };
}

function inventory(slots: Record<string, unknown>[]) {
  return {
    bags: [],
    buyback: undefined,
    coinage: 0,
    freeSlots: 0,
    issues: [],
    scope: "carried",
    selfGuid: 1n,
    slots,
    status: "complete",
  } as never;
}

function context(
  args: Record<string, string>,
  carried: Record<string, unknown>[] = [filled({ bag: 255, slot: 25 })],
): FlowContext & {
  handle: MockHandle;
} {
  const states = [
    inventory(carried),
    inventory([filled({ bag: 39, region: "bank", slot: 0 })]),
    inventory([filled({ bag: 255, slot: 25 })]),
  ];
  const handle = createMockHandle();
  handle.queryNearby = () => [bankerRow(1)];
  handle.walkTowardPoint = jest.fn(async () => ({
    pose: {
      mapId: 530,
      orientation: 0,
      source: "server" as const,
      updatedAt: 0,
      x: 0,
      y: 0,
      z: 0,
    },
    status: "completed" as const,
    traveled: 0,
  }));
  jest
    .spyOn(handle, "getInventoryState")
    .mockImplementation(() => states[0] ?? inventory([]));
  jest.spyOn(handle.bank, "state").mockReturnValue({
    bagSlots: 0,
    banker: BANKER,
    lastOutcome: undefined,
    lastSlotResult: undefined,
    pending: undefined,
  });
  jest.spyOn(handle.bank.act, "openBank").mockResolvedValue({ status: "ok" });
  jest.spyOn(handle.bank.act, "deposit").mockImplementation(async () => {
    states.shift();
    return { status: "ok" };
  });
  jest.spyOn(handle.bank.act, "withdraw").mockImplementation(async () => {
    states.shift();
    return { status: "ok" };
  });
  jest
    .spyOn(handle.bank.act, "buyBankSlot")
    .mockResolvedValue({ status: "ok" });
  return { args, handle, settle: settleWithin(200) };
}

describe("bank-moves flow", () => {
  test("opens the bank, deposits the cloth and withdraws it again", async () => {
    const ctx = context({});
    const out = await flow.run(ctx);
    expect(ctx.handle.bank.act.openBank).toHaveBeenCalledWith(BANKER);
    expect(ctx.handle.bank.act.deposit).toHaveBeenCalledWith(255, 25);
    expect(ctx.handle.bank.act.withdraw).toHaveBeenCalledWith(39, 0);
    expect(out).toMatchObject({
      deposit: { status: "ok" },
      opened: { status: "ok" },
      withdraw: { status: "ok" },
    });
  });

  test("skips the deposit when no cloth is carried", () =>
    withFakeTimers(async () => {
      const ctx = context({}, []);
      const out = await fakeAwait(flow.run(ctx), 1000);
      expect(ctx.handle.bank.act.deposit).not.toHaveBeenCalled();
      expect(out).toMatchObject({
        deposit: { skipped: "no item 2589 is carried to deposit." },
      });
    }));

  test("deposits the entry named by item", async () => {
    const ctx = context({ item: "6948" }, [
      filled({ bag: 255, entry: 2589, slot: 24 }),
      filled({ bag: 255, entry: 6948, slot: 25 }),
    ]);
    await flow.run(ctx);
    expect(ctx.handle.bank.act.deposit).toHaveBeenCalledWith(255, 25);
  });

  test("buys slots until a refusal and reports each outcome", async () => {
    const ctx = context({ buy: "5" });
    const buy = jest.spyOn(ctx.handle.bank.act, "buyBankSlot");
    buy.mockResolvedValueOnce({ status: "ok" }).mockResolvedValueOnce({
      reason: "insufficient_funds",
      status: "refused",
    });
    const out = await flow.run(ctx);
    expect(buy).toHaveBeenCalledTimes(2);
    expect(out).toMatchObject({
      buy: [{ status: "ok" }, { status: "refused" }],
    });
  });

  test("throws when no banker is in view", () =>
    withFakeTimers(async () => {
      const ctx = context({});
      ctx.handle.queryNearby = () => [];
      expect(await fakeRejection(flow.run(ctx), 1000)).toContain(
        "no banker is in view",
      );
    }));
});
