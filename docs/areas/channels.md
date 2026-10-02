# channels

The `channels` area reads channel notices and runs the channel the
character owns. World-service code reads it through
`session.areas.channels.state()`: `channels` lists each joined channel in
join order with its `channelId`, room `flags`, the character's own
`selfFlags`, the join time, and the owner guid or name when the server
has named one; `pendingInvite` holds the latest channel invite for 60 s.
The area emits `channel_notice` for every one of the 36 notice types.

The area sends the eight admin actions through one act on
`session.areas.channels.act`. `channelAdmin(channel, action, arg?)`
sends the `ChannelHandler` opcode for `password`, `set_owner`, `owner`,
`moderator`, `unmoderator`, `mute`, `unmute` or `invite`, and resolves
with the first `channel_notice` for that channel within 2 s, or
`{ ok: true, notice: undefined }` when none arrives (`UNCONFIRMED` in the
harness). It returns `{ ok: false, reason: "too_long" }` for a password
longer than 31 characters without sending, `{ ok: false, reason:
"bad_name" }` for a missing or spaced player name, and `{ ok: false,
reason: "not_member" }` for a channel the store does not hold. The area
registers a `peek` on `SMSG_CHANNEL_NOTIFY`; the legacy
`world-handlers-chat` handler stays its owner.
## Wire notes

The area handles `SMSG_CHANNEL_NOTIFY` and sends `CMSG_CHANNEL_PASSWORD`,
`CMSG_CHANNEL_SET_OWNER`, `CMSG_CHANNEL_OWNER`, `CMSG_CHANNEL_MODERATOR`,
`CMSG_CHANNEL_UNMODERATOR`, `CMSG_CHANNEL_MUTE`, `CMSG_CHANNEL_UNMUTE` and
`CMSG_CHANNEL_INVITE`.

- `SMSG_CHANNEL_NOTIFY` is a `u8` notice, a CString channel name, then the per-type trailer (`Chat/Channels/Channel.cpp:952`).
- `SMSG_CHANNEL_NOTIFY` `you_joined` (0x02) carries a `u8` flags, a `u32` channel id, then a trailing `u32 0` (`Chat/Channels/Channel.cpp:952`).
- `SMSG_CHANNEL_NOTIFY` `you_left` (0x03) carries a `u32` channel id and a `u8` constant flag (`Chat/Channels/Channel.cpp:952`).
- `SMSG_CHANNEL_NOTIFY` `mode_change` (0x0c) carries a plain `u64` guid, the old `u8` flags and the new `u8` flags (`Chat/Channels/Channel.cpp:952`).
- `SMSG_CHANNEL_NOTIFY` joined carries one `u64` guid (`Chat/Channels/Channel.cpp:952`).
- `SMSG_CHANNEL_NOTIFY` `invite` (0x18) carries the inviter's guid (`Chat/Channels/Channel.cpp:952`).
- `SMSG_CHANNEL_NOTIFY` kicked (0x12) carries a `u64` target and a `u64` actor (`Chat/Channels/Channel.cpp:952`).
- `SMSG_CHANNEL_NOTIFY` `player_not_found` (0x09) carries a CString player name (`Chat/Channels/Channel.cpp:952`).
- `SMSG_CHANNEL_NOTIFY` `channel_owner` (0x0b) carries the owner's name, `Nobody` when the channel has no owner or is constant (`Chat/Channels/Channel.cpp:952`).
- The notice enum lists 36 types, 0x00-0x23 (`Chat/Channels/Channel.h:30`).
- `CMSG_CHANNEL_PASSWORD` is a CString channel name and a CString password; passwords longer than 31 characters are dropped silently (`Handlers/ChannelHandler.cpp:105`).
- `CMSG_CHANNEL_SET_OWNER` is a CString channel name and a CString player name (`Handlers/ChannelHandler.cpp:120`).
- `CMSG_CHANNEL_OWNER` is a CString channel name only (`Handlers/ChannelHandler.cpp:135`).
- `CMSG_CHANNEL_MODERATOR` is a CString channel name and a CString player name (`Handlers/ChannelHandler.cpp:147`).
- `CMSG_CHANNEL_UNMODERATOR` is a CString channel name and a CString player name (`Handlers/ChannelHandler.cpp:162`).
- `CMSG_CHANNEL_MUTE` is a CString channel name and a CString player name (`Handlers/ChannelHandler.cpp:177`).
- `CMSG_CHANNEL_UNMUTE` is a CString channel name and a CString player name (`Handlers/ChannelHandler.cpp:192`).
- `CMSG_CHANNEL_INVITE` is a CString channel name and a CString player name (`Handlers/ChannelHandler.cpp:207`).
- `CMSG_CHANNEL_PASSWORD` acts only when the sender is on the channel and answers with the notice, never its own opcode (`Handlers/ChannelHandler.cpp:105`).
- After the first join of a custom channel the first joiner becomes its owner, then the room sends `mode_change` with old flags 0 and the owner and moderator flags set (`Chat/Channels/Channel.cpp:242`).
- An owner moderating itself returns silently (`Chat/Channels/Channel.cpp:573`).
- `SMSG_USERLIST_UPDATE` also leaves on every flag change (`Chat/Channels/Channel.cpp:1196`), which belongs to `social-10`.
- The `SMSG_CHANNEL_LIST` row in the coverage doc stays `stub` until `social-9` builds the member list.

## Left out

None yet.

## Capabilities row

No verb.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
