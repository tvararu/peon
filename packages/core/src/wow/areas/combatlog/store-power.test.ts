import { describe, expect, test } from "bun:test";
import { testStores } from "#test-support/session-fixtures";
import { CombatlogStore } from "#wow/areas/combatlog/store";
import { combatUnitOf } from "#wow/combat-unit";
import { type EntityEvent, EntityStore, isUnit } from "#wow/entity-store";
import { MotionStore } from "#wow/motion-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";
import type { SessionDeps } from "#wow/session-stores";

const ME = 0x2an;
const BOAR = 0xf1_30_00_3e_ea_00_0a_bcn;
const MANA = 0;
const RAGE = 1;

function setup() {
  const entities = new EntityStore();
  entities.create(ME, ObjectType.PLAYER, {
    power: [80, 0, 0, 0, 0, 0, 0],
    rawFields: new Map([
      [UNIT_FIELDS.BYTES_0.offset, MANA << 24],
      [UNIT_FIELDS.POWER1.offset + MANA, 80],
    ]),
  });
  const updates: EntityEvent[] = [];
  entities.onEvent((event) => {
    if (event.type === "update") updates.push(event);
  });
  const deps: SessionDeps = {
    getEntity: (guid) => entities.get(guid),
    now: () => 1000,
    selfGuid: () => ME,
    send: () => undefined,
    updateEntity: (guid, fields, rawFields) =>
      entities.update(guid, fields, rawFields),
  };
  const store = new CombatlogStore(deps, testStores(deps));
  const seen: unknown[] = [];
  store.onEvent((event) => seen.push(event));
  const unitOf = (guid: bigint) =>
    combatUnitOf(
      {
        deps: {
          ...deps,
          selectedGuid: () => undefined,
          selfPose: () => undefined,
        },
        motions: new MotionStore(deps.now),
      },
      guid,
      undefined,
      entities.get(guid),
    );
  return { entities, seen, store, unitOf, updates };
}

describe("power updates (Unit.cpp:12015-12019)", () => {
  test("a known unit gets the raw field and the typed slot in one update", () => {
    const { entities, seen, store, unitOf, updates } = setup();
    store.applyPower({ guid: ME, power: MANA, value: 42 });
    const entity = entities.get(ME);
    expect(entity?.rawFields.get(UNIT_FIELDS.POWER1.offset + MANA)).toBe(42);
    expect(isUnit(entity) ? entity.power : undefined).toEqual([
      42, 0, 0, 0, 0, 0, 0,
    ]);
    expect(updates).toHaveLength(1);
    expect(unitOf(ME).power).toBe(42);
    expect(store.snapshot().entries).toEqual([]);
    expect(seen).toEqual([]);
  });

  test("a second power keeps the other slots", () => {
    const { entities, store } = setup();
    store.applyPower({ guid: ME, power: RAGE, value: 150 });
    const entity = entities.get(ME);
    expect(isUnit(entity) ? entity.power : undefined).toEqual([
      80, 150, 0, 0, 0, 0, 0,
    ]);
    expect(entity?.rawFields.get(UNIT_FIELDS.POWER1.offset + MANA)).toBe(80);
    expect(entity?.rawFields.get(UNIT_FIELDS.POWER1.offset + RAGE)).toBe(150);
  });

  test("an unknown guid or a power past the last slot changes nothing", () => {
    const { entities, store, updates } = setup();
    store.applyPower({ guid: BOAR, power: MANA, value: 5 });
    store.applyPower({ guid: ME, power: 7, value: 5 });
    expect(updates).toEqual([]);
    expect(entities.get(BOAR)).toBeUndefined();
    expect(
      entities.get(ME)?.rawFields.has(UNIT_FIELDS.MAXPOWER1.offset - 1),
    ).toBe(false);
  });
});
