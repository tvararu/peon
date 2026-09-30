import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { spellsSkillFields } from "#test-support/areas/spells";
import type { SpellsEvent } from "#wow/areas/spells/store";
import type { UnitEntity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";

const ME = 0x2an;
const MINING = 186;
const COOKING = 185;
const SWORDS = 43;

function player(rawFields: ReadonlyMap<number, number>): UnitEntity {
  return {
    class_: 8,
    displayId: 1,
    entry: 0,
    factionTemplate: 1,
    gender: 0,
    guid: ME,
    health: 200,
    level: 10,
    maxHealth: 200,
    maxPower: [0, 0, 0, 0, 0, 0, 0],
    name: "Mage",
    npcFlags: 0,
    objectType: ObjectType.PLAYER,
    position: undefined,
    power: [0, 0, 0, 0, 0, 0, 0],
    race: 10,
    rawFields,
    scale: 1,
    target: 0n,
    unitFlags: 0,
  };
}

function skills(ids: number[]): ReadonlyMap<number, number> {
  return spellsSkillFields(
    ids.map((id, i) => ({
      id,
      max: 75,
      perm: 0,
      step: 1,
      temp: 0,
      value: 12 + i,
    })),
  );
}

function setup() {
  let raw: ReadonlyMap<number, number> = new Map();
  const rig = areaRig("spells", {
    getEntity: (guid) => (guid === ME ? player(raw) : undefined),
    selfGuid: ME,
  });
  const seen: SpellsEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  const update = (next: ReadonlyMap<number, number>) => {
    raw = next;
    rig.events.entity.emit({
      changed: ["rawFields"],
      entity: player(next),
      type: "update",
    });
  };
  return { rig, seen, update };
}

describe("act.unlearnSkill", () => {
  test("a known primary profession sends CMSG_UNLEARN_SKILL with its id", () => {
    const { rig, update } = setup();
    try {
      update(skills([MINING]));
      expect(rig.handle.act.unlearnSkill(MINING)).toEqual({ ok: true });
      expect(rig.sent.map((p) => p.opcode)).toEqual([
        GameOpcode.CMSG_UNLEARN_SKILL,
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("an unknown primary profession refuses without sending", () => {
    const { rig, update } = setup();
    try {
      update(skills([MINING]));
      expect(rig.handle.act.unlearnSkill(171)).toEqual({
        ok: false,
        reason: "not_known",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a secondary skill or weapon refuses as not a profession and sends nothing", () => {
    const { rig, update } = setup();
    try {
      update(skills([COOKING, SWORDS]));
      expect(rig.handle.act.unlearnSkill(COOKING)).toEqual({
        ok: false,
        reason: "not_profession",
      });
      expect(rig.handle.act.unlearnSkill(SWORDS)).toEqual({
        ok: false,
        reason: "not_profession",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });
});
