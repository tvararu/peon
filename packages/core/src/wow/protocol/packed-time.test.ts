import { describe, expect, test } from "bun:test";
import {
  packPackedTime,
  parsePackedTime,
  readPackedTime,
  writePackedTime,
} from "#wow/protocol/packed-time";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";

type Tm = {
  tm_year: number;
  tm_mon: number;
  tm_mday: number;
  tm_wday: number;
  tm_hour: number;
  tm_min: number;
};

function appendPackedTime(lt: Tm): number {
  return (
    (((lt.tm_year - 100) << 24) |
      (lt.tm_mon << 20) |
      ((lt.tm_mday - 1) << 14) |
      (lt.tm_wday << 11) |
      (lt.tm_hour << 6) |
      lt.tm_min) >>>
    0
  );
}

const SUNDAY_EVENING = {
  tm_year: 126,
  tm_mon: 8,
  tm_mday: 27,
  tm_wday: 0,
  tm_hour: 21,
  tm_min: 45,
};

const NEW_YEARS_EVE = {
  tm_year: 255,
  tm_mon: 11,
  tm_mday: 31,
  tm_wday: 6,
  tm_hour: 23,
  tm_min: 59,
};

describe("packed time (ByteBuffer.cpp:137-141)", () => {
  test("parses the AzerothCore layout with a 1-based month and day", () => {
    expect(parsePackedTime(appendPackedTime(SUNDAY_EVENING))).toEqual({
      year: 2026,
      month: 9,
      day: 27,
      weekday: 0,
      hour: 21,
      minute: 45,
    });
  });

  test("keeps the top byte unsigned", () => {
    expect(parsePackedTime(appendPackedTime(NEW_YEARS_EVE))).toEqual({
      year: 2155,
      month: 12,
      day: 31,
      weekday: 6,
      hour: 23,
      minute: 59,
    });
  });

  test("reads the packed uint32 from a packet", () => {
    const w = new PacketWriter();
    w.uint32LE(appendPackedTime(SUNDAY_EVENING));
    w.uint32LE(7);
    const reader = new PacketReader(w.finish());
    expect(readPackedTime(reader)).toEqual(
      parsePackedTime(appendPackedTime(SUNDAY_EVENING)),
    );
    expect(reader.uint32LE()).toBe(7);
  });
});

describe("packed-time writer (ByteBuffer.cpp:95-107,137-141)", () => {
  test("packs September 2026 and parses back to the same object", () => {
    const time = {
      year: 2026,
      month: 9,
      day: 27,
      weekday: 0,
      hour: 20,
      minute: 5,
    };
    expect(parsePackedTime(packPackedTime(time))).toEqual(time);
  });

  test("replays the live probe1 value 0x1a906bcf", () => {
    expect(
      packPackedTime({
        year: 2026,
        month: 10,
        day: 2,
        weekday: 5,
        hour: 15,
        minute: 15,
      }),
    ).toBe(0x1a_90_6b_cf);
  });

  test("accepts year 2031 and rejects 2032 and 1999", () => {
    const base = {
      year: 2025,
      month: 1,
      day: 1,
      weekday: 3,
      hour: 0,
      minute: 0,
    };
    expect(parsePackedTime(packPackedTime({ ...base, year: 2031 }))).toEqual({
      ...base,
      year: 2031,
    });
    expect(() => packPackedTime({ ...base, year: 2032 })).toThrow();
    expect(() => packPackedTime({ ...base, year: 1999 })).toThrow();
  });

  test("rejects month 0 and 13", () => {
    const base = {
      year: 2026,
      month: 7,
      day: 1,
      weekday: 3,
      hour: 0,
      minute: 0,
    };
    expect(() => packPackedTime({ ...base, month: 0 })).toThrow();
    expect(() => packPackedTime({ ...base, month: 13 })).toThrow();
  });

  test("rejects out-of-range day, weekday, hour and minute", () => {
    const base = {
      year: 2026,
      month: 10,
      day: 2,
      weekday: 5,
      hour: 15,
      minute: 15,
    };
    expect(() => packPackedTime({ ...base, day: 0 })).toThrow();
    expect(() => packPackedTime({ ...base, day: 32 })).toThrow();
    expect(() => packPackedTime({ ...base, weekday: 7 })).toThrow();
    expect(() => packPackedTime({ ...base, hour: 24 })).toThrow();
    expect(() => packPackedTime({ ...base, minute: 60 })).toThrow();
  });

  test("writePackedTime writes the packed value as one u32", () => {
    const time = {
      year: 2026,
      month: 10,
      day: 2,
      weekday: 5,
      hour: 15,
      minute: 15,
    };
    const w = new PacketWriter();
    writePackedTime(w, time);
    const reader = new PacketReader(w.finish());
    expect(reader.uint32LE()).toBe(0x1a_90_6b_cf);
    expect(readPackedTime(new PacketReader(w.finish()))).toEqual(time);
  });
});
