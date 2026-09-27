import { describe, expect, test } from "bun:test";
import {
  MovementFlag,
  OBJECT_END,
  ObjectType,
  UNIT_END,
  UpdateFlag,
  UpdateType,
} from "#wow/protocol/entity-fields";

describe("ObjectType", () => {
  test("has correct values", () => {
    expect(ObjectType.OBJECT).toBe(0);
    expect(ObjectType.ITEM).toBe(1);
    expect(ObjectType.CONTAINER).toBe(2);
    expect(ObjectType.UNIT).toBe(3);
    expect(ObjectType.PLAYER).toBe(4);
    expect(ObjectType.GAMEOBJECT).toBe(5);
    expect(ObjectType.DYNAMICOBJECT).toBe(6);
    expect(ObjectType.CORPSE).toBe(7);
  });
});

describe("UpdateType", () => {
  test("has correct values", () => {
    expect(UpdateType.VALUES).toBe(0);
    expect(UpdateType.MOVEMENT).toBe(1);
    expect(UpdateType.CREATE_OBJECT).toBe(2);
    expect(UpdateType.CREATE_OBJECT2).toBe(3);
    expect(UpdateType.OUT_OF_RANGE).toBe(4);
    expect(UpdateType.NEAR_OBJECTS).toBe(5);
  });
});

describe("UpdateFlag", () => {
  test("has correct bitmask values", () => {
    expect(UpdateFlag.SELF).toBe(0x00_01);
    expect(UpdateFlag.LIVING).toBe(0x00_20);
    expect(UpdateFlag.HAS_POSITION).toBe(0x00_40);
    expect(UpdateFlag.ROTATION).toBe(0x02_00);
  });
});

describe("MovementFlag", () => {
  test("has correct bitmask values", () => {
    expect(MovementFlag.FORWARD).toBe(0x00_00_00_01);
    expect(MovementFlag.FALLING).toBe(0x00_00_10_00);
    expect(MovementFlag.FLYING).toBe(0x02_00_00_00);
    expect(MovementFlag.HOVER).toBe(0x40_00_00_00);
  });
});

describe("end constants", () => {
  test("OBJECT_END is 0x0006", () => {
    expect(OBJECT_END).toBe(0x00_06);
  });

  test("UNIT_END is 0x0094", () => {
    expect(UNIT_END).toBe(0x00_94);
  });
});
