# guildadmin

The `guildadmin` area reads the character's guild info and lets a guild leader disband the guild. World-service code reads it through `session.areas.guildadmin.state()`: `info` (the guild name, packed creation date, member and account counts from the last `SMSG_GUILD_INFO`) and `disbanded` (true once the server broadcasts `GE_DISBANDED`). The area emits `info` on every guild info reply and `disbanded` once on the first disband broadcast.

- `info()` sends `CMSG_GUILD_INFO` and settles with the guild info on `SMSG_GUILD_INFO`. With no guild the server stays silent, so the act settles `{ status: "no_reply" }` after 5 seconds of silence.
- `disband({ confirm })` with `confirm: false` sends nothing and settles `{ status: "refused" }`. With `confirm: true` it sends `CMSG_GUILD_DISBAND` and settles `{ status: "disbanded" }` on the peeked `SMSG_GUILD_EVENT` code 8. A non-leader gets no reply, so the act settles `{ status: "no_reply" }` after 5 seconds of silence.

The harness writes one `wake` row `disbanded` when the guild is disbanded; `info` writes no row (the guild tool of a later task reports it).

## Wire notes

- `SMSG_GUILD_INFO` is the guild name as CString, the packed creation date, then `int32` member count and `int32` account count (`Server/Packets/GuildPackets.cpp:50-58`; sender `Guilds/Guild.cpp:1824-1834`). The packed creation date uses the packed-time layout described in `time.md`.
- `CMSG_GUILD_INFO` has an empty body; without a guild the server answers nothing (`Handlers/GuildHandler.cpp:89-95`).
- `CMSG_GUILD_DISBAND` has an empty body; only the leader disbands, others get no reply (`Handlers/GuildHandler.cpp:133-139`). `Guild::Disband` broadcasts the disband event the area peeks, which the legacy guild handlers also see.
- `CMSG_GUILD_CREATE` is never sent: `HandleGuildCreateOpcode` only logs a hacking attempt (`Handlers/GuildHandler.cpp:37-40`).

## Left out

- `SMSG_GUILD_DECLINE` is dead: `CMSG_GUILD_DECLINE` clears the invite and tells the inviter nothing (`Handlers/GuildHandler.cpp:76-87`).
- `CMSG_GUILD_CREATE` is a builder only: the server handler logs a hacking attempt and sends nothing.
- `MSG_SAVE_GUILD_EMBLEM`, `MSG_TABARDVENDOR_ACTIVATE`, `CMSG_GUILD_RANK`, `CMSG_GUILD_ADD_RANK`, `CMSG_GUILD_DEL_RANK`, `CMSG_GUILD_SET_PUBLIC_NOTE`, `CMSG_GUILD_SET_OFFICER_NOTE`, `CMSG_GUILD_INFO_TEXT`, `MSG_GUILD_PERMISSIONS`, `MSG_GUILD_EVENT_LOG_QUERY` are built by guild-2, guild-3 and guild-4.

## Capabilities row

No verb (N23).

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_GUILD_INFO` | `live` | `guildadmin-info` on a staged `max80` guild (`Fac6ABF70D6F7`): the trace shows the empty `CMSG_GUILD_INFO` out and the 26-byte `SMSG_GUILD_INFO` in; a guildless `max80` gets no reply | `Handlers/GuildHandler.cpp:89-95` |
| `SMSG_GUILD_INFO` | `live` | the same run: body `4661633641424637304436463700` (`Fac6ABF70D6F7`) + packed `f46b901a` + `01000000 01000000`; the act settles with the name and counts | `Server/Packets/GuildPackets.cpp:50-58` |
| `CMSG_GUILD_DISBAND` | `live` | the same run: the empty `CMSG_GUILD_DISBAND` out is followed by `SMSG_GUILD_EVENT` `0800` (code 8); `read guild Fac6ABF70D6F7` fails afterwards and the account is deleted | `Handlers/GuildHandler.cpp:133-139` |
| `CMSG_GUILD_CREATE` | `builder` | builder test against the reader; never sent live | `Server/Packets/GuildPackets.cpp:45-48` |
| `SMSG_GUILD_DECLINE` | `dead` | `CMSG_GUILD_DECLINE` clears the invite and tells the inviter nothing | `Handlers/GuildHandler.cpp:76-87` |
