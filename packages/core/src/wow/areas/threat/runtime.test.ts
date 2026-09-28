import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { threatThreatUpdateBody } from "#test-support/areas/threat";
import type { UnitEntity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";

const UNIT = 0xf1_30_00_3e_ea_00_0a_bcn;
const OTHER = 0xf1_30_00_3e_ea_00_0a_bdn;
const ME = 0x2an;

function unit(guid: bigint, health: number, maxHealth = 100): UnitEntity {
  return {
    class_: 1,
    displayId: 1,
    entry: 15_366,
    factionTemplate: 14,
    gender: 0,
    guid,
    health,
    level: 5,
    maxHealth,
    maxPower: [0, 0, 0, 0, 0, 0, 0],
    name: "Springpaw Cub",
    npcFlags: 0,
    objectType: ObjectType.UNIT,
    position: undefined,
    power: [0, 0, 0, 0, 0, 0, 0],
    race: 0,
    rawFields: new Map(),
    scale: 1,
    target: ME,
    unitFlags: 0,
  };
}

function engaged() {
  const rig = areaRig("threat", { selfGuid: ME });
  for (const guid of [UNIT, OTHER])
    rig.inject(
      GameOpcode.SMSG_THREAT_UPDATE,
      threatThreatUpdateBody({
        entries: [{ threat: 100, victim: ME }],
        unit: guid,
      }),
    );
  const units = () => rig.handle.state().tables.map((row) => row.unit);
  return { rig, units };
}

describe("threat runtime", () => {
  test("a unit that leaves view loses its table", () => {
    const { rig, units } = engaged();
    try {
      rig.events.entity.emit({ guid: UNIT, type: "disappear" });
      expect(units()).toEqual([OTHER]);
    } finally {
      rig.dispose();
    }
  });

  test("a unit at 0 health loses its table, a living or unread one keeps it", () => {
    const { rig, units } = engaged();
    try {
      rig.events.entity.emit({
        changed: ["health"],
        entity: unit(UNIT, 40),
        type: "update",
      });
      rig.events.entity.emit({
        changed: ["target"],
        entity: unit(OTHER, 0, 0),
        type: "update",
      });
      expect(units()).toEqual([UNIT, OTHER]);
      rig.events.entity.emit({
        changed: ["health"],
        entity: unit(UNIT, 0),
        type: "update",
      });
      expect(units()).toEqual([OTHER]);
    } finally {
      rig.dispose();
    }
  });

  test("a far teleport drops every table", () => {
    const { rig, units } = engaged();
    try {
      rig.inject(GameOpcode.SMSG_NEW_WORLD, new Uint8Array(20));
      expect(units()).toEqual([]);
    } finally {
      rig.dispose();
    }
  });
});
