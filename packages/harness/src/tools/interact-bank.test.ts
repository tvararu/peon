import { describe, expect, jest, test } from "bun:test";
import { fakeAwait, withFakeTimers } from "@peon/core/test-support/fake-time";
import type { InteractAfter } from "#harness/contract/details";
import { interactSpec, interactTool } from "#harness/tools/interact";
import {
  contentOf,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import type { MockHandle, TestRuntime } from "#test-support/runtime-fixture";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { expectSendKind } from "#test-support/tool-harness";

const BANKER = 0xf1_30_00_00_00_00_00_55n;
const NAME = "Novia";
const CLOTH = 0x40_00_00_00_00_00_00_21n;
const OTHER = 0x40_00_00_00_00_00_00_22n;

type SlotInit = {
  bag: number;
  slot: number;
  region: string;
  guid: bigint;
  entry: number | undefined;
  name: string;
  count?: number;
};

function carried(items: SlotInit[]) {
  return items.map(
    (item) =>
      ({
        bag: item.bag,
        guid: item.guid,
        item: {
          contained: undefined,
          count: item.count ?? 1,
          durability: undefined,
          entry: item.entry,
          flags: 0,
          guid: item.guid,
          maxDurability: undefined,
          name: item.name,
          owner: undefined,
          quality: 1,
          randomPropertyId: 0,
        },
        region: item.region,
        slot: item.slot,
        status: "occupied",
      }) as never,
  );
}

function stock(handle: MockHandle, items: SlotInit[], bank: SlotInit[]): void {
  const inventory = handle.getInventoryState();
  handle.getInventoryState = () => ({
    ...inventory,
    bank: {
      bags: [],
      issues: [],
      slots: carried(bank),
    },
    coinage: 100_000,
    slots: carried(items),
  });
  Object.assign(handle.bank, {
    state: () => ({
      bagSlots: 0,
      banker: undefined,
      lastOutcome: undefined,
      lastSlotResult: undefined,
      pending: undefined,
    }),
  });
  handle.itemLabel = ((entry: number) =>
    entry === 2589 ? { name: "Linen Cloth", quality: 1 } : undefined) as never;
}

async function bankerWorld(
  items: SlotInit[],
  bank: SlotInit[],
  roles: readonly string[] = ["gossip", "banker"],
): Promise<TestRuntime> {
  const t = await createTestRuntime();
  setSelf(t.handle);
  setUnits(t.handle, [
    unitRow({
      distance: 3,
      guid: BANKER,
      name: NAME,
      relation: "friendly",
      roles: roles as never,
      x: 3,
      y: 0,
    }),
  ]);
  t.handle.cancelInteraction = () => undefined;
  stock(t.handle, items, bank);
  return t;
}

function openOk(t: TestRuntime) {
  jest.spyOn(t.handle.bank.act, "openBank").mockImplementation((npc) => {
    Object.assign(t.handle.bank, {
      state: () => ({
        bagSlots: 0,
        banker: npc,
        lastOutcome: undefined,
        lastSlotResult: undefined,
        pending: undefined,
      }),
    });
    t.handle.triggerAreaEvent("bank", { banker: npc, type: "opened" });
    return Promise.resolve({ status: "ok" as const });
  });
}

const CLOTH_CARRIED: SlotInit = {
  bag: 255,
  count: 20,
  entry: 2589,
  guid: CLOTH,
  name: "Linen Cloth",
  region: "backpack",
  slot: 23,
};

const CLOTH_BANKED: SlotInit = {
  bag: 255,
  count: 20,
  entry: 2589,
  guid: CLOTH,
  name: "Linen Cloth",
  region: "bank",
  slot: 39,
};

describe("interact bank", () => {
  test("bank opens the banker and lists the stored cloth", async () => {
    const t = await bankerWorld([CLOTH_CARRIED], [CLOTH_BANKED]);
    openOk(t);
    const res = await interactSpec.run(
      { do: "bank", npc: NAME },
      toolCtx<InteractAfter>(t),
    );
    expect(t.handle.bank.act.openBank).toHaveBeenCalledWith(BANKER);
    expect(res.status).toBe("DONE");
    const text = contentOf(res);
    expect(text).toContain("Linen Cloth");
    expect(text).toContain("x20");
  });

  test("bank skips the open when the banker is already open", async () => {
    const t = await bankerWorld([CLOTH_CARRIED], [CLOTH_BANKED]);
    Object.assign(t.handle.bank, {
      state: () => ({
        bagSlots: 0,
        banker: BANKER,
        lastOutcome: undefined,
        lastSlotResult: undefined,
        pending: undefined,
      }),
    });
    const open = jest
      .spyOn(t.handle.bank.act, "openBank")
      .mockResolvedValue({ status: "ok" as const });
    const res = await interactSpec.run(
      { do: "bank", npc: NAME },
      toolCtx<InteractAfter>(t),
    );
    expect(open).not.toHaveBeenCalled();
    expect(res.status).toBe("DONE");
  });

  test("deposit names the carried cloth and calls the act", async () => {
    const t = await bankerWorld([CLOTH_CARRIED], []);
    openOk(t);
    const deposit = jest
      .spyOn(t.handle.bank.act, "deposit")
      .mockImplementation(() => {
        t.handle.triggerAreaEvent("bank", {
          count: 20,
          entry: 2589,
          guid: CLOTH,
          kind: "deposit",
          type: "moved",
        });
        return Promise.resolve({ status: "ok" as const });
      });
    const res = await interactSpec.run(
      { do: "deposit", npc: NAME, what: "linen" },
      toolCtx<InteractAfter>(t),
    );
    expect(deposit).toHaveBeenCalledWith(255, 23);
    expect(res.status).toBe("DONE");
    expect(contentOf(res)).toContain("Linen Cloth");
  });

  test("withdraw names the banked cloth and calls the act", async () => {
    const t = await bankerWorld([], [CLOTH_BANKED]);
    openOk(t);
    const withdraw = jest
      .spyOn(t.handle.bank.act, "withdraw")
      .mockImplementation(() => {
        t.handle.triggerAreaEvent("bank", {
          count: 20,
          entry: 2589,
          guid: CLOTH,
          kind: "withdraw",
          type: "moved",
        });
        return Promise.resolve({ status: "ok" as const });
      });
    const res = await interactSpec.run(
      { do: "withdraw", npc: NAME, what: "linen" },
      toolCtx<InteractAfter>(t),
    );
    expect(withdraw).toHaveBeenCalledWith(255, 39);
    expect(res.status).toBe("DONE");
    expect(contentOf(res)).toContain("Linen Cloth");
  });

  test("buy_bank_slot reports the price from the money fall", async () => {
    await withFakeTimers(async () => {
      const t = await bankerWorld([CLOTH_CARRIED], []);
      openOk(t);
      let coins = 100_000;
      const inventory = t.handle.getInventoryState();
      t.handle.getInventoryState = () => ({ ...inventory, coinage: coins });
      jest.spyOn(t.handle.bank.act, "buyBankSlot").mockImplementation(() => {
        setTimeout(() => {
          coins = 99_000;
          t.handle.triggerEntityEvent({
            changed: ["coinage"],
            entity: {},
            type: "update",
          } as never);
        }, 10);
        t.handle.triggerAreaEvent("bank", {
          result: "ok",
          type: "slot_bought",
        });
        return Promise.resolve({ status: "ok" as const });
      });
      const run = interactSpec.run(
        { do: "buy_bank_slot", npc: NAME },
        toolCtx<InteractAfter>(t),
      );
      const res = await fakeAwait(run, 2000);
      expect(res.status).toBe("DONE");
      expect(contentOf(res)).toContain("1000 copper");
      expect(res.after?.money).toEqual({ after: 99_000, before: 100_000 });
    });
  });

  test("an abort while opening stops the deposit after a late open", async () => {
    const t = await bankerWorld([CLOTH_CARRIED], []);
    const opened = Promise.withResolvers<void>();
    const reply = Promise.withResolvers<{ status: "ok" }>();
    jest.spyOn(t.handle.bank.act, "openBank").mockImplementation(() => {
      opened.resolve();
      return reply.promise;
    });
    const deposit = jest
      .spyOn(t.handle.bank.act, "deposit")
      .mockResolvedValue({ status: "ok" as const });
    const controller = new AbortController();
    const run = interactSpec.run(
      { do: "deposit", npc: NAME, what: "linen" },
      toolCtx<InteractAfter>(t, controller.signal),
    );
    await opened.promise;
    controller.abort();
    reply.resolve({ status: "ok" });
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    expect(deposit).not.toHaveBeenCalled();
  });

  test("an abort while opening stops the slot purchase after a late open", async () => {
    const t = await bankerWorld([CLOTH_CARRIED], []);
    const opened = Promise.withResolvers<void>();
    const reply = Promise.withResolvers<{ status: "ok" }>();
    jest.spyOn(t.handle.bank.act, "openBank").mockImplementation(() => {
      opened.resolve();
      return reply.promise;
    });
    const buy = jest
      .spyOn(t.handle.bank.act, "buyBankSlot")
      .mockResolvedValue({ status: "ok" as const });
    const controller = new AbortController();
    const run = interactSpec.run(
      { do: "buy_bank_slot", npc: NAME },
      toolCtx<InteractAfter>(t, controller.signal),
    );
    await opened.promise;
    controller.abort();
    reply.resolve({ status: "ok" });
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    expect(buy).not.toHaveBeenCalled();
  });

  test("a non-banker refuses without calling any act", async () => {
    const t = await bankerWorld([CLOTH_CARRIED], [], ["vendor"]);
    const open = jest.spyOn(t.handle.bank.act, "openBank");
    const deposit = jest.spyOn(t.handle.bank.act, "deposit");
    await expect(
      interactSpec.run(
        { do: "deposit", npc: NAME, what: "linen" },
        toolCtx<InteractAfter>(t),
      ),
    ).rejects.toMatchObject({ reason: "not_banker" });
    expect(open).not.toHaveBeenCalled();
    expect(deposit).not.toHaveBeenCalled();
  });

  test("depositing an unknown name refuses and lists the carried cloth", async () => {
    const t = await bankerWorld([CLOTH_CARRIED], []);
    openOk(t);
    const deposit = jest.spyOn(t.handle.bank.act, "deposit");
    const refusal = await interactSpec
      .run(
        { do: "deposit", npc: NAME, what: "bread" },
        toolCtx<InteractAfter>(t),
      )
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(refusal).toMatchObject({ reason: "not_carried" });
    expect(deposit).not.toHaveBeenCalled();
  });

  test("duplicate names for different items refuse as ambiguous", async () => {
    const t = await bankerWorld(
      [
        CLOTH_CARRIED,
        {
          bag: 255,
          entry: 9999,
          guid: OTHER,
          name: "Linen Cloth Cap",
          region: "backpack",
          slot: 24,
        },
      ],
      [],
    );
    openOk(t);
    const deposit = jest.spyOn(t.handle.bank.act, "deposit");
    const refusal = await interactSpec
      .run(
        { do: "deposit", npc: NAME, what: "linen cloth" },
        toolCtx<InteractAfter>(t),
      )
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(refusal).toMatchObject({ reason: "ambiguous_item" });
    expect(deposit).not.toHaveBeenCalled();
  });

  test("duplicate stacks of the same cloth deposit the first", async () => {
    const t = await bankerWorld(
      [CLOTH_CARRIED, { ...CLOTH_CARRIED, guid: OTHER, slot: 24 }],
      [],
    );
    openOk(t);
    const deposit = jest
      .spyOn(t.handle.bank.act, "deposit")
      .mockImplementation(() => {
        t.handle.triggerAreaEvent("bank", {
          count: 20,
          entry: 2589,
          guid: CLOTH,
          kind: "deposit",
          type: "moved",
        });
        return Promise.resolve({ status: "ok" as const });
      });
    const res = await interactSpec.run(
      { do: "deposit", npc: NAME, what: "linen" },
      toolCtx<InteractAfter>(t),
    );
    expect(deposit).toHaveBeenCalledWith(255, 23);
    expect(res.status).toBe("DONE");
  });

  test("withdrawing from an empty bank refuses without calling the act", async () => {
    const t = await bankerWorld([], []);
    openOk(t);
    const withdraw = jest.spyOn(t.handle.bank.act, "withdraw");
    const refusal = await interactSpec
      .run(
        { do: "withdraw", npc: NAME, what: "linen" },
        toolCtx<InteractAfter>(t),
      )
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(refusal).toMatchObject({ reason: "not_in_bank" });
    expect(withdraw).not.toHaveBeenCalled();
  });

  test("a refused deposit fails with the bank reason", async () => {
    const t = await bankerWorld([CLOTH_CARRIED], []);
    openOk(t);
    jest.spyOn(t.handle.bank.act, "deposit").mockResolvedValue({
      reason: "cant_carry_more",
      status: "refused" as const,
    });
    const res = await interactSpec.run(
      { do: "deposit", npc: NAME, what: "linen" },
      toolCtx<InteractAfter>(t),
    );
    expect(res).toMatchObject({
      reason: "cant_carry_more",
      status: "FAILED",
    });
  });

  test("an unanswered withdraw is unconfirmed", async () => {
    const t = await bankerWorld([], [CLOTH_BANKED]);
    openOk(t);
    jest.spyOn(t.handle.bank.act, "withdraw").mockResolvedValue({
      status: "unanswered" as const,
    });
    const res = await interactSpec.run(
      { do: "withdraw", npc: NAME, what: "linen" },
      toolCtx<InteractAfter>(t),
    );
    expect(res).toMatchObject({ reason: "no_answer", status: "UNCONFIRMED" });
  });

  test("an unanswered open refuses as unconfirmed", async () => {
    const t = await bankerWorld([CLOTH_CARRIED], []);
    jest.spyOn(t.handle.bank.act, "openBank").mockResolvedValue({
      status: "unanswered" as const,
    });
    const refusal = await interactSpec
      .run({ do: "bank", npc: NAME }, toolCtx<InteractAfter>(t))
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(refusal).toMatchObject({
      reason: "no_answer",
      status: "UNCONFIRMED",
    });
  });

  test("expectSendKind passes for bank", async () => {
    await expectSendKind(interactTool, { do: "bank", npc: NAME });
  });
});
