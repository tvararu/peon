import { describe, expect, jest, test } from "bun:test";
import type { WorldHandle } from "@peon/core";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/talents-glyph";

type Inventory = ReturnType<WorldHandle["getInventoryState"]>;

const GLYPH = 43_395;

function context(args: Record<string, string>): FlowContext & {
  handle: MockHandle;
} {
  const handle = createMockHandle();
  handle.getInventoryState = jest.fn(
    () =>
      ({
        slots: [
          {
            bag: 255,
            guid: 0x40_00_00_00_00_00_00_01n,
            item: { entry: GLYPH },
            slot: 23,
            status: "occupied",
          },
        ],
        status: "complete",
      }) as unknown as Inventory,
  );
  jest.spyOn(handle.talents, "state").mockReturnValue({
    fields: { enabledMask: 3 },
    pendingOffer: undefined,
    pet: undefined,
    player: {},
    slots: [],
  } as never);
  return { args, handle, settle: settleWithin(200) };
}

describe("talents-glyph flow", () => {
  test("without slot= it moves on past sockets that refuse the glyph and stops at the first that takes it", async () => {
    const ctx = context({ item: String(GLYPH) });
    const apply = jest
      .spyOn(ctx.handle.talents.act, "applyGlyph")
      .mockResolvedValueOnce({ outcome: "wrong_slot_type" })
      .mockResolvedValueOnce({ glyphId: 43, outcome: "applied" });
    const report = await flow.run(ctx);
    expect(apply.mock.calls.map(([request]) => request.glyphSlot)).toEqual([
      0, 1,
    ]);
    expect(apply).toHaveBeenCalledWith({ bag: 255, glyphSlot: 1, slot: 23 });
    expect(report).toMatchObject({
      apply: { tries: [{}, { result: { outcome: "applied" } }] },
    });
  });

  test("an explicit slot= is tried once and a refusal is reported, not retried", async () => {
    const ctx = context({ item: String(GLYPH), slot: "4" });
    const apply = jest
      .spyOn(ctx.handle.talents.act, "applyGlyph")
      .mockResolvedValue({ outcome: "slot_locked" });
    await flow.run(ctx);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  test("remove= sends the removal for that socket after the apply", async () => {
    const ctx = context({ item: String(GLYPH), remove: "2", slot: "2" });
    jest
      .spyOn(ctx.handle.talents.act, "applyGlyph")
      .mockResolvedValue({ glyphId: 43, outcome: "applied" });
    const remove = jest
      .spyOn(ctx.handle.talents.act, "removeGlyph")
      .mockResolvedValue({ outcome: "removed" });
    const report = await flow.run(ctx);
    expect(remove).toHaveBeenCalledWith(2);
    expect(report).toMatchObject({ remove: { outcome: "removed" } });
  });

  test("an item the character does not carry is an error", async () => {
    await expect(flow.run(context({ item: "1" }))).rejects.toThrow(
      "found no item 1",
    );
  });

  test("neither item= nor remove= is an error", async () => {
    await expect(flow.run(context({}))).rejects.toThrow("needs item");
  });
});
