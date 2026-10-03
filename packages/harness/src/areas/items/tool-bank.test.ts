import { describe, expect, jest, test } from "bun:test";
import type { NamedInventorySlot } from "@peon/core";
import { gearSpec } from "#harness/areas/items/tool";
import { Refusal } from "#harness/ops/refusal";
import { createRepeatGuard, parseCall } from "#harness/ops/repeat-guard";
import { interactSpec } from "#harness/tools/interact";
import {
  contentOf,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import type { TestRuntime } from "#test-support/runtime-fixture";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";

const BANKER = 0xf1_30_00_00_00_00_00_55n;
const CLOTH = 0x40_00_00_00_00_00_00_21n;
const OTHER = 0x40_00_00_00_00_00_00_22n;

type Held = {
  bag: number;
  guid: bigint;
  name: string;
  region?: string;
  slot: number;
};

function carried(items: Held[]): NamedInventorySlot[] {
  return items.map(
    (item) =>
      ({
        bag: item.bag,
        guid: item.guid,
        item: {
          contained: undefined,
          count: 20,
          durability: undefined,
          entry: 2589,
          flags: 0,
          guid: item.guid,
          maxDurability: undefined,
          name: item.name,
          owner: undefined,
          quality: 1,
          randomPropertyId: 0,
        },
        region: item.region ?? (item.bag === 255 ? "backpack" : "bag_item"),
        slot: item.slot,
        status: "occupied",
      }) as never,
  );
}

function stock(handle: MockHandle, items: Held[]): void {
  const inventory = handle.getInventoryState();
  handle.getInventoryState = () => ({
    ...inventory,
    slots: carried(items),
  });
}

function bankOpen(handle: MockHandle, banker: bigint | undefined): void {
  Object.assign(handle.bank, {
    state: () => ({
      bagSlots: 0,
      banker,
      lastOutcome: undefined,
      lastSlotResult: undefined,
      pending: undefined,
    }),
  });
}

async function world(items: Held[], open: boolean) {
  const t = await createTestRuntime();
  setSelf(t.handle);
  setUnits(t.handle, [
    unitRow({
      distance: 3,
      guid: BANKER,
      name: "Novia",
      relation: "friendly",
      roles: ["gossip", "banker"] as never,
      x: 3,
      y: 0,
    }),
  ]);
  stock(t.handle, items);
  bankOpen(t.handle, open ? BANKER : undefined);
  t.handle.takeControl = () => undefined;
  return t;
}

const LINEN: Held = { bag: 255, guid: CLOTH, name: "Linen Cloth", slot: 23 };

async function refusal(promise: Promise<unknown>): Promise<Refusal> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof Refusal)) throw new Error("expected a Refusal");
  return error;
}

describe("gear move to the bank", () => {
  test("an open bank takes the item through the deposit act", async () => {
    const t = await world([LINEN], true);
    const deposit = jest
      .spyOn(t.handle.bank.act, "deposit")
      .mockResolvedValue({ status: "ok" as const });
    const res = await gearSpec.run(
      { do: "move", item: "Linen Cloth", to: "bank" },
      toolCtx(t),
    );
    expect(deposit).toHaveBeenCalledWith(255, 23);
    expect(res.status).toBe("DONE");
    expect(contentOf(res)).toContain("Linen Cloth");
  });

  test("an item in a carried bag deposits from that bag and slot", async () => {
    const t = await world(
      [{ bag: 19, guid: OTHER, name: "Silk Cloth", slot: 4 }],
      true,
    );
    const deposit = jest
      .spyOn(t.handle.bank.act, "deposit")
      .mockResolvedValue({ status: "ok" as const });
    await gearSpec.run(
      { do: "move", item: "Silk Cloth", to: "the bank" },
      toolCtx(t),
    );
    expect(deposit).toHaveBeenCalledWith(19, 4);
  });

  test("a server refusal reaches the agent as a refusal", async () => {
    const t = await world([LINEN], true);
    jest.spyOn(t.handle.bank.act, "deposit").mockResolvedValue({
      reason: "cant_carry_more",
      status: "refused" as const,
    });
    const thrown = await refusal(
      gearSpec.run({ do: "move", item: "Linen Cloth", to: "bank" }, toolCtx(t)),
    );
    expect(thrown.reason).toBe("cant_carry_more");
  });

  test("an unanswered deposit is unconfirmed and recoverable by reading the bank", async () => {
    const t = await world([LINEN], true);
    jest
      .spyOn(t.handle.bank.act, "deposit")
      .mockResolvedValue({ status: "unanswered" as const });
    const thrown = await refusal(
      gearSpec.run({ do: "move", item: "Linen Cloth", to: "bank" }, toolCtx(t)),
    );
    expect(thrown.status).toBe("UNCONFIRMED");
    expect(thrown.reason).toBe("no_answer");
    const read = parseCall(thrown.next ?? "");
    expect(read?.tool).toBe("journal");
    const guard = createRepeatGuard({ now: () => 0 });
    const pose = { x: 0 } as never;
    const args = { do: "move", item: "Linen Cloth", to: "bank" };
    const gear = {
      args,
      digest: "d",
      kind: "action" as const,
      pose,
      tool: "gear" as const,
    };
    guard.record({
      ...gear,
      result: {
        after: undefined,
        body: [],
        detail: thrown.detail,
        next: thrown.next,
        reason: thrown.reason,
        status: thrown.status,
      },
    });
    guard.record({
      args: read?.args ?? {},
      digest: "d",
      kind: "read",
      pose,
      result: {
        after: undefined,
        body: [],
        detail: "x.",
        next: undefined,
        reason: undefined,
        status: "DONE",
      },
      tool: "journal" as const,
    });
    expect(guard.check(gear)).toBeUndefined();
  });

  test("a transport failure is not reported as a banker out of reach", async () => {
    const t = await world([LINEN], true);
    jest.spyOn(t.handle.bank.act, "deposit").mockImplementation(() => {
      throw new Error("World socket is not connected");
    });
    const error = await gearSpec
      .run({ do: "move", item: "Linen Cloth", to: "bank" }, toolCtx(t))
      .then(
        () => undefined,
        (thrown: unknown) => thrown,
      );
    expect(error).not.toBeInstanceOf(Refusal);
    expect((error as Error).message).toContain("not connected");
  });

  test("aborting while the deposit reply is pending rejects the call", async () => {
    const t = await world([LINEN], true);
    const reply = Promise.withResolvers<{ status: "ok" }>();
    const deposit = jest
      .spyOn(t.handle.bank.act, "deposit")
      .mockReturnValue(reply.promise);
    const controller = new AbortController();
    const pending = gearSpec
      .run(
        { do: "move", item: "Linen Cloth", to: "bank" },
        toolCtx(t, controller.signal),
      )
      .then(
        () => undefined,
        (thrown: unknown) => thrown,
      );
    while (deposit.mock.calls.length === 0) await Promise.resolve();
    controller.abort();
    reply.resolve({ status: "ok" });
    await reply.promise;
    const error = await pending;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("AbortError");
  });

  test("a banker out of range refuses with the banker lookup", async () => {
    const t = await world([LINEN], true);
    jest.spyOn(t.handle.bank.act, "deposit").mockImplementation(() => {
      throw new Error("no banker in range");
    });
    const thrown = await refusal(
      gearSpec.run({ do: "move", item: "Linen Cloth", to: "bank" }, toolCtx(t)),
    );
    expect(thrown.reason).toBe("banker_too_far");
    expect(thrown.next).toContain("look");
  });

  test("a closed bank refuses and names the deposit call on the banker", async () => {
    const t = await world([LINEN], false);
    const deposit = jest.spyOn(t.handle.bank.act, "deposit");
    const thrown = await refusal(
      gearSpec.run({ do: "move", item: "Linen Cloth", to: "bank" }, toolCtx(t)),
    );
    expect(deposit).not.toHaveBeenCalled();
    expect(thrown.reason).toBe("bank_closed");
    expect(thrown.next).toContain("interact");
    expect(thrown.next).toContain("deposit");
    expect(thrown.detail).toContain("Novia");
  });
  test("an equipped bag is not carried loose and cannot deposit", async () => {
    const t = await world(
      [{ bag: 255, guid: OTHER, name: "Linen Bag", region: "bag", slot: 19 }],
      true,
    );
    const deposit = jest.spyOn(t.handle.bank.act, "deposit");
    const thrown = await refusal(
      gearSpec.run({ do: "move", item: "Linen Bag", to: "bank" }, toolCtx(t)),
    );
    expect(deposit).not.toHaveBeenCalled();
    expect(thrown.reason).toBe("no_such_item");
  });

  test("an empty quest slot cannot deposit", async () => {
    const t = await world([], true);
    const deposit = jest.spyOn(t.handle.bank.act, "deposit");
    const thrown = await refusal(
      gearSpec.run(
        { do: "move", item: "bag 255 slot 0", to: "bank" },
        toolCtx(t),
      ),
    );
    expect(deposit).not.toHaveBeenCalled();
    expect(thrown.reason).toBe("no_such_item");
  });

  test("duplicate names refuse without calling deposit", async () => {
    const t = await world(
      [LINEN, { bag: 255, guid: OTHER, name: "Linen Cloth", slot: 24 }],
      true,
    );
    const deposit = jest.spyOn(t.handle.bank.act, "deposit");
    const thrown = await refusal(
      gearSpec.run({ do: "move", item: "Linen Cloth", to: "bank" }, toolCtx(t)),
    );
    expect(deposit).not.toHaveBeenCalled();
    expect(thrown.reason).toBe("ambiguous_item");
  });

  test("a full bank refusal reaches the agent with the deposit call", async () => {
    const t = await world([LINEN], true);
    jest.spyOn(t.handle.bank.act, "deposit").mockResolvedValue({
      reason: "cant_carry_more",
      status: "refused" as const,
    });
    const thrown = await refusal(
      gearSpec.run({ do: "move", item: "Linen Cloth", to: "bank" }, toolCtx(t)),
    );
    expect(thrown.reason).toBe("cant_carry_more");
    expect(thrown.next).toContain("deposit");
  });

  test("a reply with no GUID still reports the deposit", async () => {
    const t = await world([LINEN], true);
    jest.spyOn(t.handle.bank.act, "deposit").mockResolvedValue({
      status: "ok" as const,
    });
    const res = await gearSpec.run(
      { do: "move", item: "Linen Cloth", to: "bank" },
      toolCtx(t),
    );
    expect(res.status).toBe("DONE");
    expect(contentOf(res)).toContain("Deposited Linen Cloth");
  });

  describe("following Next keeps the selected stack", () => {
    const TWINS: Held[] = [
      LINEN,
      { bag: 255, guid: OTHER, name: "Linen Cloth", slot: 24 },
    ];

    async function follow(
      thrown: Refusal,
      t: TestRuntime,
    ): Promise<{ bag: number; slot: number }> {
      const call = parseCall(thrown.next ?? "");
      if (call?.tool !== "interact") throw new Error("Next is not interact");
      bankOpen(t.handle, BANKER);
      t.handle.cancelInteraction = () => undefined;
      const deposit = jest
        .spyOn(t.handle.bank.act, "deposit")
        .mockResolvedValue({ status: "ok" as const });
      await interactSpec.run(call.args as never, toolCtx(t));
      const last = deposit.mock.calls.at(-1);
      if (last === undefined) throw new Error("deposit was not called");
      return { bag: last[0] as number, slot: last[1] as number };
    }

    test("a closed bank names the explicitly selected stack", async () => {
      const t = await world(TWINS, false);
      const thrown = await refusal(
        gearSpec.run(
          { do: "move", item: "bag 255 slot 24", to: "bank" },
          toolCtx(t),
        ),
      );
      expect(thrown.reason).toBe("bank_closed");
      expect(await follow(thrown, t)).toEqual({ bag: 255, slot: 24 });
    });

    test("a server refusal names the explicitly selected stack", async () => {
      const t = await world(TWINS, true);
      jest.spyOn(t.handle.bank.act, "deposit").mockResolvedValue({
        reason: "cant_carry_more",
        status: "refused" as const,
      });
      const thrown = await refusal(
        gearSpec.run(
          { do: "move", item: "bag 255 slot 24", to: "bank" },
          toolCtx(t),
        ),
      );
      expect(await follow(thrown, t)).toEqual({ bag: 255, slot: 24 });
    });

    test("an item in a carried bag keeps its line after the bank opens", async () => {
      const t = await world(
        [LINEN, { bag: 19, guid: OTHER, name: "Silk Cloth", slot: 4 }],
        false,
      );
      const thrown = await refusal(
        gearSpec.run(
          { do: "move", item: "bag 19 slot 4", to: "bank" },
          toolCtx(t),
        ),
      );
      expect(thrown.reason).toBe("bank_closed");
      expect(await follow(thrown, t)).toEqual({ bag: 19, slot: 4 });
    });
  });
});

describe("gear move with an unreadable destination", () => {
  test("the refusal does not suggest a destination the agent did not ask for", async () => {
    const t = await world([LINEN], true);
    const thrown = await refusal(
      gearSpec.run(
        { do: "move", item: "Linen Cloth", to: "vault" },
        toolCtx(t),
      ),
    );
    expect(thrown.reason).toBe("bad_position");
    expect(thrown.detail).not.toMatch(/bag 19/);
    expect(thrown.detail).toContain("vault");
  });
});
