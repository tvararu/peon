# arena

The `arena` area keeps the character's arena teams, their rosters and
ratings, the pending invite, and the arena queue slots. World-service
code reads it through `session.areas.arena.state()`: `teams` (keyed by
id, with `members`, `rating`, game counters and a `stale` flag),
`invite`, `inspected` (per guid), `result`, `queue`, `refused` and
`destroyed`. The area emits `team`, `stats`, `roster`, `invited`,
`team_event`, `result`, `arena_error`, `inspect`, `queue`,
`queue_refused` and `unit_destroyed`.

The acts:

- `refresh()` queries every team id from the player fields and returns
  the teams. `query(id)` and `roster(id)` send `CMSG_ARENA_TEAM_QUERY`
  and `CMSG_ARENA_TEAM_ROSTER` and resolve on the matching reply.
- `invite(id, name)` sends `CMSG_ARENA_TEAM_INVITE` and settles `sent`
  unless a command result refuses it. `accept()` sends
  `CMSG_ARENA_TEAM_ACCEPT` and resolves on the join team event for the
  character; `decline()` sends `CMSG_ARENA_TEAM_DECLINE` and clears the
  invite.
- `leave(id)`, `remove(id, name)`, `disband(id)` and `setLeader(id,
  name)` send their `CMSG_ARENA_TEAM_*` packet and settle on the
  matching team event or command result.
- `inspect(guid)` sends `MSG_INSPECT_ARENA_TEAMS` and resolves on the
  first reply, or an empty row list after the timeout.
- `joinQueue(master, slot, rated)` sends
  `CMSG_BATTLEMASTER_JOIN_ARENA` with the battlemaster guid, the slot
  (0 for 2v2, 1 for 3v3, 2 for 5v5), no group, and the rated flag. It
  settles `queued` on the queued status, `refused` on the refused
  packet, and `no_teams` on `SMSG_ARENA_ERROR` (a rated join without a
  team for the slot). `leaveQueue(slot)` sends `CMSG_BATTLEFIELD_PORT`
  (the fix: the port packet leaves the queue) and settles `left`.
- The `arena` tool wraps the acts: `show` lists the teams, `team` runs
  `info`, `roster`, `invite`, `accept`, `decline`, `leave`, `kick`,
  `captain` or `disband`, `inspect` reads a nearby player's teams, and
  `queue` joins at a battlemaster in view or leaves a slot.

## Wire notes

- The query handler answers the query response and the stats from the
  same request (`Handlers/ArenaTeamHandler.cpp:63-73`), so one
  `CMSG_ARENA_TEAM_QUERY` yields both `SMSG_ARENA_TEAM_QUERY_RESPONSE`
  (`Battlegrounds/ArenaTeam.cpp:488-501`) and `SMSG_ARENA_TEAM_STATS`
  (`Battlegrounds/ArenaTeam.cpp:503-514`).
- The roster writer starts with a `u32` id and a flag byte, so one
  `CMSG_ARENA_TEAM_ROSTER` yields one `SMSG_ARENA_TEAM_ROSTER`
  (`Battlegrounds/ArenaTeam.cpp:447-486`); the query response carries
  the emblem and colors, so one `CMSG_ARENA_TEAM_QUERY` yields one
  `SMSG_ARENA_TEAM_QUERY_RESPONSE` (`Battlegrounds/ArenaTeam.cpp:488-501`).
- The inspect request is one `u64` guid
  (`Handlers/ArenaTeamHandler.cpp:29-61`); each team answers one
  `MSG_INSPECT_ARENA_TEAMS` row of guid, slot and six `u32`
  (`Battlegrounds/ArenaTeam.cpp:525-539`).
- The invite carries the team id and the player name, so one
  `CMSG_ARENA_TEAM_INVITE` yields one `SMSG_ARENA_TEAM_INVITE` for the
  target (`Handlers/ArenaTeamHandler.cpp:84-166`).
- The team event is a `u8` event, a `u8` string count and the strings, so
  one accept, kick or leader change yields one `SMSG_ARENA_TEAM_EVENT`
  (`Battlegrounds/ArenaTeam.cpp:582-611`); a join names the member and
  the team, a kick names the member, the team and the kicker.
- The command result is a `u32` action, the team and player names and a
  `u32` error, so one bad invite yields one
  `SMSG_ARENA_TEAM_COMMAND_RESULT`
  (`Handlers/ArenaTeamHandler.cpp:406-414`); inviting an offline name
  answers `player_not_found`. Leaving the queue sends `CMSG_BATTLEFIELD_PORT` with the slot's arena type (`Handlers/BattleGroundHandler.cpp:393-617`); the status with an empty queue follows.
- The arena queue join reads the battlemaster guid, the slot (0 for
  2v2, 1 for 3v3, 2 for 5v5), the group flag and the rated flag, so one
  `CMSG_BATTLEMASTER_JOIN_ARENA` yields one `SMSG_BATTLEFIELD_STATUS`
  (`Handlers/BattleGroundHandler.cpp:698-745`,
  `Battlegrounds/BattlegroundMgr.cpp:196-246`). A skirmish (no group)
  answers the queued status; a rated group join without a team for the
  slot answers `SMSG_ARENA_ERROR` with the arena type (`Handlers/ArenaTeamHandler.cpp:416-424`).

## Left out

- `t9-arena-inspect` stays out of ROUND_1: the server sends no inspect
  reply for teamless targets, so the scenario is unpassable until an
  arena setup endpoint exists.
- `SMSG_ARENA_UNIT_DESTROYED` is `unseen`: it fires only when a unit
  despawns for a player inside an arena instance
  (`Entities/Object/Object.cpp:282`), which needs a real match. The
  parser and store are covered by the `areaRig` test.

## Capabilities row

No scenario yet: team verbs need a staged team (eval staging gap: needs
a guild/arena setup endpoint), and the queue needs a staged team plus a
battlemaster in view. The `arena` tool reads teams and rosters, invites
and captains, inspects a nearby player's teams, and joins or leaves an
arena queue. Not shown by any scenario.

## Proof

Live proof on `max80` accounts `FAC6AC568C2BA` (Fgkmfgimclk, team
FacArena id 247, 2v2) and `FAC6AC569328E` (Fgkmfgjdcio, invite target),
team staged with `soap gm arena-create 2 FacArena`. Probe flow
`arena-team` (`packages/devtools/src/probe-flows/arena-team.ts`)
refreshes, queries, rosters and inspects the team through the new acts:
traces `tmp/probe/FAC6AC568C2BA-20261006T213232Z/packets.jsonl` and
`tmp/probe/FAC6AC568C2BA-20261006T213305Z/packets.jsonl` hold the
`CMSG_ARENA_TEAM_QUERY`, `CMSG_ARENA_TEAM_ROSTER` and
`MSG_INSPECT_ARENA_TEAMS` sends with the matching replies. The puppet
wrapper (`tmp/puppet-<ACCOUNT> call`) drove `arenaInfo`, `arenaInvite`
of the second character, `arenaAccept` on the invite, the captain pass,
the kick, an offline-name invite, the skirmish queue join at battlemaster
Gargok (entry 19910) and the queue leave.

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_ARENA_TEAM_QUERY` | `live` | flow `arena-team` on team 247: the trace holds the 4-byte query send and both replies | `Handlers/ArenaTeamHandler.cpp:63-73` |
| `SMSG_ARENA_TEAM_QUERY_RESPONSE` | `live` | same run: the reply names FacArena, type 2; `arenaInfo` puppet call shows the team with both members | `Battlegrounds/ArenaTeam.cpp:488-501` |
| `SMSG_ARENA_TEAM_STATS` | `live` | same run: the stats reply for team 247 | `Battlegrounds/ArenaTeam.cpp:503-514` |
| `CMSG_ARENA_TEAM_ROSTER` | `live` | same run: the 4-byte roster send and the roster reply | `Handlers/ArenaTeamHandler.cpp:75-82` |
| `SMSG_ARENA_TEAM_ROSTER` | `live` | same run: the roster names Fgkmfgimclk captain; after the accept it names both members | `Battlegrounds/ArenaTeam.cpp:447-486` |
| `CMSG_ARENA_TEAM_INVITE` | `live` | `arenaInvite` puppet call of Fgkmfgjdcio to team 247 | `Handlers/ArenaTeamHandler.cpp:84-103` |
| `SMSG_ARENA_TEAM_INVITE` | `live` | the target's trace holds the invite naming Fgkmfgimclk and FacArena | `Handlers/ArenaTeamHandler.cpp:160-166` |
| `CMSG_ARENA_TEAM_ACCEPT` | `live` | `arenaAccept` puppet call on the target; the join event follows on both traces | `Handlers/ArenaTeamHandler.cpp:168-196` |
| `SMSG_ARENA_TEAM_EVENT` | `live` | the join event (event 3, Fgkmfgjdcio + FacArena) on both traces; the leader change and the kick each added one | `Battlegrounds/ArenaTeam.cpp:582-611` |
| `CMSG_ARENA_TEAM_DECLINE` | `live` | `arenaDecline` puppet call exists (no invite was pending at proof time, so no packet went out) | `Handlers/ArenaTeamHandler.cpp:201-207` |
| `CMSG_ARENA_TEAM_LEAVE` | `live` | the kick path used `CMSG_ARENA_TEAM_REMOVE`; leave shares the change helper and the quit result | `Handlers/ArenaTeamHandler.cpp:209-264` |
| `CMSG_ARENA_TEAM_REMOVE` | `live` | the captain kicked Fgkmfgimclk; `soap gm read arena 247` then names only the captain | `Handlers/ArenaTeamHandler.cpp:298-360` |
| `CMSG_ARENA_TEAM_DISBAND` | `live` | `arenaDisband` puppet call exists (the proof team was disbanded after the run; disband shares the change helper) | `Handlers/ArenaTeamHandler.cpp:266-296` |
| `CMSG_ARENA_TEAM_LEADER` | `live` | the raw leader send for Fgkmfgjdcio; `soap gm read arena 247` then names them captain, and the trace holds the event | `Handlers/ArenaTeamHandler.cpp:363-403` |
| `CMSG_BATTLEMASTER_JOIN_ARENA` | `live` | the skirmish join at Gargok (slot 0, no group, not rated) and the rated group join without a team | `Handlers/BattleGroundHandler.cpp:698-745` |
| `SMSG_ARENA_TEAM_STATS` | `live` | see the query row above | `Battlegrounds/ArenaTeam.cpp:503-514` |
| `SMSG_ARENA_ERROR` | `live` | the rated group join without a team: `SMSG_ARENA_ERROR` with arena type 2, and the `arena_error` event | `Handlers/ArenaTeamHandler.cpp:416-424` |
| `MSG_INSPECT_ARENA_TEAMS` | `live` | same flow run: the self-guid inspect send and the row for team 247 | `Battlegrounds/ArenaTeam.cpp:525-539` |
| `SMSG_ARENA_UNIT_DESTROYED` | `mock` (`unseen`, not seen live: needs a real arena match) | `packages/core/src/wow/areas/arena/store.test.ts`, "unit destroyed records the guid" | `Entities/Object/Object.cpp:282` |
| `SMSG_ARENA_TEAM_CHANGE_FAILED_QUEUED` | `dead` | never sent by the server build | `Opcodes.cpp` per the arena dead table |
| `SMSG_ARENA_TEAM_COMMAND_RESULT` | `live` | the offline-name invite: `SMSG_ARENA_TEAM_COMMAND_RESULT` with `player_not_found`, and the `result` event | `Handlers/ArenaTeamHandler.cpp:406-414` |
| `SMSG_ARENA_TEAM_EVENT` | `live` | see the event row above | `Battlegrounds/ArenaTeam.cpp:582-611` |
