# battlegrounds

The `battlegrounds` area tracks the character's own PvP flag, honor and kill counters from the self update fields, plus the four pvp-1 server packets, the battleground queue (pvp-2) and the live match with its spirit guide timer (pvp-3, pvp-4). World-service code reads it through `session.areas.battlegrounds.state()`: `self` (`wantsFlag` from `PLAYER_FLAGS` 0x200, `flagged` from `UNIT_FIELD_BYTES_2` byte 1 bit 0x01, `timer` from `PLAYER_FLAGS` 0x40000, `contested`, `ffa`, `sanctuary`, honor, arena points and kill counters), `credits` (the last 20 `SMSG_PVP_CREDIT` rows), `zoneAlerts` (the last 10 zone attacks) `inspect` (honor stats per guid), `queue` (`slots`, `list`, `lastJoin`) and `match` (`current` with map, battleground, entry time, roster, score, carriers and rez; `spirit` with the last guide and its next mass-rez time). The area emits `pvp_flag` on any flag-bit change, `honor_credit`, `honor_inspect`, `zone_under_attack` `pvp_kill_quest`, `bg_status`, `bg_invited`, `bg_left`, `bg_list` and `bg_join_result`.

The queue has two slots; a status for a higher slot (a character in a match outside the queue) grows the array. Each slot is `none`, `queued` (battleground, arena type, rated, level bracket, instance id, average wait, time in queue, `receivedAt`), `invited` (map, `expiresAt` = receive time + time to remove; no timer runs), `active` (map, auto-leave, elapsed, faction) or `leaving`. `bg_status` fires for every status packet with the previous kind; `bg_invited` for an invitation; `bg_left` when a filled slot becomes `none`. Inside a match the area emits `bg_entered` when an active slot matches the self map, `bg_player_joined` and `bg_player_left` for roster changes, `bg_score` for each log (plus `bg_left_match` when a `new_world` leaves the map), `bg_carriers` for flag positions and `bg_rez_time` for the spirit guide timer. The world-entry hooks (`login_verified`, `new_world`) each send one empty `CMSG_BATTLEFIELD_STATUS`, as the client does (`Handlers/BattleGroundHandler.cpp:639-640`); the server answers one status per queue and nothing when there is none. Core never answers an invitation by itself.

The slot count is `PLAYER_MAX_BATTLEGROUND_QUEUES` (`shared/SharedDefines.h:153`).

The queue acts:

- `list(bgType)` sends `CMSG_BATTLEFIELD_LIST` and resolves on that battleground's `bg_list` (3 s, else `timeout`). `hello(guid)` sends `CMSG_BATTLEMASTER_HELLO` and resolves on the list from that master (3 s); the server is silent when the guid is no battlemaster or the character is under the level, which sends a notification instead.
- `join(bgType, { asGroup, instanceId, via })` sends `CMSG_BATTLEMASTER_JOIN`. The server never checks the guid (`Handlers/BattleGroundHandler.cpp:72-90,142`), so `via` defaults to 0. It resolves on a status that newly queues that battleground and rejects with the error name of `SMSG_GROUP_JOINED_BATTLEGROUND` (`none` for -1, `deserter` for -2, `too_many_queues` for -4, and so on). It rejects `timeout` after 5 s in the silent cases: a bad type, a level under the bracket, already in a battleground.
- `answer(slot, accept)` sends `CMSG_BATTLEFIELD_PORT` echoing the slot's arena type and battleground (AzerothCore looks the queue up by both, `:427-428`) and resolves on `active` or `none` (10 s). An empty slot rejects `no_slot` and sends nothing; a self in combat rejects `in_combat` and sends nothing (`:419-423`). `leaveQueue(slot)` is `answer(slot, false)` on a `queued` slot; an invited slot rejects `not_queued`, because leaving an invitation is recorded as a desertion (`:600-610`).

The match acts (pvp-3, pvp-4):

- `requestScore()` sends empty `MSG_PVP_LOG_DATA` and resolves on `bg_score` (3 s). `requestCarriers()` sends empty `MSG_BATTLEGROUND_PLAYER_POSITIONS` and resolves on `bg_carriers` (3 s). The server answers both only inside a battleground (`Handlers/BattleGroundHandler.cpp:298-347,350-364`).
- `leaveBattleground()` sends `CMSG_LEAVE_BATTLEFIELD` (four ignored fields) and resolves on the none or leaving status (10 s); it rejects `in_combat` in combat (`:629-632`) and `not_in_battleground` without `current`. `reportAfk(guid)` sends the guid and resolves on send; the server never replies (`:942`).
- `queueSpiritGuide(guid)` sends the query and the queue for that guide and resolves on its `bg_rez_time` (3 s). The spirit time also survives outside `current` at `match.spirit` so Wintergrasp can use it.

The two pvp-1 acts:

- `setPvp(on)` sends `CMSG_TOGGLE_PVP` with one byte (`01` on, `00` off) and resolves when `wantsFlag` matches. Already matching resolves without sending. Silence rejects `timeout` after 3 s. Switching off clears `wantsFlag` at once; the visible `flagged` bit lingers about 5 minutes.
- `inspectHonor(guid)` sends `MSG_INSPECT_HONOR_STATS` with the target guid and resolves on that guid's `honor_inspect`. Silence rejects `no_answer` after 3 s; the server stays silent out of range or when the target is attackable.

## Wire notes

- `CMSG_TOGGLE_PVP`: one body byte sets `PLAYER_FLAGS_IN_PVP` (0x200); an empty body toggles (`Handlers/MiscHandler.cpp:500-519`). Switching off keeps `UNIT_BYTE2_FLAG_PVP` (0x01 in byte 1 of `UNIT_FIELD_BYTES_2`) and `PLAYER_FLAGS_PVP_TIMER` (0x40000) marks the countdown; the flag falls after about 300 s, so `wantsFlag` and `flagged` are two facts.
- `SMSG_PVP_CREDIT`: `i32` honor, `u64` victim, `i32` rank (`Entities/Player/Player.cpp:6385-6392`). AzerothCore writes signed values where wowm (`pvp/smsg_pvp_credit.wowm:3-7`) says `u32`. Sent only when a victim or group exists; bonus honor in a match carries an empty victim.
- `MSG_INSPECT_HONOR_STATS` server form: `u64` guid, `u8` honor points (wraps above 255), `u32` kills, `u32` today, `u32` yesterday, `u32` lifetime kills (`Handlers/MiscHandler.cpp:1019-1049`). Silent when the target is missing, beyond inspect distance, or a valid attack target; self-inspect answers.
- `SMSG_ZONE_UNDER_ATTACK`: one `u32` area id, the sub-area, sent to every session of the team opposing the killer when a player kills a guard (`Entities/Creature/Creature.cpp:2870-2875`). The `zone_under_attack` event carries `here: false` in wave 5; the row is always `passive`.
- `SMSG_QUESTUPDATE_ADD_PVP_KILL`: three `u32` quest, count, required (`Server/Packets/QuestPackets.cpp:89-96`). Only six quests use the objective, all test quests or the level-77+ dailies 13233/13234 (15 kills).
- Self fields: `PLAYER_FLAGS` (offset 150), `UNIT_FIELD_BYTES_2` (offset 122; the PvP bits live in byte 1: `UNIT_BYTE2_FLAG_PVP` 0x01, `UNIT_BYTE2_FLAG_FFA_PVP` 0x04, `UNIT_BYTE2_FLAG_SANCTUARY` 0x08 in `Entities/Unit/UnitDefines.h:136-142`, read with byte index 1 as in `Entities/Unit/Unit.h:1049-1051`), `PLAYER_FIELD_KILLS` (offset 1225, two `u16`: today low, yesterday high), `TODAY_CONTRIBUTION` (1226), `YESTERDAY_CONTRIBUTION` (1227), `LIFETIME_HONORBALE_KILLS` (1228), `HONOR_CURRENCY` (1277), `ARENA_CURRENCY` (1278) (`protocol/update-fields.ts:122,150,1225-1228,1277-1278`).

- `SMSG_BATTLEFIELD_LIST`: `u64` guid, `u8` fromWhere, `u32` type, two `u8 0`, `u8` hasWin, three `u32` rewards, `u8` isRandom, a 13-byte random block when set, then `u32` count and count `u32` instance ids; type 6 (all arenas) writes a lone `u32 0` instead (`Battlegrounds/BattlegroundMgr.cpp:584-638`). wowm (`battleground/smsg_battlefield_list.wowm:77-97`) lacks the fromWhere byte; AzerothCore wins. `CMSG_BATTLEFIELD_LIST` answers with guid 0.
- `SMSG_BATTLEFIELD_STATUS`: `u32` slot, then either `u64 0` (the none form, 12 bytes in all) or `u8` arena type, `u8` isArena (`0x0E` or 0), `u32` type, `u16 0x1F90`, `u8` min and max level, `u32` client instance id, `u8` rated, `u32` status and a tail per status: `WAIT_QUEUE` average wait and time in queue, `WAIT_JOIN` map, `u64 0` and time to remove, `IN_PROGRESS` map, `u64 0`, auto-leave, elapsed and `u8` faction (`Battlegrounds/BattlegroundMgr.cpp:196-246`). wowm (`battleground/smsg_battlefield_status.wowm:88-122`) reads the status as `u8` and has no none form; AzerothCore wins. The `0x1F90` word and `isArena` stay raw.
- `SMSG_GROUP_JOINED_BATTLEGROUND`: `i32` result plus a `u64` guid for -11 and -12 (`Battlegrounds/BattlegroundMgr.cpp:248-254`); the result names follow the group-join enum below. wowm (`social/smsg_group_joined_battleground.wowm:48-76`) has no negative codes; AzerothCore wins.
- A solo `CMSG_BATTLEMASTER_JOIN` sends no positive result: success is only the `WAIT_QUEUE` status (`Handlers/BattleGroundHandler.cpp:205-213`). Its fields: `u64` guid, `u32` BattlemasterList id, `u32` instance id, `u8` as group (`Handlers/BattleGroundHandler.cpp:72-86`; wowm names the second field `Map`). `CMSG_BATTLEFIELD_PORT`: `u8` arena type, `u8 0`, `u32` type, `u16 0x1F90`, `u8` action (1 enter, 0 leave; `:393-617`). `CMSG_BATTLEMASTER_HELLO`: `u64` guid (`:37-63`). `CMSG_BATTLEFIELD_LIST`: `u32` type, `u8` fromWhere, `u8` can gain xp (`:368-391`). `CMSG_BATTLEFIELD_STATUS` has no body (`:637-696`).
- Group-join error names (`GroupJoinBattlegroundResult`, `shared/SharedDefines.h:3890-3909`): 0 not_eligible, -1 none, -2 deserter, -3 arena_party_size, -4 too_many_queues, -5 cannot_queue_for_rated, -6 queued_for_rated, -7 team_left_queue, -8 in_battleground, -9 join_xp_gain, -10 join_range_index, -11 join_timed_out, -12 join_failed, -13 lfg, -14 in_random, -15 in_non_random; a positive result is the BattlemasterList id.
- Bots: `RandomPlayerbotMgr::CheckBgQueue` fills a queue about every 35 s, so a queue held under 20 s gets no invitation. A flow must not accept an invitation, and the proof flows leave within seconds.

## Left out

- Joining as a group (`asGroup` on `CMSG_BATTLEMASTER_JOIN`): success needs a party and a positive group-joined packet (`Handlers/BattleGroundHandler.cpp:271`), and -11 and -12 need group members. The builder and parser are tested from the writer; the flow does not run it.
- A charmed self is not modelled, so `answer` does not reject it; the server also refuses (`:419`).
- Arena queues, accepting an invitation in a live match and `WAIT_JOIN` and `IN_PROGRESS` from a real match (pvp-3, pvp-8).

## Capabilities row

| Queue for a battleground | (pvp-11a proves it) | `list`, `hello`, `join`, `answer` and `leaveQueue` drive the queue; the slots read from `state().queue`. |
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
| `CMSG_BATTLEFIELD_LIST` | `live` | flow `battlegrounds-queue` step `list` on `eversong10` account `FAC6ABF824E60`: trace `tmp/probe/FAC6ABF824E60-20261002T100820Z/packets.jsonl` shows the 6-byte request `020000000100` and the 33-byte list | `Handlers/BattleGroundHandler.cpp:368-391` |
| `SMSG_BATTLEFIELD_LIST` | `live` | same run: the list for Warsong Gulch with rewards 465/25/78 and no instances; run `tmp/probe/FAC6ABF824E60-20261002T100943Z/` shows the list from battlemaster Gargok (guid `0xf130004dc60064c0`) | `Battlegrounds/BattlegroundMgr.cpp:584-638` |
| `CMSG_BATTLEMASTER_HELLO` | `live` | after `soap gm tele MorshanBaseCamp`, flow step `hello` found Gargok (entry 19910, 13.4 yd, roles `gossip`, `battlemaster`) with `nearest`-style lookup and got his list: trace `tmp/probe/FAC6ABF824E60-20261002T100943Z/packets.jsonl` | `Handlers/BattleGroundHandler.cpp:37-63` |
| `CMSG_BATTLEMASTER_JOIN` | `live` | step `join`: the 17-byte request with guid 0 and the `WAIT_QUEUE` reply (run `...T100820Z`); at level 61 two queues succeed and the third answers `too_many_queues` (run `tmp/probe/FAC6ABF824E60-20261002T101040Z/`) | `Handlers/BattleGroundHandler.cpp:72-294` |
| `CMSG_BATTLEFIELD_STATUS` | `live` | sent once at login with no reply when not queued (run `tmp/probe/FAC6ABF824E60-20261002T101114Z/`: one request, no `SMSG_BATTLEFIELD_STATUS`) and sent while queued with a `--send`, answered with `WAIT_QUEUE` and 27 ms in queue (run `...T100820Z`) | `Handlers/BattleGroundHandler.cpp:637-696` |
| `SMSG_BATTLEFIELD_STATUS` | `live` | `WAIT_QUEUE` (31 bytes) and the 12-byte none form after the leave, run `...T100820Z`; `WAIT_JOIN` and `IN_PROGRESS` are `mock` (a match needs bots filling the queue, pvp-3) | `Battlegrounds/BattlegroundMgr.cpp:196-246` |
| `SMSG_GROUP_JOINED_BATTLEGROUND` | `live` | `-1` (`none`) on the second join of Warsong Gulch (run `...T100820Z`), `-2` (`deserter`) after `soap gm deserter-bg 1m` (run `tmp/probe/FAC6ABF824E60-20261002T100912Z/`), `-4` (run `...T101040Z`) | `Battlegrounds/BattlegroundMgr.cpp:248-254` |
| `CMSG_BATTLEFIELD_PORT` | `live` | step `leave` (action 0) answered by the none status, runs `...T100820Z` and `...T101040Z`; accepting an invitation is `mock` (the flow never answers one) | `Handlers/BattleGroundHandler.cpp:393-617` |
| `SMSG_BATTLEGROUND_PLAYER_JOINED` | `live` | flow `battlegrounds-warsong` on `eversong10` account `FAC6AC644288D`: trace `/tmp/w7-bg-second/packets.jsonl` shows 9 joined packets in a live Warsong Gulch pop, first body `3d04000000000000`; the parser reads the guid | `Battlegrounds/BattlegroundMgr.cpp:262-266` |
| `SMSG_BATTLEGROUND_PLAYER_LEFT` | `mock` (`unseen`, not seen live: same pop as above, no left packets captured) | `areaRig` test | `Battlegrounds/BattlegroundMgr.cpp:256-260` |
| `MSG_PVP_LOG_DATA` | `live` | same run: the reply to the empty client request is a 94-byte Warsong board, `isArena 0`, not ended, 2 players with 2 objectives each (body `00000200...`); the parser reads it | `Battlegrounds/Battleground.cpp:1373-1401` |
| `MSG_BATTLEGROUND_PLAYER_POSITIONS` | `live` | same run: the reply to the empty client request is the 8-byte empty form `0000000000000000` (no carriers out); the parser reads the `u32` count | `Handlers/BattleGroundHandler.cpp:298-347` |
| `CMSG_LEAVE_BATTLEFIELD` | `builder` (reader `Handlers/BattleGroundHandler.cpp:619-635`; the flow leaves only when the match ends) | `areaRig` test sends the 8-byte leave | `Handlers/BattleGroundHandler.cpp:619-635` |
| `CMSG_REPORT_PVP_AFK` | `live` | same run: `CMSG_REPORT_PVP_AFK` out with a teammate guid, accepted with no reply (`:942`) | `Handlers/BattleGroundHandler.cpp:928-943` |
| `CMSG_AREA_SPIRIT_HEALER_QUERY` | `builder` (reader `Handlers/MiscHandler.cpp:1640-1661`) | `areaRig` test sends the query then the queue | `Handlers/MiscHandler.cpp:1640-1661` |
| `CMSG_AREA_SPIRIT_HEALER_QUEUE` | `builder` (reader `Handlers/MiscHandler.cpp:1663-1684`) | same | `Handlers/MiscHandler.cpp:1663-1684` |
| `SMSG_AREA_SPIRIT_HEALER_TIME` | `mock` (`unseen`, not seen live: no spirit timer captured in the queued run) | `areaRig` test | `Battlegrounds/BattlegroundMgr.cpp:665-673` |
