# tickets

The `tickets` area reads the GM ticket system and talks to it: whether
the queue is open, the character's one open ticket, a ticket created,
re-worded or abandoned, a GM's answer and the survey that follows it,
and free-text bug and lag reports. World-service code reaches it through
`session.areas.tickets.act`; the store snapshot holds `systemEnabled`,
the open `ticket` (or `{ status: "none" }`) and the last GM `response`.
The area emits `ticket`, `created`, `updated`, `deleted`, `gm_response`
and `gm_survey`.

The acts:

- `ticketSystem()` sends `CMSG_GMTICKET_SYSTEMSTATUS` and resolves
  `{ enabled }` on `SMSG_GMTICKET_SYSTEMSTATUS`.
- `ticket()` sends `CMSG_GMTICKET_GETTICKET` and resolves the open
  ticket, or `{ status: "none" }` when the server reports no ticket. When
  a GM has already answered, the server sends `SMSG_GMRESPONSE_RECEIVED`
  instead of the ticket.
- `createTicket(text, needMoreHelp)` sends `CMSG_GMTICKET_CREATE` with
  the character's map and position and resolves `created` with the reply
  outcome, or `no_reply` when the reply never arrives.
  `updateTicket(text)` sends `CMSG_GMTICKET_UPDATETEXT`;
  `abandonTicket()` sends `CMSG_GMTICKET_DELETETICKET`. Both resolve with
  the reply outcome or settle on `no_reply`.
- `resolveGmResponse()` sends `CMSG_GMRESPONSE_RESOLVE` and resolves
  `resolved` with whether the server offered a survey, or `none`.
  `submitSurvey`, `reportBug` and `reportLag` send `CMSG_GMSURVEY_SUBMIT`,
  `CMSG_BUG` and `CMSG_GM_REPORT_LAG`; the server answers none of them,
  so they resolve `recorded` once sent.

The area has no agent verb. A GM's answer is the one thing that reaches
the agent: the harness area turns `gm_response` into the wake row
`tickets/gm_reply` (the ticket id rides in its data, the answer in its
text).

## Wire notes

- The system status answer is one `u32`, 1 enabled and 0 disabled
  (`Handlers/TicketHandler.cpp:188-195`). `ticketSystem()` resolves on
  `SMSG_GMTICKET_SYSTEMSTATUS` itself through `ctx.expect`, not on a
  store event: an unchanged status raises no event, so an event wait
  would time out on the second ask.
- The get-ticket handler (`CMSG_GMTICKET_GETTICKET`) answers
  `SMSG_QUERY_TIME_RESPONSE` first, then the ticket when one is open, the
  default status `0x0a` alone when there is none, or the GM response when
  one has answered (`Handlers/QueryHandler.cpp:77-80` sends it;
  `Handlers/TicketHandler.cpp:173-186` calls it). Live, a character
  without a ticket got the 4-byte body `0a000000`.
- The create handler reads the map, three floats, the text, a `u32`
  response flag, a `u8` help flag, then a `u32` count of chat-log times
  and a `u32` decompressed size; the chat log is read only when both are
  non-zero. It answers one `u32`: 2 on success (`SMSG_GMTICKET_CREATE`),
  3 when the character already has an open ticket. A queue that is off,
  or a level below `LevelReq.Ticket`, answers nothing
  (`Handlers/TicketHandler.cpp:30-40`,
  `Handlers/TicketHandler.cpp:126-128`).
- The update handler reads one string and answers one `u32`
  (`SMSG_GMTICKET_UPDATETEXT`): 4 when the character has a ticket, 5 when
  not (`Handlers/TicketHandler.cpp:131-156`). Live, with no ticket, it
  answered 5 (`update_error`).
- The delete handler answers `SMSG_GMTICKET_DELETETICKET` (9) and then
  re-sends the ticket status, but only when a ticket exists; with none it
  sends nothing (`Handlers/TicketHandler.cpp:158-171`). The act returns
  `{ status: "none", outcome: "no_reply" }` after its timeout. Live, the
  delete was accepted with no reply and the session stayed up.
- `CMSG_GMRESPONSE_RESOLVE` is an empty packet. With a ticket it sends
  `SMSG_GMRESPONSE_STATUS_UPDATE` (one byte, 1 shows the survey),
  `SMSG_GMTICKET_DELETETICKET` and the default status; with none it sends
  nothing (`Handlers/TicketHandler.cpp:280-300`). Live, with no ticket,
  the session stayed up and nothing came back.
- `SMSG_GMRESPONSE_RECEIVED` is a `u32` response id (always 1), the
  ticket id, the ticket text and four NUL-terminated response chunks;
  every chunk gets its NUL even when empty
  (`Tickets/TicketMgr.cpp:135-159`). `parseGmResponse` reads exactly four
  NUL-terminated chunks and joins them, and throws on a response id other
  than 1.
- `CMSG_GMSURVEY_SUBMIT` is a `u32` survey id, then up to ten (`u32`
  question, `u8` rank, string comment) rows that stop at a zero question
  id, then a closing comment string
  (`Handlers/TicketHandler.cpp:197-254`). The builder writes the zero
  terminator only when fewer than ten answers go in, and refuses a
  question id of 0 or more than ten answers.
- `CMSG_BUG` is a `u32` suggestion flag, a `u32` content length and the
  content string, then a `u32` type length and the type string
  (`Handlers/MiscHandler.cpp:616-631`). The server reads the strings as C
  strings and ignores the lengths, but the wowm layout counts the
  terminator, so `buildBug` writes `byteLength + 1` for each.
- `HandleReportLag` reads a `u32` lag type, a `u32` map and three floats
  from `CMSG_GM_REPORT_LAG` (`Handlers/TicketHandler.cpp:256-278`).
- The kick on invalid chat links guards every string the area sends, so
  the area passes text through `cleanText`: the create, update and survey
  handlers reject bad links that way, and the bug text lands in its
  report row from the raw strings.

## Left out

- `CMSG_GMTICKET_CREATE` is unseen: a created ticket sits in the GM queue
  and pings online GMs (`Handlers/TicketHandler.cpp:118-123`), so no
  throwaway character sends one. `CMSG_BUG` writes a bug report row
  (`Handlers/MiscHandler.cpp:616-631`); `CMSG_GMSURVEY_SUBMIT` and
  `CMSG_GM_REPORT_LAG` likewise write rows a GM reads
  (`Handlers/TicketHandler.cpp:197-254`,
  `Handlers/TicketHandler.cpp:256-278`). The replies
  `SMSG_GMRESPONSE_RECEIVED` and `SMSG_GMRESPONSE_STATUS_UPDATE` need a GM
  to answer, and the delete reply needs an open ticket. The builders and
  parsers are covered by tests written from the AzerothCore writers and
  readers above (`packages/core/src/wow/areas/tickets/protocol.test.ts`,
  `runtime.test.ts`).
- `CMSG_GMTICKETSYSTEM_TOGGLE`, `SMSG_GM_TICKET_STATUS_UPDATE` and
  `SMSG_GMRESPONSE_DB_ERROR` are `dead`: the build registers each as
  `STATUS_NEVER` and no code sends or handles them
  (`Server/Protocol/Opcodes.cpp:797`,
  `Server/Protocol/Opcodes.cpp:939`,
  `Server/Protocol/Opcodes.cpp:1393`).
- There is no agent verb: a ticket reaches a human GM, so an agent that
  files one has no way to be answered in an eval. The wake row is the
  whole agent surface.

## Capabilities row

None: the area has no agent verb and no scenario. Peon reads the GM
ticket system and surfaces a GM's answer, and cannot file a ticket on the
agent's behalf. `docs/capabilities.md` lists it under "Not shown by any
scenario", and `docs/harness.md` records the `tickets/gm_reply` wake.

## Proof

Live proof on the `max80` account `FAC6AC63F0A74` (no open ticket on the
character), probe flows `tickets-read` and `tickets-none`
(`packages/devtools/src/probe-flows/tickets-read.ts`, `tickets-none.ts`).
The traces are kept as `FAC6AC63F0A74-20261007T124624Z`
(`tickets-read`: the status and the ticket read) and
`FAC6AC63F0A74-20261007T124948Z` (`tickets-none`: the update, delete and
resolve sends) in the 597-wave7 `tickets` artifact directory.

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_GMTICKET_SYSTEMSTATUS` | `live` | `FAC6AC63F0A74-20261007T124624Z`: the empty send | `Handlers/TicketHandler.cpp:188-195` |
| `SMSG_GMTICKET_SYSTEMSTATUS` | `live` | same run: body `01000000`, the queue is enabled | `Handlers/TicketHandler.cpp:188-195` |
| `CMSG_GMTICKET_GETTICKET` | `live` | `FAC6AC63F0A74-20261007T124624Z` and `FAC6AC63F0A74-20261007T124948Z`: the empty send | `Handlers/TicketHandler.cpp:173-186` |
| `SMSG_GMTICKET_GETTICKET` | `live` | same runs: body `0a000000`, status none | `Tickets/TicketMgr.cpp:436-445` |
| `CMSG_GMTICKET_UPDATETEXT` | `live` | `FAC6AC63F0A74-20261007T124948Z`: the 11-byte send with no ticket open | `Handlers/TicketHandler.cpp:131-156` |
| `SMSG_GMTICKET_UPDATETEXT` | `live` | same run: 4-byte reply, `update_error` (code 5) | `Handlers/TicketHandler.cpp:141-155` |
| `CMSG_GMRESPONSE_RESOLVE` | `live` | same run: sent with no ticket, no reply, session stayed up | `Handlers/TicketHandler.cpp:280-300` |
| `CMSG_GMTICKET_DELETETICKET` | `live` | same run: sent with no ticket, no reply, session stayed up (the server answers only with a ticket) | `Handlers/TicketHandler.cpp:158-171` |
| `CMSG_GMTICKET_CREATE` | `mock` (`unseen`, a created ticket pings online GMs and sits in their queue) | `packages/core/src/wow/areas/tickets/protocol.test.ts`, `runtime.test.ts` | `Handlers/TicketHandler.cpp:30-129` |
| `SMSG_GMTICKET_CREATE` | `mock` (`unseen`, follows the create) | same tests | `Handlers/TicketHandler.cpp:126-128` |
| `SMSG_GMTICKET_DELETETICKET` | `mock` (`unseen`, the server sends it only for an open ticket) | same tests | `Handlers/TicketHandler.cpp:158-171` |
| `SMSG_GMRESPONSE_RECEIVED` | `mock` (`unseen`, needs a GM answer) | same tests, the four-chunk body | `Tickets/TicketMgr.cpp:135-159` |
| `SMSG_GMRESPONSE_STATUS_UPDATE` | `mock` (`unseen`, needs a GM answer) | same tests | `Handlers/TicketHandler.cpp:289-291` |
| `CMSG_GMSURVEY_SUBMIT` | `mock` (`unseen`, writes a survey row a GM reads) | same tests | `Handlers/TicketHandler.cpp:197-254` |
| `CMSG_BUG` | `mock` (`unseen`, writes a bug report row a GM reads) | same tests, the terminator-inclusive lengths | `Handlers/MiscHandler.cpp:616-631` |
| `CMSG_GM_REPORT_LAG` | `mock` (`unseen`, writes a lag report row a GM reads) | same tests | `Handlers/TicketHandler.cpp:256-278` |
| `CMSG_GMTICKETSYSTEM_TOGGLE` | `dead` | `STATUS_NEVER`, no handler | `Server/Protocol/Opcodes.cpp:797` |
| `SMSG_GM_TICKET_STATUS_UPDATE` | `dead` | `STATUS_NEVER`, no send site | `Server/Protocol/Opcodes.cpp:939` |
| `SMSG_GMRESPONSE_DB_ERROR` | `dead` | `STATUS_NEVER`, no send site | `Server/Protocol/Opcodes.cpp:1393` |
