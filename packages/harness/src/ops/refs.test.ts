import { describe, expect, test } from "bun:test";
import {
  createRefTable,
  guidHex,
  isUnitEntity,
  parseRef,
} from "#harness/ops/refs";
import { gameObject, unitEntity } from "#test-support/world-fixtures";

describe("guidHex", () => {
  test("writes lowercase hex without a prefix", () => {
    expect(guidHex(0x1fn)).toBe("1f");
    expect(guidHex(0xf130_0000_0000_12abn)).toBe("f1300000000012ab");
  });
});

describe("parseRef", () => {
  test("reads u<n> and o<n>", () => {
    expect(parseRef("u12")).toBe(12);
    expect(parseRef("o12")).toBe(12);
    expect(parseRef(" o3 ")).toBe(3);
  });

  test("gives undefined for anything else", () => {
    expect(parseRef("u0")).toBeUndefined();
    expect(parseRef("o0")).toBeUndefined();
    expect(parseRef("12")).toBeUndefined();
    expect(parseRef("u4x")).toBeUndefined();
    expect(parseRef("x1")).toBeUndefined();
    expect(parseRef("Springpaw Stalker")).toBeUndefined();
  });
});

describe("createRefTable", () => {
  test("gives refs in first-seen order and keeps them", () => {
    const refs = createRefTable();
    expect(refs.refOf(0x50n)).toBe("u1");
    expect(refs.refOf(0x60n)).toBe("u2");
    expect(refs.refOf(0x50n)).toBe("u1");
    expect(refs.size()).toBe(2);
  });

  test("maps a ref back to its guid", () => {
    const refs = createRefTable();
    refs.refOf(0x50n);
    expect(refs.guidOf("u1")).toBe(0x50n);
    expect(refs.guidOf(" u1 ")).toBe(0x50n);
    expect(refs.guidOf("u9")).toBeUndefined();
  });

  test("never reuses a ref", () => {
    const refs = createRefTable();
    for (let guid = 1n; guid <= 30n; guid += 1n) refs.refOf(guid);
    expect(refs.refOf(31n)).toBe("u31");
    expect(
      new Set(Array.from({ length: 31 }, (_, i) => refs.refOf(BigInt(i + 1))))
        .size,
    ).toBe(31);
  });
});

describe("createRefTable with o<n>", () => {
  test("numbers objects separately from units", () => {
    const refs = createRefTable();
    expect(refs.refOf(0x50n)).toBe("u1");
    expect(refs.refOf(0xf110_0000_0000_0070n)).toBe("o1");
    expect(refs.refOf(0x60n)).toBe("u2");
    expect(refs.refOf(0xf110_0000_0000_0070n)).toBe("o1");
    expect(refs.guidOf("o1")).toBe(0xf110_0000_0000_0070n);
  });
});

describe("isUnitEntity", () => {
  test("accepts creatures and players, not game objects", () => {
    expect(isUnitEntity(unitEntity())).toBe(true);
    expect(isUnitEntity(unitEntity({ player: true }))).toBe(true);
    expect(isUnitEntity(gameObject(0x70n, "Signpost"))).toBe(false);
    expect(isUnitEntity(undefined)).toBe(false);
  });
});
