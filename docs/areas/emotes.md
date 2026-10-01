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

The area sends emotes through two acts on `session.areas.emotes.act`.
`emote(id)` sends the client's wave animation (3, or 0 for none) and
returns `{ ok: false, reason: "only_wave" }` for any other id.
`textEmote(nameOrId, targetGuid?)` resolves a lower-case name from the
server's text emote list (`dance`, `salute`, `wave`, ...) or accepts a
known id, and returns `unknown_emote` with the five closest names when it
finds none, `ready_check` for `ready` (126), and `cancelled` when the
session ends while the act waits. Both acts return `dead` for any life
other than alive, a ghost included. Text emotes leave at least one second
apart: a second act waits out the gap, then checks life again and sends.

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

- `CMSG_EMOTE` is a `u32` emote. The server accepts only 0 and 3, and
  drops the packet for a spectator and for a player who is not alive
  (`Handlers/ChatHandler.cpp:675-679`); it answers with `SMSG_EMOTE`
  through the emote command.
- `CMSG_TEXT_EMOTE` is a `u32` text emote, a `u32` emote number and a
  `u64` target guid (`Handlers/ChatHandler.cpp:749-750`; wow_messages
  `chat/cmsg_text_emote.wowm`). The area sends `0xffffffff` as the emote
  number. The server drops it for a player who is not alive
  (`Handlers/ChatHandler.cpp:731`), counts it against the chat flood timer
  (`Handlers/ChatHandler.cpp:734`) and tells a muted player so without
  sending it (`Handlers/ChatHandler.cpp:736-741`). Text emote 126
  (`/ready`) goes to a redirect path only while a redirect timer runs
  (`Handlers/ChatHandler.cpp:725`). It looks the id up in its own
  `EmotesText.dbc` and drops an unknown id
  (`Handlers/ChatHandler.cpp:754`). The one-second gap between text emotes
  is Peon's own rule, not a server rule.

## Left out

None.

## Capabilities row

No verb.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_EMOTE` | `live` | probe flow `emotes-fight` (`--expect SMSG_EMOTE`) on an `eversong10-warrior`: the flow found no target, but creatures that attacked the character sent `SMSG_EMOTE` 34 on the character's guid after a critical `SMSG_ATTACKERSTATEUPDATE` and 43 on a creature; `--send CMSG_TEXT_EMOTE` with `/wave` (101), exit 0, gave emote 3 on the character's guid; each body decodes with no byte left | `Entities/Unit/Unit.cpp:2193-2199` |
| `SMSG_TEXT_EMOTE` | `live` | `mise protocol:probe --send CMSG_TEXT_EMOTE` with `/dance` (34), no target, `--expect SMSG_TEXT_EMOTE`, exit 0; the 21-byte body decodes to the character's guid, text emote 34, emote number `0xffffffff` and an empty name | `Handlers/ChatHandler.cpp:693-707` |
| `CMSG_EMOTE` | `live` | probe flow `emotes-send` on an `eversong10` character (`--expect SMSG_EMOTE --expect SMSG_TEXT_EMOTE --wait 10`), exit 0: the packet trace shows one out `CMSG_EMOTE` of 4 bytes, answered by in `SMSG_EMOTE` rows | `Handlers/ChatHandler.cpp:675-679` |
| `CMSG_TEXT_EMOTE` | `live` | same run: one out `CMSG_TEXT_EMOTE` of 16 bytes (`wave`, 101, aimed at the nearest creature) and one in `SMSG_TEXT_EMOTE`; the flow exits 0 only when the echo names the target | `Handlers/ChatHandler.cpp:749-750` |
