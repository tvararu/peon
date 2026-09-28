import { describe, expect, test } from "bun:test";
import { UNIT_FIELDS, type UnitEntity, type WorldHandle } from "@peon/core";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/threat-fight";

type Row = ReturnType<WorldHandle["queryNearby"]>[number];
type Spec = {
  guid: bigint;
  distance: number;
  health?: number;
  objectType?: 3 | 4;
  attackable?: boolean;
  tappedByOther?: boolean;
  self?: boolean;
  rawFields?: Map<number, number>;
  targetOf?: bigint;
  level?: number;
  relation?: Row["relation"];
  roles?: Row["roles"];
};

const ME = 0x2an;
const PET = 0xf1_40_00_00_01_00_00_07n;
const CUB = 0xf1_30_00_3b_06_00_00_01n;
const LYNX = 0xf1_30_00_3b_07_00_00_02n;
const FAR = 0xf1_30_00_3b_08_00_00_03n;
const GUARD = 0xf1_30_00_3b_09_00_00_04n;
const TAKEN = 0xf1_30_00_3b_0a_00_00_05n;

function row(spec: Spec): Row {
  const position = { mapId: 530, orientation: 0, x: 1, y: 2, z: 3 };
  const entity: UnitEntity = {
    class_: 1,
    displayId: 1,
    entry: 15_366,
    factionTemplate: 14,
    gender: 0,
    guid: spec.guid,
    health: spec.health ?? 100,
    level: spec.level ?? 5,
    maxHealth: 100,
    maxPower: [],
    name: "Unit",
    npcFlags: 0,
    objectType: spec.objectType ?? 3,
    position,
    power: [],
    race: 0,
    rawFields: spec.rawFields ?? new Map(),
    scale: 1,
    target: 0n,
    unitFlags: 0,
  };
  return {
    attackable: spec.attackable ?? true,
    attackingMe: false,
    bearingRadians: null,
    distance: spec.distance,
    entity,
    horizontalDistance: spec.distance,
    lootable: false,
    originSource: null,
    originUpdatedAt: null,
    position,
    positionKind: null,
    positionObservedAt: null,
    positionSource: null,
    preparedAt: 0,
    relation: spec.relation ?? "hostile",
    remotePose: undefined,
    roles: spec.roles ?? [],
    self: spec.self ?? false,
    tapped: false,
    tappedByOther: spec.tappedByOther ?? false,
    targetOf: spec.targetOf,
    turnRadians: null,
  };
}

function world(pet: boolean) {
  const health = new Map<bigint, number>([
    [ME, 100],
    [CUB, 100],
    [LYNX, 100],
  ]);
  const summon = new Map([
    [UNIT_FIELDS.SUMMON.offset, 0x01_00_00_07],
    [UNIT_FIELDS.SUMMON.offset + 1, 0xf1_40_00_00],
  ]);
  const rows = () => [
    row({
      distance: 0,
      guid: ME,
      health: health.get(ME) ?? 0,
      objectType: 4,
      rawFields: pet ? summon : new Map(),
      self: true,
    }),
    row({ attackable: false, distance: 3, guid: GUARD }),
    row({ distance: 6, guid: TAKEN, tappedByOther: true }),
    row({ distance: 12, guid: CUB, health: health.get(CUB), targetOf: PET }),
    row({ distance: 20, guid: LYNX, health: health.get(LYNX) }),
    row({ distance: 60, guid: FAR }),
  ];
  return { health, rows };
}

function context(
  args: Record<string, string>,
  rows: () => Row[],
): FlowContext & { handle: MockHandle } {
  const handle = createMockHandle();
  handle.queryNearby = rows;
  return { args, handle, settle: settleWithin(200) };
}

describe("threat-fight flow", () => {
  test("sends the pet and Auto Shot at the nearest attackable creature", async () => {
    const { health, rows } = world(true);
    const ctx = context({ seconds: "5" }, rows);
    const running = flow.run(ctx);
    await Bun.sleep(50);
    health.set(CUB, 0);
    expect(await running).toMatchObject({
      pet: "0xf140000001000007",
      stop: "targets_dead",
      targets: [{ guid: "0xf130003b06000001" }],
    });
    expect(ctx.handle.loadCatalogs).toHaveBeenCalled();
    expect(ctx.handle.petAttack).toHaveBeenCalledWith(PET, CUB);
    expect(ctx.handle.cast).toHaveBeenCalledWith(75, CUB);
  });

  test("a pull of two sends the pet at the first and Auto Shot at the second", async () => {
    const { health, rows } = world(true);
    const ctx = context({ pull: "2", seconds: "5" }, rows);
    const running = flow.run(ctx);
    await Bun.sleep(50);
    expect(ctx.handle.petAttack).toHaveBeenCalledWith(PET, CUB);
    expect(ctx.handle.cast).toHaveBeenCalledWith(75, LYNX);
    expect(ctx.handle.cast).not.toHaveBeenCalledWith(75, CUB);
    health.set(CUB, 0);
    health.set(LYNX, 0);
    expect(await running).toMatchObject({ stop: "targets_dead" });
  });

  test("with no pet it shoots and records the victim switches", async () => {
    const { health, rows } = world(false);
    const ctx = context({ seconds: "5" }, rows);
    const running = flow.run(ctx);
    await Bun.sleep(50);
    ctx.handle.triggerAreaEvent("threat", {
      from: undefined,
      to: PET,
      type: "victim_changed",
      unit: CUB,
    });
    health.set(ME, 0);
    expect(await running).toEqual({
      events: { victim_changed: 1 },
      pet: null,
      stop: "self_dead",
      switches: [
        {
          from: null,
          to: "0xf140000001000007",
          unit: "0xf130003b06000001",
          unitTarget: "0xf140000001000007",
        },
      ],
      tables: 0,
      targets: [expect.objectContaining({ guid: "0xf130003b06000001" })],
    });
    expect(ctx.handle.petAttack).not.toHaveBeenCalled();
    expect(ctx.handle.cast).toHaveBeenCalledWith(75, CUB);
  });

  test("walks within Auto Shot range of a far creature before it shoots", async () => {
    let distance = 34;
    let health = 100;
    const rows = () => [
      row({ distance: 0, guid: ME, objectType: 4, self: true }),
      row({ distance, guid: FAR, health }),
    ];
    const ctx = context({ seconds: "5" }, rows);
    const steps: number[] = [];
    ctx.handle.walkTowardPoint = async (_point, yards) => {
      steps.push(yards);
      distance -= yards;
      return {
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
        traveled: yards,
      };
    };
    const running = flow.run(ctx);
    await Bun.sleep(50);
    health = 0;
    expect(await running).toMatchObject({ stop: "targets_dead" });
    expect(steps).toEqual([5]);
    expect(ctx.handle.cast).toHaveBeenCalledWith(75, FAR);
  });

  test("picks only living hostile attackable creatures within 35 yards", async () => {
    const rows = () => [
      row({ distance: 0, guid: ME, objectType: 4, self: true }),
      row({ attackable: false, distance: 2, guid: GUARD, relation: "unknown" }),
      row({ distance: 3, guid: TAKEN, relation: "neutral" }),
      row({ distance: 36, guid: FAR }),
      row({ distance: 30, guid: LYNX }),
    ];
    const ctx = context({ pull: "5", seconds: "0.3" }, rows);
    expect(await flow.run(ctx)).toMatchObject({
      targets: [{ guid: "0xf130003b07000002" }],
    });
    const none = context({}, () =>
      rows().filter((r) => r.entity.guid !== LYNX),
    );
    await expect(flow.run(none)).rejects.toThrow(
      "no hostile creature within 35",
    );
  });

  test("a refused cast does not end the fight", async () => {
    const { health, rows } = world(false);
    const ctx = context({ seconds: "5" }, rows);
    ctx.handle.cast = () => {
      throw new Error("cast_in_progress");
    };
    const running = flow.run(ctx);
    await Bun.sleep(50);
    health.set(CUB, 0);
    expect(await running).toMatchObject({ stop: "targets_dead" });
  });

  test("a creature on the character's spot does not end the fight", async () => {
    const { health, rows } = world(false);
    const ctx = context({ seconds: "5" }, rows);
    ctx.handle.faceGuid = () => {
      throw new Error("target_coincident");
    };
    const running = flow.run(ctx);
    await Bun.sleep(50);
    health.set(CUB, 0);
    expect(await running).toMatchObject({ stop: "targets_dead" });
  });

  test("stops at the time limit", async () => {
    const { rows } = world(false);
    expect(await flow.run(context({ seconds: "0.3" }, rows))).toMatchObject({
      stop: "timeout",
    });
  });

  test("fails with no creature in reach or a bad pull", async () => {
    const empty = context({}, () => []);
    expect(flow.run(empty)).rejects.toThrow("no hostile creature");
    const { rows } = world(false);
    expect(flow.run(context({ pull: "9" }, rows))).rejects.toThrow("pull=1..5");
  });
});
