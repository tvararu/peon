import { describe, expect, test } from "bun:test";
import { petView } from "#wow/areas/pets/view";
import type { Entity } from "#wow/entity-store";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";

const ME = 0x2an;
const PET = 0xf1_40_00_0c_9f_00_01_e6n;

function unit(guid: bigint, fields: [number, number][]): Entity {
  return { guid, rawFields: new Map(fields) } as unknown as Entity;
}

function lookup(...entities: Entity[]) {
  return (guid: bigint) => entities.find((entity) => entity.guid === guid);
}

const OWNER = unit(ME, [
  [UNIT_FIELDS.SUMMON.offset, 0x9f_00_01_e6],
  [UNIT_FIELDS.SUMMON.offset + 1, 0xf1_40_00_0c],
]);

describe("petView", () => {
  test("joins the summon, pet number, name timestamp, rename and abandon bits and happiness", () => {
    const pet = unit(PET, [
      [UNIT_FIELDS.PETNUMBER.offset, 42],
      [UNIT_FIELDS.PET_NAME_TIMESTAMP.offset, 1_790_000_000],
      [UNIT_FIELDS.BYTES_2.offset, 0x00_03_00_01],
      [UNIT_FIELDS.POWER5.offset, 825_000],
    ]);
    expect(petView(lookup(OWNER, pet), ME)).toEqual({
      canAbandon: true,
      canRename: true,
      guid: PET,
      happiness: 825_000,
      nameTimestamp: 1_790_000_000,
      number: 42,
    });
  });

  test("reads each bit of byte 2 of UNIT_FIELD_BYTES_2 on its own (UnitDefines.h:152-153)", () => {
    const abandonOnly = unit(PET, [
      [UNIT_FIELDS.BYTES_2.offset, 0x00_02_00_00],
    ]);
    expect(petView(lookup(OWNER, abandonOnly), ME)).toMatchObject({
      canAbandon: true,
      canRename: false,
    });
    const neither = unit(PET, [[UNIT_FIELDS.BYTES_2.offset, 0x01_00_03_03]]);
    expect(petView(lookup(OWNER, neither), ME)).toMatchObject({
      canAbandon: false,
      canRename: false,
      happiness: 0,
      nameTimestamp: 0,
      number: 0,
    });
  });

  test("no summon, no owner, or an unseen pet gives no view", () => {
    expect(petView(lookup(unit(ME, [])), ME)).toBeUndefined();
    expect(petView(lookup(), ME)).toBeUndefined();
    expect(petView(lookup(OWNER), ME)).toBeUndefined();
  });
});
