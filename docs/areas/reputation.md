# reputation

The `reputation` area keeps the character's standing with every faction
the server lists. World-service code reads it through
`session.areas.reputation.state()`: one row per faction with its
reputation list id, standing, rank and the rank's floor and ceiling, and
whether it is visible, at war, inactive or watched, most recently changed
first, plus the watched faction, the forced reactions and whether the
faction catalog loaded. The area emits `initialized`, `standing_changed`,
`visible`, `forced_changed` and `watched_changed` events.

The area also decides hostility for creatures of reputation factions.
Core's `targetRelation`, which `look` and the nearby rows use, reads the
area's `relationView()` act: a forced reaction for the target's faction
first, then the character's rank with a faction that has a reputation,
and only then the faction templates.

Names, base values and ranks come from `Faction.dbc` in the configured
data directory. Without that file the area keeps the server's deltas as
the standing and knows no name or rank.

In the harness, a standing change inside a rank logs the delta and the
place in the rank ("Silvermoon City reputation +250: Friendly
1250/6000."), a new rank logs the rank reached, and a standing change
that puts a faction at war (the event's `wasAtWar` is false and `atWar`
true) warns that its guards will attack the character. A faction made visible is logged as discovered, and a forced
reaction wakes the agent outside a run. `initialized` and
`watched_changed` write no row.

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
- `SMSG_SET_FORCED_REACTIONS` is a `uint32` count, then per entry a
  `uint32` `Faction.dbc` faction id (not a template or list id) and a
  `uint32` rank (`Reputation/ReputationMgr.cpp:165-176`). wow_messages
  says a `uint16` faction
  (`wow_message_parser/wowm/world/faction/smsg_set_forced_reactions.wowm`);
  AzerothCore wins. The packet is the whole list, so the area replaces
  its list, and `forced_changed` lists the added and removed entries. The
  server sends it at every login (`Entities/Player/Player.cpp:11809`).
- A force-reaction aura sends the whole forced list again each time it
  is applied or removed (`Spells/Auras/SpellAuraEffects.cpp:5692-5707`).
  No console command applies an aura
  (`scripts/Commands/cs_misc.cpp:97-101` is `Console::No`), so the proof
  of a non-empty list is the `area.test.ts` case built from
  `Reputation/ReputationMgr.cpp:167-173`.
- Hostility follows AzerothCore's order (`Entities/Unit/Unit.cpp:6830-7016`):
  a forced rank for the target template's faction wins
  (`Entities/Unit/Unit.cpp:6843-6855`, `:6960-6963`); for a faction with a
  reputation list id, a creature's reaction to the character is the
  character's rank, capped at Neutral while at war
  (`Entities/Unit/Unit.cpp:6973-6984`), and the templates are not
  consulted; ranks 0-1 are hostile and 4-7 friendly
  (`Entities/Unit/Unit.cpp:7008-7016`). Player targets keep the template
  rule: the server's player-versus-player branch
  (`Entities/Unit/Unit.cpp:6857-6906`), its forced rank for a player
  target, and pets it treats as player-controlled are not modelled.
- The watched faction is the player field
  `PLAYER_FIELD_WATCHED_FACTION_INDEX`; `0xFFFFFFFF` means none
  (`Entities/Player/Player.cpp:549`).

## Left out

- `CMSG_SET_FACTION_ATWAR`, `CMSG_SET_FACTION_INACTIVE` and
  `CMSG_SET_WATCHED_FACTION`: built by world-4.

## Capabilities row

Report its reputation with each faction and what changed it |
`t4-reputation-gain` | Only factions the server lists. Standing is the
Faction.dbc base plus the server's change; at war and inactive set by the
agent show only after the next login.

Limit for the `t0-hostiles` row: hostility of a creature follows the
character's reputation and forced reactions only when `Faction.dbc` is in
the data directory (forced reactions need no file); player targets use
the faction templates.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_INITIALIZE_FACTIONS` | `live` | probe flow `login` on a `fresh` character, exit 0; one received with 128 slots, and its 6 visible factions match `soap gm read reputation` | `Reputation/ReputationMgr.cpp:211-244` |
| `SMSG_SET_FACTION_STANDING` | `live` | probe flow `login` with `soap gm quest reward 8325`: list id 55 changed by 250 while `soap gm read reputation` showed Silvermoon City go from 4000 to 4250; the `quest reward 9148` run below, exit 0, also received and handled one | `Reputation/ReputationMgr.cpp:178-209` |
| `SMSG_SET_FORCED_REACTIONS` | `live` | probe flow `login` on an `eversong10` character, exit 0; one received with the empty list (body `00000000`) and handled. The non-empty list is the `area.test.ts` case (see the wire notes) | `Reputation/ReputationMgr.cpp:165-176` |
| `SMSG_SET_FACTION_VISIBLE` | `live` | probe flow `login` with `soap gm quest reward 9148`, exit 0; list id 56 shown, and `soap gm read reputation` then listed Tranquillien as visible at 250 | `Reputation/ReputationMgr.cpp:252-261` |
