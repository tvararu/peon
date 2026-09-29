import { describe, expect, test } from "bun:test";
import { objectFields } from "#wow/areas/objects/fields";
import { GAMEOBJECT_FIELDS } from "#wow/protocol/update-fields";

describe("objectFields", () => {
  test("reads the creator and the split dynamic field from the raw fields (GameObject.cpp:2843-2844)", () => {
    const rawFields = new Map([
      [GAMEOBJECT_FIELDS.CREATED_BY.offset, 0x2a],
      [GAMEOBJECT_FIELDS.CREATED_BY.offset + 1, 0],
      [GAMEOBJECT_FIELDS.DYNAMIC.offset, 0x80_00_00_01],
    ]);
    expect(objectFields({ rawFields })).toEqual({
      createdBy: 0x2an,
      dynFlags: 1,
      pathProgress: -32_768,
    });
  });

  test("an object with no creator or dynamic field reads as none and zero", () => {
    expect(objectFields({ rawFields: new Map() })).toEqual({
      createdBy: undefined,
      dynFlags: 0,
      pathProgress: 0,
    });
  });
});
