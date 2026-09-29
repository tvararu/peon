import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { objectsGameObjectQueryResponseBody } from "#test-support/areas/objects";
import { dbcFiles, packDbc } from "#test-support/dbc";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import { EntityStore } from "#test-support/internals";
import { ObjectType } from "#wow/protocol/entity-fields";
import type { ItemTemplate } from "#wow/protocol/item";
import { GameOpcode } from "#wow/protocol/opcodes";
import { OBJECT_FIELDS, PLAYER_FIELDS } from "#wow/protocol/update-fields";
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

const KEY = 0x40_00_00_00_00_00_01_23n;
const BAMBOO_CAGE_KEY = 12_301;

const cageKey: ItemTemplate = {
  entry: BAMBOO_CAGE_KEY,
  name: "Bamboo Cage Key",
  quality: 1,
  itemClass: 13,
  subclass: 0,
  stackSize: 1,
  spells: [
    {
      id: 3366,
      trigger: 0,
      charges: -1,
      cooldownMs: -1,
      category: 0,
      categoryCooldownMs: -1,
    },
  ],
  flags: 0,
  inventoryType: 0,
  allowableClass: 0xff_ff_ff_ff,
  allowableRace: 0xff_ff_ff_ff,
  itemLevel: 1,
  requiredLevel: 0,
  requiredSkill: 0,
  requiredSkillRank: 0,
  requiredSpell: 0,
  maxCount: 1,
  containerSlots: 0,
  stats: [],
  damage: [],
  armor: 0,
  resistances: { holy: 0, fire: 0, nature: 0, frost: 0, shadow: 0, arcane: 0 },
  delay: 0,
  ammoType: 0,
  bonding: 4,
  pageText: 0,
  lockId: 0,
  itemSet: 0,
  maxDurability: 0,
  bagFamily: 0,
  sockets: [],
  socketBonus: 0,
  gemProperties: 0,
  duration: 0,
  limitCategory: 0,
};

function keyRig(carried: boolean) {
  const world = new EntityStore();
  world.create(CHEST, ObjectType.GAMEOBJECT, { entry: ENTRY } as never);
  const pack = PLAYER_FIELDS.PACK_SLOT_1.offset;
  world.create(SELF, ObjectType.PLAYER, {
    rawFields: new Map<number, number>(
      carried
        ? [
            [pack, Number(KEY & 0xff_ff_ff_ffn)],
            [pack + 1, Number(KEY >> 32n)],
          ]
        : [],
    ),
  } as never);
  world.create(KEY, ObjectType.ITEM, {
    rawFields: new Map([[OBJECT_FIELDS.ENTRY.offset, BAMBOO_CAGE_KEY]]),
  } as never);
  const getEntity: SessionDeps["getEntity"] = (guid) => world.get(guid);
  const rig = areaRig("objects", { getEntity, selfGuid: SELF });
  rig.stores.items.receive({ entry: BAMBOO_CAGE_KEY, template: cageKey });
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

  test("open releases the loot request when the cast fails", async () => {
    const rig = rigWith(300, 0);
    try {
      expect(await rig.handle.act.open(CHEST, 6478)).toEqual({ ok: true });
      expect(rig.stores.rewards.loot.phase).toBe("opening");
      rig.inject(
        GameOpcode.SMSG_CAST_FAILED,
        new Uint8Array([0x00, 0x4e, 0x19, 0x00, 0x00, 0x31]),
      );
      await Promise.resolve();
      await Promise.resolve();
      expect(rig.stores.rewards.loot.phase).toBe("closed");
    } finally {
      rig.dispose();
    }
  });

  test("open keeps the loot request on another spell's cast failure", async () => {
    const rig = rigWith(300, 0);
    try {
      await rig.handle.act.open(CHEST, 6478);
      rig.inject(
        GameOpcode.SMSG_CAST_FAILED,
        new Uint8Array([0x00, 0x85, 0x00, 0x00, 0x00, 0x31]),
      );
      await Promise.resolve();
      await Promise.resolve();
      expect(rig.stores.rewards.loot.phase).toBe("opening");
    } finally {
      rig.dispose();
    }
  });

  test("open releases the loot request when no loot window arrives", async () => {
    await withFakeTimers(async () => {
      const rig = rigWith(300, 0);
      try {
        await rig.handle.act.open(CHEST, 6478);
        await elapse(14_000);
        expect(rig.stores.rewards.loot.phase).toBe("opening");
        await elapse(2000);
        expect(rig.stores.rewards.loot.phase).toBe("closed");
      } finally {
        rig.dispose();
      }
    });
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

  test("openLockSpell during a failed Lock.dbc load settles as no_lock_data", async () => {
    const rig = areaRig("objects", {
      dbc: dbcFiles(new Map()),
      selfGuid: SELF,
    });
    try {
      const pending = rig.handle.act.openLockSpell(ENTRY);
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
      expect(await pending).toEqual({
        need: 0,
        ok: false,
        reason: "no_lock_data",
        skill: 0,
      });
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

describe("objects runtime key use (Handlers/SpellHandler.cpp:58-193, Entities/Player/Player.cpp:7623-7650)", () => {
  test("useItemOn sends CMSG_USE_ITEM with the carried key, its use spell and the object target", async () => {
    const rig = keyRig(true);
    try {
      const events: unknown[] = [];
      rig.stores.areas.objects.onEvent((event) => events.push(event));
      expect(await rig.handle.act.useItemOn(BAMBOO_CAGE_KEY, CHEST)).toEqual({
        ok: true,
      });
      expect(
        rig.sent
          .filter((p) => p.opcode === GameOpcode.CMSG_USE_ITEM)
          .map((p) => [...p.body]),
      ).toEqual([
        [
          0xff, 0x17, 0x00, 0x26, 0x0d, 0x00, 0x00, 0x23, 0x01, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08,
          0x00, 0x00, 0xf3, 0x80, 0x52, 0x14, 0x2c, 0x10, 0xf1,
        ],
      ]);
      expect(rig.stores.rewards.loot.phase).toBe("opening");
      expect(events).toContainEqual({
        entry: ENTRY,
        guid: CHEST,
        how: "cast",
        spellId: 3366,
        type: "used",
      });
    } finally {
      rig.dispose();
    }
  });

  test("useItemOn without the key in the bags sends nothing", async () => {
    const rig = keyRig(false);
    try {
      expect(await rig.handle.act.useItemOn(BAMBOO_CAGE_KEY, CHEST)).toEqual({
        ok: false,
        reason: "no_item",
      });
      expect(rig.sent).toEqual([]);
      expect(rig.stores.rewards.loot.phase).toBe("closed");
    } finally {
      rig.dispose();
    }
  });
});
