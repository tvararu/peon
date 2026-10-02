import { describe, expect, spyOn, test } from "bun:test";
import type { UnitEntity, WorldHandle } from "@peon/core";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/inspect-partner";

type Row = ReturnType<WorldHandle["queryNearby"]>[number];

const ME = 0x2an;
const PARTNER = 0x49_13n;

function row(guid: bigint, name: string, self = false): Row {
  const position = { mapId: 530, orientation: 0, x: 1, y: 2, z: 3 };
  const entity = {
    guid,
    name,
    objectType: 4,
    position,
    rawFields: new Map(),
  } as unknown as UnitEntity;
  return {
    attackable: false,
    attackingMe: false,
    bearingRadians: null,
    distance: self ? 0 : 3,
    entity,
    horizontalDistance: 3,
    lootable: false,
    originSource: null,
    originUpdatedAt: null,
    position,
    positionKind: null,
    positionObservedAt: null,
    positionSource: null,
    preparedAt: 0,
    relation: "friendly",
    remotePose: undefined,
    roles: [],
    self,
    tapped: false,
    tappedByOther: false,
    targetOf: undefined,
    turnRadians: null,
  };
}

function context(
  args: Record<string, string>,
  rows: Row[],
): FlowContext & { handle: MockHandle } {
  const handle = createMockHandle();
  handle.queryNearby = () => rows;
  return { args, handle, settle: settleWithin(50) };
}

const world = [row(ME, "Me", true), row(PARTNER, "Partner")];

function talentsReply() {
  return {
    freePoints: 0,
    gear: [
      {
        creator: 0n,
        enchants: [],
        entry: 7,
        randomProperty: 0,
        slot: 15,
        suffixFactor: 0,
      },
    ],
    guid: PARTNER,
    short: true,
    specs: [{ active: true, glyphs: [], index: 0, talents: [] }],
  };
}

describe("inspect-partner flow", () => {
  test("inspects the named player and reports gear, specs and the count", async () => {
    const ctx = context({ name: "Partner" }, world);
    const inspect = spyOn(ctx.handle.inspect.act, "inspect").mockImplementation(
      async () => talentsReply(),
    );
    const progress = spyOn(
      ctx.handle.inspect.act,
      "inspectAchievements",
    ).mockImplementation(async () => ({
      criteria: [],
      done: [],
      guid: PARTNER,
    }));
    const result = (await flow.run(ctx)) as Record<string, unknown>;
    expect(inspect).toHaveBeenCalledWith(PARTNER);
    expect(progress).toHaveBeenCalledWith(PARTNER);
    expect(result["specs"]).toEqual([0]);
    expect(result["achievements"]).toBe(0);
  });

  test("far=1 walks away and records the silent reply", async () => {
    const ctx = context({ far: "1", name: "Partner" }, world);
    let calls = 0;
    spyOn(ctx.handle.inspect.act, "inspect").mockImplementation(async () => {
      calls += 1;
      if (calls > 1) return;
      return { ...talentsReply(), gear: [] };
    });
    spyOn(ctx.handle.inspect.act, "inspectAchievements").mockImplementation(
      async () => ({ criteria: [], done: [], guid: PARTNER }),
    );
    const walk = spyOn(ctx.handle, "walkTowardPoint").mockImplementation(
      async () => ({
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
        traveled: 20,
      }),
    );
    const result = (await flow.run(ctx)) as Record<string, unknown>;
    expect(walk).toHaveBeenCalledTimes(2);
    expect(result["far"]).toBeNull();
    expect(result["walked"]).toBe(40);
  });

  test("fails without a name", async () => {
    const ctx = context({}, world);
    await expect(flow.run(ctx)).rejects.toThrow("name=");
  });

  test("fails without the player in view", async () => {
    const ctx = context({ name: "Stranger" }, world);
    await expect(flow.run(ctx)).rejects.toThrow("Stranger");
  });
});
