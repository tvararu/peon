# quests

The `quests` area keeps the quest-giver marks the server sends for the
givers in view. World-service code reads them through
`session.areas.quests.state().marks`: one entry per giver guid with the
dialog status, when it arrived and whether it came from the multiple
packet or a single status reply. `markOf(status)` names a status as
`available`, `available_low`, `available_repeatable`, `reward`,
`incomplete` or `none`. The area emits a `marks` event only when a
giver's status changes, appears or goes away.

The runtime sends one `CMSG_QUESTGIVER_STATUS_MULTIPLE_QUERY` 500 ms
after the last trigger, and at most once every 2 s. A trigger is a unit
with the quest-giver NPC flag or a quest-giver game object coming into
view with no mark, an update that gives a unit the flag, or a quest
accepted, removed, completed or failed. A giver that leaves view loses its
mark. The acts are `queryGiverStatus(guid)`, which sends the single query
for a creature or game object in view, and `queryGiverStatuses()`, which
sends the multiple query at once.

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

## Left out

- `SMSG_QUEST_FORCE_REMOVE` is dead: see Proof.
- `CMSG_QUEST_POI_QUERY` and `SMSG_QUEST_POI_QUERY_RESPONSE`: built by
  `quests-3`.
- `CMSG_NPC_TEXT_QUERY`, `SMSG_NPC_TEXT_UPDATE` and `SMSG_GOSSIP_POI`:
  built by `quests-5`.
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
| `CMSG_QUESTGIVER_STATUS_QUERY` | `live` | probe flow `quests-marks` on a `fresh` character (`--expect` 0x418, 0x183), exit 0; the 8-byte query for Magistrix Erona drew `SMSG_QUESTGIVER_STATUS` with status 8, and 10 after `soap setup quest/add 8325` | `Handlers/QuestHandler.cpp:36-77` |
| `CMSG_QUESTGIVER_STATUS_MULTIPLE_QUERY` | `live` | probe flow `quests-marks`, exit 0; the debounced query after the givers came into view and the act's query each drew a 103-byte list of 11 givers | `Handlers/QuestHandler.cpp:620-623` |
| `SMSG_QUESTGIVER_STATUS_MULTIPLE` | `live` | probe flow `quests-marks`, exit 0; an empty list at login, then 11 givers with Erona at 8, and at 10 after `soap setup quest/add 8325` | `Entities/Player/Player.cpp:7906-7951` |
| `SMSG_QUEST_FORCE_REMOVE` | `dead` | no file in `src/` or `modules/` names it outside the opcode enum and table, which marks it `STATUS_NEVER` | `Server/Protocol/Opcodes.cpp:673` |
