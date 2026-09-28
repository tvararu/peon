# emotes

The `emotes` area reads emote animations and text emotes from the units
around the character. World-service code reads it through
`session.areas.emotes.state()`: `emoteStates` lists each unit in view
whose `UNIT_NPC_EMOTESTATE` is not 0, such as a unit that dances (state
10). The area emits `emote` (a unit plays a one-shot animation, which the
server also sends for a critical hit or a shield block in melee) and
`text_emote` (a player's text emote, with `self` true for the
character's own and the target's name when it has one). A change of
emote state emits no event.

## Wire notes

- `SMSG_EMOTE` is a `u32` emote before a full `u64` guid
  (`Server/Packets/ChatPackets.cpp:20-26`), sent by
  `Unit::HandleEmoteCommand` (`Entities/Unit/Unit.cpp:2193-2199`) to every
  player in view, the unit itself included.
- Melee plays the victim's animation on a critical hit and on a shield
  block (`Entities/Unit/Unit.cpp:2030-2033`), and a text emote with a
  one-shot animation plays it for the player
  (`Handlers/ChatHandler.cpp:774`); both go through the emote command.
- `SMSG_TEXT_EMOTE` is a `u64` sender guid, the text emote, the emote
  number, a `u32` name length without the null, then the name with its
  null, or one `0x00` byte when the length is 0 or 1
  (`Handlers/ChatHandler.cpp:693-707`). wow_messages reads a sized string
  whose size counts the null
  (`wow_message_parser/wowm/world/chat/smsg_text_emote.wowm`). AzerothCore
  wins: the area ignores the length and reads a C string, so a one-letter
  target name arrives empty.
- A text emote reaches the players within the text emote listen range of
  the sender, the sender included (`Handlers/ChatHandler.cpp:782`).
- `/dance` sets the sender's `UNIT_NPC_EMOTESTATE` to 10 and plays no
  one-shot animation (`Handlers/ChatHandler.cpp:767-769`). The area reads
  the field from each unit's update fields; other object types are
  skipped, because the field offset is a unit offset.

## Left out

None.

## Capabilities row

No verb.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_EMOTE` | `live` | probe flow `emotes-fight` (`--expect SMSG_EMOTE`) on an `eversong10-warrior`: the flow found no target, but creatures that attacked the character sent `SMSG_EMOTE` 34 on the character's guid after a critical `SMSG_ATTACKERSTATEUPDATE` and 43 on a creature; `--send CMSG_TEXT_EMOTE` with `/wave` (101), exit 0, gave emote 3 on the character's guid; each body decodes with no byte left | `Entities/Unit/Unit.cpp:2193-2199` |
| `SMSG_TEXT_EMOTE` | `live` | `mise protocol:probe --send CMSG_TEXT_EMOTE` with `/dance` (34), no target, `--expect SMSG_TEXT_EMOTE`, exit 0; the 21-byte body decodes to the character's guid, text emote 34, emote number `0xffffffff` and an empty name | `Handlers/ChatHandler.cpp:693-707` |
