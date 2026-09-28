# ambience

The `ambience` area keeps the zone's world states and the weather.
`SMSG_INIT_WORLD_STATES` replaces the whole state list (the area peeks
the packet that core already handles), each `SMSG_UPDATE_WORLD_STATE`
changes one state, and `SMSG_NEW_WORLD` clears both. World-service code
reads them through `session.areas.ambience.state()`; the `world_state`
and `weather` events write no log row. `sendZoneUpdate(zoneId)` is a core
act only, and nothing calls it by itself.

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

## Left out

- `SMSG_TRIGGER_CINEMATIC`, `CMSG_NEXT_CINEMATIC_CAMERA`,
  `CMSG_COMPLETE_CINEMATIC` and `SMSG_TRIGGER_MOVIE`: built by world-7.
- `SMSG_PLAY_SOUND`, `SMSG_PLAY_MUSIC`, `SMSG_PLAY_OBJECT_SOUND`,
  `SMSG_OVERRIDE_LIGHT` and `SMSG_SET_PHASE_SHIFT`: built by world-6.
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
| `CMSG_COMPLETE_MOVIE` | `dead` | `STATUS_NEVER` with `Handle_NULL`: the server drops it, so a send proves nothing, and core never sends it | `Server/Protocol/Opcodes.cpp:1256` |
| `SMSG_TOGGLE_XP_GAIN` | `dead` | registered `STATUS_NEVER` with no send site in AzerothCore `src/`; wow_messages notes it exists only as a comment (`wow_message_parser/wowm/world/exp/smsg_toggle_xp_gain.wowm`) | `Server/Protocol/Opcodes.cpp:1392` |
| `SMSG_CAMERA_SHAKE` | `dead` | registered `STATUS_NEVER` with no send site in AzerothCore `src/`; wow_messages notes it exists only as a comment (`wow_message_parser/wowm/world/cinematic/smsg_camera_shake.wowm`) | `Server/Protocol/Opcodes.cpp:1421` |
