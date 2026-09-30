import { describe, expect, jest, test } from "bun:test";
import type { AreaState, NearbyRow } from "@peon/core";
import { createRefTable } from "#harness/ops/refs";
import { createSightings } from "#harness/ops/sightings";
import {
  compassOf,
  knownUnits,
  manaText,
  nearestByKind,
  nowSnapshot,
  placeView,
  poseView,
  selfView,
  unitMatches,
  unitView,
  unitViews,
  vitalsView,
} from "#harness/ops/views";
import { createTestRuntime } from "#test-support/runtime-fixture";
import {
  gameObject,
  nearbyRow,
  ORIGIN,
  SELF_GUID,
  selfCombat,
  selfPose,
  selfRow,
  setWorld,
  unitEntity,
} from "#test-support/world-fixtures";

async function world(rows: NearbyRow[] = []) {
  const now = { t: 1_000_000 };
  const clock = { now: () => now.t };
  const { handle, rt } = await createTestRuntime({
    parts: { clock, refs: createRefTable(), sightings: createSightings(clock) },
  });
  setWorld(handle, {
    pose: selfPose(now.t - 400),
    rows: [selfRow(), ...rows],
    serverPose: selfPose(now.t - 12_000, { source: "server" }),
  });
  return { ctx: { handle, rt }, handle, now, rt };
}

const velan = () =>
  nearbyRow(
    unitEntity({
      dy: -11,
      entry: 16_205,
      guid: 0x30n,
      level: 30,
      name: "Velan Brightoak",
    }),
    { relation: "friendly", roles: ["questgiver"] },
  );
const stalker = (dx: number) =>
  nearbyRow(
    unitEntity({
      dx,
      entry: 2957,
      guid: 0x50n,
      level: 7,
      name: "Springpaw Stalker",
    }),
    { relation: "hostile" },
  );

describe("compassOf", () => {
  test("uses WoW axes: +x north, +y west", () => {
    expect(compassOf(0)).toBe("N");
    expect(compassOf(Math.PI / 4)).toBe("NW");
    expect(compassOf(Math.PI / 2)).toBe("W");
    expect(compassOf(Math.PI)).toBe("S");
    expect(compassOf(-Math.PI / 2)).toBe("E");
    expect(compassOf(-Math.PI / 4)).toBe("NE");
    expect(compassOf(Math.PI * 2 - 0.1)).toBe("N");
  });
});

describe("poseView and vitalsView", () => {
  test("pose has a source, an age and the server fix age", async () => {
    const { ctx } = await world();
    expect(poseView(ctx)).toEqual({
      ageMs: 400,
      facing: "N",
      mapId: 530,
      serverFixAgeMs: 12_000,
      source: "predicted",
      x: ORIGIN.x,
      y: ORIGIN.y,
      z: ORIGIN.z,
    });
  });

  test("no pose gives undefined", async () => {
    const { ctx, handle } = await world();
    setWorld(handle, {});
    expect(poseView(ctx)).toBeUndefined();
  });

  test("rage is shown in whole points", async () => {
    const { ctx, handle } = await world();
    setWorld(handle, {
      combat: {
        self: selfCombat({ maxPower: 1000, power: 250, powerType: 1 }),
      },
    });
    expect(vitalsView(ctx)).toEqual({
      hp: 217,
      maxHp: 217,
      maxPower: 100,
      power: 25,
      powerKind: "rage",
    });
  });
});

describe("vitalsView combo points", () => {
  const points = (n: number | undefined) => ({
    comboPoints: n === undefined ? undefined : { points: n, target: 0x30n },
    dropped: 0,
    entries: [],
    fight: undefined,
    immunities: [],
    kills: [],
    lastFight: undefined,
  });

  test("shows the combo points held on the target when above zero", async () => {
    const { ctx, handle } = await world();
    jest.spyOn(handle.combatlog, "state").mockReturnValue(points(3));
    expect(vitalsView(ctx).comboPoints).toBe(3);
    expect(selfView(ctx).comboPoints).toBe(3);
  });

  test("leaves the field out with none or a zero count", async () => {
    const { ctx, handle } = await world();
    const state = jest.spyOn(handle.combatlog, "state");
    for (const held of [undefined, 0]) {
      state.mockReturnValue(points(held));
      expect(vitalsView(ctx)).not.toHaveProperty("comboPoints");
    }
  });
});

describe("selfView and placeView", () => {
  test("self reads class from the self entity and name from the profile", async () => {
    const { ctx, rt } = await world();
    expect(selfView(ctx)).toMatchObject({
      className: "Priest",
      guid: SELF_GUID.toString(16),
      hp: 217,
      inCombat: false,
      level: 10,
      life: "alive",
      name: rt.profile.character,
      powerKind: "mana",
      race: rt.ready.inWorld()?.race ?? "unknown",
    });
  });

  test("attackers put the character in combat", async () => {
    const { ctx, handle } = await world();
    setWorld(handle, { combat: { attackers: [0x50n] }, rows: [selfRow()] });
    expect(selfView(ctx).inCombat).toBe(true);
  });

  test("place gives zone, area and age", async () => {
    const { ctx, handle, now } = await world();
    setWorld(handle, {
      place: {
        area: "Fairbreeze Village",
        areaId: 3665,
        at: now.t - 240_000,
        zone: "Eversong Woods",
        zoneId: 3430,
      },
    });
    expect(placeView(ctx)).toEqual({
      ageMs: 240_000,
      area: "Fairbreeze Village",
      areaId: 3665,
      zone: "Eversong Woods",
      zoneId: 3430,
    });
  });

  test("a place getter that is not built yet gives undefined fields", async () => {
    const { ctx, handle } = await world();
    handle.getPlaceState = () => {
      throw new Error("not_implemented");
    };
    expect(placeView(ctx)).toEqual({
      ageMs: undefined,
      area: undefined,
      areaId: undefined,
      zone: undefined,
      zoneId: undefined,
    });
  });
});

describe("unit views", () => {
  test("unitView decodes one row", async () => {
    const { ctx } = await world();
    expect(unitView(ctx, velan())).toEqual({
      alive: true,
      attackable: false,
      attackingMe: false,
      compass: "E",
      distance: 11,
      entry: 16_205,
      guid: "30",
      hp: 100,
      hpPct: 100,
      inView: true,
      kind: "creature",
      level: 30,
      lootable: false,
      maxHp: 100,
      name: "Velan Brightoak",
      ref: "u1",
      relation: "friendly",
      roles: ["questgiver"],
      seenAgoMs: 0,
      tappedByOther: false,
      targetsMe: false,
      x: ORIGIN.x,
      y: ORIGIN.y - 11,
      z: ORIGIN.z,
    });
  });

  test("targetsMe reads the unit's target", async () => {
    const { ctx } = await world();
    const row = nearbyRow(
      unitEntity({ guid: 0x51n, name: "Mana Wyrm", target: SELF_GUID }),
    );
    expect(unitView(ctx, row).targetsMe).toBe(true);
  });

  test("unitViews lists units only and notes each in the sightings", async () => {
    const { ctx, rt } = await world([
      velan(),
      nearbyRow(gameObject(0x70n, "Signpost")),
    ]);
    expect(unitViews(ctx).map((unit) => unit.name)).toEqual([
      "Velan Brightoak",
    ]);
    expect(rt.sightings.get(0x30n)?.name).toBe("Velan Brightoak");
  });

  test("knownUnits adds sightings out of view, nearest first", async () => {
    const { ctx, handle, now, rt } = await world([stalker(150)]);
    unitViews(ctx);
    setWorld(handle, { pose: selfPose(now.t), rows: [selfRow(), velan()] });
    now.t += 60_000;
    const known = knownUnits(ctx);
    expect(known.map((unit) => [unit.name, unit.inView])).toEqual([
      ["Velan Brightoak", true],
      ["Springpaw Stalker", false],
    ]);
    expect(known[1]).toMatchObject({
      compass: "N",
      distance: 150,
      hpPct: 100,
      ref: rt.refs.refOf(0x50n),
      seenAgoMs: 60_000,
    });
  });

  test("nearestByKind covers units out of view", async () => {
    const { ctx, handle, now } = await world([stalker(150)]);
    unitViews(ctx);
    setWorld(handle, { pose: selfPose(now.t), rows: [selfRow(), velan()] });
    const nearest = nearestByKind(ctx);
    expect(nearest.hostile?.name).toBe("Springpaw Stalker");
    expect(nearest.questgiver?.name).toBe("Velan Brightoak");
    expect(nearest.vendor).toBeUndefined();
  });

  test("nearestByKind skips units another player tapped for hostile and attackable", async () => {
    const tapped = nearbyRow(
      unitEntity({ dx: 10, guid: 0x53n, level: 7, name: "Springpaw Lynx" }),
      { attackable: true, relation: "hostile", tappedByOther: true },
    );
    const { ctx } = await world([tapped, stalker(40)]);
    const nearest = nearestByKind(ctx);
    expect(nearest.hostile?.name).toBe("Springpaw Stalker");
    expect(nearest.attackable).toBeUndefined();
  });

  test("unitMatches needs a living unit for hostile", async () => {
    const { ctx } = await world();
    const dead = unitView(
      ctx,
      nearbyRow(
        unitEntity({ guid: 0x52n, health: 0, name: "Springpaw Stalker" }),
        { lootable: true, relation: "hostile" },
      ),
    );
    expect(unitMatches(dead, "hostile")).toBe(false);
    expect(unitMatches(dead, "lootable")).toBe(true);
  });
});

describe("manaText", () => {
  test("mana reads as current/max with the percent after it", () => {
    const vitals = { hp: 1, maxHp: 1, maxPower: 607, power: 231 };
    expect(manaText({ ...vitals, powerKind: "mana" })).toBe(
      "mana 231/607 (38%)",
    );
    expect(manaText({ ...vitals, powerKind: "rage" })).toBeUndefined();
    expect(
      manaText({ ...vitals, maxPower: 0, powerKind: "mana" }),
    ).toBeUndefined();
  });
});

const IDLE: AreaState<"selfstate"> = {
  collisionHeight: undefined,
  ghostPending: false,
  lastTransferAbort: undefined,
  mountDisplayId: 0,
  mounted: false,
  selfResSpell: 0,
  standState: "stand",
  timers: {},
};

function selfstateIs(
  handle: Awaited<ReturnType<typeof world>>["handle"],
  state: Partial<AreaState<"selfstate">>,
) {
  jest.spyOn(handle.selfstate, "state").mockReturnValue({ ...IDLE, ...state });
}

describe("posture and breath", () => {
  test("sit, chair sits, sleep and kneel get a posture word; the rest none", async () => {
    const { ctx, handle } = await world();
    const posture = (standState: AreaState<"selfstate">["standState"]) => {
      selfstateIs(handle, { standState });
      return selfView(ctx).posture;
    };
    expect(posture("sit")).toBe("sitting");
    expect(posture("sit_low_chair")).toBe("sitting");
    expect(posture("sleep")).toBe("sleeping");
    expect(posture("kneel")).toBe("kneeling");
    expect(posture("stand")).toBeUndefined();
    expect(posture("dead")).toBeUndefined();
    expect(posture(undefined)).toBeUndefined();
  });

  test("the now snapshot counts a running breath timer down to the clock", async () => {
    const { handle, now, rt } = await world();
    const timer = {
      at: now.t - 15_000,
      maxMs: 60_000,
      paused: false,
      scale: -1,
      spellId: 0,
      valueMs: 60_000,
    };
    selfstateIs(handle, { timers: { breath: timer } });
    expect(nowSnapshot(rt)?.breathS).toBe(45);
    selfstateIs(handle, { timers: { breath: { ...timer, paused: true } } });
    expect(nowSnapshot(rt)?.breathS).toBeUndefined();
    selfstateIs(handle, { timers: { breath: { ...timer, scale: 1 } } });
    expect(nowSnapshot(rt)?.breathS).toBeUndefined();
    selfstateIs(handle, {
      timers: { breath: { ...timer, at: now.t - 70_000 } },
    });
    expect(nowSnapshot(rt)?.breathS).toBeUndefined();
    selfstateIs(handle, { timers: { fatigue: timer } });
    expect(nowSnapshot(rt)?.breathS).toBeUndefined();
    selfstateIs(handle, {});
    expect(nowSnapshot(rt)?.breathS).toBeUndefined();
  });

  test("a drained but still-active timer shows 0 s", async () => {
    const { handle, now, rt } = await world();
    selfstateIs(handle, {
      timers: {
        breath: {
          at: now.t - 15_000,
          maxMs: 60_000,
          paused: false,
          scale: -1,
          spellId: 0,
          valueMs: 15_000,
        },
      },
    });
    expect(nowSnapshot(rt)?.breathS).toBe(0);
  });
});
