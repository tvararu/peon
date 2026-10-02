# battlegrounds

The `battlegrounds` area tracks the character's own PvP flag, honor and kill counters from the self update fields, plus the four pvp-1 server packets. World-service code reads it through `session.areas.battlegrounds.state()`: `self` (`wantsFlag` from `PLAYER_FLAGS` 0x200, `flagged` from `UNIT_FIELD_BYTES_2` byte 1 bit 0x01, `timer` from `PLAYER_FLAGS` 0x40000, `contested`, `ffa`, `sanctuary`, honor, arena points and kill counters), `credits` (the last 20 `SMSG_PVP_CREDIT` rows), `zoneAlerts` (the last 10 zone attacks) and `inspect` (honor stats per guid). The area emits `pvp_flag` on any flag-bit change, `honor_credit`, `honor_inspect`, `zone_under_attack` and `pvp_kill_quest`.

The two acts:

- `setPvp(on)` sends `CMSG_TOGGLE_PVP` with one byte (`01` on, `00` off) and resolves when `wantsFlag` matches. Already matching resolves without sending. Silence rejects `timeout` after 3 s. Switching off clears `wantsFlag` at once; the visible `flagged` bit lingers about 5 minutes.
- `inspectHonor(guid)` sends `MSG_INSPECT_HONOR_STATS` with the target guid and resolves on that guid's `honor_inspect`. Silence rejects `no_answer` after 3 s; the server stays silent out of range or when the target is attackable.

## Wire notes

- `CMSG_TOGGLE_PVP`: one body byte sets `PLAYER_FLAGS_IN_PVP` (0x200); an empty body toggles (`Handlers/MiscHandler.cpp:500-519`). Switching off keeps `UNIT_BYTE2_FLAG_PVP` (0x01 in byte 1 of `UNIT_FIELD_BYTES_2`) and `PLAYER_FLAGS_PVP_TIMER` (0x40000) marks the countdown; the flag falls after about 300 s, so `wantsFlag` and `flagged` are two facts.
- `SMSG_PVP_CREDIT`: `i32` honor, `u64` victim, `i32` rank (`Entities/Player/Player.cpp:6385-6392`). AzerothCore writes signed values where wowm (`pvp/smsg_pvp_credit.wowm:3-7`) says `u32`. Sent only when a victim or group exists; bonus honor in a match carries an empty victim.
- `MSG_INSPECT_HONOR_STATS` server form: `u64` guid, `u8` honor points (wraps above 255), `u32` kills, `u32` today, `u32` yesterday, `u32` lifetime kills (`Handlers/MiscHandler.cpp:1019-1049`). Silent when the target is missing, beyond inspect distance, or a valid attack target; self-inspect answers.
- `SMSG_ZONE_UNDER_ATTACK`: one `u32` area id, the sub-area, sent to every session of the team opposing the killer when a player kills a guard (`Entities/Creature/Creature.cpp:2870-2875`). The `zone_under_attack` event carries `here: false` in wave 5; the row is always `passive`.
- `SMSG_QUESTUPDATE_ADD_PVP_KILL`: three `u32` quest, count, required (`Server/Packets/QuestPackets.cpp:89-96`). Only six quests use the objective, all test quests or the level-77+ dailies 13233/13234 (15 kills).
- Self fields: `PLAYER_FLAGS` (offset 150), `UNIT_FIELD_BYTES_2` (offset 122; the PvP bits live in byte 1: `UNIT_BYTE2_FLAG_PVP` 0x01, `UNIT_BYTE2_FLAG_FFA_PVP` 0x04, `UNIT_BYTE2_FLAG_SANCTUARY` 0x08 in `Entities/Unit/UnitDefines.h:136-142`, read with byte index 1 as in `Entities/Unit/Unit.h:1049-1051`), `PLAYER_FIELD_KILLS` (offset 1225, two `u16`: today low, yesterday high), `TODAY_CONTRIBUTION` (1226), `YESTERDAY_CONTRIBUTION` (1227), `LIFETIME_HONORBALE_KILLS` (1228), `HONOR_CURRENCY` (1277), `ARENA_CURRENCY` (1278) (`protocol/update-fields.ts:122,150,1225-1228,1277-1278`).

## Left out

None.

## Capabilities row

| Turn its PvP flag on and off | (pvp-11a proves it) | `setPvp` toggles the flag; the flag state reads from the self update fields anywhere. |

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_TOGGLE_PVP` | `live` | flow `battlegrounds-flag` on `fresh` account `FAC6ABF73D48E`: trace `tmp/probe/FAC6ABF73D48E-20261002T090622Z/packets.jsonl` shows `CMSG_TOGGLE_PVP` out with bodies `01` then `00` | `Handlers/MiscHandler.cpp:500-519` |
| `MSG_INSPECT_HONOR_STATS` | `live` | same run: `MSG_INSPECT_HONOR_STATS` out with the self guid and the reply in with all-zero stats | `Handlers/MiscHandler.cpp:1019-1049` |
| `SMSG_PVP_CREDIT` | `mock` (`unseen`, not seen live: needs a battleground match, pvp-3 is out of slice) | `areaRig` test | `Entities/Player/Player.cpp:6385-6392` |
| `SMSG_ZONE_UNDER_ATTACK` | `mock` (`unseen`, not seen live: needs a player killing a guard; no live try per SR5-pvp-2) | `areaRig` test | `Entities/Creature/Creature.cpp:2870-2875` |
| `SMSG_QUESTUPDATE_ADD_PVP_KILL` | `mock` (`unseen`, not seen live: needs a player kill with quest 13233/13234 at level 77; no try planned) | `areaRig` test | `Server/Packets/QuestPackets.cpp:89-96` |
| `CMSG_BATTLEFIELD_JOIN` | `dead` | never sent by the client build | `Opcodes.cpp` per the pvp dead table |
| `SMSG_PLAYER_SKINNED` | `dead` | never sent by the server build | `Opcodes.cpp` per the pvp dead table |
| `SMSG_DEFENSE_MESSAGE` | `dead` | never sent by the server build | `Opcodes.cpp` per the pvp dead table |
| `SMSG_JOINED_BATTLEGROUND_QUEUE` | `dead` | never sent by the server build | `Opcodes.cpp` per the pvp dead table |
| `CMSG_COMMENTATOR_ENABLE` | `dead` | never sent by the client build | `Opcodes.cpp` per the pvp dead table |
| `SMSG_BATTLEGROUND_INFO_THROTTLED` | `dead` | never sent by the server build | `Opcodes.cpp` per the pvp dead table |
