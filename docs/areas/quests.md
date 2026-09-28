# quests

The `quests` area keeps the quest-giver marks the server sends for the
givers in view, and the map regions where each logged quest's objectives
are done. World-service code reads them through
`session.areas.quests.state().marks`: one entry per giver guid with the
dialog status, when it arrived and whether it came from the multiple
packet or a single status reply. `markOf(status)` names a status as
`available`, `available_low`, `available_repeatable`, `reward`,
`incomplete` or `none`. The area emits a `marks` event only when a
giver's status changes, appears or goes away. POIs live in
`state().pois`: one entry per quest id with `pending`, `known`, `none`
or `no_reply` and the `QuestPoi` list, matched by quest id because the
server answers in `unordered_set` order. A `poi` event fires per settled
quest.

The area also keeps the NPC greeting texts behind gossip menus and the
last gossip point of interest. `session.areas.quests.state().texts` maps
each text id to its `pending`, `known` or `no_reply` status with its 8
options, and `greeting(textId)` returns the non-empty text of the
highest-probability option with `$N`, `$C` and `$R` kept.
`session.areas.quests.state().gossipPoi` holds the last point with the
giver guid open at arrival. The runtime sends one
`CMSG_NPC_TEXT_QUERY` for a gossip dialog's title text id, once per id
for the session, and an id with no reply after 5 s becomes `no_reply`.
The acts are `queryNpcText(textId, guid)` and `greeting(textId)`.

The runtime sends one `CMSG_QUESTGIVER_STATUS_MULTIPLE_QUERY` 500 ms
after the last trigger, and at most once every 2 s. A trigger is a unit
with the quest-giver NPC flag or a quest-giver game object coming into
view with no mark, an update that gives a unit the flag, or a quest
mark. The runtime also queues a `CMSG_QUEST_POI_QUERY` when a quest is
accepted, when the quest log changes, or through `queryPoi(ids)`, in
packets of at most 25 ids with duplicates removed. It queries only ids
above 0 with no entry or a `no_reply` entry, so cached and in-flight
quests are not asked again. A quest with no POIs
becomes `none`; an id with no reply after `REPLY_TIMEOUT_MS` (5000)
becomes `no_reply`, and the next log change queries it once more. The
acts are `queryGiverStatus(guid)`, which sends the single query
for a creature or game object in view, `queryGiverStatuses()`, which
sends the multiple query at once, and `queryPoi(ids)`, which returns the
known entries.

## Wire notes

- `SMSG_QUESTGIVER_STATUS_MULTIPLE` is a `uint32` count, then per giver
  the full 8-byte guid and a `uint8` dialog status
  (`Entities/Player/Player.cpp:7906-7951`,
  `wow_message_parser/wowm/world/quest/smsg_questgiver_status_multiple.wowm`).
  It lists every giver in view that is not hostile, so each packet
  replaces the whole set (`Entities/Player/Player.cpp:7915-7946`).
- The server sends the list once at login
  (`Entities/Player/Player.cpp:11920`), where it is often empty because
  nothing is in view yet.
- `CMSG_QUESTGIVER_STATUS_MULTIPLE_QUERY` has no body, and the server
  answers it with the list (`Handlers/QuestHandler.cpp:620-623`).
- `CMSG_QUESTGIVER_STATUS_QUERY` is the 8-byte giver guid
  (`Handlers/QuestHandler.cpp:36-40`). The reply is
  `SMSG_QUESTGIVER_STATUS`, the guid and a `uint8` status
  (`Entities/Creature/GossipDef.cpp:378-386`). A game object answers 0
  unless the server enables object quest markers
  (`Handlers/QuestHandler.cpp:60-67`), and an unknown guid gets no reply
  (`Handlers/QuestHandler.cpp:44-48`).
- The status values are AzerothCore's `QuestGiverStatus` enum 0-10
  (`Quests/QuestDef.h:110-126`).
- The POI reply is a `uint32` count, then per quest the `uint32` quest id
  and the `uint32` POI count, then per POI the `uint32` POI index, the
  `int32` objective index, the `uint32` map, area, floor, `Unk3` and
  `Unk4` fields, the `uint32` point count and the `int32` point x and y
  (`Handlers/QueryHandler.cpp:427-479`). A quest with no POIs, or one
  not in the log, comes back with a POI count of 0
  (`Handlers/QueryHandler.cpp:434-438,471-476`). The client query is a
  `uint32` count and the `uint32` quest ids
  (`Handlers/QueryHandler.cpp:411-420`); the server drops a count above
  25 with no reply, and 25 is `MAX_QUEST_LOG_SIZE`
  (`Quests/QuestDef.h:33`).
- `SMSG_QUEST_POI_QUERY_RESPONSE` writes the objective index and the
  point coordinates as `int32` (`Handlers/QueryHandler.cpp:452,462-463`);
  wowm has `u32`
  (`wow_message_parser/wowm/world/quest/smsg_quest_poi_query_response.wowm`).
  The quests come back in `unordered_set` order with duplicates removed
  (`Handlers/QueryHandler.cpp:423-425,432`).
- The client's `MSG_QUEST_PUSH_RESULT` is 13 bytes: the guid, a `uint32`
  quest id and a `uint8` result (`Server/Packets/QuestPackets.cpp:98-105`);
  wowm has no quest id
  (`wow_message_parser/wowm/world/quest/msg_quest_push_result.wowm`).
- The quest share result is AzerothCore's enum 0-10
  (`Quests/QuestDef.h:64-77`); the 3.3.5 wowm enum adds an 11,
  `DIFFERENT_SERVER_DAILY`, that AzerothCore does not define.
- `CMSG_NPC_TEXT_QUERY` is the `uint32` text id then the `uint64` giver
  guid (`Handlers/QueryHandler.cpp:274-282`).
- `SMSG_NPC_TEXT_UPDATE` carries its `CMSG_NPC_TEXT_QUERY` text id then
  exactly 8 options of `float` probability, two `CString` texts, a
  `uint32` language and 3 `uint32` delay/emote pairs
  (`Handlers/QueryHandler.cpp:286-355`). An unknown id answers 8
  zero-probability options with the text `Greetings $N`
  (`Handlers/QueryHandler.cpp:289-305`).
- `SMSG_GOSSIP_POI` carries `uint32` flags, `float` x, `float` y,
  `uint32` icon, `uint32` importance and a `CString` name, sent from a
  gossip option with a POI id while the dialog is still open
  (`Entities/Creature/GossipDef.cpp:247-270`).

## Left out

- `SMSG_QUEST_FORCE_REMOVE` is dead: see Proof.
- `CMSG_QUESTGIVER_HELLO`, `CMSG_QUESTGIVER_QUEST_AUTOLAUNCH`,
  `CMSG_QUESTLOG_SWAP_QUEST`, `CMSG_QUERY_QUESTS_COMPLETED` and
  `SMSG_QUERY_QUESTS_COMPLETED_RESPONSE`: built by `quests-9`.
- `CMSG_PUSHQUESTTOPARTY` and `MSG_QUEST_PUSH_RESULT`: built by
  `quests-7a`.
- `SMSG_QUEST_CONFIRM_ACCEPT` and `CMSG_QUEST_CONFIRM_ACCEPT`: built by
  `quests-7b`.

## Capabilities row

No verb yet: `quests-2` shows the marks in `look`.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_QUESTGIVER_STATUS_MULTIPLE` | `live` | probe flow `quests-marks`, exit 0; an empty list at login, then 11 givers with Erona at 8, and at 10 after `soap setup quest/add 8325` | `Entities/Player/Player.cpp:7906-7951` |
| `CMSG_QUEST_POI_QUERY` | `live` | probe flow `quests-poi` on a `fresh` character with quest 8325 staged offline (`--expect SMSG_QUEST_POI_QUERY_RESPONSE`), exit 0; the 8-byte query for [8325] drew the 180-byte reply | `Handlers/QueryHandler.cpp:411-420` |
| `SMSG_QUEST_POI_QUERY_RESPONSE` | `live` | probe flow `quests-poi`, exit 0; quest 8325 parsed `known` with 2 POIs, objective index -1 and 12 points matching base data (`data/sql/base/db_world/quest_poi.sql`, `data/sql/base/db_world/quest_poi_points.sql`); the character stands at (10349, -6357) inside the point cloud | `Handlers/QueryHandler.cpp:427-479` |
| `CMSG_NPC_TEXT_QUERY` | `live` | probe flow `quests-text` on a `fresh` character (`--expect SMSG_NPC_TEXT_UPDATE`), exit 0; the dialog's title text id drew the update, and text id 999999 drew the fallback | `Handlers/QueryHandler.cpp:274-282` |
| `SMSG_NPC_TEXT_UPDATE` | `live` | probe flow `quests-text`, exit 0; Magistrix Erona's greeting and the `Greetings $N` fallback for id 999999 | `Handlers/QueryHandler.cpp:286-355` |
| `SMSG_GOSSIP_POI` | `live` | probe flow `quests-gossip-poi` on an `elwynn1` character, exit 0; the Inn option drew the point | `Entities/Creature/GossipDef.cpp:247-270` |
| `SMSG_QUEST_FORCE_REMOVE` | `dead` | no file in `src/` or `modules/` names it outside the opcode enum and table, which marks it `STATUS_NEVER` | `Server/Protocol/Opcodes.cpp:673` |
