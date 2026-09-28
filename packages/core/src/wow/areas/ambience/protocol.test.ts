import { describe, expect, test } from "bun:test";
import {
  ambienceTriggerCinematicBody,
  ambienceTriggerMovieBody,
  ambienceUpdateWorldStateBody,
  ambienceWeatherBody,
} from "#test-support/areas/ambience";
import {
  buildCompleteCinematic,
  buildNextCinematicCamera,
  buildZoneUpdate,
  parseTriggerCinematic,
  parseTriggerMovie,
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

  test("parseTriggerCinematic reads the uint32 sequence id (Player.cpp:5878-5883)", () => {
    const reader = new PacketReader(ambienceTriggerCinematicBody(310));
    expect(parseTriggerCinematic(reader)).toEqual({ sequenceId: 310 });
    expect(reader.remaining).toBe(0);
  });

  test("parseTriggerMovie reads the uint32 movie id (Player.cpp:5885-5890)", () => {
    const reader = new PacketReader(ambienceTriggerMovieBody(44));
    expect(parseTriggerMovie(reader)).toEqual({ movieId: 44 });
    expect(reader.remaining).toBe(0);
  });

  test("buildCompleteCinematic gives an empty body (MiscHandler.cpp:940-943)", () => {
    expect(buildCompleteCinematic()).toEqual(new Uint8Array(0));
  });

  test("buildNextCinematicCamera gives an empty body (MiscHandler.cpp:946-950)", () => {
    expect(buildNextCinematicCamera()).toEqual(new Uint8Array(0));
  });
});
