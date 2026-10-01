import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  spellsConvertRuneBody,
  spellsSelfRuneFields,
  spellsSpellGoBody,
} from "#test-support/areas/spells";
import type { SpellsEvent } from "#wow/areas/spells/store";
import type { UnitEntity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";

const ME = 0x2an;

function player(rawFields: ReadonlyMap<number, number>): UnitEntity {
  return {
    class_: 6,
    displayId: 1,
    entry: 0,
    factionTemplate: 1,
    gender: 0,
    guid: ME,
    health: 200,
    level: 55,
    maxHealth: 200,
    maxPower: [0, 0, 0, 0, 0, 0, 0],
    name: "Knight",
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
  const convert = (index: number, type: number) =>
    rig.inject(
      GameOpcode.SMSG_CONVERT_RUNE,
      spellsConvertRuneBody(index, type),
    );
  const go = (init: { after: number; before: number; elapsed: number[] }) =>
    rig.inject(
      GameOpcode.SMSG_SPELL_GO,
      spellsSpellGoBody({
        caster: ME,
        extraCasts: 0,
        flags: 0x00_20_00_00,
        hits: [],
        runes: init,
        spellId: 49_998,
        timestamp: 1,
      }),
    );
  return { convert, go, rig, seen, update };
}

describe("spells death knight runes", () => {
  test("rune readiness is undefined until a death knight self update arrives", () => {
    const { rig } = setup();
    try {
      expect(rig.handle.state().runes).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("parseConvertRune reads the index and the new type", () => {
    const { convert, rig, seen, update } = setup();
    try {
      update(spellsSelfRuneFields({ classId: 6 }));
      convert(2, 3);
      expect(seen).toEqual([
        { from: 1, index: 2, to: 3, type: "rune_converted" },
      ]);
      expect(rig.handle.state().runes?.at(2)?.type).toBe(3);
    } finally {
      rig.dispose();
    }
  });

  test("a self update makes the base rune layout ready", () => {
    const { rig, seen, update } = setup();
    try {
      update(spellsSelfRuneFields({ classId: 6 }));
      expect(seen).toEqual([]);
      expect(rig.handle.state().runes?.map((rune) => rune.type)).toEqual([
        0, 0, 1, 1, 2, 2,
      ]);
      expect(rig.handle.state().runes?.every((rune) => rune.ready)).toBe(true);
    } finally {
      rig.dispose();
    }
  });

  test("the spell-go peek marks spent runes on cooldown with their elapsed byte", () => {
    const { go, rig, update } = setup();
    try {
      update(spellsSelfRuneFields({ classId: 6 }));
      go({ after: 0x3e, before: 0x3f, elapsed: [255] });
      const runes = rig.handle.state().runes;
      expect(runes?.find((rune) => rune.index === 0)).toMatchObject({
        cooldown: 255,
        ready: false,
      });
      expect(runes?.find((rune) => rune.index === 5)?.ready).toBe(true);
      expect(
        rig.handle
          .state()
          .runes?.find((rune) => rune.index === 5)
          ?.regen?.toFixed(1),
      ).toBe("0.1");
    } finally {
      rig.dispose();
    }
  });

  test("each newly spent rune keeps its own elapsed byte", () => {
    const { go, rig, update } = setup();
    try {
      update(spellsSelfRuneFields({ classId: 6 }));
      go({ after: 0x2b, before: 0x3f, elapsed: [16, 48] });
      const cooldowns = rig.handle.state().runes?.map((rune) => rune.cooldown);
      expect(cooldowns).toEqual([
        undefined,
        undefined,
        16,
        undefined,
        48,
        undefined,
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("successive spell-go packets keep earlier spent bytes", () => {
    const { go, rig, update } = setup();
    try {
      update(spellsSelfRuneFields({ classId: 6 }));
      go({ after: 0x3e, before: 0x3f, elapsed: [10] });
      go({ after: 0x38, before: 0x3e, elapsed: [20, 30] });
      expect(rig.handle.state().runes?.map((rune) => rune.cooldown)).toEqual([
        10,
        20,
        30,
        undefined,
        undefined,
        undefined,
      ]);
      go({ after: 0x38, before: 0x38, elapsed: [] });
      expect(rig.handle.state().runes?.map((rune) => rune.cooldown)).toEqual([
        10,
        20,
        30,
        undefined,
        undefined,
        undefined,
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a non-death-knight never creates runes", () => {
    const { convert, rig, seen, update } = setup();
    try {
      update(new Map([[UNIT_FIELDS.BYTES_0.offset, 8 << 8]]));
      convert(2, 3);
      expect(seen).toEqual([]);
      expect(rig.handle.state().runes).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });
});
