import { describe, expect, test } from "bun:test";
import {
  ambienceUpdateWorldStateBody,
  ambienceWeatherBody,
} from "#test-support/areas/ambience";
import {
  buildZoneUpdate,
  parseUpdateWorldState,
  parseWeather,
} from "#wow/areas/ambience/protocol";
import { PacketReader } from "#wow/protocol/packet";

describe("ambience protocol", () => {
  test("parseUpdateWorldState reads the id and a negative value as int32 (WorldStatePackets.cpp:40-46)", () => {
    const reader = new PacketReader(
      ambienceUpdateWorldStateBody({ id: 3191, value: -5 }),
    );
    expect(parseUpdateWorldState(reader)).toEqual({ id: 3191, value: -5 });
    expect(reader.remaining).toBe(0);
  });

  test("parseWeather keeps AzerothCore state 106 and a fractional intensity (MiscPackets.cpp:25-32)", () => {
    const reader = new PacketReader(
      ambienceWeatherBody({ abrupt: true, intensity: 0.37, state: 106 }),
    );
    expect(parseWeather(reader)).toEqual({
      abrupt: true,
      intensity: Math.fround(0.37),
      state: 106,
    });
    expect(reader.remaining).toBe(0);
  });

  test("buildZoneUpdate writes the uint32 zone id that MiscHandler.cpp:523-524 reads", () => {
    expect([...buildZoneUpdate(3430)]).toEqual([0x66, 0x0d, 0x00, 0x00]);
  });
});
