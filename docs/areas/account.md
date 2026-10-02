# account

The `account` area reads and writes the client's saved UI settings, which the server keeps per account and per character. World-service code reads them through `session.areas.account.state()`: `data` (one `{ type, time, text }` entry per type the server sent in `SMSG_UPDATE_ACCOUNT_DATA`) and `lastSaved` (the type of the last `SMSG_UPDATE_ACCOUNT_DATA_COMPLETE`). The area emits `account_data` on each 0x20C and `account_data_saved` on each 0x463. The harness writes no row for either.

The acts wait for the server's answer and reject with `timeout` after 5 s:

- `readyForAccountDataTimes()` sends empty `CMSG_READY_FOR_ACCOUNT_DATA_TIMES` and resolves with the global mask 0x15. The server also sends the same packet at login with the per-character mask 0xEA; the act skips that one with a mask match.
- `accountData(type)` sends `CMSG_REQUEST_ACCOUNT_DATA` with the type and resolves with the inflated text of the matching `SMSG_UPDATE_ACCOUNT_DATA`.
- `saveAccountData(type, time, text)` sends `CMSG_UPDATE_ACCOUNT_DATA` with the deflated text and resolves when the matching `SMSG_UPDATE_ACCOUNT_DATA_COMPLETE` arrives. A text over 0xFFFF bytes or holding a NUL throws locally.
- `eraseAccountData(type)` sends the same packet with size 0 and resolves on the matching complete packet.

The three CMSGs need `STATUS_AUTHED` (`Server/Protocol/Opcodes.cpp:653-654,1410`); the tutorial CMSGs this area also owns need `STATUS_LOGGEDIN` and are built by session-4.

## Wire notes

- `CMSG_READY_FOR_ACCOUNT_DATA_TIMES` is empty; the reply is `SMSG_ACCOUNT_DATA_TIMES` with the global mask 0x15 (`Handlers/MiscHandler.cpp:1624-1630`).
- `CMSG_REQUEST_ACCOUNT_DATA` is one `u32` type 0-7; types 8 and up are dropped silently (`Handlers/MiscHandler.cpp:863-893`).
- `SMSG_UPDATE_ACCOUNT_DATA` is `u64` player guid (0 at the character screen), `u32` type, `u32` time, `u32` decompressed size, then the zlib bytes (`Handlers/MiscHandler.cpp:885-892`). For an empty type the size is 0 but 13 zero bytes follow; the parser returns `text: ""` and ignores the tail. wow_messages has no guid, time or size (`login_logout/smsg_update_account_data.wowm:2`); AzerothCore wins.
- `CMSG_UPDATE_ACCOUNT_DATA` is `u32` type, `u32` time, `u32` decompressed size, then the zlib bytes (`Handlers/MiscHandler.cpp:810-861`). Size 0 erases the type; a size over 0xFFFF is dropped with no reply (`Handlers/MiscHandler.cpp:832-837`). Whether wow_messages' `compressed` array carries the size prefix could not be determined; AzerothCore wins. The builder writes no NUL, sizes in bytes, and refuses text over 0xFFFF bytes or with a NUL.
- `SMSG_UPDATE_ACCOUNT_DATA_COMPLETE` is `u32` type and `u32` 0 (`Handlers/MiscHandler.cpp:824-827`).

## Left out

- The three tutorial CMSGs this area owns (`CMSG_TUTORIAL_FLAG`, `CMSG_TUTORIAL_CLEAR`, `CMSG_TUTORIAL_RESET`) are built by session-4.

## Capabilities row

No verb (N23).

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_READY_FOR_ACCOUNT_DATA_TIMES` | `live` | probe flow `account-data`, exit 0; the 0xEA login packet is skipped and the 0x15 reply resolves the act | `Handlers/MiscHandler.cpp:1624-1630` |
| `CMSG_REQUEST_ACCOUNT_DATA` | `live` | probe flow `account-data`, exit 0; type 7 is sent and the matching 0x20C resolves with `"peon"` | `Handlers/MiscHandler.cpp:863-893` |
| `SMSG_UPDATE_ACCOUNT_DATA` | `live` | probe flow `account-data`, exit 0; save then read returns `"peon"`, erase then read returns empty text | `Handlers/MiscHandler.cpp:885-892` |
| `CMSG_UPDATE_ACCOUNT_DATA` | `live` | probe flow `account-data`, exit 0; the save and the erase each resolve on the matching complete packet | `Handlers/MiscHandler.cpp:810-861` |
| `SMSG_UPDATE_ACCOUNT_DATA_COMPLETE` | `live` | probe flow `account-data`, exit 0; type 7 completes twice, once for the save and once for the erase | `Handlers/MiscHandler.cpp:824-827` |
