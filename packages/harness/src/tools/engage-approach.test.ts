import { describe, expect, test } from "bun:test";
import type { NearbyRow } from "@peon/core";
import type { EngageAfter } from "#harness/contract/details";
import { engageSpec } from "#harness/tools/engage";
import {
  field,
  LYNX,
  STALKER,
  STALKER_2,
  stalker,
} from "#test-support/engage-fixtures";
import {
  driveGoto,
  moveTo,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import type { TestRuntime } from "#test-support/runtime-fixture";

const lynx = unitRow({
  distance: 70,
  guid: LYNX,
  level: 5,
  name: "Springpaw Lynx",
  x: 70,
  y: 0,
});

async function midApproach(
  t: TestRuntime,
  change: () => void,
  args: { count?: number } = {},
): Promise<{
  res: Awaited<ReturnType<typeof engageSpec.run>>;
  started: number;
}> {
  const goTo = driveGoto(t.handle, [{ hold: true }]);
  let started = 0;
  t.handle.startTactics = async () => {
    started += 1;
  };
  const { promise: walking, resolve } = Promise.withResolvers<void>();
  t.handle.goTo = (target) => {
    goTo(target);
    resolve();
  };
  const pending = engageSpec.run(
    { ...args, target: "Springpaw Stalker" },
    toolCtx<EngageAfter>(t),
  );
  await walking;
  moveTo(t.handle, { x: 12, y: 0 });
  change();
  return { res: await pending, started };
}

function update(t: TestRuntime, row: NearbyRow): void {
  t.handle.triggerEntityEvent({
    changed: ["health", "dynamicFlags"],
    entity: row.entity,
    type: "update",
  });
}

describe("engage approach", () => {
  test("a target that leaves view stops the approach at once", async () => {
    const t = await field();
    setUnits(t.handle, [stalker(STALKER, 45), stalker(STALKER_2, 80)]);
    const { res, started } = await midApproach(t, () => {
      setUnits(t.handle, [stalker(STALKER_2, 68)]);
      t.handle.triggerEntityEvent({ guid: STALKER, type: "disappear" });
    });
    expect(started).toBe(0);
    expect(res).toMatchObject({
      next: `engage(target: "${t.rt.refs.refOf(STALKER_2)}")`,
      reason: "target_not_observed",
      status: "FAILED",
    });
    expect(res.detail).toMatch(
      /^Springpaw Stalker u\d+ is not in view any more; it may have died or despawned\. You walked 12 yd; the fight did not start\.$/,
    );
  });

  test("a target that breaks targeting ends the approach as out of view", async () => {
    const t = await field();
    setUnits(t.handle, [stalker(STALKER, 45), stalker(STALKER_2, 80)]);
    const { res, started } = await midApproach(t, () => {
      t.handle.triggerAreaEvent("threat", {
        hostileOnly: false,
        type: "target_broken",
        unit: STALKER,
      });
    });
    expect(started).toBe(0);
    expect(res).toMatchObject({
      next: `engage(target: "${t.rt.refs.refOf(STALKER_2)}")`,
      reason: "target_not_observed",
      status: "FAILED",
    });
    expect(res.detail).toMatch(
      /^Springpaw Stalker u\d+ is not in view any more; it may have died or despawned\. You walked 12 yd; the fight did not start\.$/,
    );
  });

  test("a target_broken for another unit leaves the approach going", async () => {
    const t = await field();
    setUnits(t.handle, [stalker(STALKER, 45), lynx]);
    driveGoto(t.handle, [
      {
        arrive: { x: 20, y: 0 },
        onArrive: () => {
          t.handle.triggerAreaEvent("threat", {
            hostileOnly: true,
            type: "target_broken",
            unit: LYNX,
          });
          setUnits(t.handle, [stalker(STALKER, 25), lynx]);
        },
      },
    ]);
    let started = 0;
    t.handle.startTactics = async () => {
      started += 1;
      throw new Error("fight_stub");
    };
    const res = await engageSpec
      .run({ target: "Springpaw Stalker" }, toolCtx<EngageAfter>(t))
      .catch((error: unknown) => error);
    expect(started).toBe(1);
    expect(res).not.toMatchObject({ reason: "target_not_observed" });
  });

  test("a target another unit kills stops the approach", async () => {
    const t = await field();
    setUnits(t.handle, [stalker(STALKER, 45), lynx]);
    const { res, started } = await midApproach(t, () => {
      const dead = unitRow({
        distance: 33,
        entry: 15_366,
        guid: STALKER,
        hp: 0,
        level: 7,
        name: "Springpaw Stalker",
        x: 45,
        y: 0,
      });
      setUnits(t.handle, [dead, lynx]);
      update(t, dead);
    });
    expect(started).toBe(0);
    expect(res).toMatchObject({
      next: `engage(target: "${t.rt.refs.refOf(LYNX)}")`,
      reason: "target_dead",
      status: "FAILED",
    });
    expect(res.detail).toMatch(
      /^Springpaw Stalker u\d+ died before you reached it; another unit killed it\. You walked 12 yd; the fight did not start\.$/,
    );
  });

  test("a target another player taps stops the approach", async () => {
    const t = await field();
    setUnits(t.handle, [stalker(STALKER, 45)]);
    const { res, started } = await midApproach(t, () => {
      const tapped = {
        ...stalker(STALKER, 33),
        tapped: true,
        tappedByOther: true,
      };
      setUnits(t.handle, [tapped]);
      update(t, tapped);
    });
    expect(started).toBe(0);
    expect(res).toMatchObject({
      next: 'travel(to: "explore")',
      reason: "tapped_by_other",
      status: "FAILED",
    });
    expect(res.detail).toMatch(
      /^Springpaw Stalker u\d+ was tapped by another player; killing it gives you no loot, experience or quest credit\. You walked 12 yd; the fight did not start\.$/,
    );
  });

  test("a target tapped before the fight is not fought", async () => {
    const t = await field();
    setUnits(t.handle, [stalker(STALKER, 45), stalker(STALKER_2, 60)]);
    driveGoto(t.handle, [
      {
        arrive: { x: 20, y: 0 },
        onArrive: () =>
          setUnits(t.handle, [
            { ...stalker(STALKER, 25), tapped: true, tappedByOther: true },
            stalker(STALKER_2, 40),
          ]),
      },
    ]);
    let started = 0;
    t.handle.startTactics = async () => {
      started += 1;
    };
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(started).toBe(0);
    expect(res).toMatchObject({
      next: `engage(target: "${t.rt.refs.refOf(STALKER_2)}")`,
      reason: "tapped_by_other",
      status: "FAILED",
    });
  });

  test("a count call that loses its target keeps the count in Next", async () => {
    const t = await field();
    setUnits(t.handle, [stalker(STALKER, 45), stalker(STALKER_2, 80)]);
    const { res } = await midApproach(
      t,
      () => {
        setUnits(t.handle, [stalker(STALKER_2, 68)]);
        t.handle.triggerEntityEvent({ guid: STALKER, type: "disappear" });
      },
      { count: 3 },
    );
    expect(res).toMatchObject({
      next: 'engage(count: 3, target: "Springpaw Stalker")',
      reason: "target_not_observed",
    });
  });

  test("a count call leaves a tapped first target to the cycle", async () => {
    const t = await field();
    setUnits(t.handle, [stalker(STALKER, 45), stalker(STALKER_2, 60)]);
    driveGoto(t.handle, [
      {
        arrive: { x: 20, y: 0 },
        onArrive: () =>
          setUnits(t.handle, [
            { ...stalker(STALKER, 25), tapped: true, tappedByOther: true },
            stalker(STALKER_2, 40),
          ]),
      },
    ]);
    let cycled = 0;
    t.handle.startCycle = async () => {
      cycled += 1;
      throw new Error("cycle_stub");
    };
    const res = await engageSpec
      .run({ count: 3, target: "Springpaw Stalker" }, toolCtx<EngageAfter>(t))
      .catch((error: unknown) => error);
    expect(cycled).toBe(1);
    expect(res).not.toMatchObject({ reason: "tapped_by_other" });
  });

  test("the Next never names a unit above the level cap", async () => {
    const t = await field();
    const elite = unitRow({
      distance: 50,
      guid: LYNX,
      level: 20,
      name: "Springpaw Lynx",
      x: 50,
      y: 0,
    });
    setUnits(t.handle, [stalker(STALKER, 45), elite]);
    const { res } = await midApproach(t, () => {
      setUnits(t.handle, [elite]);
      t.handle.triggerEntityEvent({ guid: STALKER, type: "disappear" });
    });
    expect(res.next).toBe('travel(to: "explore")');
  });
});
