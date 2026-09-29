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
mark, or a quest accepted, removed, completed or failed. A giver that leaves
view loses its mark. The runtime also queues a `CMSG_QUEST_POI_QUERY`
when a quest is accepted, when the quest log changes, or through
`queryPoi(ids)`, in packets of at most 25 ids with duplicates removed.
It queries only ids above 0 with no entry or a `no_reply` entry, so
cached and in-flight quests are not asked again. A quest with no POIs
becomes `none`; an id with no reply after `REPLY_TIMEOUT_MS` (5000)
becomes `no_reply`, and the next log change queries it once more. The
acts are `queryGiverStatus(guid)`, which sends the single query
for a creature or game object in view, `queryGiverStatuses()`, which
sends the multiple query at once, and `queryPoi(ids)`, which returns the
known entries. `queryCompleted()` sends one
`CMSG_QUERY_QUESTS_COMPLETED` and refuses while a query waits for its
reply; the reply replaces `completed` (`{ ids, at }`) and emits
`completed` with `{ count }`, and a rewarded quest joins the ids in
silence. `questgiverHello(guid)` sends the 8-byte hello,
`autoLaunch()` sends the empty auto-launch, and `swapLogSlots(a, b)`
sends two `uint8` slots and refuses equal slots and slots of 25 or more.
The runtime sends the completed query once at login.

Quest sharing lives in `state().share` (`{ push, prior, offer }`; `prior`
holds the pushes whose members never answered so a late relay keeps its
quest id) and the `share` event (`{ type: "share", share }`), whose
`share.type` is `pushed`, `result`, `relayed`, `offered`, `answered`,
`expired` or `share_complete`. `shareQuest(questId)` refuses with
`not_in_log`, an id missing from the log or 0, `not_in_group` or
`in_flight`, and otherwise sends `CMSG_PUSHQUESTTOPARTY` and starts a push
that waits for results. Each `MSG_QUEST_PUSH_RESULT` adds
`{ guid, result, at }` and emits `result`, or `relayed` for a member's
later accept (2) or decline (3); a member whose row sits at result 0 never
blocks the next push, and its late relay is attributed to the newest push
it was still awaiting. A push with no result after `PUSH_TIMEOUT_MS`
(3000) becomes `no_answer` and emits `expired` with scope `push`, because
the server sends nothing for a quest it cannot share. A details packet
with a non-zero divider, no pending `core.quests` intent and a quest not
in the log opens `state().share.offer` (`from`, the sharer) and emits
`offered`; a quest already in the log, an auto-accept share, emits
`answered` with `auto_accepted` and opens no offer. A request-items packet
from a group member with no pending intent emits `share_complete`, and on
the sharer it also settles that member's pending push reply as a relayed
accept: for an auto-complete or zero-method quest the
`CMSG_PUSHQUESTTOPARTY` handler sends result 0 and then
`SMSG_QUESTGIVER_REQUEST_ITEMS` without setting the receiver's divider, so
no relay ever arrives (`Handlers/QuestHandler.cpp:588-594`).
`answerShare("decline")` sends the 13-byte push result 3 to the sharer
and emits `answered`; with no offer it returns false. An offer nobody
answers in `OFFER_TIMEOUT_MS` (60000) gets that decline and an `expired`
event with scope `offer`, while `SMSG_GOSSIP_COMPLETE` does not end an
offer. `answerShare("accept")` throws `not built`: quests-7b builds it.

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
- `CMSG_QUERY_QUESTS_COMPLETED` has no body, and the server answers
  with the rewarded ids (`Handlers/QuestHandler.cpp:625-637`).
- `SMSG_QUERY_QUESTS_COMPLETED_RESPONSE` is a `uint32` count, then one
  `uint32` quest id per rewarded quest
  (`Handlers/QuestHandler.cpp:627-636`).
- `CMSG_QUESTGIVER_HELLO` is the 8-byte giver guid
  (`Handlers/QuestHandler.cpp:79-83`). A nearby quest giver answers with
  a gossip or quest dialog (`Handlers/QuestHandler.cpp:96-108`).
- `CMSG_QUESTGIVER_QUEST_AUTOLAUNCH` has no body and its handler does
  nothing (`Server/Packets/QuestPackets.h:163-166`,
  `Handlers/QuestHandler.cpp:525-527`,
  `Server/Protocol/Opcodes.cpp:522`).
- `CMSG_QUESTLOG_SWAP_QUEST` is two `uint8` log slots; the server ignores
  equal slots and slots of 25 or more, the quest log size
  (`Server/Packets/QuestPackets.cpp:107-111`,
  `Handlers/QuestHandler.cpp:386-388`,
  `Server/Protocol/Opcodes.cpp:534`).
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
- The packet's `QuestShareMessage` is one of eleven answers
  (`Server/Packets/QuestPackets.h:114,160`); the enum underneath is
  AzerothCore's 0-10 (`Quests/QuestDef.h:64-77`).
- `CMSG_PUSHQUESTTOPARTY` is a `uint32` quest id
  (`Server/Packets/QuestPackets.cpp:123-126`). The `CMSG_PUSHQUESTTOPARTY`
  handler sends nothing for a quest the sharer cannot share
  (`Handlers/QuestHandler.cpp:531-532`).
- The push is refused locally as `not_in_log` unless `CanShareQuest`
  would hold on the sharer's log; a sharable quest there is shareable
  (`Entities/Player/PlayerQuest.cpp:1532-1552`).
- After that the `CMSG_PUSHQUESTTOPARTY` handler answers each group
  member on the same map, with no distance check, a member-guid
  `MSG_QUEST_PUSH_RESULT` among `HAVE_QUEST`, `FINISH_QUEST`,
  `CANT_TAKE_QUEST`, `LOG_FULL`, `BUSY` or `SHARING_QUEST`
  (`Handlers/QuestHandler.cpp:544-588`).
- Each `MSG_QUEST_PUSH_RESULT` carries the member's `uint64` guid and a
  `uint8` result (`Server/Packets/QuestPackets.cpp:70-76`), written by
  each `MSG_QUEST_PUSH_RESULT` send
  (`Entities/Player/PlayerQuest.cpp:2505-2515`).
- The receiver gets the quest after the sharing result. In the
  `CMSG_PUSHQUESTTOPARTY` handler, an auto-accept quest joins the
  receiver's log before the details
  (`Handlers/QuestHandler.cpp:590-592`): the packet is
  `SMSG_QUESTGIVER_REQUEST_ITEMS` for the sharer's guid when the quest
  is auto-complete or has no quest method
  (`Handlers/QuestHandler.cpp:593-594`), else the divider is set and
  `SMSG_QUESTGIVER_QUEST_DETAILS` carries the receiver's own guid as the
  giver and the sharer as the divider
  (`Handlers/QuestHandler.cpp:596-598`,
  `Entities/Creature/GossipDef.cpp:405-406`). An open divider makes the
  `CMSG_PUSHQUESTTOPARTY` handler answer `BUSY` to every later share
  (`Handlers/QuestHandler.cpp:582-586`).
- A decline is the client's 13-byte `MSG_QUEST_PUSH_RESULT` with the
  divider's guid; the `MSG_QUEST_PUSH_RESULT` handler relays it to the
  sharer as the receiver's result and clears the divider
  (`Handlers/QuestHandler.cpp:605-618`). An accept is relayed by the
  `CMSG_QUESTGIVER_ACCEPT_QUEST` handler instead
  (`Handlers/QuestHandler.cpp:154-161`).
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
- The hello reply reaches `QuestStore` with no pending intent, so it
  records `stale_dialog` (`quest-store.ts:278-283`). No verb sends hello;
  `interact do:talk` keeps `CMSG_GOSSIP_HELLO`, which reaches the same
  gossip path (`Server/Protocol/Opcodes.cpp:510`,
  `Handlers/NPCHandler.cpp:139`).
- `CMSG_QUEST_POI_QUERY` and `SMSG_QUEST_POI_QUERY_RESPONSE`: `live` in
  the Proof table below; built by `quests-3`.
- `CMSG_NPC_TEXT_QUERY`, `SMSG_NPC_TEXT_UPDATE` and `SMSG_GOSSIP_POI`:
  `live` in the Proof table below; built by `quests-5`.
- `CMSG_QUESTGIVER_HELLO`, `CMSG_QUESTGIVER_QUEST_AUTOLAUNCH`,
  `CMSG_QUESTLOG_SWAP_QUEST`, `CMSG_QUERY_QUESTS_COMPLETED` and
  `SMSG_QUERY_QUESTS_COMPLETED_RESPONSE`: `live`/`accepted` in the Proof
  table below; built by `quests-9`.
- `SMSG_QUEST_CONFIRM_ACCEPT` and `CMSG_QUEST_CONFIRM_ACCEPT`: built by
  `quests-7b`.

## Capabilities row

See which NPCs have a quest or a quest to turn in (`t4-quests-find-giver`, pass round 11 replica 2: `quests/marks` named Magistrix Erona available before the first `interact`, quest 8325 taken). Walk to where a quest's objective is (`t4-quests-poi-walk`): `journal about: "quests"` names the nearest objective region on the character's map with a `travel` call to its centroid, and the turn-in region once the quest is complete. Hear what an NPC says when talked to (`t1-quests-read-greeting`, pass round 22 replica 1: the answer quoted the greeting's first sentence word for word, holding the live phrase from title text id 16703). Follow a guard's directions to a marked point (`t1-quests-guard-directions`, pass round 21 replica 1: `quests/gossip_poi` for the Lion's Pride Inn, final position at the live POI point).

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_QUESTGIVER_STATUS_QUERY` | `live` | probe flow `quests-marks` on a `fresh` character (`--expect` 0x418, 0x183), exit 0; the 8-byte query for Magistrix Erona drew `SMSG_QUESTGIVER_STATUS` with status 8, and 10 after `soap setup quest/add 8325` | `Handlers/QuestHandler.cpp:36-77` |
| `CMSG_QUESTGIVER_STATUS_MULTIPLE_QUERY` | `live` | probe flow `quests-marks`, exit 0; the debounced query after the givers came into view and the act's query each drew a 103-byte list of 11 givers | `Handlers/QuestHandler.cpp:620-623` |
| `SMSG_QUESTGIVER_STATUS_MULTIPLE` | `live` | probe flow `quests-marks`, exit 0; an empty list at login, then 11 givers with Erona at 8, and at 10 after `soap setup quest/add 8325` | `Entities/Player/Player.cpp:7906-7951` |
| `CMSG_QUEST_POI_QUERY` | `live` | probe flow `quests-poi` on a `fresh` character with quest 8325 staged offline (`--expect SMSG_QUEST_POI_QUERY_RESPONSE`), exit 0; the 8-byte query for [8325] drew the 180-byte reply | `Handlers/QueryHandler.cpp:411-420` |
| `SMSG_QUEST_POI_QUERY_RESPONSE` | `live` | probe flow `quests-poi`, exit 0; quest 8325 parsed `known` with 2 POIs, objective index -1 and 12 points matching base data (`data/sql/base/db_world/quest_poi.sql`, `data/sql/base/db_world/quest_poi_points.sql`); the character stands at (10349, -6357) inside the point cloud | `Handlers/QueryHandler.cpp:427-479` |
| `CMSG_NPC_TEXT_QUERY` | `live` | probe flow `quests-text` on a `fresh` character (`--expect SMSG_NPC_TEXT_UPDATE`), exit 0; the dialog's title text id drew the update, and text id 999999 drew the fallback | `Handlers/QueryHandler.cpp:274-282` |
| `SMSG_NPC_TEXT_UPDATE` | `live` | probe flow `quests-text`, exit 0; Magistrix Erona's greeting (title text id 16703) and the `Greetings $N` fallback for id 999999 | `Handlers/QueryHandler.cpp:286-355` |
| `SMSG_GOSSIP_POI` | `live` | probe flow `quests-gossip-poi` on an `elwynn10` character next to a Stormwind Guard (entry 1423), exit 0; the Inn gossip option drew the Lion's Pride Inn point (-9459, 42.08), and eval `t1-quests-guard-directions` (pass round 21 replica 1) wrote `quests/gossip_poi` and ended at the point | `Entities/Creature/GossipDef.cpp:247-270` |
| `SMSG_QUEST_FORCE_REMOVE` | `dead` | no file in `src/` or `modules/` names it outside the opcode enum and table, which marks it `STATUS_NEVER` | `Server/Protocol/Opcodes.cpp:673` |
| `CMSG_QUESTGIVER_HELLO` | `live` | probe flow `quests-extras` on a `fresh` character with quests 8324 and 8326 active, teleported to map 530 near Magistrix Erona (entry 15278): the 8-byte hello drew `SMSG_GOSSIP_MESSAGE` and `QuestStore` recorded `stale_dialog` | `Handlers/QuestHandler.cpp:79-108` |
| `CMSG_QUESTGIVER_QUEST_AUTOLAUNCH` | `accepted` | probe flow `quests-extras`, exit 0, missing []: the empty packet drew no error packet, the session stayed up, and the client's 8-byte `CMSG_PING` (seq 1) after the auto-launch drew `SMSG_PONG` (`ping: {seq 1, rttMs 1}`) | `Handlers/QuestHandler.cpp:525-527` |
| `CMSG_QUESTLOG_SWAP_QUEST` | `live` | probe flow `quests-extras`: slots 0 and 1 held quests 8324 and 8326 before, 8326 and 8324 after | `Server/Packets/QuestPackets.cpp:107-111` |
| `CMSG_QUERY_QUESTS_COMPLETED` | `live` | probe flow `quests-extras --bodies`, exit 0, missing []: the login query drew `SMSG_QUERY_QUESTS_COMPLETED_RESPONSE` with an 8-byte body decoding to count 1, quest 8326, and `soap truth rewardedQuests` on the same character agreed (`[8326]`, after `soap gm quest add/complete/reward 8326`) | `Handlers/QuestHandler.cpp:625-637` |
| `SMSG_QUERY_QUESTS_COMPLETED_RESPONSE` | `live` | same run: the reply body decodes to count 1, quest 8326, matching `soap truth rewardedQuests` (`[8326]`) | `Handlers/QuestHandler.cpp:627-636` |
| `CMSG_PUSHQUESTTOPARTY` | `live` | two `fresh` characters (sharer FAC6ABB8F15BF with 8326 staged offline, partner FAC6ABB8F16B9 with 8325 rewarded offline so `CanTakeQuest` holds for 8326): partner `call invite`/`call acceptInvite` formed the group; `mise protocol:probe FAC6ABB8F15BF --flow quests-share --arg relay=40 --expect MSG_QUEST_PUSH_RESULT` sent the 4-byte 8326 push drawing result 0 for the partner, then result 3 relayed after the partner ran `call answerShare ["decline"]` (the 13-byte form is that decline, the client's `MSG_QUEST_PUSH_RESULT`, answered by the `MSG_QUEST_PUSH_RESULT` row below) | `Handlers/QuestHandler.cpp:531-598` |
| `MSG_QUEST_PUSH_RESULT` | `live` | same run: the flow printed both results for the partner (`{ guid 0xeec, result 0 }` then `{ result 3 }`), the sharer's `events --json` held `share` `{ type "pushed" }`, `{ type "result", result 0 }` and `{ type "relayed", result 3 }`, the sharing row itself drawn from the handler's `SendPushToPartyResponse` reply, and the partner's `events --json` held `share` `{ type "offered", from 3819, title "Unfortunate Measures" }` then `{ type "answered", answer "decline" }` | `Handlers/QuestHandler.cpp:605-618` |
