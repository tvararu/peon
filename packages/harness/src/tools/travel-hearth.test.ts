import { describe, expect, jest, test } from "bun:test";
import type { ControlEventType } from "@peon/core";
import { elapse, withFakeTimers } from "@peon/core/test-support/fake-time";
import type { TravelAfter } from "#harness/contract/details";
import { createRefTable } from "#harness/ops/refs";
import { travelSpec } from "#harness/tools/travel";
import {
  FINISH_GRACE_MS,
  HEARTH_WAIT_MS,
  hearthWork,
} from "#harness/tools/travel-hearth";
import {
  attackBy,
  contentOf,
  moveTo,
  setSelf,
  toolCtx,
} from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";
import { combatEvent } from "#test-support/spell-tool-fixtures";

const HOME = { areaId: 87, mapId: 530, x: -9464, y: 62, z: 56 };
const HEARTHSTONE = 6948;
const HEARTH_SPELL = 8690;

function stone(handle: MockHandle): void {
  const inventory = handle.getInventoryState();
  const slot = {
    bag: 255,
    guid: 0x77n,
    item: {
      contained: undefined,
      count: 1,
      durability: undefined,
      entry: HEARTHSTONE,
      flags: 0,
      guid: 0x77n,
      itemClass: 15,
      maxDurability: undefined,
      name: "Hearthstone",
      owner: undefined,
      quality: 1,
      randomPropertyId: 0,
      subclass: 0,
      useSpellIds: [HEARTH_SPELL],
    },
    region: "backpack" as const,
    slot: 23,
    status: "occupied" as const,
  };
  handle.getInventoryState = () => ({ ...inventory, slots: [slot] });
}

async function world(options: { stone?: boolean } = {}) {
  const t = await createTestRuntime({ parts: { refs: createRefTable() } });
  setSelf(t.handle, { x: 0, y: 0 });
  if (options.stone !== false) stone(t.handle);
  const homeState = {
    bindPending: undefined,
    home: HOME,
    lastBound: undefined,
    offer: undefined,
  };
  Object.defineProperty(t.handle.travel, "state", { value: () => homeState });
  return t;
}

function fire(handle: MockHandle, reason: string, type: ControlEventType) {
  handle.triggerControlEvent({
    reason,
    state: handle.getControlState(),
    type,
  });
}

function arriveOnUse(handle: MockHandle, reason: string): void {
  jest.spyOn(handle, "useItem").mockImplementation(() => {
    moveTo(handle, { x: -9456, y: 62 });
    fire(handle, reason, "server_correction");
    return Promise.resolve();
  });
}

function blankAfter(patch: Partial<TravelAfter>): TravelAfter {
  return {
    elapsedMs: 0,
    floorRetried: false,
    floors: undefined,
    goal: { kind: "hearth" },
    legs: [],
    newInView: [],
    pose: undefined,
    remainingYd: undefined,
    totalYd: undefined,
    traveledYd: 0,
    ...patch,
  };
}

describe("travel hearth", () => {
  test("refuses while the hearthstone spell is on cooldown", async () => {
    const t = await world();
    jest
      .spyOn(t.handle, "spellReadyAt")
      .mockReturnValue(t.clock.now() + 90_000);
    await expect(
      travelSpec.run({ to: "hearth" }, toolCtx<TravelAfter>(t)),
    ).rejects.toMatchObject({ reason: "cooldown" });
    expect(t.handle.spellReadyAt).toHaveBeenCalledWith(HEARTH_SPELL);
    expect(t.handle.useItem).not.toHaveBeenCalled();
  });

  test("refuses in combat", async () => {
    const t = await world();
    attackBy(t.handle, 0x99n);
    await expect(
      travelSpec.run({ to: "hearth" }, toolCtx<TravelAfter>(t)),
    ).rejects.toMatchObject({ reason: "attacked" });
    expect(t.handle.useItem).not.toHaveBeenCalled();
  });

  test("refuses while control reports a flight", async () => {
    const t = await world();
    const state = t.handle.getControlState();
    t.handle.getControlState = () => ({ ...state, blockedReason: "in_flight" });
    await expect(
      travelSpec.run({ to: "hearth" }, toolCtx<TravelAfter>(t)),
    ).rejects.toMatchObject({ reason: "in_flight" });
    expect(t.handle.useItem).not.toHaveBeenCalled();
  });

  test("uses the stone once and reports the arrival by the home", async () => {
    const t = await world();
    arriveOnUse(t.handle, "teleport");
    const res = await travelSpec.run({ to: "hearth" }, toolCtx<TravelAfter>(t));
    expect(t.handle.useItem).toHaveBeenCalledTimes(1);
    expect(t.handle.useItem).toHaveBeenCalledWith(255, 23);
    expect(res.status).toBe("DONE");
    expect(contentOf(res)).toContain("8.0 yd from your home");
    expect(res.after.goal).toEqual({ kind: "hearth" });
  });

  test("a new world message also ends the wait", async () => {
    const t = await world();
    arriveOnUse(t.handle, "new_world");
    const res = await travelSpec.run({ to: "hearth" }, toolCtx<TravelAfter>(t));
    expect(res.status).toBe("DONE");
  });

  test("a cast that ends without a teleport is refused as interrupted", async () => {
    const t = await world();
    jest.spyOn(t.handle, "useItem").mockImplementation(() => {
      t.handle.triggerCombatEvent(
        combatEvent(
          t.handle.getCombatState(),
          "cast_interrupted",
          HEARTH_SPELL,
        ),
      );
      return Promise.resolve();
    });
    const res = await travelSpec.run({ to: "hearth" }, toolCtx<TravelAfter>(t));
    expect(res.status).toBe("REFUSED");
    expect(res.reason).toBe("interrupted");
  });

  test("no teleport and no interrupt in time is unconfirmed", async () => {
    const t = await world();
    const ctx = toolCtx<TravelAfter>(t);
    const run = withFakeTimers(() => hearthWork(ctx, blankAfter));
    await withFakeTimers(() => elapse(HEARTH_WAIT_MS)).catch(() => undefined);
    const res = await run;
    expect(t.handle.useItem).toHaveBeenCalledTimes(1);
    expect(res.status).toBe("UNCONFIRMED");
    expect(res.reason).toBe("no_teleport");
  });

  test("a use the client rejects is a refusal, not a throw", async () => {
    const t = await world();
    jest
      .spyOn(t.handle, "useItem")
      .mockRejectedValue(new Error("not connected"));
    const res = await travelSpec.run({ to: "hearth" }, toolCtx<TravelAfter>(t));
    expect(res.status).toBe("REFUSED");
    expect(res.reason).toBe("use_failed");
  });

  test("a new attacker during the wait interrupts the run with engage", async () => {
    const t = await world();
    const pending = travelSpec.run({ to: "hearth" }, toolCtx<TravelAfter>(t));
    await Bun.sleep(0);
    attackBy(t.handle, 0x20n);
    const res = await pending;
    expect(t.handle.useItem).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ reason: "interrupted", status: "FAILED" });
    expect(res.next).toMatch(/^engage\(target: "u\d+"\)$/);
  });

  test("a finished cast without a teleport is refused as interrupted", async () => {
    const t = await world();
    jest.spyOn(t.handle, "useItem").mockImplementation(() => {
      t.handle.triggerCombatEvent(
        combatEvent(t.handle.getCombatState(), "cast_succeeded", HEARTH_SPELL),
      );
      return Promise.resolve();
    });
    const ctx = toolCtx<TravelAfter>(t);
    await withFakeTimers(async () => {
      const pending = hearthWork(ctx, blankAfter);
      await elapse(FINISH_GRACE_MS);
      const res = await pending;
      expect(res.status).toBe("REFUSED");
      expect(res.reason).toBe("interrupted");
    });
  });

  test("a teleport that follows the finished cast still arrives", async () => {
    const t = await world();
    jest.spyOn(t.handle, "useItem").mockImplementation(() => {
      t.handle.triggerCombatEvent(
        combatEvent(t.handle.getCombatState(), "cast_succeeded", HEARTH_SPELL),
      );
      moveTo(t.handle, { x: -9456, y: 62 });
      fire(t.handle, "new_world", "server_correction");
      return Promise.resolve();
    });
    const res = await travelSpec.run({ to: "hearth" }, toolCtx<TravelAfter>(t));
    expect(res.status).toBe("DONE");
  });

  test("a far teleport that has started is waited for past the finished cast", async () => {
    const t = await world();
    jest.spyOn(t.handle, "useItem").mockImplementation(() => {
      t.handle.triggerCombatEvent(
        combatEvent(t.handle.getCombatState(), "cast_succeeded", HEARTH_SPELL),
      );
      fire(t.handle, "teleporting", "control_changed");
      return Promise.resolve();
    });
    const ctx = toolCtx<TravelAfter>(t);
    await withFakeTimers(async () => {
      const pending = hearthWork(ctx, blankAfter);
      await elapse(HEARTH_WAIT_MS - 1);
      moveTo(t.handle, { x: -9456, y: 62 });
      fire(t.handle, "new_world", "server_correction");
      const res = await pending;
      expect(res.status).toBe("DONE");
    });
  });
});
