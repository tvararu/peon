# complaints

The `complaints` area builds spam reports and reads the server's one-byte
reply. World-service code reaches it through
`session.areas.complaints.act.complain(guid, detail)`: `detail` is either
`{ kind: "mail", mailId }` or `{ kind: "chat", language, chatType,
channelId, secondsAgo, text }`. The act sends `CMSG_COMPLAIN`, then waits
up to three seconds for `SMSG_COMPLAIN_RESULT` and resolves `true` on the
reply, `false` on a timeout; an abort signal rejects with an `AbortError`.
The area emits `complaint_received` with the reply code. The store keeps
the received codes in `snapshot().received`.

## Wire notes

- `CMSG_COMPLAIN` is a `u8` spam type (0 mail, 1 chat) before a full
  `u64` spammer guid; type 0 continues with three `u32` (zero, the mail
  id, zero), type 1 with four `u32` (language, message type, channel id,
  seconds since the message) and a C string description; any other type
  reads nothing more (`Server/Packets/MiscPackets.cpp:144-163`, field
  types `Server/Packets/MiscPackets.h:214-228`). The area writes the guid
  as a full `u64`.
- `SMSG_COMPLAIN_RESULT` is one `u8`
  (`Server/Packets/MiscPackets.cpp:165-170`). The parser reads the first
  byte and ignores a second, so a two-byte body still decodes.
- The handler always answers with `SMSG_COMPLAIN_RESULT` and, with
  `LogSpamReports` on, writes a `spam_reports` row
  (`Handlers/MiscHandler.cpp:1141-1165`).

## Left out

The live send (N25): no worker sends a complaint, because every send
writes a moderation row that outlives the accounts.

## Capabilities row

No verb: `session.areas.complaints.act.complain` reports chat and mail
spam and waits for the reply, without sending live.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_COMPLAIN` | `builder` | the mail and chat builders match the reader `Server/Packets/MiscPackets.cpp:144-163`; the test asserts every field and no byte left; not seen live, a live send writes a `spam_reports` row | `Server/Packets/MiscPackets.cpp:144-163` |
| `SMSG_COMPLAIN_RESULT` | `mock` | the area test injects `SMSG_COMPLAIN_RESULT` built from `Server/Packets/MiscPackets.cpp:165-170`; not seen live, a live send writes a `spam_reports` row | `Server/Packets/MiscPackets.cpp:165-170` |
