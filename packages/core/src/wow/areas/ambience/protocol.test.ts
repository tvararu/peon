import { describe, expect, test } from "bun:test";
import {
  ambienceOverrideLightBody,
  ambiencePlayMusicBody,
  ambiencePlayObjectSoundBody,
  ambiencePlaySoundBody,
  ambienceSetPhaseShiftBody,
  ambienceTriggerCinematicBody,
  ambienceTriggerMovieBody,
  ambienceUpdateWorldStateBody,
  ambienceWeatherBody,
} from "#test-support/areas/ambience";
import {
  buildCompleteCinematic,
  buildNextCinematicCamera,
  buildZoneUpdate,
  parseOverrideLight,
  parsePlayMusic,
  parsePlayObjectSound,
  parsePlaySound,
  parseSetPhaseShift,
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

  test("parsePlaySound and parsePlayMusic read one uint32 sound kit id (MiscPackets.cpp:48-68)", () => {
    const sound = new PacketReader(ambiencePlaySoundBody(3337));
    expect(parsePlaySound(sound)).toEqual({ soundKitId: 3337 });
    expect(sound.remaining).toBe(0);
    const music = new PacketReader(ambiencePlayMusicBody(6077));
    expect(parsePlayMusic(music)).toEqual({ soundKitId: 6077 });
    expect(music.remaining).toBe(0);
  });

  test("parsePlayObjectSound reads a full 8-byte guid, not a packed one (MiscPackets.cpp:55-61)", () => {
    const source = 0xf130_0000_1234_0001n;
    const body = ambiencePlayObjectSoundBody({ soundKitId: 7, source });
    expect(body.length).toBe(12);
    const reader = new PacketReader(body);
    expect(parsePlayObjectSound(reader)).toEqual({ soundKitId: 7, source });
    expect(reader.remaining).toBe(0);
  });

  test("parseOverrideLight reads three uint32 and keeps the fade in milliseconds (Map.cpp:3331-3340)", () => {
    const reader = new PacketReader(
      ambienceOverrideLightBody({
        defaultId: 12,
        fadeMs: 5000,
        overrideId: 1942,
      }),
    );
    expect(parseOverrideLight(reader)).toEqual({
      defaultId: 12,
      fadeMs: 5000,
      overrideId: 1942,
    });
    expect(reader.remaining).toBe(0);
  });

  test("parseSetPhaseShift keeps a mask above the int32 range unsigned (MiscHandler.cpp:1632-1637)", () => {
    const reader = new PacketReader(ambienceSetPhaseShiftBody(0xff_ff_ff_ff));
    expect(parseSetPhaseShift(reader)).toEqual({ mask: 0xff_ff_ff_ff });
    expect(reader.remaining).toBe(0);
  });
});
