# ambience

The `ambience` area keeps the zone's world states and the weather.
`SMSG_INIT_WORLD_STATES` replaces the whole state list (the area peeks
the packet that core already handles), each `SMSG_UPDATE_WORLD_STATE`
changes one state, and `SMSG_NEW_WORLD` clears everything. World-service
code reads them through `session.areas.ambience.state()`; the
`world_state` and `weather` events write no log row. `sendZoneUpdate(zoneId)`
is a core act only, and nothing calls it by itself. A new character's
first login starts its race or class cinematic, and the area ends it at
once the way a player who skips it would; `nextCinematicCamera` exists
for the probe only and is never sent in play. Movies the server starts
are recorded, and core sends no reply.

The area also records sound, music, light and phase. `SMSG_PLAY_SOUND`,
`SMSG_PLAY_MUSIC` and `SMSG_PLAY_OBJECT_SOUND` each emit one `sound`
event with `kind` (`sound`, `music` or `object`), `soundKitId` and
`source` (the source guid as a decimal string, empty when the packet
has none); only music keeps state (`music`, the last one).
`SMSG_OVERRIDE_LIGHT` sets `light` and emits `light`.
`SMSG_SET_PHASE_SHIFT` sets `phaseMask` (1 by default, unsigned) and
emits `phase_changed` with `from` and `to` only when the mask differs.
`SMSG_NEW_WORLD` clears `light` and `music`, which the server resends on
zone entry, and keeps `phaseMask`, which the server sends only when a
phase aura is applied or removed.

In the harness, the completed intro cinematic and a movie the server
starts are passive log rows; a cinematic that did not complete writes
no row. A phase change writes the `log` row `ambience/phase` ("Your
phase changed. Some units and objects may appear or vanish."). `sound`
and `light` write no row.

## Wire notes

- `SMSG_UPDATE_WORLD_STATE` and `SMSG_INIT_WORLD_STATES` write the state
  id and the value as `int32` (`Server/Packets/WorldStatePackets.cpp:40`,
  `Server/Packets/WorldStatePackets.cpp:20`, types at
  `Server/Packets/WorldStatePackets.h:56`). wow_messages reads them as
  `u32` (`wow_message_parser/wowm/world/world/smsg_update_world_state.wowm`).
  The area reads both as signed, so a negative value stays negative.
- `SMSG_WEATHER` is a `uint32` state, a `float` intensity and a `uint8`
  abrupt flag (`Server/Packets/MiscPackets.cpp:22`). Unknown states stay
  numbers, and the store emits `weather` only when the state or the
  intensity changes.
- AzerothCore has weather state 106, `WEATHER_STATE_BLACKSNOW`
  (`Weather/Weather.h:60`), which the wow_messages enum lacks
  (`wow_message_parser/wowm/world/world/smsg_weather.wowm`).
- A zone entry sends the zone's weather, and fine weather when the zone
  has none of its own (`Maps/Map.cpp:3255`).
- `CMSG_ZONEUPDATE` is one `uint32` zone id
  (`Handlers/MiscHandler.cpp:521`,
  `wow_message_parser/wowm/world/client_set/cmsg_zoneupdate.wowm`). The
  server ignores the value and only marks the zone for a re-check
  (`Handlers/MiscHandler.cpp:526`).
- The server re-checks the character's zone every second by itself
  (`Entities/Player/PlayerUpdates.cpp:280`), so core never sends the zone
  notice by itself.
- `SMSG_TRIGGER_CINEMATIC` is one `uint32` cinematic sequence id
  (`Entities/Player/Player.cpp:5880`, `Server/Protocol/Opcodes.cpp:381`),
  sent at the first login of a new character. AzerothCore also sends any
  `CinematicSequences.dbc` id from a game object or a smart script;
  unknown ids are kept.
- `CMSG_NEXT_CINEMATIC_CAMERA` and `CMSG_COMPLETE_CINEMATIC` carry no
  body (`Handlers/MiscHandler.cpp:940`,
  `Handlers/MiscHandler.cpp:946`). The complete ends the camera and is a
  no-op when none is active (`Server/Protocol/Opcodes.cpp:383`); the
  next-camera starts the camera and moves the server's sight position
  (`Handlers/MiscHandler.cpp:949`), and returns at once when no camera is
  active (`Server/Protocol/Opcodes.cpp:382`).
- `SMSG_TRIGGER_MOVIE` is one `uint32` movie id
  (`Entities/Player/Player.cpp:5887`), from the map script `PLAY_MOVIE`
  command (`Server/Protocol/Opcodes.cpp:1255`); core never sends a reply.

- `SMSG_PLAY_SOUND` and `SMSG_PLAY_MUSIC` are one `uint32` sound kit id
  (`Server/Packets/MiscPackets.cpp:63`, `Server/Packets/MiscPackets.cpp:48`).
  `SMSG_PLAY_OBJECT_SOUND` is the sound kit id and then the full 8-byte
  source guid, not a packed one (`Server/Packets/MiscPackets.cpp:55`,
  from `PlayDistanceSound`, `Entities/Object/Object.cpp:3008`).
- `SMSG_OVERRIDE_LIGHT` is three `uint32`: the map's default light id,
  the override light id and the fade time in milliseconds
  (`Maps/Map.cpp:3331`, `LightFadeInTime` is `Milliseconds`).
  wow_messages types the fade as seconds
  (`wow_message_parser/wowm/world/cinematic/smsg_override_light.wowm`);
  AzerothCore wins and the area keeps `fadeMs`. The server resends the
  zone's override light on zone entry (`Maps/Map.cpp:3236`).
- `SMSG_SET_PHASE_SHIFT` is one `uint32` phase mask
  (`Handlers/MiscHandler.cpp:1632`), sent when a phase aura is applied
  or removed (the `HandlePhase` aura handler in `Spells/Auras/SpellAuraEffects.cpp`); 1 when no
  phase aura is left. A GM-mode player gets `PHASEMASK_ANYWHERE`, so the
  area keeps the mask unsigned.

## Left out

- `CMSG_COMPLETE_MOVIE`, `SMSG_TOGGLE_XP_GAIN` and `SMSG_CAMERA_SHAKE`
  are dead (rows below): the server drops the first and never sends the
  other two.

## Capabilities row

No verb (N23); the world service reads world states and weather.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_UPDATE_WORLD_STATE` | `live` | probe flow `login`, exit 0 | `Server/Packets/WorldStatePackets.cpp:40` |
| `SMSG_WEATHER` | `live` | probe flow `login`, exit 0 | `Server/Packets/MiscPackets.cpp:22` |
| `CMSG_ZONEUPDATE` | `accepted` | probe `--send CMSG_ZONEUPDATE`, no disconnect, no error | `Handlers/MiscHandler.cpp:521` |
| `SMSG_TRIGGER_CINEMATIC` | `live` | probe flow `login` on a `fresh` account, exit 0 | `Entities/Player/Player.cpp:5878` |
| `CMSG_COMPLETE_CINEMATIC` | `accepted` | the same run: core's send, no disconnect | `Handlers/MiscHandler.cpp:940` |
| `CMSG_NEXT_CINEMATIC_CAMERA` | `accepted` | probe `--send` after the complete, no disconnect | `Handlers/MiscHandler.cpp:946` |
| `SMSG_PLAY_OBJECT_SOUND` | `live` | `elwynn10` account staged at the Eastvale camp (-9466.71, -1296.88, 41.55), probe flow `login --expect SMSG_PLAY_OBJECT_SOUND --wait 180`, exit 0; 8 packets of 12 bytes, all handled (run `tmp/probe/FAC6ABD9AB7DB-20260930T232658Z`) | `Server/Packets/MiscPackets.cpp:55` |
| `SMSG_PLAY_SOUND` | `mock` | `area.test.ts`, not seen live | `Server/Packets/MiscPackets.cpp:63` |
| `SMSG_PLAY_MUSIC` | `mock` | `area.test.ts`, not seen live | `Server/Packets/MiscPackets.cpp:48` |
| `SMSG_OVERRIDE_LIGHT` | `mock` | `area.test.ts`, not seen live | `Maps/Map.cpp:3331` |
| `SMSG_SET_PHASE_SHIFT` | `mock` | `area.test.ts`, not seen live | `Handlers/MiscHandler.cpp:1632` |
| `SMSG_TRIGGER_MOVIE` | `mock` | `area.test.ts`, not seen live | `Entities/Player/Player.cpp:5885` |
| `CMSG_COMPLETE_MOVIE` | `dead` | `STATUS_NEVER` with `Handle_NULL`: the server drops it, so a send proves nothing, and core never sends it | `Server/Protocol/Opcodes.cpp:1256` |
| `SMSG_TOGGLE_XP_GAIN` | `dead` | registered `STATUS_NEVER` with no send site in AzerothCore `src/`; wow_messages notes it exists only as a comment (`wow_message_parser/wowm/world/exp/smsg_toggle_xp_gain.wowm`) | `Server/Protocol/Opcodes.cpp:1392` |
| `SMSG_CAMERA_SHAKE` | `dead` | registered `STATUS_NEVER` with no send site in AzerothCore `src/`; wow_messages notes it exists only as a comment (`wow_message_parser/wowm/world/cinematic/smsg_camera_shake.wowm`) | `Server/Protocol/Opcodes.cpp:1421` |
