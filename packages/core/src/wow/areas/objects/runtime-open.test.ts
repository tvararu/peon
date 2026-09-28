import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { objectsGameObjectQueryResponseBody } from "#test-support/areas/objects";
import { dbcFiles, packDbc } from "#test-support/dbc";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import { EntityStore } from "#test-support/internals";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PLAYER_FIELDS } from "#wow/protocol/update-fields";
import type { SessionDeps } from "#wow/session-stores";
import type { SpellCatalog, SpellDefinition } from "#wow/spell-catalog";

const CHEST = 0xf1_10_2c_14_00_00_52_80n;
const SELF = 0x50_00_00_00_00_00_00_01n;
const ENTRY = 161_557;
const SKILL_BASE = PLAYER_FIELDS.SKILL_INFO.offset;

function openSpell(id: number, miscValue: number): SpellDefinition {
  return {
    id,
    name: `spell ${id}`,
    rank: "",
    maxLevel: 0,
    power: {
      type: 0,
      costRaw: 0,
      costPerLevel: 0,
      costPerSecond: 0,
      costPerSecondPerLevel: 0,
      costPercentageOfBaseMana: 0,
    },
    castTime: undefined,
    range: undefined,
    duration: undefined,
    cooldown: {
      recoveryTimeMs: 0,
      category: 0,
      categoryRecoveryTimeMs: 0,
      startRecoveryTimeMs: 0,
    },
    attributes: { raw: 0, ex: 0, ex2: 0 },
    targets: { targets: 0, creatureType: 0, stances: 0, requiresSpellFocus: 0 },
    interruptFlags: 0,
    equippedItem: { itemClass: 0, subclassMask: 0 },
    reagents: [],
    effects: [
      {
        effect: 33,
        realPointsPerLevel: 0,
        basePoints: 99,
        implicitTargetA: 0,
        implicitTargetB: 0,
        applyAura: 0,
        amplitude: 0,
        miscValue,
        radius: undefined,
      },
    ],
    auraRequirements: {
      casterAuraState: 0,
      targetAuraState: 0,
      casterAuraStateNot: 0,
      targetAuraStateNot: 0,
      casterAuraSpell: 0,
      targetAuraSpell: 0,
      excludeCasterAuraSpell: 0,
      excludeTargetAuraSpell: 0,
    },
  };
}

function lockRow(cells: Record<number, number>): number[] {
  const row = new Array<number>(33).fill(0);
  for (const [key, value] of Object.entries(cells)) row[Number(key)] = value;
  return row;
}

function rigWith(skillValue: number, lockSkill: number) {
  const world = new EntityStore();
  world.create(CHEST, ObjectType.GAMEOBJECT, { entry: ENTRY } as never);
  world.create(SELF, ObjectType.PLAYER, {
    rawFields: new Map<number, number>([
      [SKILL_BASE, 184],
      [SKILL_BASE + 1, skillValue | (75 << 16)],
      [SKILL_BASE + 2, 0],
    ]),
  } as never);
  const getEntity: SessionDeps["getEntity"] = (guid) => world.get(guid);
  const spell = openSpell(6478, 13);
  const catalog = { get: (id: number) => (id === 6478 ? spell : undefined) };
  const dbc = dbcFiles(
    new Map([
      [
        "Lock.dbc",
        packDbc(33, [lockRow({ 0: 43, 2: 2, 10: 13, 18: lockSkill })]),
      ],
    ]),
  );
  const rig = areaRig("objects", {
    dbc,
    getEntity,
    selfGuid: SELF,
  });
  rig.stores.combat.setCatalog(catalog as unknown as SpellCatalog);
  rig.stores.combat.applyInitialSpells({
    spells: [{ spellId: 6478 }],
    cooldowns: [],
  });
  return rig;
}

describe("objects runtime open lock", () => {
  test("open sends CMSG_CAST_SPELL with an object target and emits used cast", async () => {
    const rig = rigWith(300, 0);
    try {
      const events: unknown[] = [];
      rig.stores.areas.objects.onEvent((event) => events.push(event));
      const outcome = await rig.handle.act.open(CHEST, 6478);
      expect(outcome).toEqual({ ok: true });
      expect(
        rig.sent
          .filter((p) => p.opcode === GameOpcode.CMSG_CAST_SPELL)
          .map((p) => [...p.body]),
      ).toEqual([
        [
          0x00, 0x4e, 0x19, 0x00, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0xf3,
          0x80, 0x52, 0x14, 0x2c, 0x10, 0xf1,
        ],
      ]);
      expect(events).toContainEqual({
        entry: ENTRY,
        guid: CHEST,
        how: "cast",
        spellId: 6478,
        type: "used",
      });
    } finally {
      rig.dispose();
    }
  });

  test("open of an unknown object sends nothing", async () => {
    const rig = rigWith(300, 0);
    try {
      const outcome = await rig.handle.act.open(
        0xf1_10_99_99_00_00_00_01n,
        6478,
      );
      expect(outcome).toEqual({ ok: false, reason: "unknown" });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("openLockSpell reads the lock from the chest template", async () => {
    const rig = rigWith(300, 0);
    try {
      await rig.stores.areas.objects.waitLocks();
      rig.inject(
        GameOpcode.SMSG_GAMEOBJECT_QUERY_RESPONSE,
        objectsGameObjectQueryResponseBody({
          data: [43],
          displayId: 100,
          entry: ENTRY,
          name: "Chest",
          type: 3,
        }),
      );
      expect(await rig.handle.act.openLockSpell(ENTRY)).toEqual({
        by: "spell",
        spellId: 6478,
      });
    } finally {
      rig.dispose();
    }
  });

  test("openLockSpell without a template queries the entry and resolves on reply", async () => {
    const rig = rigWith(300, 0);
    try {
      await rig.stores.areas.objects.waitLocks();
      const pending = rig.handle.act.openLockSpell(ENTRY);
      await Promise.resolve();
      await Promise.resolve();
      expect(
        rig.sent
          .filter((p) => p.opcode === GameOpcode.CMSG_GAMEOBJECT_QUERY)
          .map((p) => [...p.body]),
      ).toEqual([
        [
          0x15, 0x77, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
          0x00,
        ],
      ]);
      rig.inject(
        GameOpcode.SMSG_GAMEOBJECT_QUERY_RESPONSE,
        objectsGameObjectQueryResponseBody({
          data: [43],
          displayId: 100,
          entry: ENTRY,
          name: "Chest",
          type: 3,
        }),
      );
      expect(await pending).toEqual({ by: "spell", spellId: 6478 });
    } finally {
      rig.dispose();
    }
  });

  test("openLockSpell without a template reply reports no_lock_data", async () => {
    await withFakeTimers(async () => {
      const rig = rigWith(300, 0);
      try {
        await rig.stores.areas.objects.waitLocks();
        const pending = rig.handle.act.openLockSpell(ENTRY);
        await elapse(6000);
        await expect(pending).resolves.toEqual({
          need: 0,
          ok: false,
          reason: "no_lock_data",
          skill: 0,
        });
      } finally {
        rig.dispose();
      }
    });
  });
});
