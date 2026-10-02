import { describe, expect, jest, test } from "bun:test";
import type { NearbyRow } from "@peon/core";
import { fakeAwait, withFakeTimers } from "@peon/core/test-support/fake-time";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/spells-missile";

const SPELL = 2120;
const MOB = 0xf1_30_00_3d_23_00_e9_24n;
const AT = { x: 10, y: 20, z: 30 };
const SELF_AT = { x: 1, y: 2, z: 3 };

function row(over: Record<string, unknown>, entity: object): NearbyRow {
  return {
    attackable: true,
    distance: 20,
    entity: { entry: 15_651, health: 100, objectType: 3, ...entity },
    position: AT,
    relation: "hostile",
    roles: [],
    self: false,
    tappedByOther: false,
    ...over,
  } as unknown as NearbyRow;
}

function context(options: { hostile: boolean; casting: boolean }) {
  const handle = createMockHandle();
  handle.queryNearby = () => {
    const self = row(
      { distance: 0, position: SELF_AT, relation: "self", self: true },
      { guid: 0x2an },
    );
    return options.hostile ? [self, row({}, { guid: MOB })] : [self];
  };
  const state = handle.getCombatState();
  handle.getCombatState = (() => ({
    ...state,
    casting: options.casting
      ? { count: 1, durationMs: 2000, spellId: SPELL, startedAt: 0 }
      : undefined,
  })) as unknown as MockHandle["getCombatState"];
  const reportProjectile = jest.fn(() => ({ ok: true as const }));
  const reportMissileTrajectory = jest.fn(() => ({ ok: true as const }));
  jest
    .spyOn(handle.spells.act, "reportProjectile")
    .mockImplementation(reportProjectile);
  jest
    .spyOn(handle.spells.act, "reportMissileTrajectory")
    .mockImplementation(reportMissileTrajectory);
  const ctx: FlowContext & { handle: MockHandle } = {
    args: {},
    handle,
    settle: settleWithin(200),
  };
  return { ctx, reportMissileTrajectory, reportProjectile };
}

describe("spells-missile flow", () => {
  test("reports the target's position and a trajectory once the cast shows", () =>
    withFakeTimers(async () => {
      const { ctx, reportMissileTrajectory, reportProjectile } = context({
        casting: true,
        hostile: true,
      });
      const result = await fakeAwait(flow.run(ctx), 20_000);
      expect(reportProjectile).toHaveBeenCalledWith(SPELL, 10, 20, 30);
      expect(reportMissileTrajectory).toHaveBeenCalledWith(SPELL, {
        current: SELF_AT,
        elevation: 0,
        speed: 20,
        target: AT,
      });
      expect(result).toMatchObject({
        casting: true,
        projectile: { ok: true },
        spell: SPELL,
        trajectory: { ok: true },
      });
    }));

  test("sends no report when the cast never shows", () =>
    withFakeTimers(async () => {
      const { ctx, reportProjectile } = context({
        casting: false,
        hostile: true,
      });
      const result = await fakeAwait(flow.run(ctx), 20_000);
      expect(reportProjectile).not.toHaveBeenCalled();
      expect(result).toMatchObject({ casting: false, projectile: "not_sent" });
    }));

  test("fails when no hostile is in sight", () =>
    withFakeTimers(async () => {
      const { ctx } = context({ casting: true, hostile: false });
      const error = await fakeAwait(
        Promise.resolve(flow.run(ctx)).catch((e: unknown) => e),
        20_000,
      );
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("no hostile creature");
    }));
});
