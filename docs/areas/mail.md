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
- `takeMailMoney(id)` sends `CMSG_MAIL_TAKE_MONEY` and settles `ok` on
  the matching `money_taken` result, `refused(<name>)` on a server
  refusal, `unanswered` after 5 seconds. An ok result clears the
  letter's money.
- `takeMailItem(id, itemLow, { payCod })` sends `CMSG_MAIL_TAKE_ITEM`
  and settles `ok` with the server's item tail on the matching
  `item_taken` result, including refusals other than the equip error.
  It throws `no_such_mail`, `no_such_item` and
  `cod_unpaid` (a COD letter without `payCod: true`) before sending.
- `returnMail(id)` sends `CMSG_MAIL_RETURN_TO_SENDER` with the letter's
  sender guid and settles on the matching `returned_to_sender` result;
  ok drops the letter. It throws `no_such_mail` and `no_sender` for a
  non-player sender before sending.
- `deleteMail(id)` sends `CMSG_MAIL_DELETE` with the letter's template
  id and settles on the matching `deleted` result; ok drops the letter.
  It throws `no_such_mail` before sending and `mail_not_empty` for a
  letter that still holds money or items.
- `copyMailText(id)` sends `CMSG_MAIL_CREATE_TEXT_ITEM` and settles on
  the matching `made_permanent` result; ok marks the letter copied. It
  throws `no_such_mail`, `already_copied` and `nothing_to_copy` (an
  empty body with no template) before sending.
- `sendMail({ receiver, subject, body, items, money, cod })` sends
  `CMSG_SEND_MAIL` and settles on the `send` result with id 0. It
  throws `no_receiver`, `bad_text` (the `| |` crash guard), `too_many_attachments`
  past 12 items, `cod_with_money`, `cannot_send_to_self` for a known own
  name and `not_enough_money` for money plus 30 copper postage per item
  (30 with no item) above the known coinage before sending.
- One action runs at a time; a second act throws `mail_busy` until the
  matching result or a 5-second timeout releases it. A delayed result
  for an earlier action never releases a newer pending action.
  The store keeps `pending`
  and `lastResult` and emits `result` on every
  `SMSG_SEND_MAIL_RESULT`.

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
- `CMSG_SEND_MAIL` reads mailbox, receiver, subject, body, two `u32`,
  an item count byte, then per item a slot byte before the guid, then
  money, COD, `u64` 0 and `u8` 0 (`Handlers/MailHandler.cpp:70-109`).
  More than 12 items answers `TOO_MANY_ATTACHMENTS` (`:92-97`); money
  with COD answers `INTERNAL_ERROR` (`:156-161`); one item costs 30
  copper postage, 30 with no item (`:162`). COD is zeroed when no item
  is attached (`:358`), and item mail to another account waits an hour
  (`:346-360`).
- `CMSG_MAIL_TAKE_MONEY` reads mailbox and letter id
  (`Handlers/MailHandler.cpp:636-678`); a missing or deleted letter
  answers `INTERNAL_ERROR`, and gold past the cap answers
  `EQUIP_ERROR`. `CMSG_MAIL_TAKE_ITEM` reads mailbox, id and the item
  guid low (`:517-634`); a missing letter, a guid the letter does not
  hold, or unpaid COD answer `INTERNAL_ERROR` or `NOT_ENOUGH_MONEY`,
  and a full inventory answers `EQUIP_ERROR` with the equip code. The
  server clears the letter's COD after the first successful take
  (`:605`), so later attachments need no further payment.
- `CMSG_MAIL_RETURN_TO_SENDER` reads mailbox, id and an 8-byte sender
  guid the server skips (`Handlers/MailHandler.cpp:442`); only normal
  player mail is returned, otherwise it is deleted with
  `MAIL_RETURNED_TO_SENDER` ok. `CMSG_MAIL_DELETE` reads mailbox, id
  and template id (`:406-434`); a COD letter is refused with
  `INTERNAL_ERROR`, while letters holding gold or items delete fine.
  `CMSG_MAIL_CREATE_TEXT_ITEM` reads mailbox and id (`:824-846`); an
  empty body with no template, a deleted letter or an already copied
  bit answers `INTERNAL_ERROR`.
- `SMSG_SEND_MAIL_RESULT` is the letter id, the action and the result
  (`Entities/Player/Player.cpp:2958-2972`); every `item_taken` result
  except the equip error carries the item guid low and the count, and
  the equip error carries the equip error instead.
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
| `SMSG_SEND_MAIL_RESULT` | `live` | probe flow `mail-actions --arg do=take` on an `elwynn10` character (run `tmp/probe/FAC6ABDAA3CBA-20261001T003349Z`): actions 1 and 2 both ok, the first with no tail and the second with the item guid low and count 5 | `Entities/Player/Player.cpp:2958-2972` |
| `CMSG_MAIL_TAKE_MONEY` | `live` | probe flow `mail-actions --arg do=take` (run `tmp/probe/FAC6ABDAA3CBA-20261001T003349Z`): money mail 2219 taken, `soap gm read mail` shows its money 0 afterwards, `soap truth` shows money 50250 | `Handlers/MailHandler.cpp:636-678` |
| `CMSG_MAIL_TAKE_ITEM` | `live` | probe flow `mail-actions --arg do=take` (run `tmp/probe/FAC6ABDAA3CBA-20261001T003349Z`): item mail 2218 taken with the slot-byte order on the wire, `soap gm read mail` shows its items gone, `soap truth` shows entry 159 count 5 | `Handlers/MailHandler.cpp:517-634` |
| `CMSG_MAIL_RETURN_TO_SENDER` | `live` | two-account proof: A returns B's money letter 2257 (run `tmp/probe/FAC6ABDB41C02-20261001T012545Z`): `CMSG_MAIL_RETURN_TO_SENDER` out with 20 bytes, action 3 ok, and B's `read mail` lists returned letter 2264 with money 100 from A; the return guid order is unit-tested against `Handlers/MailHandler.cpp:442` | `Handlers/MailHandler.cpp:436-514` |
| `CMSG_MAIL_DELETE` | `live` | probe flow `mail-actions --arg do=delete` (run `tmp/probe/FAC6ABDAA3CBA-20261001T003534Z`): text letter 2220 deleted, `soap gm read mail` lists only 2219 and 2218 afterwards | `Handlers/MailHandler.cpp:406-434` |
| `CMSG_MAIL_CREATE_TEXT_ITEM` | `live` | probe flow `mail-actions --arg do=copy` (run `tmp/probe/FAC6ABDAA3CBA-20261001T003507Z`): text letter 2220 copied, action 5 ok | `Handlers/MailHandler.cpp:824-846` |
| `CMSG_SEND_MAIL` | `live` | two-account proof, B `Fgklnlebnmm` to A `Fgklnlebmac`: money send 100 copper (run `tmp/probe/FAC6ABDB41DCC-20261001T011735Z`): `CMSG_SEND_MAIL` out, action 0 ok, A's puppet trace shows `SMSG_RECEIVED_MAIL`; Linen Cloth send (run `tmp/probe/FAC6ABDB41DCC-20261001T012452Z`): `CMSG_SEND_MAIL` out 62 bytes, action 0 ok, B loses the cloth and money falls 49740 to 49710 (30 postage); refusals: `to=NobodyhereXYZ` answers `recipient_not_found` (run `tmp/probe/FAC6ABDB41DCC-20261001T012018Z`), own name throws `cannot_send_to_self` before sending (run `tmp/probe/FAC6ABDB41DCC-20261001T012049Z`) | `Handlers/MailHandler.cpp:66-375` |
| `SMSG_SHOW_MAILBOX` | `mock`, not seen live | rig test from `Handlers/NPCHandler.cpp:74-79`; two live tries (a `--send SMSG_SHOW_MAILBOX` probe and the `mail-inbox` flow expecting it) drew no server send | `Handlers/NPCHandler.cpp:74-79` |
