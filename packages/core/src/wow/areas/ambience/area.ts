import { AMBIENCE_OPCODES } from "#wow/areas/ambience/opcodes";
import {
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
import { ambienceRuntime } from "#wow/areas/ambience/runtime";
import { AmbienceStore } from "#wow/areas/ambience/store";
import { defineArea } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";
import { parseInitWorldStates } from "#wow/protocol/world-states";

export const ambienceArea = defineArea({
  name: "ambience",
  opcodes: AMBIENCE_OPCODES,
  eventTypes: [
    "world_state",
    "weather",
    "cinematic",
    "movie",
    "sound",
    "light",
    "phase_changed",
  ],
  store: (deps) => new AmbienceStore(deps.now),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_UPDATE_WORLD_STATE, (r) =>
      store.setState(parseUpdateWorldState(r)),
    );
    wire.on(GameOpcode.SMSG_WEATHER, (r) => store.setWeather(parseWeather(r)));
    wire.on(GameOpcode.SMSG_TRIGGER_CINEMATIC, (r) =>
      store.startCinematic({
        ...parseTriggerCinematic(r),
        completed: false,
      }),
    );
    wire.on(GameOpcode.SMSG_TRIGGER_MOVIE, (r) =>
      store.startMovie({ ...parseTriggerMovie(r) }),
    );
    wire.on(GameOpcode.SMSG_PLAY_SOUND, (r) =>
      store.playSound({ kind: "sound", ...parsePlaySound(r) }),
    );
    wire.on(GameOpcode.SMSG_PLAY_MUSIC, (r) =>
      store.playSound({ kind: "music", ...parsePlayMusic(r) }),
    );
    wire.on(GameOpcode.SMSG_PLAY_OBJECT_SOUND, (r) =>
      store.playSound({ kind: "object", ...parsePlayObjectSound(r) }),
    );
    wire.on(GameOpcode.SMSG_OVERRIDE_LIGHT, (r) =>
      store.setLight(parseOverrideLight(r)),
    );
    wire.on(GameOpcode.SMSG_SET_PHASE_SHIFT, (r) =>
      store.setPhaseMask(parseSetPhaseShift(r).mask),
    );
    wire.peek(GameOpcode.SMSG_INIT_WORLD_STATES, (r) =>
      store.resetStates(
        parseInitWorldStates(r).states.map(({ state, value }) => ({
          id: state | 0,
          value: value | 0,
        })),
      ),
    );
    wire.peek(GameOpcode.SMSG_NEW_WORLD, () => store.clear());
  },
  runtime: ambienceRuntime,
});
