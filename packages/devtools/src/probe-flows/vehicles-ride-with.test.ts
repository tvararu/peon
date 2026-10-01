import { describe, expect, test } from "bun:test";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import type { FlowContext } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/vehicles-ride-with";

const SELF = 0x1151n;
const PARTNER = 0x1153n;
const STRANGER = 0x1157n;

function context(
  args: Record<string, string>,
  boardAfterPeriods: number,
  strangers = 0,
) {
  const handle = createMockHandle();
  const ejected: bigint[] = [];
  let periods = 0;
  Object.assign(handle, {
    queryNearby: () => [
      { entity: { guid: SELF }, self: true },
      { entity: { guid: PARTNER, name: "Pal" }, self: false },
      ...(periods > boardAfterPeriods
        ? []
        : [{ entity: { guid: STRANGER, name: "Rando" }, self: false }]),
    ],
    selfstate: { ...handle.selfstate, state: () => ({ mounted: true }) },
    vehicles: {
      ...handle.vehicles,
      act: {
        ejectPassenger: async (guid: bigint) => {
          ejected.push(guid);
          return { status: "ok" };
        },
      },
      state: () => {
        const passengers = new Map<bigint, unknown>();
        if (strangers > 0) passengers.set(STRANGER, { transportGuid: SELF });
        if (periods > boardAfterPeriods)
          passengers.set(PARTNER, { transportGuid: SELF });
        return { passengers };
      },
    },
  });
  const ctx: FlowContext & { handle: MockHandle } = {
    args,
    handle,
    settle: async (read) => {
      periods++;
      return read();
    },
  };
  return { ctx, ejected };
}

describe("vehicles-ride-with flow", () => {
  test("keeps waiting past one settle period for the partner, then ejects", async () => {
    const { ctx, ejected } = context({ mount: "61470", partner: "Pal" }, 3);
    const result = (await flow.run(ctx)) as Record<string, unknown>;
    expect(result).toMatchObject({
      boarded: `0x${PARTNER.toString(16)}`,
      eject: "ok",
      partner: "Pal",
    });
    expect(ejected).toEqual([PARTNER]);
    expect(ctx.handle.invite).toHaveBeenCalledWith("Pal");
  });
  test("ignores an unrelated rider recorded before the partner boards", async () => {
    const { ctx, ejected } = context({ mount: "61470", partner: "Pal" }, 3, 1);
    const result = (await flow.run(ctx)) as Record<string, unknown>;
    expect(result).toMatchObject({
      boarded: `0x${PARTNER.toString(16)}`,
      eject: "ok",
      partner: "Pal",
    });
    expect(ejected).toEqual([PARTNER]);
  });
  test("reports no boarder and sends no eject when nobody rides", async () => {
    const { ctx, ejected } = context(
      { mount: "61470", partner: "Pal" },
      Number.POSITIVE_INFINITY,
    );
    const result = (await flow.run(ctx)) as Record<string, unknown>;
    expect(result).toMatchObject({ boarded: null, eject: null });
    expect(ejected).toEqual([]);
  });

  test("needs a partner name", async () => {
    const { ctx } = context({ mount: "61470" }, 0);
    await expect(flow.run(ctx)).rejects.toThrow("partner");
  });
});
