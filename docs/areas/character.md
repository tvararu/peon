# character

The `character` area covers play time, sheathe and helm/cloak visibility,
the barber shop, character-screen operations (delete, rename, customize,
faction and race change) and the WHOIS reply. All of these run on the
world connection: the character-screen opcodes are `STATUS_AUTHED`, which
the world session still processes while logged in, so the area's runtime
sends and awaits them in-world like any other opcode.

State: the last `SMSG_PLAYED_TIME` counters, whether the barber shop is
open, the last barber result, the last character-screen operation, the
last WHOIS line, the last play-time warning, the last declined-names
result and the last realm-split reply. Sheathe, helm and cloak visibility are derived live from the
entity fields (`UNIT_FIELD_BYTES_2` byte 0, `PLAYER_FLAGS` hide bits)
rather than stored. Events: `played_time`, `barber_open`,
`barber_result`, `operation`, `whois`, `play_warning`,
`declined_names` and `realm_split`.

The acts:

- `playedTime()` sends `CMSG_PLAYED_TIME` with a zero trigger byte and
  returns the total and level seconds from `SMSG_PLAYED_TIME`.
- `setSheathed(state)` sends `CMSG_SET_SHEATHED` with the raw sheath
  word (`unarmed` 0, `melee` 1, `ranged` 2). Fire and forget: the server
  sends no reply.
- `setHelmShown(shown)` / `setCloakShown(shown)` send the helm and
  cloak visibility packets (`CMSG_SHOWING_HELM` / `CMSG_SHOWING_CLOAK` on
  the wire, `CMSG_TOGGLE_HELM` / `CMSG_TOGGLE_CLOAK` in core) with a
  boolean byte. Fire and forget: the server flips the `PLAYER_FLAGS`
  hide bit and sends no reply.
- `styleAtBarber(style)` sends `CMSG_ALTER_APPEARANCE` and returns the
  `SMSG_BARBER_SHOP_RESULT` code. It throws `not_seated` unless the shop
  is open (`SMSG_ENABLE_BARBER_SHOP` arrived).
- `whois(name)` sends `CMSG_WHOIS` and returns the `SMSG_WHOIS` line.
  Without GM permission the server answers nothing and the wait times
  out.
- `realmSplit(realm)` sends `CMSG_REALM_SPLIT` and returns the echoed
  value, the split state and the split date from `SMSG_REALM_SPLIT`.
- `deleteCharacter(guid)` sends `CMSG_CHAR_DELETE` and returns the
  `SMSG_CHAR_DELETE` result name. The server stays silent when the
  character is online, belongs to another account, or is missing, so the
  wait times out in those cases.
- `renameCharacter(guid, name)` sends `CMSG_CHAR_RENAME` and returns the
  result with the guid and new name on success.
- `customizeCharacter(guid, name, appearance)` sends
  `CMSG_CHAR_CUSTOMIZE`; `changeFaction` / `changeRace` send
  `CMSG_CHAR_FACTION_CHANGE` / `CMSG_CHAR_RACE_CHANGE` and both await
  `SMSG_CHAR_FACTION_CHANGE`, which one server handler sends for either
  opcode.

The `character` tool verbs are `played`, `sheathe`, `helm`, `cloak` and
`barber`; the `barber` verb refuses `not_seated` unless the shop is open.

## Wire notes

- `CMSG_PLAYED_TIME` is one trigger byte; `SMSG_PLAYED_TIME` is two
  `uint32` counters plus the echoed trigger byte
  (`Handlers/MiscHandler.cpp:968-975`).
- `CMSG_SET_SHEATHED` is a `uint32` sheath word
  (`Handlers/CombatHandler.cpp:73-82`,
  `Server/Protocol/Opcodes.cpp:611`); `CMSG_TOGGLE_HELM` and
  `CMSG_TOGGLE_CLOAK` are boolean bytes that clear or set the
  `PLAYER_FLAGS` hide bits (`CMSG_SHOWING_HELM`,
  `Server/Packets/CharacterPackets.h:27-35`, `CMSG_SHOWING_CLOAK`,
  `Server/Packets/CharacterPackets.h:37-44`,
  `Handlers/CharacterHandler.cpp:1349-1355`,
  `Handlers/CharacterHandler.cpp:1357-1363`).
- `CMSG_ALTER_APPEARANCE` is four `uint32` style indices; invalid styles
  get no reply, a missing or unseated chair answers 2, missing money
  answers 1 or 3, and success answers 0
  (`Handlers/CharacterHandler.cpp:1532-1590`).
- `SMSG_ENABLE_BARBER_SHOP` is empty, sent when the chair is used
  (`Entities/GameObject/GameObject.cpp:2042`).
- `SMSG_BARBER_SHOP_RESULT` is one `uint32`
  (`Handlers/CharacterHandler.cpp:1557-1585`).
- `CMSG_CHAR_DELETE` is a flat `uint64` guid; `SMSG_CHAR_DELETE` is one
  result byte (`Handlers/CharacterHandler.cpp:620-679`,
  `Handlers/CharacterHandler.cpp:2615-2620`).
- `CMSG_CHAR_RENAME` is a guid plus name; `SMSG_CHAR_RENAME` is a result
  byte, then guid and name only on success
  (`Handlers/CharacterHandler.cpp:1365-1394`,
  `Handlers/CharacterHandler.cpp:2629-2638`).
- `CMSG_CHAR_CUSTOMIZE` is a guid, name and six appearance bytes, read in
  the order gender, skin, hair color, hair style, facial hair, face; the
  reply `SMSG_CHAR_CUSTOMIZE` echoes a result byte, guid, name and the
  six bytes (`Handlers/CharacterHandler.cpp:1644-1682`,
  `Handlers/CharacterHandler.cpp:2660-2676`).
- `CMSG_CHAR_FACTION_CHANGE` and `CMSG_CHAR_RACE_CHANGE` share one
  handler and one reply `SMSG_CHAR_FACTION_CHANGE`: guid, name, six
  appearance bytes and race (`Handlers/CharacterHandler.cpp:1952-1990`,
  `Handlers/CharacterHandler.cpp:2641-2658`).
- `CMSG_WHOIS` is a bare name; without WHOIS permission the server sends
  a notification and no reply, and `SMSG_WHOIS` carries the account line
  (`Handlers/MiscHandler.cpp:1081-1138`).
- `SMSG_PLAY_TIME_WARNING` is a `uint32` flag plus an `int32` remaining
  time, sent only when consecutive play crosses the anti-addiction
  limits (`Server/WorldSession.cpp:695-701`,
  `Server/Packets/MiscPackets.cpp:172-178`).
- `CMSG_REALM_SPLIT` is one `uint32` that the handler echoes; the reply
  `SMSG_REALM_SPLIT` is that echo, a `uint32` split state (0 normal) and
  the C string date `01/01/01` (`Handlers/MiscHandler.cpp:1168-1182`).
- `CMSG_SET_PLAYER_DECLINED_NAMES` is a guid, name and five declined
  forms; `SMSG_SET_PLAYER_DECLINED_NAMES_RESULT` is a `uint32` code plus
  guid. The handler returns at once unless declined names are enabled,
  which the realm only does for the Russian zone
  (`Handlers/CharacterHandler.cpp:1453-1460`,
  `Handlers/CharacterHandler.cpp:2678-2683`,
  `Server/Protocol/Opcodes.cpp:1180`).

## Left out

- `CMSG_SET_PLAYER_DECLINED_NAMES` and
  `SMSG_SET_PLAYER_DECLINED_NAMES_RESULT` are `dead`: the live realm
  never enables declined names (non-Russian zone), so the server never
  reads the request and never sends the reply. The builder and parser
  follow the AzerothCore writer, with rig tests only.
- `SMSG_PLAY_TIME_WARNING` is `unseen`: it needs 3+ hours of consecutive
  play on one session, which no test reaches. The parser follows the
  packet writer, with a rig test only.
- `SMSG_WHOIS` is parser- and rig-tested but not seen live: the reply
  needs GM permission the throwaway accounts lack, so the live probe
  shows the send accepted with no reply.
- `SMSG_INVALIDATE_PLAYER` is `dead`: the opcode is `STATUS_NEVER` and
  nothing in AzerothCore sends it (`Server/Protocol/Opcodes.cpp:927`).
- Deleting the logged-in character, or a character of another account,
  gets no reply by server design; the act documents the timeout rather
  than working around it.

## Capabilities row

Capabilities rows: read play time, draw or sheathe weapons, show or hide helm and cloak, proven by `t0-character-appearance` (see [capabilities.md](../capabilities.md)).

## Proof

Live probes on `fresh` throwaway accounts (`tmp/probe/<ACCOUNT>-*/packets.jsonl`, not committed):

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_PLAYED_TIME` | `live` | probe send `00`, reply counters with echoed trigger byte | `Handlers/MiscHandler.cpp:968-975` |
| `CMSG_SET_SHEATHED` | `live` | probe send `01000000` accepted, no packet errors | `Handlers/CombatHandler.cpp:73-82` |
| `CMSG_TOGGLE_HELM` (`CMSG_SHOWING_HELM`) | `live` | probe send `00` accepted, no packet errors | `Server/Packets/CharacterPackets.h:37-44` |
| `CMSG_TOGGLE_CLOAK` (`CMSG_SHOWING_CLOAK`) | `live` | probe send `01` accepted, no packet errors | `Server/Packets/CharacterPackets.h:27-34` |
| `SMSG_CHAR_RENAME` | `live` | probe reply `00` + guid + `Newchosen` after `soap gm rename` staging | `Handlers/CharacterHandler.cpp:2629-2638` |
| `CMSG_CHAR_RENAME` | `live` | probe send of guid + `Newchosen` | `Handlers/CharacterHandler.cpp:1365-1372` |
| `SMSG_CHAR_DELETE` | `live` | probe reply `47` (`success`) for a disposable third character | `Handlers/CharacterHandler.cpp:2615-2620` |
| `CMSG_CHAR_DELETE` | `live` | probe send of the disposable guid | `Handlers/CharacterHandler.cpp:620-627` |
| `SMSG_CHAR_CUSTOMIZE` | `live` | probe reply `00` + guid + name + 6 appearance bytes after `soap gm customize` staging | `Handlers/CharacterHandler.cpp:2660-2676` |
| `CMSG_CHAR_CUSTOMIZE` | `live` | probe send of guid + name + 6 bytes | `Handlers/CharacterHandler.cpp:1644-1682` |
| `SMSG_CHAR_FACTION_CHANGE` | `live` | probe reply `00` + guid + name + 6 bytes + race after `soap gm changefaction` staging | `Handlers/CharacterHandler.cpp:2641-2658` |
| `CMSG_CHAR_FACTION_CHANGE` | `live` | probe send of guid + name + 6 bytes + race | `Handlers/CharacterHandler.cpp:1952-1990` |
| `CMSG_CHAR_RACE_CHANGE` | `live` | same handler and reply shape as faction change | `Handlers/CharacterHandler.cpp:1952-1990` |
| `SMSG_ENABLE_BARBER_SHOP` | `rig` | empty packet from chair use; needs a seated character, not stageable | `Entities/GameObject/GameObject.cpp:2042` |
| `SMSG_BARBER_SHOP_RESULT` | `rig` | `uint32` code from the writer; needs a seated character, not stageable | `Handlers/CharacterHandler.cpp:1557-1585` |
| `CMSG_ALTER_APPEARANCE` | `rig` | four `uint32` style indices; needs a seated character, not stageable | `Handlers/CharacterHandler.cpp:1532-1540` |
| `CMSG_PLAYED_TIME` | `live` | probe send `00` with the reply above | `Handlers/MiscHandler.cpp:968-975` |
| `CMSG_WHOIS` | `live` | probe send accepted, no reply without permission | `Handlers/MiscHandler.cpp:1081-1095` |
| `SMSG_WHOIS` | `rig` | account-line string from the writer; permission-gated, not seen live | `Handlers/MiscHandler.cpp:1128-1134` |
| `CMSG_SET_PLAYER_DECLINED_NAMES` | `rig` | guid + name + five forms from the reader; realm-disabled | `Handlers/CharacterHandler.cpp:1453-1460` |
| `SMSG_SET_PLAYER_DECLINED_NAMES_RESULT` | `rig` | `uint32` code + guid from the writer; realm-disabled | `Handlers/CharacterHandler.cpp:2678-2683` |
| `CMSG_REALM_SPLIT` | `live` | probe `--send CMSG_REALM_SPLIT --body 00000000`, accepted | `Handlers/MiscHandler.cpp:1168-1182` |
| `SMSG_REALM_SPLIT` | `live` | probe reply `000000000000000030312f30312f303100`: echo 0, state 0, date `01/01/01` (`guard-denied-realm-split/` in the guard artifacts) | `Handlers/MiscHandler.cpp:1176-1181` |
| `SMSG_INVALIDATE_PLAYER` | `dead` | `STATUS_NEVER`, no send site | `Server/Protocol/Opcodes.cpp:927` |
| `SMSG_PLAY_TIME_WARNING` | `rig` | flag + remaining time from the writer; needs hours of play | `Server/Packets/MiscPackets.cpp:172-178` |
