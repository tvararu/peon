# guard

The `guard` area covers the opcodes a player account is not meant to use and
the anti-cheat traffic. World-service code reaches it through
`session.areas.guard`. `act.worldTeleport({ map, x, y, z, orientation })`
sends `CMSG_WORLD_TELEPORT` and waits three seconds for a
`SMSG_NOTIFICATION`: it resolves `"denied"` on one, `"sent"` on none.
`act.requestFactionStates()` sends the empty `CMSG_SET_FACTION_CHEAT`.
`act.prepareForRedirect()` sends `TC9_CMSG_PREPARE_FOR_REDIRECT` and
resolves `"ignored"` after three seconds or `{ ok }` on
`TC9_SMSG_READY_FOR_REDIRECT`. No act sends `CMSG_WARDEN_DATA`.

The store counts `SMSG_WARDEN_DATA` requests without decoding them and keeps
`warden: { active, requests, firstSize }` and the last redirect reply. The
first request emits `warden_request { size }`; later ones only raise the
count. `TC9_SMSG_READY_FOR_REDIRECT` emits `redirect_ready { ok }`, and a
`SMSG_NOTIFICATION` (peeked, not owned) emits `notification { text }`. The
harness turns the first `warden_request` of a session into one `log` row,
`warden`.

## Wire notes

- `CMSG_WORLD_TELEPORT` is `u32` time, `u32` map and four `f32` (x, y, z,
  orientation); the handler reads no guid
  (`Handlers/MiscHandler.cpp:1051-1064`). wow_messages has a `u64` after
  the map; AzerothCore wins. Without the world-teleport permission the
  handler sends a permission-denied `SMSG_NOTIFICATION`
  (`Handlers/MiscHandler.cpp:1073-1079`).
- `SMSG_WARDEN_DATA` is opaque and RC4-encrypted, so the area keeps only
  its size (`Warden/Warden.cpp:78-96`). The live realm sent a 37 byte
  request at every login.
- The anti-cheat module starts only when `Warden.Enabled` is on and the
  client reports `Win`; with it on, any other client OS is refused at auth
  (`WorldSocket::HandleAuthSessionCallback`, `WorldSession::InitWarden`).
- `CMSG_WARDEN_DATA` is the client's encrypted answer. The handler decrypts
  it and starts the check cycle (`Warden/Warden.cpp:320-356`). The area has
  a builder and a test and never sends it (plan decision S2).
- `TC9_CMSG_PREPARE_FOR_REDIRECT` has an empty body and the handler
  returns at once unless cluster mode is on
  (`Server/WorldSession.cpp:1632-1635`). `TC9_SMSG_READY_FOR_REDIRECT` is
  one `u8`, 0 for success and 1 for failure
  (`Server/WorldSession.cpp:1640-1642`, `Server/WorldSession.cpp:1652-1654`).
- Cluster mode is off on the live realm, because the addon list reaches
  every login and is sent only when it is off
  (`WorldSession::InitializeSessionCallback`).
- `CMSG_SET_FACTION_CHEAT` is empty. The handler logs a server error line
  and sends every faction standing
  (`Handlers/CharacterHandler.cpp:1299-1303`).

## Left out

- The Warden payload is not decrypted and never answered. The key needs the
  session key, which no area context carries, and an answer starts the
  server's check cycle and its timer.
- `CMSG_SET_FACTION_CHEAT` is never sent live, because every send writes a
  server error line ("not expected call, please report").
- `TC9_SMSG_READY_FOR_REDIRECT` needs cluster mode, which the live realm
  does not run.
- `CMSG_WHOIS`, `SMSG_WHOIS` and `SMSG_PLAY_TIME_WARNING` belong to the
  `character` area.
- The seven dead rows below.

## Capabilities row

No verb: the opcodes are GM-only, anti-cheat or cluster plumbing. The Warden
count reaches the agent as one log row.

## Proof

Live probes on `eversong10` throwaway accounts
(`~/.local/state/peon-overnight/artifacts/597-wave7/guard/`):
`guard-denied-realm-split/` (flow `guard-denied`, login trace with the
Warden request) and `redirect/`.

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_WORLD_TELEPORT` | `live` | flow `guard-denied` sent 24 bytes to the character's own spot and got `SMSG_NOTIFICATION` "You do not have permission to perform that function", outcome `denied` | `Handlers/MiscHandler.cpp:1051-1079` |
| `SMSG_WARDEN_DATA` | `live` | 37 byte request in the login trace of both runs, handled, count 1, `warden.active` true | `Warden/Warden.cpp:78-96` |
| `CMSG_WARDEN_DATA` | `builder` | payload bytes unchanged, never sent live | `Warden/Warden.cpp:320-356` |
| `TC9_CMSG_PREPARE_FOR_REDIRECT` | `live` | probe `--send` of the empty packet: no reply, session stayed up until the clean logout | `Server/WorldSession.cpp:1632-1635` |
| `TC9_SMSG_READY_FOR_REDIRECT` | `rig` | one `u8` from the writer; cluster mode is off | `Server/WorldSession.cpp:1640-1654` |
| `CMSG_SET_FACTION_CHEAT` | `builder` | empty body, never sent live | `Handlers/CharacterHandler.cpp:1299-1303` |
| `CMSG_BOOTME` | `dead` | `STATUS_NEVER`, `Handle_NULL` | `Server/Protocol/Opcodes.cpp:132` |
| `CMSG_DBLOOKUP` | `dead` | `STATUS_NEVER`, `Handle_NULL` | `Server/Protocol/Opcodes.cpp:133` |
| `CMSG_TELEPORT_TO_UNIT` | `dead` | `Handle_NULL`: accepted and ignored | `Server/Protocol/Opcodes.cpp:140` |
| `MSG_MOVE_TELEPORT_CHEAT` | `dead` | `STATUS_NEVER`, `Handle_NULL`, no send site | `Server/Protocol/Opcodes.cpp:329` |
| `CMSG_MOVE_SET_RAW_POSITION` | `dead` | `STATUS_NEVER`, `Handle_NULL` | `Server/Protocol/Opcodes.cpp:356` |
| `SMSG_KICK_REASON` | `dead` | `STATUS_NEVER`, no send site | `Server/Protocol/Opcodes.cpp:1096` |
| `SMSG_REDIRECT_CLIENT` | `dead` | `STATUS_NEVER`, no send site | `Server/Protocol/Opcodes.cpp:1424` |
