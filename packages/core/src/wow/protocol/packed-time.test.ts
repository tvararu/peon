import { describe, expect, test } from "bun:test";
import { parsePackedTime, readPackedTime } from "#wow/protocol/packed-time";
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
