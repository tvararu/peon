import { describe, expect, test } from "bun:test";
import { createSightings, SIGHTING_TTL_MS } from "#harness/ops/sightings";
import { createTestRuntime } from "#test-support/runtime-fixture";
import {
  gameObject,
  MAP_ID,
  nearbyRow,
  ORIGIN,
  SELF_GUID,
  selfRow,
  unitEntity,
} from "#test-support/world-fixtures";

function sightingsAt(now: { t: number }) {
  return createSightings({ now: () => now.t });
}

const stalker = () =>
  unitEntity({
    dx: 78,
    entry: 2957,
    guid: 0x50n,
    level: 7,
    name: "Springpaw Stalker",
  });

describe("createSightings", () => {
  test("note keeps position, relation, roles, level and time", () => {
    const sightings = sightingsAt({ t: 1000 });
    sightings.note(nearbyRow(stalker(), { relation: "hostile" }));
    expect(sightings.get(0x50n)).toEqual({
      alive: true,
      entry: 2957,
      guid: 0x50n,
      kind: "creature",
      level: 7,
      lootable: false,
      mapId: MAP_ID,
      name: "Springpaw Stalker",
      relation: "hostile",
      roles: [],
      seenAt: 1000,
      x: ORIGIN.x + 78,
      y: ORIGIN.y,
      z: ORIGIN.z,
    });
  });

  test("skips self rows and game objects", () => {
    const sightings = sightingsAt({ t: 0 });
    sightings.note(selfRow());
    sightings.note(nearbyRow(gameObject(0x70n, "Signpost")));
    expect(sightings.all()).toEqual([]);
  });

  test("a row without a position keeps the earlier sighting", () => {
    const now = { t: 1000 };
    const sightings = sightingsAt(now);
    sightings.note(nearbyRow(stalker(), { relation: "hostile" }));
    now.t = 2000;
    sightings.note(nearbyRow({ ...stalker(), position: undefined }));
    expect(sightings.get(0x50n)?.seenAt).toBe(1000);
  });

  test("an unknown relation does not overwrite a known one", () => {
    const sightings = sightingsAt({ t: 0 });
    sightings.note(nearbyRow(stalker(), { relation: "hostile" }));
    sightings.note(nearbyRow(stalker(), { relation: "unknown" }));
    expect(sightings.get(0x50n)?.relation).toBe("hostile");
  });

  test("hides sightings older than 30 minutes, and prune deletes them", () => {
    const now = { t: 1000 };
    const sightings = sightingsAt(now);
    sightings.note(nearbyRow(stalker()));
    now.t = 1000 + SIGHTING_TTL_MS;
    expect(sightings.all()).toHaveLength(1);
    now.t += 1;
    expect(sightings.get(0x50n)).toBeUndefined();
    expect(sightings.all()).toEqual([]);
    sightings.prune(now.t);
    now.t = 1000;
    expect(sightings.get(0x50n)).toBeUndefined();
  });

  test("attach follows entity appear and update events", async () => {
    const { handle } = await createTestRuntime();
    const control = handle.getControlState();
    handle.getControlState = () => ({ ...control, selfGuid: SELF_GUID });
    const sightings = sightingsAt({ t: 5 });
    sightings.note(
      nearbyRow(unitEntity({ guid: 0x60n, name: "Mana Wyrm" }), {
        relation: "hostile",
        roles: [],
      }),
    );
    const off = sightings.attach(handle);
    handle.triggerEntityEvent({
      changed: ["position"],
      entity: unitEntity({ dx: 20, guid: 0x60n, name: "Mana Wyrm" }),
      type: "update",
    });
    expect(sightings.get(0x60n)).toMatchObject({
      relation: "hostile",
      x: ORIGIN.x + 20,
    });
    handle.triggerEntityEvent({
      entity: unitEntity({ dx: 9, guid: 0x61n, name: "Feral Tender" }),
      type: "appear",
    });
    expect(sightings.get(0x61n)).toMatchObject({
      relation: "unknown",
      roles: [],
      x: ORIGIN.x + 9,
    });
    handle.triggerEntityEvent({
      entity: unitEntity({ guid: SELF_GUID, name: "Fgklibhlflc" }),
      type: "appear",
    });
    handle.triggerEntityEvent({
      entity: unitEntity({ guid: 0x62n, name: undefined }),
      type: "appear",
    });
    expect(sightings.get(SELF_GUID)).toBeUndefined();
    expect(sightings.get(0x62n)).toBeUndefined();
    off();
    handle.triggerEntityEvent({
      entity: unitEntity({ guid: 0x63n, name: "Lynx" }),
      type: "appear",
    });
    expect(sightings.get(0x63n)).toBeUndefined();
  });
});
