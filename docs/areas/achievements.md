# achievements

The `achievements` area keeps the character's completed achievements and
criteria counters, plus the known and chosen titles. World-service code
reads it through `session.areas.achievements.state()`: the number of
completed achievements, the five newest with their dates (`recent`,
newest first), the number of criteria with progress, and `titles`
(`known` bit indexes, `chosen` bit index, 0 for none). The server sends
the full set at login, a criteria update on every kill or level, and an
earned notice for the character and for players in range. The area emits
`achievement_earned` (with `self` true for the character's own),
`achievement_removed`, `criteria_removed`, `title_changed` and
`server_first`. A criteria update emits no event, since it arrives on
every kill. Events and the snapshot carry achievement ids, not names,
and title bit indexes, not `CharTitles` ids.

## Wire notes

- `SMSG_ALL_ACHIEVEMENT_DATA` is the all-data body alone
  (`Achievements/AchievementMgr.cpp:2400-2404`), and
  `SMSG_RESPOND_INSPECT_ACHIEVEMENTS` is the same body after a packed guid
  (`Achievements/AchievementMgr.cpp:2407-2411`), so the parser lives in
  `packages/core/src/wow/protocol/achievement-data.ts` and reads from the
  reader's position.
- The all-data body is a list of completed achievements (`u32` id and
  packed time), ended by an `int32` of -1, then a list of criteria (`u32`
  id, packed counter, packed player guid, `u32` flags, packed time, two
  `u32` elapsed values), ended by -1
  (`Achievements/AchievementMgr.cpp:2418-2449`). Hidden achievements are
  left out (`Achievements/AchievementMgr.cpp:2421-2425`).
- The criteria counter is packed like a guid
  (`Achievements/AchievementMgr.cpp:779`) and can pass 2^32; the area
  keeps it as a `bigint`.
- The first field of `SMSG_CRITERIA_UPDATE` is a criteria id
  (`Achievements/AchievementMgr.cpp:776`); wow_messages names it
  `achievement` (`wow_message_parser/wowm/world/achievement/smsg_criteria_update.wowm`).
  AzerothCore wins.
- `SMSG_ACHIEVEMENT_EARNED` goes to every player in say range
  (`Achievements/AchievementMgr.cpp:765-770`), so its packed guid may name
  another player. Only the character's own changes the set.
- The link type at the end of `SMSG_SERVER_FIRST_ACHIEVEMENT` is a `u32`
  (`Achievements/AchievementMgr.cpp:736,749`); wow_messages has a `u8`
  (`wow_message_parser/wowm/world/achievement/smsg_server_first_achievement.wowm`).
  AzerothCore wins. Link 0 is the guild form and the plain-name form sent
  to the other faction, link 1 the player form.
- `SMSG_TITLE_EARNED` is a `u32` title bit index and a `u32` flag (1
  earned, 0 lost) (`Entities/Player/Player.cpp:13680-13683`).
- `CMSG_SET_TITLE` is an `int32` title bit index: a value above 0 and
  below `MAX_TITLE_INDEX` (192) that the player knows sets
  `PLAYER_CHOSEN_TITLE`, a known-check failure sends nothing, and
  anything else clears the field to 0
  (`Handlers/MiscHandler.cpp:1236-1251`). The wire value is the bit
  index, not the `CharTitles` id: achievement 2188's reward row gives
  title id 143, whose `CharTitles.dbc` row is bit index 110.
- The known titles live in the three `u64` known-title fields starting at
  word 626 of the player update fields, low word first, with the chosen
  bit index in word 321. The `setTitle` act refuses a bit the character
  does not know, so the server's silent drop is never relied on; the
  lost form of `SMSG_TITLE_EARNED` (flag 0) is not sent live because
  `.titles remove` is console-only.

## Left out

- Achievement names: the DBC directory of the live profile has no
  `Achievement.dbc`, so events and the snapshot carry ids (contract
  issue 2 of the social plan).
- Title names: ids only, no `CharTitles.dbc` catalog.

## Capabilities row

No verb.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_ALL_ACHIEVEMENT_DATA` | `live` | `mise protocol:probe --expect SMSG_ALL_ACHIEVEMENT_DATA` at login of an `eversong10-warrior`, exit 0; the body decodes to achievement 6 and 112 criteria with no byte left | `Achievements/AchievementMgr.cpp:2400-2404` |
| `SMSG_CRITERIA_UPDATE` | `live` | probe flow `achievements-level` (`--expect SMSG_CRITERIA_UPDATE`), exit 0; the flow killed its target and the store's criteria count rose from 112 to 118 | `Achievements/AchievementMgr.cpp:773-794` |
| `SMSG_ACHIEVEMENT_EARNED` | `live` | `mise protocol:probe --expect SMSG_ACHIEVEMENT_EARNED` while `soap gm level 20` raised the character from 10, exit 0; the body names the character and achievement 7 | `Achievements/AchievementMgr.cpp:765-770` |
| `SMSG_SERVER_FIRST_ACHIEVEMENT` | `mock` | `packages/core/src/wow/areas/achievements/area.test.ts`, "SMSG_SERVER_FIRST_ACHIEVEMENT emits server_first" | `Achievements/AchievementMgr.cpp:744-752` |
| `SMSG_CRITERIA_DELETED` | `live` | `mise protocol:probe FAC6ABF75C999 --expect SMSG_ACHIEVEMENT_DELETED --expect SMSG_CRITERIA_DELETED --wait 60` while `mise factory soap gm FAC6ABF75C999 reset-achievements` ran, exit 3 on the missing achievement row only; the trace `tmp/probe/title-run3-packets.jsonl` holds 46 `SMSG_CRITERIA_DELETED` rows (first at 1790932770338) and no `SMSG_ACHIEVEMENT_DELETED` row, because the reset found no completed achievement left to delete | `Achievements/AchievementMgr.cpp:2195-2197` |
| `SMSG_ACHIEVEMENT_DELETED` | `mock` | `packages/core/src/wow/areas/achievements/area.test.ts`, "SMSG_CRITERIA_DELETED and SMSG_ACHIEVEMENT_DELETED drop the entries"; not seen live: the reset run above sent no such row since no completed achievement remained | `Achievements/AchievementMgr.cpp:499-501` |
| `SMSG_TITLE_EARNED` | `live` | `mise protocol:probe FAC6ABF75C999 --flow achievements-title --expect SMSG_TITLE_EARNED --wait 90 --bodies`, exit 0, after `mise factory soap gm FAC6ABF75C999 achievement 2188`; the trace `tmp/probe/title-run1-packets.jsonl` holds `SMSG_TITLE_EARNED` body `6e000000 01000000` (bit index 110, earned 1) | `Entities/Player/Player.cpp:13680-13683` |
| `CMSG_SET_TITLE` | `live` | same run: the flow chose bit 110 then cleared it; the trace holds `CMSG_SET_TITLE` bodies `6e000000` and `ffffffff`, and the flow result reports bit 110 with the chosen title applied then cleared | `Handlers/MiscHandler.cpp:1236-1251` |
