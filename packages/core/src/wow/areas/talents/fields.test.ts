import { describe, expect, test } from "bun:test";
import { talentFields } from "#wow/areas/talents/fields";
import type { Entity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";

const ME = 0x2an;

function self(fields: Record<number, number>, createComplete = false): Entity {
  return {
    createComplete,
    entry: 0,
    guid: ME,
    name: undefined,
    objectType: ObjectType.PLAYER,
    position: undefined,
    rawFields: new Map(Object.entries(fields).map(([k, v]) => [Number(k), v])),
    scale: 1,
  };
}

function deps(entity: Entity | undefined) {
  return {
    getEntity: (guid: bigint) => (guid === ME ? entity : undefined),
    selfGuid: () => ME,
  };
}

describe("talentFields", () => {
  test("reads points, glyph slot types, glyphs and the enabled mask (UpdateFields.h:342,388-390)", () => {
    const entity = self({
      1020: 3,
      1312: 21,
      1313: 22,
      1314: 23,
      1315: 41,
      1316: 42,
      1317: 43,
      1318: 161,
      1324: 0x0b,
    });
    expect(talentFields(deps(entity))).toEqual({
      enabledMask: 0x0b,
      freePoints: 3,
      glyphs: [161, undefined, undefined, undefined, undefined, undefined],
      slotTypes: [21, 22, 23, 41, 42, 43],
    });
  });

  test("a complete entity reads a field the server never sent as 0", () => {
    expect(talentFields(deps(self({ 1020: 1 }, true)))).toEqual({
      enabledMask: 0,
      freePoints: 1,
      glyphs: [0, 0, 0, 0, 0, 0],
      slotTypes: [0, 0, 0, 0, 0, 0],
    });
  });

  test("a missing self entity gives undefined fields, never zeros", () => {
    const none = new Array(6).fill(undefined);
    expect(talentFields(deps(undefined))).toEqual({
      enabledMask: undefined,
      freePoints: undefined,
      glyphs: none,
      slotTypes: none,
    });
  });
});
