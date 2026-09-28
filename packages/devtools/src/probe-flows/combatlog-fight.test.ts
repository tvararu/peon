import { describe, expect, test } from "bun:test";
import type { UnitEntity, WorldHandle } from "@peon/core";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/combatlog-fight";

type Row = ReturnType<WorldHandle["queryNearby"]>[number];

const ME = 0x2an;
const BOAR = 0xf1_30_00_3b_06_00_00_01n;
const GUARD = 0xf1_30_00_3b_09_00_00_04n;

function row(
  guid: bigint,
  distance: number,
  health: number,
  extra: Partial<Row> = {},
): Row {
  const position = { mapId: 530, orientation: 0, x: 1, y: 2, z: 3 };
  const entity = {
    entry: 15_366,
    guid,
    health,
    maxHealth: 100,
    name: "Unit",
    objectType: guid === ME ? 4 : 3,
    position,
    rawFields: new Map(),
  } as unknown as UnitEntity;
  return {
    attackable: true,
    distance,
    entity,
    position,
    relation: "hostile",
    roles: [],
    self: guid === ME,
    tappedByOther: false,
    ...extra,
  } as Row;
}

function context(
  args: Record<string, string>,
  health: Map<bigint, number>,
): FlowContext & { handle: MockHandle } {
  const handle = createMockHandle();
  handle.queryNearby = () => [
    row(ME, 0, health.get(ME) ?? 0),
    row(GUARD, 2, 100, { attackable: false }),
    row(BOAR, 3, health.get(BOAR) ?? 0),
  ];
  return { args, handle, settle: settleWithin(200) };
}

describe("combatlog-fight flow", () => {
  test("attacks the nearest hostile creature, casts the spell and counts log entries", async () => {
    const health = new Map([
      [ME, 100],
      [BOAR, 100],
    ]);
    const ctx = context({ seconds: "5", spell: "133" }, health);
    const running = flow.run(ctx);
    await Bun.sleep(50);
    ctx.handle.triggerAreaEvent("combatlog", {
      amount: 9,
      at: 1,
      kind: "melee",
      source: BOAR,
      target: ME,
      type: "entry",
    });
    ctx.handle.triggerAreaEvent("combatlog", {
      amount: 20,
      at: 2,
      kind: "spell_damage",
      source: ME,
      spellId: 133,
      target: BOAR,
      type: "entry",
    });
    health.set(BOAR, 0);
    expect(await running).toMatchObject({
      entries: { "melee in": 1, "spell_damage out": 1 },
      stop: "target_dead",
      target: { guid: "0xf130003b06000001" },
    });
    expect(ctx.handle.attack).toHaveBeenCalledWith(BOAR);
    expect(ctx.handle.cast).toHaveBeenCalledWith(133, BOAR);
  });

  test("without a spell it only swings", async () => {
    const health = new Map([
      [ME, 100],
      [BOAR, 0],
    ]);
    const ctx = context({ seconds: "1" }, health);
    health.set(BOAR, 100);
    const running = flow.run(ctx);
    await Bun.sleep(50);
    health.set(BOAR, 0);
    await running;
    expect(ctx.handle.cast).not.toHaveBeenCalled();
    expect(ctx.handle.attack).toHaveBeenCalledWith(BOAR);
  });

  test("a bad spell argument throws", () => {
    const ctx = context({ spell: "fire" }, new Map());
    expect(async () => await flow.run(ctx)).toThrow("spell=");
  });
});
