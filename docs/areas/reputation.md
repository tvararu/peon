# reputation

The `reputation` area keeps the character's standing with every faction
the server lists. World-service code reads it through
`session.areas.reputation.state()`: one row per faction with its
reputation list id, standing, rank and the rank's floor and ceiling, and
whether it is visible, at war, inactive or watched, most recently changed
first, plus the watched faction and whether the faction catalog loaded.
The area emits `initialized`, `standing_changed`, `visible` and
`watched_changed` events.

Names, base values and ranks come from `Faction.dbc` in the configured
data directory. Without that file the area keeps the server's deltas as
the standing and knows no name or rank.

## Wire notes

- `SMSG_INITIALIZE_FACTIONS` is a `uint32` count (always 128), then per
  reputation list id 0-127 a `uint8` flags and a standing; list ids the
  character does not have are zeros
  (`Reputation/ReputationMgr.cpp:211-244`). wow_messages agrees
  (`wow_message_parser/wowm/world/faction/smsg_initialize_factions.wowm`).
- Every standing on the wire is the change from the `Faction.dbc` base
  value, not the reputation itself
  (`Reputation/ReputationMgr.cpp:426`), and it can be negative, so the
  area reads it as `int32`. The base is the first of four slots whose
  race and class masks match the character
  (`Reputation/ReputationMgr.cpp:91-111`).
- `SMSG_SET_FACTION_STANDING` is a `float` 0, a `uint8` "rank increased",
  a `uint32` count, then per entry a `uint32` reputation list id and the
  standing (`Reputation/ReputationMgr.cpp:178-209`). wow_messages keys
  each entry with a `uint16` faction
  (`wow_message_parser/wowm/world/faction/smsg_set_faction_standing.wowm`);
  AzerothCore wins, and a reader built from wow_messages misreads every
  entry after the first. The parser refuses a body too short for its
  count.
- `SMSG_SET_FACTION_VISIBLE` is a `uint32` reputation list id
  (`Reputation/ReputationMgr.cpp:259`); wow_messages says a `uint16`
  faction
  (`wow_message_parser/wowm/world/faction/smsg_set_faction_visible.wowm`).
  The server does not send it while the character loads
  (`Reputation/ReputationMgr.cpp:254-255`).
- When a standing falls to Hostile or below, the server sets `AT_WAR`,
  and when it rises from Hostile to Unfriendly or above on a faction every
  race starts in, it clears it (`Reputation/ReputationMgr.cpp:432-436`).
  Neither change reaches the client before the next login, so the area
  infers both the same way, and never sets `AT_WAR` on a faction with
  `PEACE_FORCED` (`Reputation/ReputationMgr.cpp:517-521`).
- The watched faction is the player field
  `PLAYER_FIELD_WATCHED_FACTION_INDEX`; `0xFFFFFFFF` means none
  (`Entities/Player/Player.cpp:549`).

## Left out

- `SMSG_SET_FORCED_REACTIONS`: built by world-5.
- `CMSG_SET_FACTION_ATWAR`, `CMSG_SET_FACTION_INACTIVE` and
  `CMSG_SET_WATCHED_FACTION`: built by world-4.

## Capabilities row

Report its reputation with each faction and what changed it |
`t4-reputation-gain` | Only factions the server lists. Standing is the
Faction.dbc base plus the server's change; at war and inactive set by the
agent show only after the next login.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_INITIALIZE_FACTIONS` | `live` | probe flow `login` on a `fresh` character, exit 0; one received with 128 slots, and its 6 visible factions match `soap gm read reputation` | `Reputation/ReputationMgr.cpp:211-244` |
| `SMSG_SET_FACTION_STANDING` | `live` | probe flow `login` with `soap gm quest reward 8325`: list id 55 changed by 250 while `soap gm read reputation` showed Silvermoon City go from 4000 to 4250; the `quest reward 9148` run below, exit 0, also received and handled one | `Reputation/ReputationMgr.cpp:178-209` |
| `SMSG_SET_FACTION_VISIBLE` | `live` | probe flow `login` with `soap gm quest reward 9148`, exit 0; list id 56 shown, and `soap gm read reputation` then listed Tranquillien as visible at 250 | `Reputation/ReputationMgr.cpp:252-261` |
