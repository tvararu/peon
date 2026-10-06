# channels

The `channels` area reads channel notices and runs the channel the
character owns. World-service code reads it through
`session.areas.channels.state()`: `channels` lists each joined channel in
join order with its `channelId`, room `flags`, the character's own
`selfFlags`, the join time, and the owner guid or name when the server
has named one; `pendingInvite` holds the latest channel invite for 60 s.
The area emits `channel_notice` for every one of the 36 notice types.

The area sends the thirteen admin actions through one act on
`session.areas.channels.act`. `channelAdmin(channel, action, arg?)`
sends the `ChannelHandler` opcode for `password`, `set_owner`, `owner`,
`moderator`, `unmoderator`, `mute`, `unmute`, `invite`, `kick`, `ban`,
`unban`, `announcements` or `moderate`, and resolves
with the first `channel_notice` for that channel within 2 s, or
`{ ok: true, notice: undefined }` when none arrives (`UNCONFIRMED` in the
harness). It returns `{ ok: false, reason: "too_long" }` for a password
longer than 31 characters without sending, `{ ok: false, reason:
"bad_name" }` for a missing or spaced player name, and `{ ok: false,
reason: "not_member" }` for a channel the store does not hold. The area
registers a `peek` on `SMSG_CHANNEL_NOTIFY`; the legacy
`world-handlers-chat` handler stays its owner.

Two more acts read who is on a channel. `listChannel(channel, { display?
})` sends `CMSG_CHANNEL_LIST`, or `CMSG_CHANNEL_DISPLAY_LIST` with
`display: true`, and resolves `{ ok: true, flags, members }` on the
matching `SMSG_CHANNEL_LIST`, `{ ok: false, reason: "not_member" }` on the
server's `not_member` notice, or `{ ok: false, reason: "timeout" }` after
3 s. `channelMemberCount(channel)` sends `CMSG_GET_CHANNEL_MEMBER_COUNT`
and resolves the count, or `undefined` on `not_member` or silence. Neither
checks the store first, because the server answers a channel the
character is not on. Both replies update the channel row (`members`,
`memberCount`; a count does not clear the member list) and emit
`channel_members`, with `members: undefined` for a count.
## Wire notes

The area handles `SMSG_CHANNEL_NOTIFY`, `SMSG_USERLIST_ADD`,
`SMSG_USERLIST_REMOVE` and `SMSG_USERLIST_UPDATE`, and sends
`CMSG_CHANNEL_PASSWORD`, `CMSG_CHANNEL_SET_OWNER`, `CMSG_CHANNEL_OWNER`,
`CMSG_CHANNEL_MODERATOR`, `CMSG_CHANNEL_UNMODERATOR`, `CMSG_CHANNEL_MUTE`,
`CMSG_CHANNEL_UNMUTE`, `CMSG_CHANNEL_INVITE`, `CMSG_CHANNEL_KICK`,
`CMSG_CHANNEL_BAN`, `CMSG_CHANNEL_UNBAN`, `CMSG_CHANNEL_ANNOUNCEMENTS`,
`CMSG_CHANNEL_MODERATE`, `CMSG_SET_CHANNEL_WATCH`,
`CMSG_CLEAR_CHANNEL_WATCH` and `CMSG_DECLINE_CHANNEL_INVITE`.

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
- `CMSG_CHANNEL_KICK` is a CString channel name and a CString player name (`Handlers/ChannelHandler.cpp:222`).
- `CMSG_CHANNEL_BAN` is a CString channel name and a CString player name (`Handlers/ChannelHandler.cpp:237`).
- `CMSG_CHANNEL_UNBAN` is a CString channel name and a CString player name (`Handlers/ChannelHandler.cpp:252`).
- `CMSG_CHANNEL_ANNOUNCEMENTS` is a CString channel name only, and toggles the room's announce flag (`Handlers/ChannelHandler.cpp:267`).
- `CMSG_CHANNEL_MODERATE` is a CString channel name only, and toggles the room's moderation flag (`Handlers/ChannelHandler.cpp:279`).
- A kick or ban answers every member with `player_kicked` or `player_banned` and drops the victim from the room; an unban answers with `player_unbanned` (`Chat/Channels/Channel.cpp:316`).
- `CMSG_SET_CHANNEL_WATCH` and `CMSG_CLEAR_CHANNEL_WATCH` are a CString channel name each; watching is per character and only a watcher gets the userlist packets (`Handlers/ChannelHandler.cpp:321`).
- `CMSG_DECLINE_CHANNEL_INVITE` carries a CString channel name and the server reads nothing from it (`Handlers/ChatHandler.cpp:809`).
- `SMSG_USERLIST_ADD` and `SMSG_USERLIST_UPDATE` are a `u64` guid, a `u8` member flags, a `u8` channel flags, a `u32` count and the CString channel name; `SMSG_USERLIST_REMOVE` drops the member flags (`Chat/Channels/Channel.cpp:1163`).
- `CMSG_VOICE_SESSION_ENABLE`, `CMSG_SET_ACTIVE_VOICE_CHANNEL` and `CMSG_CHANNEL_VOICE_ON` are dead: the server's voice handlers only skip the packet bytes and never answer (`Handlers/VoiceChatHandler.cpp:23`, `Handlers/VoiceChatHandler.cpp:31`, `Handlers/VoiceChatHandler.cpp:37`).
- After the first join of a custom channel the first joiner becomes its owner, then the room sends `mode_change` with old flags 0 and the owner and moderator flags set (`Chat/Channels/Channel.cpp:242`).
- An owner moderating itself returns silently (`Chat/Channels/Channel.cpp:573`).
- `SMSG_USERLIST_UPDATE` also leaves on every flag change (`Chat/Channels/Channel.cpp:1196`), which belongs to `social-10`.
- `CMSG_CHANNEL_LIST` and `CMSG_CHANNEL_DISPLAY_LIST` are a CString channel name, and the display handler calls the list handler (`Handlers/ChannelHandler.cpp:292`).
- A list or count request for a channel that does not exist gets `not_member` from `ChannelMgr::GetChannel`; a list request for an existing channel the character is not on gets `not_member` from `Channel::List` (`Chat/Channels/Channel.cpp:693`).
- `SMSG_CHANNEL_LIST` is a `u8` that is always 1, the CString channel name, a `u8` channel flags, a `u32` count, then a `u64` guid and a `u8` member flags each; wow_messages has no leading byte and AzerothCore wins (`Chat/Channels/Channel.cpp:701`).
- `SMSG_CHANNEL_LIST` carries a count of 0 when the channel rights forbid speaking, and hides members the asker may not see (`Chat/Channels/Channel.cpp:713`).
- `CMSG_GET_CHANNEL_MEMBER_COUNT` is a CString channel name; the answer `SMSG_CHANNEL_MEMBER_COUNT` is the CString name, a `u8` flags and a `u32` count, and the handler never checks that the asker is on the channel (`Handlers/ChannelHandler.cpp:304`).

## Left out

None yet.

## Capabilities row

Join a channel it owns and kick another player off it (`t2-channels-kick`): kicking, banning and the other admin verbs need the channel moderated by the caller, usually as its owner.
## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_CHANNEL_PASSWORD` | `live` | probe flow `channels-admin` on channel `peoncccf6a` (Own `Fgklphdbdeo`, partner `Fgklphdbdbo`, both `eversong10`, deleted): 15-byte out body `channel + "abc"` answered by `not_moderator` | `Handlers/ChannelHandler.cpp:105` |
| `CMSG_CHANNEL_SET_OWNER` | `live` | same run: 23-byte out body `channel + partner name` answered by `not_owner` (the partner joined first and owned the room) | `Handlers/ChannelHandler.cpp:120` |
| `CMSG_CHANNEL_OWNER` | `live` | same run: 11-byte out body `channel` answered by `channel_owner` naming the partner owner | `Handlers/ChannelHandler.cpp:135` |
| `CMSG_CHANNEL_MODERATOR` | `live` | same run: 23-byte out body answered by `not_moderator` (a non-owner cannot moderate) | `Handlers/ChannelHandler.cpp:147` |
| `CMSG_CHANNEL_UNMODERATOR` | `live` | same run: 23-byte out body answered by `not_moderator` | `Handlers/ChannelHandler.cpp:162` |
| `CMSG_CHANNEL_MUTE` | `live` | same run: 23-byte out body answered by `not_moderator` | `Handlers/ChannelHandler.cpp:177` |
| `CMSG_CHANNEL_UNMUTE` | `live` | same run: 23-byte out body answered by `not_moderator` | `Handlers/ChannelHandler.cpp:192` |
| `CMSG_CHANNEL_INVITE` | `live` | same run: 23-byte out body answered by `already_member` with the invitee guid (the partner was already on the room) | `Handlers/ChannelHandler.cpp:207` |
| `CMSG_CHANNEL_LIST` | `live` | probe flow `channels-list` on channel `peonl9c3d4e` (Own `Fgklpiakaal`, partner `Fgklpiakaod`, both `eversong10`, deleted): 12-byte out body `channel`, answered by `SMSG_CHANNEL_LIST` | `Handlers/ChannelHandler.cpp:92` |
| `SMSG_CHANNEL_LIST` | `live` | same run: 36-byte body `01` + name + flags `01` + count 2 + guids `0x1375` flags 0 and `0x1376` flags 3 (the partner joined first and owns the room) | `Chat/Channels/Channel.cpp:701` |
| `CMSG_CHANNEL_DISPLAY_LIST` | `live` | same run: 12-byte out body `channel`, answered by the same 36-byte list | `Handlers/ChannelHandler.cpp:292` |
| `CMSG_GET_CHANNEL_MEMBER_COUNT` | `live` | same run: 12-byte out body `channel` | `Handlers/ChannelHandler.cpp:298` |
| `SMSG_CHANNEL_MEMBER_COUNT` | `live` | same run: 17-byte body name + flags `01` + count 2; a `CMSG_CHANNEL_LIST` for `peonl9c3d4eother` (not joined) got `not_member` | `Handlers/ChannelHandler.cpp:304` |
