import { describe, expect, test } from "bun:test";
import { deflateSync } from "node:zlib";
import {
  ACCOUNT_DATA_MAX_BYTES,
  deflateAccountData,
  inflateAccountData,
} from "#wow/protocol/account-data-zlib";

describe("account data zlib", () => {
  test("deflate then inflate returns the text, multibyte included", () => {
    const text = "SET uiScale 0.9 ✓ ünï";
    const packed = deflateAccountData(text);
    expect(packed.size).toBe(new TextEncoder().encode(text).byteLength);
    expect(inflateAccountData(packed.bytes, packed.size)).toBe(text);
  });

  test("empty text packs to size 0 and no bytes; size 0 inflates to empty text whatever the tail", () => {
    expect(deflateAccountData("")).toEqual({
      size: 0,
      bytes: new Uint8Array(),
    });
    expect(inflateAccountData(new Uint8Array(13), 0)).toBe("");
  });

  test("a size that does not match the inflated length throws", () => {
    const bytes = new Uint8Array(deflateSync(new TextEncoder().encode("peon")));
    expect(() => inflateAccountData(bytes, 5)).toThrow("size mismatch");
  });

  test("text over 0xFFFF bytes or holding a NUL throws; exactly 0xFFFF packs", () => {
    expect(() =>
      deflateAccountData("a".repeat(ACCOUNT_DATA_MAX_BYTES + 1)),
    ).toThrow("0xFFFF");
    expect(() => deflateAccountData("pe\0on")).toThrow("NUL");
    const packed = deflateAccountData("a".repeat(ACCOUNT_DATA_MAX_BYTES));
    expect(packed.size).toBe(ACCOUNT_DATA_MAX_BYTES);
  });
});
