import { describe, expect, test } from "bun:test";
import {
  timeLoginSetTimeSpeedBody,
  timeQueryResponseBody,
} from "#test-support/areas/time";
import {
  parseLoginSetTimeSpeed,
  parseTimeQueryResponse,
} from "#wow/areas/time/protocol";
import { PacketReader } from "#wow/protocol/packet";

const NOON = { year: 2026, month: 9, day: 28, weekday: 1, hour: 12, minute: 0 };
const SPEED = Math.fround(0.016_666_67);

describe("time parsers", () => {
  test("SMSG_LOGIN_SETTIMESPEED reads packed time and speed (Player.cpp:11803)", () => {
    const body = timeLoginSetTimeSpeedBody({ gameTime: NOON, speed: SPEED });
    expect(parseLoginSetTimeSpeed(new PacketReader(body))).toEqual({
      gameTime: NOON,
      speed: SPEED,
    });
  });

  test("SMSG_QUERY_TIME_RESPONSE reads server time and the daily reset (QueryPackets.cpp:47)", () => {
    const body = timeQueryResponseBody({
      serverTime: 1_790_000_000,
      dailyResetInSec: 3600,
    });
    expect(parseTimeQueryResponse(new PacketReader(body))).toEqual({
      serverTime: 1_790_000_000,
      dailyResetInSec: 3600,
    });
  });

  test("a short body throws", () => {
    const speed = timeLoginSetTimeSpeedBody({ gameTime: NOON, speed: SPEED });
    const reply = timeQueryResponseBody({ serverTime: 1, dailyResetInSec: 2 });
    expect(() =>
      parseLoginSetTimeSpeed(new PacketReader(speed.subarray(0, 8))),
    ).toThrow();
    expect(() =>
      parseTimeQueryResponse(new PacketReader(reply.subarray(0, 4))),
    ).toThrow();
  });
});
