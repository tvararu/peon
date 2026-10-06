import { describe, expect, test } from "bun:test";
import { must } from "#test-support/must";
import {
  type EntityEvent,
  EntityStore,
  type GameObjectEntity,
  snapshotEntityEvent,
  type UnitEntity,
} from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";

describe("EntityStore", () => {
  test("create adds entity and fires appear event", () => {
    const store = new EntityStore();
    const events: EntityEvent[] = [];
    store.onEvent((e) => events.push(e));

    store.create(1n, ObjectType.UNIT, { health: 100 });

    expect(store.get(1n)).toBeDefined();
    expect(events).toHaveLength(1);
    expect(must(events[0]).type).toBe("appear");
  });

  test("create with UNIT type has unit-specific fields", () => {
    const store = new EntityStore();
    store.create(1n, ObjectType.UNIT, {});

    const entity = store.get(1n) as UnitEntity;
    expect(entity.objectType).toBe(ObjectType.UNIT);
    expect(entity.health).toBe(0);
    expect(entity.maxHealth).toBe(0);
    expect(entity.level).toBe(0);
    expect(entity.factionTemplate).toBe(0);
    expect(entity.displayId).toBe(0);
    expect(entity.npcFlags).toBe(0);
    expect(entity.unitFlags).toBe(0);
    expect(entity.target).toBe(0n);
    expect(entity.race).toBe(0);
    expect(entity.class_).toBe(0);
    expect(entity.gender).toBe(0);
    expect(entity.power).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(entity.maxPower).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  test("create with PLAYER type has unit-specific fields", () => {
    const store = new EntityStore();
    store.create(2n, ObjectType.PLAYER, { level: 80 });

    const entity = store.get(2n) as UnitEntity;
    expect(entity.objectType).toBe(ObjectType.PLAYER);
    expect(entity.level).toBe(80);
    expect(entity.health).toBe(0);
  });

  test("create with GAMEOBJECT type has gameobject-specific fields", () => {
    const store = new EntityStore();
    store.create(3n, ObjectType.GAMEOBJECT, {});

    const entity = store.get(3n) as GameObjectEntity;
    expect(entity.objectType).toBe(ObjectType.GAMEOBJECT);
    expect(entity.displayId).toBe(0);
    expect(entity.flags).toBe(0);
    expect(entity.gameObjectType).toBe(0);
    expect(entity.bytes1).toBe(0);
  });

  test("create with CORPSE type is BaseEntity", () => {
    const store = new EntityStore();
    store.create(4n, ObjectType.CORPSE, {});

    const entity = must(store.get(4n));
    expect(entity.objectType).toBe(ObjectType.CORPSE);
    expect("health" in entity).toBe(false);
    expect("displayId" in entity).toBe(false);
  });

  test("update merges fields and fires update event", () => {
    const store = new EntityStore();
    const events: EntityEvent[] = [];
    store.onEvent((e) => events.push(e));

    store.create(1n, ObjectType.UNIT, {});
    events.length = 0;

    store.update(1n, { health: 50 });

    const entity = store.get(1n) as UnitEntity;
    expect(entity.health).toBe(50);
    expect(events).toHaveLength(1);
    const event = must(events[0]);
    expect(event.type).toBe("update");
    if (event.type === "update") {
      expect(event.changed).toContain("health");
    }
  });

  test("update with empty fields does not fire event", () => {
    const store = new EntityStore();
    const events: EntityEvent[] = [];
    store.onEvent((e) => events.push(e));

    store.create(1n, ObjectType.UNIT, {});
    events.length = 0;

    store.update(1n, {});

    expect(events).toHaveLength(0);
  });

  test("update on nonexistent guid is a no-op", () => {
    const store = new EntityStore();
    const events: EntityEvent[] = [];
    store.onEvent((e) => events.push(e));

    store.update(999n, { health: 50 });

    expect(events).toHaveLength(0);
  });

  test("destroy removes entity and fires disappear event", () => {
    const store = new EntityStore();
    const events: EntityEvent[] = [];
    store.onEvent((e) => events.push(e));

    store.create(1n, ObjectType.UNIT, {});
    store.setName(1n, "TestUnit");
    events.length = 0;

    store.destroy(1n);

    expect(store.get(1n)).toBeUndefined();
    expect(events).toHaveLength(1);
    const event = must(events[0]);
    expect(event.type).toBe("disappear");
    if (event.type === "disappear") {
      expect(event.guid).toBe(1n);
      expect(event.name).toBe("TestUnit");
    }
  });

  test("destroy on nonexistent guid is a no-op", () => {
    const store = new EntityStore();
    const events: EntityEvent[] = [];
    store.onEvent((e) => events.push(e));

    store.destroy(999n);

    expect(events).toHaveLength(0);
  });

  test("getByType returns entities of specified type", () => {
    const store = new EntityStore();
    store.create(1n, ObjectType.UNIT, {});
    store.create(2n, ObjectType.UNIT, {});
    store.create(3n, ObjectType.GAMEOBJECT, {});

    const units = store.getByType(ObjectType.UNIT);
    expect(units).toHaveLength(2);

    const gos = store.getByType(ObjectType.GAMEOBJECT);
    expect(gos).toHaveLength(1);
  });

  test("clear removes all and fires disappear for each", () => {
    const store = new EntityStore();
    store.create(1n, ObjectType.UNIT, {});
    store.create(2n, ObjectType.GAMEOBJECT, {});

    const events: EntityEvent[] = [];
    store.onEvent((e) => events.push(e));

    store.clear();

    expect(store.all()).toHaveLength(0);
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.type === "disappear")).toBe(true);
  });

  test("setName updates name and fires update event", () => {
    const store = new EntityStore();
    const events: EntityEvent[] = [];
    store.onEvent((e) => events.push(e));

    store.create(1n, ObjectType.UNIT, {});
    events.length = 0;

    store.setName(1n, "Thrall");

    const entity = must(store.get(1n));
    expect(entity.name).toBe("Thrall");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "update", changed: ["name"] });
  });

  test("setPosition updates position", () => {
    const store = new EntityStore();
    const events: EntityEvent[] = [];
    store.onEvent((e) => events.push(e));

    store.create(1n, ObjectType.UNIT, {});
    events.length = 0;

    const pos = { mapId: 1, x: 10, y: 20, z: 30, orientation: 1.5 };
    store.setPosition(1n, pos);

    const entity = must(store.get(1n));
    expect(entity.position).toEqual(pos);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "update", changed: ["position"] });
  });

  test("all returns a snapshot the caller can mutate without touching the store", () => {
    const store = new EntityStore();
    store.create(1n, ObjectType.UNIT, {});
    store.create(2n, ObjectType.PLAYER, {});
    store.create(3n, ObjectType.GAMEOBJECT, {});

    const snapshot = store.all();
    expect(snapshot).toHaveLength(3);
    snapshot.length = 0;
    expect(store.all()).toHaveLength(3);
  });

  test("partial power update preserves unaffected indices", () => {
    const store = new EntityStore();
    store.create(1n, ObjectType.UNIT, {
      power: [100, 200, 300, 400, 500, 600, 700],
    });

    const sparse: number[] = [];
    sparse[2] = 999;
    store.update(1n, { power: sparse });

    const entity = store.get(1n) as UnitEntity;
    expect(entity.power).toEqual([100, 200, 999, 400, 500, 600, 700]);
  });

  test("create replaces existing entity", () => {
    const store = new EntityStore();
    const events: EntityEvent[] = [];
    store.onEvent((e) => events.push(e));

    store.create(1n, ObjectType.UNIT, { health: 100 });
    store.create(1n, ObjectType.UNIT, { health: 200 });

    const entity = store.get(1n) as UnitEntity;
    expect(entity.health).toBe(200);
    expect(store.all()).toHaveLength(1);
  });

  test("create with different objectType cleans old type from byType index", () => {
    const store = new EntityStore();

    store.create(1n, ObjectType.UNIT, { health: 100 });
    expect(store.getByType(ObjectType.UNIT)).toHaveLength(1);

    store.create(1n, ObjectType.GAMEOBJECT, {});

    expect(store.getByType(ObjectType.UNIT)).toHaveLength(0);
    expect(store.getByType(ObjectType.GAMEOBJECT)).toHaveLength(1);
    expect(must(store.get(1n)).objectType).toBe(ObjectType.GAMEOBJECT);
  });

  test("create replacing entity fires disappear then appear", () => {
    const store = new EntityStore();
    const events: EntityEvent[] = [];
    store.onEvent((e) => events.push(e));

    store.create(1n, ObjectType.UNIT, { health: 100 });
    store.setName(1n, "OldUnit");
    events.length = 0;

    store.create(1n, ObjectType.GAMEOBJECT, {});

    expect(events).toHaveLength(2);
    const event = must(events[0]);
    expect(event.type).toBe("disappear");
    if (event.type === "disappear") {
      expect(event.guid).toBe(1n);
      expect(event.name).toBe("OldUnit");
    }
    const event1 = must(events[1]);
    expect(event1.type).toBe("appear");
    if (event1.type === "appear") {
      expect(event1.entity.objectType).toBe(ObjectType.GAMEOBJECT);
    }
  });

  test("disappear fires only after the entity has left every index", () => {
    const store = new EntityStore();
    const seen: string[] = [];
    store.onEvent((event) => {
      if (event.type !== "disappear") return;
      const units = store.getByType(ObjectType.UNIT).map((e) => e.guid);
      const present =
        store.get(event.guid) !== undefined ||
        units.includes(event.guid) ||
        store.all().some((e) => e.guid === event.guid);
      seen.push(`${event.guid}:${present}`);
    });
    store.create(1n, ObjectType.UNIT, {});
    store.create(1n, ObjectType.UNIT, {});
    store.destroy(1n);
    store.create(2n, ObjectType.UNIT, {});
    store.create(3n, ObjectType.UNIT, {});
    store.clear();
    expect(seen).toEqual(["1:false", "1:false", "2:false", "3:false"]);
  });

  test("update merges raw fields into the stored view", () => {
    const store = new EntityStore();
    const events: EntityEvent[] = [];
    store.onEvent((e) => events.push(e));
    store.create(1n, ObjectType.UNIT, { rawFields: new Map([[1, 10]]) });
    const view = must(store.get(1n));
    store.update(1n, { health: 5 }, new Map([[2, 20]]));
    expect([...view.rawFields]).toEqual([
      [1, 10],
      [2, 20],
    ]);
    expect(events.at(-1)).toMatchObject({ changed: ["health", "rawFields"] });
  });

  test("an event snapshot keeps its values after later updates", () => {
    const store = new EntityStore();
    const snapshots: EntityEvent[] = [];
    store.onEvent((e) => snapshots.push(snapshotEntityEvent(e)));
    store.create(1n, ObjectType.UNIT, { rawFields: new Map([[1, 10]]) });
    store.update(1n, { power: [5] }, new Map([[1, 0]]));
    store.setPosition(1n, { mapId: 0, x: 1, y: 2, z: 3, orientation: 0 });
    const [appear] = snapshots;
    expect(appear?.type === "appear" && appear.entity).toMatchObject({
      power: [0, 0, 0, 0, 0, 0, 0],
      position: undefined,
      rawFields: new Map([[1, 10]]),
    });
  });
});
