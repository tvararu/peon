import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  ambienceInitWorldStatesBody,
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
import type { AmbienceEvent } from "#wow/areas/ambience/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketWriter } from "#wow/protocol/packet";

function newWorldBody(): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(530);
  w.floatLE(9487.7);
  w.floatLE(-6812.4);
  w.floatLE(16.5);
  w.floatLE(0);
  return w.finish();
}

function rigWithEvents() {
  const rig = areaRig("ambience");
  const seen: AmbienceEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  return { rig, seen };
}

describe("ambience area wiring", () => {
  test("SMSG_INIT_WORLD_STATES seeds the states and SMSG_UPDATE_WORLD_STATE updates one (WorldStatePackets.cpp:22-46)", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_INIT_WORLD_STATES,
        ambienceInitWorldStatesBody({
          areaId: 3430,
          mapId: 530,
          states: [
            { id: 3191, value: -5 },
            { id: 2, value: 7 },
          ],
          zoneId: 3430,
        }),
      );
      rig.inject(
        GameOpcode.SMSG_UPDATE_WORLD_STATE,
        ambienceUpdateWorldStateBody({ id: 2, value: 8 }),
      );
      expect(rig.handle.state().states).toEqual([
        { id: 2, value: 8 },
        { id: 3191, value: -5 },
      ]);
      expect(seen).toEqual([
        { id: 2, previous: 7, type: "world_state", value: 8 },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_WEATHER sets the weather (MiscPackets.cpp:25-32)", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_WEATHER,
        ambienceWeatherBody({ abrupt: false, intensity: 0.5, state: 106 }),
      );
      const weather = { abrupt: false, intensity: 0.5, state: 106 };
      expect(rig.handle.state().weather).toEqual(weather);
      expect(seen).toEqual([{ previous: undefined, type: "weather", weather }]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_NEW_WORLD clears the states, weather, music and light and keeps the phase mask (Player.cpp:1629-1634, Map.cpp:3225-3244)", () => {
    const { rig } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_INIT_WORLD_STATES,
        ambienceInitWorldStatesBody({
          areaId: 3430,
          mapId: 530,
          states: [{ id: 2, value: 7 }],
          zoneId: 3430,
        }),
      );
      rig.inject(
        GameOpcode.SMSG_WEATHER,
        ambienceWeatherBody({ abrupt: true, intensity: 0.25, state: 4 }),
      );
      rig.inject(GameOpcode.SMSG_PLAY_MUSIC, ambiencePlayMusicBody(6077));
      rig.inject(
        GameOpcode.SMSG_OVERRIDE_LIGHT,
        ambienceOverrideLightBody({ defaultId: 1, fadeMs: 0, overrideId: 9 }),
      );
      rig.inject(GameOpcode.SMSG_SET_PHASE_SHIFT, ambienceSetPhaseShiftBody(4));
      rig.inject(GameOpcode.SMSG_NEW_WORLD, newWorldBody());
      expect(rig.handle.state()).toEqual({
        cinematic: undefined,
        light: undefined,
        movie: undefined,
        music: undefined,
        phaseMask: 4,
        states: [],
        weather: undefined,
      });
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_PLAY_SOUND emits a sound event and keeps no state (MiscPackets.cpp:63-68)", () => {
    const { rig, seen } = rigWithEvents();
    try {
      const before = rig.handle.state();
      rig.inject(GameOpcode.SMSG_PLAY_SOUND, ambiencePlaySoundBody(3337));
      expect(seen).toEqual([
        { kind: "sound", soundKitId: 3337, source: "", type: "sound" },
      ]);
      expect(rig.handle.state()).toEqual(before);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_PLAY_MUSIC emits a music event and keeps only the last (MiscPackets.cpp:48-53)", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(GameOpcode.SMSG_PLAY_MUSIC, ambiencePlayMusicBody(6077));
      rig.inject(GameOpcode.SMSG_PLAY_MUSIC, ambiencePlayMusicBody(6078));
      expect(rig.handle.state().music).toEqual({ at: 0, soundKitId: 6078 });
      expect(seen).toEqual([
        { kind: "music", soundKitId: 6077, source: "", type: "sound" },
        { kind: "music", soundKitId: 6078, source: "", type: "sound" },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_PLAY_OBJECT_SOUND carries the full guid as a decimal string (MiscPackets.cpp:55-61)", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_PLAY_OBJECT_SOUND,
        ambiencePlayObjectSoundBody({
          soundKitId: 7,
          source: 0xf130_0000_1234_0001n,
        }),
      );
      expect(seen).toEqual([
        {
          kind: "object",
          soundKitId: 7,
          source: String(0xf130_0000_1234_0001n),
          type: "sound",
        },
      ]);
      expect(rig.handle.state().music).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_OVERRIDE_LIGHT sets the light with the fade in milliseconds (Map.cpp:3331-3340)", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_OVERRIDE_LIGHT,
        ambienceOverrideLightBody({
          defaultId: 12,
          fadeMs: 5000,
          overrideId: 1942,
        }),
      );
      const light = { at: 0, defaultId: 12, fadeMs: 5000, overrideId: 1942 };
      expect(rig.handle.state().light).toEqual(light);
      expect(seen).toEqual([{ light, type: "light" }]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_SET_PHASE_SHIFT sets the mask, defaults to 1 and emits only on a change (MiscHandler.cpp:1632-1637)", () => {
    const { rig, seen } = rigWithEvents();
    try {
      expect(rig.handle.state().phaseMask).toBe(1);
      rig.inject(GameOpcode.SMSG_SET_PHASE_SHIFT, ambienceSetPhaseShiftBody(1));
      expect(seen).toEqual([]);
      rig.inject(GameOpcode.SMSG_SET_PHASE_SHIFT, ambienceSetPhaseShiftBody(2));
      rig.inject(GameOpcode.SMSG_SET_PHASE_SHIFT, ambienceSetPhaseShiftBody(2));
      rig.inject(
        GameOpcode.SMSG_SET_PHASE_SHIFT,
        ambienceSetPhaseShiftBody(0xff_ff_ff_ff),
      );
      expect(rig.handle.state().phaseMask).toBe(0xff_ff_ff_ff);
      expect(seen).toEqual([
        { from: 1, to: 2, type: "phase_changed" },
        { from: 2, to: 0xff_ff_ff_ff, type: "phase_changed" },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_TRIGGER_CINEMATIC records the sequence and auto-completes it (Player.cpp:5878-5883)", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_TRIGGER_CINEMATIC,
        ambienceTriggerCinematicBody(310),
      );
      expect(rig.handle.state().cinematic).toEqual({
        at: 0,
        completed: true,
        sequenceId: 310,
      });
      expect(seen).toEqual([
        {
          cinematic: { at: 0, completed: false, sequenceId: 310 },
          previous: undefined,
          type: "cinematic",
        },
        {
          cinematic: { at: 0, completed: true, sequenceId: 310 },
          previous: { at: 0, completed: false, sequenceId: 310 },
          type: "cinematic",
        },
      ]);
      expect(rig.sent).toEqual([
        { body: new Uint8Array(0), opcode: GameOpcode.CMSG_COMPLETE_CINEMATIC },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_TRIGGER_MOVIE records the movie and sends nothing (Player.cpp:5885-5890)", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(GameOpcode.SMSG_TRIGGER_MOVIE, ambienceTriggerMovieBody(44));
      expect(rig.handle.state().movie).toEqual({ at: 0, movieId: 44 });
      expect(seen).toEqual([
        {
          movie: { at: 0, movieId: 44 },
          previous: undefined,
          type: "movie",
        },
      ]);
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });
});
