# contacts

The `contacts` area requests the character's contact lists, keeps notes on
friends and reports ignored whisperers once per session. World-service code
reads it through `session.areas.contacts.state()`: `notes` lists the
friend guids with their latest seen note, `reported` the guids already told
with `CMSG_CHAT_IGNORED`, and `lastMask` the flags of the last contact list
reply. The area emits `contact_list` (a list reply arrived),
`note_set` (the character set a friend's note) and `ignored_whisper` (a
whisper arrived from an ignored guid).

The area sends contact packets through three acts on
`session.areas.contacts.act`. `requestContacts(flags)` sends
`CMSG_CONTACT_LIST` with the flags and resolves when the next
`SMSG_CONTACT_LIST` arrives, or rejects after 3 s.
`setFriendNote(name, note)` refuses a name outside the friend list with
`not_friend`, stores the note truncated to 48 UTF-8 bytes, sends
`CMSG_SET_CONTACT_NOTES` with the friend's guid, then requests the
flags-1 list so the legacy friend store refreshes from the server.
`reportIgnored(guid)` sends one `CMSG_CHAT_IGNORED` per guid per session
and answers `already_reported` for a repeat. A peek on `SMSG_MESSAGE_CHAT`
emits `ignored_whisper` for a whisper from a guid on the ignore list, and
the runtime reports it; a whisper with no guid sends nothing.

## Wire notes

- `CMSG_CONTACT_LIST` is a `u32` flags; the reply `SMSG_CONTACT_LIST`
  holds only the lists whose bit is set
  (`Handlers/Socialhandler.cpp:30-35`,
  `Entities/Player/SocialMgr.cpp:125-165`). The login list uses all flags.
  A friends-only reply leaves the
  ignore list alone, and an ignore-only reply leaves friends alone.
- `SMSG_CONTACT_LIST` is a `u32` list mask, a `u32` count, then per entry
  the player guid, `u32` contact flags (1 friend, 2 ignored, 4 muted), the
  note string, and for friends the status byte plus area, level and class
  when online (`Entities/Player/SocialMgr.cpp:125-165`).
- `CMSG_SET_CONTACT_NOTES` is a `u64` guid before a CString note
  (`Handlers/Socialhandler.cpp:148-154`). The server ignores a guid
  outside the social map and cuts the note to 48 UTF-8 bytes; it sends no
  reply, so the
  act proves the note with the flags-1 `SMSG_CONTACT_LIST`.
- `CMSG_CHAT_IGNORED` is a `u64` guid before a `u8` zero byte
  (`Handlers/ChatHandler.cpp:792-807`). The server sends a
  `CHAT_MSG_IGNORED` (0x19) chat packet carrying the reporter's guid and
  name as message to the ignored player (`:804-806`); it does not filter
  whispers itself, and the legacy whisper drop is client-side
  (`world-handlers-chat.ts:47`).
- `SMSG_CHAT_NOT_IN_PARTY` (0x299) is declared `STATUS_NEVER`
  (`Server/Protocol/Opcodes.cpp:796`) and has no send site; wow_messages
  has no definition.
- `SMSG_CHAT_PLAYER_AMBIGUOUS` (0x32d) is written only by
  `WorldSession::SendPlayerAmbiguousNotice`
  (`Handlers/ChatHandler.cpp:824-829`), which nothing calls.
- The chat packet types 0x30 (`CHAT_MSG_ACHIEVEMENT`) and 0x31
  (`CHAT_MSG_GUILD_ACHIEVEMENT`) write the receiver guid, the message, the
  tag byte and then a `u32` achievement id
  (`Chat/Chat.cpp:320-323`, `Chat/Chat.cpp:347-348`); say-range players
  get 0x30 and guild members 0x31
  (`Achievements/AchievementMgr.cpp:717-724`,
  `Achievements/AchievementMgr.cpp:757-762`). `parseChatMessage` reads the
  id after the tag for those two types only and exposes it as
  `ChatMessage.achievementId` in `protocol/chat.ts`; nothing past the
  parser carries it (parse-only). 0x19 (`CHAT_MSG_IGNORED`) takes the
  default branch and has no id (`Chat/Chat.cpp:324-339`).

## Left out

A contacts verb: the area has acts but no tool-facing verb.

## Capabilities row

No verb.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_CONTACT_LIST` | `live` | probe flow `contacts-notes` on `eversong10` Own: two out `CMSG_CONTACT_LIST` rows of 4 bytes answered by in `SMSG_CONTACT_LIST` rows of 38 bytes | `Handlers/Socialhandler.cpp:30-35` |
| `CMSG_SET_CONTACT_NOTES` | `live` | same run: one out `CMSG_SET_CONTACT_NOTES` of 13 bytes, answered by the flags-1 `SMSG_CONTACT_LIST` of 38 bytes | `Handlers/Socialhandler.cpp:148-154` |
| `CMSG_CHAT_IGNORED` | `live` | same run: one out `CMSG_CHAT_IGNORED` of 9 bytes in the same second as an in `SMSG_MESSAGE_CHAT` of 36 bytes; Own's headers-only trace keeps sizes only, so the partner-side `CHAT_MSG_IGNORED` receipt has no retained artifact | `Handlers/ChatHandler.cpp:792-807` |
| `SMSG_CHAT_NOT_IN_PARTY` | `dead` | no send site; declared `STATUS_NEVER` | `Server/Protocol/Opcodes.cpp:796` |
| `SMSG_CHAT_PLAYER_AMBIGUOUS` | `dead` | only writer is never called | `Handlers/ChatHandler.cpp:824-829` |
| `SMSG_MESSAGE_CHAT` | `live` | social-5b: Own `soap gm achievement 2188` with a partner standing beside; the partner's `--packet-trace bodies` row `tmp/social-5b/partner-packets.jsonl` shows an in `SMSG_MESSAGE_CHAT` of 68 bytes with type 0x30 and trailing id `8c080000` (2188); the partner's `read --json` printed it as `TYPE_48` | `BuildChatPacket` achievement branch, see Wire notes |
