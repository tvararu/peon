# achievements

The `achievements` area keeps the character's completed achievements and
criteria counters. World-service code reads it through
`session.areas.achievements.state()`: the number of completed
achievements, the five newest with their dates (`recent`, newest first)
and the number of criteria with progress. The server sends the full set at
login, a criteria update on every kill or level, and an earned notice for
the character and for players in range. The area emits
`achievement_earned` (with `self` true for the character's own),
`achievement_removed`, `criteria_removed` and `server_first`. A criteria
update emits no event, since it arrives on every kill. Events and the
snapshot carry achievement ids, not names.

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

## Left out

- Achievement names: the DBC directory of the live profile has no
  `Achievement.dbc`, so events and the snapshot carry ids (contract
  issue 2 of the social plan).
- `SMSG_TITLE_EARNED`: built by `social-4`.
- `CMSG_SET_TITLE`: built by `social-4`.

## Capabilities row

No verb.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_ALL_ACHIEVEMENT_DATA` | `live` | `mise protocol:probe --expect SMSG_ALL_ACHIEVEMENT_DATA` at login of an `eversong10-warrior`, exit 0; the body decodes to achievement 6 and 112 criteria with no byte left | `Achievements/AchievementMgr.cpp:2400-2404` |
| `SMSG_CRITERIA_UPDATE` | `live` | probe flow `achievements-level` (`--expect SMSG_CRITERIA_UPDATE`), exit 0; the flow killed its target and the store's criteria count rose from 112 to 118 | `Achievements/AchievementMgr.cpp:773-794` |
| `SMSG_ACHIEVEMENT_EARNED` | `live` | `mise protocol:probe --expect SMSG_ACHIEVEMENT_EARNED` while `soap gm level 20` raised the character from 10, exit 0; the body names the character and achievement 7 | `Achievements/AchievementMgr.cpp:765-770` |
| `SMSG_SERVER_FIRST_ACHIEVEMENT` | `mock` | `packages/core/src/wow/areas/achievements/area.test.ts`, "SMSG_SERVER_FIRST_ACHIEVEMENT emits server_first" | `Achievements/AchievementMgr.cpp:744-752` |
| `SMSG_CRITERIA_DELETED` | `mock` | `packages/core/src/wow/areas/achievements/area.test.ts`, "SMSG_CRITERIA_DELETED and SMSG_ACHIEVEMENT_DELETED drop the entries" | `Achievements/AchievementMgr.cpp:2195-2197` |
| `SMSG_ACHIEVEMENT_DELETED` | `mock` | `packages/core/src/wow/areas/achievements/area.test.ts`, "SMSG_CRITERIA_DELETED and SMSG_ACHIEVEMENT_DELETED drop the entries" | `Achievements/AchievementMgr.cpp:499-501` |
