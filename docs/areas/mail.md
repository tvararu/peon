# mail

The `mail` area lists the character's letters at a mailbox, marks them
read and reports when mail is waiting. World-service code reads it
through `session.areas.mail.state()`: `mailbox` (the last mailbox that
answered a list), `inbox` (each listed letter with id, type, sender,
COD, stationery, money, flags with named bits, days left, template,
subject, body and items), `hidden` (letters the server held back),
`unread`, `senders` (up to two waiting senders) and `newMail` (a
delivery notice arrived since the last list). The area emits `listed`
when the inbox changes, `next_time` when the wait query answers,
`new_mail` on a delivery notice and `mailbox_shown` when the server
names the open box.

The acts need the character in the world:

- `listMail(mailbox)` lists at a game object of type 19 within 10 yd or
  a creature with the mailbox npc flag within 5.5 yd. It refuses
  `no_mailbox` otherwise, sends `CMSG_GET_MAIL_LIST` and settles `ok`
  on `listed`, `unanswered` after 5 seconds of silence.
- `markMailRead(id)` sends `CMSG_MAIL_MARK_AS_READ` for the stored
  mailbox and settles `ok` with no reply; the server writes none. The
  next list is the evidence. It refuses `no_mailbox` before any list.
- `queryNextMail()` sends `MSG_QUERY_NEXT_MAIL_TIME` anywhere and
  settles `ok` with the unread flag on `next_time`, `unanswered` after
  5 seconds of silence.

## Wire notes

- `SMSG_MAIL_LIST_RESULT` is `u32` real count then `u8` shown, then one
  entry per letter prefixed by its `u16` byte size, which counts itself
  (`Handlers/MailHandler.cpp:748-753`). The parser skips to the next
  entry by that size, so one bad entry does not desync the rest; an
  overrun counts the remaining letters unreadable and stops.
- `SMSG_MAIL_LIST_RESULT` skips deleted letters and letters whose
  delivery delay has not expired, without counting them
  (`Handlers/MailHandler.cpp:713-716`). Item mail to a character of
  another account is invisible for an hour. Past 50 letters the rest
  count as hidden (`Handlers/MailHandler.cpp:703-711`,
  `MAX_INBOX_CLIENT_CAPACITY`), and `realCount - shown` is the hidden
  count, patched into the packet after the loop
  (`Handlers/MailHandler.cpp:814-819`).
- `SMSG_MAIL_LIST_RESULT` carries an 8-byte player guid sender for
  normal mail and a `u32` entry for creature, gameobject, auction and
  calendar mail (`Handlers/MailHandler.cpp:759-769`).
- `SMSG_MAIL_LIST_RESULT` flags use the checked bits
  (`Handlers/MailHandler.cpp:774-776`): 0x01 read, 0x02 returned, 0x04
  copied, 0x08 COD payment, 0x10 has body.
- `SMSG_MAIL_LIST_RESULT` time is days left as a float
  (`Handlers/MailHandler.cpp:777`); the list carries the body string
  (`Handlers/MailHandler.cpp:778-779`), so no item-text query is needed
  to read it.
- `SMSG_MAIL_LIST_RESULT` item blocks hold 7 enchant triples (id,
  duration, charges), then the random property as `int32`, the suffix
  factor, the stack count as `u32`, charges, max durability, durability
  and a zero byte (`Handlers/MailHandler.cpp:792-808`). wow_messages
  types the amount as `u8` and the enchant order as charges, duration,
  id (`wow_message_parser/wowm/world/mail/smsg_mail_list_result.wowm`);
  AzerothCore wins on both.
- `CMSG_GET_MAIL_LIST` is the mailbox guid and `CMSG_MAIL_MARK_AS_READ`
  the mailbox guid plus the letter id as `u32`
  (`Handlers/MailHandler.cpp:681-692,383-403`); the mark sends no reply.
  `MSG_QUERY_NEXT_MAIL_TIME` is empty.
- `MSG_QUERY_NEXT_MAIL_TIME` answers a float delay plus a sender count,
  then up to two sender rows of guid, entry, type, stationery and delay
  (`Handlers/MailHandler.cpp:891-938`); with no unread mail it is float
  -86400 (minus one day) and count 0. `SMSG_MAIL_LIST_RESULT` can also
  arrive unsolicited on delivery when `Mail.PushInboxOnDelivery` is on
  (`Handlers/MailHandler.cpp:698-705`); the store treats every list as
  a listing, so a waiting `listMail` settles on it.
- `CMSG_GET_MAIL_LIST` at a mailbox object answers within 10 yd, 5 yd
  above the blizzlike range because the interaction query carries no
  movement update (`Handlers/MailHandler.cpp:681-690`). The probe walks
  to 9 yd.
- `SMSG_SHOW_MAILBOX` is the open box as one guid
  (`Handlers/NPCHandler.cpp:74-79`); the server sends it only from the
  `.mailbox` console command and a level-80 achievement companion, so it
  is a rig test only here and stays `unseen`.
- `SMSG_RECEIVED_MAIL` is one `u32` zero
  (`Entities/Player/Player.cpp:2977-2979`). The legacy chat handler
  keeps ownership; the area only peeks it and sets `newMail`.
- The flow finds the mailbox by its gameobject template type 19 when no
  npc role names it: the live update blocks carry no gameobject type,
  only the object query reply does.

## Left out

None.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_GET_MAIL_LIST` | `live` | probe flow `mail-inbox` on an `elwynn10` character, exit 0; the list follows | `Handlers/MailHandler.cpp:681-692` |
| `SMSG_MAIL_LIST_RESULT` | `live` | probe flow `mail-inbox`, three staged letters (run `tmp/probe/FAC6ABD98D0BC-mail-round2` with `--bodies`): first list flags 0/0/0 on ids 2164/2163/2162, the relist shows flag 0x01 on 2164, a second run marks 2163 too; the item mail carries entry 159 count 5, the money mail 250 copper | `Handlers/MailHandler.cpp:698-821` |
| `CMSG_MAIL_MARK_AS_READ` | `live` | probe flow `mail-inbox` (run `tmp/probe/FAC6ABD98D0BC-mail-round2`): the mark for 2164 sends, and the relist shows flag 0x01 on 2164 while 2163/2162 stay 0; the second run marks 2163 | `Handlers/MailHandler.cpp:383-403` |
| `MSG_QUERY_NEXT_MAIL_TIME` | `live` | probe flow `mail-inbox`, before and after the mark; the trace shows two queries and two 56-byte replies | `Handlers/MailHandler.cpp:891-938` |
| `SMSG_SHOW_MAILBOX` | `mock`, not seen live | rig test from `Handlers/NPCHandler.cpp:74-79`; two live tries (a `--send SMSG_SHOW_MAILBOX` probe and the `mail-inbox` flow expecting it) drew no server send | `Handlers/NPCHandler.cpp:74-79` |
