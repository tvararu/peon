import { describe, expect, test } from "bun:test";
import { testStores } from "#test-support/session-fixtures";
import {
  type UnitmotionEvent,
  UnitmotionStore,
} from "#wow/areas/unitmotion/store";
import type { Entity } from "#wow/entity-store";
import { MovementFlag, ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { SessionDeps } from "#wow/session-stores";

const UNIT = 0xf1_30_00_3e_ea_00_0a_bcn;
const GHOST = 0xf1_30_00_3e_ea_00_0a_bdn;
const ME = 0x2an;

const BASE = {
  walk: 2.5,
  run: 7,
  run_back: 4.5,
  swim: 4.722_222,
  swim_back: 2.5,
  flight: 7,
  flight_back: 4.5,
  turn: 3.141_594,
  pitch: 3.14,
};

function entity(guid: bigint, objectType: ObjectType): Entity {
  return {
    guid,
    objectType,
    entry: 0,
    scale: 1,
    position: undefined,
    rawFields: new Map(),
    name: undefined,
  };
}

function setup() {
  let t = 1000;
  const known = new Map<bigint, Entity>([
    [UNIT, entity(UNIT, ObjectType.UNIT)],
    [ME, entity(ME, ObjectType.PLAYER)],
  ]);
  const deps: SessionDeps = {
    getEntity: (guid) => known.get(guid),
    now: () => t,
    selfGuid: () => ME,
    send: () => undefined,
    updateEntity: () => undefined,
  };
  const store = new UnitmotionStore(deps, testStores(deps));
  const seen: UnitmotionEvent[] = [];
  store.onEvent((event) => seen.push(event));
  return {
    advance: (ms: number) => {
      t += ms;
    },
    seen,
    store,
    unit: (guid = UNIT) =>
      store.snapshot().units.find((row) => row.guid === guid),
  };
}

function runSpeed(guid: bigint, value: number) {
  return {
    opcode: GameOpcode.SMSG_SPLINE_SET_RUN_SPEED,
    guid,
    kind: "speed",
    speed: "run",
    value,
  } as const;
}

function toggle(
  guid: bigint,
  flag: "root" | "hover",
  bit: number,
  on: boolean,
) {
  return {
    opcode: GameOpcode.SMSG_SPLINE_MOVE_ROOT,
    guid,
    kind: "flag",
    flag,
    bit,
    on,
  } as const;
}

describe("UnitmotionStore", () => {
  test("starts empty", () => {
    expect(setup().store.snapshot()).toEqual({ units: [], dropped: 0 });
  });

  test("a create block seeds flags and nine speeds with their source", () => {
    const { store, unit } = setup();
    store.seed(UNIT, { flags: MovementFlag.HOVER, speeds: BASE });
    expect(unit()).toEqual({
      guid: UNIT,
      flags: MovementFlag.HOVER,
      speeds: Object.fromEntries(
        Object.entries(BASE).map(([kind, value]) => [
          kind,
          { value, source: "create", at: 1000 },
        ]),
      ),
      runBefore: undefined,
      serverControlled: true,
      updatedAt: 1000,
    });
  });

  test("a flag toggle sets and clears its bit", () => {
    const { store, unit, seen } = setup();
    store.seed(UNIT, { flags: 0, speeds: BASE });
    store.receiveSpline(toggle(UNIT, "hover", MovementFlag.HOVER, true));
    expect(unit()?.flags).toBe(MovementFlag.HOVER);
    store.receiveSpline(toggle(UNIT, "hover", MovementFlag.HOVER, false));
    expect(unit()?.flags).toBe(0);
    expect(seen).toEqual([
      {
        type: "flag",
        guid: UNIT,
        flag: "hover",
        on: true,
        flags: MovementFlag.HOVER,
        self: false,
      },
      {
        type: "flag",
        guid: UNIT,
        flag: "hover",
        on: false,
        flags: 0,
        self: false,
      },
    ]);
  });

  test("root on clears the moving bits and keeps the turn bits (Unit.cpp:14069-14070)", () => {
    const { store, unit } = setup();
    const moving =
      MovementFlag.FORWARD |
      MovementFlag.STRAFE_LEFT |
      MovementFlag.FALLING |
      MovementFlag.FLYING |
      MovementFlag.ASCENDING;
    store.seed(UNIT, {
      flags: moving | MovementFlag.LEFT | MovementFlag.HOVER,
      speeds: BASE,
    });
    store.receiveSpline(toggle(UNIT, "root", MovementFlag.ROOT, true));
    expect(unit()?.flags).toBe(
      MovementFlag.ROOT | MovementFlag.LEFT | MovementFlag.HOVER,
    );
    store.receiveSpline(toggle(UNIT, "root", MovementFlag.ROOT, false));
    expect(unit()?.flags).toBe(MovementFlag.LEFT | MovementFlag.HOVER);
  });

  test("a packet for a guid with no entity is dropped and counted", () => {
    const { store, seen } = setup();
    store.receiveSpline(runSpeed(GHOST, 3.5));
    store.receiveMoveSpeed(GHOST, "run", 3.5);
    expect(store.snapshot()).toEqual({ units: [], dropped: 2 });
    expect(seen).toEqual([]);
  });

  test("a known entity with no create block starts a row from the packet", () => {
    const { store, unit } = setup();
    store.receiveSpline(toggle(UNIT, "hover", MovementFlag.HOVER, true));
    expect(unit()).toMatchObject({ flags: MovementFlag.HOVER, speeds: {} });
  });

  test("forget emits removed once", () => {
    const { store, seen } = setup();
    store.seed(UNIT, { flags: 0, speeds: BASE });
    store.forget(UNIT);
    store.forget(UNIT);
    expect(store.snapshot().units).toEqual([]);
    expect(seen).toEqual([{ type: "removed", guid: UNIT, self: false }]);
  });

  test("a run drop from a spline keeps the speed before it until it recovers", () => {
    const { store, unit, seen, advance } = setup();
    store.seed(UNIT, { flags: 0, speeds: BASE });
    advance(500);
    store.receiveSpline(runSpeed(UNIT, 3.5));
    expect(unit()).toMatchObject({
      runBefore: 7,
      serverControlled: true,
      speeds: { run: { value: 3.5, source: "spline", at: 1500 } },
      updatedAt: 1500,
    });
    store.receiveSpline(runSpeed(UNIT, 2.1));
    expect(unit()?.runBefore).toBe(7);
    store.receiveSpline(runSpeed(UNIT, 7));
    expect(unit()?.runBefore).toBeUndefined();
    expect(seen[0]).toEqual({
      type: "speed",
      guid: UNIT,
      kind: "run",
      value: 3.5,
      previous: 7,
      self: false,
    });
  });

  test("ratio divides by the base speeds of Unit.cpp:80-103", () => {
    const { store } = setup();
    store.seed(UNIT, { flags: 0, speeds: { ...BASE, swim: 2.361_111 } });
    store.receiveSpline(runSpeed(UNIT, 3.5));
    expect(store.ratio(UNIT, "run")).toBe(0.5);
    expect(store.ratio(UNIT, "swim")).toBeCloseTo(0.5, 5);
    expect(store.ratio(UNIT, "walk")).toBe(1);
    expect(store.ratio(GHOST, "run")).toBeUndefined();
  });

  test("an event for the character's own guid carries self", () => {
    const { store, seen, unit } = setup();
    store.seed(ME, { flags: 0, speeds: BASE });
    expect(unit(ME)?.serverControlled).toBe(false);
    store.receiveSpline(toggle(ME, "root", MovementFlag.ROOT, true));
    store.receiveMoveSpeed(ME, "run", 3.5);
    expect(seen.map((event) => event.self)).toEqual([true, true]);
    expect(unit(ME)?.speeds.run?.source).toBe("move_msg");
  });

  test("dispose drops rows and listeners", () => {
    const { store, seen } = setup();
    store.seed(UNIT, { flags: 0, speeds: BASE });
    store.dispose();
    store.receiveSpline(runSpeed(UNIT, 3.5));
    expect(seen).toEqual([]);
  });
});
