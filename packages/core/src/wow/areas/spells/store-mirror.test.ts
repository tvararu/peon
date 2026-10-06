import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { spellsMirrorImageBody } from "#test-support/areas/spells";
import type { SpellsEvent } from "#wow/areas/spells/store";
import type { UnitEntity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";

const ME = 0x2an;
const IMAGE = 0xf1_30_00_79_d8_00_00_11n;
const OTHER = 0xf1_30_00_79_d8_00_00_12n;

function unit(guid: bigint): UnitEntity {
  return {
    class_: 8,
    displayId: 15_476,
    entry: 31_216,
    factionTemplate: 1,
    gender: 1,
    guid,
    health: 100,
    level: 80,
    maxHealth: 100,
    maxPower: [0, 0, 0, 0, 0, 0, 0],
    name: "image",
    npcFlags: 0,
    objectType: ObjectType.UNIT,
    position: undefined,
    power: [0, 0, 0, 0, 0, 0, 0],
    race: 10,
    rawFields: new Map(),
    scale: 1,
    target: 0n,
    unitFlags: 0,
  };
}

function setup(visible: readonly bigint[]) {
  const units = new Map(visible.map((guid) => [guid, unit(guid)]));
  const rig = areaRig("spells", {
    getEntity: (guid: bigint) => units.get(guid),
    selfGuid: ME,
  });
  return rig;
}

function body(guid: bigint) {
  return spellsMirrorImageBody({
    classId: 8,
    displayId: 15_476,
    gender: 1,
    guid,
    guild: 9,
    items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    look: [3, 4, 5, 6, 7],
    race: 10,
  });
}

describe("SpellsStore mirror images", () => {
  test("a visible unit's image is kept in state and emits mirror_image", () => {
    const rig = setup([IMAGE]);
    try {
      const seen: SpellsEvent[] = [];
      rig.handle.onEvent((event) => seen.push(event));
      rig.inject(GameOpcode.SMSG_MIRRORIMAGE_DATA, body(IMAGE));
      const held = rig.handle.state().mirrorImages;
      expect(held.map((m) => m.guid)).toEqual([IMAGE]);
      expect(held[0]?.displayId).toBe(15_476);
      expect(held[0]?.items).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      expect(seen).toEqual([
        {
          classId: 8,
          displayId: 15_476,
          gender: 1,
          guid: IMAGE,
          race: 10,
          type: "mirror_image",
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a reply for a guid that is not visible is dropped without an event", () => {
    const rig = setup([]);
    try {
      const seen: SpellsEvent[] = [];
      rig.handle.onEvent((event) => seen.push(event));
      rig.inject(GameOpcode.SMSG_MIRRORIMAGE_DATA, body(OTHER));
      expect(rig.handle.state().mirrorImages).toEqual([]);
      expect(seen).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a disappear drops the stored image so a new sighting requests again", () => {
    const rig = setup([IMAGE]);
    try {
      expect(rig.handle.act.requestMirrorImage(IMAGE)).toEqual({ ok: true });
      rig.inject(GameOpcode.SMSG_MIRRORIMAGE_DATA, body(IMAGE));
      rig.events.entity.emit({ guid: IMAGE, type: "disappear" });
      expect(rig.handle.state().mirrorImages).toEqual([]);
      expect(rig.handle.act.requestMirrorImage(IMAGE)).toEqual({ ok: true });
    } finally {
      rig.dispose();
    }
  });

  test("dispose clears the stored images", () => {
    const rig = setup([IMAGE]);
    try {
      rig.inject(GameOpcode.SMSG_MIRRORIMAGE_DATA, body(IMAGE));
      rig.dispose();
      expect(rig.stores.areas.spells.snapshot().mirrorImages).toEqual([]);
    } finally {
      rig.dispose();
    }
  });
});
