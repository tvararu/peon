# login

The `login` area reads the packets that frame a world session: the addon,
cache and tutorial packets the server sends at auth, and the account-data
times, system features and dance moves it sends at world entry.
World-service code reads them through `session.areas.login.state()`. The
area emits `login_noise` once, on the first dance-moves packet (the last
of the world-entry set), and `account_data_times` on each account-data
times packet. The harness writes no row for either.

## Wire notes

- `SMSG_ADDON_INFO` has no entry count. Per addon the server writes a
  `uint8` state (2), a `uint8` flag (1), a `uint8` that is 1 when the
  addon's CRC is not the standard one, then the 256-byte public key when
  that byte is 1, a `uint32` 0 and a trailing `uint8` 0; after the list
  it writes a `uint32` banned count and 44 bytes per banned addon
  (`Server/WorldSession.cpp:1352-1414`). An entry is 8 bytes, or 264 with
  the key. wow_messages fixes every entry at 8 bytes and the banned count
  at 0 (`wow_message_parser/wowm/world/login_logout/smsg_addon_info.wowm:81`);
  AzerothCore wins. The area reads entries while the next two bytes are
  `02 01`, then requires the rest of the body to match the banned count.
- The server sends one addon entry per addon it read from the client's
  auth session. It reads a `uint32` decompressed size before the zlib
  block and gives up when that size is over 0xFFFFF
  (`Server/WorldSession.cpp:1263-1278`). Peon's auth body carries the
  zlib block with no size in front, and the server reads no addon from
  it: the live addon list is empty, a 4-byte body with a banned count
  of 0.
- The addon, cache-version and tutorial packets go out once per world
  session, at auth, before the character list, and only when cluster
  mode is off (`Server/WorldSession.cpp:1624-1629`).
- `SMSG_CLIENTCACHE_VERSION` is one `uint32`
  (`Handlers/AuthHandler.cpp:56-61`). `SMSG_TUTORIAL_FLAGS` is eight
  `uint32` (`Server/WorldSession.cpp:1084-1090`).
- `SMSG_ACCOUNT_DATA_TIMES` is the server time (`uint32`), a `uint8` 1,
  the type mask (`uint32`) and one `uint32` time per set bit of the eight
  account-data types (`Server/WorldSession.cpp:1057-1066`).
- At world entry the account-data mask is the per-character mask 0xEA
  (`Handlers/CharacterHandler.cpp:834`).
- `SMSG_FEATURE_SYSTEM_STATUS` is a `uint8` complaint status (2) and a
  `uint8` voice flag (0) (`Handlers/CharacterHandler.cpp:836-839`).
  `SMSG_LEARNED_DANCE_MOVES` is two `uint32` 0
  (`Handlers/CharacterHandler.cpp:882-885`).

## Left out

- `SMSG_PONG` and `CMSG_KEEP_ALIVE`: built by `session-2`.
- `SMSG_CHARACTER_LOGIN_FAILED`, `CMSG_PLAYER_LOGOUT`,
  `CMSG_LOGOUT_CANCEL` and `SMSG_LOGOUT_CANCEL_ACK`: built by
  `session-5`.

## Capabilities row

No verb (N23).

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_ADDON_INFO` | `live` | probe flow `login`, exit 0; no `not_implemented` notice; 4-byte body, zero addons | `Server/WorldSession.cpp:1352-1414` |
| `SMSG_CLIENTCACHE_VERSION` | `live` | probe flow `login`, exit 0; no `not_implemented` notice; version 17 | `Handlers/AuthHandler.cpp:56-61` |
| `SMSG_TUTORIAL_FLAGS` | `live` | probe flow `login`, exit 0; no `not_implemented` notice | `Server/WorldSession.cpp:1084-1090` |
| `SMSG_ACCOUNT_DATA_TIMES` | `live` | probe flow `login`, exit 0; no `not_implemented` notice; mask 0xEA | `Server/WorldSession.cpp:1057-1066` |
| `SMSG_FEATURE_SYSTEM_STATUS` | `live` | probe flow `login`, exit 0; no `not_implemented` notice | `Handlers/CharacterHandler.cpp:836-839` |
| `SMSG_LEARNED_DANCE_MOVES` | `live` | probe flow `login`, exit 0; no `not_implemented` notice | `Handlers/CharacterHandler.cpp:882-885` |
