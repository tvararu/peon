import { describe, expect, test } from "bun:test";
import { inflateSync } from "node:zlib";
import {
  accountRequestAccountDataBody,
  accountUpdateAccountDataBodyWire,
  accountUpdateAccountDataCompleteBody,
} from "#test-support/areas/account";
import {
  buildRequestAccountData,
  buildTutorialFlag,
  buildUpdateAccountData,
  parseAccountDataTimesMask,
  parseUpdateAccountData,
  parseUpdateAccountDataComplete,
} from "#wow/areas/account/protocol";
import { PacketReader } from "#wow/protocol/packet";

describe("SMSG_UPDATE_ACCOUNT_DATA (Handlers/MiscHandler.cpp:885-892)", () => {
  test("parses guid, type, time and the inflated text", () => {
    const body = accountUpdateAccountDataBodyWire({
      guid: 0x0b_00n,
      text: "peon ✓ ünï",
      time: 1_790_000_100,
      type: 7,
    });
    const parsed = parseUpdateAccountData(new PacketReader(body));
    expect(parsed.guid).toBe(0x0b_00n);
    expect(parsed.type).toBe(7);
    expect(parsed.time).toBe(1_790_000_100);
    expect(parsed.text).toBe("peon ✓ ünï");
  });

  test("size 0 returns empty text and ignores the tail", () => {
    const body = accountUpdateAccountDataBodyWire({
      guid: 0n,
      text: "",
      time: 9,
      type: 2,
    });
    expect(body).toHaveLength(8 + 4 + 4 + 4 + 13);
    expect(parseUpdateAccountData(new PacketReader(body)).text).toBe("");
  });

  test("a size that does not match the inflated text throws", () => {
    const good = accountUpdateAccountDataBodyWire({
      guid: 0n,
      text: "peon",
      time: 9,
      type: 7,
    });
    const bad = new Uint8Array(good);
    new DataView(bad.buffer).setUint32(8 + 4 + 4, 5, true);
    expect(() => parseUpdateAccountData(new PacketReader(bad))).toThrow(
      "size mismatch",
    );
  });
});

describe("CMSG_UPDATE_ACCOUNT_DATA (Handlers/MiscHandler.cpp:810-861)", () => {
  test("builds the size and a zlib stream that inflates back to the text", () => {
    const body = buildUpdateAccountData({
      text: "peon",
      time: 1_790_000_100,
      type: 7,
    });
    const r = new PacketReader(body);
    expect(r.uint32LE()).toBe(7);
    expect(r.uint32LE()).toBe(1_790_000_100);
    expect(r.uint32LE()).toBe(4);
    expect(inflateSync(r.bytes(r.remaining)).toString("utf8")).toBe("peon");
  });

  test("empty text writes size 0 and no bytes", () => {
    expect(buildUpdateAccountData({ text: "", time: 9, type: 7 })).toHaveLength(
      12,
    );
  });

  test("text over 0xFFFF bytes or holding a NUL throws", () => {
    expect(() =>
      buildUpdateAccountData({ text: "a".repeat(0x1_00_00), time: 1, type: 0 }),
    ).toThrow("0xFFFF");
    expect(() =>
      buildUpdateAccountData({ text: "pe\0on", time: 1, type: 0 }),
    ).toThrow("NUL");
  });
});

describe("CMSG_REQUEST_ACCOUNT_DATA (Handlers/MiscHandler.cpp:863-872)", () => {
  test("builds a u32 type; types outside 0-7 throw", () => {
    expect(buildRequestAccountData(7)).toEqual(
      accountRequestAccountDataBody(7),
    );
    expect(() => buildRequestAccountData(8)).toThrow("0-7");
  });
});

describe("SMSG_UPDATE_ACCOUNT_DATA_COMPLETE (Handlers/MiscHandler.cpp:824-827)", () => {
  test("parses the type and skips the zero word", () => {
    const body = accountUpdateAccountDataCompleteBody({ type: 7 });
    expect(parseUpdateAccountDataComplete(new PacketReader(body))).toEqual({
      type: 7,
    });
  });
});

describe("SMSG_ACCOUNT_DATA_TIMES mask (Server/WorldSession.h)", () => {
  test("reads the mask word without consuming the times", () => {
    const r = new PacketReader(
      new Uint8Array([5, 0, 0, 0, 1, 0x15, 0, 0, 0, 0, 0, 0, 2, 4, 0, 0, 1]),
    );
    expect(parseAccountDataTimesMask(r)).toBe(0x15);
    expect(r.remaining).toBeGreaterThan(0);
  });
});

describe("CMSG_TUTORIAL_FLAG (Handlers/CharacterHandler.cpp:1305-1319)", () => {
  test("builds a u32 bit number; bits outside 0-255 throw", () => {
    expect(buildTutorialFlag(3)).toEqual(new Uint8Array([3, 0, 0, 0]));
    expect(buildTutorialFlag(255)).toEqual(new Uint8Array([255, 0, 0, 0]));
    expect(() => buildTutorialFlag(256)).toThrow("0-255");
    expect(() => buildTutorialFlag(-1)).toThrow("0-255");
    expect(() => buildTutorialFlag(1.5)).toThrow("0-255");
  });
});
