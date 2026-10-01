# talents

The `talents` area keeps the talent state the server sends at every
login and every level change. World-service code reads it through
`session.areas.talents.state()`: the player form (free points, spec
count, active spec, and per spec the talents and six glyph ids), the pet
form, the four talent and glyph fields of the character, and one entry
per glyph slot with its slot type, whether it is unlocked and the glyph
of the active spec. The area emits `info` on every player-form packet,
with the talents, glyphs, free points and active spec that changed since
the last one; `points` when the free points went up; and `pet_info` for
the pet form. The game log gets a `talents/points` row for new points
and one `talents/learned` row for each talent that gained a rank.

## Wire notes

AzerothCore and wow_messages agree on the `SMSG_TALENTS_INFO` layout
(`wow_message_parser/wowm/world/spell/smsg_talents_info.wowm`).

- `SMSG_TALENTS_INFO` starts with a type byte: 0 for the player form, 1
  for the pet form (`Entities/Player/Player.cpp:14840-14849`). Its talent
  id is a raw `u32`; wow_messages types it as its `Talent` enum.
- `CMSG_LEARN_TALENT` is the talent id then the 0-based wire rank, two
  `u32`, answered by one `SMSG_TALENTS_INFO`
  (`Handlers/SkillHandler.cpp:25-32`).
- `CMSG_LEARN_PREVIEW_TALENTS` is a `u32` count then id and rank pairs
  in order; the server learns at most 150 and drops the rest, then
  answers with one `SMSG_TALENTS_INFO`
  (`Handlers/SkillHandler.cpp:34-56`).

The server sends the player form at every login
(`Entities/Player/Player.cpp:11786`) and at every level change
(`Entities/Player/Player.cpp:2610`), with no level check; a console
level change brings two equal copies. The level field
update comes after it, so the level the client knows is still the old
one when the packet arrives. The pet form comes when a pet loads
(`Entities/Pet/Pet.cpp:451`), for example at the login of a hunter with
a pet, and at a reconnect to a character that is still in the world
(`Handlers/CharacterHandler.cpp:1270`), not at every login.

The player form is the free points, the spec count and the active spec,
then per spec a talent count, the talent ids with their ranks, a glyph
count and the glyph ids (`Entities/Player/Player.cpp:14734-14766`). The
server always writes six glyphs per spec. The pet form with no pet stops
after the free points and a zero talent count, so it is six bytes
(`Entities/Player/Player.cpp:14770-14778`).

Ranks on the wire are 0-based: rank 0 means one point spent
(`Entities/Player/Player.cpp:14368`; `MAX_TALENT_RANK` is 5 at
`src/server/shared/DataStores/DBCStructure.h:1954`). The area stores the
wire rank and shows ranks held, 1-based, in its events and rows. The six
glyph slots come from `MAX_GLYPH_SLOT_INDEX`
(`src/server/shared/SharedDefines.h:664`). Bit i of the glyphs-enabled
field unlocks slot i, and the bits do not follow slot order
(`Entities/Player/Player.cpp:13614-13625`), so the area reads the bits
and keeps no level table.

- `CMSG_REMOVE_GLYPH` carries a slot index, not a glyph id; the server
  drops a slot of 6 or more (`Handlers/CharacterHandler.cpp:1606-1612`).
  wow_messages names the field `glyph`
  (`wow_message_parser/wowm/world/spell/cmsg_remove_glyph.wowm`).

The talent catalog loads four client DBC files once at start. `Talent.dbc`
holds 23 fields of 92 bytes: the talent id, its tab, row and column, five
rank spell ids at 4-8, the prerequisite talent at 13 with its rank at 16
(`src/server/shared/DataStores/DBCStructure.h:1958-1973`,
`src/server/shared/DataStores/DBCfmt.h:121`). `TalentTab.dbc` holds 24
fields of 96 bytes: the tab id, the class mask at 20, the pet mask at 21
and the tab page at 22; the tab name is the enUS locale string at field 1
(`src/server/shared/DataStores/DBCStructure.h:1975-1986`,
`src/server/shared/DataStores/DBCfmt.h:122`). `GlyphProperties.dbc` holds
4 fields of 16 bytes: the glyph id, its spell id and its slot type flags
(`src/server/shared/DataStores/DBCStructure.h:1059-1065`,
`src/server/shared/DataStores/DBCfmt.h:58`). `GlyphSlot.dbc` holds 3
fields of 12 bytes: the slot type id, its type flags and its order
(`src/server/shared/DataStores/DBCStructure.h:1067-1072`,
`src/server/shared/DataStores/DBCfmt.h:59`). A glyph goes in a slot whose
type flags match (`Entities/Player/PlayerStorage.cpp:5944`), and the
server fills slot index `Order - 1` with each ordered slot type at login
(`Entities/Player/Player.cpp:13605-13610`).

A reset starts with the gossip option "I wish to unlearn my talents" at a
class trainer (`Entities/Player/PlayerGossip.cpp:96-98`). The first
reset costs 1 gold, the second 5 gold, then 10 gold and up in steps of 5
(`Entities/Player/Player.cpp:3844-3850`).

The server answers the option with `MSG_TALENT_WIPE_CONFIRM`: the trainer
guid then the cost in copper, never a refusal, even for a character with
nothing spent (`Entities/Player/Player.cpp:9125-9132`). The client
confirms with the same opcode and the trainer guid alone
(`Handlers/SkillHandler.cpp:58-63`). The server then resets and sends
`SMSG_TALENTS_INFO` (`Handlers/SkillHandler.cpp:81-86`), and closes the
gossip window when it sends the offer. The area keeps the offer for 30
seconds or until the next player-form `SMSG_TALENTS_INFO`.

A `MSG_TALENT_WIPE_CONFIRM` from the server with guid 0 and cost 0 means
the reset did not happen (`Handlers/SkillHandler.cpp:78-84`). Two causes
give the same packet. With nothing spent, the server returns before the
money check. With too little money it zeroes the used-talent counter
first, sends `SMSG_BUY_FAILED` with result 2 and guid 0
(`Entities/Player/PlayerStorage.cpp:4201-4209`), and returns false, so
the handler also sends the guid-0 reply. The area starts
recording right before it sends the confirmation and counts only a
`SMSG_BUY_FAILED` with result 2, guid 0 and item 0, and the act reports
`not_enough_money` for it.

An ordinary buyback money failure carries the creature guid and the item
entry (`Handlers/ItemHandler.cpp:768`), so an unrelated purchase failure
cannot change the result.

## Left out

- `CMSG_REMOVE_GLYPH`: built by `talents-5a`.
- `CMSG_UNLEARN_TALENTS` and `SMSG_TALENTS_INVOLUNTARILY_RESET`: dead.

## Capabilities row

Added by talents-3b.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_TALENTS_INFO` | `live` | probe flow `login` with `--expect SMSG_TALENTS_INFO`, exit 0, on a `fresh`, an `eversong10-warrior` and an `eversong10-hunter` account; the hunter login also brought the six-byte pet form. A harness run on the warrior with `soap gm level 12` received two player forms with 2 free points and wrote one `talents/points` row | `Entities/Player/Player.cpp:14840-14849` |
| `CMSG_LEARN_TALENT` | `live` | probe flow `talents-learn --arg plan=124:1` on a fresh level-13 `eversong10-warrior` (template holds 124 at wire rank 0, 3 free): one `7c 00 00 00 01 00 00 00` went out and one `SMSG_TALENTS_INFO` answered with talent 124 at wire rank 1 and 2 free | `Handlers/SkillHandler.cpp:25-32` |
| `CMSG_LEARN_PREVIEW_TALENTS` | `live` | probe flow `talents-learn --arg plan=124:2,130:0` on the same character (2 free left): one `02 00 00 00 82 00 00 00 00 00 00 00 7c 00 00 00 02 00 00 00` went out and one `SMSG_TALENTS_INFO` answered with 0 free and talents 124 at wire rank 2 and 130 at wire rank 0. Account deleted | `Handlers/SkillHandler.cpp:34-56` |
| `CMSG_UNLEARN_TALENTS` | `dead` | registered `STATUS_NEVER` with `Handle_NULL`; resets go through `MSG_TALENT_WIPE_CONFIRM` | `Server/Protocol/Opcodes.cpp:662` |
| `SMSG_TALENTS_INVOLUNTARILY_RESET` | `dead` | no writer in AzerothCore `src/`, only its registration; wow_messages says it exists only as a comment | `Server/Protocol/Opcodes.cpp:1405` |
| `MSG_TALENT_WIPE_CONFIRM` | `live` | both directions on a level-12 `eversong10-warrior` at Undercity warrior trainer 4594 (`soap setup` position map 0, zone 1497, x 1775.77, y 404.6, z -57.11, 5 yd south of the trainer; the point worked unchanged), flow `talents-reset --arg npc=4594 --arg max=20000`. First reset: option 1 went out and `SMSG_GOSSIP_COMPLETE` and an offer with cost 10000 came back, the confirm went out with the trainer guid, and `SMSG_TALENTS_INFO` followed with 3 free. Second offer cost 50000: with `max=20000` the act returned `too_expensive` and sent no confirm. With nothing spent and `max=60000` the confirm drew a guid-0, cost-0 reply and the act returned `nothing_to_reset`. With one point spent and 20000 copper the confirm drew `SMSG_BUY_FAILED` (guid 0, item 0, result 2) then the guid-0 reply, and the act returned `not_enough_money`. Account deleted | `Handlers/SkillHandler.cpp:58-84`, `Entities/Player/Player.cpp:9125-9132` |
