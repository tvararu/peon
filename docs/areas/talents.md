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

## Left out

- `CMSG_LEARN_TALENT` and `CMSG_LEARN_PREVIEW_TALENTS`: built by
  `talents-3a`.
- `MSG_TALENT_WIPE_CONFIRM`: built by `talents-4a`.
- `CMSG_REMOVE_GLYPH`: built by `talents-5a`.
- `CMSG_UNLEARN_TALENTS` and `SMSG_TALENTS_INVOLUNTARILY_RESET`: dead.

## Capabilities row

Added by talents-3b.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_TALENTS_INFO` | `live` | probe flow `login` with `--expect SMSG_TALENTS_INFO`, exit 0, on a `fresh`, an `eversong10-warrior` and an `eversong10-hunter` account; the hunter login also brought the six-byte pet form. A harness run on the warrior with `soap gm level 12` received two player forms with 2 free points and wrote one `talents/points` row | `Entities/Player/Player.cpp:14840-14849` |
| `CMSG_UNLEARN_TALENTS` | `dead` | registered `STATUS_NEVER` with `Handle_NULL`; resets go through `MSG_TALENT_WIPE_CONFIRM` | `Server/Protocol/Opcodes.cpp:662` |
| `SMSG_TALENTS_INVOLUNTARILY_RESET` | `dead` | no writer in AzerothCore `src/`, only its registration; wow_messages says it exists only as a comment | `Server/Protocol/Opcodes.cpp:1405` |
