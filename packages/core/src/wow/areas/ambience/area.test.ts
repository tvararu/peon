import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  ambienceInitWorldStatesBody,
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

  test("SMSG_NEW_WORLD clears the states and the weather (Player.cpp:1629-1634)", () => {
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
      rig.inject(GameOpcode.SMSG_NEW_WORLD, newWorldBody());
      expect(rig.handle.state()).toEqual({
        cinematic: undefined,
        movie: undefined,
        states: [],
        weather: undefined,
      });
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
