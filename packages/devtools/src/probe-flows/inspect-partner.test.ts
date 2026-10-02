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

function row(
  guid: bigint,
  name: string,
  self = false,
  at = { x: 1, y: 2, z: 3 },
): Row {
  const position = { mapId: 530, orientation: 0, ...at };
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

  function farContext(
    partnerAt: { x: number; y: number; z: number },
    failWalk = false,
  ) {
    const mePose = { mapId: 530, orientation: 0, x: 97, y: 100, z: 3 };
    const ctx = context({ far: "1", name: "Partner" }, [
      row(ME, "Me", true, mePose),
      row(PARTNER, "Partner", false, partnerAt),
    ]);
    let calls = 0;
    spyOn(ctx.handle.inspect.act, "inspect").mockImplementation(async () => {
      calls += 1;
      if (calls > 1) return;
      return { ...talentsReply(), gear: [] };
    });
    spyOn(ctx.handle.inspect.act, "inspectAchievements").mockImplementation(
      async () => ({ criteria: [], done: [], guid: PARTNER }),
    );
    const pose = { ...mePose, source: "server" as const, updatedAt: 0 };
    const state = ctx.handle.getControlState();
    const legs: number[] = [];
    const legsDestinations: { x: number; y: number }[] = [];
    spyOn(ctx.handle, "getControlState").mockImplementation(
      () => ({ ...state, pose }) as never,
    );
    spyOn(ctx.handle, "walkTowardPoint").mockImplementation(
      async (destination, yards) => {
        if (failWalk)
          return {
            pose: { ...pose },
            reason: "no_path",
            status: "stopped" as const,
            traveled: 0,
          };
        if (!Number.isFinite(yards) || yards <= 0 || yards > 20)
          throw new Error("invalid_distance");
        const dx = destination.x - pose.x;
        const dy = destination.y - pose.y;
        const length = Math.hypot(dx, dy);
        const step = Math.min(yards, length);
        if (length > 0) {
          pose.x += (dx / length) * step;
          pose.y += (dy / length) * step;
        }
        legs.push(step);
        legsDestinations.push({ x: destination.x, y: destination.y });
        return {
          pose: { ...pose },
          status: "completed" as const,
          traveled: step,
        };
      },
    );
    return { ctx, destinations: legsDestinations, legs, pose };
  }

  test("far=1 walks 40 yd away in positive legs and records the silent reply", async () => {
    const partnerAt = { x: 100, y: 100, z: 3 };
    const { ctx, destinations, legs, pose } = farContext(partnerAt);
    const result = (await flow.run(ctx)) as Record<string, unknown>;
    expect(legs.every((leg) => leg > 0 && leg <= 20)).toBe(true);
    expect(legs.reduce((sum, leg) => sum + leg, 0)).toBeCloseTo(40, 5);
    expect(
      destinations.every(
        (point) =>
          Math.hypot(point.x - partnerAt.x, point.y - partnerAt.y) >= 40,
      ),
    ).toBe(true);
    expect(
      Math.hypot(pose.x - partnerAt.x, pose.y - partnerAt.y),
    ).toBeGreaterThanOrEqual(40);
    expect(result["far"]).toBeNull();
    expect(result["walked"]).toBeCloseTo(40, 5);
  });

  test("far=1 still walks away when standing on the partner", async () => {
    const { ctx, legs, pose } = farContext({ x: 97, y: 100, z: 3 });
    await flow.run(ctx);
    expect(legs.reduce((sum, leg) => sum + leg, 0)).toBeCloseTo(40, 5);
    expect(Math.hypot(pose.x - 97, pose.y - 100)).toBeGreaterThanOrEqual(40);
  });

  test("far=1 fails when a walk leg is stopped", async () => {
    const { ctx } = farContext({ x: 100, y: 100, z: 3 }, true);
    await expect(flow.run(ctx)).rejects.toThrow("no_path");
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
