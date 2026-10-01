import { areaRig } from "#test-support/area-rig";
import { itemsTemplate } from "#test-support/areas/items";
import {
  talentsCatalogFiles,
  talentsTalentsInfoBody,
} from "#test-support/areas/talents";
import { dbcFiles } from "#test-support/dbc";
import { EntityStore } from "#test-support/internals";
import type { DbcSource } from "#wow/dbc";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";
import {
  CONTAINER_FIELDS,
  ITEM_FIELDS,
  OBJECT_FIELDS,
  PLAYER_FIELDS,
} from "#wow/protocol/update-fields";
import type { SpellCatalog } from "#wow/spell-catalog";

export const SELF = 0x50_00_00_00_00_00_00_01n;
export const ITEM = 0x40_00_00_00_00_00_01_23n;
export const BAG = 0x40_00_00_00_00_00_02_00n;
export const GLYPH_ITEM = 43_395;
export const USE_SPELL = 58_276;
export const APPLY_GLYPH = 74;
export const INFO = GameOpcode.SMSG_TALENTS_INFO;
export const USE = GameOpcode.CMSG_USE_ITEM;
export const REMOVE = GameOpcode.CMSG_REMOVE_GLYPH;
export const MAJOR_SLOT = 0;
export const MINOR_SLOT = 1;

type GlyphRigSetup = {
  enabled?: number;
  glyphIds?: readonly number[];
  glyphProperties?: number;
  catalog?: boolean;
  catalogPending?: boolean;
  placement?: "backpack" | "bag";
  useSpell?: boolean;
  spellEffect?: boolean;
  templateCached?: boolean;
};

function split(guid: bigint): [number, number] {
  return [Number(guid & 0xff_ff_ff_ffn), Number(guid >> 32n)];
}

function glyphSelfFields(setup: GlyphRigSetup) {
  const fields = new Map<number, number>([
    [PLAYER_FIELDS.GLYPH_SLOTS_1.offset + 0, 21],
    [PLAYER_FIELDS.GLYPH_SLOTS_1.offset + 1, 23],
    [PLAYER_FIELDS.GLYPHS_ENABLED.offset, setup.enabled ?? 0b11],
  ]);
  (setup.glyphIds ?? [0, 0, 0, 0, 0, 0]).forEach((id, i) => {
    fields.set(PLAYER_FIELDS.GLYPHS_1.offset + i, id);
  });
  if ((setup.placement ?? "backpack") === "backpack") {
    const [lo, hi] = split(ITEM);
    fields.set(PLAYER_FIELDS.PACK_SLOT_1.offset, lo);
    fields.set(PLAYER_FIELDS.PACK_SLOT_1.offset + 1, hi);
  } else {
    const [lo, hi] = split(BAG);
    const base = PLAYER_FIELDS.INV_SLOT_HEAD.offset + 38;
    fields.set(base, lo);
    fields.set(base + 1, hi);
  }
  return fields;
}

function glyphItemFields(contained: bigint) {
  return new Map<number, number>([
    [OBJECT_FIELDS.ENTRY.offset, GLYPH_ITEM],
    [ITEM_FIELDS.OWNER.offset, split(SELF)[0]],
    [ITEM_FIELDS.OWNER.offset + 1, split(SELF)[1]],
    [ITEM_FIELDS.CONTAINED.offset, split(contained)[0]],
    [ITEM_FIELDS.CONTAINED.offset + 1, split(contained)[1]],
    [ITEM_FIELDS.STACK_COUNT.offset, 1],
    [ITEM_FIELDS.FLAGS.offset, 0],
    [OBJECT_FIELDS.ENTRY.offset + 100, 0],
  ]);
}

function glyphBagInto(world: EntityStore) {
  const [lo, hi] = split(ITEM);
  world.create(BAG, ObjectType.CONTAINER, {
    rawFields: new Map<number, number>([
      [OBJECT_FIELDS.ENTRY.offset, 4496],
      [ITEM_FIELDS.OWNER.offset, split(SELF)[0]],
      [ITEM_FIELDS.OWNER.offset + 1, split(SELF)[1]],
      [ITEM_FIELDS.CONTAINED.offset, split(SELF)[0]],
      [ITEM_FIELDS.CONTAINED.offset + 1, split(SELF)[1]],
      [CONTAINER_FIELDS.NUM_SLOTS.offset, 4],
      [CONTAINER_FIELDS.SLOT_1.offset, lo],
      [CONTAINER_FIELDS.SLOT_1.offset + 1, hi],
    ]),
  } as never);
}

export function rigged(setup: GlyphRigSetup = {}) {
  const world = new EntityStore();
  world.create(SELF, ObjectType.PLAYER, {
    createComplete: true,
    rawFields: glyphSelfFields(setup),
  } as never);
  const placement = setup.placement ?? "backpack";
  if (placement === "bag") glyphBagInto(world);
  world.create(ITEM, ObjectType.ITEM, {
    rawFields: glyphItemFields(placement === "bag" ? BAG : SELF),
  } as never);
  let dbc: DbcSource | undefined = dbcFiles(talentsCatalogFiles());
  if (setup.catalog === false) dbc = undefined;
  if (setup.catalogPending === true)
    dbc = () => new Promise<Uint8Array>(() => {});
  const rig = areaRig("talents", {
    dbc,
    getEntity: (guid) => world.get(guid),
    selfGuid: SELF,
  });
  if (setup.templateCached !== false)
    rig.stores.items.receive({
      entry: GLYPH_ITEM,
      template: itemsTemplate({
        entry: GLYPH_ITEM,
        itemClass: 16,
        name: "Glyph of Battle",
        spells:
          setup.useSpell === false
            ? []
            : [
                {
                  category: 0,
                  categoryCooldownMs: -1,
                  charges: 0,
                  cooldownMs: -1,
                  id: USE_SPELL,
                  trigger: 0,
                },
              ],
      }),
    });
  rig.stores.combat.setCatalog({
    get: (id: number) =>
      id === USE_SPELL
        ? {
            effects:
              setup.spellEffect === false
                ? []
                : [
                    {
                      effect: APPLY_GLYPH,
                      miscValue: setup.glyphProperties ?? 21,
                    },
                  ],
            id: USE_SPELL,
          }
        : undefined,
  } as unknown as SpellCatalog);
  rig.stores.combat.applyInitialSpells({
    cooldowns: [],
    spells: [{ spellId: USE_SPELL }, { spellId: 133 }],
  });
  const sent = (opcode: number) => rig.sent.filter((p) => p.opcode === opcode);
  const useBody = () => {
    const r = new PacketReader(sent(USE)[0]?.body ?? new Uint8Array());
    const bag = r.uint8();
    const slot = r.uint8();
    const castCount = r.uint8();
    const spellId = r.uint32LE();
    const guid = r.uint64LE();
    const glyphIndex = r.uint32LE();
    return { bag, castCount, glyphIndex, guid, slot, spellId };
  };
  return { rig, sent, useBody };
}

const CAST_ID: Record<string, number> = {
  glyph_socket_locked: 177,
  invalid_glyph: 175,
  not_ready: 67,
  unique_glyph: 176,
};

export function castFailed(
  rig: ReturnType<typeof rigged>["rig"],
  spellId: number,
  reason: string,
) {
  const sent = rig.sent.find((p) => p.opcode === USE)?.body;
  const seen = new PacketReader(sent ?? new Uint8Array());
  seen.uint8();
  seen.uint8();
  const castCount = seen.uint8();
  rig.stores.combat.applyCastFailed({
    castCount,
    extra: [],
    result: CAST_ID[reason] ?? 54,
    spellId,
  });
  const snapshot = rig.stores.combat.record(undefined);
  rig.events.combat.emit({
    state: { lastOutcome: snapshot.lastOutcome },
    type: "cast_failed",
  } as never);
}
export function castStarted(
  rig: ReturnType<typeof rigged>["rig"],
  spellId: number,
  timerMs: number,
) {
  const sent = rig.sent.find((p) => p.opcode === USE)?.body;
  const seen = new PacketReader(sent ?? new Uint8Array());
  seen.uint8();
  seen.uint8();
  const castCount = seen.uint8();
  rig.stores.combat.applySpellStart({
    castCount,
    caster: SELF,
    castItem: ITEM,
    flags: 0,
    spellId,
    targets: { flags: 0, objectGuid: 0n },
    timer: timerMs,
  });
  const snapshot = rig.stores.combat.record(undefined);
  rig.events.combat.emit({
    state: { casting: snapshot.casting, lastOutcome: snapshot.lastOutcome },
    type: "cast_started",
  } as never);
}

export async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

export const infoWith = (glyphs: readonly number[]) =>
  talentsTalentsInfoBody({ freePoints: 0, specs: [{ glyphs }] });

export const APPLY = { bag: 255, glyphSlot: MAJOR_SLOT, slot: 23 };
