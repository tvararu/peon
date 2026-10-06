# guildadmin

The `guildadmin` area reads the character's guild info and lets a guild leader disband the guild, manage ranks, notes and the info text, read the rank rights and the event log, and save an emblem at a tabard designer. World-service code reads it through `session.areas.guildadmin.state()`: `info` (the guild name, packed creation date, member and account counts from the last `SMSG_GUILD_INFO`) and `disbanded` (true once the server broadcasts `GE_DISBANDED`). The area emits `info` on every guild info reply and `disbanded` once on the first disband broadcast.

- `info()` sends `CMSG_GUILD_INFO` and settles with the guild info on `SMSG_GUILD_INFO`. With no guild the server stays silent, so the act settles `{ status: "no_reply" }` after 5 seconds of silence.
- `disband({ confirm })` with `confirm: false` sends nothing and settles `{ status: "refused" }`. With `confirm: true` it sends `CMSG_GUILD_DISBAND` and settles `{ status: "disbanded" }` on the peeked `SMSG_GUILD_EVENT` code 8. A non-leader gets no reply, so the act settles `{ status: "no_reply" }` after 5 seconds of silence.

The harness writes one `wake` row `disbanded` when the guild is disbanded, a `log` row `tabard_vendor` when the designer opens and a `log` row `emblem_result` with the result code; `info` writes no row. The `guild` tool (`status`, `permissions`, `log`, `rank`, `note`, `officer_note`, `info_text`, `tabard`, `emblem`, `disband`) drives the acts.

## Wire notes

- `SMSG_GUILD_INFO` is the guild name as CString, the packed creation date, then `int32` member count and `int32` account count (`Server/Packets/GuildPackets.cpp:50-58`; sender `Guilds/Guild.cpp:1824-1834`). The packed creation date uses the packed-time layout described in `time.md`.
- `CMSG_GUILD_INFO` has an empty body; without a guild the server answers nothing (`Handlers/GuildHandler.cpp:89-95`).
- `CMSG_GUILD_DISBAND` has an empty body; only the leader disbands, others get no reply (`Handlers/GuildHandler.cpp:133-139`). `Guild::Disband` broadcasts the disband event the area peeks, which the legacy guild handlers also see.
- `CMSG_GUILD_ROSTER` has an empty body; with no guild the server answers `CMSG_GUILD_ROSTER` with command 5 (`GUILD_COMMAND_ROSTER`), result 9, and the roster request resolves `undefined` (`Handlers/GuildHandler.cpp:97-105`). In a guild it answers `SMSG_GUILD_ROSTER` followed by `SMSG_GUILD_QUERY_RESPONSE`.
- `SMSG_GUILD_ROSTER` is the member count, `CString` motd and info, the rank count, then the rank data and the member data (`Server/Packets/GuildPackets.cpp:60-73`): each rank is `u32` rights, `u32` gold per day and six (`u32` flags, `u32` slots) bank tab pairs. Live: `guildadmin-roster` on `Fac6ABF8B8BC1` returns all five ranks (`Guild Master`, `Officer`, `Veteran`, `Member`, `Initiate`).
- The `SMSG_GUILD_QUERY_RESPONSE` packet takes the guild id, the name, ten `CString` rank names (unused are empty), the five `u32` emblem values and the rank count (`Server/Packets/GuildPackets.cpp:25-26`); the sender fills the ten names before writing (`Guilds/Guild.cpp:1271-1272`). Live: `guildadmin-roster` on `Fac6ABF8B8BC1` shows id 24, all ten rank names and five zero emblem values for the unconfigured emblem.
- The `SMSG_GUILD_COMMAND_RESULT` body is `int32` command, `CString` name, `int32` result (`Server/Packets/GuildPackets.cpp:81-88`); the sender copies the caller's command type and error code into the packet (`Guilds/Guild.cpp:115-123`). Result 0 (success) emits `command_result`.
- The `SMSG_GUILD_EVENT` body is `u8` code, `u8` count and that many `CString` parameters, with a trailing guid only for codes 3, 4, 12 and 13 (`Server/Packets/GuildPackets.cpp:122-142`); the code 17 bank balance parameter is 16 upper-case hex digits, most significant byte first.

- `MSG_GUILD_PERMISSIONS` has an empty request body. The reply is `u32` rank, `i32` rights, `i32` gold per day (-1 unlimited), `i8` purchased tab count, then always six (`i32` flags, `i32` remaining slots) tab pairs (`Server/Packets/GuildPackets.cpp:164-178`; sender `Guilds/Guild.cpp:1892-1915`). A query unsubscribes the member from bank pushes (`Guilds/Guild.cpp:1898-1901`).
- `MSG_GUILD_EVENT_LOG_QUERY` has an empty request body. The reply is `u8` count, then per entry `u8` type, `u64` player guid, a `u64` other guid unless the type is join (2) or leave (6), a `u8` rank for promote (3) and demote (4), and `u32` seconds ago (`Server/Packets/GuildPackets.cpp:144-162`). wow_messages uses another enum; AzerothCore wins. A fresh guild holds one join entry per member.
- `CMSG_GUILD_RANK` is `u32` rank id, `u32` rights, `CString` name, `u32` gold per day, then six (`u32` flags, `u32` slots) pairs (`Server/Packets/GuildPackets.cpp:180-192`). Only the leader may change a rank; reader `Handlers/GuildHandler.cpp:177-207`). `Guild::HandleSetRankInfo` lets only the leader change a rank and answers `GE_RANK_UPDATED` (code 10, params rank id, name, rank count) to the whole guild; a non-leader gets command result `GUILD_COMMAND_CHANGE_RANK` 16 with error 8.
- `CMSG_GUILD_ADD_RANK` is the rank name as `CString`, 15 characters at most; the leader gets `GE_RANK_UPDATED` for the new rank, and a guild at 10 ranks gets nothing (`Server/Packets/GuildPackets.cpp:208-211`; `Guild::HandleAddNewRank`). `CMSG_GUILD_DEL_RANK` has an empty body and removes the lowest rank with `GE_RANK_DELETED` (code 11, param the new rank count); at 5 ranks or for a non-leader nothing comes back (`Handlers/GuildHandler.cpp:217-223`; `Guild::HandleRemoveRank`).
- `CMSG_GUILD_SET_PUBLIC_NOTE` and `CMSG_GUILD_SET_OFFICER_NOTE` are the member name then the note (31 characters at most) as `CString`s (`Handlers/GuildHandler.cpp:158-165`, `Handlers/GuildHandler.cpp:167-175`). `Guild::HandleSetMemberNote` answers success with a fresh `SMSG_GUILD_ROSTER` and a missing right with command result `ERR_GUILD_PERMISSIONS` (8).
- `CMSG_GUILD_INFO_TEXT` is the text as `CString`, 500 characters at most. The server sends nothing, so the act asks for the roster and compares its info text (`Server/Packets/GuildPackets.cpp:213-216`; `Guild::HandleSetInfo`).
- `MSG_TABARDVENDOR_ACTIVATE` is the designer guid in both directions; the server answers only within interaction range of a creature with the tabard designer flag (`Handlers/NPCHandler.cpp:67-72`). `MSG_SAVE_GUILD_EMBLEM` is the designer guid and five `u32` (style, color, border style, border color, background); the reply is one `i32` result (`Server/Packets/GuildPackets.cpp:443-451`, `Server/Packets/GuildPackets.cpp:453-458`; sender `Guilds/Guild.cpp:126-131`). Results (`GuildEmblemError`): 0 saved, 1 invalid colors, 2 no guild, 3 not the leader, 4 not enough money (`EMBLEM_PRICE` is 10 gold), 5 invalid vendor (`Handlers/GuildHandler.cpp:233-255`). `Guild::HandleSetEmblem` also sends a fresh `SMSG_GUILD_QUERY_RESPONSE` with the new emblem. Live, the Dalaran guild master Andrew Matthews (entry 28774) sits at z 650.17, 10.8 yards below the Dalaran spawn level, so a walk along the navmesh at z 660.9 stays out of range: stage the character at (5765.5, 625.5, 650.3) with the `position` setup.

## Left out

- `SMSG_GUILD_DECLINE` is dead: `CMSG_GUILD_DECLINE` clears the invite and tells the inviter nothing (`Handlers/GuildHandler.cpp:76-87`).
- `CMSG_GUILD_CREATE` is dead: the server handler only logs a hacking attempt and sends nothing (`Handlers/GuildHandler.cpp:37-40`). Core has no builder for it; a guild comes from `soap gm guild-create` or a charter.
- The act refuses locally what the server drops silently: a rank name over 15 characters, a note over 31, info text over 500, a rank add at 10 ranks, a rank removal at 5 ranks or without `confirm`. It does not check the character's rank rights; a refused change settles `denied` (notes, rank rename) or `no_reply` after 5 seconds.
- Eval staging gap: the `guild` verbs for ranks, notes, the info text, permissions and the log need a guild, and the realm setup cannot create one, so no scenario covers them. `t9-guild-tabard` covers the guildless designer path.

## Capabilities row

| Open the tabard designer and try to save a guild emblem | `t9-guild-tabard` | Run guildless: result 2, no gold taken. |

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_GUILD_INFO` | `live` | `guildadmin-info` on a staged `max80` guild (`Fac6ABF70D6F7`): the trace shows the empty `CMSG_GUILD_INFO` out and the 26-byte `SMSG_GUILD_INFO` in; a guildless `max80` gets no reply | `Handlers/GuildHandler.cpp:89-95` |
| `SMSG_GUILD_INFO` | `live` | the same run: body `4661633641424637304436463700` (`Fac6ABF70D6F7`) + packed `f46b901a` + `01000000 01000000`; the act settles with the name and counts | `Server/Packets/GuildPackets.cpp:50-58` |
| `CMSG_GUILD_DISBAND` | `live` | the same run: the empty `CMSG_GUILD_DISBAND` out is followed by `SMSG_GUILD_EVENT` `0800` (code 8); `read guild Fac6ABF70D6F7` fails afterwards and the account is deleted | `Handlers/GuildHandler.cpp:133-139` |
| `CMSG_GUILD_CREATE` | `dead` | the server handler logs a hacking attempt and sends nothing | `Handlers/GuildHandler.cpp:37-40` |
| `SMSG_GUILD_DECLINE` | `dead` | `CMSG_GUILD_DECLINE` clears the invite and tells the inviter nothing | `Handlers/GuildHandler.cpp:76-87` |
| `CMSG_GUILD_ADD_RANK` | `live` | `guildadmin-ranks` as leader of `Fac6AC55EF0B1`: `52616964657200` out, then `SMSG_GUILD_EVENT` `0a033500526169646572003600` (code 10, params 5, Raider, 6) | `Server/Packets/GuildPackets.cpp:208-211` |
| `CMSG_GUILD_RANK` | `live` | the second run renames rank 5 to Raiders and settles `updated` on `GE_RANK_UPDATED` | `Server/Packets/GuildPackets.cpp:180-192` |
| `CMSG_GUILD_DEL_RANK` | `live` | the same runs: the empty body out, `SMSG_GUILD_EVENT` `0b013500` in (code 11, count 5) | `Handlers/GuildHandler.cpp:217-223` |
| `CMSG_GUILD_SET_PUBLIC_NOTE` | `live` | `4667...74616e6b00` out; the roster shows the public note `tank` | `Handlers/GuildHandler.cpp:158-165` |
| `CMSG_GUILD_SET_OFFICER_NOTE` | `live` | the roster shows the officer note `boss` | `Handlers/GuildHandler.cpp:167-175` |
| `CMSG_GUILD_INFO_TEXT` | `live` | `5261696420617420656967687400` out; `soap gm read guild` shows `Guild Information: Raid at eight` | `Server/Packets/GuildPackets.cpp:213-216` |
| `MSG_GUILD_PERMISSIONS` | `live` | the empty request out, 61 bytes in: rank 0, rights `0x1df1ff`, gold -1, 0 tabs, six `00000000 ffffffff` pairs | `Server/Packets/GuildPackets.cpp:164-178` |
| `MSG_GUILD_EVENT_LOG_QUERY` | `live` | the empty request out, 27 bytes in: two join entries (type 2, guids 0xbb4 and 0xbb5) | `Server/Packets/GuildPackets.cpp:144-162` |
| `MSG_TABARDVENDOR_ACTIVATE` | `live` | `guildadmin-tabard` at (5765.5, 625.5, 650.3): `08210066700030f1` out and echoed in; from 11 yards away the server stays silent | `Handlers/NPCHandler.cpp:67-72` |
| `MSG_SAVE_GUILD_EMBLEM` | `live` | leader: result 0 and the query response emblem 3/2/1/4/5; a member: `03000000`; 11 yards from the designer: `05000000`. Result 2 (no guild) is shown by `t9-guild-tabard`; 4 is not shown | `Guilds/Guild.cpp:126-131` |
