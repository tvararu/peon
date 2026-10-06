# Test-audit ledger

Issue #579. Baseline `08900452`: 8,601 tests in 906 files, 0 failing.

This ledger applies openclaw's
[test-audit skill](https://github.com/openclaw/openclaw/blob/main/.agents/skills/test-audit/SKILL.md)
in campaign mode
([CAMPAIGN.md](https://github.com/openclaw/openclaw/blob/main/.agents/skills/test-audit/CAMPAIGN.md),
step 3) to every test declaration under `packages/`: 7,972 declarations in
64 lanes. One read-only agent read each lane, with its production owners and
overlapping tests, and marked every declaration. A second pass rechecked
every mark about prose against the text ruling below. The raid lane is cut
over in the same PR, and its section shows the marks after that cutover;
every other lane is a plan, not a change.

Treat a lane as input to a cutover, not as the edit list. Before applying a
lane, reread each non-`R` test and its keeper: the raid cutover found most
marks sound, and needed a few renamed rather than extended. Several lanes
wrote `R` evidence from test names rather than a full read of the owner,
so an `R` is weaker evidence than an `F`, `C` or `D`.

## Findings outside the tests

These come from the lane notes below and need their own issues; the audit
changes none of them.

- `packages/harness/test-support/tool-harness.ts` `expectSendKind` throws
  only for `read` and `control` tools, so every call on an `action` or `run`
  tool asserts nothing (raid, harness-tools-1).
- `FriendStore.setNote` reuses `update`, which emits `friend-online` for an
  online friend, so a note edit reads as the friend logging in
  (`friend-store.test.ts:194`, core-wow-2).
- `MAX_CONTENT_BYTES` in `packages/harness/src/tools/define.ts` is declared
  but never enforced (harness-tools-1).
- `PAGE_READ_MAX_PAGES` is defined twice, in objects `runtime.ts` and
  `store.ts` (area-objects).
- `parseFramingVariant` has no production caller (harness-runtime).
- Harness rows and tool results render values into `text` that `data` does
  not always carry. Putting every rendered value in `data` and building
  `text` from it in one formatter would let tests assert `data` and pin the
  formatter once.
- Each lane's `Seams` list names exports and parameters only tests use.

## Marks

Each line is `- <line> <mark>: <evidence>` under its test file.

- `R` retain: the contract it guards and the bug it catches.
- `F` fix: the contract stays, the assertion is weak, vacuous or pins prose.
- `C` consolidate: the assertion moves into the keeper named after the mark.
- `D` delete: the remaining proof (`path:line`) or why no contract exists.

`it.each` and `test.each` tables count as one declaration. Line numbers are
at the baseline commit.

## Rulings the marks follow

- Packet layouts checked against reference bytes or AzerothCore writers are
  protocol contracts.
- Agents read only text: event delivery shows a row's `text`, never its
  `data`, and tool results reach the agent as text. Status codes and reason
  codes (`DONE`, `REFUSED not_master`) are contracts. So is any value the
  code computes or looks up and renders into that text: a looked-up or
  substituted name, an item name resolved from state, a label mapped from a
  code (icon, flag, transition, result table), a computed number (1-based
  index, seconds, distance, bearing), and a branch label unless a status or
  reason code in the same text already tells the branches apart (`data` does
  not count: the agent never sees it). Assert the value, not the sentence
  around it. Whole-sentence pins, `toEqual` over a row's prose, names the
  rule copies unchanged from the event when `data` asserts them, and prose
  beside a code that already proves the branch are wording.
- `WorldHandle` spy assertions in harness tool tests are the harness-to-core
  boundary, unless the mock implements the behaviour under test or another
  test asserts the same call for the same branch.
- Static or slow is no reason to delete. A `C` or `D` always names a keeper
  or says why no contract exists; an uncertain test stays `R`.
- Lanes follow production owners: one lane per game area spans core
  `src/wow/areas/<area>` and harness `src/areas/<area>`, and large lanes
  split into numbered parts.

## Lanes

| lane | files | R | F | C | D |
|---|---|---|---|---|---|
| [area-account](#area-account) | 4 | 21 | 3 | 0 | 0 |
| [area-achievements](#area-achievements) | 5 | 23 | 0 | 4 | 2 |
| [area-ambience](#area-ambience) | 5 | 40 | 1 | 2 | 4 |
| [area-auction](#area-auction) | 3 | 49 | 3 | 1 | 0 |
| [area-bank](#area-bank) | 4 | 42 | 8 | 1 | 1 |
| [area-battlegrounds](#area-battlegrounds) | 6 | 57 | 5 | 1 | 0 |
| [area-buyback](#area-buyback) | 5 | 26 | 3 | 1 | 1 |
| [area-calendar](#area-calendar) | 5 | 22 | 4 | 0 | 2 |
| [area-channels](#area-channels) | 5 | 48 | 4 | 3 | 0 |
| [area-charters](#area-charters) | 4 | 31 | 2 | 1 | 1 |
| [area-combatlog](#area-combatlog) | 22 | 142 | 14 | 2 | 11 |
| [area-complaints](#area-complaints) | 4 | 13 | 0 | 1 | 0 |
| [area-contacts](#area-contacts) | 4 | 16 | 2 | 1 | 0 |
| [area-emotes](#area-emotes) | 7 | 36 | 2 | 4 | 2 |
| [area-framework](#area-framework) | 5 | 40 | 1 | 0 | 2 |
| [area-guildadmin](#area-guildadmin) | 3 | 12 | 2 | 0 | 2 |
| [area-inspect](#area-inspect) | 4 | 14 | 1 | 1 | 2 |
| [area-instances](#area-instances) | 11 | 126 | 16 | 1 | 3 |
| [area-items-1](#area-items-1) | 17 | 145 | 3 | 1 | 0 |
| [area-items-2](#area-items-2) | 13 | 129 | 6 | 3 | 1 |
| [area-lfg](#area-lfg) | 10 | 133 | 7 | 1 | 5 |
| [area-login](#area-login) | 5 | 35 | 1 | 5 | 4 |
| [area-looting](#area-looting) | 4 | 34 | 2 | 1 | 1 |
| [area-mail](#area-mail) | 10 | 82 | 2 | 2 | 2 |
| [area-objects](#area-objects) | 18 | 136 | 6 | 4 | 3 |
| [area-pets](#area-pets) | 18 | 197 | 14 | 2 | 0 |
| [area-quests](#area-quests) | 11 | 123 | 9 | 6 | 4 |
| [area-raid](#area-raid) | 29 | 286 | 12 | 1 | 8 |
| [area-reputation](#area-reputation) | 8 | 86 | 1 | 3 | 4 |
| [area-selfstate](#area-selfstate) | 10 | 116 | 12 | 1 | 1 |
| [area-spells](#area-spells) | 27 | 187 | 10 | 7 | 5 |
| [area-talents](#area-talents) | 15 | 168 | 13 | 3 | 2 |
| [area-threat](#area-threat) | 6 | 52 | 7 | 1 | 5 |
| [area-time](#area-time) | 4 | 26 | 1 | 1 | 2 |
| [area-trade](#area-trade) | 10 | 111 | 5 | 7 | 4 |
| [area-transports](#area-transports) | 9 | 57 | 3 | 0 | 0 |
| [area-travel](#area-travel) | 7 | 78 | 10 | 2 | 1 |
| [area-unitmotion](#area-unitmotion) | 5 | 30 | 3 | 6 | 1 |
| [area-vehicles](#area-vehicles) | 9 | 88 | 11 | 3 | 3 |
| [core-lib](#core-lib) | 11 | 70 | 2 | 0 | 17 |
| [core-protocol-1](#core-protocol-1) | 19 | 160 | 20 | 9 | 9 |
| [core-protocol-2](#core-protocol-2) | 15 | 180 | 19 | 4 | 6 |
| [core-protocol-3](#core-protocol-3) | 19 | 158 | 3 | 16 | 2 |
| [core-world-handlers](#core-world-handlers) | 15 | 112 | 15 | 3 | 2 |
| [core-wow-1](#core-wow-1) | 29 | 248 | 7 | 1 | 3 |
| [core-wow-2](#core-wow-2) | 24 | 243 | 5 | 5 | 4 |
| [core-wow-3](#core-wow-3) | 34 | 241 | 6 | 0 | 0 |
| [devtools](#devtools) | 11 | 78 | 1 | 1 | 1 |
| [devtools-probe-flows](#devtools-probe-flows) | 51 | 213 | 4 | 0 | 0 |
| [factory-1](#factory-1) | 18 | 171 | 3 | 0 | 0 |
| [factory-2](#factory-2) | 14 | 115 | 7 | 1 | 8 |
| [harness-events-ui-1](#harness-events-ui-1) | 16 | 135 | 3 | 1 | 2 |
| [harness-events-ui-2](#harness-events-ui-2) | 17 | 125 | 6 | 0 | 0 |
| [harness-grader-1](#harness-grader-1) | 21 | 177 | 3 | 1 | 1 |
| [harness-grader-2](#harness-grader-2) | 12 | 141 | 2 | 4 | 16 |
| [harness-loops-1](#harness-loops-1) | 30 | 161 | 3 | 2 | 0 |
| [harness-loops-2](#harness-loops-2) | 18 | 154 | 3 | 5 | 0 |
| [harness-misc](#harness-misc) | 27 | 157 | 4 | 2 | 10 |
| [harness-navigation](#harness-navigation) | 22 | 150 | 12 | 2 | 0 |
| [harness-ops](#harness-ops) | 26 | 225 | 13 | 1 | 1 |
| [harness-runtime](#harness-runtime) | 36 | 226 | 10 | 8 | 8 |
| [harness-tools-1](#harness-tools-1) | 22 | 146 | 41 | 2 | 7 |
| [harness-tools-2](#harness-tools-2) | 29 | 181 | 11 | 10 | 1 |
| [harness-tools-3](#harness-tools-3) | 19 | 128 | 56 | 2 | 1 |
| **total** | | 7152 | 468 | 164 | 188 |

## area-account

### packages/core/src/wow/areas/account/area.test.ts
- 11 R: area wiring end to end (act -> waiter -> store -> both events); a missing route or unwired store breaks it

### packages/core/src/wow/areas/account/protocol.test.ts
- 19 R: parses SMSG_UPDATE_ACCOUNT_DATA guid/type/time and inflated UTF-8 text; a field-order slip misreads it
- 33 R: size 0 ignores the 13-byte tail the server pads; reading it as zlib would throw
- 44 R: size mismatch against inflated length throws; guards corrupt packets
- 60 F: expected body comes from the test-support deflate helper and the final length check is tautological; assert inflating the tail gives "peon"
- 81 R: empty text writes size 0 and no bytes per MiscHandler
- 87 R: 0xFFFF and NUL limits the server enforces; builder must refuse before sending
- 98 R: CMSG_REQUEST_ACCOUNT_DATA u32 layout and 0-7 bound
- 107 R: parses complete type and skips the zero word
- 116 R: mask read must not consume the times; the runtime depends on the cursor
- 126 R: CMSG_TUTORIAL_FLAG u32 layout against literal bytes and the 0-255 boundary

### packages/core/src/wow/areas/account/runtime.test.ts
- 12 R: sends empty 0x4FF and resolves only on the 0x15 global mask, skipping the per-character 0xEA packet
- 44 R: timeout after 5 s when only the wrong-mask packet arrives; proves the filter and the timeout
- 69 F: name promises 0x20A "with the type" but only the opcode is asserted; assert the body equals the u32 type 7
- 99 R: accountData rejects "timeout" at 5 s with no reply
- 116 F: name promises 0x20B for save and erase but only counts two packets; assert both bodies (type, time, text vs empty erase)
- 144 R: saveAccountData rejects "timeout" at 5 s with no 0x463
- 161 R: validation failure sends nothing and leaves no waiter; a leaked subscription would be a bug
- 179 R: tutorialFlag packet layout and immediate resolve
- 194 R: out-of-range tutorial bit rejects before sending; act-level path differs from the builder
- 204 R: clear and reset tutorials send the right opcodes with empty bodies

### packages/core/src/wow/areas/account/store.test.ts
- 10 R: store keeps entries per type in arrival order and emits account_data with byte count
- 47 R: same-type update replaces the entry, not appends; a duplicate row would break
- 76 R: 0x463 emits account_data_saved and records lastSaved

#### Seams
- none

#### Defects
- none

## area-achievements

### packages/core/src/wow/areas/achievements/area.test.ts
- 46 R: login data opcode wiring fills the set; criteria update silent; a miswired handler or stray event would show
- 71 R: achievement_earned opcode wiring, self and other guid, recent ordering through the real dispatcher
- 104 R: SMSG_SERVER_FIRST opcode reaches the store and emits server_first without touching the set
- 125 R: both delete opcodes are routed to the right store method; swapped handlers would fail
- 152 R: SMSG_TITLE_EARNED opcode wiring updates known bits and emits title_changed
- 168 R: area events are forwarded to the world bus tagged `achievements/<type>`; a missing forward breaks bus consumers

### packages/core/src/wow/areas/achievements/protocol.test.ts
- 36 R: SMSG_CRITERIA_UPDATE layout: id, packed counter, time; wrong field order misreads progress
- 51 R: SMSG_ACHIEVEMENT_EARNED packed guid, id, time; two guids hit different packed-guid masks
- 66 C packages/core/src/wow/areas/achievements/protocol.test.ts:81: same parser, only link value differs; no new branch
- 81 R: SMSG_SERVER_FIRST layout incl. u32 link and full consumption (remaining 0)
- 98 R: one-u32 layout for both delete packets
- 108 R: SMSG_TITLE_EARNED bit and earned flag, both flag values
- 117 R: CMSG_SET_TITLE writes int32 LE bit or 0xffffffff to clear

### packages/core/src/wow/areas/achievements/runtime.test.ts
- 34 R: self entity appear/update refreshes known title bits and chosen; a missed update leaves stale titles
- 59 R: another guid's fields are ignored; catches missing self-guid filter
- 80 R: setTitle sends CMSG_SET_TITLE with the bit, undefined sends -1; asserts actual packets
- 101 R: bad_title (0, 192) and unknown_title refusals send nothing; status reasons are agent-facing contracts

### packages/core/src/wow/areas/achievements/store.test.ts
- 32 D: trivial initial state; full empty snapshot also asserted at store.test.ts:152
- 41 R: replace clears prior sets, setCriteria overwrites/adds, no events on login data
- 73 R: recent is capped at five and newest first; catches the slice/sort bug
- 84 R: own achievement joins the set (recent ordering, replace-then-earned) with self: true
- 100 C packages/core/src/wow/areas/achievements/area.test.ts:71: other-player earned (self false, set untouched) is asserted there through the dispatcher
- 109 C packages/core/src/wow/areas/achievements/area.test.ts:125: same deletions and events asserted via the real opcodes
- 129 R: lost title leaves known bits and emits earned false; area test covers only the earn branch
- 143 R: setTitles replaces known bits and chosen; knows() true/false
- 152 C packages/core/src/wow/areas/achievements/area.test.ts:104: server_first emit and no state change already asserted via the opcode path

### packages/core/src/wow/areas/achievements/titles.test.ts
- 17 R: bitmask decode across the six words, incl. word 5 top bit (191); wrong shift or word offset misreads titles
- 25 R: empty fields default to no titles and chosen 0
- 29 D: bit 191 already decoded in titles.test.ts:17

#### Seams
- packages/core/src/wow/areas/achievements/store.ts `counter`: only store.test.ts:41 calls it; no production caller

#### Defects
- none

## area-ambience

### packages/core/src/wow/areas/ambience/area.test.ts
- 37 R: INIT_WORLD_STATES seeding + UPDATE_WORLD_STATE through real dispatch; a swapped id/value or missing sort misreports states
- 68 R: SMSG_WEATHER wired to store with event; wrong handler registration drops weather
- 83 R: SMSG_NEW_WORLD clears per-map state but keeps phase mask; a clear that wipes the mask breaks phase visibility
- 120 R: PLAY_SOUND emits sound event without touching state; accidental music retention would be caught
- 134 R: PLAY_MUSIC emits each event and keeps only last; stale music would mislead the agent
- 149 R: OBJECT_SOUND full 8-byte guid rendered as decimal; packed-guid read or number precision loss would break source
- 173 R: OVERRIDE_LIGHT sets light with fade ms; wrong field order misreports light
- 192 R: phase shift default, same-mask silence, unsigned mask, change events through dispatch
- 214 R: cinematic recorded then auto-completed with one CMSG_COMPLETE_CINEMATIC; missing completion hangs the login cinematic
- 246 R: TRIGGER_MOVIE records movie and sends nothing; an auto-complete wrongly applied to movies would be caught

### packages/core/src/wow/areas/ambience/protocol.test.ts
- 30 R: UPDATE_WORLD_STATE layout, negative int32 value, fully consumed
- 38 R: SMSG_WEATHER layout with state 106 and float intensity; wrong width misreads
- 50 R: CMSG_ZONEUPDATE body bytes against MiscHandler read; wrong endian or width breaks the zone update
- 54 R: TRIGGER_CINEMATIC uint32 sequence id layout
- 60 R: TRIGGER_MOVIE uint32 movie id layout
- 66 C packages/core/src/wow/areas/ambience/runtime.test.ts:54: empty body already asserted on the sent packet there
- 70 C packages/core/src/wow/areas/ambience/runtime.test.ts:54: empty body already asserted on the sent packet there
- 74 R: PLAY_SOUND/PLAY_MUSIC single uint32 layout, fully consumed
- 83 R: OBJECT_SOUND 8-byte unpacked guid; a packed read would corrupt source
- 92 R: OVERRIDE_LIGHT three uint32 layout, field order
- 108 R: SET_PHASE_SHIFT mask kept unsigned above int32; signed read would give negative mask

### packages/core/src/wow/areas/ambience/runtime.test.ts
- 10 R: act.sendZoneUpdate sends CMSG_ZONEUPDATE with LE zone id through the real runtime
- 25 D: fresh rig has no sent packets, passes for any impl that does not send at construction; keeper area.test.ts:246 asserts sent [] after real injection
- 34 D: same injection, sent packet and completed state asserted by core area.test.ts:214; keeper area.test.ts:214
- 54 R: act.completeCinematic/nextCinematicCamera opcodes and empty bodies; swapped opcodes would be caught
- 71 D: duplicates area.test.ts:246 (movie recorded, nothing sent); keeper area.test.ts:246

### packages/core/src/wow/areas/ambience/store.test.ts
- 14 R: initial snapshot defaults, phaseMask 1
- 26 R: resetStates replaces all states sorted by id and emits nothing
- 40 R: setState adds/overwrites with previous value in event
- 59 R: weather emit-on-change rules (abrupt-only change silent); event spam otherwise
- 85 R: clear empties states and weather after population
- 101 R: clear drops music and light, keeps phase mask
- 113 R: only music is kept as state; source rendered "" / decimal string
- 127 F: name bundles two contracts; split the light-detachment half into its own test (or fold into :138) and keep same-mask silence
- 138 R: snapshot detached from store mutations for states and weather
- 158 R: startCinematic records unfinished and emits with previous
- 175 R: completeCinematic is idempotent, silent without cinematic, emits once
- 196 R: startMovie replaces previous with previous in event

### packages/harness/src/areas/ambience/area.test.ts
- 22 R: completed cinematic yields passive row with sequenceId data; agent-parsed data key
- 41 R: movie event yields passive row with movieId data
- 58 D: ambience rules never read runActive, so this only repeats :41's class assertion; keeper harness area.test.ts:41
- 72 R: phase change yields log row with from/to data
- 83 R: sound and light events produce no rows; loop over runActive is vacuous but flood guard is real
- 106 R: world_state, weather, unfinished cinematic produce no rows (flood guard)
- 132 R: router names row domain ambience / event ambience/movie
- 162 R: attach emits one cinematic row for a cinematic completed before attach
- 176 R: attach silent with no cinematic or unfinished one

#### Seams
- none

#### Defects
- none

## area-auction

### packages/core/src/wow/areas/auction/protocol.test.ts
- 32 R: decodes MSG_AUCTION_HELLO guid, house id, enabled flag; a field-order slip misreports the house
- 39 R: zero enabled flag reads false; a truthiness bug would report a disabled house as open
- 48 R: CMSG hello body is exactly the 8-byte guid; extra bytes would be rejected by the server
- 56 R: decodes list rows, total and search delay from reference layout; a mis-ordered row field corrupts bids
- 96 C packages/core/src/wow/areas/auction/store.test.ts:54: duplicate bidder ids are also asserted through the store ([9,9]); no new parser branch
- 103 R: empty list reads 0 rows/0 total/default delay; an off-by-count or missing-tail read would throw or misread
- 110 R: malformed count/length is refused; protects against reading past the body
- 118 R: pins the byte layout of the any-query list request accepted by live AzerothCore (34 bytes)
- 141 R: name query, paging, level, quality and sort pair layout; a swapped field filters wrong items
- 177 R: sort count over the server limit throws locally; otherwise the server drops the client
- 194 R: owner-list request is guid plus page start (12 bytes)
- 204 R: bidder-list request is 16 + 4n bytes with count and ids
- 215 R: more than 1000 ids refused locally; server-limit error path
- 225 R: sell result omits the tail; reading it would overrun the body
- 232 R: tail word read only when error is 0 and action is not 0; both branches covered
- 249 R: bidder notification word order; a swap misreports won/outbid
- 261 R: owner notification fields (auction id, bid, item entry); wrong offset misreports sales
- 272 R: sell-item layout (counted pair, bid, buyout, minutes) against the AzerothCore reader
- 292 R: remove-item body is guid plus auction id
- 300 R: place-bid body is guid, id, price; swapped words would bid wrongly
- 311 R: pending-sales request is only the guid; distinct builder from 48

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/auction/runtime.test.ts
- 41 R: the 0x200000 npc flag marks an auctioneer; a wrong flag mask would miss or misclassify vendors
- 49 R: a unit without the flag is not an auctioneer; pairs with 41
- 59 R: a distant auctioneer rejects "no auction house in range" and sends nothing; range gate
- 71 R: hello is sent as MSG_AUCTION_HELLO with the guid and the act settles ok on the reply, house state set
- 90 F: name promises paging from 50 but never asserts the sent CMSG body or from=50; assert the request body (or rename)
- 125 R: owner/bidder list acts send the right opcode and settle ok on the matching reply, rows stored
- 158 R: list acts refuse with no open house and send nothing
- 176 R: a silent search settles unanswered after 10 s (timeout path)
- 195 R: run abort rejects a pending search; no hang on teardown
- 213 R: send failure is rethrown and no unhandled rejection leaks from the answer timer; error path
- 250 R: hours not in 12/24/48 refused locally and no sell sent
- 273 F: zero bid asserts only a bare toThrow and no sent check despite the name; assert the reason and that no sell was sent
- 291 R: posts the chosen stack with minutes=720 (exact sell body) and settles with the new auction id
- 324 R: item missing from the bags refused item_not_found before sending
- 344 R: soulbound flag refused not_tradeable
- 365 R: count above the stack refused count_too_large
- 385 R: non-empty equipped bag refused bag_not_empty
- 408 R: cancel sends REMOVE_ITEM and settles ok on the action-1 result tail
- 431 R: bid below listed minimum refused bid_too_low with no PLACE_BID sent
- 453 R: bid settles on action 2 and an error 10 maps to refused bid_own; two real result branches
- 492 R: pending-sales request works without an open house and settles with the count

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/auction/store.test.ts
- 15 R: hello sets house {auctioneer, houseId} and emits house_opened
- 33 R: search reply populates search rows/total/delay and emits listed:search
- 54 R: owner reply fills owned and bidder reply fills bids, duplicate ids kept
- 76 R: a later list kind does not clear an earlier one; state is per kind
- 98 R: a hello settles a pending quest talk and emits the auction window; cross-store contract
- 114 F: name promises the new auction id but asserts only status ok; assert the auctionId (42) in lastOutcome
- 139 R: error 10 on a pending bid settles refused bid_own
- 162 R: bidSum 0 is won, otherwise outbid; both event order and notice kinds
- 186 R: owner notification records a sold notice with the auction id
- 200 R: the notice cap keeps the newest 20 and drops the oldest
- 216 R: pending-sales reply records the count; undefined before it, so 0 is observable

#### Seams
- none: these tests use public store/rig APIs (begin, onEvent, snapshot)

#### Defects
- none

## area-bank

### packages/core/src/wow/areas/bank/protocol.test.ts
- 23 R: banker guid layout for CMSG_BANKER_ACTIVATE/BUY_BANK_SLOT against reference bytes; a wrong guid order breaks banking
- 28 R: u8 bag/u8 slot layout for autobank/autostore packets against reference bytes
- 33 R: out-of-range/non-integer bag or slot throws before a corrupt byte is written
- 41 R: SMSG_BUY_BANK_SLOT_RESULT u32 parse and four result names; a shifted enum mislabels refusals
- 53 R: unknown result code keeps its number, so a new server code is not swallowed

### packages/core/src/wow/areas/bank/runtime.test.ts
- 36 F: the quest lastError undefined assertion passes for any unrelated reason; drop it or assert a real quest-store effect, keep banker + opened
- 50 R: bagSlots read from byte 2 of PLAYER_BYTES_2; a wrong byte shows wrong purchased slot count
- 64 R: openBank sends CMSG_BANKER_ACTIVATE and settles ok only on SMSG_SHOW_BANK
- 83 R: deposit sends CMSG_AUTOBANK_ITEM and settles ok when the guid lands in a bank position
- 102 R: act-level proof that a deposit merging into a roomy stack settles ok (store.test.ts:177 covers the event only)
- 129 R: act started from an opened listener keeps the open outcome; guards re-entrant settle bug
- 157 R: a repeated show-bank during a pending move must not settle it
- 184 R: withdraw sends CMSG_AUTOSTORE_BANK_ITEM and settles ok when the guid returns to the bags
- 207 R: local refusal of withdraw from a carried position; avoids sending an invalid packet
- 219 R: deposit/withdraw throw without an open banker; no packet sent to nowhere
- 233 R: inventory-change failure on the pending guid settles refused with the named reason
- 252 R: failure result 59 settles no_change through the act; the agent-facing status
- 268 R: buyBankSlot sends CMSG_BUY_BANK_SLOT and settles ok on result 3
- 287 R: insufficient-funds result settles refused with reason; agent-parsed reason key
- 306 R: 5 s reply timeout settles unanswered, boundary at 4999/5000 ms
- 322 F: remove the `void bankSetRoot; void bankClear;` keep-alive junk in finally and the unused imports
- 336 F: remove the `void bankSetRoot; void bankClear;` keep-alive junk in finally; the refusal/one-packet assertions are good
- 356 F: remove the `void bankSetRoot; void bankClear;` junk; contract (identical bag in a bank-bag slot must not settle) is real
- 377 F: remove the `void bankSetRoot; void bankClear;` junk; contract (identical equipped bag must not settle a withdraw) is real
- 398 R: late reply from banker A must not settle banker B's open; stale-reply race
- 422 R: a throwing send rejects, clears pending and leaves no timer armed; failure recovery
- 444 R: equipped-item deposit stays pending on unrelated updates and settles ok in a bank slot
- 469 R: act-level bank-full failure for an equipped item settles refused

### packages/core/src/wow/areas/bank/store.test.ts
- 16 R: second show-bank switches banker and re-emits opened with each guid
- 35 R: bank-bag root (slot 67) region counts as a bank position for a deposit
- 59 R: settlement keyed on the guid, not on a duplicate entry elsewhere
- 89 R: guid-less inventory failure refuses the pending move; distinct branch from the guid-matched failure
- 116 R: no_change emits the event and clears pending; the event payload differs from runtime.test.ts:252
- 141 R: slot result without a pending buy is ignored and does not set lastSlotResult
- 153 R: equipped-bag guid in bank roots (slot 68) settles a bag deposit as moved
- 177 R: stack-merge settlement via toCounts (deposit); the count heuristic could misfire
- 215 R: an unchanged bank snapshot must not settle the merge heuristic; negative has a real trigger
- 245 R: withdrawal merge into a carried stack settles as moved on the merged stack guid
- 288 R: result 59 for a different item must not settle the pending move
- 313 R: lastSlotResult follows the latest purchase after an earlier refusal
- 345 R: equipped deposit stays pending then settles; asserts the moved payload runtime.test.ts:444 lacks
- 382 C packages/core/src/wow/areas/bank/runtime.test.ts:469: same equipped bank-full refusal, the act-level test asserts reason and status through the real flow
- 407 R: withdraw must not settle when the item lands in the equipment region

### packages/harness/src/areas/bank/area.test.ts
- 23 D: restates the `worldActs` constant typed by defineHarnessArea (area.ts:74); no behaviour, no other proof needed
- 32 F: `toContain("bank")` pins prose ("Opened the bank." never even contains the banker); the banker is copied unchanged from the event, so drop the text assertion and assert data.banker is the guid text "f130000000000055" (ruling A: echoed value, data asserts it)
- 47 R: deposit row class/event and item name resolved through lookup
- 68 R: withdraw row uses the withdraw event name and resolved item name
- 89 R: unknown entry yields the generic name and the guid is kept in data
- 106 F: the text echoes event.result unchanged, and data.result already carries it; drop `toContain("ok")` and assert data.result === "ok" (ruling A: echoed name, no computed value)
- 121 F: the reason and kind are copied unchanged from the event into data and the wake row name "bank/refused" proves the branch; drop `toContain("cant_carry_more")` and assert data.reason "cant_carry_more" and data.kind "deposit" (ruling A: echoed value)
- 135 R: no_change maps to a wake row named bank/no_change
- 148 R: unanswered maps to a wake row named bank/unanswered

#### Seams
- none

#### Defects
- none

## area-battlegrounds

### packages/core/src/wow/areas/battlegrounds/area.test.ts
- 6 C packages/core/src/wow/areas/battlegrounds/store-self.test.ts:12: flag path is the same update; toContain on one opcode restates the constant, name says four; store.test.ts injects each opcode

### packages/core/src/wow/areas/battlegrounds/protocol.test.ts
- 33 R: pvp credit rank 0xffffffff parses as -1 against AzerothCore layout; a uint read would misreport
- 46 R: MSG_INSPECT_HONOR_STATS field order; a swapped field misreports honor stats
- 69 R: SMSG_ZONE_UNDER_ATTACK area id layout
- 76 R: quest pvp kill quest/count/required order against QuestPackets writer
- 89 R: CMSG_TOGGLE_PVP body bytes for on, off and empty; wrong byte flips pvp
- 95 R: inspect request writes the target guid as 8 bytes
- 105 R: BATTLEFIELD_LIST instance list without the random block and reward fields
- 127 R: random block read only when isRandom is set; misparse shifts instances
- 149 R: arena list form (lone zero, no instances) parses without overrun
- 158 R: 12-byte none status form with slot
- 167 R: WAIT_QUEUE layout including raw arena fields and the word; a field shift corrupts the queue slot
- 201 R: WAIT_JOIN and IN_PROGRESS layouts (timeToRemove, autoLeave, elapsed, faction)
- 243 R: group-joined result sign handling and the guid present only for -11
- 258 R: error names (deserter, too_many_queues, ...) the agent sees in join rejections
- 268 R: request builder byte order against AzerothCore readers; wrong order sends wrong join/port

### packages/core/src/wow/areas/battlegrounds/runtime.test.ts
- 14 R: setPvp sends toggle byte 1 and resolves only on the matching pvp_flag
- 29 F: first setPvp(false) also hits the already-matching path and `update` is unused; set the flag on first so the early-return is what is exercised
- 43 R: setPvp rejects timeout after 3 s with no update
- 56 R: inspectHonor sends request and resolves with stats for that guid
- 87 R: inspectHonor maps silence to no_answer after 3 s
- 114 R: login_verified/new_world each trigger one empty status request; other events send nothing
- 131 R: list sends the bg type and resolves on that bg's list
- 153 R: list ignores a list for another bg and times out
- 170 R: hello resolves only on the list from that master
- 189 R: join default body and resolves on a queued status for the matching bg, skipping another bg
- 209 R: a queue refresh must not resolve join; the following -1 rejects as "none"
- 225 R: via, instance and group flag land in the join body
- 240 R: join rejects with the group-joined error name
- 254 R: positive group result does not resolve join; 5 s timeout
- 272 R: pending join rejects on dispose; no leaked promise
- 279 R: answer on an empty slot rejects no_slot without sending
- 289 R: leaveQueue echoes arena type and bg in the port packet and resolves on none
- 315 R: accept sends action 1 and resolves on active
- 334 R: leaveQueue refuses an invited slot, sends nothing (desertion avoidance)
- 347 R: in_combat guard for answer and leaveQueue sends nothing
- 364 R: answer/leaveQueue time out after 10 s

### packages/core/src/wow/areas/battlegrounds/store-self.test.ts
- 12 R: PLAYER_FLAGS 0x200 plus pvp byte emits a full pvp_flag event with no timer
- 36 R: timer, contested, ffa and sanctuary bits read from their fields
- 53 R: sheath byte 0 of BYTES_2 is not read as the pvp byte
- 66 R: other-guid update emits nothing and leaves self unchanged

### packages/core/src/wow/areas/battlegrounds/store.test.ts
- 18 R: pvp credit appended with negative rank and honor_credit emitted
- 36 R: inspect stats stored per guid and honor_inspect emitted
- 66 R: zone alert appended with area id and timestamp, event emitted
- 82 F: asserts only an unrelated self.lifetimeKills undefined and the event type; assert the pvp_kill_quest payload (quest, count, required)
- 102 R: self honor, arena points, packed kills split into today/yesterday
- 127 R: WAIT_QUEUE slot stamped with receive time, previous kind in bg_status
- 164 R: WAIT_JOIN expiresAt from clock plus timeToRemove, bg_invited payload
- 196 R: IN_PROGRESS stores map, autoLeave, elapsed, faction
- 223 R: none status clears only its slot; bg_left only for a filled slot
- 256 R: repeated WAIT_QUEUE refreshes and reports previous queued (drives join/queued-row dedupe)
- 277 R: slot index past the default queue length grows the array into its own slot
- 292 R: battlefield list stored and bg_list emitted
- 317 R: group-joined result stored, error named, events for failure and success
- 354 R: snapshot slot array mutation does not alias store state

### packages/harness/src/areas/battlegrounds/area.test.ts
- 11 F: toEqual pins the whole row incl. prose "PvP flag is on."; keep event/class/data. Ruling A: flagText maps wants/timer to a label (on / off / counting down) the agent reads from text only, so keep that branch label as a tight `toContain("on")`-style assertion on `text` (wants:true, timer:false), drop the sentence
- 36 F: toEqual pins the whole row incl. prose "Earned 100 honor."; keep event/class/data (honor 100, rank 2). Ruling A: the 100 is copied unchanged from the event and data already asserts it, so drop the text pin entirely
- 58 F: toEqual pins the whole row incl. prose "Zone 42 is under attack."; keep passive class, event and data areaId. Ruling A: 42 is copied unchanged from the event and data asserts it, so drop the text pin entirely
- 80 R: honor_inspect and pvp_kill_quest map to inspect and kill log rows
- 125 R: first queued status logs once; refresh from queued writes nothing
- 152 R: queue_left row only when previous was queued; active writes nothing
- 165 R: bg_invited is a wake row carrying the deadline, map and slot
- 185 R: join_failed only on an error name; success and bg_list write no row

#### Seams
- none: PVP_ANSWER_MS, BG_LIST_MS/BG_JOIN_MS/BG_PORT_MS and the PVP_*_FLAG exports have no test callers (exported but production-internal)

#### Defects
- none

## area-buyback

### packages/core/src/wow/areas/buyback/protocol.test.ts
- 12 R: CMSG_BUYBACK_ITEM bytes vs AzerothCore layout; wrong guid/slot encoding breaks the packet
- 18 R: buyback slot range 74-85 bounds and 85 encoding; a wowm 69-81 range would send bad slots
- 25 R: CMSG_BUY_ITEM_IN_SLOT field order and widths against reference bytes
- 40 R: count is u32 (300 encodes as 2c010000); a u8 count truncates
- 53 R: vendor slot 0 rejected locally since the server treats it as a cheat

### packages/core/src/wow/areas/buyback/runtime-slot.test.ts
- 32 R: backpack buy sends self guid, ignores SMSG_BUY_ITEM for another slot, settles ok on the matching one
- 75 R: in-bag purchase sends the bag item's guid; wrong bag guid targets the wrong container
- 103 R: SMSG_BUY_FAILED for another item is ignored, matching item settles refused not_enough_money
- 144 R: unclaimed inventory failure settles refused bag_full instead of hanging to timeout
- 167 R: precondition refusals (occupied, bad vendor slot, bad bag/slot) throw and send nothing
- 183 R: no vendor window throws; buying without a window would send a bad packet

### packages/core/src/wow/areas/buyback/runtime.test.ts
- 35 R: buyback sends packet, pending state, settles ok when slot empties and bag gains item, emits bought_back
- 70 R: SMSG_BUY_FAILED with the item entry maps to refused not_enough_money, clears pending
- 97 R: SMSG_BUY_FAILED with item 0 maps to refused cant_find_item
- 115 R: SMSG_SELL_ITEM cant_find_vendor maps to refused
- 138 R: inventory failure for another item is ignored, for the sold item settles refused inventory_full
- 166 R: 5 s timeout settles unanswered at exactly 5000 ms and frees the next act
- 187 R: no vendor window throws and sends nothing
- 198 R: pending legacy vendor request blocks buyback; avoids interleaved vendor acts
- 214 R: second buyback while pending throws; no duplicate packet
- 229 R: empty slot and out-of-range slot refuse locally without sending
- 240 R: price above coinage refused locally; no doomed packet

### packages/core/src/wow/areas/buyback/store.test.ts
- 13 R: sold item listed with remembered entry/count, price, soldAt; emits listed once and not on idle touch
- 39 R: item never seen in bags lists with unknown entry/count instead of fabricating
- 59 R: server-emptied slot is dropped and a new list emitted

### packages/harness/src/areas/buyback/area.test.ts
- 29 D: restates the declared worldActs constant; no behaviour, no keeper contract
- 33 F: price is looked up from the remembered listed row and item name resolved via lookup, both rendered only in text; assert toContain("Linen Cloth") and toContain("35 copper"), drop the sentence
- 53 F: unknown-price branch has no status code; assert text toContain("Linen Cloth") and not toContain("copper") (name lookup + missing price branch), drop the exact sentence
- 62 F: reason is copied unchanged from the event and data.reason carries it; assert data.reason === "cant_find_item", drop the text toContain prose
- 76 R: unanswered buyback yields exactly one wake row with event buyback/unanswered
- 89 C packages/harness/src/areas/buyback/area.test.ts:33: listed-yields-no-rows is already asserted as the first step there

#### Seams
- none

#### Defects
- none

## area-calendar

### packages/core/src/wow/areas/calendar/area.test.ts
- 73 R: SMSG_CALENDAR_SEND_CALENDAR is wired to the store and fires exactly one calendar event; a missing wire.on or double emit breaks it
- 92 D: event detail and refused settle are both proven through the same rig by runtime.test.ts:115 and runtime.test.ts:133
- 111 D: pending reply fills pending and settles ok, same branch as runtime.test.ts:160 (count 2 vs 3); "owns its opcodes" is never asserted

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/calendar/protocol.test.ts
- 42 R: empty SMSG_CALENDAR_SEND_CALENDAR parses to empty lists, zero relationTime and the zone time; a misordered header misreads
- 56 R: invite/event rows keep u64 guids and title per CalendarHandler.cpp; a width or order slip corrupts ids
- 91 R: bind, reset period and relationTime layout per CalendarHandler.cpp; a field swap misreports lockouts
- 114 R: holiday fixed arrays (26 dates, 10 durations, 10 flags) and texture string, second holiday proves cursor stays aligned after an empty one
- 165 R: truncated body must throw rather than yield a partial calendar
- 174 R: SEND_EVENT description follows title per CalendarMgr.cpp; wrong order swaps text
- 198 R: SEND_NUM_PENDING reads the u32 count per CalendarHandler.cpp
- 205 R: command-result carries the name only for errors 4, 10, 13; dropping one loses the target name
- 216 R: the other error path reads an empty name and does not over-read the body

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/calendar/runtime.test.ts
- 74 R: get sends an empty CMSG_CALENDAR_GET_CALENDAR and resolves with the parsed state including server offset
- 102 R: get must reject with timeout after 5 s when no reply comes
- 115 R: event sends the little-endian u64 id and resolves with the stored detail
- 133 R: a command-result error settles the pending event act as refused instead of hanging
- 148 R: event act has its own 5 s timeout; a missing timer would hang the agent
- 160 R: pending sends an empty CMSG_CALENDAR_GET_NUM_PENDING and resolves with the stored count
- 181 R: pending act has its own 5 s timeout

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/calendar/store.test.ts
- 93 R: the initial snapshot shape (all lists empty, scalars undefined) is what consumers read before any reply
- 110 R: a send-calendar reply fills every list and recomputes serverOffsetSeconds from zone time vs server time; a wrong offset skews agent times
- 140 F: the detach check is vacuous (`[...arr, 1]` always works); mutate the emitted state.invites and assert store.snapshot() unchanged, and assert details are cleared
- 167 R: send-event stores details by event id and emits the send type; keyed storage is the contract
- 182 F: the detached-state check is vacuous (`[...arr, 1]` always works); mutate the emitted state.events and assert snapshot unchanged
- 207 R: dispose stops listener delivery while the store still accepts updates

#### Seams
- none

#### Defects
- none

### packages/harness/src/areas/calendar/area.test.ts
- 50 F: toEqual pins the sentence in text; keep data keys and assert text toContain "1 invites", "1 events", "2026-07-04 19:00" (counts/stamp the agent reads); drop the sentence
- 75 R: no calendar from the server means no attach row; a fabricated row would mislead the agent
- 81 F: drop worldActs line and the sentence "The calendar refused with error 6." (code 6 in data proves branch); add toContain("2 pending") on the pending row text (count only data-asserted)

#### Seams
- packages/harness/src/areas/calendar/area.ts `worldActs`: also read by harness registry code, so it is not test-only; the assertion at line 81 only restates it

#### Defects
- none

## area-channels

### packages/core/src/wow/areas/channels/area.test.ts
- 32 R: SMSG_CHANNEL_NOTIFY wire to store to channel_notice event; a dropped peek registration loses joins
- 56 C packages/core/src/wow/areas/channels/store.test.ts:57: same notify path as 32; store row deletion there, notice emission at store.test.ts:175
- 86 C packages/core/src/wow/areas/channels/store.test.ts:175: no new area branch; store test asserts rows unchanged and the notice event sequence
- 121 R: SMSG_CHANNEL_LIST and SMSG_CHANNEL_MEMBER_COUNT opcode wiring end to end; a swapped registration breaks members/count

### packages/core/src/wow/areas/channels/notice.test.ts
- 33 R: you_joined layout (flags, id, trailing u32) consumed fully; a misread offset shifts channelId
- 46 R: you_left channel id then constant byte; wrong order flips constant
- 63 R: mode_change guid then old/new flag bytes; swapping flags misreports own rank
- 82 R: invite carries inviter guid; mapped to `inviter` not `guid`
- 98 R: channel_owner reads owner name string
- 114 R: kicked/banned/unbanned read target before actor; swap misattributes the moderator
- 138 R: player_not_found / player_invited name-tail membership
- 152 R: every GUID_TYPES notice reads one trailing guid; a type missing from the list misparses
- 166 R: every bare notice consumes only the channel; a type in the wrong category leaves bytes or over-reads
- 191 R: pins the fixture code table to AzerothCore ChatNotify values; parse tests tie production TYPES to it
- 232 C packages/core/src/wow/areas/channels/notice.test.ts:138: same NAME_TYPES branch; fold the two remaining types into that loop
- 246 R: out-of-range code throws instead of returning a bogus notice (substring is production's own message; acceptable)

#### Seams
- packages/core/test-support/areas/channels.ts `CHANNEL_NOTICE_CODES`: fixture-owned code table, only fixtures and notice.test.ts:191 use it
- packages/core/src/wow/areas/channels/runtime.ts `MAX_CHANNEL_PASSWORD`, `CHANNEL_ANSWER_MS`: exported, no outside users
- packages/core/src/wow/areas/channels/list.ts `CHANNEL_LIST_MS`, store.ts `INVITE_VISIBLE_MS`: exported, no outside users
- packages/core/src/wow/areas/channels/runtime.ts `channelsRuntime` and store.ts `ChannelStore` constructor take an unused `_core` param

#### Defects
- none

### packages/core/src/wow/areas/channels/protocol.test.ts
- 37 R: pins admin action to CMSG opcode table; a swapped mapping is only caught here (runtime.test.ts:98 covers moderator alone)
- 50 R: password body is channel then password cstrings
- 58 R: set_owner body is channel then player
- 66 R: owner query writes only the channel name
- 72 R: moderator/unmoderator are separate builders, each writes channel then player
- 83 R: mute/unmute are separate builders, each writes channel then player
- 94 R: invite writes channel then player
- 103 R: list/display/count requests write the bare channel name
- 110 R: SMSG_CHANNEL_LIST skips leading byte and reads (guid, flags) members; offset bugs misparse
- 129 R: empty list parses to no members
- 138 R: count larger than the packet throws RangeError rather than allocating or looping; hostile packet guard
- 148 R: member-count reads name, flags, u32 count

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/channels/runtime.test.ts
- 28 F: expected opcode is CHANNEL_ADMIN_OPCODES.password from the code under test; assert GameOpcode.CMSG_CHANNEL_PASSWORD and the sent body
- 57 F: only the 32-char refusal; add a 31-char accept case so the MAX_CHANNEL_PASSWORD boundary is pinned
- 72 R: unjoined channel refuses not_member and sends no packet
- 83 R: empty and spaced names refuse bad_name with nothing sent
- 98 F: name promises every action but only moderator runs; make it a table over actions or rename to moderator
- 125 R: 2 s silence resolves ok with undefined notice (UNCONFIRMED path); a rejected timeout would leak to the agent
- 139 R: list sends CMSG_CHANNEL_LIST and resolves flags and members
- 170 R: display option switches opcode to DISPLAY_LIST
- 189 R: not_member notice resolves not_member for list
- 206 R: list for another channel is ignored and 3 s timeout resolves timeout; filter by channel
- 223 F: any thrown Error passes; assert the abort error (not a timeout or send failure)
- 239 R: count sends GET_CHANNEL_MEMBER_COUNT and resolves the count
- 256 R: count answers for a channel we are not joined to
- 270 R: not_member and silence both resolve undefined

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/channels/store.test.ts
- 24 R: empty initial snapshot with no invite (cheap baseline; no other test pins the initial shape)
- 31 R: you_joined adds a row with selfFlags 0, preserves join order
- 57 R: you_left removes the row
- 74 R: only self guid changes selfFlags; a guid comparison bug lets others rewrite our rank
- 100 R: owner_changed stores guid, channel_owner stores name
- 125 R: Nobody owner name clears to undefined
- 141 R: notices and has() match channel names case-insensitively
- 160 R: pending invite visible until 60 s boundary exactly
- 175 R: other notices emit channel_notice and leave the snapshot unchanged
- 200 R: list fills members and count for a joined channel, emits channel_members with the notice's channel casing
- 234 R: count updates memberCount, keeps members, emits members undefined
- 260 R: count for an unjoined channel emits without creating a row
- 275 R: a later list replaces members; an earlier members reference stays intact

#### Seams
- none

#### Defects
- none

## area-charters

### packages/core/src/wow/areas/charters/area.test.ts
- 39 R: showList emits CMSG_PETITION_SHOWLIST with the npc guid and settles ok on the reply; wrong opcode/guid hangs or misroutes
- 60 R: buy emits the full petition body and the item push settles ok with the new charter guid; wrong body or unsettled buy is user-visible
- 85 R: SMSG_BUY_FAILED reason 2 maps to refused not_enough_money; a wrong code mapping misreports to the agent
- 103 R: INVENTORY_CHANGE_FAILURE 50 maps to refused inventory_full; agent-parsed reason code
- 121 R: query sends the stored petition id from the seeded charter and settles on the response
- 147 R: query for a charter without petition id sends id 0 (boundary); a crash or garbage id would break the query
- 164 R: showSignatures sends the right opcode and settles on the roster with the item guid
- 189 R: rename sends item guid and name and settles on the MSG echo; a wrong opcode or unsettled act is caught
- 216 R: rename after a query updates the stored petition name; a stale name would mislead the agent
- 251 C packages/core/src/wow/areas/charters/store.test.ts:39: arena showlist storage is the same offers-per-npc branch; entry parse order lives in protocol.test.ts:37
- 273 R: buy against a non-petitioner refuses not_petitioner with zero packets sent; protects against buying from the wrong NPC
- 284 R: a second concurrent request throws (single-pending invariant) and the first is rejected on dispose
- 299 R: silence settles no_reply after CHARTERS_ANSWER_MS; timeout path

#### Seams
- packages/core/src/wow/areas/charters/runtime.ts `CHARTERS_ANSWER_MS`: exported constant imported by area.test.ts to drive the fake-timer test

#### Defects
- none

### packages/core/src/wow/areas/charters/protocol.test.ts
- 27 R: parses SMSG_PETITION_SHOWLIST guild entry fields (cost, required, displayId); a layout slip misreads the price
- 37 R: parses three arena entries with required signatures 2/3/5 and the entry ids; multi-entry layout
- 49 R: CMSG_PETITION_BUY body byte-for-byte per 3.3.5 layout with trailing index; a layout error is rejected by the server
- 66 R: CMSG_PETITION_QUERY layout id then item guid, no trailing bytes
- 74 R: parses a guild charter query response (kind, min/max signs, owner, name)
- 96 R: arena type 3 maps to kind arena with 2 signatures; type slot decoding
- 113 R: parses empty and two-signer rosters; count/owner/signer decoding
- 140 R: rename request layout and response parse; roundtrip uses the shared body builder, request half is reference layout
- 151 R: show-signatures and showlist requests are bare guids; area.test.ts only asserts the showlist guid, so this is the only signatures body check

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/charters/store.test.ts
- 39 R: showlist reply stores offers per npc and emits showlist event; the event drives harness rules
- 57 R: a showlist reply for another npc is ignored by the pending request until the matching one arrives; misrouting hazard
- 77 R: query response is stored by item guid with name and needed; the lookup keyed by petition id
- 105 R: query response for an unknown petition id stores nothing and does not settle pending; guards against stray packets
- 125 F: name promises signers update but the roster is empty and only status ok and no pendingOffer are asserted; use a signer and assert the petition's signers
- 148 R: signatures for an item not in the bags set pendingOffer with signers; offered-signature flow
- 169 R: guild command result for a taken name refuses the pending buy name_taken; agent-parsed reason
- 187 R: invalid-name command result refuses the pending rename name_invalid
- 207 R: an unrelated guild command result leaves the buy pending; negative asserts pending kind still buy
- 223 R: buying while in a guild refuses in_guild locally (no send); local guard

#### Seams
- none

#### Defects
- none

### packages/harness/src/areas/charters/area.test.ts
- 15 D: restates the declared worldActs constant in area.ts:91; no behaviour, no other keeper (registry.test.ts drives its own fixture modules)
- 25 F: cost 1000 and required 9 are computed from entries and rendered only into text (data has just entries count and npc), so they are contract values; keep them but tighten the bare toContain("9") (matches almost anything) to toContain("1000 copper") and toContain("9 signatures"); drop any whole-sentence pin; row class/domain/event assertions stay
- 54 R: a query event produces no rows (empty draft list); catches an accidental log spam that would wake the agent

#### Seams
- none

#### Defects
- none

## area-combatlog

### packages/core/src/wow/areas/combatlog/area-avoid.test.ts
- 28 R: SMSG_SPELLLOGMISS to entries per target with reason names, fight misses; a mis-indexed reason or lost target misreports the miss
- 69 R: reason beyond the table is named unknown_<n> (entries.ts:218); a crash/undefined outcome on new server reasons
- 86 R: IMMUNE/IMMUNE2 miss of own spell counts in misses and records one immunity by creature entry
- 115 R: SMSG_SPELLORDAMAGE_IMMUNE reads caster first and records immunity; swapped caster/target would invert it
- 142 R: immune against the character is kept but is no creature immunity; scope guard
- 158 R: SPELL_GO miss list with IMMUNE produces miss entry and immunity, ignoring the hit list
- 190 R: reflect trailing byte does not shift the next miss entry; wire-layout regression
- 215 R: stranger-vs-stranger SPELL_GO is dropped and counted
- 234 R: SPELL_GO with empty miss list adds nothing and drops nothing
- 250 R: damage shield owner->attacker as damage dealt; reversed direction misattributes totals
- 282 R: environmental damage keeps wire type incl. 0 and counts as taken with source 0n
- 327 C packages/core/src/wow/areas/combatlog/area-avoid.test.ts:340: another player's environmental damage dropped is also asserted there with dropped count
- 340 R: environmental scope does not widen after a character hit; dropped count 1
- 359 R: SPELLINSTAKILLLOG becomes an instakill entry from caster to target

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/combatlog/area-dispel.test.ts
- 30 R: SMSG_SPELLDISPELLOG gives one dispel entry per aura with aura in extra
- 43 R: SMSG_SPELLSTEALLOG routed to steal kind; mis-route would show dispels as steals
- 48 R: SMSG_DISPEL_FAILED reads full guids and gives one dispel_failed per failed aura

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/combatlog/area-execute.test.ts
- 10 R: SMSG_SPELLLOGEXECUTE to one execute entry per record tagged with effect, entry-only records to target 0n
- 65 R: truncated log keeps records read, counts dropped once and opens no fight
- 98 R: short-GUID player resurrection stored and not dropped; regression for the three-byte record

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/combatlog/area-heal.test.ts
- 23 R: SPELLHEALLOG effective amount (heal minus overheal) counted in fight healed
- 56 R: SPELLENERGIZELOG keeps mana power 0 on the entry
- 85 R: PERIODICAURALOG to periodic_damage/heal/power kinds and the heal's effective amount
- 126 R: periodic tick from empty caster is still logged
- 144 R: heal between two other units is dropped and emits no event

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/combatlog/area.test.ts
- 25 R: ATTACKERSTATEUPDATE gives one melee entry and one entry event
- 53 R: SPELLNONMELEEDAMAGELOG gives one spell_damage entry
- 83 R: entry events reach the world area bus as combatlog/entry
- 106 D: stub-list inventory; handling is proven by area.test.ts:25 and :53 injecting both opcodes
- 114 R: PARTYKILLLOG emits kill event, kill list and kill entry with bySelf as 1/true
- 151 R: kill by an unknown unit is bySelf 0 and killerKind unknown
- 166 R: kill list ring keeps the last 20
- 185 R: combo points with target emit the event and set state
- 202 R: 0 points with no target clears the combo state
- 220 D: dispatch.has/stub-list inventory of two opcodes; behaviour proven by area.test.ts:114 and :185
- 233 F: keeps the useful inject-adds-no-entry check but also pins dispatch.has/areaStubs inventory; drop those two lines

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/combatlog/entries-dispel.test.ts
- 11 R: dispelEntries maps caster to source, victim to target, aura to extra and steal kind; exact object incl. amount 0
- 45 R: dispelFailedEntries one per failed aura with outcome unset

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/combatlog/entries.test.ts
- 14 R: meleeEntry sums absorb parts and school masks; area tests never cover multi-part swings
- 46 R: meleeEntry outcome derived from miss flag and victim state (miss/parry)
- 71 R: spellDamageEntry keeps crit, overkill and resisted fields that area.test.ts:53 does not
- 103 R: healEntry effective amount and absorbed; area-heal.test.ts:23 omits absorbed
- 126 R: all-overheal heal keeps amount 0 and overheal; boundary of the subtraction
- 140 D: energize mana power 0 duplicated exactly at area-heal.test.ts:56 through the area
- 159 R: periodicEntries maps each tick family to its kind and fields, heal amount

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/combatlog/execute.test.ts
- 20 R: parseSpellExecute reads caster, spell and a create-item record from writer bytes
- 84 R: table of effect families (drain, burn, extra attacks, interrupt, durability, feed pet, guid-only) each reading its own record layout
- 96 R: target count above 1 reads that many records in wire order
- 121 R: effect outside the table keeps prior records and sets truncated
- 140 R: body cut inside a record keeps records before it
- 161 R: oversized record count is truncated, not read; avoids huge allocation/loop
- 179 R: final GUID-only effects 18/113 read three-byte packed player record
- 198 R: two short GUID-only records in one effect both read
- 218 R: oversized GUID-only count truncated as well
- 234 R: effect count zero yields no effects
- 246 R: cut before an effect header is truncated
- 259 R: executeEntries maps each record to an entry tagged with effect incl. power field
- 316 C packages/core/src/wow/areas/combatlog/area-execute.test.ts:65: an effect with empty records yielding no entries is shown there with the truncated effect

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/combatlog/protocol-avoid.test.ts
- 28 R: parseSpellMiss reads spell, caster, count and target reason per Object.cpp writer
- 45 R: multi-target packet read in wire order
- 64 R: zero targets give empty list
- 73 R: parseSpellImmune reads caster before target then spell
- 85 R: parseDamageShield field order per Unit.cpp
- 109 R: school field is a u32 mask; input beyond one byte catches a u8 read
- 126 R: parseEnvironmentalDamage reads victim, type, amount, resisted, absorbed
- 142 D: type is one plain field read with no branch; keeper protocol-avoid.test.ts:126 and area-avoid.test.ts:282
- 155 R: parseInstakill reads caster, target, spell
- 163 D: same read as protocol-avoid.test.ts:155 with equal guids; no new branch; keeper protocol-avoid.test.ts:155

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/combatlog/protocol-dispel.test.ts
- 16 R: parseDispelLog reads victim, caster, spell, per-aura id and flag
- 38 R: count zero yields no auras
- 55 R: parseDispelFailed reads full guids, spell, failed list to end of body
- 74 R: body with no failed aura yields empty list

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/combatlog/protocol-heal.test.ts
- 23 R: parseSpellHeal reads victim before caster then heal, overheal, absorb, crit
- 48 R: non-crit reads false; catches an always-true crit read
- 64 R: parseSpellEnergize field order incl. power type
- 89 R: damage aura types 3 and 89 read a u32 school mask
- 128 R: heal aura types 8 and 20 read amount, overheal, absorb, crit
- 152 R: power aura types 21 and 24 read power then amount
- 169 R: mana leech 64 consumes and drops the multiplier, remaining 0
- 182 R: unknown aura type throws; error path for undecodable body
- 190 R: empty caster guid reads as 0

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/combatlog/protocol.test.ts
- 27 R: plain hit reads one part, no optional fields, consumes body
- 56 R: hand-written wire bytes of a crit parse as the writer produced them
- 74 R: partial absorb reads one absorb per part
- 89 R: two-part swing with absorb and resist reads two of each
- 115 R: HITINFO_BLOCK reads blocked amount
- 130 R: HITINFO_RAGE_GAIN reads one extra word, UNK19 none
- 154 R: HITINFO_UNK1 debug block read and dropped
- 167 R: dodge victim state and derived flags
- 188 R: short attacker-state body throws
- 200 R: parseSpellDamage school mask, hit-type flags, debug byte, full consumption
- 235 R: plain spell hit is no crit and no split; catches flags always set
- 251 R: short spell damage body throws
- 263 R: SPELL_MISS_NAMES order against SharedDefines enum; only test of unused entries deflect/absorb/block
- 281 R: parsePartyKill two full guids with hand bytes
- 292 R: parsePartyKill live server body from a mage kill
- 302 D: another live kill body, same branch as protocol.test.ts:292; keeper protocol.test.ts:292
- 312 R: short PARTYKILLLOG body throws
- 319 R: parseComboPoints packed target and points
- 327 R: one-byte empty packed guid gives no target
- 339 R: parsePowerUpdate packed guid, power index and value from hand bytes
- 347 D: asserts the test-support builder against the layout of protocol.test.ts:339; keeper protocol.test.ts:339
- 358 R: live power update bodies with differing packed-guid widths

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/combatlog/runtime.test.ts
- 39 R: fight closes 6 s after the character's last entry and not before; closes once
- 60 R: entries between other units do not move the close time
- 75 R: second fight closes on its own
- 94 R: ending the session cancels the wait; no close after dispose
- 106 R: dispel on the character is kept but does not postpone the close

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/combatlog/store-dispel.test.ts
- 35 R: utility kinds dispel, dispel_failed, steal, execute open no fight but are kept and emitted
- 48 R: dispel in an open fight leaves totals and lastAt unchanged

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/combatlog/store-execute.test.ts
- 9 D: name promises the timer advances but asserts only fight undefined; keeper store-dispel.test.ts:35 (execute kind) and area-execute.test.ts:65

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/combatlog/store-power.test.ts
- 58 R: applyPower writes raw field and typed slot in one update, no log entry
- 72 R: second power keeps other slots
- 83 R: unknown guid and out-of-range power change nothing

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/combatlog/store.test.ts
- 84 R: scope keeps character, pet and guardian entries and drops strangers
- 101 R: another unit's entry against a unit in the current fight is kept
- 108 R: a unit that attacked the character is in scope
- 115 R: ring keeps last 500 entries
- 124 R: miss with no damage is one entry and one event
- 150 R: crit boolean in state, plain number in the event
- 169 R: fight opens on character entry and closes after 6 s of quiet, boundary 5999/6000
- 189 R: stranger's entry does not keep the fight open
- 201 R: closed fight forgets its units
- 209 R: closeFight ends a quiet fight once and emits totals
- 234 R: entry after the quiet gap closes the old fight before it counts
- 248 R: totals sum dealt, taken, misses by outcome and crits
- 280 R: caster that never swung is marked an attacker once
- 295 R: periodic tick with empty caster marks nobody
- 304 R: damage the character deals marks nobody
- 318 R: killer kind from the entity store
- 335 R: kill of the character's target by another player is ourTarget and not bySelf
- 364 R: kill neither counts in the fight nor needs scope
- 373 R: dispose forgets kills and combo points
- 383 R: 0 points on a target clears combo points
- 401 R: refused creature entry and spell recorded once
- 412 R: melee immunity, player target and other source record nothing
- 423 D: miss with immune outcome to immunity is the branch of area-avoid.test.ts:158 through the area

#### Seams
- none

#### Defects
- none

### packages/harness/src/areas/combatlog/area-avoid.test.ts
- 35 F: wake row text carries computed type name and amount; replace the full-sentence pin with toContain("fall") and toContain("120"); keep class wake/event
- 46 R: environmental row is class log inside a run
- 55 R: each wire type 0-5 maps to its name in both text (toContain(name)) and data.type; a label-table shift misreports the damage to the agent
- 63 F: unknown type label unknown_9 is a computed text value; assert row.text toContain("unknown_9") (not only "120"), keep data type
- 69 R: damage to another unit writes nothing

#### Seams
- none

#### Defects
- none

### packages/harness/src/areas/combatlog/area-dispel.test.ts
- 38 F: keep text toContain("Defias Mage") (looked-up caster name) and data aura/kind/spellId; drop the "dispels" verb and echoed "168" prose assertions
- 52 F: data.kind steal tells the branch; drop the "steals" prose assertion, keep data.kind and the row
- 58 R: each aura event writes its own row; no dedupe by spell
- 64 R: own dispel, dispel on someone else, empty caster, failed dispel and execute write no row

#### Seams
- none

#### Defects
- none

### packages/harness/src/areas/combatlog/area-heal.test.ts
- 41 F: keep class passive/event heal_in; assert text toContain("Mate") (looked-up healer name) and data.amount 540; drop the exact sentence
- 53 R: 10 s per-healer suppression boundary 10999/11000
- 62 R: suppressed heal does not extend the window
- 71 R: each healer has its own window
- 79 R: periodic heal shares the heal window
- 89 R: self heals, empty casters, zero heals and heals on others write nothing
- 100 R: zero-amount heal does not start the window
- 106 F: unnamed-healer fallback is a rendered value; assert text toContain("A unit") (today it asserts only the echoed "heals you for 540" prose) and the row exists

#### Seams
- none

#### Defects
- none

### packages/harness/src/areas/combatlog/area.test.ts
- 89 D: plain melee entry writes no row; also silent inside packages/harness/src/areas/combatlog/area.test.ts:224
- 95 R: damage, heal, kill-by-self, pet and non-player kills write no row
- 113 F: immune row once per creature entry and spell; keep text toContain(`Mottled Boar u${BOAR}`) (looked-up name+ref) and data entry/spellId; drop "is immune to spell 122."
- 133 F: immune miss and swing each write once; keep data spellId (5143 vs 0 tells the branch) and toContain(`Mottled Boar u${BOAR}`); drop both "immune to ..." sentences
- 159 R: pet immunity does not consume the character's own row
- 171 F: keep class/data/guid/ref and text toContain(`Mate u${MATE}`) and toContain(`Mottled Boar u${BOAR}`) (looked-up names+refs); drop the "killed your target" sentence from the toEqual
- 192 F: keep data (durationMs from lastAt-startedAt, totals) in the row; drop the "Fight over:" sentence from the toEqual; text values are asserted in totals.test.ts:99/:110/:116
- 211 D: groupmate kill row via the router; same row as :171 and :224; keeper area.test.ts:224
- 224 R: router turns area events from the handle into immune, killing_blow and fight rows, dedupes immunity

#### Seams
- none

#### Defects
- none

### packages/harness/src/areas/combatlog/totals.test.ts
- 38 R: noteEntry sums dealt, taken, healed for the character and pet since the start
- 59 R: avoided counts our misses and target avoidance, not our own dodges
- 78 R: immune lists each refused spell once in order with the count
- 99 F: fightText renders computed counts; replace toBe sentence with toContain("dealt 312"), "took 145", "1 dodge", "1 resist"; drop "Fight over:" wording
- 110 F: no brackets without misses and healing appended when present are branches; assert toContain("healed 15") and no "(" / "healed" otherwise; drop full-sentence toBe
- 116 F: plural forms are computed labels; assert toContain("2 dodges") and toContain("3 misses"); drop full-sentence toBe and "Fight over:" wording

#### Seams
- none

#### Defects
- none

## area-complaints

### packages/core/src/wow/areas/complaints/area.test.ts
- 8 R: SMSG_COMPLAIN_RESULT routes through area wiring to complaint_received for 1- and 2-byte bodies; broken registration drops the event
- 24 R: truncated reply throws RangeError and emits nothing; error path

### packages/core/src/wow/areas/complaints/protocol.test.ts
- 16 R: CMSG_COMPLAIN chat layout (type, u64 guid, four u32, description, no trailing byte); packet contract
- 38 R: guid is a plain u64 not packed; a packed-guid regression shifts every following field
- 52 R: mail form layout (type 0, mail id second, no trailing data); packet contract
- 68 R: parses the single code byte AzerothCore writes
- 74 R: two-byte wire variant reads first byte only; a parser consuming both would misreport

### packages/core/src/wow/areas/complaints/runtime.test.ts
- 21 R: sends CMSG_COMPLAIN with the right body, resolves true on reply, leaves no timer
- 46 R: mail variant selects the mail form through the action boundary
- 65 R: 3 s timeout resolves false, not earlier, and clears timer
- 86 R: abort rejects with AbortError and frees the timer; recovery path
- 111 R: stale reply is not remembered; a latched reply would falsely resolve the next complaint

### packages/core/src/wow/areas/complaints/store.test.ts
- 6 C packages/core/src/wow/areas/complaints/area.test.ts:8: same received->complaint_received emission, asserted through the real wiring there
- 18 R: unsubscribe and dispose stop delivery; leaking listeners would fire stale handlers

#### Seams
- none

#### Defects
- none

## area-contacts

### packages/core/src/wow/areas/contacts/area.test.ts
- 24 F: keeps the SMSG_CONTACT_LIST wiring contract but passes a dead `register` no-op plus `void stores`; drop that option, use the default area rig
- 45 R: unknown-guid whisper reaches the store as ignored_whisper and sends no CMSG_CHAT_IGNORED; a wrong ignore check would misreport

### packages/core/src/wow/areas/contacts/protocol.test.ts
- 15 F: only a build->parse roundtrip; assert the reference bytes `[1,0,0,0]` (Socialhandler.cpp:30-35) so a symmetric bug fails
- 23 R: guid-before-note layout against reference bytes; a swapped field order breaks the note write
- 32 R: guid then zero byte, exact bytes per ChatHandler.cpp; a missing trailing byte is a protocol error
- 38 R: truncated bodies must throw; a lenient reader would silently emit garbage guids

### packages/core/src/wow/areas/contacts/runtime.test.ts
- 43 R: requestContacts sends exact CMSG_CONTACT_LIST bytes and resolves on the reply; catches a lost send or an unresolved promise
- 80 R: 3 s timeout rejection with fake timers; a missing timeout hangs the agent
- 97 R: setFriendNote writes the guid, sends one note packet and one refresh, and the store updates; catches a missing refresh
- 150 R: a name outside the friend list returns not_friend and sends nothing; agent-facing refusal reason
- 163 R: one CMSG_CHAT_IGNORED per ignored guid despite repeat whispers, none for others; catches spam or a missed reply
- 200 R: whisper with guid 0 sends nothing even though an ignore list exists; catches a zero-guid match
- 230 R: dispose rejects a pending request with AbortError; a leak leaves the caller hanging

### packages/core/src/wow/areas/contacts/store.test.ts
- 14 R: initial snapshot shape (lastMask undefined, empty arrays) consumers read; cheap, uncertain so retain
- 22 R: records mask and only non-empty notes and emits contact_list; catches storing empty notes
- 39 R: 48-byte UTF-8 truncation at multibyte boundaries; catches split characters or a byte/char mixup
- 46 R: setNote truncates before storing and emits note_set with the stored value
- 56 R: markReported dedup once per guid and the reported snapshot; backs the one-reply-per-guid rule
- 63 C packages/core/src/wow/areas/contacts/area.test.ts:45: ignored_whisper emission is asserted there through the real dispatch path

#### Seams
- none

#### Defects
- none

## area-emotes

### packages/core/src/wow/areas/emotes/area.test.ts
- 56 R: SMSG_EMOTE routed through the area to an emote event; a dropped handler loses animations
- 71 R: SMSG_TEXT_EMOTE wiring sets self from selfGuid and empty name to undefined target
- 115 R: entity update with dance state reaches the snapshot through the entity bus wiring

### packages/core/src/wow/areas/emotes/names.test.ts
- 9 F: ids 34/78/101/126 are protocol values; drop the copied `size` 252 inventory assertions
- 18 R: closestEmotes ranks a misspelling first, returns N, normalises case/whitespace; feeds unknown_emote

### packages/core/src/wow/areas/emotes/protocol.test.ts
- 20 R: SMSG_EMOTE field order and full consumption of the body
- 28 R: SMSG_EMOTE parsed from reference AzerothCore bytes
- 38 R: SMSG_TEXT_EMOTE with no target parses an empty name and consumes the body
- 56 R: target name length excludes the null terminator; a layout slip corrupts the name
- 74 R: documents the one-letter name loss from the wire length-without-null rule; pins the quirk
- 94 R: CMSG_EMOTE body layout
- 98 R: CMSG_TEXT_EMOTE body against the wow_messages reference bytes
- 104 R: target guid written as full 8 bytes little-endian

### packages/core/src/wow/areas/emotes/runtime-cancel.test.ts
- 37 R: queued abort settles immediately, earlier emotes keep spam gaps, no timers leak

### packages/core/src/wow/areas/emotes/runtime.test.ts
- 63 R: NPC_EMOTESTATE read on appear/update, cleared on zero, ignored on unrelated changes
- 95 R: disappear drops the unit's emote state
- 109 R: game objects at the same field offset are not read as emote state
- 122 R: entity event without an entity is ignored; guards a crash on malformed events
- 164 R: emote only permits wave ids (0,3) and sends CMSG_EMOTE; refusal reason only_wave
- 179 R: name resolution plus CMSG_TEXT_EMOTE body with target guid through the act
- 198 F: refused branch only asserts ok false; assert reason unknown_emote (a code, not prose); no sentence is pinned, nothing to drop
- 213 R: unknown_emote reply lists five closest, nothing sent
- 228 R: ready (126) refused as ready_check, nothing sent
- 245 R: spam guard ordering across three queued emotes
- 272 R: no wait once the guard has elapsed
- 286 R: dead, ghost and unknown-entity characters get reason dead from both acts
- 302 R: death during the spam wait cancels the queued emote with dead
- 320 R: dispose during wait resolves cancelled without sending
- 332 R: dispose cancels every queued emote and leaves no timer
- 349 R: caller abort in the head wait cancels without sending and clears timers
- 372 C packages/core/src/wow/areas/emotes/runtime-cancel.test.ts:37: same abort-behind-earlier scenario, with stronger asserts there
- 398 R: an already-aborted signal sends nothing
- 413 D: repeats the textEmote ok outcome with id 34 already asserted; keeper runtime.test.ts:179
- 432 R: late timer pushes next send a full gap after the actual send
- 461 R: dispose after timer fired but before send cancels the emote

### packages/core/src/wow/areas/emotes/store.test.ts
- 29 D: empty initial snapshot is asserted again after clears; keeper store.test.ts:73
- 33 C packages/core/src/wow/areas/emotes/area.test.ts:56: emote event shape asserted there through the real packet path
- 39 C packages/core/src/wow/areas/emotes/area.test.ts:71: self/target mapping asserted there with the same values
- 73 R: zero/undefined remove emote states, non-zero held, no events emitted
- 88 C packages/core/src/wow/areas/emotes/runtime.test.ts:95: forget via the real disappear event
- 115 R: life() derives alive/dead/ghost/unknown from self entity fields

### packages/harness/src/areas/emotes/area.test.ts
- 20 R: self text emote becomes emotes/sent log row with emote and target
- 31 R: missing target stays undefined in the log row
- 42 R: others' text emotes and plain emotes write no rows

#### Seams
- none

#### Defects
- none

## area-framework

### packages/core/src/wow/areas/compose.test.ts
- 95 R: dispatch routing and peek-after-owner ordering; a wrong order runs peek before state is updated
- 111 R: peek attaches to a pre-registered legacy handler; losing it drops peeks on legacy opcodes
- 123 R: peek without owner throws at startup; silent no-op would lose peeked packets
- 130 R: double ownership of one opcode throws; a silent override would drop an area's handler
- 142 R: building modules sends nothing and arms no timers; a timer at build leaks per session
- 168 R: runtime sees event before forwarder publishes; reversed order gives subscribers stale state
- 184 R: per-area handle event isolation; cross-delivery would feed wrong events to agent tools
- 196 R: throwing listener lands in packetError; a crash would break packet dispatch
- 212 R: ctx.listen subscription and unsubscribe on dispose; a leak keeps hearing after teardown
- 240 R: until resolves on first matching event and clears timer; leaked timer holds the process
- 254 R: until timeout rejection clears timer
- 267 R: own signal abort rejects with AbortError and clears timer
- 281 R: lifetime dispose aborts pending waits; hung acts after logout
- 296 R: handle.state returns the store snapshot for each area
- 303 R: handle.act is the runtime's acts and a ping act really sends CMSG_QUERY_TIME
- 312 R: runtime-less module gets empty acts; undefined act table would crash handle building

### packages/core/src/wow/areas/registry.test.ts
- 294 R: area dirs, registry keys and module names agree and names are free; a missing registration drops an area
- 304 R: opcode ownership partition over real opcodes; double or unknown ownership breaks dispatch
- 308 R: each area registers only owned/used opcodes; stray handler would steal packets
- 312 R: named opcodes in area sources are owned or used; catches undeclared sends or reads (source scan, but a boundary guard)
- 321 R: area import allow-list keeps areas decoupled from the handle/stores; source scan but architectural guard
- 330 F: pinned FROZEN_STUBS copied inventory plus toHaveLength(57); keep the lost-stub check, drop the count pin
- 346 R: event types are lower-case words; the agent parses these keys
- 352 R: guard checks accept valid fixture modules; a false positive would block all areas
- 361 R: name checks reject reserved/malformed names; exact messages pin the reasons
- 372 R: ownership checks flag shared, unknown, unowned, late opcodes each with a distinct message
- 393 R: registration check flags on/peek outside the declaration
- 401 R: named-opcode check flags undeclared use; negative proves detection works
- 407 R: import check flags value imports, banned names, non-alias paths and movement sends
- 430 R: event-type check rejects non-lower-case word

### packages/harness/src/areas/registry.test.ts
- 45 R: every harness module names a core area, not a core log domain, and each worldAct is a real act on the game; a typo breaks the tool
- 51 D: tests registryProblems, a helper defined in this test file with fixtures; no production code; real check is registry.test.ts:45
- 64 D: compile-time conditional type over a local fixture, and HARNESS_AREAS_TOTAL is a declared constant; typecheck of registry.ts is the proof; keeper registry.test.ts:45

### packages/harness/src/areas/rules.test.ts
- 45 R: unruled event becomes one fallback row with stringified guid, scalar-only data; shape agents/log read
- 78 R: area event rule replaces the fallback; a duplicate row would double log entries
- 97 R: rule returning no drafts writes no row; flood suppression
- 104 R: non-snake_case draft name throws; guards the log event namespace
- 112 R: attach rules read per-area state from the handle and skip areas without rules

### packages/harness/src/areas/world.test.ts
- 33 R: state is a frozen deep copy; a leak lets tool code mutate core stores
- 45 R: onEvent forwards frozen events, registers stop with hold, off is idempotent; leak keeps listeners after run end
- 66 R: only listed worldActs exposed and each goes through guard; an unlisted act would bypass guard
- 87 R: guard refusal stops the act before the handle; a bypass lets non-master actions through
- 98 R: no live handle refuses with "offline"; error path

#### Seams
- packages/core/src/wow/areas/typecheck-fixture.ts `FIXTURE_MODULES`: used by compose.test.ts and registry.test.ts (not production)
- packages/core/src/wow/areas/registry.ts check helpers (`nameProblems`, `ownershipProblems`, `registrationProblems`, `namedProblems`, `importProblems`, `eventTypeProblems`) are consumed only by tests [INFERENCE, not verified]
- packages/harness/src/areas/registry.ts `HARNESS_AREAS_TOTAL`: only registry.test.ts:64 reads it [INFERENCE, not verified]

#### Defects
- none

## area-guildadmin

### packages/core/src/wow/areas/guildadmin/area.test.ts
- 19 R: SMSG_GUILD_INFO wiring sets state.info and emits info once; a dropped handler or missing emit breaks the agent's info view
- 37 R: only GE code 8 disbands; code 3 must not set state or emit; a wrong code compare would fire false disband wakes
- 53 R: duplicate GE_DISBANDED must not re-emit; a missing guard double-wakes the agent
- 66 R: act.info sends empty-body CMSG_GUILD_INFO and resolves with the parsed reply; also the real boundary for the empty-body contract
- 85 R: act.info times out as no_reply after 5 s; a hang on silent server
- 99 R: disband without confirm is refused and sends nothing; guards an irreversible action
- 111 R: disband with confirm sends empty-body CMSG_GUILD_DISBAND and resolves disbanded on GE_DISBANDED
- 126 R: non-leader disband gets no server reply and settles no_reply after 5 s
- 140 R: dispose rejects a pending info; a leaked promise would hang the run

### packages/core/src/wow/areas/guildadmin/protocol.test.ts
- 14 R: parseGuildInfo decodes name, packed time and counts from the guild-info layout; a field-order slip misreports
- 32 F: expected bytes come from the same PacketWriter.cString the builder uses; assert literal bytes (0x46 0x61 0x63 0x00)
- 38 D: asserts length of an empty PacketWriter, never touches the CMSG builders; real proof core area.test.ts:66 and core area.test.ts:111

#### Seams
- none

#### Defects
- protocol.test.ts:38 name claims CMSG_GUILD_INFO/DISBAND bodies are checked but exercises neither; the area tests carry the real assertion

### packages/harness/src/areas/guildadmin/area.test.ts
- 38 F: whole-draft toEqual pins fixed prose "The guild is disbanded."; no computed value in it. Keep class/domain/event/data, drop text (ruling A: wording)
- 52 R: info event writes no wake row; a rule emitting rows on info would spam the agent
- 58 R: attach on an existing guild state writes no drafts; a startup-replay rule would wrongly fire
- 65 D: restates the declared worldActs constant (expected value is the source literal); no behaviour; act calls proven by core area.test.ts:66 and core area.test.ts:111

#### Seams
- none

#### Defects
- none

## area-inspect

### packages/core/src/wow/areas/inspect/area.test.ts
- 13 D: asserts only state() is {} (a constant) after both injects; emitted count never checked; wiring proven by runtime.test.ts:31 and :74

### packages/core/src/wow/areas/inspect/protocol.test.ts
- 28 R: CMSG_INSPECT is a raw u64 per MiscHandler.cpp; a packed guid would misaddress the target
- 33 R: CMSG_QUERY_INSPECT_ACHIEVEMENTS packed guid layout per AzerothCore
- 38 R: parses free points, spec and per-spec glyphs from reference layout; offset errors misread talents
- 75 R: multi-spec glyph separation, active flag and rank sums skipping wire offset; catches spec mixups
- 94 R: short form parses to three zeros (TalentsInspecting off); misparse would invent specs
- 109 C packages/core/src/wow/areas/inspect/protocol.test.ts:94: same short body, gear [] already asserted by the toEqual there
- 119 R: gear item fields (entry, enchant, random property, suffix, creator) decode from slot mask
- 146 R: achievements reply reuses all-data body; guid, done and criteria counter parse
- 160 R: truncated body throws instead of yielding garbage (error path)

### packages/core/src/wow/areas/inspect/runtime.test.ts
- 31 R: inspect sends CMSG_INSPECT and resolves with the matching SMSG reply; breakage hangs the agent tool
- 46 R: reply for another guid is ignored, guid filter; a missing filter resolves wrong player
- 58 R: 3 s timeout resolves undefined, boundary 2999 vs 3000 with a non-matching reply
- 74 R: inspectAchievements sends the right opcode and resolves with parsed done list
- 94 R: achievements silent-server timeout resolves undefined; separate waiter from talents path

### packages/core/src/wow/areas/inspect/store.test.ts
- 15 D: asserts snapshot() of a stateless store is {}, a declared constant; keeper store.test.ts:19
- 19 F: asserts only event type and state {}; assert seen[0].reply carries the parsed guid/gear, drop the state check
- 36 R: dispose clears listeners; a leak would emit to stale subscribers after teardown

#### Seams
- none (InspectStore.receiveTalents is public and used by area wiring)

#### Defects
- none

## area-instances

### packages/core/src/wow/areas/instances/protocol.test.ts
- 41 R: MSG_SET_*_DIFFICULTY server form against AzerothCore layout; a mis-skipped u32 shifts difficulty
- 54 R: SMSG_INSTANCE_DIFFICULTY difficulty+dynamic flag against Player.cpp
- 65 R: ownership/last-instance u32 layout
- 81 R: kind 4 tail (locked, extended) where wowm is wrong; reference-byte contract
- 103 R: kinds 1-3,5 must not read a tail; over-read would throw or misparse
- 125 R: RAID_GROUP_ONLY raw numbers and code 0 accepted
- 136 R: empty RAID_INSTANCE_INFO list parses
- 142 R: two-lock layout, fifth field locked
- 182 R: lock warning timeout/mask/trailing byte
- 193 R: empty CMSG body against GroupHandler
- 197 R: one-byte lock response encoding
- 202 R: extend packet layout (u32,u32,u8) against CalendarHandler
- 213 R: SMSG_INSTANCE_RESET u32 map
- 219 R: reset-failed reason-then-map order
- 225 R: reset-failed-notify u32 map
- 231 R: all eight encounter frames incl. 4-byte Halion refresh
- 270 R: client difficulty bodies one u32 each
- 275 R: CMSG_RESET_INSTANCES empty body

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/instances/runtime-requests.test.ts
- 53 R: out_of_range refusal sends nothing
- 67 R: unchanged refusal incl. pending solo change
- 93 R: member non-leader refuses not_leader
- 109 R: send then ok on echo with new value
- 130 R: raid request uses raid opcode and only raid echo
- 154 R: stale echo refuses server_refused even when store already holds value
- 176 R: solo no-echo unconfirmed_solo, change held until next body; timeout path
- 198 R: leader no echo settles no_answer and holds nothing
- 212 R: second act refuses busy
- 235 R: dispose rejects pending and clears timer
- 248 R: failed send rejects, no leaked timer or pending state
- 264 R: reset refuses not_leader and sends nothing
- 277 R: solo heroic dungeon refuses heroic_no_reset
- 294 R: pending unconfirmed heroic also refuses reset
- 317 R: pending-slot interaction between dungeon and raid unconfirmed changes
- 350 R: normal-pending over known heroic still sends (negative of 294's rule)
- 371 R: heroic group leader still sends
- 389 R: reset collection window and ok result with maps
- 434 R: blocked notice alone counts as failed
- 451 R: nothing_to_reset after 2 s and act freed
- 467 R: dispose rejects collecting reset, no timer
- 480 R: failed send rejects without leaked timer on the reset act

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/instances/runtime.test.ts
- 41 R: new_world clears per-map state
- 55 R: login_verified clears, transfer_pending does not
- 67 R: dispose releases the self subscription (leak guard)
- 107 R: request raid info sends one packet and settles with locks
- 134 R: empty reply is ok with no locks
- 148 R: 5 s silence no_answer and act freed
- 174 R: second act refuses busy, sends nothing
- 198 R: dispose rejects pending with abort reason
- 204 R: failed send leaves no waiter or timer
- 219 R: no_bind_offer refusal sends nothing
- 233 R: expired offer refuses
- 249 R: accept sends response and settles on SAVE_CREATED
- 271 R: accept times out no_answer
- 285 R: decline sends 0 and settles on map change
- 304 R: decline timeout releases act
- 324 R: dispose rejects pending decline
- 345 R: no_matching_lock table over the refusal branches (CalendarHandler)
- 369 R: extend sends, re-requests lockouts, ok when flag changed
- 391 R: unchanged when fresh list keeps old flag
- 406 R: no_answer when lockouts never return

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/instances/store-encounter.test.ts
- 17 R: engage/update/disengage lifecycle and events
- 47 R: re-engage keeps one row
- 65 R: priority update for untracked unit does not engage
- 79 R: non-unit frames keep units, map change drops them

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/instances/store-reset.test.ts
- 20 R: reset event with map from SMSG_INSTANCE_RESET
- 30 R: reset_failed event carries reason and map
- 43 R: reset_blocked event carries map
- 58 R: any difficulty body clears the matching pending change only

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/instances/store.test.ts
- 52 R: initial state shape (locks/binds undefined vs empty distinction downstream)
- 74 R: dungeon difficulty set once, repeat emits nothing
- 108 R: raid difficulty and name
- 134 R: instance difficulty bound to current map
- 158 R: ownership then last-instance maps, new ownership resets
- 201 R: raid instance message warning event
- 228 R: homebind timer on rig clock, (0,0) cancels
- 255 R: corpse_elsewhere on empty body
- 265 R: mapChanged clears per-map state but keeps difficulties
- 294 D: restates stubs-gone and opcode inventory; registry.test.ts:332 owns stub coverage and store.test.ts:74 proves dispatch
- 319 R: raid info sets locks with arrival time and added/removed diff
- 359 R: empty reply is known (empty list, not undefined)
- 386 R: lock warning sets pendingBind with deadline and emits bind_offer
- 412 R: SAVE_CREATED clears bind and emits bound
- 430 R: pending bind reads absent at deadline
- 447 R: mapChanged clears bind, keeps locks

#### Seams
- none (areaStubs is used by production client-handlers and registry tests)

#### Defects
- none

### packages/harness/src/areas/instances/area.test.ts
- 25 R: sole proof the difficulty name (event name, absent from data) reaches the row text; keep toContain("heroic"); data has no name
- 45 R: login difficulty silent, later change logs
- 63 F: keep class/data; replace toContain("533") (echoed, data asserts mapId) with span values per kind: 7200→"2 h", 600→"10 min", 240→"4 min", 86400→"1 d"
- 83 R: already asserts the computed value (60000 ms → "60 s"); keep it; cancelled branch is class/state
- 109 R: corpse_elsewhere wake row
- 115 F: keep class/data/progress; drop toContain("36") (echoed mapId, data asserts it)
- 127 F: keep wake class/data; drop "36"; assert the label mapped per code (0 inside, 1 offline, 2 zoning) not just 3 distinct texts
- 142 F: keep wake and data; drop toContain("36") (echoed mapId, data asserts it)
- 153 F: keep wake, data and toContain("60 s") (seconds from timeoutMs); drop "bind" call-hint prose
- 170 R: bound is passive row
- 176 F: keep added/removed data and quiet-when-unchanged; drop toContain("533") (echoed, data asserts it)
- 203 R: saved_maps stays silent
- 209 R: encounter stays silent

#### Seams
- none

#### Defects
- none

### packages/harness/src/areas/instances/tool-lfg-verbs.test.ts
- 14 F: keep leave call and DONE; drop toContain("left") prose (constant sentence, DONE proves branch)
- 25 F: keep answerProposal(true), DONE and the "accepted" label (only text tells accept from decline); add accept:false → "declined"
- 36 R: no_proposal refusal code passes through as REFUSED
- 45 R: roles bit 2 → "tank" is a name mapped from a code and only the text shows it; keep toContain("tank")
- 59 R: bit 4 → "healer" is a role name mapped from a code, only text shows it; distinct from the tank case at :45
- 71 R: keep teleport(true, undefined) and DONE; "out of" is the in/out branch label (both DONE), keep it
- 82 F: keep dead REFUSED and no teleport call; drop toContain("ghost") prose (reason dead proves branch)
- 92 F: keep voteKick(true) and DONE; toContain("kick") is in both branches; assert "to kick" and add accept:false → "against"
- 106 R: tool must not auto-answer bind or kick vote on events
- 136 R: join not_leader refusal surfaces as REFUSED
- 149 D: same expectSendKind(dungeonTool, bind) and kind check as tool.test.ts:164

#### Seams
- none

#### Defects
- none

### packages/harness/src/areas/instances/tool-lfg.test.ts
- 12 F: keep join entries/roles and DONE; drop toContain("queued"); assert "random dungeon" (entry-type label) and role name "damage"
- 33 R: empty dungeon list triggers requestDungeons once before join
- 69 F: keep role bits 6 and reason deserter REFUSED; drop detail toContain("deserter") (echoed reason, code proves it)
- 87 R: no_random_dungeon refusal, no join
- 118 R: already_queued refusal, no join
- 132 R: queue by id uses named entry and role bit
- 157 R: asserts role name "damage" in the role_answered row text, mapped from bit 8; only the text shows it; keep
- 185 F: keep answerProposal(true) and one proposal_answered row; drop toContain("accepted") prose; data.accepted true covers it
- 216 C packages/harness/src/areas/instances/tool-lfg.test.ts:157: both auto answers already proven separately; no ordering assertion added
- 260 R: already-open role check answered at join
- 282 R: auto false answers nothing
- 315 R: answering role check cancels the no-answer leave timer
- 346 F: keep leave called once and one role_unanswered row; drop toContain("left the queue") prose (constant, row name proves branch)

#### Seams
- none

#### Defects
- none

### packages/harness/src/areas/instances/tool-reset.test.ts
- 8 D: reason reset_failed asserted at tool.test.ts:396; rest pins constant next-call prose (travel, hearth), no computed value

#### Seams
- none

#### Defects
- none

### packages/harness/src/areas/instances/tool.test.ts
- 150 R: minimalArgs must validate against the tool schema
- 164 R: action kind and send-kind contract (keeper for lfg-verbs:149)
- 171 R: status renders difficulty, saves with time left and queue without asking; fresh-list branch
- 189 R: elapsed time subtracted from save time
- 200 R: expired save hidden
- 212 R: stale list asks once
- 223 R: no list asks and reports silent server
- 236 R: difficulty wire mapping table (only 4 forms hit distinct values; 10-normal/25-normal alias rows are cheap)
- 263 F: sole proof of the difficulty name looked up from the wire number (table at :236 asserts wire only); keep toContain("heroic"), add raid names
- 276 F: keep UNCONFIRMED unconfirmed_solo and toContain("heroic") (name from wire); drop toContain("next dungeon entry") prose
- 294 R: refusal reasons pass through as REFUSED
- 313 R: no_answer is UNCONFIRMED
- 329 R: bad_value/missing_args refused before any send
- 347 R: unknown_verb refusal sends nothing, lists verbs the agent can use
- 373 R: per-map lines in reset result
- 385 R: PARTLY status on mixed result
- 396 R: all-failed reset is REFUSED reset_failed
- 408 R: nothing_to_reset is DONE with reason
- 420 R: heroic_no_reset and not_leader reasons surface
- 437 R: bind default accept and explicit decline
- 450 R: no_bind_offer refusal
- 462 R: extend passes the held lock's difficulty and flag
- 484 R: ambiguous and no_matching_lock refusals, value disambiguates
- 521 R: missing_args refusal for extend

#### Seams
- none

#### Defects
- none

## area-items-1

### packages/core/src/wow/areas/items/moves.test.ts
- 39 R: equip settle rule over equipment/bag slots incl. equipped bag; a wrong predicate reports a move done or stuck
- 52 R: equip_slot settles only in the named slot; wrong slot must stay pending
- 62 R: unequip settles in any carried slot or the named bag; wrong bag must stay pending
- 84 R: named-bag unequip stays unsettled until the item is in that bag (slot-in-bag branch)
- 99 R: swap settles on destination or on merge into the target stack; merge branch is distinct
- 120 R: split needs source decrement plus destination entry; both partial states asserted false
- 139 R: ammo settles on loaded id equals entry, entry 0 unload branch (PlayerStorage.cpp)
- 152 R: wrap settles on wrapped flag of the same guid despite entry change; entry-only change asserted unsettled
- 167 R: wrap claim names either guid in the failure packet; non-wrap kind keeps item1 only
- 184 R: bank/buyback positions refused, carried positions allowed; the gate keeps unreadable slots out of moves

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/items/protocol-names.test.ts
- 12 R: CMSG_WRAP_ITEM byte layout against ItemPackets.cpp; swapped bag/slot order would wrap the wrong item
- 18 R: CMSG_ITEM_NAME_QUERY u32 entry + u64 guid layout, default zero guid
- 27 R: item name response parse with trailing inventory type, fully consumed

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/items/protocol-read.test.ts
- 19 R: CMSG_OPEN_ITEM bag/slot bytes
- 23 R: CMSG_READ_ITEM bag/slot bytes
- 27 R: CMSG_ITEM_TEXT_QUERY guid bytes
- 33 R: READ_ITEM_OK/FAILED parse guid only, fully consumed
- 39 R: item text response with text: found flag 0, guid, cstring; reference bytes pinned
- 54 R: unknown-item text response is a single 1 byte, parses as not found

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/items/protocol-refund.test.ts
- 18 R: CMSG_ITEM_REFUND_INFO guid bytes
- 22 R: CMSG_ITEM_REFUND guid bytes
- 26 R: refund info response layout incl. zero and played-time delta against reference bytes
- 64 R: refund result success parses cost block; a field order error misreports refund money/costs
- 97 R: refund result error has no cost block; parser must not over-read

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/items/protocol-sets.test.ts
- 25 R: equipment set list parse: raw 1 ignored sentinel kept, 0 empty, name/icon/index per set
- 45 R: empty list is count alone
- 51 R: saved reply u32 index + packed set guid reference bytes and parse
- 60 R: use result one byte; 4 bags full parsed
- 65 R: save body layout against CharacterHandler.cpp, 19 packed guids round-trip
- 83 R: update save packs a non-zero set guid; different branch from new-set zero guid
- 94 R: save validation rejects index, name length (bytes), icon length, slot count the server drops silently
- 121 R: use body is 19 packed guid + bag + slot entries; wrong count throws
- 137 R: delete body is the packed set guid

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/items/protocol-sockets.test.ts
- 21 R: CMSG_SOCKET_GEMS item guid + three gem guids, empty sockets zero
- 29 R: CMSG_CANCEL_TEMP_ENCHANTMENT u32 slot bytes
- 33 R: socket gems result: three socket enchants then bonus, reference bytes
- 47 R: SMSG_ENCHANTMENTLOG packed guids, entry, enchant id, no trailing bool

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/items/protocol-timers.test.ts
- 21 R: item cooldown guid + spell reference bytes
- 29 R: item time update guid + seconds
- 37 R: enchant time update item, slot, seconds, player order
- 57 R: set proficiency class + mask layout

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/items/protocol.test.ts
- 16 R: autoequip bag/slot bytes
- 20 R: autoequip-slot guid then slot
- 26 R: swap item destination first then source
- 32 R: swap inv item destination first
- 36 R: autostore bag item order
- 42 R: split item source, destination, u32 count
- 48 R: set ammo u32 entry incl. zero unload

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/items/reads.test.ts
- 16 R: pending read claims its item and settles once; late settle ignored
- 30 R: begin clears last outcome so a stale result is not reported for a new request
- 41 R: one query per guid, answer cached; dedup avoids duplicate sends
- 58 R: guidless not-found answer settles the oldest waiter; branch with no other test
- 70 R: dropped query does not consume a later answer; ordering after drop
- 80 R: clear settles waiters and forgets cache
- 93 R: name slice dedups per entry and fills waiters and cache
- 105 R: first name reply wins; repeat is not news
- 112 R: expire settles once and remembers the miss
- 123 R: late reply overrides a remembered miss
- 131 R: drop/clear release waiters without remembering a miss

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/items/refunds.test.ts
- 51 R: info reply for asked item caches the offer and clears pending
- 60 R: info reply for another item leaves pending alone but caches that offer
- 68 R: expireInfo settles unanswered with no info; slice-level state, runtime-refunds.test.ts:99 covers wiring only
- 76 R: second info answer replaces the cached offer
- 86 R: success result confirms refund with cost block and records last
- 98 R: error result refuses with refund_failed
- 108 R: result for another item leaves pending refund alone
- 115 R: unanswered refund settles unanswered after the wait
- 122 R: abandon drops both pendings; clear drops cache

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/items/runtime-guards.test.ts
- 40 R: acts reject out of world and send nothing
- 53 R: dead character may only unequip; split and equip refused, unequip sent
- 74 R: second move refused while pending; empty source and uncarried guid refused with one send
- 100 R: 5 s timeout boundary (4999 vs 5000) settles unanswered and frees the move
- 121 R: itemless failure settles a waiting destroy but leaves the move pending (SR1-items-6 ordering)
- 152 R: dispose rejects pending move with AbortError
- 164 R: setAmmo send bytes and confirmation from loaded id
- 194 R: failure settles missing-stack ammo refused; entry 0 unload confirms
- 220 R: ammo unanswered timeout
- 242 R: uncarried or already loaded ammo refused before sending
- 257 R: item_received event carries template level, inventory type and worn level

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/items/runtime-reads.test.ts
- 53 R: read send, unrelated guid ignored, matching OK settles; events ordered
- 76 R: inventory failure before READ_ITEM_FAILED supplies the reason and failed event
- 109 R: FAILED alone settles with read_item_failed; different reason branch from 76
- 126 R: itemless ITEM_NOT_FOUND settles a lone read failed
- 144 R: 4999/5000 timeout boundary settles unanswered
- 160 R: empty position and second read refused with a single send
- 180 R: text query dedup, cache, event and state
- 210 R: not-found text resolves undefined
- 226 R: open flows through rewards store and resolves on the loot window
- 258 R: failure naming the item rejects and closes opening window
- 280 R: no loot window in 5 s rejects, closes window, records unanswered
- 298 R: open refused while a loot window is open or when dead
- 318 R: itemless failure with move and read waiting settles neither; item-named failure settles only the read

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/items/runtime-refunds.test.ts
- 51 R: refundInfo sends guid, ignores stranger's response, caches by item, no second send
- 76 R: cached offer not returned once the item left the inventory
- 99 R: 5 s timeout boundary settles none and emits refund_info_none
- 116 R: info for a missing item refused before sending
- 128 R: second info query while pending refused
- 142 R: dispose rejects pending info query and clears it
- 153 R: refund send, stranger result ignored, success confirms
- 186 R: error result settles refused
- 204 R: refund unanswered timeout and event
- 219 R: refund for a missing item refused before sending
- 231 R: dispose rejects pending refund and clears it

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/items/runtime-sets-overlap.test.ts
- 38 R: save send failure rejects, frees the claim, retry works
- 60 R: use send failure rejects, frees the claim, retry works
- 84 R: delete send failure keeps the cached set; retry deletes
- 104 R: move blocked while use pending; use keeps failure owned by the weapon it replaces
- 140 R: set use refused while a move is pending
- 158 R: set save refused while a move is pending, no send, works after settle with updated items
- 189 R: use refused while update save is pending; after settle the use body carries the updated outfit

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/items/runtime-sets.test.ts
- 37 F: only asserts sent body length > 10; assert the body equals buildEquipmentSetSave of the worn guids or drop the length check
- 66 R: update sends known guid, timeout at 5000 settles saved_unconfirmed
- 104 R: use builds body from stored set and returns only failures naming its items
- 148 R: result 4 settles bags_full; unanswered use times out
- 176 R: result 59 during a use is not a failure
- 200 R: delete drops set at once and refuses a second delete
- 221 F: name promises a dead character but none is set up, and refusals only check "rejected"; assert each reason and add setHealth(0)
- 246 R: bag worn in slot 19 cannot stand in for slot 1; nothing sent
- 270 R: swapped equipment guids refused, sentinel 1 and empty slots pass
- 302 C packages/core/src/wow/areas/items/runtime-sets-overlap.test.ts:104: same setup and failures assertion for the replaced weapon
- 337 R: failure naming an item the set unequips is owned by the use; stranger's is not
- 380 R: saved item missing from carried snapshot keeps its guid in the use body
- 413 R: dispose rejects a waiting save

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/items/runtime-sockets.test.ts
- 40 R: socket send, stranger result ignored, logs and confirmed result with bonus and events
- 94 R: enchant log of another player's item is not own
- 120 R: enchant log with empty caster parses and is own for me
- 147 R: failure for stranger ignored, for the item settles refused
- 176 R: 4999/5000 timeout boundary settles unanswered
- 193 F: six refusals only checked as "rejected"; assert the distinct error reason per case so an unrelated throw cannot pass
- 214 R: gem inside an equipped bag is sent, an equipped gem is refused
- 240 R: second socket while pending refused
- 257 R: dispose rejects pending socket and clears it
- 268 R: cancelTempEnchant sends slot bytes and settles ok
- 286 R: out-of-range and fractional slots refused locally with no send

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/items/runtime-wrap.test.ts
- 65 R: wrap send bytes, pending claim, confirms on wrapped flag under own guid
- 93 R: already wrapped target rejected before any lookup or send
- 110 R: target or paper swapped during template lookup rejected unsent; each row hits a different guid path
- 146 R: target wrapped by another wrap during the lookup rejected unsent
- 180 R: refusal naming the item settles refused with the server's reason
- 197 R: refusal naming the gift paper is the wrap's own (ItemHandler.cpp:1098-1100)
- 212 R: refusal naming a stranger leaves the wrap pending
- 232 R: 4999/5000 timeout settles unanswered with server_unanswered
- 251 R: local refusals (not wrapper, itself, worn, empty) send nothing
- 275 R: equipped bag is worn and unwrappable; paper inside a bag can wrap
- 301 R: second wrap while pending refused
- 321 R: set item name query dedups sends, fills cache, emits set_item_name
- 343 R: reply for another entry does not answer; timeout settles none
- 358 R: silence settles none once and remembers the miss
- 378 R: dispose aborts a waiting name query and releases the waiter

#### Seams
- none

#### Defects
- none

## area-items-2

### packages/core/src/wow/areas/items/runtime.test.ts
- 48 R: wire CMSG_AUTOEQUIP_ITEM bytes and confirmed settle from inventory update; a wrong opcode or settle rule breaks equip
- 71 R: wire failure for another item is ignored, naming the item settles refused with the result name; mis-attribution would refuse a wrong move
- 97 R: result 59 (already equipped) settles no_change through the real SMSG handler
- 111 R: CMSG_AUTOEQUIP_ITEM_SLOT bytes and settle in the named slot
- 131 R: equip rejects unknown template and non-equippable type before any send
- 155 R: AUTOSTORE_BAG_ITEM bag selection (NULL_BAG default vs named) and rejection of non-equipment slot
- 177 R: unequip to bag 255 sends bag 255 and rejects non-bag 5; wrong bag byte stores nowhere
- 199 R: SWAP_INV_ITEM vs SWAP_ITEM selection and argument order
- 229 R: move from equipment is an unequip request, carried-to-carried is a swap; request kind is reported
- 266 R: bank/buyback positions refused with nothing sent
- 281 R: CMSG_SPLIT_ITEM bytes, count bounds against the stack, confirmed settle

### packages/core/src/wow/areas/items/sets.test.ts
- 28 R: SetSlice.list replaces known sets and marks known; an empty list must clear without losing known
- 39 R: applySaved stores the set under its index with the server guid and clears savePending
- 64 R: confirmUpdate keeps the old guid and reports saved_unconfirmed (server sends no update reply)
- 89 R: beginSave replacement and settleSave clearing pending with a timeout verdict
- 110 F: name promises beginUse replaces the last use, but only one use is begun; begin a second use and assert it replaces the first
- 142 F: name says duplicate names stay but only indices are asserted; assert the names so a name-keyed dedupe would fail

### packages/core/src/wow/areas/items/store-sets.test.ts
- 72 R: store emits sets_listed and keeps known after an empty list
- 82 R: beginSave emits set_save_requested; confirmSaved records the server guid and emits set_saved
- 111 R: a saved reply for another index is dropped with no event
- 126 R: guid 0 saved reply is rejected (create marker), no outcome
- 143 R: use result settles with only failures that name owned items; unowned and duplicate-result failures excluded
- 168 R: use result 4 maps to bags_full and drops failures for unowned items
- 185 F: name promises guid 0 unequips and guid 1 is ignored but only echoes the stored bigint; assert the parsed meaning or drop
- 198 R: beginDelete drops the set at once, emits set_deleted, second delete is a no-op

### packages/core/src/wow/areas/items/store.test.ts
- 55 R: begin records the pending move and emits move_requested
- 64 R: confirmation requires the end-state inventory, idle observe does not settle early
- 90 R: failure attribution to the moving item and refused reason/event; other item's failure ignored
- 112 R: result 59 settles no_change with reason none and move_no_change event
- 123 R: item-less failure settles the move only when no legacy destroy request waits
- 145 R: legacy claim noted during the move still blocks an item-less failure after legacy settles
- 163 R: expire settles unanswered; idle store ignores failures and observes
- 177 R: receiveItem emits item_received with upgrade levels
- 200 R: item cooldown keeps seen time and emits item_cooldown with entry
- 212 R: item time becomes absolute expiry and emits item_timer
- 227 R: unheld item still reports its time with entry undefined
- 233 R: enchant time keeps slot and emits item_enchant_timer
- 262 C packages/core/src/wow/areas/items/timers.test.ts:122: durability_loss_death event is also asserted from the opcode there
- 268 R: proficiency packet names new weapon skills via bit table and keeps mask
- 286 R: unknown item class proficiency emits nothing at the store
- 292 R: store dispose clears the timer slice
- 301 R: socket slice starts empty and dispose clears a pending socket

### packages/core/src/wow/areas/items/timers.test.ts
- 18 R: initial snapshot has unknown proficiency masks, not 0
- 27 R: item time becomes absolute expiry from receipt clock
- 35 R: later update replaces expiry including when it rises
- 46 R: enchant timers keyed by item and enchant slot
- 70 R: cooldowns keep latest time, one per item/spell pair
- 81 R: proficiency reports newly added bits and separates weapon from armor
- 101 R: other item classes change nothing
- 110 R: snapshots are copies and clear resets everything
- 122 R: each timer opcode decodes, reaches the store and ends in state

#### Seams
- none identified; tests use public handle/store APIs and shared items-world rigs

#### Defects
- none

### packages/harness/src/areas/items/area-sockets-sets.test.ts
- 10 R: sockets_updated event writes items/socketed log row with guid/ref and data
- 43 R: own enchantment log writes items/enchanted; another player's yields no row
- 91 R: set_saved rows for saved and saved_unconfirmed carry status data
- 121 R: set_used logs on ok and wakes on bags_full

### packages/harness/src/areas/items/area-wrap.test.ts
- 17 R: wrap-kind moved event writes items/wrapped, not items/moved
- 34 C packages/harness/src/areas/items/area.test.ts:68: same move_refused wake; reason is echoed from the event and in data, so drop the "Move refused: ..." text pin; keeper asserts data reason

### packages/harness/src/areas/items/area.test.ts
- 42 R: each move kind maps to its log event name and data
- 68 R: move_refused and move_unanswered write wake rows with reason
- 108 R: item with higher level than worn wakes with upgrade row
- 132 R: equal level writes no upgrade row (boundary)
- 148 R: read_ok and item_text write items/read log rows
- 191 R: item cooldown log row carries entry/spell data and names the item
- 212 R: asserts class at 60/59 boundary and computed durations toContain("1 h")/("59 s") (seconds-to-text values); keep all, no sentence is pinned
- 237 F: keep class/event/data enchantSlot; replace toContain("enchant") with item name "Dragonmaw Key" and computed "30 s" (enchant-vs-item label is the only text branch tell); no sentence
- 258 F: keep class wake and event items/durability_loss; drop toContain("repair") (constant sentence, single branch, no looked-up value)
- 272 R: proficiency log row carries names and mask data
- 296 R: proficiency with nothing added writes no row
- 342 R: attach replays proficiency rows from retained masks
- 360 R: attach replays only live timers with seconds left, drops expired
- 403 R: attach with unknown retained state writes no rows

### packages/harness/src/areas/items/tool-bank.test.ts
- 110 R: open bank deposit act call with bag/slot and DONE status
- 124 R: item in carried bag deposits from that bag and slot
- 139 C packages/harness/src/areas/items/tool-bank.test.ts:305: same cant_carry_more refusal, 305 also asserts reason plus the next deposit call
- 151 R: unanswered deposit is UNCONFIRMED no_answer and the Next read recovers via the repeat guard
- 202 R: transport failure is rethrown, not misreported as banker out of reach
- 217 R: abort during pending deposit rejects with AbortError
- 242 R: banker lookup failure maps to banker_too_far with look next
- 254 R: closed bank refuses bank_closed, no deposit, next names interact/deposit
- 266 R: equipped bag is not a loose item, no deposit
- 279 R: empty slot reference refuses no_such_item without deposit
- 292 R: duplicate names refuse ambiguous_item without deposit
- 305 R: server refusal keeps the reason and offers the deposit next call
- 318 D tool-bank.test.ts:110: same ok-deposit branch; keeper asserts DONE and the looked-up item name "Linen Cloth"; drop "Deposited" prose
- 354 R: closed bank Next preserves the explicitly selected stack
- 366 R: server refusal Next preserves the selected stack
- 381 R: carried-bag item keeps its bag/slot through the Next after the bank opens
- 399 R: unreadable destination gives bad_position and does not invent a bag suggestion

### packages/harness/src/areas/items/tool-loot.test.ts
- 111 R: opening takes every offered slot and reports the items
- 125 R: collection waits for the item push before ending and releasing
- 147 R: waits for removal of the slot it took, not another slot
- 177 R: waits for money notice before release, releases once
- 207 R: take failure releases the window and reports PARTLY
- 222 R: unanswered take times out, releases, reports PARTLY
- 239 R: two offers of one item count as two slots

### packages/harness/src/areas/items/tool-move.test.ts
- 117 R: move parses bag-slot destination into act.move arguments
- 133 R: move to a bag or backpack picks the first empty slot
- 161 R: "bags" searches every carried bag
- 181 R: unequip to a named slot autostores then moves into the slot
- 215 R: backpack passes bag 255 to autostore with no follow-up move
- 230 R: unequip to bag 1 maps to wire bag 19
- 244 R: bare wire numbers 19-22 and 255 accepted for unequip
- 260 R: bare non-bag numbers refused no_such_bag, nothing sent
- 276 R: refused follow-up move reports the refusal reason after autostore
- 309 R: split parses bag-slot destination and count
- 326 R: split defaults to first empty slot shown
- 348 R: bag 1 to 4 map to equipped bags 19-22
- 368 R: bag 1 skips the backpack even with room
- 382 R: bag slot with no bag equipped refused, no move
- 395 R: empty equipped-bag slot is not a bag
- 412 R: full bag reports bags_full, not no_such_bag
- 432 R: numbers outside 1-4 and 19-22 refused no_such_bag
- 441 R: split into bag 1 resolves to the equipped bag slot

### packages/harness/src/areas/items/tool-socket.test.ts
- 77 R: socket passes item guid and gem guids
- 92 R: refused socket surfaces the server reason
- 120 R: gem in a carried bag resolves
- 146 R: equipped target resolves while equipped gem is refused no_such_item

### packages/harness/src/areas/items/tool.test.ts
- 146 R: minimalArgs validates against gearParams (no shared check covers gear)
- 160 R: equip resolves by name to bag/slot and reports DONE
- 176 R: slot name main_hand maps to equipTo(guid, 15)
- 189 R: equip resolves "item <id>" and "bag N slot M"
- 204 R: equip result names the old item and where it landed
- 235 R: refused equip carries result name and required level
- 268 R: unequip by name calls unequip(slot, undefined)
- 282 R: unequip to "bags" lets server choose, no follow-up move
- 297 R: equip with bag/slot reference resolves the specific stack by guid
- 337 R: same-id duplicates refuse ambiguous_item with no equip
- 351 R: bag in a bag slot resolves for unequip
- 376 R: read returns item text via queryText
- 402 R: item with page id returns the page chain, not the mail text
- 422 R: unanswered page chain reports UNCONFIRMED unanswered
- 431 R: unknown template falls back to item text
- 441 R: template timeout propagates instead of falling back
- 454 R: ammo resolves entry and calls setAmmo
- 468 R: ammo refuses unknown entry before send
- 481 R: unknown item refuses no_such_item before send
- 492 R: ambiguous name refuses ambiguous_item before send
- 506 R: unknown slot name refuses no_such_slot before send
- 519 F: expectSendKind passes for any action when args do not send (equip "x" refuses unsent); use args that reach a send

#### Seams
- none identified; tests use public handle/store APIs and shared items-world rigs

#### Defects
- none

## area-lfg

### packages/core/src/wow/areas/lfg/protocol-list.test.ts
- 46 R: search join/leave u32 layout vs LFGHandler.cpp; wrong width/endianness breaks raid search
- 55 R: empty full list consumes all trailing u32s (remaining 0); a misread desyncs the stream
- 73 R: full list parse with 0x80-gated instance part; wrong gating shifts every later player
- 145 R: avg item level read as f32 (AzerothCore, not wowm u32); misreads item level
- 164 R: difference flag u8=1 then deleted guids; swapped order/flag misparses updates
- 189 R: difference list with only deleted guids, empty group/player branches parse
- 203 R: STATUS flag 0x40 reads status byte before instance part; ordering bug desyncs

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/lfg/protocol.test.ts
- 48 R: player update parse of queued/dungeons/comment from AzerothCore layout
- 63 R: update without data yields not queued, empty selection; misread would show phantom queue
- 76 R: party update skips 7 flag bytes; the wowm 4 would misalign dungeons (remaining>0 check is weak but parse asserts)
- 88 R: player info two rewards and u32 lock count; u8 count misparses locks
- 100 F: name says shared by player info, party info and join result but only parsePartyLockBlock asserted; rename or keep to party block
- 112 R: empty lock block parses to no locks from raw zero count
- 120 R: dungeonEntry id/type split; wrong mask breaks every join entry
- 124 R: empty status/lock request bodies match handlers; stray bytes would be rejected by server
- 130 R: bare join result 8 bytes result+state
- 140 R: join result lock block with u8 player count, absent from wowm; AzerothCore layout
- 159 R: queue status signed waits and role needs layout
- 186 R: role check update leader-first members, ready derived from roles
- 206 R: role check with empty dungeons/members, initializing false for state 5
- 220 R: role chosen ready flag derived from roles
- 229 R: join request byte layout vs LFGPackets.cpp; any shifted field breaks join
- 244 R: comment and 50-entry limit enforced (51 throws); oversize would crash server parse
- 254 R: leave/set roles/comment request bodies
- 260 R: proposal update per-member flag unpacking incl self/answered/accepted
- 309 R: proposal with zero players reads; empty-list branch
- 314 R: boot update votes, victim, time left, reason, needed
- 343 R: reward item order id/count/display id, AzerothCore wins over wow_messages
- 373 R: reward with no items; done false default
- 389 R: teleport denied and offer continue u32 reads
- 398 R: proposal result, teleport and boot vote request bodies

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/lfg/runtime-group.test.ts
- 104 R: no_proposal refusal and nothing sent
- 117 R: expired proposal refused after 40 s deadline without sending
- 132 R: sends stored id with accept byte; settles only on update for that id; wrong id would settle early
- 154 R: decline body and settles on failed update
- 172 R: another member's reply must not settle this player's answer
- 202 R: state 0 update recording opposite answer does not settle
- 227 R: proposal failed by another's decline refused proposal_failed, not ok
- 245 R: no_answer after 5 s timeout
- 259 R: second act while waiting refused busy
- 277 R: not_in_lfg_group refusal with code 6 and no send
- 291 R: dead vs ghost branches each refuse code 1 with no send
- 311 R: in_combat refusal code 8 no send
- 325 R: group check precedes life check, matching server order
- 336 R: force bypasses group check and sends; denial reply settles
- 359 R: teleport settles ok on new_world map change with body 0
- 373 R: teleport out sends flag 1 through the act; runtime flag passthrough
- 387 R: denial code settles refused with reason
- 402 R: no_answer after 10 s, transfer_pending extends, act freed afterwards
- 423 R: stale map-change listener does not leak into the next act
- 439 R: no_vote refusal, nothing sent
- 452 R: already_voted refusal, nothing sent
- 466 R: boot vote body and settle on next boot update
- 481 R: ending boot settles ok and later vote refused no_vote
- 499 R: non-decisive vote without update settles ok after window, sent once

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/lfg/runtime-list.test.ts
- 16 R: search body and settles only on list for masked dungeon id; other dungeon ignored
- 44 R: difference list settles and reports form difference
- 58 R: bad entries (0, negative, fractional, >u32, NaN) refused with no send
- 74 R: no_answer after 5 s frees act for second search
- 94 R: second search while waiting refused busy, one send
- 113 R: dispose rejects waiting search; no dangling promise
- 126 R: stop search sends leave body and settles ok at once
- 138 R: stopping keeps collected lists
- 152 R: stopSearch bad_entry refusal no send
- 165 R: stopSearch not blocked by waiting search

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/lfg/runtime-roles.test.ts
- 53 R: setRoles refuses without role check, settles on own role_chosen
- 76 R: setRoles(1) refused no_role though server echoes ready; AzerothCore behaviour
- 94 R: setRoles(0) refused on not-ready answer
- 113 R: leave refused not_leader for grouped non-leader, nothing sent
- 137 R: leader leave sends and settles on type-7 update
- 165 R: comment too_long refusal without send, ok after send

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/lfg/runtime.test.ts
- 65 R: requestStatus sends GET_STATUS and settles after update(s) solo
- 78 F: name says reply carries no comment but asserts only {status:ok}; assert state().comment stays empty or delete
- 100 R: group requestStatus waits for both player and party updates
- 118 R: requestDungeons returns available and locks from player info
- 137 R: requestDungeons no_answer after 5 s
- 153 R: party locks without group refused, nothing sent
- 168 R: requestPartyLocks settles ok on party info in group
- 183 R: one act at a time refuses busy
- 197 R: join refused no_role for masks lacking tank/healer/dps, nothing sent
- 210 R: random type-6 mixed with another entry refused mixed_random, nothing sent
- 235 R: solo join settles ok with queued dungeons from type-5 update
- 270 R: group join waits for initializing role check; roleCheck true
- 319 C packages/core/src/wow/areas/lfg/runtime.test.ts:396: same join_result 6 input; keeper should also assert refused reason
- 353 R: silent join settles refused lfg_disabled_or_ignored after 5 s
- 382 R: empty dungeon list refused no_dungeons, nothing sent
- 396 R: refused join returns typed party locks with guids and entries
- 430 R: leave settles ok on type-7 update
- 453 R: send failure rejects and leaves no waiter or unhandled rejection

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/lfg/store-group.test.ts
- 38 R: state 0 sets proposal with 40 s deadline and emits proposal
- 85 R: proposal event reports self answered/accepted flags
- 110 R: repeat state 0 for same id keeps original deadline
- 124 R: new proposal id restarts deadline
- 137 R: terminal states 1 and 2 clear proposal yet emit event
- 160 D: negative areaStubs inventory check; handled-opcode behaviour proven by store-group.test.ts:38
- 168 R: boot in progress sets boot state, deadline from time left, event
- 210 R: ended vote clears boot and omits deadline
- 236 R: teleport denial code to reason map, including unknown fallback
- 262 R: offer continue stores entry and emits
- 279 R: reward stores money, xp, items and emits itemCount
- 317 R: snapshots copy proposal players; caller mutation cannot alias store

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/lfg/store-list.test.ts
- 42 R: full packet stores lists by dungeon and emits raid_list full
- 72 R: empty full packet records empty list so search known answered
- 87 R: second full packet replaces only that dungeon
- 115 R: difference deletes, replaces by guid, appends; at refreshed
- 155 R: difference before any full list builds from nothing
- 174 R: state() copies; caller mutation cannot change store

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/lfg/store.test.ts
- 26 R: initial state shape, undefined vs empty defaults
- 54 R: type 5 sets queued, selected, comment and emits status
- 83 R: type 7 clears queue and selection after queue
- 113 F: type 9 case runs on fresh none so clearing is untested; send type 9 after queued, assert none
- 134 R: unknown update type keeps status and still emits
- 156 R: player info stores rewards and locks with reason and arrival time
- 184 R: party info stores per-member locks with party scope
- 215 R: search flag flips searching and emits search status
- 226 R: bare join result ok reason and join_result event
- 247 R: locked join result party reason and locks kept
- 289 R: queue status stored and emits queue
- 315 R: role check update initializing state names and ready/pending
- 340 F: name says leaves member pending but asserts ready:[0xan], pending:[] after role_chosen; fix name or assert pending case
- 370 D: negative areaStubs check; queue status handling proven by store.test.ts:289
- 381 D: negative areaStubs check; status handling proven by store.test.ts:54

#### Seams
- none

#### Defects
- none

### packages/harness/src/areas/lfg/area.test.ts
- 48 R: queue join emits one passive lfg/queued row
- 54 R: repeat status while queued writes no queued row
- 59 R: requeue after proposal writes queued row
- 67 R: leaving from queued/proposal writes one passive lfg/left row
- 76 R: none after none not a leave
- 81 R: search-flag status never writes queued/left
- 97 F: ruling A: row.text toContain("deserter") only echoes event.reason that data.reason already asserts; drop the text assertion, keep class/event/data
- 113 R: accepted join writes no refused row
- 129 R: ruling A: toContain("4 min") asserts the computed minutes (240 s to min) the agent reads; keep it
- 139 R: ruling A: toContain("16 s") asserts the seconds branch label (under 60 s) with no data field telling branches apart; keep
- 143 R: queue rows throttled to 60 s with boundary
- 151 R: leaving and requeueing resets throttle
- 161 R: open proposal wakes with deadline data
- 171 R: closed proposal states log, not wake
- 177 R: already-answered proposal does not wake
- 183 D: ruling A: only asserts the three texts differ, a prose inequality; state is in data, classes proven by area.test.ts:161,171
- 190 R: role check start wakes, later state logs
- 199 R: open kick vote wakes with deadline and counts
- 223 F: ruling A: drop text not.toBe(open text) prose inequality; keep class log; add open row text toContain("3 of 3") for the rendered agrees/needed counts
- 240 F: ruling A: text toContain("invalid_location") only echoes event.reason already in data.reason; drop the text assertion, keep data code 6/reason
- 254 R: offer continue row carries entry
- 262 R: reward log progress row with money, xp, item count
- 288 R: dungeon list arrivals write no row
- 295 D: copies declared lfgHarness.worldActs list; restates constant, no behaviour; acts exercised by packages/core/src/wow/areas/lfg/runtime.test.ts:65

#### Seams
- none

#### Defects
- packages/core/src/wow/areas/lfg/store.test.ts:340 name contradicts its assertions (ready, not pending); test wording only

## area-login

### packages/core/src/wow/areas/login/area.test.ts
- 18 R: full login order through the wire fills state and fires login_noise once; a miswired opcode or double fire breaks it
- 93 C packages/core/src/wow/areas/login/protocol.test.ts:55: empty addon list is the same zero-entry parse, store only counts it
- 110 R: SMSG_PONG wired to the pending ping with injected clock; wrong rtt or missing pong event
- 128 R: login_failed and logout_cancelled opcodes wired parser-to-store; the only wire-level proof of those two handlers

### packages/core/src/wow/areas/login/protocol.test.ts
- 32 R: parses 23 mixed entries against the AzerothCore writer layout and lands exactly at body end
- 46 D: asserts the test-support builder's byte sizes, not production; keeper protocol.test.ts:32 (remaining 0 over mixed entries)
- 55 R: minimal 4-byte body parses to no addons
- 64 R: banned list read after entries, ids extracted; layout contract
- 77 R: malformed and truncated bodies throw rather than misparse
- 88 R: account data times mask expands per set bit in bit order; flipped order misassigns types
- 107 D: same loop with another mask, no new branch; keeper protocol.test.ts:88
- 122 R: tutorial flags eight u32 against reference bytes
- 129 R: client cache version u32 layout
- 136 R: feature system status complaints/voice layout
- 144 R: learned dance moves two u32 layout
- 150 R: short bodies throw for fixed-size parsers
- 161 R: pong echoes u32 seq, consumes whole body
- 167 R: short pong throws
- 171 D: empty keep-alive body is also asserted on the wire; keeper runtime.test.ts:8
- 177 R: every LoginFailureReason code maps to its name, full body consumed
- 197 R: out-of-range failure code reads as unknown rather than throwing
- 205 D: empty logout bodies are asserted on the wire; keepers runtime.test.ts:20 and runtime.test.ts:50

### packages/core/src/wow/areas/login/runtime.test.ts
- 8 R: keepAlive sends exactly one empty CMSG_KEEP_ALIVE; outbound opcode contract
- 20 R: cancelLogout sends CMSG_LOGOUT_CANCEL and resolves only on the ack
- 34 R: cancelLogout times out after 5 s with "timeout"; error path
- 50 R: playerLogout sends one empty CMSG_PLAYER_LOGOUT immediately

### packages/core/src/wow/areas/login/store.test.ts
- 37 R: initial snapshot shape (link.lastSeq 0, rest undefined); consumers rely on undefined meaning not yet received
- 49 R: each receive fills its slice, addon counts keyed/banned derived correctly
- 64 R: login_noise fires once on the first dance moves packet, not on later ones
- 85 R: login_noise zero defaults when earlier packets never came
- 100 R: account_data_times emitted on every packet with its own mask
- 111 R: snapshot copies are detached; mutation of caller input or a snapshot cannot corrupt state
- 127 R: dispose drops listeners; leaked listener would keep receiving events
- 134 R: nextPing sequence starts at 1, latency 0 before any pong
- 141 R: pong computes rtt from injected clock, emits pong, next ping carries latency
- 156 R: duplicate pong is ignored once answered
- 168 R: unknown pong sequence changes nothing
- 180 R: pending ping cap of 8 drops the oldest
- 189 R: eviction order holds after an answered pong in between; ordering edge case
- 203 C packages/core/src/wow/areas/login/area.test.ts:128: login_failed event with parsed reason already asserted through the wire
- 211 C packages/core/src/wow/areas/login/area.test.ts:128: logout_cancelled event already asserted through the wire

### packages/harness/src/areas/login/area.test.ts
- 29 R: pong yields no rows and no fallback row through the real rule set
- 33 C packages/harness/src/areas/login/area.test.ts:29: same no-rows branch of the same empty rule with another event
- 37 C packages/harness/src/areas/login/area.test.ts:29: same no-rows branch of the same empty rule with another event
- 41 F: restates the declared `worldActs: []` constant; assert through the area registry or drop

#### Seams
- none

#### Defects
- none

## area-looting

### packages/core/src/wow/areas/looting/protocol.test.ts
- 23 R: SMSG_LOOT_LIST solo layout against reference bytes; a misread u64/pad desyncs creature id
- 37 R: group form packed master+looter parse; a wrong packed-guid read misattributes loot ownership
- 52 R: master mask 0 then looter packed; catches reading looter in the master slot
- 62 R: CMSG_OPT_OUT_OF_LOOT u32 1/0 wire bytes; a flipped flag passes/stops wrongly
- 67 R: CMSG_LOOT_METHOD field order and widths pinned by bytes
- 76 R: names are indexed to wire values (method/threshold ids); a reorder would send wrong ids; runtime.test.ts:108,129 only cover some indexes
- 93 R: SMSG_LOOT_MASTER_LIST u8 count and full u64 guids against bytes
- 105 R: count 0 edge reads no guids; catches over-read of an empty list
- 111 R: CMSG_LOOT_MASTER_GIVE layout (u64, u8 slot, u64 target) by bytes
- 120 R: ruling A: lootErrorName maps codes to labels the agent reads via the loot_error reject; keep every code→name assertion (10,12,13,14,0) and the 99 fallback value as is

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/looting/runtime.test.ts
- 52 R: disappear forgets the owner via the entity listener; a missing forget leaks owners
- 62 R: disappear for an unheld guid leaves owners intact; catches over-eager clearing
- 75 R: setPassOnLoot sends exact opt-out bytes and records state in both directions
- 95 C packages/core/src/wow/areas/looting/store.test.ts:29: two independent rigs; the second just re-asserts the fresh-store default and no send
- 108 R: setLootMethod resolves party member guid and maps threshold rank to wire id
- 129 R: empty master sends guid 0 with group_loot/uncommon ids
- 150 R: non-party master throws and sends nothing; error path
- 166 R: unknown threshold/method throw before any send; catches sending invalid ids
- 189 R: @self token resolves to own guid in setLootMethod
- 210 R: giveMasterLoot via @self sends exact bytes and settles on loot_removed for the slot
- 237 R: partner-name resolution; removal of another slot does not settle (wrong-slot settle bug)
- 262 R: non-candidate target throws and sends nothing
- 278 R: loot_error response rejects the give with the mapped error; error path
- 299 R: 5000ms timeout rejects with message and the send happened; timeout path

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/looting/store.test.ts
- 29 R: fresh store snapshot defaults (empty owners, no candidates, pass off); absorbs runtime.test.ts:95
- 42 R: solo loot list gives mine unknown and emits one loot_owner event
- 65 R: mine yes/no derivation for self as looter or master vs another, including the self guid cases
- 85 R: 64-owner cap drops the oldest; unbounded growth bug
- 98 R: repeat of a held creature refreshes recency (delete before set); eviction order bug
- 111 R: forget removes one entry without emitting; runtime disappear relies on it
- 125 R: snapshot is a copy; external mutation must not corrupt store
- 137 R: master list sets candidates and emits master_loot_candidates
- 156 R: release response clears candidates silently; stale candidates would allow a bad give
- 176 D: no assertions, name unrelated to body (injects three packets, checks nothing); keeper runtime.test.ts:237

#### Seams
- packages/core/src/wow/areas/looting/store.ts `forget`: also used by runtime disappear, store.test.ts:111 reaches it via rig.stores

#### Defects
- store.test.ts:176 name promises duplicate-item give settling but body is assertion-free

### packages/harness/src/areas/looting/area.test.ts
- 27 F: ruling A: keep the looked-up/substituted names (self "Me", unit lookup "Partner") in data.candidates and the text; replace the full-sentence `text: "Master loot candidates: Me, Partner."` with a `toContain("Me, Partner")` style check on the rendered names
- 43 F: ruling A: keep the 0x2a hex fallback value in data and text; drop the full-sentence text pin, assert `toContain("0x2a")` instead
- 63 R: loot_owner event writes no row (default branch)
- 67 R: looting contributes no attach row; filter is on domain which equals the area name

#### Seams
- none

#### Defects
- none

## area-mail

### packages/core/src/wow/areas/mail/protocol.test.ts
- 44 R: parses SMSG_MAIL_LIST_RESULT player/creature/two-item entries incl. stack count and enchant order; wrong field order misreads mail
- 105 R: hidden = realCount - parsed; a miscount would hide letters from the agent
- 117 R: size-overrun entry stops parsing and reports unreadable/hidden; a bug would over-read the packet
- 126 R: corrupt entry skipped via its size prefix and later letters still read
- 139 R: SMSG/MSG_QUERY_NEXT_MAIL_TIME sender rows capped at two in AzerothCore order
- 169 R: no-unread sentinel yields unread=false and no senders
- 178 R: SMSG_SHOW_MAILBOX guid decode
- 187 D: reads fixture mailReceivedMailBody() with a bare PacketReader, never the parser; keeper store.test.ts:86 (real SMSG_RECEIVED_MAIL handler)
- 195 R: CMSG_GET_MAIL_LIST / MARK_AS_READ byte layout, the only reference-layout proof (runtime tests compare against the builder itself)
- 206 C packages/core/src/wow/areas/mail/runtime.test.ts:140: empty-body check is asserted there as a literal sent body
- 212 R: plain SMSG_SEND_MAIL_RESULT success has no tail
- 219 R: item-taken tail decoded as low guid and count
- 239 R: equip error is its own field and status equip_error
- 258 R: item tail still consumed (remaining 0) for non-equip refusals
- 284 R: result enum to status names (AzerothCore); a shifted enum mislabels refusals
- 302 R: take/delete/copy/return write layouts per AzerothCore
- 320 R: CMSG_SEND_MAIL layout with per-attachment slot byte and trailing zeros

#### Seams
- packages/core/src/wow/areas/mail/protocol.ts `MailResultStatusName`: type exported only for protocol.test.ts table typing (type-only, harmless)

#### Defects
- none

### packages/core/src/wow/areas/mail/runtime-actions.test.ts
- 22 R: money take sends CMSG_MAIL_TAKE_MONEY, settles ok and zeroes money
- 49 R: item take sends CMSG_MAIL_TAKE_ITEM, returns itemLow and drops the item
- 78 R: COD item refused (cod_unpaid) without sending unless payCod
- 110 R: COD cleared after first take so later take sends without payment
- 155 R: deleteMail refuses non-empty letter (mail_not_empty) and sends nothing
- 174 R: returnMail sends sender guid, rejects unknown id, drops letter on ok
- 208 R: copyMailText refuses already-copied (already_copied) and otherwise sends
- 246 R: bad drafts (no receiver, self, cod+money, no funds) refused before CMSG_SEND_MAIL
- 284 R: server refusal settles refused and releases the guard for the next action
- 313 R: delayed ok after timeout must not settle next take; guard held until own reply
- 374 R: timed-out delete blocks next delete (mail_busy) until reply drains; keeper for timeout.test.ts:160
- 417 R: delayed take success during a refresh leaves the refresh pending
- 463 F: name promises a refresh interrupted by a new list, but body only times out a plain list; rename to timeout or add a real interrupting list

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/mail/runtime-equip.test.ts
- 12 R: equip_error on send, money take and copy each settles refused and releases the guard

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/mail/runtime-refresh.test.ts
- 28 R: list answered mid-send must not clear the send's guard (double send prevention)
- 66 R: list answered mid-take must not clear the take's guard
- 104 R: list clears the guard only after the act timed out

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/mail/runtime-send.test.ts
- 28 R: duplicate attachment guid refused (duplicate_attachment) before any CMSG_SEND_MAIL
- 49 R: negative control for 28; distinct guids send once and set pending
- 78 R: timed-out send holds guard (mail_busy), late reply releases it, next send settles on its own reply
- 112 R: GUID-less refusal after a timed-out take releases guard without settling the next take

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/mail/runtime-timeout.test.ts
- 62 R: timed-out copy keeps guard, blocks retry, clears on its reply
- 94 R: timed-out return keeps guard, blocks retry, drops letter on late ok
- 127 R: timed-out money take keeps guard and zeroes money on late ok
- 160 C packages/core/src/wow/areas/mail/runtime-actions.test.ts:374: same timed-out delete guard scenario, same assertions
- 191 R: a new list clears an orphaned guard so retry sends
- 228 R: dispose clears an orphaned guard

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/mail/runtime.test.ts
- 44 R: recreated mailbox with empty query type recognised from bytes1 packed type
- 48 R: other packed types and zero rejected
- 53 R: query type wins when bytes1 empty
- 59 R: listMail throws no_mailbox for unknown box and sends nothing
- 69 R: CMSG_GET_MAIL_LIST sent and ok settles with inbox and mailbox set
- 94 R: 5 s silence settles unanswered and does not set mailbox
- 108 R: markMailRead sends CMSG_MAIL_MARK_AS_READ and settles ok with no reply
- 128 R: markMailRead throws no_mailbox before any list
- 140 R: queryNextMail sends MSG_QUERY_NEXT_MAIL_TIME and settles ok with unread
- 163 R: queryNextMail times out unanswered
- 176 R: dispose rejects a pending list
- 184 R: listMail send failure rethrown with no unhandled rejection after timer
- 205 R: same for queryNextMail

#### Seams
- packages/core/src/wow/areas/mail/store.ts `mailboxKind`: exported; production uses it only inside store.ts, runtime.test.ts:44-55 import it directly

#### Defects
- none

### packages/core/src/wow/areas/mail/store.test.ts
- 17 R: list populates inbox/sender/items/hidden and emits only listed
- 67 R: next-mail-time sets unread senders and emits next_time
- 86 R: received-mail sets newMail, list clears it; event order
- 104 R: show-mailbox sets and replaces mailbox, emits mailbox_shown
- 124 R: unsolicited money result (no pending action) still zeroes money and records result; actions.test.ts:22 covers only the acted path
- 148 R: unsolicited delete result drops the letter and clears pending
- 167 R: refusal keeps the letter and records lastResult status

#### Seams
- none

#### Defects
- none

### packages/harness/src/areas/mail/area.test.ts
- 24 D: copies the worldActs array literal from area.ts; typed against the contract at packages/harness/src/areas/contract.ts:27 and exercised by tool.test.ts
- 38 R: new_mail event yields one passive mail/new row
- 48 R: next_time with senders yields one passive mail/new row
- 58 R: no senders yields no row (no spurious wake)
- 64 R: listed yields one log row carrying count
- 75 R: ok take results (money, item) yield mail/taken log rows with count/id
- 97 R: ok send yields mail/sent log row
- 106 R: refused result yields a wake row naming the status code
- 116 R: return/delete/copy ok add no row

#### Seams
- none

#### Defects
- none

### packages/harness/src/areas/mail/tool.test.ts
- 105 R: minimalArgs validates against mailParams; a schema change breaking the registry sample is caught
- 119 R: every verb refuses with reason no_mailbox away from a box and calls no act; coords asserted are data
- 143 F: pins the whole sentence "No mailbox is known nearby" (WORDING, drop). Keep the branch value: reason no_mailbox is the same as the far-box branch, so the only thing telling "no box known" from "box far" is the text lacking coordinates/distance; assert reason no_mailbox and `not.toContain("yd away")` (tool-check.ts noMailboxText known.length===0 branch), no sentence
- 152 R: check lists, marks each letter read via markMailRead, DONE status, body truncated to 200 chars
- 191 R: take collects money then each attachment in order with payCod false
- 237 R: equip refusal stops take with equip_error after gold taken
- 270 R: equipped item is not an attachable (no_such_item), nothing sent
- 289 R: same stack twice refused (duplicate_item) before send
- 309 R: sendMail call shape (slot 0, mailbox, money) and 30 copper postage reported
- 343 R: over-balance letter refused not_enough_money before sending, amounts reported
- 357 R: server not_enough_money refusal after funds moved reports the shortfall
- 377 R: funds dropping while queued behind the mutex are rechecked inside it; no send
- 406 R: runtime rejection not_enough_money (thrown, not refused) mapped to detailed refusal
- 421 R: tool sends inside the world mutex (shared harness check)
- 425 R: output capped at the line cap for long bodies

#### Seams
- none

#### Defects
- none

## area-objects

### packages/core/src/wow/areas/objects/display-catalog.test.ts
- 19 F: parser test asserts only minX/maxX; add minY/maxY/minZ/maxZ so a wrong column or lost reversed-endpoint ordering fails here (runtime-displays.test.ts:20 covers via rig)

### packages/core/src/wow/areas/objects/fields.test.ts
- 6 R: decodes CREATED_BY u64 and split DYNAMIC dynFlags/pathProgress; a swapped half misreads creator or path progress
- 19 R: absent raw fields read as undefined creator and zero flags; guards a crash/NaN on sparse entities

### packages/core/src/wow/areas/objects/fishing.test.ts
- 69 R: custom anim kept per guid and cleared on destroy; stale anim state would leak
- 81 R: despawn anim kept even for an unseen guid, cleared on destroy
- 98 R: despawn set capped at 400 inserts; unbounded growth bug
- 111 R: only own fishing cast starts the cast phase; other casters/spells must not
- 120 R: only caster's own bobber moves to waiting; foreign bobber must not hijack state
- 129 R: own object outside a cast is not a bobber
- 135 R: bobber custom anim hooks once and emits fish_hooked; other guid's anim ignored
- 152 R: anim before bobber known must not hook
- 163 R: NOT_HOOKED/ESCAPED clear state and emit events the harness consumes
- 178 R: bobber destroy ends fishing and a later cast starts fresh
- 188 R: only the fishing spell's failure ends the cast phase
- 197 R: failure after waiting must leave bobber state; wrong reset would drop a live bobber
- 205 R: store must not auto-send on hook (harness does use); pins the sent-packet boundary

### packages/core/src/wow/areas/objects/lock-catalog.test.ts
- 14 R: Lock.dbc column layout (type/index/skill per case) against two rows; a wrong column offset breaks every lock decision

### packages/core/src/wow/areas/objects/open-lock.test.ts
- 89 R: lock id 0 opens with any open-lock spell
- 100 R: skill lock picks spell whose open-lock miscValue matches the index
- 111 R: lockpicking below need refuses locked with skill 633 and need
- 123 R: lockpicking compares skill 633 not lock type; passes at 80 vs need 75
- 134 R: herbalism/mining map to skills 182/186, one refuse and one pass
- 156 R: lock type without a skill opens regardless of need
- 167 R: spell lock returns the lock spell even when not in spellbook
- 185 R: carried key item returns the key
- 203 R: missing key refuses locked with skill 0 need 0

### packages/core/src/wow/areas/objects/protocol.test.ts
- 27 R: CMSG_GAMEOBJ_USE is one u64 guid; checked against reader and length 8
- 33 R: CMSG_GAMEOBJ_REPORT_USE layout; separate builder from USE
- 44 R: CMSG_AREATRIGGER u32 LE bytes [88,0,0,0]
- 49 R: SMSG_AREA_TRIGGER_MESSAGE single-line parse
- 56 R: length covering only the first line must still read to NUL; both offsets checked
- 74 R: CMSG_PAGE_TEXT_QUERY order page id then guid, 12 bytes
- 81 R: PAGE_TEXT_QUERY_RESPONSE id/text/next page
- 90 R: missing-page reply with next page 0
- 103 R: SMSG_GAMEOBJECT_PAGETEXT one guid
- 113 R: CUSTOM_ANIM guid then u32 anim, 12 bytes
- 122 R: DESPAWN_ANIM reads a full 8-byte guid

### packages/core/src/wow/areas/objects/runtime-displays.test.ts
- 20 R: async DisplayInfo load surfaces ordered min/max bounds on the handle; undefined before load
- 45 R: no data source leaves displays undefined

### packages/core/src/wow/areas/objects/runtime-open.test.ts
- 187 R: open sends CMSG_CAST_SPELL with exact object target bytes, emits used cast
- 216 R: failed cast releases the loot request; leak would block looting
- 233 R: another spell's failure must not release the request
- 249 R: loot request times out and releases at 16 s, still opening at 14 s
- 264 R: unknown object sends nothing
- 278 R: openLockSpell reads lock from chest template and picks spell
- 301 R: missing template queries entry (exact bytes) and resolves on reply
- 334 R: failed Lock.dbc load settles as no_lock_data instead of hanging
- 362 R: template reply timeout (6 s) reports no_lock_data
- 383 R: CMSG_USE_ITEM exact bytes with key guid, use spell and object target; loot opening and used event
- 415 R: missing key in bags sends nothing, no_item

### packages/core/src/wow/areas/objects/runtime.test.ts
- 55 R: use sends USE then REPORT_USE, records pendingUse and event; quest state untouched
- 85 R: unknown object sends nothing
- 98 R: quest-giver object records talk intent first
- 114 R: pending use expiry boundary 5999 vs 6000
- 192 R: pose_sent entering trigger sends CMSG_AREATRIGGER once through control events
- 213 R: teleport correction marks inside without a send
- 229 R: new_world and login_verified mark arrival inside, no send
- 247 R: non-teleport correction must still send on entry
- 259 R: enterTrigger act sends and names current map
- 283 R: without AreaTrigger.dbc the watcher stays off, catalog none
- 295 R: missing AreaTrigger.dbc marks catalog failed
- 305 R: area trigger message via real packet keeps text and emits event
- 321 R: dispose stops watcher
- 331 C packages/core/src/wow/areas/objects/store.test.ts:163: same two-page chain, one packet, page_read event; store test also asserts pages cache
- 363 C packages/core/src/wow/areas/objects/store.test.ts:207: same cached-chain-sends-nothing assertion; store test also asserts no event
- 383 R: missing-page reply ends chain at the missing page
- 404 R: live chain stops at 30 pages (cap on the live path, distinct from the cached suffix cap)
- 425 R: unanswered page read times out at 5 s with page_unanswered

### packages/core/src/wow/areas/objects/store.test.ts
- 55 R: moves before catalog ready enter nothing; catalog load marks last point inside
- 71 R: entering returns trigger id; noteSent records sent and emits trigger_sent
- 84 R: unit TAXI_FLIGHT flag read from self entity suppresses sends
- 95 R: trigger message kept with timestamp and emitted (runtime.test.ts:305 covers the packet path, not `at`)
- 110 C packages/core/src/wow/areas/objects/runtime.test.ts:295: failed state asserted there through real dbc failure; move-after-failure same as not-ready (store.test.ts:55)
- 120 R: server template stored with derived lockId/type via query response
- 148 R: masked missing-entry reply stores nothing
- 163 R: two-page chain, one packet per page, events and cache
- 207 R: cached chain sends nothing and emits nothing
- 230 R: PAGETEXT with known template reports guid and template page id
- 267 R: chain reaching a cached page appends cached suffix
- 293 R: appended cached suffix capped at PAGE_READ_MAX_PAGES
- 324 R: one reply completes every waiting chain, duplicate reply does not re-emit
- 360 R: page shown before template lands is reported once the template arrives
- 396 R: triggersNear map filter, radius, nearest-first ordering, empty before catalog

### packages/core/src/wow/areas/objects/templates.test.ts
- 27 R: lockId word per GameObject type from GameObjectData.h
- 35 R: pageId from text data0 and goober data7, undefined elsewhere
- 42 R: questId from chest data8 and goober data1
- 49 R: questId keeps signed -1 for goober/generic
- 56 R: questItems drops unset zeros
- 62 R: gameObjectTemplate derives lock/page/quest/items and kind from a reply

### packages/core/src/wow/areas/objects/trigger-catalog.test.ts
- 42 R: AreaTrigger.dbc ten-field column order, box and sphere rows
- 49 R: onMap indexes by map
- 58 R: missing DBC rejects with the file name
- 64 R: wrong field count rejects as unsupported layout

### packages/core/src/wow/areas/objects/trigger-watch.test.ts
- 50 R: sphere containment boundary at radius 10 (137.5 in, 137.6 out) and z bound
- 59 R: box containment with orientation turned half pi, edges both sides
- 67 R: other-map trigger never holds the point
- 73 R: entering sends once, staying sends nothing
- 81 R: leave and re-enter resends
- 89 R: map change clears inside
- 97 R: arrival marks inside without a send
- 108 R: no send while on taxi, and no resend after landing until re-entry

### packages/harness/src/areas/objects/area.test.ts
- 14 D: no contract, restates the declared worldActs array; act wiring is typed through areas/world.ts and exercised by tool tests
- 18 R: used event maps to one objects/used log row
- 28 R: page_read maps to one objects/page row
- 40 R: trigger_sent maps to objects/trigger log row with data and no progress
- 57 R: trigger_message wakes idle agent, passive during run
- 80 R: hooked wakes; not_hooked/escaped share passive fish row

### packages/harness/src/areas/objects/reach.test.ts
- 32 R: interactionRadius for text object matches server radius
- 36 R: unknown type falls back to 5.5
- 40 D: identical target and point to the first assertion of reach.test.ts:54; keeper reach.test.ts:54
- 54 R: far-side reach at 5.4 true, 5.7 false
- 65 R: player beyond bounds out of reach
- 75 R: without bounds centre-distance boundary 5 vs 6
- 86 R: deep side of shrine box reaches past plain threshold
- 91 R: rotation moves the deep side
- 99 R: reversed min/max bounds reach the same box (z boundary)

### packages/harness/src/areas/objects/tool-fish.test.ts
- 228 R: REFUSED no_fishing and no cast
- 236 R: REFUSED no_pole when main hand empty
- 244 R: REFUSED no_pole for non-pole weapon
- 252 R: REFUSED already_fishing
- 260 R: bite order cast, use bobber, open, release; DONE and after fields
- 271 R: out.detail toContain("Raw Brilliant Smallfish") is the item name resolved from bag state into agent text (tool-fish.ts caught detail): contract, keep with after.taken
- 306 F: ends with expect(release).toBeDefined(), vacuous; drop it, keep the cast/release/use ordering
- 329 R: fish_not_hooked FAILED not_hooked, bobber never used
- 339 R: fish_escaped FAILED escaped, bobber never used
- 349 R: cast failure FAILED with server reason
- 361 R: another spell's failure leaves the wait to time out UNCONFIRMED
- 375 R: 30 s no bite UNCONFIRMED no_bite
- 390 R: abort rejects with human_stop
- 401 F: name promises the next fish call ignores a late bite but never starts one; run a second fish and assert it does not see the old hook
- 412 R: use/open/read without object refuse missing_object

### packages/harness/src/areas/objects/tool-read-reach.test.ts
- 104 R: read of page object outside display reach refuses too_far with travel next, no read
- 119 R: inside display reach reads once, DONE

### packages/harness/src/areas/objects/tool.test.ts
- 112 R: minimalArgs validates against useParams schema
- 126 R: unknown object refuses not_found
- 136 R: far object refuses too_far with travel next
- 148 R: plain use past interaction distance refuses too_far
- 160 R: display bounds widen reachYd for a wide shrine through objectRows
- 211 R: point inside box still refused too_far past use gate
- 266 R: display rejection below scalar range still too_far
- 310 R: non-usable kind refuses not_usable
- 330 R: default chest use routes to open and surfaces locked
- 345 F: only asserts not too_far (passes for any other failure); assert the actual outcome of the far open
- 356 R: unlocked chest without open spell refuses no_open_spell and never uses
- 380 R: unlocked chest opens by spell 3365, not GAMEOBJ_USE
- 445 F: asserts only DONE; assert readPage called and use not called, as the name says
- 457 C packages/harness/src/areas/objects/tool.test.ts:330: same openLockSpell mock and locked refusal; 330 reaches the open path via default use
- 469 D: no contract, expected value restates emptyUse's own literal
- 479 F: pins sentence "Used Milly's Harvest (o1)." plus vacuous expect(contentOf).toBeDefined(); keep values toContain("Milly's Harvest") (name from row state) and "o1", drop sentence and contentOf

#### Seams
- packages/harness/src/areas/objects/tool.ts `emptyUse`: exported, only tool.test.ts:469 imports it
- packages/core/src/wow/areas/objects/store.ts `loadingTriggers`/`triggersFailed`/`useTriggers`/`noteSent`/`move`: store.test.ts calls them directly; production calls via runtime
- packages/core/src/wow/areas/objects/store.ts `waitLocks`: runtime-open.test.ts also uses it as a sync barrier
- packages/core/src/wow/areas/objects/trigger-watch.ts `insideTrigger`: exported, also used by the watch itself (trigger-watch.test.ts)

#### Defects
- PAGE_READ_MAX_PAGES is defined twice (core/.../objects/runtime.ts:32 and store.ts:31), both 30; tests import the store copy so a drift in the runtime copy is untested

## area-pets

### packages/core/src/wow/areas/pets/protocol.test.ts
- 58 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; reads the spell id of SMSG_PET_LEARNED_SPELL (Pet.cpp:1911-1914)
- 64 C packages/core/src/wow/areas/pets/protocol.test.ts:58: same parsePetSpellId branch with another spell id; no new branch
- 69 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; CMSG_REQUEST_PET_INFO has an empty body (MiscHandler.cpp:1560-1578)
- 73 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; CMSG_PET_ACTION writes pet, (type << 24) | action and target (PetHandl
- 81 R: pins Unit.h command 0x07/reaction 0x06 literals and the type<<24 packing; other tests use the constants themselves
- 96 R: legacy buildPetAttack (combat.ts:134) and new builder must stay byte-identical; drift would break /attack
- 102 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; CMSG_PET_STOP_ATTACK is the pet guid (PetPackets.cpp:30-33)
- 108 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; SMSG_PET_ACTION_FEEDBACK names 1-3 and keeps any other value as unknow
- 122 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; SMSG_PET_ACTION_SOUND reads the unit guid and a signed action (PetPack
- 136 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; SMSG_PET_DISMISS_SOUND reads the model id and position (PetPackets.cpp
- 152 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; CMSG_PET_CAST_SPELL writes guid, count, spell, flags and the target bl
- 167 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; CMSG_PET_CAST_SPELL with no target writes an empty mask (PetHandler.cp
- 178 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; CMSG_PET_SPELL_AUTOCAST writes guid, spell and the flag (PetPackets.cp
- 189 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; CMSG_PET_SET_ACTION writes guid and one or two slot pairs (PetHandler.
- 208 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; CMSG_PET_CANCEL_AURA writes guid and spell (SpellHandler.cpp:604-608)
- 215 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; CMSG_PET_NAME_QUERY writes the number then the guid (PetHandler.cpp:61
- 223 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; SMSG_PET_NAME_QUERY_RESPONSE reads number, name and timestamp (PetHand
- 237 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; SMSG_PET_NAME_QUERY_RESPONSE reads the five declined names when the fl
- 248 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; SMSG_PET_NAME_QUERY_RESPONSE not-found form gives an empty name (PetHa
- 260 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; CMSG_PET_RENAME writes guid, name and a zero declined flag (PetHandler
- 269 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; SMSG_PET_NAME_INVALID names the refusal reasons (SharedDefines.h:3911-
- 288 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; SMSG_PET_NAME_INVALID reads the declined names after flag 1 (PetHandle
- 303 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; list, stable, buy and revive write one guid (NPCHandler.cpp:334-353,42
- 316 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; unstable and swap write the guid and the pet number (NPCHandler.cpp:49
- 325 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; the stable list reads count, slots and pets with no loyalty field (NPC
- 352 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; a player with no pet stable reads an empty list (NPCHandler.cpp:365-37
- 359 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; an unknown pet flag is kept as unknown
- 370 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; SMSG_STABLE_RESULT names the codes (NPCHandler.cpp:38-46)
- 388 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; abandon and dismiss critter write one guid (PetHandler.cpp:39-55, 931-
- 396 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; SMSG_PET_TAME_FAILURE names the codes (SharedDefines.h:3931-3944)
- 423 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; a single talent writes guid, talent id and 0-based rank (PetHandler.cp
- 431 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; a preview list writes guid, count, then talent and rank pairs (PetHand
- 447 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; SMSG_PET_UPDATE_COMBO_POINTS reads unit, target and points (Unit.cpp:1
- 460 R: protocol layout/parse against AzerothCore sources; a wrong byte or code mapping breaks the packet or agent reason; an empty combo target parses as 0n (Unit.cpp:12867-12879)

#### Seams
- none: tests use production exports (petsRuntime, PetsStore.refreshing) that the area and runtime also call

#### Defects
- none

### packages/core/src/wow/areas/pets/runtime-abandon.test.ts
- 70 R: abandon/critter act sends or refuses with the right guid; a wrong guid dismisses the wrong unit; abandon with no bar is refused and sends nothing
- 83 R: abandon/critter act sends or refuses with the right guid; a wrong guid dismisses the wrong unit; abandon with a bar sends the bar's guid (PetHandler.cpp:931-949)
- 99 R: abandon/critter act sends or refuses with the right guid; a wrong guid dismisses the wrong unit; no critter on the owner is refused and sends nothing
- 112 R: abandon/critter act sends or refuses with the right guid; a wrong guid dismisses the wrong unit; a critter guid in the owner's fields is sent (PetPackets.cpp:20-23)
- 125 R: abandon/critter act sends or refuses with the right guid; a wrong guid dismisses the wrong unit; the guid is read at call time, not at construction

#### Seams
- none: tests use production exports (petsRuntime, PetsStore.refreshing) that the area and runtime also call

#### Defects
- none

### packages/core/src/wow/areas/pets/runtime-cast.test.ts
- 40 R: vehicle-bar cast routing (guid, count, spell, refusals) at the act boundary; casts a button 8-12 spell from the bar slots with the vehicle guid and
- 59 R: vehicle-bar cast routing (guid, count, spell, refusals) at the act boundary; refuses a spell that is not on the vehicle bar and an empty slot befor
- 76 R: vehicle-bar cast routing (guid, count, spell, refusals) at the act boundary; a pet bar without the vehicle flag does not cast from its slots

#### Seams
- none: tests use production exports (petsRuntime, PetsStore.refreshing) that the area and runtime also call

#### Defects
- none

### packages/core/src/wow/areas/pets/runtime-name.test.ts
- 76 R: name query/rename act timing, correlation and unanswered events; a new bar asks for the pet name (PetHandler.cpp:616-627)
- 88 F: injects a reply instead of an entity update at the same timestamp, so the negative never exercises the skip; drive an update at ts 7 (control: :139)
- 105 R: name query/rename act timing, correlation and unanswered events; a transition re-query marks the cached name stale until the reply
- 139 R: name query/rename act timing, correlation and unanswered events; an entity update with a newer timestamp asks again
- 163 R: name query/rename act timing, correlation and unanswered events; renamePet refuses when the pet is not renamable
- 176 R: name query/rename act timing, correlation and unanswered events; renamePet sends CMSG_PET_RENAME (PetHandler.cpp:840-929)
- 192 R: name query/rename act timing, correlation and unanswered events; a refusal ends the rename wait with no unanswered event
- 212 R: name query/rename act timing, correlation and unanswered events; a rename with no reply emits unanswered
- 228 R: name query/rename act timing, correlation and unanswered events; a throwing send rethrows and leaves no wait to report
- 266 R: name query/rename act timing, correlation and unanswered events; a same-second rename still refreshes and stores the new name
- 309 R: name query/rename act timing, correlation and unanswered events; a replaced rename emits one unanswered at the newer deadline
- 336 R: name query/rename act timing, correlation and unanswered events; a newer reply for the first name does not confirm the second rename
- 361 R: name query/rename act timing, correlation and unanswered events; a refusal of another name does not end the rename wait
- 381 R: name query/rename act timing, correlation and unanswered events; the reply for the requested name ends the wait without unanswered

#### Seams
- none: tests use production exports (petsRuntime, PetsStore.refreshing) that the area and runtime also call

#### Defects
- none

### packages/core/src/wow/areas/pets/runtime-stable.test.ts
- 36 R: stable acts send the right packet and the wait/unanswered lifecycle; each act sends its one packet with the AzerothCore body
- 60 R: stable acts send the right packet and the wait/unanswered lifecycle; a silent server gives one unanswered stable event after 5 s
- 77 R: stable acts send the right packet and the wait/unanswered lifecycle; the unanswered event names the stable request
- 93 R: stable acts send the right packet and the wait/unanswered lifecycle; a result ends the wait of stable, unstable, swap and buy
- 116 R: stable acts send the right packet and the wait/unanswered lifecycle; a list reply ends the list wait
- 131 R: stable acts send the right packet and the wait/unanswered lifecycle; a stale result does not answer a list request
- 146 R: stable acts send the right packet and the wait/unanswered lifecycle; a delayed list reply of a replaced request does not answer the newer o
- 171 R: stable acts send the right packet and the wait/unanswered lifecycle; a new act replaces the wait and only the newer deadline reports
- 189 R: stable acts send the right packet and the wait/unanswered lifecycle; the revive act sends and waits for nothing
- 203 R: stable acts send the right packet and the wait/unanswered lifecycle; disposing the runtime cancels a pending wait without a report
- 217 R: stable acts send the right packet and the wait/unanswered lifecycle; a throwing send rethrows, releases the wait and allows the next reques

#### Seams
- none: tests use production exports (petsRuntime, PetsStore.refreshing) that the area and runtime also call

#### Defects
- none

### packages/core/src/wow/areas/pets/runtime-talent.test.ts
- 48 R: pet talent acts send or refuse with the right limits and bytes; learnPetTalent with no bar is refused and sends nothing
- 61 R: pet talent acts send or refuse with the right limits and bytes; learnPetTalent sends the bar's pet, talent and rank
- 73 R: pet talent acts send or refuse with the right limits and bytes; learnPetTalents with no bar is refused and sends nothing
- 86 R: pet talent acts send or refuse with the right limits and bytes; an empty list is refused and sends nothing
- 99 R: pet talent acts send or refuse with the right limits and bytes; 31 entries are refused, 30 are sent (PetHandler.cpp:1153-1155)

#### Seams
- none: tests use production exports (petsRuntime, PetsStore.refreshing) that the area and runtime also call

#### Defects
- none

### packages/core/src/wow/areas/pets/runtime.test.ts
- 94 R: pet acts send the right packet or refuse with the right reason; requestPetInfo sends one empty CMSG_REQUEST_PET_INFO
- 104 R: pet acts send the right packet or refuse with the right reason; follow and stay send CMSG_PET_ACTION then ask for the bar again (MiscH
- 120 R: pet acts send the right packet or refuse with the right reason; each stance sends its reaction then asks for the bar again
- 139 R: pet acts send the right packet or refuse with the right reason; petStopAttack sends one CMSG_PET_STOP_ATTACK with the pet guid
- 153 R: pet acts send the right packet or refuse with the right reason; with no bar every act refuses no_pet and sends nothing
- 173 R: pet acts send the right packet or refuse with the right reason; dismiss with a bar but no pet entity in view refuses no_pet and sends 
- 186 R: pet acts send the right packet or refuse with the right reason; dismiss refuses a hunter pet, because command 3 deletes it (PetHandler
- 199 R: pet acts send the right packet or refuse with the right reason; dismiss sends command 3 for a pet that cannot be abandoned
- 209 R: pet acts send the right packet or refuse with the right reason; petCast refuses an unknown spell and a dead pet before sending (PetHan
- 231 R: pet acts send the right packet or refuse with the right reason; petCast sends a non-autocastable bar spell and refuses one whose attri
- 258 R: pet acts send the right packet or refuse with the right reason; petSetAction refuses a single command or reaction pair, which the serv
- 277 R: pet acts send the right packet or refuse with the right reason; petCast sends CMSG_PET_CAST_SPELL with the pet guid and a rising count
- 304 R: pet acts send the right packet or refuse with the right reason; petAutocast sends CMSG_PET_SPELL_AUTOCAST then asks for the bar again 
- 320 R: pet acts send the right packet or refuse with the right reason; petAutocast refuses an unknown spell and a passive spell (PetHandler.c
- 337 R: pet acts send the right packet or refuse with the right reason; petSetAction refuses a slot outside 0-9 and petSwapActions sends one p
- 363 R: pet acts send the right packet or refuse with the right reason; petCancelAura sends one CMSG_PET_CANCEL_AURA with the pet guid (SpellH

#### Seams
- none: tests use production exports (petsRuntime, PetsStore.refreshing) that the area and runtime also call

#### Defects
- none

### packages/core/src/wow/areas/pets/stable.test.ts
- 29 R: stable store state and events from list/result packets; a list reply fills the stable and emits stable_list
- 47 R: stable store state and events from list/result packets; an empty list with zero slots is kept as a known empty stable
- 65 R: stable store state and events from list/result packets; a result emits stable_result with its name
- 77 R: stable store state and events from list/result packets; a refusing result sets lastRefusal and a success does not
- 95 R: stable store state and events from list/result packets; a successful result marks the known list stale and keeps its rows
- 110 R: stable store state and events from list/result packets; a refusing result leaves the known list fresh
- 121 R: stable store state and events from list/result packets; the stable slice clears when the store is disposed
- 128 F: no bar was ever injected, so bar undefined/names {} passes trivially; inject a bar first and assert it survives the list
- 139 R: stable store state and events from list/result packets; a snapshot copies the rows so later lists cannot move it
- 155 C packages/core/src/wow/areas/pets/stable.test.ts:29: same LIST fixture; rows keyed by number there, duplicate name is no new branch

#### Seams
- none: tests use production exports (petsRuntime, PetsStore.refreshing) that the area and runtime also call

#### Defects
- none

### packages/core/src/wow/areas/pets/store-abandon.test.ts
- 15 R: tame failure store state and event; reason 7 sets the last refusal and emits tame_failed
- 31 R: tame failure store state and event; an unnamed code is kept as unknown with its number
- 43 R: tame failure store state and event; a later failure replaces the last refusal

#### Seams
- none: tests use production exports (petsRuntime, PetsStore.refreshing) that the area and runtime also call

#### Defects
- none

### packages/core/src/wow/areas/pets/store-name.test.ts
- 20 R: name/refusal store state and events; a name reply fills the names map and emits name
- 41 R: name/refusal store state and events; a not-found reply caches nothing and emits nothing
- 55 R: name/refusal store state and events; a refusal sets the last refusal and emits name_invalid
- 79 R: name/refusal store state and events; a declined-name refusal keeps the five cases
- 103 R: name/refusal store state and events; refreshing marks the number pending and the reply settles it

#### Seams
- none: tests use production exports (petsRuntime, PetsStore.refreshing) that the area and runtime also call

#### Defects
- none

### packages/core/src/wow/areas/pets/store.test.ts
- 73 R: pets store state, cooldowns and events from server packets; starts with no bar, no cooldowns, no refusal and no pet
- 91 R: pets store state, cooldowns and events from server packets; a pet bar sets the stance, command, slots and spells with one bar even
- 122 R: pets store state, cooldowns and events from server packets; cooldowns are absolute end times, an infinite one has none, and an exp
- 139 R: pets store state, cooldowns and events from server packets; the clear form removes the bar and its cooldowns with a cleared bar ev
- 152 R: pets store state, cooldowns and events from server packets; a learned spell joins the bar with autocast off and an unlearned one l
- 187 R: pets store state, cooldowns and events from server packets; a learned or unlearned spell with no bar still emits its event
- 208 R: pets store state, cooldowns and events from server packets; the snapshot carries the pet view of the owner's summon
- 231 R: pets store state, cooldowns and events from server packets; action feedback sets the last refusal and emits a feedback event (Unit
- 254 R: pets store state, cooldowns and events from server packets; the action and dismiss sounds change no state and emit nothing
- 273 R: pets store state, cooldowns and events from server packets; a pet cast failure sets the last refusal and emits cast_failed (Spell.
- 298 R: pets store state, cooldowns and events from server packets; a pet-guid SMSG_SPELL_COOLDOWN sets a pet cooldown and the character's
- 325 R: pets store state, cooldowns and events from server packets; a cooldown update keeps the known category and a new spell starts at 0
- 383 R: pets store state, cooldowns and events from server packets; SMSG_CLEAR_COOLDOWN clears only the pet's row for its own guid (Pet.cp
- 413 R: pets store state, cooldowns and events from server packets; a combo update keeps unit, target and points and emits combo_points
- 433 R: pets store state, cooldowns and events from server packets; zero points with no target clears the combo entry

#### Seams
- none: tests use production exports (petsRuntime, PetsStore.refreshing) that the area and runtime also call

#### Defects
- none

### packages/core/src/wow/areas/pets/view.test.ts
- 23 R: petView joins owner summon and pet fields into the view; joins the summon, pet number, name timestamp, rename and abandon bits,
- 44 R: petView joins owner summon and pet fields into the view; reads each bit of byte 2 of UNIT_FIELD_BYTES_2 on its own (UnitDefines
- 64 R: petView joins owner summon and pet fields into the view; no summon, no owner, or an unseen pet gives no view

#### Seams
- none: tests use production exports (petsRuntime, PetsStore.refreshing) that the area and runtime also call

#### Defects
- none

### packages/harness/src/areas/pets/area.test.ts
- 75 F: pins whole sentence in toMatchObject text; keep values via toContain: "Fang" (unitName lookup), "Wolf" (family 1 table), "defensive", "follow"; drop prose
- 86 R: pets area rules emit the right log rows (names, once-per-pet gating); a second bar for the same pet, such as a stance change, gives no row
- 93 R: toContain("Ravager") asserts the family-31 table label (the guid has no unit name, so the text reads "Your pet (Ravager)"); a value, not wording
- 101 F: toBe pins the sentence; keep values: toContain("Your pet") fallback name and "family 99" unknown-family fallback, plus "defensive, follow"; drop prose
- 106 R: pets area rules emit the right log rows (names, once-per-pet gating); the clear gives one gone row, and a clear with no pet out gives none
- 115 F: toBe pins the out sentence; keep values via toContain: "Fang" (lookup), "Wolf" (family table), "defensive", "follow"; drop the rest of the sentence
- 124 R: pets area rules emit the right log rows (names, once-per-pet gating); attach with no pet out writes no row and the first bar gives an out ro
- 130 F: pins whole sentence beside event pets/out; keep the event key and toContain "Fang", "Wolf", "defensive", "follow" (looked-up name, family label); drop prose
- 147 F: reason values in text are contracts: keep "nothing to attack" (reason code spelled out); add "spell 1742" next to "not_ready" (agent reads spell only in text); assert data.reason
- 162 R: pets area rules emit the right log rows (names, once-per-pet gating); a silent cast failure writes no row
- 174 R: pets area rules emit the right log rows (names, once-per-pet gating); a learned spell gives one learned row and an unlearned spell gives non
- 182 F: toContain("Fangtooth") is fine (data.name not asserted), but stable/unanswered/refused rows only check names; add toContain "stabled", "rename" (request), "profane"/"no pet" reason

#### Seams
- none: tests use production exports (petsRuntime, PetsStore.refreshing) that the area and runtime also call

#### Defects
- none

### packages/harness/src/areas/pets/tool-command.test.ts
- 16 F: detail toContain("follow") echoes the input order and the petCommand spy proves it beside DONE; drop the prose assertion
- 30 R: pet command tool statuses, refusals and spy calls; a follow bar while waiting for stay keeps waiting, then times out UNCO
- 48 R: pet command tool statuses, refusals and spy calls; stance passive sends one petStance and is DONE on the passive bar
- 64 R: pet command tool statuses, refusals and spy calls; a missing stance is REFUSED missing_stance and sends nothing
- 72 R: pet command tool statuses, refusals and spy calls; stop sends petStopAttack then follow and is DONE on the follow bar
- 89 R: pet command tool statuses, refusals and spy calls; no pet out is REFUSED no_pet
- 97 R: detail toContain("Wolf") is the target name resolved from the seen unit (not in input, which is "u1"); a value, keep; optionally add "u1" ref
- 114 R: pet command tool statuses, refusals and spy calls; an unseen target is REFUSED not_seen and sends nothing
- 124 R: pet command tool statuses, refusals and spy calls; no answer within 5 s is UNCONFIRMED with a walk-back next

#### Seams
- none: tests use production exports (petsRuntime, PetsStore.refreshing) that the area and runtime also call

#### Defects
- none

### packages/harness/src/areas/pets/tool-name.test.ts
- 13 R: rename/abandon tool statuses, confirm_name/name_pending refusals and mutex abort; rename is DONE on the name event carrying the requested name
- 30 R: rename/abandon tool statuses, confirm_name/name_pending refusals and mutex abort; rename is REFUSED with the reason on name_invalid
- 49 R: rename/abandon tool statuses, confirm_name/name_pending refusals and mutex abort; a rename aborted after queueing behind the mutex sends nothing
- 69 R: rename/abandon tool statuses, confirm_name/name_pending refusals and mutex abort; rename with no answer is UNCONFIRMED
- 83 R: rename/abandon tool statuses, confirm_name/name_pending refusals and mutex abort; abandon needs the pet's current name or it is REFUSED confirm_name
- 94 R: rename/abandon tool statuses, confirm_name/name_pending refusals and mutex abort; abandon with the name is DONE on the cleared bar
- 104 R: typed name equals creature name Fang while saved name is Ravager; only this test separates saved from creature name
- 115 R: rename/abandon tool statuses, confirm_name/name_pending refusals and mutex abort; abandon is REFUSED name_pending while the pet name query has no answer
- 125 R: rename/abandon tool statuses, confirm_name/name_pending refusals and mutex abort; abandon is REFUSED name_pending when the cached name predates the last
- 135 R: rename/abandon tool statuses, confirm_name/name_pending refusals and mutex abort; abandon is REFUSED name_pending while a same-second rename refreshes
- 149 R: rename/abandon tool statuses, confirm_name/name_pending refusals and mutex abort; abandon aborted after queueing behind the mutex sends nothing
- 167 R: rename/abandon tool statuses, confirm_name/name_pending refusals and mutex abort; abandon queued behind the mutex refuses when the pet is renamed first
- 196 R: rename/abandon tool statuses, confirm_name/name_pending refusals and mutex abort; abandon queued behind the mutex sends when the pet is unchanged

#### Seams
- none: tests use production exports (petsRuntime, PetsStore.refreshing) that the area and runtime also call

#### Defects
- none

### packages/harness/src/areas/pets/tool-spell.test.ts
- 21 R: cast/autocast/tame tool statuses, refusals and mutex abort; cast resolves the name, sends the pet cast and is DONE on the new cool
- 49 R: cast/autocast/tame tool statuses, refusals and mutex abort; cast with no definition loaded is UNCONFIRMED, never plain success
- 69 F: keep toContain("not_ready"): the failure code appears only in detail (out.reason is cast_failed); drop toContain("cooldown") prose beside it
- 91 R: cast/autocast/tame tool statuses, refusals and mutex abort; a cast_failed for another request of the same spell does not fail this
- 137 R: toContain("closed in") is the only marker of the chasing branch among DONE results (no code or data field); a tight branch label, keep, not a sentence pin
- 151 F: toContain("closing in") is prose beside UNCONFIRMED; assert out.reason toBe "closing_in" (the code that proves the branch) and drop the prose
- 164 R: cast/autocast/tame tool statuses, refusals and mutex abort; a cooldown that arrives without a bar update still settles DONE
- 179 R: cast/autocast/tame tool statuses, refusals and mutex abort; cast of an unknown spell names the pet's spells
- 188 R: cast/autocast/tame tool statuses, refusals and mutex abort; a cast aborted after queueing behind the mutex sends nothing
- 208 R: cast/autocast/tame tool statuses, refusals and mutex abort; cast of a passive spell is refused by the act
- 222 R: cast/autocast/tame tool statuses, refusals and mutex abort; cast ignores a vehicle bar whose slots carry no spell ids
- 254 R: cast/autocast/tame tool statuses, refusals and mutex abort; cast resolves a vehicle bar slot spell by id without a pet view
- 313 R: cast/autocast/tame tool statuses, refusals and mutex abort; autocast off is DONE on the next bar showing type off
- 335 F: toContain("already") is prose beside DONE and the not-called spy, which proves the branch; drop it
- 347 R: cast/autocast/tame tool statuses, refusals and mutex abort; autocast without on or off is REFUSED missing_state
- 355 R: cast/autocast/tame tool statuses, refusals and mutex abort; autocast with no reply is UNCONFIRMED
- 369 R: cast/autocast/tame tool statuses, refusals and mutex abort; an autocast aborted after queueing behind the mutex sends nothing
- 391 R: cast/autocast/tame tool statuses, refusals and mutex abort; tame casts Tame Beast on the target and is DONE on the new bar
- 410 R: cast/autocast/tame tool statuses, refusals and mutex abort; tame with the pet already out is REFUSED already_out and sends nothing
- 420 R: cast/autocast/tame tool statuses, refusals and mutex abort; tame is FAILED on the tame_failed event
- 442 R: cast/autocast/tame tool statuses, refusals and mutex abort; a tame aborted after queueing behind the mutex sends nothing

#### Seams
- none: tests use production exports (petsRuntime, PetsStore.refreshing) that the area and runtime also call

#### Defects
- none

### packages/harness/src/areas/pets/tool-talent.test.ts
- 89 R: pet talent tool statuses, refusals and listing; a name in the pet's tree learns the first rank and is DONE on the pet_
- 108 R: pet talent tool statuses, refusals and listing; a held rank sends the next rank, 0-based on the wire
- 124 R: pet talent tool statuses, refusals and listing; a talent already at its top rank is refused and sends nothing
- 136 R: pet talent tool statuses, refusals and listing; no free point is FAILED and nothing is sent
- 145 R: pet talent tool statuses, refusals and listing; a reply that does not hold the rank is FAILED, not DONE
- 156 R: pet talent tool statuses, refusals and listing; a talent of another family's tree is refused and sends nothing
- 171 R: pet talent tool statuses, refusals and listing; a pet with no talent tree and a missing pet are refused
- 191 R: pet talent tool statuses, refusals and listing; an id learns without talent data and is confirmed through pet_info
- 205 R: pet talent tool statuses, refusals and listing; a name needs talent data
- 217 R: pet talent tool statuses, refusals and listing; an act refusal reaches the caller
- 228 R: pet talent tool statuses, refusals and listing; no reply is UNCONFIRMED after five seconds
- 243 R: pet talent tool statuses, refusals and listing; an abort while queued behind the mutex sends nothing
- 263 R: pet talent tool statuses, refusals and listing; without a what it lists free points and the pet's tree, never another 
- 279 R: pet talent tool statuses, refusals and listing; the list says the points are unknown before the server reports them
- 285 F: negative on the "more; narrow the call." marker is wording; keep the 22 body rows and every id (values) in the formatted text, drop the prose negative

#### Seams
- none: tests use production exports (petsRuntime, PetsStore.refreshing) that the area and runtime also call

#### Defects
- none

### packages/harness/src/areas/pets/tool.test.ts
- 26 F: toBe pins "You have no pet out." and DONE does not tell the no-pet branch from status; keep as a tight toContain("no pet") branch label, drop the sentence
- 34 R: pet status/call/revive/dismiss tool statuses and settle logic; status prints name, family, level, health, happiness, stance, command 
- 55 R: pet status/call/revive/dismiss tool statuses and settle logic; status shows an infinite cooldown as unavailable, never ready
- 71 R: pet status/call/revive/dismiss tool statuses and settle logic; call casts Call Pet and is DONE on the new bar
- 81 R: pet status/call/revive/dismiss tool statuses and settle logic; call with the pet already out is REFUSED already_out and sends nothing
- 89 R: pet status/call/revive/dismiss tool statuses and settle logic; revive casts Revive Pet on a dead pet and is DONE on the bar
- 110 R: pet status/call/revive/dismiss tool statuses and settle logic; dismiss casts Dismiss Pet on a hunter pet and is DONE on the clear
- 120 R: pet status/call/revive/dismiss tool statuses and settle logic; dismiss on a pet that cannot be abandoned uses petCommand dismiss
- 146 R: pet status/call/revive/dismiss tool statuses and settle logic; no answer within 5 s is UNCONFIRMED
- 155 R: pet status/call/revive/dismiss tool statuses and settle logic; call with only the cast success and no bar is UNCONFIRMED
- 171 R: pet status/call/revive/dismiss tool statuses and settle logic; call with the cast success still pending waits for the bar
- 192 R: pet status/call/revive/dismiss tool statuses and settle logic; call with a failed cast is FAILED
- 203 R: pet status/call/revive/dismiss tool statuses and settle logic; dismiss of a pet that cannot be abandoned needs no Dismiss Pet spell
- 228 R: pet status/call/revive/dismiss tool statuses and settle logic; dismiss waits out the 5 s cast before the clear bar arrives
- 248 R: pet status/call/revive/dismiss tool statuses and settle logic; a pet refusal during the Dismiss Pet cast does not fail it; the later 
- 271 R: pet status/call/revive/dismiss tool statuses and settle logic; dismiss with a failed owner cast is FAILED
- 282 R: pet status/call/revive/dismiss tool statuses and settle logic; revive of a dead pet that is still out is DONE when its health rises, 
- 321 R: pet status/call/revive/dismiss tool statuses and settle logic; revive stays UNCONFIRMED when an already alive pet gets another update
- 347 R: pet status/call/revive/dismiss tool statuses and settle logic; revive of a dead pet that never rises is UNCONFIRMED

#### Seams
- none: tests use production exports (petsRuntime, PetsStore.refreshing) that the area and runtime also call

#### Defects
- none

## area-quests

### packages/core/src/wow/areas/quests/protocol.test.ts
- 36 R: SMSG_QUESTGIVER_STATUS_MULTIPLE layout with full 64-bit guids; a truncated guid or wrong stride misreads every giver
- 50 R: count-0 boundary of the multiple-status loop; must consume the packet and yield no givers
- 56 R: CMSG_QUESTGIVER_STATUS_QUERY is the 8-byte guid; a wrong size is rejected by the server
- 62 R: POI response layout, signed objective index and point list against QueryHandler.cpp; unsigned read would turn -1 into 4294967295
- 108 R: empty-POI response shape; a quest with no POIs must parse to an empty list and consume the packet
- 118 R: CMSG_QUEST_POI_QUERY writes u32 count then ids (QueryHandler.cpp)
- 126 R: dedupe and the 25-id cap are request-building contracts; over-cap would be dropped by the server
- 152 R: NPC text update with exactly 8 options and emote pairs; misaligned reads shift every later option
- 184 R: unknown-id text reply zero-probability "Greetings $N" options parsed by exact layout from QueryHandler.cpp
- 198 R: SMSG_GOSSIP_POI field order and float coordinates
- 212 R: CMSG_NPC_TEXT_QUERY field order (text id then guid)
- 221 R: completed-quests response ids parsed as a set, includes a large id
- 231 R: count-0 boundary of the completed response
- 237 R: CMSG_QUESTGIVER_HELLO is the 8-byte guid
- 243 R: CMSG_QUESTLOG_SWAP_QUEST byte layout of two uint8 slots
- 247 R: the builder refuses slots the server ignores (equal, 25, negative, fractional); keeps junk off the wire
- 257 R: server MSG_QUEST_PUSH_RESULT is guid plus uint8 (9 bytes) and maps 4 to BUSY
- 266 R: client MSG_QUEST_PUSH_RESULT is 13 bytes in order guid, quest id, result
- 279 R: CMSG_PUSHQUESTTOPARTY is the little-endian u32 quest id, pinned with literal bytes
- 285 F: only questId and from are asserted; the title the parser also reads is never checked, so a misread title still passes; assert confirm.title
- 296 R: CMSG_QUEST_CONFIRM_ACCEPT is the little-endian u32 quest id, pinned with literal bytes
- 302 R: wire values of QuestShareResult (0..10) come from QuestDef.h and are not derivable from the code; a renumbered enum breaks every relay

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/quests/runtime-daily.test.ts
- 50 R: self entity create block seeds the daily set and emits one daily event; a missed seed hides done-today quests
- 65 R: later slot (offset 1304, the last) added by an update grows the set and emits the new count
- 84 R: an unchanged update emits no event; guards against event spam on every rawFields update
- 96 R: the daily reset (all slots zeroed) empties the set and emits count 0
- 109 R: an all-zero first read gives an empty set but emits nothing (undefined vs empty distinction)
- 117 R: other players' entities and offsets 1279 and 1305 never touch the daily set; boundary of the field range
- 132 R: daily is undefined before the self entity arrives, so "no data" differs from "none done"

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/quests/runtime-share-offer.test.ts
- 103 R: decline sends the 13-byte push result 3 to the sharer, closes the offer, emits answered, and leaves no expiry timer behind
- 124 R: answering with no offer returns false and sends nothing
- 131 R: accepting a shared offer sends CMSG_QUESTGIVER_ACCEPT_QUEST to the divider with the quest id and does not decline
- 152 R: unanswered offer is declined exactly at 60 s with an expired event, once; boundary at OFFER_TIMEOUT_MS-1
- 170 R: a new offer restarts the 60 s wait and the decline names the newer quest
- 185 R: dispose cancels the expiry timer so no decline is sent after teardown
- 204 R: accepting the escort prompt sends the 4-byte confirm and an answered event
- 219 R: after the confirm a decline follows, in that order, to clear the stuck divider; ordering contract
- 242 C packages/core/src/wow/areas/quests/runtime-share-offer.test.ts:131: the same no-decline assertion `declined(r) == []` already ends the accept test on the same branch
- 261 R: declining the escort prompt sends only the push result 3 and no confirm
- 274 R: unanswered escort prompt is declined at 60 s and expired; no confirm sent
- 297 R: a gossip complete does not end the offer, guarding against dialog-close side effects
- 305 R: an auto-accepted quest never declines at expiry or answers later; timer and answer path beyond store-share.test.ts:137

#### Seams
- packages/core/src/wow/areas/quests/runtime-share.ts `OFFER_TIMEOUT_MS`: exported only for tests (production uses it in the same file)

#### Defects
- none

### packages/core/src/wow/areas/quests/runtime-share.test.ts
- 96 R: refusals not_in_log (unknown id and empty-slot id 0) and not_in_group send nothing; error-path contract
- 123 R: CMSG_PUSHQUESTTOPARTY carries the quest id and the push opens for every group member
- 140 R: a second share while open refuses busy, also after partial results; nothing extra sent
- 157 R: push completes only when every member has a final result (0 is not final), then frees the next share
- 176 R: offline members are not expected, so completion depends on online members only
- 189 R: after the 3 s first-result window silent members are resolved and push closes complete; boundary at -1
- 205 R: a member who sent result 0 holds the push open past the window until the final reply
- 217 R: refusal results BUSY and NOT_IN_PARTY count as final answers
- 226 R: 60 s timeout closes as timed_out, busy until then, then frees the next share
- 247 D: restates the PUSH_TIMEOUT_MS constant; keeper runtime-share.test.ts:226 pins the 60 s boundary
- 251 R: kicked, group destroyed and member removed/added each close the open push as group_changed
- 284 R: a no-change group list and a leader change leave the push open; negative control with a real change at :251
- 299 R: late relays after a push closed are dropped and counted, and are never credited to the next push
- 335 R: a stale relay in an open push is dropped when no reply is owed; counts drops
- 349 R: a stale relay from an older push does not move the open push's 60 s timer
- 372 C packages/core/src/wow/areas/quests/runtime-share.test.ts:402: that test already shows results do not restart the 60 s timer, with a result before and after the window
- 384 R: no result within 3 s closes as no_answer, once, and frees the next share
- 402 R: a result 0 member holds the push open past 3 s up to 60 s from the push, not from the result
- 416 R: late relays after 3 s still complete the push and a group change still ends it
- 439 R: a complete push leaves no timer to fire a second closed event
- 450 R: relayed results 2 and 3 appear as relayed while the sharer's own result 8 is a plain result; event ordering
- 467 R: a result with no push is dropped, counted, and emits nothing
- 476 R: the sharer's own result 8 alone closes the push as refused at once
- 491 R: a member's result 8 is a plain final answer and leaves the push open while others owe
- 499 R: dispose cancels the push timer so no closed event follows

#### Seams
- packages/core/src/wow/areas/quests/runtime-share.ts `PUSH_TIMEOUT_MS`, `FIRST_RESULT_TIMEOUT_MS`: exported only for tests

#### Defects
- none

### packages/core/src/wow/areas/quests/runtime-text.test.ts
- 34 R: a gossip dialog with an uncached title text id sends one CMSG_NPC_TEXT_QUERY with text id and giver guid
- 49 C packages/core/src/wow/areas/quests/runtime-text.test.ts:95: the dedupe happens in send via store.requestNpcText, which the second queryNpcText call also hits
- 61 R: no reply in 5 s moves pending to no_reply, boundary 4999 pending
- 76 R: a reply inside 5 s stays known with the dialog guid after the timeout; guards the timer overwriting a reply
- 95 R: queryNpcText dedupes per id and still sends for a new id

#### Seams
- packages/core/src/wow/areas/quests/runtime.ts `REPLY_TIMEOUT_MS`: exported only for tests (runtime-text.test.ts, runtime.test.ts)

#### Defects
- none

### packages/core/src/wow/areas/quests/runtime.test.ts
- 111 R: debounce, one multiple query 500 ms after the last trigger, boundary 499
- 128 R: cooldown caps the multiple query to once every 2 s
- 142 R: a giver game object triggers by type byte or queried gameObjectType
- 161 R: no query for units without the giver flag, players, or givers already marked; negative cases proven by the positives at :111
- 178 R: an update adds the giver flag and triggers the query; other updates do not
- 207 R: accepted, removed, completed and failed events trigger the query, progress, dialog and rewarded do not
- 227 R: a giver leaving view loses its mark
- 241 R: the single query is sent only for known creatures or objects, with an 8-byte guid
- 262 R: queryGiverStatuses sends the multiple query immediately, bypassing debounce
- 269 R: dispose drops a pending debounced query
- 282 R: an accepted event queries POIs at once and the pending entry expires as no_reply after 6 s
- 298 R: queryPoi refreshes a no_reply id once more and the reply stores a none entry
- 368 R: a log change queries only new and no_reply quests, never empty slots, with ids on the wire
- 383 R: accepted then log change for the same quest sends a single query, no double request
- 392 R: queryPoi returns a known entry without re-querying
- 403 R: a none-answered quest is re-queried on accept; the pending status is observed
- 416 R: a none quest is re-queried only on first appearance in the log
- 435 D: restates REPLY_TIMEOUT_MS equal to QUEST_REPLY_TIMEOUT_MS; keeper runtime-text.test.ts:61 pins 5000 ms to no_reply
- 460 R: login_verified sends one empty completed query and a new world does not
- 473 R: queryCompleted refuses while a reply is pending and re-allows after the timeout boundary
- 495 R: a rewarded quest joins the completed ids
- 503 R: act wrappers send hello, autolaunch and swap packets, and refuse invalid swap slots; wiring beyond the builder at protocol.test.ts:247

#### Seams
- packages/core/src/wow/areas/quests/runtime-log.ts `COMPLETED_QUERY_TIMEOUT_MS`: exported only for tests
- packages/core/src/wow/quests-requests.ts `QUEST_REPLY_TIMEOUT_MS`: exported and used in production, but the test at :435 only compares the two constants

#### Defects
- none

### packages/core/src/wow/areas/quests/store-daily.test.ts
- 11 R: ids at offsets 1280-1304 become a set and zeros are empty slots
- 17 R: duplicate ids collapse; offsets 1279 and 1305 ignored at the boundary
- 24 C packages/core/src/wow/areas/quests/runtime-daily.test.ts:65: the last slot (1304) counts and missing offsets read as empty both appear via the runtime
- 29 C packages/core/src/wow/areas/quests/runtime-daily.test.ts:109: an all-zero field is the empty set, asserted at the real boundary
- 33 C packages/core/src/wow/areas/quests/runtime-daily.test.ts:109: the first all-zero read emits nothing is asserted there through the event stream
- 38 R: set equality ignores order and distinguishes different and empty sets; only place the order-insensitivity is pinned

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/quests/store-share.test.ts
- 103 R: details packet with a divider and no pending intent opens an offer from the divider
- 117 R: details packet with no divider is a plain dialog, not an offer
- 125 R: details answering our own pending intent is not an offer even with a lingering divider
- 137 R: a quest already in the log is auto_accepted and opens no offer
- 150 R: request-items from a group member is a share_complete notice with no offer
- 159 R: request-items from a stranger or with a pending intent says nothing
- 174 R: offer-reward from a group member is a share_complete notice
- 182 R: offer-reward from a stranger or with a pending intent says nothing
- 199 R: a confirm packet opens a confirm offer from the accepting member with title and kind
- 219 R: a confirm for a quest already in the log is auto_accepted

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/quests/store.test.ts
- 41 D: initial-state probe; the first multiple packet at store.test.ts:85 reports changes from empty, which fails if marks start non-empty
- 50 R: the multiple packet replaces all marks, because it lists every giver in view, with timestamps
- 71 R: the single status packet sets one mark without clearing the others and records its source
- 85 R: one marks event per change and none for an unchanged packet
- 130 R: forget drops one mark in silence
- 146 R: markOf maps the status enum (QuestDef.h) including the unknown 0x1000 high bit
- 188 R: POI reply matched by quest id and an empty list becomes none
- 225 R: expirePois marks a pending id no_reply once and stays silent the second time
- 241 R: a reply for an unknown id is stored and a later reply replaces it
- 269 R: text reply cached and the greeting is the highest-probability non-empty text
- 292 R: the unknown-id reply greets with the fallback text through the store
- 305 R: a text reply keeps the giver guid of its pending query
- 331 R: completed is undefined (not an empty set) before any reply
- 340 R: the reply replaces the completed ids and emits their count
- 359 R: a rewarded quest joins a known list silently and is ignored until a list exists
- 378 R: a completed snapshot keeps its ids when the list changes later (immutability)
- 392 R: gossip POI stores fields with the giver from the pending intent and emits gossip_poi

#### Seams
- packages/core/src/wow/areas/quests/store-marks.ts `markOf`: exported for store.test.ts:146 (also used by the store)

#### Defects
- none

### packages/harness/src/areas/quests/area.test.ts
- 16 D: copies the worldActs list from area.ts; no contract beyond the declaration, and missing acts fail in the tool-level tests
- 61 F: keep text toContain of the looked-up giver name+ref "Magistrix Erona u3" and the mapped label "has a quest for you" (and no "Arcanist"); drop the toBe sentence and "Quest givers near you" prefix
- 76 R: repeated or equivalent giver sets write no second row; spam guard across three cases
- 88 R: a giver turning its offer into a turn-in writes no row
- 94 R: text toContain asserts looked-up name+ref plus the WORDS label "has a quest to turn in" and the absent name after the mark change; values only, no full sentence
- 107 R: gray or in-progress givers write no row
- 113 F: data is {} so only text tells the none-left branch; keep the row count and assert a tight toContain("No quest giver in view"), drop the full-sentence toBe
- 123 F: keep class, name and data (count, fallback, type); the text carries the event type label, assert toContain("completed") only, drop the toEqual pin of "quests completed"
- 135 F: assert data name "Lion's Pride Inn" and in text the looked-up giver name+ref "Magistrix Erona u3" (the lookup the text adds); drop the echoed-name-only toContain
- 149 R: text asserts looked-up sharer name, share title and the accept_quest/decline_quest tool names the agent parses; all values, no full sentence
- 167 F: keep toContain of looked-up member "Julia Sunstriker" and code-mapped label "accepted"; add the quest title or "quest 8329" fallback from questTitle lookup in the text; data stays
- 182 F: only data is checked, but the agent reads text; add toContain of looked-up member "Arcanist Ithanas" and the code-3 label "declined" (own table entry vs 2 at :167) in text

#### Seams
- none

#### Defects
- none

### packages/harness/src/areas/quests/journal.test.ts
- 40 F: the line pins "#14179 quest 14179: done today."; split into toContain("#14179"), the title fallback "quest 14179" and the only-in-text branch label "done today"; drop punctuation/format
- 61 R: a logged and done-today quest shows the log line only (negative control with positive #14179)
- 83 F: ordering is the contract, but the daily line is located by the full sentence; locate it with "#14179" (and "done today") instead of the whole line, keep the log line "#8326" index comparison

#### Seams
- none

#### Defects
- none

## area-raid

### packages/core/src/wow/areas/raid/names.test.ts
- 5 R: pins party result codes to agent-facing keys (ok, group_swap_failed, level, lfg); a shifted code misreports a refusal
- 12 R: pins operation code to key (invite, swap); the harness waits on these names
- 17 R: unknown codes keep their number so the agent still sees a distinct key

### packages/core/src/wow/areas/raid/protocol-marks.test.ts
- 24 R: parses MSG_RAID_TARGET_UPDATE kind 0 (who, icon, target); a swapped field misattributes a mark
- 33 D: zero who/target takes the same parse path as 24, no new branch; keeper protocol-marks.test.ts:24 (clear semantics at store-marks.test.ts:79)
- 42 R: kind 1 with no pairs is an empty list; zero loop iterations
- 46 D: one pair hits the same loop as the eight pairs, no new branch; keeper protocol-marks.test.ts:53
- 53 R: kind 1 reads all eight 9-byte pairs; catches a wrong loop bound or stride
- 66 R: parses the minimap ping guid and two floats against the reference layout
- 76 R: builds the client update body (icon byte, guid LE); a wrong layout sends the wrong mark
- 83 R: request body is the single 0xFF byte, no guid
- 87 R: ping body is two LE floats

### packages/core/src/wow/areas/raid/protocol-ready.test.ts
- 18 R: ready check start is the initiator guid alone
- 24 R: confirm is guid plus state byte; maps 1 to ready and 0 to not ready
- 35 R: client start and finish bodies are empty
- 40 R: answer is one state byte; a flipped value answers the wrong way

### packages/core/src/wow/areas/raid/protocol-structure.test.ts
- 17 R: convert body is empty
- 21 R: change subgroup is cstring name then group byte
- 28 R: swap subgroup is two cstrings
- 35 R: assistant is a full 64-bit guid then a flag byte for both on and off
- 45 F: layout is right but the last line restates PARTY_ASSIGN_MAIN_TANK === 0; drop it or assert a tank-role packet byte
- 56 R: uninvite by guid is guid then reason cstring

### packages/core/src/wow/areas/raid/protocol-summon.test.ts
- 12 R: parses summoner, zone and timeout in ms
- 20 R: response body carries the full summoner guid (high word kept) plus accept byte; truncation would answer the wrong summoner

### packages/core/src/wow/areas/raid/protocol.test.ts
- 12 R: party SMSG_GROUP_LIST maps kind, counter, leader, loot and difficulty
- 39 R: battleground raid type sets the raid kind and battleground flag
- 55 R: raid form maps member flags, subgroup, roles and the self block; flagNames decodes main_tank and main_assist
- 80 R: dungeon-finder block parsed
- 96 R: you-left form maps to empty member list with no loot or difficulty

### packages/core/src/wow/areas/raid/runtime-marks.test.ts
- 13 R: setRaidMark sends one MSG_RAID_TARGET_UPDATE with the icon and target guid
- 26 R: clearRaidMark sends the icon with a zero guid
- 39 R: requestRaidMarks sends the one-byte request through the act path
- 51 R: pingMinimap sends MSG_MINIMAP_PING with two floats
- 67 R: out-of-range icon throws before any send (-1, 8, 1.5)

### packages/core/src/wow/areas/raid/runtime-ready.test.ts
- 46 R: each ready check act sends its opcode and body (answers 1 and 0, empty start and finish)
- 69 R: starting a check sends only the start, no finish of its own
- 79 R: answering records our own answer in state
- 92 R: finish goes out once every online member answered and the timer does not send a second
- 126 R: timer sends the finish at 30 s, not before
- 150 R: a check somebody else started arms no timer
- 168 R: a server finish cancels the timer so none is sent
- 189 R: a self guid that appears after composition still arms the timer; catches caching the guid at compose time

### packages/core/src/wow/areas/raid/runtime-stats.test.ts
- 40 R: requests stats once per member the roster adds
- 53 R: fresh stats (29 s old) are read without a request
- 70 R: stale stats trigger one request per member per 10 s, with the exact boundary at 41 000
- 94 R: a member with no stats yet requests only after the throttle
- 110 R: requestMemberStats sends one request for the named member
- 122 R: unknown name throws and sends nothing
- 134 D: injects no send failure, only repeats the roster request assertion of runtime-stats.test.ts:40; keeper runtime-stats.test.ts:40
- 147 F: name claims stats are dropped but asserts only that the name is no longer in the roster; assert memberStats("Tom") is undefined (store clear is store-stats.test.ts:174)

### packages/core/src/wow/areas/raid/runtime-structure.test.ts
- 38 R: convertToRaid sends an empty CMSG_GROUP_RAID_CONVERT
- 51 R: moveToSubgroup sends name and zero-based group (tool group minus one)
- 65 R: tool group outside 1-8 throws before any send
- 80 R: swap sends both names in order
- 109 R: assistant, main tank and main assist send the right opcodes, guid, role and apply bytes
- 134 R: uninvite by guid sends guid then reason
- 148 R: a name outside the party throws and sends nothing

### packages/core/src/wow/areas/raid/runtime-summon.test.ts
- 48 R: answering with no summon throws no_summon and sends nothing
- 58 R: accept sends the stored summoner once, clears the offer, and a second answer throws
- 74 R: decline sends the zero response byte through the act path
- 85 R: summoner name comes from the roster; an unknown summoner is empty
- 111 R: offer lapses at the packet timeout, emits summon_expired, and answering then throws
- 131 R: a newer request restarts the expiry timer
- 151 R: a 3e9 ms timeout does not fire at once (timer overflow guard)
- 164 R: answering stops the timer so no expiry fires
- 178 R: dispose stops the timer
- 190 R: zone is named once the AreaTable load resolves; an unknown id stays undefined
- 208 R: missing AreaTable leaves the zone as an id and does not break the request

### packages/core/src/wow/areas/raid/runtime.test.ts
- 23 R: awaitGroupChange resolves with the first group_list whose changes match, skipping an earlier non-matching list
- 51 R: disbanded wait resolves when the group empties
- 76 R: rejects with "timeout" after timeoutMs

### packages/core/src/wow/areas/raid/store-marks.test.ts
- 50 R: a set updates one slot and emits raid_mark with the setter name
- 66 R: marking an already-marked target clears its old slot
- 79 R: the server's clear-then-set move ends with the target in the new slot and two events
- 100 R: target 0 from a named setter clears the slot and emits
- 115 R: icon beyond the eight slots is dropped without an event
- 126 R: a setter outside the roster has an empty name
- 136 R: the list replaces all eight slots and emits raid_marks
- 156 C packages/core/src/wow/areas/raid/store-marks.test.ts:136: list replacement already zeroes slots absent from the list; empty list is the same branch
- 169 R: a disband clears the marks
- 180 R: a different group guid does not inherit the old marks
- 200 R: a ping emits minimap_ping with who, name and position

### packages/core/src/wow/areas/raid/store-ready.test.ts
- 57 R: a start opens a check and names the initiator
- 76 R: confirms record ready, not ready and offline answers
- 105 R: a new start clears earlier answers
- 119 R: confirm with no open check, or from a non-member, is ignored
- 133 R: finish stamps the check and summarises ready, not ready, offline and pending
- 157 R: finish with no open check emits nothing
- 167 R: an answer after the finish is ignored
- 180 R: leaving the group drops the check

### packages/core/src/wow/areas/raid/store-stats.test.ts
- 37 R: full stats reply sets the stats slice for a rostered member
- 70 R: status bits produce died, ghost, revived, offline and online transitions in order
- 107 R: member_stats event carries the full guid, name and empty transitions on first sighting
- 128 R: stats for a guid outside the roster are ignored
- 156 R: a departed member's stats are dropped and the rest kept
- 174 R: disband clears every member's stats
- 186 R: a rejoin does not carry stale status into transitions
- 210 R: an explicit zero pet guid clears the pet
- 234 R: a stats update without pet fields keeps the pet
- 254 R: a pet hp-only update keeps the other pet fields, auras included
- 295 R: an offline reply keeps the observed power type
- 321 R: a full reply without a pet leaves pet null
- 341 D: direct call of statsTransitions for first sighting; the `!before` branch is hit at the real boundary, keeper store-stats.test.ts:107
- 347 R: partial update mask keeps earlier vitals, position and zone; only the merge test covers non-pet retention

### packages/core/src/wow/areas/raid/store-structure.test.ts
- 26 R: a swap refusal names the operation and result keys
- 46 R: acknowledgement with empty member maps to result ok
- 63 D: same unknown-code mapping as names.test.ts:17 through the store, no new branch; keeper packages/core/src/wow/areas/raid/names.test.ts:17

### packages/core/src/wow/areas/raid/store-summon.test.ts
- 8 R: request holds the offer until now plus the packet timeout and returns the event
- 34 R: a second request replaces the first
- 42 R: expiry clears the matching offer and reports it once
- 54 R: an old expiry does not clear a newer offer
- 62 R: clear drops the offer

### packages/core/src/wow/areas/raid/store.test.ts
- 28 R: group_list changes emit converted, subgroup, flag, loot and leader, and no difficulty change
- 73 R: joined, left and difficulty changes emitted
- 109 R: a list whose counter is not newer is ignored
- 125 R: the counter is scoped to the group guid
- 152 R: a disband list of another group is ignored
- 173 R: changes that affect the receiving character carry self: true
- 223 R: the you-left form clears the group and emits disbanded
- 239 R: a blocked invite emits invite_blocked
- 256 R: a live invite emits nothing on the raid stream

### packages/core/src/wow/areas/raid/zone-names.test.ts
- 6 R: reads area names by id; unknown id undefined
- 18 R: a failing reader rejects instead of resolving an empty table

### packages/harness/src/areas/raid/area.test.ts
- 27 R: conversion produces one passive raid/roster row
- 37 R: joined changes write no row
- 47 R: a left change is a passive roster row; data change left and name Tom carry the echoed name, no sentence is pinned (ruling A)
- 59 R: becoming leader is a wake row with data.change leader
- 71 R: another member becoming leader stays passive
- 83 R: other self changes stay passive
- 93 R: disband writes a passive roster row
- 99 R: blocked invite is a log row
- 105 R: command result is a wake raid/command row
- 116 R: transition code died maps to the "died" label (transitionText); toContain("died") keeps the mapped value, drop name and sentence
- 129 R: stats with no transition write no row
- 137 R: asserts "main tank" (flagLabel maps main_tank) and "gained" (the agent sees no data, so the label is the branch); echoed name Tom stays in data
- 149 R: asserts "assistant", "lost" and not "gained": the gained/lost label is the only branch signal in the text the agent reads
- 161 R: asserts the computed 1-based group (to 2 renders /\bgroup 3\b/) beside data from/to; the index is a rendered value, keep
- 173 R: started check is a wake raid/ready_check row
- 179 R: empty initiator name renders "You start" (self substitution, no data field tells the branch); keep toContain("You start")
- 189 R: answer code not_ready maps to "not ready" (answerText table); keep toContain("not ready"), echoed name Tom stays in data only
- 205 R: asserts the rendered counts and names via toContain("1 ready"), "not ready: Tom", "1 offline", and no "did not answer" for pending 0
- 233 R: keeps toContain("skull") (icon table) and "Springpaw Lynx" (looked-up target); no echoed-name or sentence pin
- 249 R: keeps toContain("Fgk") (self name substituted for the guid) and "star" (icon label); data asserts icon and name
- 259 R: asserts "cleared" (branch label the agent reads), "skull" (icon label) and data target "0"
- 275 R: the server's own clear before a move writes no row
- 281 R: a mark list writes no row
- 297 R: keeps toContain("30 yd") and /north/i, the computed distance and bearing; data x y beside them
- 312 R: no pose means no computed distance in the text (not.toContain(" yd ")); data carries name and position, no prose pinned
- 328 F: keep toContain("120 s") (seconds from timeoutMs); drop zone and name text, data asserts the echoed values
- 342 F: keep toContain("zone 3430"), the computed fallback label; data repeats it, so the text check is the one that matters
- 347 R: keeps toContain("Ann") (looked-up name) and "Someone" (fallback) in the text the agent reads; data repeats them
- 361 R: expiry writes a passive raid/summon_expired row

### packages/harness/src/areas/raid/tool-lead.test.ts
- 97 R: REFUSED not_leader when Peon does not lead, setLeader not called
- 107 R: an assistant may not lead-transfer
- 116 R: not_a_member, a missing name, and not_in_group refusals; nothing sent
- 128 R: DONE on the leader_changed event to that member; asserts the setLeader call and confirmed data
- 145 R: a leader change to someone else stays UNCONFIRMED
- 159 R: UNCONFIRMED when the server stays silent
- 170 R: a pre-aborted lead rejects and sends nothing

### packages/harness/src/areas/raid/tool-loot.test.ts
- 219 R: not_in_group, no_master_loot and not_master refusals open nothing
- 242 R: needs_item and not_a_member refusals
- 253 R: keeps toContain("Linen Cloth") (item name resolved from loot state) with DONE and the open, give and release spies; Tom not asserted
- 269 R: no member named gives to @self on the nearest corpse
- 276 R: naming the caller's own character gives to @self
- 287 R: lowest slot wins among same-label items
- 293 R: unnamed cached item matches by numeric id
- 301 R: unnamed cached item matches the "item <id>" label
- 313 R: named item matched by numeric id picks slot 1 among two items
- 324 R: an id fragment does not match (not_offered)
- 336 R: not_offered lists what the corpse holds and releases the window
- 349 R: not_candidate refusal still releases
- 357 R: loot error surfaces as FAILED with LOOT_ERROR_ code and still releases
- 366 R: a window that never opens fails without giving
- 377 R: asserts too_far with the computed "40 yd" distance and no open; the walk-range sentence is not pinned
- 386 R: pass_loot spy calls with true then false and DONE are the contract; no "requested" prose asserted (echoed on/off)
- 395 R: bad_choice and not_in_group refusals send nothing
- 410 R: DONE, roll spy, and toContain("Linen Cloth") (item name resolved from the open roll); keep the name, no sentence
- 418 R: no_roll when none open or the only one is answered
- 431 R: roll_not_allowed lists the allowed votes
- 439 R: bad_choice on an unknown vote
- 447 R: two open rolls give ambiguous_roll, and an item id picks one
- 466 R: matches an open roll by item name with the loot window closed
- 482 R: matches an open roll by "item <id>" label
- 498 R: unmatched item name gives no_roll and no roll is sent
- 509 R: a refused send reports FAILED with the server reason

### packages/harness/src/areas/raid/tool-marks.test.ts
- 141 R: mark sets skull on the named creature and is DONE on the echo
- 154 F: name promises resolving a unit id but target is the name "Field Rat"; add a unit-id target or rename
- 166 R: an echo for another icon does not confirm
- 179 R: silence for 3 s leaves UNCONFIRMED
- 188 R: clear removes the icon holding the target
- 205 R: clear of an unmarked target gives not_marked
- 216 R: a raid member without rank gets not_leader before any send
- 227 R: plain party member and raid assistant may mark
- 246 R: hostile_player refusal versus a friendly player marked
- 265 F: noTarget and unknown target assert bare "REFUSED"; assert their reason codes like the bad_icon and not_in_group cases
- 292 R: a throwing send gives FAILED
- 305 R: a pre-aborted run sends nothing
- 320 R: ping sends the named unit's position and is DONE
- 329 R: ping with no target uses the character's own position
- 336 F: unknown target asserts bare "REFUSED" only; assert the reason code
- 347 R: a throwing ping gives FAILED

### packages/harness/src/areas/raid/tool-raid.test.ts
- 121 R: raid, move, swap, promote and loot_rules argument shapes pass the TypeBox schema
- 139 R: not_in_group, not_leader, too_few_members, lfg_group and already_raid refusals send nothing
- 171 R: DONE when the group converts
- 183 R: raid_disallowed_by_level maps to FAILED level_too_low
- 197 R: an ok command result does not fail the wait
- 211 R: Peon plus one member may convert (boundary of too_few_members)
- 218 R: UNCONFIRMED after 3 s of silence
- 225 R: a throwing send gives FAILED
- 234 R: a pre-aborted signal rejects before any send
- 246 R: not_raid, not_leader, bad_group (0, 9, 1.5, missing), not_a_member and needs_name refusals
- 281 R: an assistant may move a member and the act receives the group
- 291 R: group_full refusal; a member already in the group is DONE with no send
- 305 R: subgroup change to another group or member does not confirm
- 318 R: swap is DONE when both members change group
- 331 R: swap needs two distinct group members (needs_name, not_a_member)
- 345 R: a swap with only one changed member stays UNCONFIRMED
- 359 R: bad_role, needs_name and not_a_member for promote
- 374 R: the role name is case-insensitive and reaches the act
- 384 R: assistant role needs the leader (not_leader); main roles accept an assistant
- 405 R: each role calls its own act and settles on its flag change
- 429 R: text off clears the role and needs the flag change off
- 447 R: a member already holding the role sends nothing

### packages/harness/src/areas/raid/tool-ready.test.ts
- 113 R: not_leader for a plain member and not_in_group; nothing sent
- 124 R: DONE when the server relays the start from Peon
- 135 R: an assistant may start a check
- 145 R: a start by someone else does not confirm
- 157 R: silence leaves UNCONFIRMED
- 166 R: a throwing send gives FAILED
- 175 R: a pre-aborted run sends nothing
- 190 R: no_check when none open or the open check is finished
- 201 R: not_in_group refusal for answers
- 207 R: yes and no answers reach answerReadyCheck(true/false), trimmed and case-folded
- 220 R: bad_answer on missing or unknown answers, nothing sent
- 229 R: a throwing answer gives FAILED

### packages/harness/src/areas/raid/tool-rules.test.ts
- 118 R: not_leader, lfg_group and not_in_group refusals send nothing
- 140 F: name says quality but no bad quality is tested; the missing and unknown method cases repeat tool-rules.test.ts:159. Add the quality case, drop repeats
- 159 R: bad_loot_method refusal names the `what` field and all five accepted methods
- 181 R: method taken from text when what is empty; an explicit what wins over text
- 202 R: a non-empty invalid what is refused even if text names a valid method
- 219 R: a whitespace-only what falls back to the method in text
- 234 R: sets method and quality and settles on a loot change
- 250 R: master_loot names a member, or @self when empty
- 267 R: quality defaults to the current threshold
- 280 R: rules already in force send nothing
- 289 R: stays UNCONFIRMED without a loot change

### packages/harness/src/areas/raid/tool-share.test.ts
- 124 R: not_in_group refusal sends nothing
- 132 R: asserts reason codes unknown_quest (missing and empty slot) and needs_quest; no prose, quest id echo not pinned
- 147 R: shared by title; per-member answers (sharing, accepted via relay, has it) are rendered and DONE
- 168 R: asserts result-table labels "Tom: busy" and "Ann: declined" (RESULT_TEXT codes 4 and 3 relayed); new table entries beyond 147, keep
- 182 R: rows for another quest are ignored
- 196 R: asserts UNCONFIRMED no_answer on a no_answer close at 2999 ms (event path); the sentence is not pinned
- 212 R: asserts UNCONFIRMED no_answer from the timeout path (silent server, 3600 ms); different path from 196, no prose
- 225 R: a busy push refusal reaches the agent as busy
- 234 R: a throwing send gives FAILED and frees the subscription
- 243 R: a pre-aborted share sends nothing
- 257 R: asserts FAILED refused for a refused close; reason code is the contract, no prose
- 278 R: no_offer for accept and decline, nothing answered
- 288 R: asserts REFUSED dead for accept while dead, nothing answered; name matches the assertion
- 299 R: decline spy call "decline" plus DONE; no prose asserted (echoed word)
- 310 R: asserts REFUSED no_offer when the store no longer owes the decline; reason code, no prose
- 317 R: accept spy "accept" plus DONE once the quest enters the log; no prose asserted
- 342 R: a log event without the quest stays UNCONFIRMED
- 363 R: a throwing accept gives FAILED without hanging

### packages/harness/src/areas/raid/tool-summon.test.ts
- 75 R: no_summon refusal, nothing answered
- 82 F: bare toContain("REFUSED") for dead, ghost and attackers; assert reason dead and in_combat per case
- 97 R: self IN_COMBAT unit flag refuses both accept and decline with in_combat
- 106 R: bad_answer on missing or unknown answers
- 115 R: decline answers false and is DONE at once
- 124 R: accept is DONE on teleport, new_world or near_teleport
- 134 R: accept ignores unrelated corrections and stays UNCONFIRMED
- 146 F: name promises the late jump is not counted but asserts only that jump() does not throw; assert no effect on the settled result
- 156 R: a throwing send gives FAILED
- 165 R: an answer throwing no_summon maps to REFUSED no_summon
- 174 R: pre-aborted accept sends nothing
- 187 F: pre-aborted decline path (separate from accept) is real, but the final summon-kept check reads a mocked state and is vacuous; drop it
- 201 R: a decline aborted while queued sends nothing, the second decline still runs
- 224 F: aborted-while-queued accept is real, but the trailing summon-defined check reads a mocked state and is vacuous; drop it
- 247 R: abort after the send rejects with cancelled and frees the wait
- 266 R: accept after combat ends is not refused as a repeat; uses the real repeat guard
- 286 R: accept after the offer arrives is not refused as a repeat

### packages/harness/src/areas/raid/tool.test.ts
- 105 R: groupSpec.minimalArgs validates against groupParams; the agent sees this as the minimal call
- 119 D: expectSendKind only throws for read or control tools and group is an action, so these seven calls assert nothing; keeper tool.test.ts:336
- 130 R: outside a group status is DONE with no code; toContain("not in a group") is the only branch label the agent reads, keep it; uninvite and setLeader not called
- 139 R: status lists per-member subgroup, roles, vitals and life (dead, ghost, offline)
- 183 R: status names the leader and whether Peon leads or assists
- 197 R: stale party stats say how long ago they were seen; unit-sourced stats do not
- 224 R: raid stats show a member dead before the roster does
- 261 R: an offline member with remembered stats stays offline
- 307 R: the lead line counts Peon in the group size
- 313 R: a full raid honours the line cap and a named status reaches the hidden member
- 336 R: not_in_group refusal sends nothing
- 343 R: kick without a name is REFUSED
- 351 R: not_a_member lists the members
- 360 R: not_leader when Peon neither leads nor assists
- 370 R: target_is_leader refusal
- 380 R: lfg_vote_kick refusal in a dungeon-finder group
- 390 R: an assistant may kick; call carries empty reason; UNCONFIRMED after the silent wait
- 403 R: reason is sent and DONE when the member leaves the roster
- 427 R: a left change for someone else does not confirm
- 443 D: same setup and assertion as tool.test.ts:360 (leader Tom, Peon plain member); keeper tool.test.ts:360
- 453 R: kick DONE on a disbanded event vs a left change differ only in detail (tool.ts:77 "the group disbanded"); keep /disband/i, no code tells them apart
- 463 R: a server refusal maps to FAILED not_leader
- 477 R: an ok command result is not a refusal
- 496 D: silent 3 s UNCONFIRMED is already asserted by the kick-as-assistant test and the left-for-someone-else test; keeper tool.test.ts:390
- 506 R: a throwing send gives FAILED
- 515 R: a pre-aborted kick rejects and sends nothing

#### Seams
- packages/core/src/wow/areas/raid/store-stats.ts `statsTransitions`, `mergeMemberStats`: exported and used by store-roster.ts; not test-only, but store-stats.test.ts calls them directly
- packages/core/src/wow/areas/raid/runtime-ready.ts `composeReadyRuntime`: used by runtime.ts; runtime-ready.test.ts:189 composes it with a cast ctx and a bare RaidAreaStore
- packages/harness/src/areas/raid/tool-summon.ts `summonTool`: tool-summon.test.ts:224 and :247 call it directly to bypass groupTool dispatch

#### Defects
- none

## area-reputation

### packages/core/src/wow/areas/reputation/area.test.ts
- 46 R: wires INITIALIZE_FACTIONS + SET_FACTION_STANDING through parser, store and the self race/class; a dropped handler or base mismatch shows
- 104 R: SET_FACTION_VISIBLE opcode reaches store.setVisible and surfaces the visible event and row
- 122 R: SET_FORCED_REACTIONS opcode wiring; the empty-list-then-replace sequence catches a missed removal event

### packages/core/src/wow/areas/reputation/catalog.test.ts
- 20 R: list-id/faction-id lookup and -1 as no list id; a wrong index map misroutes every packet
- 29 R: first matching race/class slot decides base reputation; wrong slot choice misreports every standing
- 43 R: canBeSetAtWar only for all-race factions; wrong answer lets the agent send an ignored CMSG
- 54 R: ReputationToRank thresholds at the exact boundaries plus bounds; off-by-one misreports rank

### packages/core/src/wow/areas/reputation/protocol.test.ts
- 20 R: parses 128 slots by list id with signed standings and flags (AzerothCore writer layout)
- 36 R: count field drives slot count, not a fixed 128; wrong count desyncs the reader
- 50 R: SET_FACTION_STANDING u32 id/delta layout after the increased byte
- 67 R: rejects the wowm u16 entry layout; a wrong width would silently misparse standings
- 84 R: SET_FACTION_VISIBLE u32 list id layout
- 91 R: empty forced list reads as zero reactions in 4 bytes (count-0 branch)
- 99 R: forced reactions are 8-byte u32 id/rank entries; width mistake corrupts every id after the first
- 113 R: rejects the wowm u16 forced-entry layout
- 130 R: CMSG_SET_FACTION_ATWAR bytes: u32 list id then u8 flag
- 135 R: CMSG_SET_FACTION_INACTIVE bytes: u32 list id then u8 flag
- 140 R: CMSG_SET_WATCHED_FACTION u32 id, 0xFFFFFFFF for none

### packages/core/src/wow/areas/reputation/relation.test.ts
- 59 R: relation view answers forced rank, reputation rank and war by Faction.dbc id through the store
- 75 R: guard reaction from standing, hostile standing, forced override; wrong ordering changes who attacks
- 89 R: with no catalog only forced ranks answer; guards the no-DBC path

### packages/core/src/wow/areas/reputation/runtime.test.ts
- 71 R: Faction.dbc loaded exactly once and handed to the store
- 83 R: no DBC source leaves catalog false and raw standings
- 93 R: UNIT_FIELD_BYTES_0 race/class on appear and update picks base reputation
- 114 R: PLAYER_FIELD_WATCHED_FACTION_INDEX update reaches the store
- 130 R: another guid's BYTES_0/watched fields are ignored; fails if the guid filter is removed
- 149 R: runtime exposes act.relationView backed by the store (wiring; contract itself at relation.test.ts:59)
- 214 R: setAtWar sends one CMSG with exact bytes, shows pending war, refuses the repeat without resending
- 235 C packages/core/src/wow/areas/reputation/store.test.ts:370: next INITIALIZE_FACTIONS clearing pending inactive is store logic, asserted there for inactive and war
- 252 R: setAtWar refusal reasons (unknown, cannot_change, own_faction, unchanged) send nothing; guards silent server drops
- 289 R: setInactive refusals, invisible only refused when going inactive; sent bytes checked
- 318 R: setWatched sends one CMSG and resolves only on the field update; repeat is unchanged
- 337 R: setWatched(undefined) sends 0xFFFFFFFF and refuses when none is watched
- 356 R: setWatched rejects with timeout at 5 s, not before
- 375 R: unknown faction name sends nothing

### packages/core/src/wow/areas/reputation/store.test.ts
- 69 R: INITIALIZE_FACTIONS replaces the list and counts known/visible; second call replaces, not appends
- 82 R: standing change reports base+delta, rank, rankChanged; rank crossing flips rankChanged
- 119 R: drop to Hostile infers AT_WAR, rise clears it, peace-forced never infers (ReputationMgr.cpp:430-436)
- 141 R: new faction list drops inferred war flags; stale inference would survive relogin
- 153 F: also asserts FACTION_FLAGS.VISIBLE === 0x01, restating a constant; drop that line
- 165 R: watched event only on change; 0xFFFFFFFF reads as none
- 183 R: list order by recency, visibleOnly, row shape with rank bounds
- 213 R: no catalog keeps deltas, rank undefined; event and row shape
- 237 R: clear empties without event; dispose stops listeners
- 253 R: forced replace reports exact added/removed; lookup by faction id
- 297 R: reordered identical forced list raises no event; guards spurious wake rows
- 317 R: initialize keeps forced reactions, clear drops them
- 327 R: factionRank/factionAtWar resolve Faction.dbc id via list id, including after re-init
- 342 R: no catalog gives no rank, no war (cheap negative on the no-catalog branch)
- 350 R: pending war flag shows in row, emits flags_pending, flagsOf bits, cleared by next list
- 370 R: pending inactive sets/clears independent of war; also keeper for runtime.test.ts:235
- 383 R: pending flag on an absent slot creates it
- 390 R: inferred war wins over older pending peace
- 397 R: unchanged standing in a flush with another gain keeps pending peace (server flush rule)
- 414 R: unchanged standing heading the packet infers war after peace request (floor-clamped loss)
- 430 C packages/core/src/wow/areas/reputation/store.test.ts:397: same setup (inferred war, then peace, then war declaration) already asserted there
- 442 R: manual war after inferred peace replaces the inference
- 451 R: toggling inactive leaves inferred war alone
- 460 R: further hostile standing keeps inferred flag
- 468 C packages/core/src/wow/areas/reputation/store.test.ts:119: SILVERMOON -9500 staying not-at-war is already asserted in its last lines

### packages/harness/src/areas/reputation/area.test.ts
- 42 R: changed row: class log, name, data keys and the delta/progress text for a gain inside a rank
- 59 R: negative delta formatting and progress below zero; sign branch differs from gain
- 72 R: no catalog yields name/class with the delta-only row (rank undefined branch)
- 88 R: nameless faction falls back to the list id label
- 101 D: standing rows never read runActive, so this is the same assertion as 42 (class log); keeper area.test.ts:42
- 108 R: rank-change row, name rank, with data
- 134 R: newly at war is name at_war and takes precedence over rank change
- 154 R: war flag unchanged and no rank change stays a changed row
- 172 R: war flag set with no rank change still fires at_war
- 189 R: already-at-war rank drop is a rank row, not at_war
- 208 D: same branch as 189 (atWar, wasAtWar, rankChanged) with other numbers; keeper area.test.ts:189
- 229 R: visible event gives discovered row with repListId data
- 250 R: forced reaction wakes the agent outside a run; class is a contract
- 261 R: forced row downgrades to log inside a run
- 266 R: removed forced reaction row, unnamed faction fallback, data keys
- 281 R: initialized/watched_changed/flags_pending emit no rows and no fallback in or out of a run
- 299 R: router names rows reputation/<name> with domain; agent-facing event key
- 313 D: restates the declared worldActs array; claim test at area.test.ts:321 proves the acts exist
- 321 R: claim.areas.reputation exposes the acts and refuses unknown faction without sending

### packages/harness/src/areas/reputation/journal.test.ts
- 53 R: visible rows ordered by recency with rank/points line format
- 61 D: same two-faction input and order as 53, checked through reputationRows; keeper journal.test.ts:53
- 69 R: invisible factions skipped
- 76 R: inactive marker
- 81 R: watched line last
- 90 R: watched line omitted when the watched faction is not visible
- 97 R: watched line omitted when find filters it out
- 104 R: find is case-insensitive and reports no match with the query
- 114 R: no-catalog line gives delta from base and ranks unknown
- 126 R: unnamed faction labelled by list id
- 133 R: empty state message
- 139 R: budget truncation keeps watched line and a more-count
- 163 R: daily reset countdown subtracts elapsed since the server answered
- 173 R: no reset line before the server has answered
- 177 R: no reset line after the reset time passed

#### Seams
- none

#### Defects
- none

## area-selfstate

### packages/core/src/wow/areas/selfstate/protocol.test.ts
- 43 R: SMSG_START_MIRROR_TIMER reference bytes + signed scale; a width/sign slip misreads breath drain
- 65 R: regenerating fatigue timer with paused=1 and spell id; distinct fields from 43
- 84 C packages/core/src/wow/areas/selfstate/store.test.ts:353: restates the MIRROR_TIMERS constant; store test maps ids 0/1 to fatigue/breath
- 88 R: SMSG_STOP_MIRROR_TIMER reference bytes and timer id
- 94 R: SMSG_STANDSTATE_UPDATE one-byte layout
- 100 R: CMSG_STANDSTATECHANGE u32 writer bytes; wrong width would be rejected by server
- 108 R: SMSG_PRE_RESURRECT packed guid reference bytes
- 114 R: SMSG_MULTIPLE_MOVES login compound reference bytes (opcode, size, packed guid, counter)
- 127 R: multiple moves in wire order across four opcodes, consumes the packet
- 146 R: unknown inner opcode skipped by length and reported; misparse would desync later entries
- 166 R: transfer abort reasons 7/8/9 carry a u8 arg; layout against reference bytes
- 187 R: reason 5 has no arg and consumes the packet
- 199 R: too_many_instances reason 4, no arg, nothing left over
- 212 R: collision height guid/counter/float layout
- 226 R: force pitch rate parsed through the shared speed-ack spec; guards the opcode registration
- 243 R: CMSG_CORPSE_MAP_POSITION_QUERY writer bytes
- 247 R: corpse position response all-zero writer body of 16 bytes, consumes packet
- 257 R: nonzero floats decode in order; zero-only 247 cannot catch an order/endian slip
- 267 R: SMSG_DISMOUNT packed guid
- 274 R: SMSG_MOUNTSPECIAL_ANIM full u64 guid, not packed
- 285 R: SMSG_CROSSED_INEBRIATION_THRESHOLD guid/state/item layout

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/selfstate/runtime-mount.test.ts
- 73 R: mounted needs flag and display id together, events on change only; catches half-set mount events
- 103 R: login-while-mounted holds state with no event; a spurious mounted event would wake the agent
- 116 R: taxi flag marked on mounted and dismounted events; harness uses it to skip rows
- 130 R: other guid or non-player entity with self guid not read
- 144 R: SMSG_DISMOUNT clears early and following field update adds no duplicate event
- 161 R: stale name/position rereads after dismount do not resurrect a mounted event
- 180 R: remount same display id and taxi bit after dismount accepted
- 197 R: remount to different display id after dismount accepted
- 220 R: taxi flight right after dismount sets taxi even on the same display id
- 239 R: other guid's dismount and dismount on foot emit nothing
- 250 F: name says a dismount clears a never-shown mount but body asserts another guid's dismount leaves mounted true; rename or cover the real case
- 264 R: other guid's mount animation emits mount_anim with guid
- 279 R: self guid mount anim emits nothing
- 294 R: dismount refuses not_mounted on foot and sends nothing
- 307 R: dismount refuses in_flight on a taxi and sends nothing
- 320 R: CMSG_CANCEL_MOUNT_AURA bytes and resolution on the field update
- 337 R: SMSG_DISMOUNT arriving before the field update resolves the wait
- 348 R: 2 s timeout settles no_answer
- 363 R: mountSpecialAnim refuses not_mounted and sends nothing
- 376 R: mountSpecialAnim sends the empty packet when mounted

#### Seams
- none

#### Defects
- 250 name contradicts body (other guid's dismount; state stays mounted); name is wrong, no production claim

### packages/core/src/wow/areas/selfstate/runtime-selfres-cancel.test.ts
- 58 R: send throw releases selfResurrect wait and timer; leak/unhandled rejection otherwise
- 75 R: send throw releases queryCorpseMapPosition timer and waiter
- 96 R: send throw releases dismount wait; asserts waiter count, timers and no unhandled rejection
- 164 F: name promises the late reply is ignored but nothing asserts it; assert no throw or state change after the reply

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/selfstate/runtime-selfres.test.ts
- 56 R: self-res spell field fires event once per change with name, falls back to unnamed on missing catalog entry
- 84 R: other player's self-res field not read
- 97 R: not_dead refusal, nothing sent
- 116 R: no_self_res refusal, nothing sent
- 135 R: empty CMSG_SELF_RES then resolves on health turning positive
- 161 R: ghost bit must clear with health before resolving
- 192 R: 5 s no_answer timeout and timer released; unrelated update does not resolve early
- 220 R: dispose rejects pending selfResurrect and clears timer
- 245 R: corpse query send bytes and response resolution
- 268 F: assertion-free probe; assert a later real query is not resolved by the stale reply or the store is unchanged
- 280 R: 3 s no_answer for corpse query, timer released
- 294 D: same dispose-rejects-pending-query contract as runtime-selfres-cancel.test.ts:164

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/selfstate/runtime.test.ts
- 62 R: stand state starts from BYTES_1 byte 0 and follows updates; wrong byte misreports posture
- 87 R: other guid or non-player self guid not read
- 98 R: ghost bit clears ghostPending only when set
- 116 R: breath_low fires exactly once at 10 s remaining, not before
- 140 R: stop cancels the breath_low deadline
- 161 R: start already under 10 s fires at once; regenerating never fires
- 178 R: CMSG_STANDSTATECHANGE bytes and resolution on SMSG_STANDSTATE_UPDATE
- 199 R: unserved states refused invalid_state with nothing sent
- 216 R: already-held state settles ok with nothing sent
- 232 R: 2 s no_answer timeout

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/selfstate/store-condition.test.ts
- 68 R: self drunk packet sets state and event; other guid ignored
- 86 R: repeated or unnamed-threshold packet emits nothing
- 99 R: first self create derives drunkState from value silently at each boundary
- 121 R: later field change moves value only; packet owns state
- 141 R: partial update without field keeps last value
- 160 R: restedXp, resting and restState follow fields
- 194 R: full rest state byte to name map plus unknown fallback

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/areas/selfstate/store.test.ts
- 35 R: water walk/land walk opcodes become move_flag events with counters
- 64 R: hover set/unset opcodes map to move_flag
- 93 R: flag packets for other guid forward with that guid
- 124 R: feather fall/normal fall map to move_flag
- 153 R: gravity enable/disable map, other guid forwards
- 193 R: multiple moves yields events in wire order with own counters, including force_root
- 231 R: non-self flag entry forwarded, unknown inner opcode skipped
- 292 R: stand state set and stand_changed fired on change only
- 318 R: mirror timer start fills, stop clears, with events
- 353 R: stops for all three ids clear timers; only started ones emit stopped
- 384 R: unknown timer id changes nothing
- 402 R: PRE_RESURRECT sets ghostPending only for self
- 424 R: transfer abort stored with timestamp and emitted
- 449 R: transfer abort with arg propagates arg to the single event; 424 uses the no-arg branch
- 466 R: collision height stored and forwarded to control for self
- 486 R: other guid's collision height ignored

#### Seams
- none

#### Defects
- none

### packages/harness/src/areas/selfstate/area.test.ts
- 50 F: toEqual pins whole sentence; keep class/event/data and toContain("60 s") (computed seconds in text); drop the rest of the sentence
- 68 F: asserts class plus sentence "You can breathe again."; assert event selfstate/surfaced (data is {}, event key proves the branch) and drop the prose
- 81 F: toEqual pins whole sentence; keep class/event/data and toContain("10 s") (ceil of 9600 ms, computed in text); drop "Surface now."
- 94 F: keep class/data/event and toContain("map 36") + toContain("instance is full") (REASON_WORDS label for reason 2, text only); drop the sentence frame
- 111 F: toBe pins whole sentence; keep toContain("229") and toContain("reason 99") (unknown-reason fallback, text only); drop the rest. Data asserts mapId/reason too
- 122 F: name is copied unchanged and data already asserts it; keep class/data/event, drop the sentence (toEqual on text)
- 139 R: mount/dismount rows are log class with display id and event keys
- 150 R: taxi mount and dismount write no row
- 157 R: state words per drunk state are an enum-to-text label map (DRUNK_TEXT); toContain of tipsy/drunk/smashed/sober plus distinct-text check are contracts; keep
- 184 R: other rider's animation writes no row
- 188 F: fallback "spell 20707" exists only in text; replace toBe of whole sentence with toContain("spell 20707"); drop the rest; may add data.name null
- 197 R: stand changes and ghost_pending write no row
- 204 R: fatigue timer start writes no breath row
- 216 R: paused and refilling breath timers write no row
- 229 R: attach with paused or refilling breath timer writes no row
- 239 R: attach with draining breath writes one wake row with time remaining
- 252 R: attach with no timers writes nothing

#### Seams
- none

#### Defects
- none

### packages/harness/src/areas/selfstate/dismount-first.test.ts
- 32 R: on foot returns not_mounted and never calls the act
- 39 F: name promises a race with a late dismounted event but none fires; drop the DISMOUNTED_FIRST text assertion and exercise the race or rename
- 52 R: in_flight refusal stops the tool with that reason
- 64 R: no_answer maps to UNCONFIRMED no_reply
- 74 R: abort while dismounting rejects the caller with the abort reason

#### Seams
- none

#### Defects
- none

### packages/harness/src/areas/selfstate/mount-verbs.test.ts
- 109 R: default mount casts known ground mount on self, DONE on mounted event
- 122 R: faster mount wins, last learned wins ties
- 142 R: flying-only book with no name refuses no_mount, nothing cast
- 151 R: named flying mount is cast
- 163 R: non-mount spell refuses not_a_mount, nothing cast
- 174 R: unknown spell refuses unknown_spell, nothing cast
- 185 F: asserts refused.next toContain "dismount" (hint prose) beside already_mounted; drop the next assertion
- 195 R: cast failures map to in_combat, indoors, in_water refusals
- 211 R: other cast failure stays FAILED with core reason
- 220 R: mounted event after cast reply still settles DONE
- 237 R: state already mounted at reply settles DONE
- 250 R: cast succeeds but never mounts is UNCONFIRMED no_reply
- 264 R: abort while waiting for mounted event rejects
- 285 R: dismount verb calls the act and is DONE on ok
- 295 R: act refusals keep reason
- 306 R: no_answer is UNCONFIRMED no_reply
- 314 R: abort while act waits rejects
- 330 R: pre-aborted signal rejects before calling the act

#### Seams
- none

#### Defects
- none

## area-spells

### packages/core/src/wow/areas/spells/mirror.test.ts
- 35 R: MirrorImages.request refuses non-visible guid without marking it; a mark set on refusal would block the real sighting
- 43 R: second request for one sighting returns already_requested, another guid unaffected; a missing mark spams the server
- 50 R: drop clears the requested mark so a new sighting can ask again; stale mark blocks re-requests forever
- 59 R: accepted reply is stored in full and emits mirror_image with scalar fields
- 75 C packages/core/src/wow/areas/spells/store-mirror.test.ts:86: same not-visible-reply-dropped branch asserted through the real packet path with snapshot and no event
- 82 R: second reply for one guid replaces the first; duplicates would accumulate
- 89 R: drop removes one image, clear empties all and resets the requested mark
- 100 R: snapshot returns a copy; returning live storage would leak later replies

### packages/core/src/wow/areas/spells/missile.test.ts
- 54 R: reportProjectile refuses an uncast spell (never cast, and a different spell while casting) and sends no packet
- 76 R: act writes self guid, spell, live cast count and position; a wrong cast count makes the server drop it
- 98 R: trajectory act refuses uncast spell with nothing sent, else sends 45-byte body with moveStop 0
- 129 R: SMSG_SET_PROJECTILE_POSITION from any caster surfaces as projectile_moved with the reader's fields

### packages/core/src/wow/areas/spells/protocol-mirror.test.ts
- 14 R: CMSG_FAR_SIGHT is one byte 1/0 per MiscHandler
- 19 R: mirror image request is a full u64 guid, not packed
- 25 R: parses the 68-byte player reply in writer order; swapped look bytes would misreport appearance
- 53 D: same parse path with all-zero look/items; no new branch in parseMirrorImage; keeper protocol-mirror.test.ts:25

### packages/core/src/wow/areas/spells/protocol-missile.test.ts
- 13 R: CMSG_UPDATE_PROJECTILE_POSITION layout caster u64, spell u32, count u8, three floats
- 28 R: CMSG_UPDATE_MISSILE_TRAJECTORY field order and zero moveStop with no tail
- 48 R: SMSG_SET_PROJECTILE_POSITION parse of u64 caster, u8 count, floats

### packages/core/src/wow/areas/spells/protocol-unlearn.test.ts
- 6 R: CMSG_UNLEARN_SKILL is exactly one little-endian u32 skill id

### packages/core/src/wow/areas/spells/protocol.test.ts
- 34 R: MSG_CHANNEL_START parse of caster, spell, duration, no trailing bytes
- 49 R: 0xFFFFFFFF duration decodes as endless (undefined), a distinct parse branch
- 62 R: MSG_CHANNEL_UPDATE parse of caster and remaining time
- 74 R: CMSG_CANCEL_CHANNELLING layout is a single u32 spell id
- 82 R: CMSG_CANCEL_AURA layout is a single u32 spell id
- 88 R: CMSG_CANCEL_GROWTH_AURA has an empty body
- 94 R: action button packing per type with high-byte flags; wrong type bits make the server store the wrong button (second spell row adds no branch)
- 110 R: absent button writes 0, which removes it on the server
- 117 R: CMSG_SET_ACTIONBAR_TOGGLES is one u8 mask
- 125 R: SMSG_SEND_UNLEARN_SPELLS parses count then that many ids
- 131 R: count 0 parses to an empty list; the loop edge case
- 137 R: spell modifier reads u8 bit, u8 op, int32 value
- 145 R: modifier value is signed int32; unsigned read would turn -10 into 4 billion
- 155 R: SMSG_MODIFY_COOLDOWN layout spell u32, guid u64, signed ms
- 173 R: play-spell visual/impact read u64 guid and u32 kit
- 183 R: SMSG_TOTEM_CREATED slot u8, guid u64, duration u32, spell u32
- 198 R: CMSG_TOTEM_DESTROYED writes the slot as one byte

### packages/core/src/wow/areas/spells/runes.test.ts
- 79 R: runes stay undefined until a death knight self update; guards non-DK state shape
- 88 R: SMSG_CONVERT_RUNE wired through store: event with from/to and state updated
- 102 R: DK self update yields the base 0,0,1,1,2,2 layout all ready, no events
- 116 R: spell-go rune peek marks spent rune with its elapsed byte and leaves others ready
- 138 R: two spent runes take their own elapsed bytes in order
- 157 R: successive spell-go packets accumulate cooldown bytes; an empty go keeps them
- 185 R: non-DK class never creates runes and convert is ignored

### packages/core/src/wow/areas/spells/runtime-bar.test.ts
- 56 R: setActionButton sends one packet with slot/packed id and updates the bar store
- 78 R: clearing a slot sends packed 0 and empties the store
- 96 R: invalid slot, id, unlearned spell and unknown type refuse invalid_button and send nothing
- 128 R: equipment_set is sent without a server-side check, its own act branch
- 144 R: setActionBarToggles sends one u8 mask packet
- 156 R: out-of-range masks refuse invalid_mask without sending
- 172 R: barToggles reads byte 2 of PLAYER_FIELD_BYTES and keeps the last value when the field is absent

### packages/core/src/wow/areas/spells/runtime-sight.test.ts
- 37 R: requestMirrorImage refuses an unseen guid with not_visible and sends nothing
- 53 R: one CMSG_GET_MIRRORIMAGE_DATA per sighting; the repeat is already_requested
- 77 C packages/core/src/wow/areas/spells/store-mirror.test.ts:99: disappear-then-request-again already asserted through the store; mirror.test.ts:50 also covers the mark
- 95 R: setFarSight sends opcode with 1/0 body and never refuses

### packages/core/src/wow/areas/spells/runtime-skill.test.ts
- 72 F: name promises the skill id but asserts only the opcode; assert the u32 body equals MINING (protocol-unlearn only covers the builder)
- 85 R: unknown primary profession refuses not_known with nothing sent
- 99 R: secondary skill and weapon refuse not_profession and send nothing

### packages/core/src/wow/areas/spells/runtime.test.ts
- 74 R: cancelChannel sends spell id once then time 0 ends it as cancelled
- 99 R: second cancel is cancel_requested; one packet total
- 113 R: no channel refuses not_channelling and sends nothing
- 126 R: self CHANNEL_OBJECT fields name the channel target
- 141 R: stale channel spell 0 before the field names the spell keeps the channel
- 152 R: channel spell falling to 0 with no time-0 update ends the channel as interrupted
- 214 R: cancelAura sends one CMSG_CANCEL_AURA for an own positive buff
- 229 R: without spell data a positive aura is still cancelled
- 240 R: non-integer, zero, negative, NaN ids refuse invalid_spell without sending
- 256 R: aura not worn refuses not_aura
- 270 R: another unit's aura is not cancellable by the character
- 292 R: negative flag, passive and NO_AURA_CANCEL each refuse not_cancellable
- 322 R: cancelAura on the running channel sends CANCEL_CHANNELLING instead
- 338 R: channelled spell not running refuses not_channelling
- 354 R: NO_AURA_CANCEL check precedes channel cancel
- 373 R: cancelGrowthAura sends an empty-body packet

### packages/core/src/wow/areas/spells/skill-names.test.ts
- 24 R: every primary profession id maps to its WoW name and is primary and profession
- 32 R: secondary professions are named and professions but not primary; Riding and weapons are not professions
- 50 R: unnamed skill reads as 'skill <id>' and is not primary
- 73 R: SkillLine.dbc names and category set primary status
- 81 R: nameless row falls back to skill <id>; ids outside the file use static names
- 88 R: missing SkillLine.dbc rejects naming the file

### packages/core/src/wow/areas/spells/skills.test.ts
- 11 R: reads id, step, value, max and signed bonuses from the update triples
- 40 R: profession flag set for primary/secondary, not weapons or racials
- 66 R: empty slots skipped and later slots still read
- 76 R: slot 127 read, slot 128 beyond the array ignored
- 88 R: undefined or empty fields read as no skills

### packages/core/src/wow/areas/spells/store-mirror.test.ts
- 61 R: visible unit's reply is held in state and emits mirror_image through the packet handler
- 86 R: reply for non-visible guid dropped without event
- 99 R: disappear drops the stored image and allows a new request
- 111 R: dispose clears stored images

### packages/core/src/wow/areas/spells/store-skills.test.ts
- 67 R: skills empty before the self update
- 76 R: value change emits skill_changed and a vanished id emits skill_removed
- 112 R: self appear seeds the baseline so the next update diffs against it
- 137 F: other-unit update then identical self updates pass even if the other unit were treated as self; give it a different value and assert no event/state change

### packages/core/src/wow/areas/spells/store-spellbook.test.ts
- 50 R: each unlearn packet replaces inactive ranks rather than merging
- 70 R: flat and pct modifier totals keyed by op and bit, last packet wins
- 91 R: total 0 removes the bit and empties the op map
- 107 R: MODIFY_COOLDOWN moves self's server cooldown by the signed delta and ignores other guids
- 135 R: modify cooldown for a spell with no cooldown creates none

### packages/core/src/wow/areas/spells/store-visual.test.ts
- 23 R: SMSG_PLAY_SPELL_VISUAL/IMPACT emit spell_visual with impact flag and leave state unchanged

### packages/core/src/wow/areas/spells/store.test.ts
- 54 R: MSG_CHANNEL_START for self begins the channel in the cast tracker with target from the cast
- 85 R: pushback update then time 0 at the expected end finishes the self channel
- 105 R: time 0 before expected end then failure is interrupted
- 121 R: failure before time 0 marks the channel interrupted; opposite order of :105
- 134 R: second time 0 after end is ignored; one channel_end
- 148 R: endless channel ending without cancel is interrupted
- 161 R: another caster's channel leaves self state and channel untouched, emitting unit_cast events only
- 186 C packages/core/src/wow/areas/spells/unit-casts-settle.test.ts:80: same other-caster time-0 settles-to-finished branch with the tick delay

### packages/core/src/wow/areas/spells/totems.test.ts
- 64 R: SMSG_TOTEM_CREATED fills the slot with name and emits totem_created
- 96 R: slot outside 0-3 ignored, no event, no state
- 112 R: only the totem's own disappear clears the slot as gone
- 133 R: create on an occupied slot ends the old totem replaced; its later disappear does nothing
- 156 R: expires exactly at startedAt+duration with reason expired
- 174 R: duration beyond timer range does not expire at once (setTimeout overflow)
- 188 R: replaced totem's timer must not end the successor
- 204 R: disappear cancels the timer so no second gone follows
- 218 R: dispose clears every totem timer
- 230 R: destroyTotem sends the wire slot and the later disappear reads destroyed
- 250 R: empty slot refuses no_totem with nothing sent
- 263 R: invalid slot values refuse invalid_slot with nothing sent

### packages/core/src/wow/areas/spells/unit-casts-settle.test.ts
- 58 R: channel end then failure in the same tick settles interrupted not finished
- 80 R: channel end with no failure finishes only after the settle tick
- 108 C packages/core/src/wow/areas/spells/unit-casts-settle.test.ts:80: other-caster channel updates with time left are ignored (store.ts:188), so this is :80 after a no-op; no-op case at unit-casts.test.ts:362
- 127 C packages/core/src/wow/areas/spells/unit-casts-settle.test.ts:80: same flow as :80 after an ignored pushback update; 'however early' has no time check in production
- 148 C packages/core/src/wow/areas/spells/unit-casts-settle.test.ts:58: same branch as :58 (end then failure, no time dependence in production), earlier timing only
- 170 C packages/core/src/wow/areas/spells/unit-casts-settle.test.ts:80: two ignored pushback updates; production never reads them, so no 'follows last update' behavior to assert
- 191 R: dispose cancels the pending settle timer so no end fires

### packages/core/src/wow/areas/spells/unit-casts.test.ts
- 146 R: other caster's SPELL_START records entry and emits unit_cast_start with name and relevant 0
- 177 R: instant cast and own cast create no entry
- 190 R: SPELL_GO ends succeeded; second go ignored
- 214 R: SPELL_GO for an unknown caster ignored
- 224 R: FAILURE then FAILED_OTHER end it interrupted once
- 246 R: FAILED_OTHER alone interrupts via its own handler
- 261 R: failure of a different spell does not end the running cast
- 273 R: FAILED_OTHER for self is ignored
- 283 R: own interrupted cast emits cast_interrupted once with both packets
- 303 R: other caster's channel start emits entry and time 0 settles finished without touching self channel
- 345 R: endless channel of another caster creates no entry
- 362 R: channel update with time left changes nothing for other casters
- 384 R: other caster's update 0 does not end the character's own channel
- 405 R: entry expires 1000 ms after end and emits expired on the next packet
- 424 R: caster disappear drops the entry silently
- 436 R: caster targeting self or attacking it is relevant
- 457 D: relevant 0 for an unrelated caster is already asserted in unit_cast_start at unit-casts.test.ts:146
- 467 R: second start of one caster replaces its entry
- 480 R: store caps at 64 entries dropping the oldest
- 493 D: only exercises AreaStore.castOf, a test-only accessor; entry fields covered by unit-casts.test.ts:146

### packages/harness/src/areas/spells/area.test.ts
- 12 D: no contract: restates the declared worldActs array (name says two acts, array has four); world.ts types worldActs against the acts
- 20 R: mirror_image event writes no row and no fallback row
- 35 R: projectile_moved writes no row and no fallback
- 50 R: spell_visual events write no row
- 66 F: toMatchObject pins whole sentences; keep value asserts "5143" and "cancelled" (reason echo, no data) via toContain; drop the prose
- 102 F: pins full sentences; keep looked-up "Scourge Invader" and spell name "Shadow Bolt" in text (agent reads text only) via toContain; keep data, drop prose
- 156 F: pins full sentence; keep looked-up "Scourge Invader", "Drain Life" and the branch label "channelling" (vs "casting") via toContain; drop prose
- 186 F: asserts only "spell 5143"; keep it and add the caster fallback "A unit" (area.ts:114) via toContain; name promises both fallbacks
- 204 R: irrelevant casters and settled outcomes write no row
- 250 F: pins full sentences; keep mapped element "earth", name "Stoneskin Totem" and reason "gone" via toContain; drop prose
- 305 F: pins full sentences; keep branch labels "learned"/"is now"/"dropped" (no data to tell them apart) and values "1/75", "12/75"; drop other prose
- 334 R: per-skill one-minute row throttle; other skills and removals still write

### packages/harness/src/areas/spells/tool-aura.test.ts
- 40 R: cancel_aura calls act with spell id and is DONE when aura leaves state
- 55 R: numeric spell text resolves to that id
- 62 R: aura still present after an unrelated aura update reports UNCONFIRMED after 2 s
- 82 R: channel_end event for the spell settles the cancel as DONE
- 100 D: mount aura follows the same path as :40; no mount branch in tool-aura.ts; keeper tool-aura.test.ts:40
- 115 R: each act refusal reason surfaces as REFUSED with that reason
- 128 R: neither aura nor known spell refuses unknown_spell without calling act
- 138 R: known spell not worn is refused not_aura by the real act
- 146 R: missing spell argument refuses missing_spell
- 154 R: aura name resolves among worn auras when the spellbook lacks it

### packages/harness/src/areas/spells/tool-bar.test.ts
- 53 R: spell goes to zero-based wire slot and body shows the bar row
- 68 R: slot 144 maps to wire 143, upper boundary of the off-by-one
- 80 R: bag item name resolves to an item button
- 95 R: item id text needs no bag lookup and sends exactly one real packet
- 106 F: drop toContain("Cleared") prose beside DONE; keep the act(2, undefined) call and body "slot 3: empty" (1-based slot, empty label)
- 119 R: slots 0, 145, -1, 1.5 refuse invalid_slot with act uncalled
- 131 R: missing slot refuses missing_slot
- 139 R: spell plus item refuses spell_or_item
- 150 R: unknown spell and bag item refuse with distinct reasons, nothing sent
- 164 R: act refusal reason surfaces as REFUSED

### packages/harness/src/areas/spells/tool-cast.test.ts
- 53 R: no target casts on self and DONE on cast_succeeded
- 68 R: detail toContain("Wolf") is the looked-up unit name for ref u1 rendered into text; keep it, assert only "Wolf" not the sentence
- 80 R: numeric spell text casts that spell
- 87 R: unknown name or id refuses unknown_spell without casting
- 99 R: hearthstone variants refuse and point at travel hearth without casting
- 112 R: missing spell refuses missing_spell
- 118 R: unseen unit ref refuses not_seen without casting
- 131 R: object ref is not a unit target, not_seen
- 143 R: hidden higher rank skipped, highest visible rank cast
- 153 R: cast_failed reason surfaces as FAILED
- 164 R: cast_interrupted surfaces as FAILED with reason
- 175 R: core throw surfaces as FAILED with its code
- 188 R: another spell's reply does not settle the cast
- 205 R: channel start settles the cast as DONE
- 223 R: no reply within cast time plus margin is UNCONFIRMED
- 236 R: abort while waiting rejects with the stop reason

### packages/harness/src/areas/spells/tool-skills.test.ts
- 73 R: unlearn without confirm refuses needs_confirm and does not call the act
- 87 R: with confirm calls unlearnSkill and DONE when the skill leaves state
- 115 R: numeric skill id resolves without the name table
- 142 R: skill that stays is UNCONFIRMED after 3 s
- 164 R: non-profession missing from state refuses not_profession without act call
- 178 R: act refusal reasons surface as REFUSED
- 205 R: destroy earth totem calls act with slot 1 and DONE when slot clears
- 236 R: empty slot refuses no_totem through the real act
- 245 R: unknown element refuses unknown_element without act call
- 256 R: totem that stays is UNCONFIRMED after 3 s
- 278 R: replaced event is not a destroy; stays UNCONFIRMED

### packages/harness/src/areas/spells/tool.test.ts
- 19 R: minimalArgs validates against the parameter schema; drift breaks the prompt's minimal call
- 23 R: schema accepts the seven verbs and rejects unknown do and empty args; mount and dismount only covered here
- 35 F: toBe('action') restates the declared kind; keep expectSendKind as the real send-vs-kind check
- 40 R: description under 60 words and at most two guidelines; keeps prompt budget

#### Seams
- packages/core/src/wow/areas/spells/store.ts `SpellsStore.castOf` (line 279): only unit-casts.test.ts:493 calls it; production uses UnitCasts.castOf directly
- packages/core/src/wow/areas/spells/runtime.ts/store.ts: no other test-only exports found in this lane

#### Defects
- unit-casts-settle.test.ts:108,170 names promise pushback tracking ("follows the last update"); store.ts:188 ignores other-caster updates with time left, so tests assert nothing about pushback
- harness area.test.ts:12 name says two acts, asserts four

## area-talents

### packages/core/src/wow/areas/talents/catalog.test.ts
- 17 R: DBC talent/prereq layout decode; a shifted column misreads ranks or requires
- 36 R: unknown ids give undefined for all four lookups; a throw or default row would break the rules
- 44 R: TalentTab class/pet mask, page and name decode
- 57 R: talentsForClass filters by class mask and drops pet tabs
- 64 R: GlyphProperties and GlyphSlot layouts decode
- 82 R: slotForIndex maps order = index + 1; an off-by-one picks the wrong socket type
- 93 R: each missing DBC file rejects missing_spell_data
- 103 R: wrong record layout rejects missing_spell_data

### packages/core/src/wow/areas/talents/fields.test.ts
- 29 R: update-field offsets for points, glyph slot types, glyphs and enabled mask
- 49 R: complete entity reads unsent fields as 0
- 58 R: missing self entity gives undefined, not zeros

### packages/core/src/wow/areas/talents/protocol.test.ts
- 26 R: SMSG_TALENTS_INFO player form at level 1 parses to empty spec and glyphs
- 38 F: name says three ranks but sends two entries; covers a subset of 67, give it more entries or drop the claim
- 67 R: multi-spec block order and active spec decode
- 88 R: pet-form empty reply bytes and parse
- 94 R: pet-form talents decode
- 106 R: unknown type byte throws
- 121 R: CMSG_LEARN_TALENT layout
- 127 R: CMSG_LEARN_PREVIEW_TALENTS count then id/rank pairs
- 135 R: 150-entry cap boundary matches server drop
- 149 R: wipe offer parse (guid then cost)
- 157 R: no-talents guid 0 reply parses
- 165 R: truncated offer throws
- 171 R: MSG_TALENT_WIPE_CONFIRM body is the guid alone
- 180 R: CMSG_REMOVE_GLYPH layout
- 186 R: slot range check throws bad_glyph_slot

### packages/core/src/wow/areas/talents/rules.test.ts
- 29 R: no_points refusal branch
- 36 R: bad_rank above wire rank 4
- 41 R: unknown_talent refusal
- 48 R: wrong_class refusal
- 53 R: rank_held refusal
- 60 R: not_enough_points jump cost
- 67 R: needs_prerequisite
- 74 R: tier_locked row threshold
- 81 R: bad_rank when rank has no spell id
- 86 R: legal rank passes; guards over-refusal
- 119 R: orderPlan places prerequisites first
- 126 R: equal-rank tie still orders prerequisite first
- 133 R: dependent with missing prerequisite refused
- 142 R: later entries see earlier spend
- 162 R: still-illegal entries refused, never sent
- 174 R: applyEntry holds rank and spends jump cost; direct check of cost math orderPlan only shows indirectly

### packages/core/src/wow/areas/talents/runtime-glyph.test.ts
- 22 R: glyph use packet body and settle on info showing the glyph
- 42 R: bag-equipped glyph sent with the bag's equipment slot index
- 59 R: locked socket refused locally, nothing sent
- 71 R: lock rule works without the catalog
- 83 R: item without use spell is not_a_glyph
- 95 R: use spell without apply-glyph effect is not_a_glyph
- 107 R: apply-glyph effect with no GlyphProperties row is not_a_glyph
- 119 R: wrong_slot_type refusal, nothing sent
- 131 R: without catalog the type check is skipped and the server's invalid_glyph is mapped
- 152 R: three cast-failure results map to outcomes
- 165 R: failure for another spell ignored
- 178 R: other cast failure reported with its reason
- 190 R: info leaving socket empty does not settle the apply
- 203 R: busy guard blocks removeGlyph during an apply, sends nothing
- 221 R: empty item slot throws no_item
- 233 R: glyph slot range throws bad_glyph_slot
- 244 R: observed cast time extends the reply deadline
- 262 R: dispose during item template load rejects rather than not_a_glyph
- 276 R: dispose during catalog load rejects
- 290 R: silence is no_reply and waiter released
- 307 R: dispose mid-wait rejects
- 319 R: combat cast in flight gives busy, nothing sent
- 337 R: abort while template pending sends nothing
- 377 R: abort while waiting for the reply rejects

### packages/core/src/wow/areas/talents/runtime-guards.test.ts
- 67 R: packet free points beat a stale zero object field in degraded and catalog modes
- 91 R: packet zero refuses even when the field shows points
- 106 R: object field used when no packet arrived
- 122 R: dispose right after a degraded learn sends nothing and rejects
- 135 R: dispose during a delayed DBC load rejects at once
- 160 R: DBC load settling after disposal sends nothing

### packages/core/src/wow/areas/talents/runtime-reset.test.ts
- 58 R: no gossip dialog throws gossip_not_open, nothing sent
- 70 R: unlisted option throws option_not_offered
- 82 R: select packet fields, confirm to offered guid, reset outcome
- 110 R: cost above maxCost returns too_expensive, no confirm
- 126 R: cost equal to maxCost boundary confirms
- 144 R: zero cost still confirms and reports 0
- 165 R: guid-0 reply to the option is nothing_to_reset, no confirm
- 178 R: payment failure gives not_enough_money, not nothing_to_reset
- 193 R: unrelated buy failure noise does not turn guid-0 reply into not_enough_money
- 215 C packages/core/src/wow/areas/talents/runtime-reset.test.ts:193: same post-confirm guid-0 branch with no buy error; 193 asserts the same outcome with noise
- 229 R: payment failure state does not leak into the next reset
- 248 R: no offer in window is no_reply and act released
- 264 R: no answer to confirm is no_reply
- 279 R: busy guard across learn and reset in flight
- 297 R: learn in flight blocks reset before any select is sent
- 313 R: dispose mid-wait rejects
- 325 R: abort awaiting the offer rejects and later offer sends no confirm
- 346 R: abort after offer before confirm sends nothing

### packages/core/src/wow/areas/talents/runtime-unglyph.test.ts
- 15 C packages/core/src/wow/areas/talents/runtime-glyph.test.ts:203: same removeGlyph-during-apply busy assertion; "slot is kept" is never asserted
- 29 R: empty socket gives slot_empty, nothing sent
- 42 R: out-of-range socket gives slot_empty, nothing sent
- 53 R: removal sends index and resolves on info showing 0
- 69 R: info still showing the glyph does not settle the removal
- 85 R: silence is no_reply after window

### packages/core/src/wow/areas/talents/runtime.test.ts
- 85 R: single learn sends CMSG_LEARN_TALENT and resolves learned on matching reply
- 108 R: multi entry plan sends one preview packet with both
- 141 R: pet-form packet does not settle the wait
- 172 R: reply lacking the rank gives refused_by_server
- 188 R: five seconds without a reply is no_reply
- 210 R: local refusal sends nothing and emits refused event
- 233 R: second learn in flight throws talent_request_busy
- 256 R: catalog() resolves undefined without a DBC source
- 266 F: name claims the wrong-class refusal but the entry is unknown_talent 9999; use talent 3 for wrong_class or fix the name
- 293 C packages/core/src/wow/areas/talents/runtime.test.ts:323: 323 asserts the same exact LEARN body and learned outcome with catalog true
- 323 R: mixed plan with catalog reports learned plus unknown_talent and emits refused
- 370 R: degraded mixed plan refuses bad rank and reports the sent entry
- 406 R: degraded mixed plan with no reply gives no_reply plus refusal
- 439 R: partly successful preview marks the missing entry refused_by_server
- 465 R: oversized plan rejects too_many_talents and leaves no dangling waiter
- 485 R: failed send rejects and leaves no dangling waiter

### packages/core/src/wow/areas/talents/store-wipe.test.ts
- 36 R: wipe offer held with cost and emitted
- 53 R: guid-0 reply clears the offer and emits wipe_refused
- 68 R: player-form info clears the offer, pet form does not
- 81 R: offer expires at the ttl boundary without a timer
- 96 R: not-enough-money buy error during reset recorded
- 107 R: buy error outside a reset or other result code ignored
- 121 R: purchase failure with vendor or item is not a reset payment failure
- 140 R: payment failure does not leak into the next reset

### packages/core/src/wow/areas/talents/store.test.ts
- 38 R: first player packet is stored and diffed against empty state
- 67 R: repeat packet yields empty diff
- 87 R: rank gain and loss appear in the diff
- 115 R: point increase emits info then points
- 138 R: fewer points emit no points event
- 156 R: pet form fills pet only and emits pet_info
- 187 R: packet before the self entity exists is kept
- 225 R: slot type, unlock bit and active-spec glyph derivation
- 257 F: name says every slot but only the first slot is asserted; assert all six slots
- 267 R: packet with no spec leaves glyphs undefined
- 283 F: copy claim is vacuous (entries compared after, never mutated); mutate the input then assert the event is unchanged

#### Seams
- packages/core/src/wow/areas/talents/catalog.ts `TALENT_LAYOUTS`: catalog.test.ts iterates it, also used by dbc-files.ts
- packages/core/src/wow/areas/talents/rules.ts `applyEntry`: exported, direct caller is rules.test.ts
- packages/core/src/wow/areas/talents/store.ts `WIPE_OFFER_TTL_MS`, runtime.ts `RESET_ANSWER_MS`, runtime-glyph.ts `GLYPH_ANSWER_MS`: exported, tests import them for fake-time windows

#### Defects
- none

### packages/harness/src/areas/talents/area.test.ts
- 24 F: drop the sentence pin "3 talent points free."; keep event/data and assert text contains the count with noun ("3 talent points"); 3 is echoed but the noun is rendered
- 41 F: drop toBe "Learned talent 1862 rank 2."; id and rank 2 are already in data (echoed, not computed), so keep event/data only
- 63 F: drop the sentence pin; keep toContain("1g") (cost computed from 10000 copper) and toContain("u64") (npc name looked up by refOf, not in data)
- 75 F: drop the sentence pin; count is echoed in data, keep event/data and at most toContain("3 points") for the plural noun branch
- 92 R: unchanged info writes nothing
- 98 R: wipe_refused writes nothing
- 104 R: points rise with no lost ranks is not a reset, writes nothing
- 119 R: paired points event suppressed after a reset (stateful memo)
- 142 R: later points rise after a reset still logs
- 167 F: keep toContain("slot 2") and ("slot 1") (computed slot+1 rendered) and "cleared" (the agent sees no data, so it is the branch label); drop "43395" (echoed, in data)
- 189 R: reset keeps both reset and glyph rows in order

### packages/harness/src/areas/talents/tool-glyph.test.ts
- 107 R: glyph maps 1-based slot to 0-based, bag/slot call, DONE and kind in detail
- 124 R: kind word picks the open slot of that kind
- 138 R: kind word prefers empty over filled
- 159 R: kind word without catalog refused with nothing sent
- 169 F: name says "or a locked kind" but only 0, 7, "huge" run; add a locked-kind case and assert the reason, not just Refusal
- 182 R: missing_item / missing_slot reasons
- 200 F: only asserts a Refusal class; assert the reason so an unrelated refusal cannot pass
- 213 R: ambiguous name refused, bag/slot form resolves
- 234 R: bag item slot uses that bag number
- 250 F: loop asserts REFUSED and reason; title says "the item stays" and nothing checks it
- 269 R: invalid_glyph next proposes the other slot
- 280 R: duplicate label retry uses resolved bag and slot
- 307 R: failed cast surfaces the server reason with REFUSED
- 317 R: no_reply maps to UNCONFIRMED
- 326 R: act runs inside world mutex, ordering asserted
- 345 R: abort while queued sends nothing
- 367 R: act signal follows tool abort
- 387 R: act rejection propagates
- 400 R: unglyph sends 0-based slot and DONE
- 409 R: slot_empty outcome REFUSED
- 416 R: unglyph no_reply UNCONFIRMED
- 425 R: unglyph slot validation refused without send
- 435 R: unglyph abort while queued clears nothing
- 459 R: schema accepts numeric or word slot

### packages/harness/src/areas/talents/tool-learn.test.ts
- 14 F: keep data asserts; of the text asserts keep "rank 1" and add "rank 2" for row 0 (computed entry.rank+1 rendered); drop 124, reason words, not.toBe (echoed, in data)

### packages/harness/src/areas/talents/tool.test.ts
- 145 R: minimalArgs hint must pass the schema; agent sees it in error hints
- 154 D: wantsOf is an exported private helper; boundary keepers tool.test.ts:213 (single and plan) and :273
- 164 D: tests the shared expectSendKind helper (define.test.ts:493); sends-nothing already asserted by tool.test.ts:170
- 170 R: show lists points, specs, talents, slots and sends nothing
- 187 R: degraded show prints ids and the names hint
- 196 R: degraded glyph and slot-type labels as ids, not spells
- 213 R: numeric id accepted alone and in plan, bad ids rejected
- 247 R: line cap keeps every talent and glyph slot
- 273 R: name resolves, 1-based rank converts, DONE
- 286 R: digits-string id in degraded mode
- 296 R: names_need_talent_data refusal
- 306 R: ambiguous_name refusal
- 324 R: tier_locked REFUSED with reason and tab count
- 341 R: id past uint32 refused unknown_talent, nothing sent
- 352 R: max uint32 id accepted
- 361 R: outcomes matched by talent and rank when core reorders
- 388 R: duplicate_entry refusal
- 405 R: cancel during catalog load sends nothing
- 424 R: cancel while mutex busy sends nothing

#### Seams
- packages/harness/src/areas/talents/tool.ts `wantsOf`: exported; only tool.test.ts:154 imports it outside tool.ts (keep alive by that D)

#### Defects
- none

## area-threat

### packages/core/src/wow/areas/threat/area.test.ts
- 27 R: wires HIGHEST_THREAT and THREAT_UPDATE into the table, share, pull thresholds and event order through the real packets
- 73 R: SMSG_THREAT_REMOVE of the victim drops the entry and the victim, emits removed
- 103 R: SMSG_THREAT_CLEAR deletes the table and emits cleared through the wire
- 124 R: AI_REACTION keeps ALERT and then HOSTILE as the unit's last reaction, no petReaction
- 163 R: a reaction from the commanded pet sets petReaction via the combat store
- 186 R: SMSG_BREAK_TARGET emits target_broken (hostileOnly false) and leaves state untouched
- 206 R: SMSG_CLEAR_TARGET emits hostileOnly target_broken and both reach the world event bus
- 232 D: bus forwarding of a threat event is already asserted by area.test.ts:206 (area/event names); keeper area.test.ts:206

### packages/core/src/wow/areas/threat/protocol.test.ts
- 27 R: THREAT_UPDATE keeps wire order and consumes the whole body
- 49 R: THREAT_UPDATE against reference bytes (packed unit guid, count, packed victim, uint32 threat)
- 63 R: HIGHEST_THREAT_UPDATE reads the new victim after the unit
- 78 R: count 0 reads no entries
- 85 R: THREAT_REMOVE reads unit then victim
- 93 R: THREAT_CLEAR reads the unit
- 102 D: HOSTILE code 2 parse repeats protocol.test.ts:124 (every code) and the byte layout at :113; keeper protocol.test.ts:113
- 113 R: AI_REACTION against reference bytes (full 8-byte guid, uint32 reaction)
- 124 R: all five AiReaction codes map to names
- 140 R: an unknown reaction code keeps its number and does not throw
- 149 R: BREAK_TARGET reads a packed guid and consumes the body
- 156 R: CLEAR_TARGET reads a full 8-byte guid

### packages/core/src/wow/areas/threat/runtime.test.ts
- 52 R: a unit that disappears loses its table
- 62 R: zero-health update forgets the table; living units and updates with maxHealth 0 keep it
- 87 R: a far teleport (SMSG_NEW_WORLD) drops every table

### packages/core/src/wow/areas/threat/store.test.ts
- 60 D: empty initial snapshot is also asserted in area.test.ts:186 (empty state toEqual); keeper area.test.ts:186
- 68 R: a highest update sets the victim and a later list update without a new victim keeps it
- 95 R: an update replaces the whole entry list
- 115 R: entries sort by threat with pct of top and 110%/130% pull thresholds
- 139 R: no victim, or victim off the list, gives no pullAt
- 155 R: empty list and zero top threat avoid division by zero
- 170 R: a remove deletes one entry and clears the victim when it was the victim
- 191 D: clearTable deleting the table repeats area.test.ts:103 and the cleared event at store.test.ts:218; keeper area.test.ts:103
- 202 R: forget drops one table silently and clear drops all, with no events
- 218 R: event sequence table, victim_changed, removed and cleared, with duplicate victim not re-emitted
- 271 R: snapshots and events are copies; mutation does not change the store
- 286 R: dispose drops the listeners
- 295 R: keeps the last reaction per unit, emits reaction for each, unknown code kept
- 325 R: a reaction from the pet in the summon field sets petReaction
- 337 R: with no summon field the last pet command names the pet
- 349 R: the summon field wins over an older pet command
- 357 C packages/core/src/wow/areas/threat/area.test.ts:206: same breakTarget/clearTarget events and untouched state, asserted through the real packets there and at :186
- 372 R: forgetting the pet drops petReaction
- 382 R: forget drops one unit's reaction and clear drops every reaction

### packages/harness/src/areas/threat/area.test.ts
- 54 R: table, removed, cleared, hostile reaction and a break for an unengaged unit give no row (flood guard)
- 74 D: asserts glyph "combat" and worldActs [], restating the area declaration; no contract
- 81 F: whole-draft toEqual pins the sentence "is fighting you"; the unit name is copied from the event and data.name already asserts it; keep class wake, name engaged, ref, guid, data and the second-call [], drop the text line (no computed value in this sentence)
- 96 R: inside a run the engaged row is a log row
- 101 R: a table that does not hold the character gives no row
- 105 R: a victim_changed to the character is the engagement, logged once
- 117 R: removal of the character or a clear resets engagement; a pet removal does not
- 137 F: aggro_switch pet to character pins the full sentence; data holds only guids, so the looked-up names are the contract: keep class log, name, data fromVictim/toVictim, and assert text toContain "Cat" (pet name from lookup) and "to you" (self substitution); drop the rest of the sentence
- 157 F: keep class wake and name aggro_switch; text is the only carrier of the looked-up from-name and the self substitution, so assert toContain "Mate" and "to you" instead of the whole sentence; drop the sentence wording
- 167 F: keep class log and name aggro_switch; assert text toContain "from you" (self substitution) and "Cat" (looked-up pet name) instead of the whole sentence; drop the sentence wording
- 177 R: a switch between players on an unengaged unit gives no row
- 181 R: on an engaged unit player switches log, creature to creature does not
- 200 F: pull_warning sentence pin; keep class, name and data mine/pullAt/victim/victimThreat, and the engaged-then-warn-once order; also keep the computed values in text: toContain "99%" (rounded share) and "Mate" (victim name looked up, absent from data); drop the rest of the sentence and the 110%/130% boilerplate
- 223 R: a new victim re-arms the pull warning
- 233 R: no warning for pet, self or creature victims
- 244 F: pins "noticed you." sentence; the unit name is copied from the event and data.name asserts it; keep class wake, name alerted, data and ref, drop the text line
- 273 F: pins "vanished from targeting" sentence; the name is copied from the event and data.name asserts it; keep class log, name target_lost, data hostileOnly and the once-only [], drop the text line
- 293 R: a target break on an unengaged unit gives no row

### packages/harness/src/areas/threat/reads.test.ts
- 52 R: engagedWith lists every unit whose table holds the guid, used by look.ts and danger.ts
- 58 R: aggroOn lists units whose victim is the guid, including an empty-entry table
- 64 R: threatOf returns the entry with its share and the unit's pullAt
- 74 R: threatOf is undefined for an unknown unit, a guid not in the table, or an empty table
- 80 R: unitThreat reports fightingMe, aggro name or "you" and share; undefined for an unknown unit

#### Seams
- none found; reads.ts exports are used by harness/src/tools/look.ts and harness/src/ops/danger.ts

#### Defects
- none

## area-time

### packages/core/src/wow/areas/time/protocol.test.ts
- 18 R: decodes SMSG_LOGIN_SETTIMESPEED packed time and float speed against an independent bit-packing writer; a shifted field misreads the clock
- 26 R: decodes SMSG_QUERY_TIME_RESPONSE server time and daily reset order
- 37 R: decodes SMSG_WORLD_STATE_UI_TIMER_UPDATE game time and throws on a truncated body
- 47 R: truncated login-speed and query-response bodies throw; covers the two parsers 37 does not

### packages/core/src/wow/areas/time/runtime.test.ts
- 32 R: query sends an empty CMSG_QUERY_TIME and resolves with the reply state and receivedAt
- 50 R: query times out at exactly 5 s and a wrong-opcode packet does not resolve it
- 69 R: login_verified sends exactly one CMSG_QUERY_TIME; new_world does not resend; reply lands in state
- 83 R: requestUiTime sends an empty request and resolves with uiTime/uiTimeAt
- 104 R: concurrent requestUiTime calls coalesce into one packet; a later call sends a new one
- 123 R: requestUiTime times out at 5 s and ignores the query-time reply
- 141 R: login sends no UI timer request after login_verified sent a query; guards a mis-wired trigger
- 151 R: dispose rejects a pending query with AbortError
- 158 R: dispose releases the login_verified subscription; a leak would query on a dead session (fake core, call-shape but the only leak check)

### packages/core/src/wow/areas/time/store.test.ts
- 24 D: restates the declared initial state; toEqual treats undefined as absent; keeper store.test.ts:61 asserts every field after packets
- 36 R: receiveUiTime stores uiTime/uiTimeAt, keeps game time, emits ui_time with a detached state
- 61 R: receiveSetSpeed stores game time and speed, stamps receivedAt, emits a detached set_speed state
- 79 R: receiveQueryReply stores reset timer, keeps game time, stamps receivedAt, emits query_reply
- 100 C packages/core/src/wow/areas/time/store.test.ts:61: snapshot-is-a-copy is already asserted by the detach mutations in 61 and 36
- 110 R: dispose clears listeners so later packets emit nothing
- 121 R: area wiring routes SMSG_LOGIN_SETTIMESPEED and SMSG_QUERY_TIME_RESPONSE through the parsers into handle state
- 149 R: handle.onEvent receives the store event; the only test of the public handle subscription for this area

### packages/harness/src/areas/time/area.test.ts
- 42 R: attach turns stored state into one time/synced log row with the formatted game time and data keys
- 64 R: attach writes no row before the server sent any time
- 70 R: query_reply row carries dailyResetInSec while set_speed row does not; source key differs
- 91 R: ui_time event writes no row
- 99 D: restates the worldActs constant; keeper packages/harness/src/areas/time/area.test.ts:124 drives requestUiTime through the world service and 105 query
- 105 R: query refuses not_owner after the claim is lost and sends nothing
- 113 R: query refuses offline with no session and sends nothing
- 124 F: drop the redundant typeof-function assertion; the call itself proves it; keep the one-packet and timeout checks
- 145 R: session.areas.time.state() returns a frozen copy equal to handle state

#### Seams
- packages/core/src/wow/areas/time/runtime.ts `TIME_QUERY_TIMEOUT_MS`: exported; only core/test-support/mock-handle.test.ts imports it, not this lane's tests

#### Defects
- none

## area-trade

### packages/core/src/wow/areas/trade/protocol.test.ts
- 27 R: status 22 is wrong_realm (AzerothCore SharedDefines), not wowm's name; the status name is agent-facing
- 31 R: unknown status gets `trade_status_<n>`; the refusal reason key must not be undefined
- 37 R: BEGIN_TRADE layout u32 status + u64 trader; a wrong width loses the requester guid
- 51 R: OPEN_WINDOW reads a u32 trade id, layout against TradeHandler.cpp
- 67 R: CLOSE_WINDOW u32 result, u8 target flag, u32 limit item; a misorder misreports the refusal
- 85 R: status 22 reads a u8 slot; skipping it would desync later bytes
- 92 C packages/core/src/wow/areas/trade/protocol.test.ts:102: name promises no leftover bytes but asserts only status; NO_TARGET remaining is checked there
- 102 R: every status branch consumes the whole body; catches an unread field
- 119 R: CMSG_INITIATE_TRADE writes the u64 guid, reference bytes
- 125 R: begin/busy/ignore/cancel write empty bodies as the server reads
- 150 R: SMSG_TRADE_STATUS_EXTENDED full slot layout incl. gems, wrapped, durability; field order bugs
- 183 R: all-zero slot is empty, gives no item, body fully consumed
- 192 R: slot index kept across empty slots (0 and 6); an index reset would misplace items
- 207 R: truncated body returns undefined instead of throwing
- 216 R: CMSG_SET_TRADE_ITEM byte layout u8 slot, u8 bag, u8 slot
- 220 R: CMSG_CLEAR_TRADE_ITEM one u8
- 224 R: CMSG_SET_TRADE_GOLD u32 copper LE
- 228 R: CMSG_UNACCEPT_TRADE empty body
- 232 R: CMSG_ACCEPT_TRADE writes u32 1 as the wire expects

### packages/core/src/wow/areas/trade/runtime-offer.test.ts
- 22 R: offerItem sends SET_TRADE_ITEM and records the own slot from inventory
- 44 R: refuses slot 6, empty and equipped position and sends nothing; slot and position validation
- 73 R: equipped bag positions 19-22 boundary refused, nothing sent
- 96 R: duplicate item in another trade slot is rejected before the server would drop it
- 111 R: withdrawItem sends CLEAR_TRADE_ITEM and clears own state
- 130 R: offerGold sends SET_TRADE_GOLD, refuses over the coinage
- 156 R: stale accept version throws offer_changed and sends nothing (anti-scam guard)
- 173 R: acceptTrade sends ACCEPT, sets selfAccepted, settles ok on TRADE_COMPLETE
- 194 R: accept settles refused on CLOSE_WINDOW after the send
- 214 R: accept settles refused on TRADE_CANCELED without waiting for a timeout
- 234 R: a new request can start after a completed trade; covers store.test.ts:353 through the act
- 252 R: accept with no trade open throws
- 261 R: unaccept throws before accept, sends UNACCEPT after, clears selfAccepted

### packages/core/src/wow/areas/trade/runtime-send.test.ts
- 102 R: failed initiate send releases the waiter, no unhandled rejection, retry works
- 127 R: failed busy answer releases the waiter and keeps requested_in
- 148 R: cancel send that throws at the 60 s timeout still settles and frees the phase
- 183 R: failed auto-busy send at 60 s releases the request instead of stalling

### packages/core/src/wow/areas/trade/runtime-settling.test.ts
- 42 R: settling phase after the request timeout refuses a new requestTrade as busy, sends nothing
- 60 R: TRADE_CANCELED ends settling and a new request completes; absorbs runtime.test.ts:165
- 77 R: 5 s settling boundary (4998 vs 5000 ms); absorbs runtime.test.ts:137
- 92 R: refusal/opening during settling is dropped and counted
- 111 R: local cancel during a request enters settling, refuses busy, then settles both
- 137 R: no reply in 5 s settles cancel unanswered, one CANCEL sent, next request works
- 166 R: an opening while cancel is unanswered does not settle the request ok
- 190 R: incoming BEGIN_TRADE settles the outgoing request superseded
- 208 R: the incoming request's opening never settles the old request ok
- 227 R: BEGIN_TRADE while settling ends settling and the 5 s timer does not clobber requested_in

### packages/core/src/wow/areas/trade/runtime.test.ts
- 30 R: requestTrade sends INITIATE_TRADE with guid and settles ok on OPEN_WINDOW
- 51 C packages/core/src/wow/areas/trade/runtime.test.ts:71: same refused-status branch; add no_target as a row there; also unused events array
- 71 R: refused statuses settle refused with name and return phase to idle
- 95 R: no OPEN_WINDOW in 60 s sends CANCEL and settles unanswered
- 116 R: local cancel of a pending request settles refused, not ok
- 137 C packages/core/src/wow/areas/trade/runtime-settling.test.ts:77: same 60 s then 5 s idle sequence, settling:77 asserts the boundary
- 165 C packages/core/src/wow/areas/trade/runtime-settling.test.ts:60: same setup and assertion, settling:60 also checks the follow-up request
- 188 R: after timeout and settle, a second request takes TRADE_CANCELED as refused and closes
- 219 R: BEGIN_TRADE after timeout starts fresh, busy answer settles on the cancel
- 252 R: requestTrade throws while a trade is in progress
- 265 R: answer yes sends BEGIN_TRADE only in requested_in and settles on OPEN_WINDOW
- 283 R: answer busy/ignore send their opcodes with empty bodies and settle refused on the reply
- 313 R: answer outside requested_in throws no_request (status code)
- 323 R: unanswered incoming request is auto-answered busy at 60 s
- 340 R: answering clears the auto-busy timer so no second BUSY is sent
- 365 R: cancelTrade sends CANCEL in open, requested_in, requested_out and settles ok
- 402 R: cancelTrade with no trade throws

### packages/core/src/wow/areas/trade/store.test.ts
- 15 R: BEGIN_TRADE sets requested_in with trader and emits requested
- 34 R: OPEN_WINDOW after own request sets open and emits opened
- 54 R: TRADE_CANCELED in requested_out closes with canceled event through dispatch; keeper for store.test.ts:114
- 101 R: BUSY/IGNORE_YOU during requested_out close as canceled with lastOutcome
- 114 C packages/core/src/wow/areas/trade/store.test.ts:54: same TRADE_CANCELED during a request, same closed+canceled assertion
- 122 R: stray TRADE_CANCELED in idle changes nothing, counts dropped
- 132 R: BEGIN_TRADE after abandon starts a fresh requested_in
- 149 R: CANCELED/BUSY/IGNORE_YOU in requested_in close as canceled
- 176 R: refusal statuses set lastOutcome refused with name and emit refused; per-status name mapping
- 205 R: refusal frees requested_out back to idle with no partner
- 224 D: asserts only dispatch.has for the opcode; every inject test in this file proves registration; keeper store.test.ts:15
- 233 R: their EXTENDED replaces theirOffer, bumps version, emits offer_changed
- 258 R: own-side EXTENDED kept as ownEcho, ownOffer untouched, no event
- 280 R: BACK_TO_TRADE clears both accept flags and bumps version, so a stale accept is refused
- 303 R: TRADE_ACCEPT sets theyAccepted and emits they_accepted
- 320 R: TRADE_COMPLETE snapshots gave/got offers into completed outcome and event
- 353 C packages/core/src/wow/areas/trade/runtime-offer.test.ts:234: same contract at the real boundary, a new request starts after completion
- 369 R: CLOSE_WINDOW records equipResult, limitItem and targetError in the refused outcome

### packages/harness/src/areas/trade/area.test.ts
- 22 R: requested becomes a wake draft in the trade domain with the player name
- 37 R: opened and offer_changed are log rows
- 58 R: they_accepted, canceled, refused wake; completed is a progress log row; class contracts
- 82 R: completed row omits the non-traded slot 6 from what was received
- 107 R: back_to_trade writes no row
- 113 D: copied worldActs list; keeper packages/harness/src/areas/registry.test.ts:45 checks each worldActs name is a real core act

### packages/harness/src/areas/trade/tool-fix2.test.ts
- 13 R: a waiting give does not hold the world mutex; cancelling the run cancels the request
- 38 R: give cancels the opened trade when a later offer fails
- 51 F: name promises no duplicate-slot error but mocks never error; assert withdrawItem ordered before the offerItem calls
- 73 R: declining where the server cancels settles DONE
- 84 F: same decline branch as 73 with reason busy; DONE already proves the branch, drop the `toContain("Declined")` prose, keep status DONE

### packages/harness/src/areas/trade/tool-result.test.ts
- 57 R: accept after a completed trade reports both sides' items with names and counts
- 66 F: the "nothing" is the computed empty-list fallback in transferText with no code to tell it apart; keep `gave nothing` (tight), drop other prose
- 81 R: give path reports the completed trade, a different call site (tool-give.ts:171)
- 117 R: accept waits for late item names instead of printing ids; timing contract
- 129 C packages/harness/src/areas/trade/tool-result.test.ts:117: same wait in the shared completedText, only the entry tool differs
- 143 R: after the wait expires the text falls back to the item id
- 153 R: an aborted run stops waiting and still answers
- 166 R: show path waits for late names for the past trade
- 189 R: slot 6 non-traded item not reported as received through accept
- 198 R: same slot 6 guard on the show path (different call site)
- 207 F: drop the toContain("No trade is open") sentence (no_trade branch label, negatives tell open from closed); keep not-printed "their offer"/"version"
- 221 F: only test asserting the "Last completed trade" past-vs-current label (lastCompletedLine, no code tells it apart); keep that label and "20 Tough Jerky"

### packages/harness/src/areas/trade/tool.test.ts
- 29 R: the minimal args validate against the schema; schema drift catch
- 40 R: show sends nothing and prints both offers, version and flags the agent parses
- 59 R: give request/offer/gold/accept call order and slot args at the harness-core boundary
- 82 R: give offers the whole stack, reports count
- 94 R: equipped_item refusal, nothing requested
- 105 R: no_such_item refusal, nothing requested
- 116 R: ambiguous_item refusal for a shared name
- 131 R: bag/slot selector picks one same-name stack and offers its position
- 146 D: same ambiguous-name setup as 116; reason ambiguous_item proves the branch, "bag and slot" is a hardcoded example sentence (wording); keeper tool.test.ts:116
- 162 R: too_many_items refusal above 6
- 177 R: too_far refusal
- 189 R: not_seen refusal
- 201 R: refused request returns trade_refused without offering
- 218 R: answer yes/busy map to answerTrade args
- 227 R: offer matches named items and gold, withdraws the rest
- 248 R: accept passes the last seen version
- 259 R: offer_changed error maps to reason offer_changed
- 273 R: cancel calls cancelTrade
- 280 R: a waiting give registers a run of kind trade
- 293 R: the tool sends inside the world mutex, per the shared send-kind rule
- 297 R: show output stays within the 13-line cap
- 305 R: no_request refusal sends nothing
- 314 D: yes with requested_in is already asserted by tool.test.ts:218; keeper tool.test.ts:218

#### Seams
- none

#### Defects
- none

## area-transports

### packages/core/src/wow/areas/transports/area-lift.test.ts
- 71 R: READY lift with pause time holds at base pose; a wrong state mapping would move a docked lift
- 85 R: ACTIVE lift rises to the pause point then holds; catches pause clamp errors
- 101 R: state change at the pause point resumes the lift from there
- 119 R: state change before the pause point returns the lift at once; wrong reset logic shows a moving pose
- 137 R: pause 0 cycles forever; a pause-check bug would hold the lift
- 153 R: parent rotation with omitted w decodes as a half turn (x 4 -> 6); a wrong w default flips the offset direction
- 174 R: lift without template has no pose; distinct lift branch from area.test.ts:128 (motion)

### packages/core/src/wow/areas/transports/area.test.ts
- 21 R: poseAt advances stored progress by elapsed time to an accelerating-spline x; stale progress would misplace the transport
- 56 R: pose inside the stop window waits at the node (not moving)
- 90 R: uint32 progress near 2^32 wraps by period; a missing wrap gives a bogus pose
- 128 R: motion transport with no template yields undefined, not a crash
- 151 R: no DBC data yields undefined
- 169 R: unknown guid yields undefined

### packages/core/src/wow/areas/transports/lift.test.ts
- 31 R: animation rows grouped per entry and sorted by time segment
- 37 R: duplicate time segment keeps the later row
- 50 R: wrong DBC layout rejected with "unsupported layout"
- 66 R: offset interpolation between nodes
- 72 R: progress wraps at total time
- 77 R: below first node time no pose (stationary)
- 82 R: offset rotated by path rotation angle; wrong rotation sign misplaces lift
- 98 R: empty animation yields no pose; guards a nodes[0] crash
- 102 R: animated rotation advances orientation by quaternion angle
- 135 R: last rotation node wraps back over the animation period

### packages/core/src/wow/areas/transports/path.test.ts
- 38 R: taxi path rows grouped by path and ordered by node index, actionFlag kept
- 53 R: wrong DBC layout rejected
- 65 R: period is last departure time in ms
- 69 R: progress 0 waits at first stop with path heading
- 75 R: stop window boundaries 4999/5000 switch moving flag
- 82 R: moving pose follows accelerating spline numerically
- 89 R: mid node reached at full speed at its arrival time
- 95 R: last stop waits for node delay
- 101 R: progress wraps by the period
- 109 R: fewer than two nodes yields no model
- 119 R: zero speed or acceleration yields no model (division guard)
- 125 R: map change segments teleport between maps; checks both map ids and positions

### packages/core/src/wow/areas/transports/protocol.test.ts
- 15 R: type 15 template query body decoded to taxi path, speed, accel, map
- 35 R: type 11 template carries only the pause time
- 56 R: non-transport game object types rejected
- 63 R: missing template row is not a transport

### packages/core/src/wow/areas/transports/runtime.test.ts
- 50 R: board refuses transport_data_missing without data; agent-facing reason code
- 64 R: board refuses not_docked while moving; agent-facing reason code
- 84 R: map_change event derived from transfer_pending transport fields
- 105 R: board and leave through control write boarded/left events, opcodes sent, leave again refused not_boarded
- 139 R: poseAt with offset equals pose the clock reaches later

### packages/core/src/wow/areas/transports/store.test.ts
- 45 R: transport create records progress, kind, receivedAt and emits transport_seen
- 63 R: create takes self map, not peek placeholder
- 78 R: second create replaces progress and resets receive clock
- 101 R: lift create records kind lift and parent rotation
- 123 R: non-transport guid create ignored
- 142 R: destroy and out-of-range remove transports and emit transport_gone
- 174 F: name promises "path and speed" but asserts only taxiPathId and mapId; assert moveSpeed too and drop the dead `void NODES`
- 194 R: missing template query row does not store a template through the area wiring
- 207 R: DBC source loads data to ready
- 221 R: no DBC source leaves data missing

### packages/harness/src/areas/transports/area.test.ts
- 17 F: toEqual pins static prose ("A transport came into view.", "left view.") beside name/data; no rendered value in text. Keep class/name/data (guid hex), drop text
- 40 F: toEqual pins static prose ("Boarded a transport." etc.); text renders no looked-up value (entry/maps only in data). Keep class/name/data (entry, guid, fromMap, toMap), drop text

### packages/harness/src/areas/transports/stops.test.ts
- 22 R: names nodes in range on same map only; other map yields none
- 29 R: stop matches node name by part, case-insensitive, blank never matches
- 37 R: missing TaxiNodes.dbc rejects with the file name
- 45 R: only actionFlag stop frames are read per path

#### Seams
- none

#### Defects
- none

## area-travel

### packages/core/src/wow/areas/travel/catalog.test.ts
- 26 R: loads TaxiNodes/TaxiPath DBC rows (id, map, pos, name, from/to/price); a wrong column index breaks every route
- 39 R: missing TaxiNodes.dbc rejects missing_taxi_data; agent-facing code
- 47 R: missing TaxiPath.dbc rejects missing_taxi_data; second source file, separate branch
- 57 R: cheapest chain over known nodes with summed list price; wrong edge weights pick the wrong flight
- 67 C packages/core/src/wow/areas/travel/taxi-runtime.test.ts:379: one-hop route [82,83]/210 is asserted through planFlight there; no new branch
- 77 F: name says undefined but the middle assertion expects a defined reverse route; split it out, keep the unknown-node and unreachable undefined cases
#### Seams
- none
#### Defects
- none

### packages/core/src/wow/areas/travel/flight-runtime.test.ts
- 82 R: two-node known route sends CMSG_ACTIVATETAXI and settles ok on ERR_TAXIOK, phase flying
- 109 R: three-node route switches to ACTIVATETAXIEXPRESS; wrong opcode for multi-hop is rejected by the server
- 141 R: refusal code settles refused with the short name and phase returns idle
- 162 R: 5 s silence settles no_answer; timeout path and idle recovery
- 187 R: teleport correction with no reply settles ok instant (server skips the reply); observable race
- 215 R: pre-send refusals (short route, unknown node, broken edge, flight_active) with no extra packet
- 261 R: unknown mask still sends the packet and relays server not_visited; guards against false local refusal
- 285 R: unchecked/express sends a node outside the known mask; escape hatch contract
- 320 R: failed send releases the waiter and timers and a retry works; error recovery
- 362 R: two un-awaited activations send one packet, the other refuses flight_active; concurrency guard
- 388 R: dispose during catalog load sends nothing and leaves idle
- 414 R: dispose aborts a pending flight wait and returns phase to idle
#### Seams
- none
#### Defects
- none

### packages/core/src/wow/areas/travel/protocol.test.ts
- 39 R: SMSG_BINDPOINTUPDATE field order and type widths vs AzerothCore writer
- 45 R: SMSG_PLAYERBOUND full 64-bit binder guid plus area
- 53 R: SMSG_BINDER_CONFIRM is guid only; guards against adding the wowm Area field
- 59 R: short bodies throw instead of misreading
- 75 R: CMSG_BINDER_ACTIVATE is the 8-byte guid
- 96 R: SMSG_SHOWTAXINODES guid, current node and known bit mask (bit index off-by-one risk)
- 108 R: empty mask yields no known nodes
- 121 R: SMSG_TAXINODE_STATUS guid plus bool, both values
- 135 R: short taxi bodies throw
- 146 R: three taxi builders each write the 8-byte guid
- 156 R: benchmark mode is one u8, both values
- 163 R: every ERR_TAXI code name plus unknown_N; agent-parsed reason keys
- 193 R: CMSG_ACTIVATETAXI guid, from, to order
- 200 R: CMSG_ACTIVATETAXIEXPRESS guid, count, node list
- 212 R: CMSG_MOVE_SPLINE_DONE packed guid, movement info, spline id
#### Seams
- none
#### Defects
- none

### packages/core/src/wow/areas/travel/runtime.test.ts
- 30 R: bindActivate sends the binder packet and settles ok with the new home and lastBound
- 59 R: 5 s silence settles no_answer and clears bindPending; boundary 4999/5000 ms
- 75 R: second bind while pending refuses busy with no extra send
- 94 R: dispose rejects a pending bind with AbortError
- 100 R: bind's trainer-buy packet for spell 3286 must not complete a pending train; no other test covers it (owner is trainer-store)
#### Seams
- none
#### Defects
- none

### packages/core/src/wow/areas/travel/store.test.ts
- 41 R: initial state shape; a missing field would break consumers
- 67 R: bind point update with no bind pending sets home and emits reason login
- 81 R: binder confirm records the offer and the next bind update clears it
- 102 R: offer expires after 60 s; boundary 60000/60001
- 118 R: player-bound records the binder and emits bound
- 138 R: bind update while a bind pends emits reason bound; login/bound split drives the harness row
- 157 R: snapshot is detached; mutation does not leak into the store
- 173 D: dispatch registration and stub removal are covered by packages/core/src/wow/client-handlers.test.ts:28 (shadowed stubs check)
- 200 F: the legacy-handler capture only tests the test's own handler; drop it, keep known/masters/taxi_map assertions
- 233 C packages/core/src/wow/areas/travel/store.test.ts:41: known undefined at start is already in the initial state toEqual
- 242 R: node status sets the master known flag and emits taxi_node_status
- 260 R: new taxi path sets learnedAt and emits learned with the pending map npc
- 275 R: new taxi path without a pending map has no npc; distinct branch
- 287 F: name says a self update gaining PLAYER_FLAGS 0x20000 but it calls receiveSelfFlags(true) directly; inject an update via the rig or rename
- 315 R: ERR_TAXIOK sets lastReply, flying and emits taxi_reply then flight_started in order
- 344 R: refusal sets lastReply and stays idle
- 361 F: name claims a stale spline position but only calls receiveFlightFlag; assert via an injected self update or rename to the flag-ordering contract
- 391 R: self flight flag from idle enters flying and the clear lands; repeat clear is idempotent
- 414 R: learned node after a shown map carries the map's current node
- 457 R: self flight spline records duration and re-emits flight_started with fare
- 474 R: other unit, non-flying and cyclic splines leave duration unknown, then a real one sets it
- 494 R: second spline and spline outside a flight change nothing
#### Seams
- packages/core/src/wow/areas/travel/store.ts `beginBind/endBind/beginMap/endMap/beginFlight`: tests call them directly but runtime.ts and flight.ts use them too; not test-only
#### Defects
- none

### packages/core/src/wow/areas/travel/taxi-runtime.test.ts
- 56 R: queryTaxiStatus sends the query and settles ok with the known flag
- 76 R: 3 s silence gives no_answer
- 90 R: second status query while pending refuses busy with no send
- 108 R: send throw does not leave the query stuck; retry sends
- 133 R: openTaxiMap sends the map query and settles map with known nodes
- 162 R: openTaxiMap settles learned on SMSG_NEW_TAXI_PATH
- 174 R: node learned at an unknown node is named by the next map; no duplicate name
- 223 R: learned node reports node id with undefined name when taxi data is missing
- 256 R: enable option sends CMSG_ENABLETAXI
- 273 R: openTaxiMap 3 s silence gives no_answer
- 286 R: setTaxiBenchmark sends one u8 and settles on the benchmark event
- 303 R: benchmark false while already false settles ok without waiting
- 315 R: opposing benchmark request while pending refuses busy
- 331 R: benchmark 3 s silence gives no_answer
- 344 R: destinations lists direct edges with names, prices and known flags
- 379 R: unknown_node refusal and case-insensitive name-part planFlight; also covers the one-hop route
- 405 R: planFlight unknown_node, ambiguous with matches, not_known
- 438 R: no_route over known nodes with no edges
- 466 R: missing_taxi_data refusal for destinations and planFlight
#### Seams
- none
#### Defects
- none

### packages/harness/src/areas/travel/area.test.ts
- 41 F: keep event/progress and add toContain("Falconwing Square") (looked-up area, fallback `area N` is the other branch); drop the "Home is now ...." sentence
- 51 R: login bind point writes no row; avoids spamming at login
- 57 R: bind offer writes a bind_offer row
- 65 F: keep event and toContain("Dragonhawk Master") (unitName lookup rendered to the agent); drop the "New flight path" prose assertion
- 82 F: no-master branch renders the fallback label "a new stop"; assert toContain("a new stop") (no data field tells it apart), not just the event
- 91 F: keep data; keep computed values toContain("105"), toContain("95 s") (ms to s), and stop count "2 stops"; drop the "copper fare"/"flight" wording
- 111 R: node id lands in row data
- 123 R: landing writes a wake-class flight_landed row
- 135 F: name is echoed from the event and data.name already asserts it; drop the redundant text toContain("not_enough_money")
- 148 R: named node row carries node data and the catalog name in text (the only carrier of the name)
- 166 F: fallback label when catalog name is missing renders "node 83" in text only; assert toContain("node 83") and event, drop nothing else
- 180 R: ok taxi reply writes no row
#### Seams
- none
#### Defects
- none

## area-unitmotion

### packages/core/src/wow/areas/unitmotion/area.test.ts
- 22 R: UNSET_HOVER and GRAVITY_ENABLE (absent from the toggle tables) strip hover/gravity bits, with events and serverControlled
- 60 C packages/core/src/wow/areas/unitmotion/store.test.ts:163: same single drop branch (store.ts:181 rowFor) for toggles; keep one packet-level drop at area.test.ts:141
- 98 R: seven snare speeds slow with spline source, runBefore saved, ratio 0.5, release restores; catches a missed speed kind or lost previous
- 141 R: packet-level proof that an unbacked speed packet is routed to the store and counted dropped, seven opcodes
- 177 R: each of six toggle opcodes sets/clears its own bit with an event; a swapped bit or on/off misreports state
- 205 C packages/core/src/wow/areas/unitmotion/store.test.ts:143: same root-clears-moving-bits branch with a stronger mask (turn and hover bits kept)
- 224 C packages/core/src/wow/areas/unitmotion/store.test.ts:163: same drop branch replayed over six opcodes, no new branch
- 235 R: trailing bytes on a toggle throw at the dispatch boundary and leave state untouched
- 259 R: turn and pitch rate opcodes each set their own speed and emit an event; run untouched
- 295 C packages/core/src/wow/areas/unitmotion/store.test.ts:163: same drop branch for rate packets, no new branch
- 362 R: eight fall/water/hover/flight toggle opcodes set or clear only their bit and keep the others
- 393 C packages/core/src/wow/areas/unitmotion/store.test.ts:163: same drop branch replayed over eight opcodes, no new branch
- 404 C packages/core/src/wow/areas/unitmotion/area.test.ts:235: same trailing-byte rejection with another opcode; the parser owns it (protocol.test.ts:169)

### packages/core/src/wow/areas/unitmotion/protocol.test.ts
- 113 F: keep the table-vs-owned-opcodes comparison; drop the `toBe(25)` magic count that only pins the test's own SPEEDS/FLAGS lengths
- 119 R: speed opcodes read packed guid then float for all nine kinds against the writer helper; a wrong kind mapping misreports speed
- 134 R: toggle opcodes map to the correct flag, bit and on/off for all twenty-odd opcodes
- 149 R: root uses a packed guid, not a full 8-byte guid; reference bytes from Unit.cpp
- 159 R: NaN, infinite and negative speeds throw RangeError before reaching the store
- 169 R: trailing bytes on toggle and speed packets throw; catches a lax parser desyncing
- 192 R: an unowned opcode throws instead of being parsed as a spline state

### packages/core/src/wow/areas/unitmotion/runtime.test.ts
- 21 R: entity disappear removes that unit's row and emits removed; covers the runtime wiring the store test cannot

### packages/core/src/wow/areas/unitmotion/store.test.ts
- 94 D: initial empty snapshot is a constructor default; any real test asserts the snapshot shape (keeper store.test.ts:98)
- 98 R: seed from the create block records flags, nine speeds with source "create" and time
- 116 R: toggle sets then clears a bit and emits both events with the resulting flags
- 143 R: root on clears moving bits, keeps turn bits and hover; unroot restores; matches Unit.cpp:14069
- 163 R: unbacked guid drops and counts for both spline and move-message entry points
- 171 R: a known entity without a create block starts a row from the packet
- 177 R: forget emits removed once and a second forget is silent
- 186 R: run slow remembers pre-drop speed through repeated drops until recovery
- 211 R: ratio divides by the base speeds and returns undefined for unknown guid; catches wrong base table
- 221 R: events for the own guid carry self and move_msg source, serverControlled false
- 231 R: dispose drops rows and listeners so later packets emit nothing

### packages/harness/src/areas/unitmotion/area.test.ts
- 57 F: keep the looked-up unit name "Springpaw Stalker" (data holds only the guid, so text is the agent's only name) and the computed pct, tightening `toContain("slowed to 50%")` to `toContain("50%")`; the slowed/sped branch is already pinned by the event name, so drop the wording
- 73 R: rooted text carries the looked-up unit name (data has only the guid), asserted via `toContain("Springpaw Stalker")` with no sentence pinned; rooted/freed branches by event name
- 86 R: lastAttacker counts as in the fight; without it an attacker's slow would be silent
- 95 R: 100 ms per-guid throttle boundary at 99 and 100 ms
- 107 R: throttle is per guid, so a second unit's row is not swallowed
- 117 F: name promises the other six kinds but only swim is tried; loop all non-run speed kinds
- 125 R: out-of-fight, self, hover, gravity, non-fight guid and removed events all stay silent
- 144 R: no previous speed or an unchanged speed writes nothing; guards the divide in the pct

#### Seams
- packages/core/src/wow/areas/unitmotion/protocol.ts `SPLINE_UNIT_TABLE` and `MOTION_FLAG_BITS`: also used by remote-motion-handlers.ts, so not test-only; no test-only seams
- packages/core/src/wow/areas/unitmotion/store.ts `seed`: world-handlers-entity.ts calls it in production, tests only use it for setup

#### Defects
- none

## area-vehicles

### packages/core/src/wow/areas/vehicles/area.test.ts
- 41 R: SMSG_PLAYER_VEHICLE_DATA sets the id and id 0 deletes it, with both events; a wrong clear leaves a stale vehicle id
- 63 R: empty ride-aura cancel packet emits only ride_aura_cancel and touches no state
- 77 R: SMSG_MONSTER_MOVE_TRANSPORT records passenger seat and emits the full spline event (offset, splineId, duration)
- 110 R: captured live boarding bytes (probe click11) parse to seat 0 with TRANSPORT_ENTER; real-wire reference
- 137 D: re-injects the same captured bytes as 110 and compares to a float decode of the same word; keeper area.test.ts:110
- 175 R: plain MONSTER_MOVE with TRANSPORT_EXIT removes the passenger and emits the exit with seat -1
- 209 R: a MONSTER_MOVE for a unit that never boarded emits nothing
- 226 R: peeked UPDATEFLAG_VEHICLE create block sets the id for plain and compressed update packets
- 244 F: name promises out-of-range deletes the id but only SMSG_DESTROY_OBJECT is injected; add the OUT_OF_RANGE update
- 261 R: destroy and out-of-range each drop only the departed rider's passenger entry
- 293 R: self create block on a vehicle seats the character, emits entered once, and a repeat emits nothing
- 328 R: create block for another unit on a vehicle seat does not seat the character
- 346 R: self create block on a transport gameobject guid is not treated as a vehicle seat
- 364 R: malformed peeked update block reaches packetError instead of being swallowed
- 375 R: destroy for an unknown guid and an empty out-of-range change nothing
- 394 R: truncated transport packet throws to the caller

### packages/core/src/wow/areas/vehicles/protocol.test.ts
- 26 R: transport move body parses guid, transport guid, seat, splineId and duration
- 47 R: stop-form body parses fully and seat 0xff reads -1
- 70 C packages/core/src/wow/areas/vehicles/area.test.ts:41: only asserts the parse round trip of guid and id; area.test.ts:41 covers the 315/0 cases through the wire
- 85 D: restates the declared NPC_FLAG constants; behaviour proven by runtime.test.ts:82 (not_clickable without the click flag)
- 92 R: CMSG_SPELLCLICK writes a full u64 guid
- 98 R: switch-seat request writes a packed guid then an int8 seat, -1 as 0xff
- 110 R: CMSG_PLAYER_VEHICLE_ENTER writes a full u64 guid
- 116 R: CMSG_CONTROLLER_EJECT_PASSENGER writes a full u64 guid
- 136 R: dismiss body is the packed vehicle guid then movement info, fully consumed
- 147 R: change-seats body appends packed accessory guid and int8 seat after movement info
- 162 R: accessory 0 writes a packed zero guid for prev/next seat

### packages/core/src/wow/areas/vehicles/runtime-board.test.ts
- 39 R: self boarding spline is forwarded to control as vehicle_seat with splineId and duration
- 69 R: vehicle entity pose is carried into the vehicle_seat event
- 113 R: nonzero boarding angle reaches the movement ack transport block and the spline-done packet end to end
- 170 R: re-boarding another seat replaces the ack seat and spline-done id/seat

### packages/core/src/wow/areas/vehicles/runtime-drive.test.ts
- 69 R: control change to the seat vehicle sets controlling and emits control allow
- 86 R: losing the mover clears controlling and emits allow false for the previous mover
- 104 R: repeated control changes with the same mover emit a single control event
- 117 R: create-block flight flags reach control as the driven vehicle's mover_state flags
- 141 R: create-block speeds and pose reach control as mover_state, before the control event
- 169 R: exitVehicle while controlling sends the dismiss mover_packet with the vehicle guid and settles ok
- 200 R: dismissControlled refuses not_controlling and emits no mover packet
- 215 R: changeSeatOnControlled refuses not_controlling and sends nothing
- 229 R: same-vehicle seat change builds the accessory-0 packet and settles ok on the new seat spline
- 272 R: accessory seat change builds the accessory packet and settles on the accessory boarding spline
- 315 R: a same-seat spline on the original vehicle does not settle an accessory change; times out no_answer
- 339 C packages/core/src/wow/areas/vehicles/runtime-drive.test.ts:315: pure silence hits the same timeout branch; 315 asserts no_answer with a distractor spline

### packages/core/src/wow/areas/vehicles/runtime-requests.test.ts
- 155 R: an ejection spline does not satisfy a pending seat-change request
- 182 R: a seat spline on another vehicle does not satisfy the request
- 239 R: each of the seven acts rejects with the send error and releases its waiter
- 255 R: after a failed send a retry sends and settles; no stuck waiter

### packages/core/src/wow/areas/vehicles/runtime.test.ts
- 58 R: spellClick sends CMSG_SPELLCLICK and settles ok on the boarding spline
- 82 R: spellClick on a unit without the click flag refuses not_clickable and sends nothing
- 95 R: silence for 3 s settles no_answer
- 108 R: exitVehicle with a seat sends REQUEST_VEHICLE_EXIT and settles ok when control returns
- 129 R: exitVehicle after a boarding spline finds the seat from passengers (not refused not_seated)
- 158 R: character guid is read at act time; a runtime built before login still works
- 206 R: exitVehicle ignores control changes carrying a reason and times out no_answer
- 230 R: exitVehicle without a seat refuses not_seated and sends nothing
- 243 R: nextSeat sends the opcode and settles ok on a higher seat spline
- 272 F: name promises packed guid and seat but only the opcode is asserted; assert the body (vehicle guid, seat 2) via the seat-request builder
- 302 R: enterPlayerVehicle sends CMSG_PLAYER_VEHICLE_ENTER and settles on the partner spline
- 326 C packages/core/src/wow/areas/vehicles/runtime.test.ts:357: ejectSeat never reads the seat, so the seated variant hits the same branch; 357 is the driver-only case
- 357 R: ejectPassenger from a vehicle id with no seat sends eject and settles on the passenger exit spline
- 383 R: an exit spline for another passenger does not settle the eject
- 411 R: a plain move of a passenger does not count as leaving and keeps the passenger entry
- 436 R: disposing the rig aborts a pending exitVehicle (control-restored waiter)
- 452 R: disposing the rig aborts a pending spellClick (seat-request waiter)
- 463 R: ejectPassenger when not a vehicle refuses not_a_vehicle and sends nothing

### packages/core/src/wow/areas/vehicles/store.test.ts
- 18 R: fresh store has no seat, vehicles or passengers (no shared default state)
- 31 R: second vehicle data for the same guid overwrites the id and emits both events
- 42 F: name says splines accumulate per passenger but only one guid is fed; add a second passenger and assert both entries
- 62 R: self boarding spline sets the seat and emits entered with the spline id
- 100 R: boarding facing angle is carried into the entered event
- 123 R: boarding without a final angle yields facing 0
- 146 R: snapshot maps are copies and dispose clears state and stops events

### packages/harness/src/areas/vehicles/area.test.ts
- 19 F: ruling A: sentences are wording, vehicleId 315/0 already in data; replace toEqual with toMatchObject on class/name/data (guid, vehicleId), no text
- 44 F: ruling A: sentence is wording and data is {}; assert class log and name ride_aura_cancel only, drop text
- 57 R: spline events write no row inside or outside a run (flood guard)
- 92 R: entered is a wake row named entered with entry, seat and hex vehicle data
- 104 F: ruling A: keep the value; assert data seat 0 with entry undefined (the seatText no-entry branch) and tight toContain("seat 0"), drop other prose
- 112 R: exited writes a log row named exited with the vehicle guid
- 119 R: seat_changed writes a log row with the new seat and vehicle
- 147 R: attach writes one row for an already-seated character with the seat
- 164 R: attach writes nothing when unseated
- 170 F: keep a tight toContain("control") as the branch label the agent reads (data.allow is not delivered); drop not.toBe(text); keep class/name/data allow+mover

### packages/harness/src/areas/vehicles/tool.test.ts
- 85 R: minimalArgs validates against the parameters schema, so the fallback call stays legal
- 99 R: tool kind conformance via expectSendKind (action tool may send)
- 113 F: ruling A: keep status DONE and next toContain("travel("); drop the detail toContain("travel") prose
- 122 F: ruling A: prose absence is wording; assert res.next is undefined (no travel call), drop detail not.toContain
- 130 F: ruling A: prose absence is wording; assert res.next is undefined with no seat, drop detail not.toContain
- 138 R: ruling A: toContain("Wintergarde Gryphon") is the unit name resolved from state into detail (agent reads it); keep with spellClick call, DONE and after
- 148 R: an out-of-reach unit is walked to via goto before the click
- 156 R: a failed walk throws FAILED and sends no click
- 165 F: ruling A: status UNCONFIRMED and reason no_answer prove the branch; drop the toLowerCase "no answer"/"refused" prose assertions
- 174 R: act refusal surfaces as REFUSED with its reason
- 186 R: missing and unknown unit refuse missing_target and not_seen, sending nothing
- 197 R: abort while the click waits rejects the call
- 213 R: leave calls exitVehicle and not_seated surfaces as a refusal
- 224 R: seat next, prev and numbers (including 0) map to the right acts
- 238 R: out-of-range seat numbers refuse bad_seat at the tool and send nothing; 7 is accepted
- 249 R: parameter schema rejects seats above 7 before the tool runs
- 271 R: seat without a target refuses missing_seat and sends nothing
- 279 R: ride_with resolves a player and eject a unit, each calling its act with the guid
- 289 R: an act that throws reaches the caller
- 296 R: a remembered target is walked to by last-known point, then by guid, then clicked once
- 340 R: unit gone from last-known point refuses not_at_last_known without a click
- 373 R: ambiguous names offer retry calls that keep the verb and validate against the schema
- 430 D: verbatim duplicate of 289; keeper packages/harness/src/areas/vehicles/tool.test.ts:289

#### Seams
- packages/core/src/wow/areas/vehicles/protocol.ts `NPC_FLAG_PLAYER_VEHICLE`: only protocol.test.ts:85 references it
- packages/core/src/wow/areas/vehicles/store.ts `setSeat`, `setVehicleId`: also called from production, but runtime tests use `setSeat` to stage seats instead of boarding events
- packages/core/test-support/area-rig `areaRig("vehicles", {getEntity, selfGuid})` overrides: shared rig params, used by vehicle runtime tests

#### Defects
- none

## core-lib

### packages/core/src/lib/abort.test.ts
- 5 R: abortReason keeps the signal's own AbortError; callers match on it
- 11 R: non-Error abort reason is wrapped into an AbortError
- 19 R: abortable rejects with AbortError when the signal fires before the promise settles
- 28 R: bounded rejects with the timeout reason at the deadline; a missing timer hangs callers
- 46 R: pause resolves after the delay
- 57 R: pause rejects on abort rather than waiting out the delay

### packages/core/src/lib/config.test.ts
- 5 R: parses string and number values from TOML-ish text
- 13 R: blank lines and comments are skipped
- 20 R: defaults for host, port, language, timeout_minutes
- 28 R: missing account throws the named required-field error
- 34 R: missing password throws
- 40 R: missing character throws
- 46 R: backslash and quote unescape in quoted values
- 53 R: non-positive port rejected
- 59 R: NaN language rejected
- 67 R: Infinity timeout_minutes rejected
- 77 R: serialize then parse round-trips a full config
- 92 R: escaped backslash and quote survive serialize and parse; format and round-trip both asserted
- 110 R: optional capability paths reject blank or numeric values, and round-trip when set

### packages/core/src/lib/emitter.test.ts
- 5 R: every subscriber sees every event in registration order
- 15 R: unsubscribe removes only that listener and is idempotent
- 30 R: duplicate registration of one listener unsubscribes one at a time
- 41 R: a throwing listener does not block later ones and reaches the error sink
- 55 R: without a sink the error is rethrown after all listeners ran
- 66 R: subscription changes during emit apply on the next emit
- 80 R: clear detaches every listener

### packages/core/src/lib/errors.test.ts
- 5 R: messageOf reads an Error's message
- 9 R: non-Error throws stringify or use the fallback

### packages/core/src/lib/paths.test.ts
- 7 R: XDG dirs resolve to the exact config, state, runtime, pid, socket and log paths
- 27 R: without XDG, falls back to home dirs and a uid-scoped tmp dir
- 35 R: empty XDG values are treated as unset

### packages/core/src/wow/crypto/arc4.test.ts
- 5 D: asserts only encrypted != header and length 4; vacuous, real encrypt proof is arc4.test.ts:29
- 17 F: decrypted != data only shows the two directions use different streams; assert decrypt against a reference server-encrypt stream
- 29 R: encrypt output decrypts under the server's HMAC-SHA1-derived key; wrong key derivation fails
- 50 F: e1 != e2 passes for many wrong ciphers; assert the two-call stream against the reference decryptor
- 64 D: different keys give different output, no derivation pinned; keeper arc4.test.ts:29 pins the derivation

### packages/core/src/wow/crypto/srp-server.test.ts
- 106 R: client proof and K agree with an independent reference server, ordinary values
- 116 R: salt with a zero first byte keeps its 32-byte width in the proof
- 126 R: salt with a zero last byte keeps width
- 131 R: B with zero most significant byte keeps width
- 139 R: B with zero least significant byte keeps width
- 147 R: A with zero top byte is sent as 32 bytes and verifies
- 159 R: S with a zero edge byte derives the same K via the interleave trimming
- 170 R: all zero-edge cases combined; interaction check, cheap
- 180 R: fixed-width LE encoding round-trips values with zero high bytes

### packages/core/src/wow/crypto/srp.test.ts
- 4 R: bigIntToLeBytes byte order against a literal
- 12 R: leBytesToBigInt byte order against a literal
- 19 D: round trip of the two helpers pinned by literals at :4 and :12 and by srp-server.test.ts:180; keeper srp-server.test.ts:180
- 25 R: modPow against literal values
- 30 D: "known parameters" asserts only byte lengths; correctness covered by reference handshake, keeper srp-server.test.ts:106
- 48 R: B = 0 rejected with the SRP error
- 59 R: B = N (0 mod N) rejected; distinct input from :48
- 70 D: K length 40 and not all zero; keeper srp-server.test.ts:106 proves K equals the reference
- 87 D: leading-zero width covered with exact reference proof at srp-server.test.ts:131 and :116; keeper srp-server.test.ts:131

### packages/core/test-support/mock-handle.test.ts
- 9 R: resolveClosed resolves the closed promise that harness tests await
- 15 R: close resolves the closed promise
- 21 D: asserts the mock's default literal [], no contract
- 26 D: asserts the mock's default chat mode literal; no contract
- 31 R: setLastChatMode feeds getLastChatMode in tests relying on it
- 40 R: triggerMessage reaches the registered onMessage hook
- 50 R: triggerGroupEvent reaches onGroupEvent
- 60 D: asserts the mock's default literal []; no contract
- 65 D: asserts the mock's default literal []; no contract
- 70 R: triggerFriendEvent reaches onFriendEvent
- 80 R: triggerEntityEvent reaches onEntityEvent
- 114 R: triggerIgnoreEvent reaches onIgnoreEvent
- 124 R: triggerGuildEvent reaches onGuildEvent
- 143 D: asserts the mock's default literal []; no contract
- 148 D: asserts the mock's default undefined; no contract
- 153 D: restates stub literals for capabilities, place state and creature info; no contract
- 170 R: notice and trainer triggers reach their hooks
- 196 R: queryNearby marks attackers from combat state; checks real query wiring through the mock
- 229 R: triggerAreaEvent delivers to onAreaEvent and stops after unsubscribe
- 245 D: asserts the mock's initial literal []; no contract
- 249 R: handle.time wiring: state, sent CMSG_QUERY_TIME packet, timeout after TIME_QUERY_TIMEOUT_MS
- 270 R: triggerAreaEvent for time reaches onAreaEvent and handle.time.onEvent

### packages/core/test-support/never-handled.test.ts
- 17 R: every NEVER_HANDLED example is a real opcode in some area's dead list; catches fixture drift from owners
- 24 D: restates fixture constants (prefix, nonempty label); membership checked at never-handled.test.ts:17; keeper never-handled.test.ts:17

### packages/core/test-support/protocol-coverage.test.ts
- 74 R: the projection produces exactly the index, core and per-area files
- 85 R: generated coverage docs on disk match the projection and none is extra; catches stale docs
- 100 R: rows split by owning area into alpha and core files, with live column
- 117 R: index links the add-an-area doc and carries no opcode counts
- 125 R: area opcode status dead, stub, handled or missing
- 137 D: same missing status for the same opcode as protocol-coverage.test.ts:125; keeper protocol-coverage.test.ts:125
- 142 R: unseen opcodes marked not seen live, others blank
- 148 D: owner area per row already asserted via file split at protocol-coverage.test.ts:100; keeper protocol-coverage.test.ts:100
- 154 R: direction derived through the TC9 prefix and MSG_ both
- 161 R: core opcode status handled, dead or sent
- 169 R: every opcode appears exactly once

#### Seams
- none found; mock-handle.ts and protocol-coverage.ts are test-support only and used by the listed tests

#### Defects
- none

## core-protocol-1

### packages/core/src/wow/protocol/account-data-zlib.test.ts
- 10 R: deflate/inflate roundtrip with multibyte; size is byte length, a char-count bug breaks account data
- 17 R: empty text packs to size 0 and size 0 ignores the tail; wrong handling corrupts empty account data
- 25 R: size mismatch throws instead of returning truncated text
- 30 R: 0xFFFF limit boundary and NUL rejection protect the account-data upload

### packages/core/src/wow/protocol/achievement-data.test.ts
- 30 R: completed and criteria lists of the all-achievement-data packet with packed times; a swapped field misreads progress
- 55 R: two end markers alone give empty lists
- 61 R: counter above 2^32 stays exact bigint; a u32 read truncates
- 70 R: parser stops after the second marker and leaves trailing bytes; over-read corrupts the enclosing packet

### packages/core/src/wow/protocol/action-buttons.test.ts
- 30 R: 24-bit action / 8-bit type unpack per slot against raw packet words
- 47 R: clear behaviour reads no button data
- 53 R: unknown behaviour throws invalid_action_bar_behavior
- 61 R: ActionBarStore replaces the bar per packet and empties on clear

### packages/core/src/wow/protocol/aura.test.ts
- 10 R: spell id 0 means removal, no invented fields
- 17 R: caster packed guid and duration fields present when AFLAG_CASTER unset
- 38 R: AFLAG_CASTER omits the caster guid; a wrong flag test misaligns the stream
- 58 R: update-all reuses the unit header across entries and consumes the body

### packages/core/src/wow/protocol/auth.test.ts
- 18 F: name promises a correct packet but only checks the opcode byte and the account tail; assert the full layout (build, lengths, account length)
- 26 C packages/core/src/wow/protocol/auth.test.ts:18: same uppercase-tail assertion on the same branch with a different account; fold into 18 once it asserts the whole layout
- 33 R: SRP B/g/N/salt extraction from the logon challenge response, endianness checked
- 71 R: error status returns no SRP params
- 83 R: logon proof layout: opcode, A, M1 offsets and total length 75
- 95 R: M2 read big-endian from the proof response
- 110 R: error status yields no M2
- 121 R: realm list request opcode and length
- 128 R: realm entry fields (name, host, port, characters, timezone, id) parsed from reference layout
- 161 R: address without port throws Invalid realm address instead of a NaN port
- 183 D: restates 19 enum constants against themselves; no behaviour is exercised, real codes are asserted via parsers (auth.test.ts:71, :110)
- 205 R: non-numeric port throws Invalid realm port
- 227 R: realm flag 0x04 skips the 5-byte version block; a miss misaligns the next realm
- 276 R: reconnect challenge data extracted
- 292 R: reconnect error status returns no challenge data
- 304 R: reconnect proof built with SHA1(account,challenge,client,key) at fixed offsets

### packages/core/src/wow/protocol/chat-channel.test.ts
- 15 R: YOU_JOINED consumes its trailing fields and maps to joined with the channel
- 30 R: YOU_LEFT consumes its trailing fields and maps to left
- 44 R: unknown notify type maps to other, not an error
- 53 F: keeper of the code->error mapping; keep type, code and the channel name substituted into message (toContain("Secret")); drop the whole-sentence message pin (code already proves the branch)
- 67 F: NOT_MEMBER is its own code->label row; keep type, code and the channel substitution via toContain(channel) (none for empty channel), drop the sentence pin; fold into one table with 53
- 81 F: BANNED is its own code->label row; keep type, code and the channel substitution via toContain(channel) (none for empty channel), drop the sentence pin; fold into one table with 53
- 95 F: MUTED is its own code->label row; keep type, code and the channel substitution via toContain(channel) (none for empty channel), drop the sentence pin; fold into one table with 53
- 109 F: ALREADY_MEMBER is its own code->label row; keep type, code and the channel substitution via toContain(channel) (none for empty channel), drop the sentence pin; fold into one table with 53
- 123 F: INVALID_NAME (empty channel) is its own code->label row; keep type, code and the channel substitution via toContain(channel) (none for empty channel), drop the sentence pin; fold into one table with 53
- 137 F: THROTTLED is its own code->label row; keep type, code and the channel substitution via toContain(channel) (none for empty channel), drop the sentence pin; fold into one table with 53
- 151 F: WRONG_FACTION is its own code->label row; keep type, code and the channel substitution via toContain(channel) (none for empty channel), drop the sentence pin; fold into one table with 53
- 165 F: NOT_IN_AREA is its own code->label row; keep type, code and the channel substitution via toContain(channel) (none for empty channel), drop the sentence pin; fold into one table with 53
- 181 R: join packet layout and empty password default
- 191 R: join packet carries the password
- 203 R: leave packet layout
- 212 R: roll packet min/max order
- 219 C packages/core/src/wow/protocol/chat-channel.test.ts:212: same layout with other values, no new branch
- 228 R: roll result fields in wire order
- 244 R: guid low word above 2^31 stays unsigned
- 262 F: id 1 label and the substituted time parameter are computed text the agent reads (message is the only carrier); assert toContain("shutdown") and toContain("15:00") instead of the whole sentence
- 270 F: id 2 label (restart label with its time 05:00) is a computed value in the only text the agent reads; keep as table row asserting the label keyword and parameter via toContain, drop the full-sentence toBe
- 278 R: raw-string id returns the param untouched
- 286 F: id 4 label (shutdown-cancelled label) is a computed value in the only text the agent reads; keep as table row asserting the label keyword and parameter via toContain, drop the full-sentence toBe
- 294 F: id 5 label (restart-cancelled label) is a computed value in the only text the agent reads; keep as table row asserting the label keyword and parameter via toContain, drop the full-sentence toBe
- 302 F: id 6 label (battleground shutdown label with 10:00) is a computed value in the only text the agent reads; keep as table row asserting the label keyword and parameter via toContain, drop the full-sentence toBe
- 310 F: id 7 label (battleground restart label with 03:00) is a computed value in the only text the agent reads; keep as table row asserting the label keyword and parameter via toContain, drop the full-sentence toBe
- 318 F: id 8 label (instance shutdown label with 02:00) is a computed value in the only text the agent reads; keep as table row asserting the label keyword and parameter via toContain, drop the full-sentence toBe
- 326 F: id 9 label (instance restart label with 01:00) is a computed value in the only text the agent reads; keep as table row asserting the label keyword and parameter via toContain, drop the full-sentence toBe
- 334 F: unknown id fallback; keep toContain("99") and toContain("mystery") (id and param), drop the full sentence pin
- 344 R: notification reads one cstring
- 351 C packages/core/src/wow/protocol/chat-channel.test.ts:344: empty string is the same read path

### packages/core/src/wow/protocol/chat.test.ts
- 15 R: base chat header, sender guid, sized message and no channel
- 35 D: WHISPER takes the same parse path as SAY, no new branch; keeper packages/core/src/wow/protocol/chat.test.ts:15
- 53 R: CHANNEL type reads the channel cstring before the sender guid
- 73 D: SYSTEM takes the same parse path as SAY; keeper packages/core/src/wow/protocol/chat.test.ts:15
- 91 R: GM flag reads the embedded sender name
- 114 R: captured monster yell with sized sender name and zero receiver
- 162 R: monster chat to a creature skips the receiver name; wrong skip desyncs the message
- 170 R: monster chat to a player reads no receiver name
- 176 R: BG system chat skips a non-player receiver name and has no sender
- 193 C packages/core/src/wow/protocol/chat.test.ts:15: RAID_WARNING has no special branch; same path as an ordinary message
- 236 R: achievement id read after the tag
- 245 R: guild achievement type also reads the id; dropping the OR clause loses it
- 253 R: missing trailing id stays undefined, no over-read
- 260 R: IGNORED notice reads message and sender, no achievement id
- 270 R: ordinary say ignores trailing id bytes
- 279 R: SAY builder layout type, language, message
- 287 R: WHISPER builder writes target before message
- 301 R: CHANNEL builder writes channel before message
- 315 C packages/core/src/wow/protocol/chat.test.ts:279: GUILD has no target, same branch as SAY
- 327 C packages/core/src/wow/protocol/chat.test.ts:279: DND has no target, same branch as SAY
- 335 C packages/core/src/wow/protocol/chat.test.ts:279: AFK has no target, same branch as SAY
- 345 R: name query request layout
- 352 R: found name query response yields the name
- 369 R: not-found name query response yields no name
- 382 R: who request defaults for level range and empty names
- 391 R: who request carries the name filter
- 399 R: who response row fields
- 418 R: zero-result who response returns an empty list

### packages/core/src/wow/protocol/combat.test.ts
- 16 R: attack swing writes an unpacked little-endian guid
- 22 R: high guid bytes land in the upper dword
- 30 R: attack start reads unpacked attacker and victim
- 42 R: attack stop reads packed guids and dead u32
- 49 R: captured victimless stop reads only the attacker
- 57 R: captured full stop keeps victim and dead flag
- 68 R: kill XP credit reads victim, original XP and group rate
- 85 R: non-kill XP has no original fields and keeps the recruit flag
- 100 R: cancel-auto-repeat reads the packed target
- 106 R: empty cancel-auto-repeat body tolerated

### packages/core/src/wow/protocol/compressed-update.test.ts
- 7 R: inflates a size-prefixed zlib update body
- 17 R: size mismatch throws

### packages/core/src/wow/protocol/death.test.ts
- 29 R: release byte and corpse reclaim raw guid layouts
- 35 R: resurrect response accept/reject byte
- 40 R: spirit-healer activation guid layout
- 46 R: absent corpse is a one-byte response with no invented location
- 52 R: corpse query keeps entrance map, corpse map and trailing scalar from captured bytes
- 64 R: reclaim delay in ms
- 70 R: captured spirit-healer confirm guid
- 76 R: spirit-healer marker clear vs location distinction
- 87 R: NPC resurrection UTF-8 name, reserved byte, sickness and zero delay
- 99 R: absent delay override stays undefined, not zero

### packages/core/src/wow/protocol/difficulty.test.ts
- 9 R: dungeon difficulty names normal/heroic/epic
- 18 R: raid difficulty size and mode names
- 30 R: out-of-range values yield no name

### packages/core/src/wow/protocol/duel.test.ts
- 13 R: duel requested reads initiator and arbiter guids
- 22 R: countdown reads ms
- 29 R: complete flag true and false
- 43 R: winner reason 0 maps to won with loser/winner order
- 54 R: reason 1 maps to fled
- 65 R: accept builder writes the arbiter guid
- 71 R: cancel builder writes the arbiter guid

### packages/core/src/wow/protocol/entity-fields.test.ts
- 12 D: restates ObjectType constants against the same literals; no contract exists (constant restated)
- 25 D: restates UpdateType constants; no contract exists (constant restated)
- 36 D: restates UpdateFlag bit values; no contract exists (constant restated)
- 45 D: restates MovementFlag bit values; no contract exists (constant restated)
- 54 D: restates OBJECT_END; no contract exists (constant restated)
- 58 D: restates UNIT_END; no contract exists (constant restated)

### packages/core/src/wow/protocol/entity-queries.test.ts
- 16 R: creature query builder layout u32 entry, u64 guid
- 24 R: creature response name from raw cstrings
- 38 R: masked entry (high bit) reads as unknown, no name
- 47 R: builder keeps a >32-bit guid exactly
- 55 R: subName, type, family, rank details after names
- 71 R: response cut after names keeps name and no details
- 84 R: game-object query builder layout
- 92 R: full 3.3.5 game-object template against AzerothCore writer layout
- 123 R: string order castBarCaption/iconName/unk1 per QueryHandler.cpp
- 151 R: masked missing-entry reply keeps name undefined

### packages/core/src/wow/protocol/extract-fields.test.ts
- 17 R: entry field extraction and changed marker
- 24 R: scale read as float bits
- 31 C packages/core/src/wow/protocol/extract-fields.test.ts:41: guid from two fields with high word 0 is the same branch; 41 covers the shift
- 41 R: guid combines high and low words
- 50 R: empty object field map reports no changes
- 55 R: fallback supplies the guid high word on a partial update
- 65 R: health, max health, level extraction
- 80 R: BYTES_0 unpack into race, class, gender, power type
- 93 C packages/core/src/wow/protocol/extract-fields.test.ts:103: target from two fields with zero high word; 103 covers the shift
- 103 R: target combines high and low words
- 112 R: power array entries by index
- 123 R: maxPower array entries by index
- 134 R: displayId and npcFlags mapping
- 144 R: factionTemplate and unitFlags mapping
- 154 R: nativeDisplayId mapping
- 161 R: dynamicFlags mapping
- 168 R: modCastSpeed float decode
- 175 R: combatReach float decode
- 182 R: sparse power array leaves holes untouched
- 192 R: empty unit field map reports no changes
- 197 R: fallback supplies target high word
- 205 R: fallback supplies target low word
- 213 R: neither word in the raw update leaves target undefined even with a fallback
- 225 R: game-object displayId and flags
- 235 R: game-object BYTES_1 state and raw bytes1
- 243 R: game-object level and faction
- 253 R: CREATED_BY read as one guid
- 263 R: DYNAMIC split into u16 flags and signed i16 path progress
- 271 R: empty game-object map reports no changes

### packages/core/src/wow/protocol/gossip.test.ts
- 18 R: gossip hello guid layout
- 26 R: absent vs empty vs UTF-8 code in the select-option packet
- 40 R: gossip message menu identity, raw flags, signed levels and UTF-8 labels against hex bytes

### packages/core/src/wow/protocol/group-list.test.ts
- 15 R: party list with counter, members and loot block
- 38 R: raid subgroups, flags, roles and difficulties
- 73 R: dungeon-finder insert follows own roles; wrong offset misreads members
- 87 R: offline BG member reads as offline
- 98 R: you-left form has no members or loot block
- 107 F: invite status asserted as 0, the default; use a non-zero status so a dropped status read fails

### packages/core/src/wow/protocol/group-stats.test.ts
- 27 R: warrior rage, power type and auras mask decode
- 63 R: hunter pet fields and vehicle seat
- 94 R: zero pet guid reads as explicit no-pet (null)
- 99 R: pet stays undefined when mask has no pet field
- 104 R: full reply with default mana power type, position and auras
- 131 R: offline full reply invents no power type
- 144 R: negative y stays negative (signed i16)
- 155 R: fields after a partial mask stay aligned
- 170 R: full guid with a high part kept
- 179 R: every status bit named
- 204 R: request writes full guid as u64

### packages/core/src/wow/protocol/group.test.ts
- 17 R: invite writes name and trailing u32 zero
- 27 R: accept writes u32 zero
- 36 R: decline sends an empty body
- 42 R: uninvite writes name cstring
- 51 R: disband sends an empty body
- 57 R: set-leader writes 8-byte guid
- 67 R: party command result success fields
- 81 R: party command result error code
- 94 R: set-leader reads the name
- 104 R: decline reads the player name

#### Seams
- none: no test-only exports or getters kept alive by this lane

#### Defects
- packages/core/src/wow/protocol/auth.test.ts:18 name says 'correct packet' but asserts only opcode and account tail

## core-protocol-2

### packages/core/src/wow/protocol/guild-command.test.ts
- 12 R: pins GuildCommand ids to Guild.h; a wrong id sends the wrong command byte on the wire
- 35 R: pins bank-row GuildCommandError ids to Guild.h:138-142 (no literal-code test covers them)
- 47 D: restates the constant; keeper guild-command.test.ts:121 feeds literal 0x00 and expects success
- 51 D: restates the constant; keeper guild-command.test.ts:187 feeds literal 0x0b and expects the not-found branch
- 55 D: restates the constant; keeper guild-command.test.ts:169 feeds literal 0x08 and expects the permission branch
- 61 R: SMSG_GUILD_COMMAND_RESULT reads u32 command, cstring name, u32 result in order
- 74 R: empty name still consumes the cstring terminator before the result
- 87 R: result packet consumed fully; a missing field leaves bytes
- 99 R: invite packet reads inviter then guild name
- 110 R: invite packet consumed fully
- 121 R: success code 0 yields undefined so no error is reported
- 127 F: code-to-label table the agent reads (formatGuildCommandError, guild.ts:285); keep the values, drop the sentences. Collapse 127-223 into one table over codes 0x01-0x13 asserting each message is `[guild]`-prefixed, distinct from every other code's message and from the generic 255 fallback (no status code tells the branches apart in the text), and for name-carrying codes toContain(name)
- 133 F: 0x02 no name; fold into the table of 127; keep only the distinct-label assertion; no name is rendered, drop the full sentence toBe
- 139 F: 0x03 name; fold into the table of 127; toContain(the substituted name) is the value to keep, drop the full sentence toBe
- 145 F: 0x04 no name; fold into the table of 127; keep only the distinct-label assertion; no name is rendered, drop the full sentence toBe
- 151 F: 0x05 name; fold into the table of 127; toContain(the substituted name) is the value to keep, drop the full sentence toBe
- 157 F: 0x06 no name; fold into the table of 127; keep only the distinct-label assertion; no name is rendered, drop the full sentence toBe
- 163 F: 0x07 name; fold into the table of 127; toContain(the substituted name) is the value to keep, drop the full sentence toBe
- 169 F: 0x08 no name; fold into the table of 127; keep only the distinct-label assertion; no name is rendered, drop the full sentence toBe
- 175 F: 0x09 no name; fold into the table of 127; keep only the distinct-label assertion; no name is rendered, drop the full sentence toBe
- 181 F: 0x0a name; fold into the table of 127; toContain(the substituted name) is the value to keep, drop the full sentence toBe
- 187 F: 0x0b name; fold into the table of 127; toContain(the substituted name) is the value to keep, drop the full sentence toBe
- 193 F: 0x0c name; fold into the table of 127; toContain(the substituted name) is the value to keep, drop the full sentence toBe
- 199 F: 0x0d name; fold into the table of 127; toContain(the substituted name) is the value to keep, drop the full sentence toBe
- 205 F: 0x0e name; fold into the table of 127; toContain(the substituted name) is the value to keep, drop the full sentence toBe
- 211 F: 0x11 no name; fold into the table of 127; keep only the distinct-label assertion; no name is rendered, drop the full sentence toBe
- 217 F: 0x12 no name; fold into the table of 127; keep only the distinct-label assertion; no name is rendered, drop the full sentence toBe
- 223 F: 0x13 name; fold into the table of 127; toContain(the substituted name) is the value to keep, drop the full sentence toBe
- 229 R: unknown code falls back to a generic error carrying the numeric code (no throw)

### packages/core/src/wow/protocol/guild-event.test.ts
- 15 R: MOTD event reads count byte then one cstring param
- 27 R: PROMOTION reads three params
- 41 R: DISBANDED with zero params
- 52 R: SIGNED_ON consumes the trailing guid; code is in HAS_TRAILING_GUID
- 67 R: JOINED is in HAS_TRAILING_GUID; a missing entry leaves 8 bytes
- 78 R: LEFT is in HAS_TRAILING_GUID; a missing entry leaves 8 bytes
- 89 R: SIGNED_OFF is in HAS_TRAILING_GUID; a missing entry leaves 8 bytes
- 100 R: REMOVED reads two params with no trailing guid
- 113 R: LEADER_CHANGED reads two params
- 126 R: unknown event type returns code and empty params without throwing
- 137 R: CMSG_GUILD_INVITE body is one cstring, nothing else
- 146 R: CMSG_GUILD_REMOVE body is one cstring
- 155 R: CMSG_GUILD_PROMOTE body is one cstring
- 164 R: CMSG_GUILD_DEMOTE body is one cstring
- 173 R: CMSG_GUILD_LEADER body is one cstring
- 182 R: CMSG_GUILD_MOTD body is one cstring
- 189 R: empty motd clears the message as a lone terminator

### packages/core/src/wow/protocol/guild.test.ts
- 23 R: pins OFFLINE=0 wire value; roster parsing is self-consistent with the enum so only this catches drift
- 27 R: pins ONLINE=1 wire value; same reason
- 42 R: empty roster layout (count, motd, info, rank count)
- 57 R: motd and guild info strings read in order
- 70 R: rank blocks skipped at the right size
- 85 R: two members: online omits time offline, offline reads float; all member fields
- 149 R: online member does not read a float; a bad branch eats the next field
- 172 R: offline member reads float time offline
- 197 R: roster with ranks and members consumed fully
- 233 R: guild query response id, name, emblem, rank count
- 251 R: ten rank-name slots, unused empty
- 280 R: live 91-byte unconfigured-emblem packet parses
- 298 R: truncated query response throws RangeError
- 332 R: rank rights, gold per day and six tab pairs
- 348 R: offline time offline read after area
- 368 R: CMSG_GUILD_QUERY body is a u32 LE guild id
- 376 D: another id for the same u32 write, no new branch; keeper guild.test.ts:368
- 382 R: id above 2^31 stays unsigned in the u32
- 390 R: pins GuildEvents ids to Guild.h:145-165
- 406 R: bank money event carries a param and no trailing guid
- 420 C packages/core/src/wow/protocol/guild-event.test.ts:52: same SIGNED_ON trailing-guid branch
- 434 C packages/core/src/wow/protocol/guild-command.test.ts:61: same command-result read via fixture builder; builder-vs-parser agreement adds nothing

### packages/core/src/wow/protocol/inventory.test.ts
- 22 R: parses ok, error with guids and bag type, and unknown 255 as raw bytes
- 53 R: level, binding and limit detail tails keyed by result
- 92 R: CMSG_DESTROYITEM bytes against captured client packets
- 98 R: captured full-bags reply parses to inventory_full
- 108 R: result names (inventory_full etc.) are agent-facing keys; unknown stays readable
- 122 R: failure naming the request's item belongs to it
- 135 R: item-less failure owned only while no other request waits
- 149 R: other item or ok result belongs to nobody
- 161 R: EQUIP_ERR_NONE is a no-change notice, not a refusal

### packages/core/src/wow/protocol/item.test.ts
- 96 R: CMSG_USE_ITEM byte layout with self target, against AzerothCore reader
- 110 R: glyphIndex written at its offset
- 123 C packages/core/src/wow/protocol/item.test.ts:96: default zero glyph bytes are already part of the full-array assertion there
- 136 R: object target mask and guid after the cast flags
- 154 R: item query body is the entry u32
- 158 R: whole item template parse with remaining bytes
- 195 R: stats counts 0 and 10 boundaries
- 209 R: missing spell leaves empty spells
- 219 R: tail after spells parsed
- 259 R: captured live response and unknown-entry capture
- 332 R: high-bit entry reported as unknown

### packages/core/src/wow/protocol/loot.test.ts
- 31 R: loot/release write full unpacked guid; autostore writes the slot byte
- 39 R: loot response slots, money, signed random property, consumed fully
- 70 R: rejection parses as error kind
- 79 R: empty successful window differs from rejection
- 90 R: item push fields and total count
- 106 R: money notify alone flag
- 115 R: release status and removed slot

### packages/core/src/wow/protocol/monster-move.test.ts
- 36 R: stop packet has no path tail
- 58 R: linear last_idx 1 is start plus destination
- 86 R: packed offsets reconstruct signed intermediate points
- 112 R: facing angle then catmull-rom points
- 141 R: cyclic spline drops the closing start
- 174 R: truncated packed offset throws
- 196 R: unknown move type throws
- 206 R: elapsed, duration, nodes, final parse
- 242 R: final target guid unpacked
- 272 R: truncated node throws
- 293 F: expected value is parseMonsterMove itself, which calls the body parser; assert a literal result

### packages/core/src/wow/protocol/movement-block-speeds.test.ts
- 13 F: re-lists CREATE_SPEED_ORDER and maps through it (expected from the code under test); keep the alias and remaining asserts, order is pinned by 36
- 36 R: nine distinct speeds land on their kinds, pins create order
- 53 R: block without LIVING has no speeds

### packages/core/src/wow/protocol/movement-block-trailer.test.ts
- 8 R: HIGH_GUID trailer consumes its u32
- 22 R: LOW_GUID trailer consumes its u32
- 36 R: attacking-target trailer consumes a packed guid
- 50 R: TRANSPORT trailer consumes its u32
- 64 R: VEHICLE trailer consumes id and orientation
- 79 C packages/core/src/wow/protocol/movement-rotation.test.ts:12: same ROTATION trailer; there add a remaining==0 check
- 94 R: LIVING plus trailers combined stay aligned
- 121 R: vehicle id and orientation values
- 144 R: motion transport path progress
- 162 R: path progress after attacking target guid
- 180 R: no transport flag gives no path progress
- 188 R: POSITION block on transport guid and offset
- 209 R: POSITION off transport has no guid or offset

### packages/core/src/wow/protocol/movement-block.test.ts
- 9 R: LIVING block basics, speeds, flags consumed
- 31 R: LIVING with SELF turn rate
- 51 R: HAS_POSITION only layout
- 68 R: POSITION flag layout
- 90 R: FALLING adds fall block and stays aligned
- 114 R: ON_TRANSPORT adds transport block
- 141 R: interpolated transport adds time
- 169 R: SWIMMING adds pitch
- 190 R: SPLINE_ELEVATION adds a float
- 211 R: SPLINE_ENABLED with no final flags
- 244 R: FINAL_ANGLE spline tail
- 276 R: FINAL_TARGET spline tail
- 308 R: FINAL_POINT spline tail
- 342 R: spline nodes parsed

### packages/core/src/wow/protocol/movement-rotation.test.ts
- 8 R: zero packed rotation is identity quaternion
- 12 R: real shrine quaternion unpacks to reference components

### packages/core/src/wow/protocol/movement.test.ts
- 44 R: idle MovementInfo is 30 bytes and round-trips
- 55 D: FORWARD adds no bytes, same 30-byte assertion with no new branch; keeper movement.test.ts:44
- 61 R: falling writes the fall block
- 78 R: swimming writes pitch
- 87 R: flying writes pitch
- 96 R: pitch not written without a pitch flag
- 102 R: always-allow-pitching extra flag writes pitch
- 111 R: parser skips transport block
- 137 R: parser reads interpolated transport time
- 163 R: fall extras order z, sin, cos, xy
- 182 R: move message prefixed by packed guid
- 191 R: teleport ack counter and time
- 200 R: speed ack echoes exact f32 bits
- 214 R: root ack counter and info
- 223 R: set-active-mover full guid
- 230 R: set-selection unpacked guid incl. zero
- 239 R: login verify world position layout
- 261 R: flag ack applied flag after info
- 273 R: move counter guid and counter
- 281 R: teleport ack parse
- 293 R: knock back field order
- 310 R: run speed extra byte skipped
- 324 R: other speed kinds read directly
- 335 R: client control allow flag

### packages/core/src/wow/protocol/opcodes.test.ts
- 8 R: previously declared opcode numbers must not move when generation changes
- 16 R: opcode values unique, so dispatch never confuses two names

### packages/core/src/wow/protocol/packed-time.test.ts
- 50 R: AzerothCore layout, 1-based month and day
- 61 R: top byte unsigned (year 2155)
- 72 R: reads u32 from packet and leaves the next field
- 85 R: pack then parse returns the same time
- 97 R: live captured value 0x1a906bcf
- 110 D: replays 97 with minute+1, no new branch; keeper packed-time.test.ts:97
- 123 R: year range 2025..2031 accepted, 2032 and 1999 rejected
- 140 R: month 0 and 13 rejected
- 153 R: day, weekday, hour, minute out of range rejected
- 169 R: writePackedTime writes one u32 and reads back

### packages/core/src/wow/protocol/packet.test.ts
- 9 R: uint8 write/read primitive
- 16 R: uint16LE primitive
- 23 R: uint16BE primitive
- 30 R: uint32LE above 2^31 stays unsigned
- 37 R: int32LE signed boundaries
- 50 R: cString read stops at terminator
- 56 R: cString write appends terminator
- 63 R: bytes read advances
- 70 R: rawBytes write ordering
- 77 R: writer growth beyond initial capacity
- 88 R: remaining count
- 94 R: floatLE round trip
- 101 R: cString without terminator reads to end
- 108 R: bytes beyond remaining throws RangeError
- 113 R: reader offset tracking
- 122 R: writer offset tracking
- 131 R: packed guid all mask bits
- 140 R: packed guid low bytes only
- 147 R: packed guid zero
- 154 R: packed guid sparse mask
- 162 R: uint64LE read
- 168 R: uint64LE large value
- 176 R: uint64LE advances 8
- 185 R: uint64LE write size
- 194 R: uint64LE write large round trip
- 211 R: zero guid single mask byte
- 215 R: low-only guid size 3
- 222 R: full guid round trip
- 228 R: zero bytes in the middle skipped, mask 0b0101
- 238 R: joinGuid unsigned halves
- 246 R: splitGuid inverse
- 255 R: packedGuidBig round trip
- 265 R: vec3 round trip
- 282 R: sizedString strips counted terminator
- 288 R: sizedString without terminator

#### Seams
- packages/core/test-support/previous-game-opcodes.json: fixture only opcodes.test.ts reads

#### Defects
- none

## core-protocol-3

### packages/core/src/wow/protocol/pet-spells.test.ts
- 35 R: parses SMSG_PET_SPELLS pet form (slots, cooldowns, infinite sentinel, length) per Player::PetSpellInitialize; a layout slip loses actions
- 85 R: vehicle form keeps 0x800 flags and empty slots, pins raw slot bytes; wrong flag read breaks vehicle bars
- 123 R: clear form is a zero guid with no further reads; over-read would throw on every pet dismiss

### packages/core/src/wow/protocol/pet.test.ts
- 6 R: CMSG_PET_ACTION attack layout (guid, ACT_COMMAND action, target guid, no trailing); pet attack would misfire
- 19 C packages/core/src/wow/protocol/pet.test.ts:6: same bytes as raw array, no new branch

### packages/core/src/wow/protocol/quest-log.test.ts
- 18 R: remove-quest writes the log slot byte; wrong slot abandons the wrong quest
- 24 R: add-kill keeps uint32 counters and decodes gameobject credit sign (-321); two's-complement bug misreports objectives
- 41 R: empty add-item body is a notification versus explicit item/count, and consumes all bytes
- 54 R: invalid reason keeps unknown reasons, failed carries quest id and reason, update complete/failed/timer ids

### packages/core/src/wow/protocol/quest-query.test.ts
- 42 R: query request is the quest id as uint32
- 48 R: full SMSG_QUEST_QUERY_RESPONSE layout over fixed bytes (rewards, factions, signed fields, strings); any field shift breaks quest data

### packages/core/src/wow/protocol/questgiver.test.ts
- 71 R: five questgiver request builders match byte layouts incl. trailing fields
- 91 R: one-byte status and one-byte quest-list count, entry fields and string
- 122 R: quest details divider, unknown byte, signed rewards, emote-first order on fixed bytes
- 140 R: offer-reward one-byte enable-next, delay-first emotes, extra unknown field
- 155 R: request-items money, items and four completion flags
- 172 R: zero reward counts do not suppress spell/faction tail; branch with empty choices/items
- 191 R: objective-only request has no items and keeps flags; empty-items branch of request items
- 203 R: quest complete reads six words without speculative item tails

### packages/core/src/wow/protocol/remote-movement.test.ts
- 86 R: captured AzerothCore heartbeat parses after packed guid; reference bytes
- 105 R: observer flag-change opcodes parse as MovementInfo and reject trailing counters; opcode-to-layout routing
- 126 R: transport, pitch, fall, spline and flag bits; conditional-branch field order
- 149 R: every truncation boundary and a trailing byte throw RangeError; malformed packets must not yield partial positions
- 160 R: non-finite floats rejected in world and optional branches; NaN positions would poison world state
- 174 R: forced-self, ack and unknown opcodes rejected before any read; routing guard
- 195 R: collision height takes exactly one finite float, rejects short/long/infinite
- 207 R: nine speed opcodes take exactly one finite float; a mis-mapped opcode misparses speeds
- 231 R: captured teleport keeps ordinary layout with teleport transition
- 245 R: knockback four-float tail after falling body; short/long rejected
- 263 R: time skipped is a u32 after the guid, rejects 3 and 5 bytes
- 277 R: compressed moves inflate and split by size prefix
- 293 R: size mismatch and overrunning subpacket are rejected

### packages/core/src/wow/protocol/social.test.ts
- 17 R: only literal pin of the SocialFlag wire value; parser tests use the symbol so a wrong constant would pass them
- 21 R: IGNORED wire value, same reason as 17
- 25 R: MUTED wire value, same reason as 17
- 31 R: FriendStatus OFFLINE wire value; parser branches on status 0
- 35 R: FriendStatus ONLINE wire value
- 39 R: FriendStatus AFK wire value
- 43 R: FriendStatus DND wire value
- 49 R: FriendResult DB_ERROR wire value; only literal pin
- 53 R: FriendResult LIST_FULL wire value
- 57 R: FriendResult ONLINE wire value; parser branches on it
- 61 R: FriendResult OFFLINE wire value
- 65 R: FriendResult NOT_FOUND wire value
- 69 R: FriendResult REMOVED wire value
- 73 R: FriendResult ADDED_ONLINE wire value; parser branches on it
- 77 R: FriendResult ADDED_OFFLINE wire value; parser branches on it
- 81 R: FriendResult ALREADY wire value
- 85 R: FriendResult SELF wire value
- 89 R: FriendResult ENEMY wire value
- 95 R: add-friend writes name and note CStrings, no trailing bytes
- 103 R: empty note still writes an empty CString (terminator present)
- 113 R: del-friend writes guid as uint64LE
- 120 C packages/core/src/wow/protocol/social.test.ts:113: zero guid is the same body path, no new branch
- 129 R: add-ignore writes only the name CString
- 138 R: del-ignore is a separate builder; guid uint64LE
- 147 R: empty contact list parses count 0 and listMask
- 157 R: online friend reads status, area, level, class; non-zero status branch
- 181 R: offline friend reads no area/level/class; status 0 branch
- 201 C packages/core/src/wow/protocol/social.test.ts:157: AFK takes the same non-zero status branch as online
- 221 R: ignored entry reads no status fields; non-friend branch
- 241 R: mixed list keeps entry sequencing across friend/ignored/offline entries
- 286 R: ADDED_ONLINE reads note then online info
- 306 R: ADDED_OFFLINE reads note, no online info
- 322 R: ONLINE reads online info but no note
- 341 R: OFFLINE reads only result and guid; the bare branch
- 354 C packages/core/src/wow/protocol/social.test.ts:341: REMOVED takes the same bare result+guid branch
- 366 C packages/core/src/wow/protocol/social.test.ts:341: NOT_FOUND takes the same bare branch
- 376 C packages/core/src/wow/protocol/social.test.ts:341: ALREADY takes the same bare branch
- 386 C packages/core/src/wow/protocol/social.test.ts:341: SELF takes the same bare branch
- 396 C packages/core/src/wow/protocol/social.test.ts:341: ENEMY takes the same bare branch
- 406 C packages/core/src/wow/protocol/social.test.ts:341: LIST_FULL takes the same bare branch
- 416 C packages/core/src/wow/protocol/social.test.ts:341: DB_ERROR takes the same bare branch

### packages/core/src/wow/protocol/spell-cast-result.test.ts
- 4 R: SpellCastResult codes map to the reason strings the agent sees (out_of_range, interrupted, ...)
- 14 R: out-of-enum codes (188, 255, -1) map to unknown; boundary of the table

### packages/core/src/wow/protocol/spell-targets.test.ts
- 17 R: no target writes zero mask only (SpellCastTargets::Read)
- 21 R: unit writes mask 0x02 and packed guid
- 27 R: object writes game-object mask and packed guid on a full high-guid
- 33 R: item writes item mask and packed guid
- 39 R: destination writes dest mask, zero transport and three floats

### packages/core/src/wow/protocol/spell.test.ts
- 24 R: CMSG_CAST_SPELL count, spell, flags and unit target bytes
- 30 R: self target (guid 0) writes empty target flags; the none branch via buildCastSpell
- 38 C packages/core/src/wow/protocol/spell-targets.test.ts:27: same object-target bytes through writeSpellTargets, which buildCastSpell calls
- 52 R: cancel cast writes unused counter then spell id
- 60 R: initial spells read uint32 ids and empty cooldowns
- 71 R: initial cooldown reads uint32 spell id and infinity category sentinel
- 90 R: initial spells stop at packet end when cooldown count overstates; truncation recovery
- 112 R: spell start reads packed identities, timer and empty targets
- 129 R: negative timer stays signed
- 139 R: power read after POWER_LEFT_SELF with packed unit target
- 153 R: ammo after PROJECTILE flag skipping unknown pair, fully consumed
- 164 R: dest location with packed transport then xyz
- 182 R: spell go unpacked hit and miss guids with reflect extra
- 198 R: rune list reads cooldown bytes only for consumed runes
- 208 R: dest extra byte follows by target mask, not cast flag
- 222 R: cast failed with no extra args
- 234 R: requires-spell-focus extra is one uint32
- 242 R: equipped-item-class extra is two uint32s
- 255 R: spell failure reads packed caster
- 269 R: cooldown reads unpacked guid, flags and pairs
- 287 R: spell delayed reads caster and delay fully
- 295 R: cooldown notice reads spell and guid
- 305 R: learned spell reads the id and ignores the trailer
- 313 R: removed spell reads the id
- 321 R: superseded reads old rank then new rank

### packages/core/src/wow/protocol/stubs.test.ts
- 11 R: SMSG_INIT_WORLD_STATES stays out of the stub table so the place handler owns it
- 17 R: stub table entries are registered as handlers on the dispatch
- 25 R: an opcode already owned is skipped; real handler still runs and no double-register throw
- 37 C packages/core/src/wow/protocol/stubs.test.ts:56: notify-once is also asserted by the retry test's final receipts
- 56 R: notify returning false retries on the next receipt, then notifies once
- 82 F: toEqual pins the whole notice incl. the sentence "[peon] <label> is not yet implemented"; keep opcode and label fields and assert `text` toContain(STUB_EXAMPLE_LABEL) (label is looked up from the stub table and substituted into the text the agent reads); drop the "[peon] ... is not yet implemented" wording pin
- 103 R: every stub opcode is a SMSG_/MSG_ server opcode; guards a client opcode in the table

### packages/core/src/wow/protocol/talent-spec.test.ts
- 7 R: empty spec still reads six glyph slots (Player.cpp)
- 16 R: two talents and one glyph keep 0-based ranks
- 35 R: reads exactly the wire glyph count and leaves following bytes

### packages/core/src/wow/protocol/trainer.test.ts
- 21 R: trainer list and buy requests match captured client bytes
- 26 R: list reads 38-byte spell records and greeting from capture
- 46 R: buy success/failure parse, failure reason names (not_enough_money) and unknown fallback

### packages/core/src/wow/protocol/update-fields.test.ts
- 9 R: generated update-field offsets/sizes must not move from the pre-generation snapshot; guards a generator regression that shifts fields

### packages/core/src/wow/protocol/update-mask.test.ts
- 12 R: zero blocks gives an empty mask
- 18 R: single field in the first block maps to its index
- 29 R: multi-block mask from reference data maps indices 0..68
- 52 R: all 32 bits in one block read in order
- 65 R: reader consumes exactly the mask and values; later bytes untouched
- 76 R: all-zero second block consumes no values and keeps the later field at index 2
- 90 R: bit 31 and bit 32 block boundary

### packages/core/src/wow/protocol/update-object.test.ts
- 82 R: CREATE_OBJECT2 for a player parses guid, type, position, six fields, fully consumed
- 115 R: create stamps the supplied map id and the SELF flag
- 131 R: VALUES update parses guid and field map
- 151 R: MOVEMENT update parses position block
- 172 R: OUT_OF_RANGE guid list
- 192 R: NEAR_OBJECTS guid list (distinct update type)
- 212 R: multiple objects keep sequence in one packet
- 236 R: game-object create with has-position block
- 262 R: transport create carries path progress
- 276 R: create without placement flag has no position
- 294 R: unknown object type ends the packet instead of misparsing
- 303 R: zero-count packet returns an empty array
- 313 R: malformed movement entry ends parsing and names its guid; earlier entries survive

### packages/core/src/wow/protocol/vendor.test.ts
- 31 R: list/sell/buy requests match captured client packets
- 40 R: repair-all matches capture (zero item guid, no guild bank)
- 46 R: innkeeper list keeps 1-based slots and unlimited stock (null) over capture
- 70 R: empty list carries the no-inventory code
- 79 R: sell failure result names (cant_find_vendor, cant_sell_item) over captures
- 95 R: buy-item reply reports slot, null stock and count
- 104 R: buy-failed names not_enough_money and falls back to buy_result_99

### packages/core/src/wow/protocol/world-states.test.ts
- 15 R: reads map, zone, area and every state from a captured packet
- 27 R: packet with no states
- 36 R: truncated state list throws RangeError

### packages/core/src/wow/protocol/world.test.ts
- 16 F: only asserts byteLength > 6; assert the header opcode and body fields (account, seed digest layout)
- 28 R: parseCharacterList reads name, guid, race, class, level, zone, map across the full record layout
- 73 C packages/core/src/wow/protocol/world.test.ts:92: handler firing on a matching opcode is asserted there with ordering
- 83 C packages/core/src/wow/protocol/world.test.ts:106: waiter resolution is asserted there for two waiters
- 92 R: handler runs before the waiter, both reading the body start
- 106 R: overlapping waiters on one opcode resolve in order
- 116 R: timeout rejects only its own waiter; later waiter still resolves
- 131 R: a rejecting match leaves the waiter queued, a later waiter takes the packet
- 141 R: throwing handler rejects the waiter, rethrows, keeps the next waiter
- 156 R: throwing match is a non-match, not an exception
- 166 R: accumulator appends across chunks and drains in order
- 179 R: peek does not consume
- 187 R: outgoing header size, opcode and body without encryption
- 198 F: encrypts header but asserts only length and body byte; assert header bytes differ from plain and equal the reference Arc4 keystream
- 208 R: incoming header size and opcode without encryption
- 218 D: restates the declared constant; incoming header width is exercised by world.test.ts:208
- 222 D: restates the declared constant; outgoing header width is exercised by world.test.ts:187
- 227 C packages/core/src/wow/protocol/world.test.ts:365: has() false for an unregistered opcode asserted there
- 232 C packages/core/src/wow/protocol/world.test.ts:365: has() true after on() asserted there
- 238 R: second handler refused, first kept
- 249 R: unhandled opcode reported once, counted per occurrence
- 262 R: held-back unhandled report retried on later packets
- 278 R: handler or waiter taken opcodes are not counted unhandled
- 296 R: peek runs after the owner
- 305 R: peek reads a fresh fork after the owner consumed the body
- 314 R: peek runs after the waiter step; waiter still reads the body
- 327 R: peek never runs when the owner throws
- 340 R: peek error is reported and later peeks still run
- 358 R: peek without an owner refused
- 365 R: peek registration leaves has() to owners

#### Seams
- packages/core/src/wow/protocol/world.ts `unhandledCounts`: no non-test caller outside world.test.ts
- packages/core/test-support/previous-update-fields.json: frozen snapshot only update-fields.test.ts reads

#### Defects
- none

## core-world-handlers

### packages/core/src/wow/world-handlers-channels.test.ts
- 14 R: SMSG_CHANNEL_NOTIFY YOU_LEFT removes the channel and renumbers the list; a wrong index map misroutes /1 /2
- 42 R: asserts getChannel(3) and toContain("MyChannel"), the channel name substituted into the join message the agent reads; both are values, keep
- 79 F: sentence-equality on "Wrong password for Secret"; keep SYSTEM type, assert toContain("Secret") (name) and /wrong password/i (label mapped from the code), drop the full sentence
- 114 R: default sticky chat mode is say
- 129 R: setLastChatMode stores the mode the next send uses
- 145 R: sendInCurrentMode with default mode sends SAY
- 165 R: whisper mode sends a whisper to the stored target and keeps the mode
- 189 R: yell branch of the mode switch sends CHAT_MSG_YELL
- 210 R: guild branch of the mode switch sends GUILD
- 231 R: party branch of the mode switch sends PARTY
- 252 R: raid branch of the mode switch sends RAID
- 273 R: emote branch of the mode switch sends EMOTE
- 294 R: channel branch of the mode switch sends CHANNEL with the channel name
- 315 R: CMSG_JOIN_CHANNEL layout (channel id, flags, name, password) read back from the wire
- 343 R: CMSG_LEAVE_CHANNEL layout read back from the wire

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/world-handlers-chat.test.ts
- 16 D: assertion-free probe (only waits for the echo); the time-sync response is asserted at packages/core/src/wow/logout.test.ts:69
- 31 R: empty whisper target neither sends nor poisons the sticky mode
- 47 R: sendWhisper reaches the server and comes back with the message
- 72 C packages/core/src/wow/world-handlers-channels.test.ts:14: same initial General/Trade population is asserted there before the leave
- 93 R: who query returns the parsed result row
- 112 R: sendSay uses the SAY chat type
- 132 R: sendYell uses the YELL chat type
- 152 R: sendParty uses the PARTY chat type
- 172 R: sendRaid uses the RAID chat type
- 192 R: sendEmote uses the EMOTE chat type
- 212 R: sendDnd uses the DND chat type
- 232 R: sendAfk uses the AFK chat type
- 252 R: sendChannel keeps the channel name on the echoed message
- 273 R: a handler throwing on a short body reaches onPacketError with the opcode
- 299 C packages/core/src/wow/client-handlers.test.ts:135: notice text template asserted there; the opcode-to-label value "Ambiguous player name" is pinned by registry.test.ts:64 and this test's label filter; drop the sentence toBe

#### Seams
- packages/core/test-support/mock-world-server.ts `sendTimeSyncAfterLogin`: only chat.test.ts:16 uses it; goes with that D

#### Defects
- none

### packages/core/src/wow/world-handlers-contact-list.test.ts
- 17 R: contact list friend entry keeps guid, status, area, level, class and note and fires friend-list
- 63 R: ignored flag entries are kept out of the friend list
- 108 R: each friend triggers a CMSG_NAME_QUERY and the response fills the name
- 167 R: ignore entries land in the ignore store and fire ignore-list
- 204 R: ignored entries also trigger name queries and the response fills the ignore name

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/world-handlers-contact-mask.test.ts
- 52 R: friends-only list mask replaces friends and keeps ignores; a mask bug wipes the ignore list
- 78 R: ignore-only mask replaces ignored and keeps friends
- 94 R: mute-only mask touches neither list

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/world-handlers-duel.test.ts
- 14 R: six duel opcodes decode to ordered events with countdown ms and winner/loser strings
- 79 R: duel challenger name resolves from the name cache
- 123 R: accept after a duel request sends CMSG_DUEL_ACCEPTED with the duel flag guid
- 157 R: decline after a duel request sends CMSG_DUEL_CANCELLED with the guid

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/world-handlers-entity-lifecycle.test.ts
- 28 R: CREATE resets public fields only for that entity lifetime, life state and shapeshift transitions, destroy clears
- 116 R: creature create followed by query response updates the name
- 160 R: values update emits changed health
- 198 R: movement block updates position
- 239 R: out-of-range block disappears both guids and empties nearby
- 285 R: SMSG_DESTROY_OBJECT removes the entity
- 322 R: gameobject query response sets name and gameObjectType on the live entity
- 374 R: partial CREATED_BY update keeps the unchanged high half of the GUID

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/world-handlers-entity-queries.test.ts
- 25 R: player create triggers a name query and the response backfills the name
- 59 R: compressed update object is inflated and processed
- 90 R: a cached creature name is applied at the next create without a second query
- 135 F: name promises more than asserted; only checks an update event type then sends an out-of-range block with no assertion; assert changed includes flags and the removal
- 179 R: compressed size mismatch reaches onPacketError
- 208 R: corpse create keeps object type 7 as a base entity
- 240 R: a cached game object name is applied at the next create

#### Seams
- none

#### Defects
- packages/core/src/wow/world-handlers-entity-queries.test.ts:135 name says "gameobject values update" but the tail (out-of-range block) asserts nothing

### packages/core/src/wow/world-handlers-entity.test.ts
- 14 R: create block feeds unitmotion with flags and nine speeds from the create source
- 55 R: destroying a unit removes it from unitmotion
- 73 R: movement block only seeds a unit the entity store holds

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/world-handlers-friend-status.test.ts
- 19 R: FRIEND_STATUS ADDED_ONLINE adds the friend with all fields and fires friend-added
- 63 R: ONLINE updates an existing friend's status, area, level and class
- 120 R: OFFLINE zeroes the status of a known friend
- 173 R: REMOVED deletes the friend from the store
- 225 R: ADDED_OFFLINE adds with status 0 and the note
- 262 R: error result fires friend-error with the result code
- 295 R: addFriend writes CMSG_ADD_FRIEND name and empty note
- 321 R: removeFriend looks up the guid by name and sends CMSG_DEL_FRIEND with the guid
- 372 F: sentence pin '"Nobody" is not on your friends list.'; keep SYSTEM type plus toContain("Nobody") (substituted name), drop the sentence; assert no CMSG_DEL_FRIEND went out

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/world-handlers-group.test.ts
- 26 R: accept after a group invite sends CMSG_GROUP_ACCEPT with the zero flag
- 63 R: decline after a group invite sends an empty CMSG_GROUP_DECLINE
- 99 F: status 0 invite leaves seen empty (contract); message has no value, drop the "Nothing to accept." toBe, assert SYSTEM type and no CMSG_GROUP_ACCEPT sent
- 130 R: nine group opcodes decode to ordered events including member stats
- 210 R: group_list leader resolves to the member name when the guid matches self
- 245 F: sentence pin '"Ghostplayer" is not in your party.'; keep SYSTEM type plus toContain("Ghostplayer") (substituted name), drop the sentence; assert no leader packet was sent
- 270 F: assertion-free (six commands, no capture); assert the CMSG_GROUP_INVITE/UNINVITE/DISBAND/SET_LEADER bodies
- 309 R: sendRoll writes MSG_RANDOM_ROLL min and max
- 335 R: MSG_RANDOM_ROLL becomes a ROLL message with sender and the rolled text
- 367 D: same guid 0x42 and branch as 335, which already asserts the resolved sender and the computed min/max/result text; keeper packages/core/src/wow/world-handlers-group.test.ts:335

#### Seams
- none

#### Defects
- packages/core/src/wow/world-handlers-group.test.ts:367 name says unknown roller resolved via name query, but it uses the same guid as :335, so it proves nothing new

### packages/core/src/wow/world-handlers-guild-events.test.ts
- 34 R: guild event code 10 decodes rank id, name and rank count
- 44 R: code 11 decodes rank count
- 48 R: code 15 has no parameters
- 52 R: code 16 decodes tab id, name, icon
- 62 R: code 17 decodes the 16-hex balance to bigint 3200
- 67 R: code 18 is a bank reset
- 73 R: command_result event for success result 0 with command 0

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/world-handlers-guild-unit.test.ts
- 37 R: event 1 decodes officer, member, rank
- 47 R: event 2 decodes motd text
- 52 R: event 3 decodes name and ignores the trailing guid
- 57 R: event 4 decodes name
- 62 R: event 5 keeps member and officer order
- 71 R: event 6 leader_is
- 76 R: event 7 keeps old and new leader order
- 85 R: event 8 disbanded
- 90 R: event 13 signed_off
- 97 R: SMSG_GUILD_COMMAND_RESULT error code keeps command, name, result
- 115 C packages/core/src/wow/world-handlers-guild-events.test.ts:73: same success command_result branch
- 133 R: the command result handler survives having no subscriber
- 146 R: guild invite packet decodes inviter and guild name
- 162 R: the invite handler survives having no subscriber

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/world-handlers-guild.test.ts
- 58 R: roster packet populates motd and members and fires guild-roster
- 86 R: query response fills guild name and rank names on the roster
- 121 R: requestGuildRoster sends CMSG_GUILD_ROSTER and resolves with the roster
- 151 R: with a guild id requestGuildRoster also sends CMSG_GUILD_QUERY with that id and merges the names
- 191 R: truncated query response rejects the pending roster at once
- 217 R: SMSG_GUILD_EVENT signed_on routes to a guild event with the name
- 249 R: SMSG_GUILD_EVENT promotion routes with officer, member, rank
- 284 R: unknown guild event type emits nothing
- 310 F: only opcode presence for remove/promote/demote/leader/accept/decline; assert their body names
- 364 R: SMSG_GUILD_COMMAND_RESULT opcode routing end to end; client-social.test.ts:92 covers a different path
- 397 R: SMSG_GUILD_INVITE opcode routing end to end to guild_invite

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/world-handlers-ignore.test.ts
- 19 R: IGNORE_ADDED adds to the ignore store and fires ignore-added
- 53 R: IGNORE_REMOVED removes from the ignore store
- 100 R: ignore error fires ignore-error with the result code
- 133 R: a message from an ignored sender is dropped, delivered again after removal
- 179 R: addIgnore writes CMSG_ADD_IGNORE name
- 204 R: removeIgnore looks up the guid and sends CMSG_DEL_IGNORE with it
- 251 F: sentence pin '"Nobody" is not on your ignore list.'; keep SYSTEM type plus toContain("Nobody") (substituted name), drop the sentence; assert no CMSG_DEL_IGNORE went out

#### Seams
- none

#### Defects
- none

### packages/core/src/wow/world-handlers-system-messages.test.ts
- 18 F: name says second message skips the name query but never counts CMSG_NAME_QUERY captures; assert no second query
- 44 R: two sends before name resolution arrive in order with sender
- 78 R: zero-guid SYSTEM chat delivers with empty sender
- 114 R: GM chat takes the sender name from the packet
- 153 F: sentence pin 'No player named "Ghostplayer"...'; keep SYSTEM type plus toContain("Ghostplayer") (substituted name), drop the sentence
- 181 R: SMSG_MOTD lines are joined into one SYSTEM message
- 209 F: keep type/sender/origin server and toContain("15:00") (substituted param); code 1 label is pinned at protocol/chat-channel.test.ts:267; drop the full sentence toBe
- 238 R: SMSG_NOTIFICATION delivers with origin notification
- 266 F: origin mail already proves the branch and the text has no value; keep type and origin, drop the "You have new mail." toBe
- 291 F: code 1 maps to a restriction label; keep SYSTEM type and sender, replace the sentence toBe with toContain("throttled") (value mapped from the code)
- 318 F: unknown code 255 falls back to a text with the code; keep SYSTEM type and sender, replace the toBe with toContain("255") (computed value)
- 345 F: no code or origin tells this branch apart, so text is the only signal; keep type and sender, replace the full-sentence toBe with a tight /opposing faction/ regex
- 418 R: monster yell takes the embedded sender name with no name query
- 425 R: embedded name wins over an ignore-store hit

#### Seams
- none

#### Defects
- none

## core-wow-1

### packages/core/src/wow/action-bar.test.ts
- 10 R: ActionBarStore set/remove keeps slot order; a sort or delete regression misreports bar
- 23 R: SMSG_ACTION_BUTTONS replaces every set button (Player.cpp:5732-5758); stale buttons would survive login

### packages/core/src/wow/aura-store.test.ts
- 5 R: self-cast flag names the unit as caster and expiry hides the aura; a stale aura keeps showing
- 26 R: full update replaces only that unit's slots; clobbering another unit's auras
- 44 R: name resolver is applied only when known; a missing name must stay absent not 'undefined'

### packages/core/src/wow/auth.test.ts
- 78 R: end-to-end SRP against the mock auth server returns session key and realm address
- 93 R: non-zero logon challenge status rejects with the status; a hang or silent success
- 116 R: wrong account/key rejects at proof with status 0x5
- 137 R: bad server M2 is rejected; skipping server proof verification would pass
- 172 R: challenge split across two TCP reads is reassembled; fragmentation branch not covered by 210
- 210 R: empty realm list rejects with No realms available
- 245 R: reconnect challenge with cached key reuses the session key
- 270 R: reconnect challenge non-zero status rejects
- 301 R: reconnect proof non-zero status rejects
- 342 R: reconnect challenge without cached key throws ReconnectRequiredError (the retry signal)
- 360 R: authWithRetry returns on the first success
- 386 R: authWithRetry stops after maxAttempts on ReconnectRequiredError
- 407 R: authWithRetry does not retry non-reconnect errors

### packages/core/src/wow/char-create.test.ts
- 83 R: CMSG_CHAR_CREATE layout: name cstring then nine bytes, outfit 0
- 94 R: result code to name table; the names the agent sees on rejection
- 114 R: sends the create request, resolves success and never sends CMSG_PLAYER_LOGIN
- 135 R: trace sink retains the outgoing request and incoming reply bodies
- 169 R: unnamed-in-table code 0x3b rejects with reason name and hex code
- 189 R: no reply within the timeout rejects Timed out
- 200 R: world admission failure rejects World auth failed
- 211 R: promise settles only after the socket close is reported; leaking the connection
- 255 F: order only ever holds one entry so it cannot show record-before-close; also assert the failure was recorded/logged before close settles
- 279 R: disconnect while the reply is pending rejects closed and clears the long timer
- 303 R: disconnect during world auth rejects closed and clears the long timer

### packages/core/src/wow/client-chat.test.ts
- 73 R: guildless guild/officer chat sends nothing and reports NOT_IN_GUILD; chat to the server by a guildless character
- 89 R: guild member's guild and officer chat reach the server and set the last chat mode
- 102 R: character guild id field overrides the login id, both on join and leave
- 116 R: self create without GUILDID field keeps the login guild id; a missing field would unguild the character
- 134 R: reply target is the last whisperer, not our own outgoing whisper

### packages/core/src/wow/client-connection.test.ts
- 109 R: ping loop sequences 1,2 with the round trip in the second; wire layout of CMSG_PING
- 131 R: world auth waits through queue messages and resolves on AUTH_OK
- 153 R: queue wait gives up at 10 minutes naming the position; timeout boundary at 599_999/600_000 ms
- 176 R: refusal code 0x1d is named from SharedDefines; agent sees the reason
- 185 R: CHARACTER_LOGIN_FAILED fails at once with the server reason instead of waiting

### packages/core/src/wow/client-control.test.ts
- 58 R: nearby rows carry attackable, attackingMe and relation from the faction catalog and combat
- 68 R: the reputation area's view overrides faction relation (friendly by rank)

### packages/core/src/wow/client-events.test.ts
- 42 R: two onMessage subscribers both hear every message in registration order
- 69 R: unsubscribe removes only that subscriber
- 93 R: a throwing subscriber is reported via onPacketError and others still run
- 125 R: a throwing packet-error listener does not wedge the next packet
- 152 R: a subscriber error mid SMSG_UPDATE_OBJECT does not abort the rest of the packet
- 179 R: entity events fire only after the whole packet is applied
- 201 R: teardown detaches subscribers before clearing entities; no disappear storm on close

### packages/core/src/wow/client-extras.test.ts
- 41 R: onNotice delivers until unsubscribed
- 51 F: runtimes stub returns the flags and the test expects them back; mock implements the assertion; use a real Runtimes capabilities or drop to a pass-through check elsewhere
- 65 R: getCreatureInfo maps a creature query response to info with rank name
- 88 R: empty subName reads undefined and unknown rank maps to normal
- 104 R: a truncated creature response keeps the name and caches no info

### packages/core/src/wow/client-handlers.test.ts
- 21 R: no real handler may shadow a stubbed opcode; a shadowed stub would be unreachable or double-handled
- 36 D: registerGameHandlers with a dispatch-only conn is already run by this file's first test; keeper client-handlers.test.ts:21
- 43 R: each opcode is registered exactly once across modules; duplicate registration overrides silently
- 68 R: vendor list reaches both the quest window and the vendor store
- 87 D: not.toThrow on a dispatch-and-events conn; stubConn at client-handlers.test.ts:125 already registers on such a conn; keeper client-handlers.test.ts:125
- 95 R: a failing peek is reported as a packet error
- 125 R: stubbed opcode emits a notice, not chat text
- 143 R: a notice with no subscriber replays to the first onNotice subscriber only
- 161 R: a full notice backlog drops later notices and retries on the next packet
- 177 R: an unhandled opcode emits one notice by its name, deduped

### packages/core/src/wow/client-place.test.ts
- 60 R: place state is empty before the first world states packet
- 78 R: SMSG_INIT_WORLD_STATES names zone and area and emits place_changed
- 100 R: place_changed fires only when the place differs
- 123 R: unknown ids stay unnamed
- 142 R: getPlaceState returns a copy so callers cannot corrupt the store
- 160 D: asserts generated-table names (Eversong Woods, Ghostlands, Elwynn Forest) copied from the data; looked-up values already asserted at client-place.test.ts:78 and :113; keeper client-place.test.ts:78
- 167 R: SMSG_EXPLORATION_EXPERIENCE emits area_explored with name, id and XP

### packages/core/src/wow/client-social.test.ts
- 87 R: not-in-guild command result resolves undefined instead of hanging
- 97 R: roster request resolves with the server roster
- 108 R: a command result for another command does not end the roster request
- 127 R: CMSG_GUILD_QUERY carries the login guild id and the name joins the roster

### packages/core/src/wow/client.test.ts
- 58 F: asserts nothing after login; assert the logged-in handle (self guid or login state) so a login that silently no-ops fails
- 82 R: unknown world auth status falls back to status 0x%x message
- 96 R: code-to-label table (0x0d "failed") rendered in the auth error the agent reads; assert the label value; keep, distinct entry from :176 (0x1d)
- 110 R: code-to-label table (0x15 "unknown account") rendered in the auth error; assert the label value via regex/toContain; distinct entry from :176
- 124 R: unknown character name rejects with the name
- 143 R: ping interval sends sequence 1 and the pong updates link rtt
- 170 R: coalesced login verify stamps map on the self create entity
- 190 R: manual reissue emits one movement_started and stays moving
- 219 R: faceGuid turns toward an observed object and refuses a lost guid with target_not_observed
- 252 R: turning and moving keep auto-attack running; halt sends exactly one ATTACKSTOP after the last facing packet
- 295 R: SMSG_NEW_WORLD invalidates quest authority before another self create without accepted/removed events
- 327 R: login queries time once; close rejects a pending query with AbortError; events once

### packages/core/src/wow/combat-auto-repeat.test.ts
- 75 R: Auto Shot becomes auto-repeat not a pending cast; shot counting; later cast still pending
- 119 R: SMSG_CANCEL_AUTO_REPEAT ends auto-repeat with a cancel outcome
- 133 R: stop and halt send the empty CMSG_CANCEL_AUTO_REPEAT_SPELL and clear state
- 150 R: rejected Auto Shot clears auto-repeat with the server reason no_ammo
- 168 R: SMSG_CANCEL_AUTO_REPEAT handler parses the wire packet and the spell start keeps casting unset

### packages/core/src/wow/combat-casts.test.ts
- 71 R: beginChannel after the spell go holds the channel with the cast's target
- 84 R: cancel with only a channel sends CMSG_CANCEL_CHANNELLING for its spell
- 99 R: failure after a channel cancel reads as a cancel not a failure
- 109 R: cancel with a pending cast sends CMSG_CANCEL_CAST
- 119 R: a new cast or item use is refused while a channel runs and sends nothing
- 127 R: CMSG_USE_ITEM writes the glyph index after the item guid; wire layout
- 140 R: updateChannel keeps remaining time and moves the expected end
- 147 R: endChannel returns and frees the channel tracker
- 155 R: clear drops the channel
- 162 R: a channel whose end never came stops blocking casts after its expected end
- 171 R: an endless channel keeps blocking casts until it ends
- 184 R: shiftCooldown moves the cooldown in the store

### packages/core/src/wow/combat-store.test.ts
- 19 R: unknown hostile damage makes the unit an attacker and emits attacked once
- 27 R: a unit that already attacked emits nothing again

### packages/core/src/wow/combat.test.ts
- 66 R: learned cast without metadata awaits server; HALT cancels unacknowledged cast and attack
- 84 R: a late failure from a prior cast count cannot clear the new pending cast
- 98 R: full aura snapshots replace stale slots and expire by duration
- 136 R: foreign cooldown packets cannot block self; clear releases the cooldown
- 151 R: attack stop on a dead victim does not fabricate kill credit
- 170 R: victimless attack stop clears the pending swing as failed
- 188 R: spline prediction keeps observed/server provenance; forgetting clears motion
- 214 R: cancellation intent survives START and repeated server failures
- 241 R: a new cast does not inherit the previous cancellation intent
- 254 R: cancellation does not mask other server errors
- 266 R: failed and interrupted casts name the server result next to its code
- 296 R: full creature aura snapshots keep unsigned GUID halves
- 327 R: open Catmull packet cannot promote old facing to launch yaw
- 353 R: incoming attack start registers an attacker against self; stop clears it
- 363 R: a dead incoming attacker is cleared on check
- 380 R: cast events carry the spell name once the catalog loads
- 406 R: self auras carry the spell name once the catalog loads (combat wiring of aura-store.test.ts:44)
- 429 R: attackers lists live incoming attackers and attacked events name each
- 441 R: a dead or stopped attacker leaves attackers
- 460 R: a bad cast request is named before an in-progress cast: invalid_spell, unknown_spell, cast_in_progress
- 469 R: halt on a running channel sends CMSG_CANCEL_CHANNELLING and not CANCEL_CAST

### packages/core/src/wow/control-acks.test.ts
- 10 R: heartbeat uses the time-sync clock while moving
- 26 R: force run speed ack layout and stored speed
- 41 R: knockback ack keeps FALLING trajectory in server order and blocks falling moves
- 72 R: observed transport, root and server pose cancel timers and block renewal
- 127 R: FACE and MOVE refuse on no_control and on observed transport, sending nothing
- 154 R: SET_CAN_FLY ack layout (flag and isApplied) and the flying block
- 185 R: speed change integrates elapsed movement at the old speed
- 201 R: forced teleport that keeps the transport keeps the transport block in the next ack (Player.cpp:1479)
- 244 R: transport-free forced teleport drops the old transport block

### packages/core/src/wow/control-core.test.ts
- 7 R: login verify is the server pose and claims the active mover
- 22 R: move then halt predicts displacement and keeps the server pose
- 46 R: repeating the same direction renews the lease without a second start
- 68 R: directed walk stops at the requested distance without overshooting
- 94 R: directed walk stops at a nearer sampled target
- 115 R: directed walk halts on abort and a stale abort cannot cancel a later manual move
- 141 R: directed walk checks intervening ground after a delayed timer
- 175 R: directed walk refuses a wall despite valid ground heights
- 199 R: directed walk refuses ground that cannot connect back to the origin
- 227 R: slow but progressing walk outlives the safety lease
- 248 R: directed walk refuses zero speed with missing_speed and starts nothing
- 275 R: changing direction stops then starts without resetting pose

### packages/core/src/wow/control-directed.test.ts
- 10 R: immediate halt cancels timers and sends stop
- 27 R: missing speed, invalid duration and rooted movement are refused with named reasons
- 52 R: face updates predicted orientation and sends SET_FACING without claiming confirmation
- 66 R: selectTarget is requested until observeTarget; CMSG_SET_SELECTION guid
- 88 R: teleport ack snaps to server pose and stops movement
- 111 R: near teleport snaps server pose without sending an ack
- 142 R: client control loss blocks MOVE with no_control
- 154 C packages/core/src/wow/control-acks.test.ts:127: ON_TRANSPORT observeSelf refuses move with transport; move blockedReason transport assertion there
- 170 R: dispose clears timers so a later tick does not keep walking

### packages/core/src/wow/control-drive.test.ts
- 36 R: forward plus turn left sends both starts, arc heartbeat, stop-turn on release
- 69 R: each released axis sends its own stop, in order
- 94 R: repeating the same input re-arms the lease without new starts; invalid_direction/duration refusals
- 116 R: diagonals move at axis speed, backward slower
- 134 R: turning in place follows the server turn rate

### packages/core/src/wow/control-flags.test.ts
- 36 R: water walk ack layout: packed guid, counter, WATERWALKING, isApplied 1 (MiscHandler.cpp:1505)
- 52 R: acked flags stay in every later move
- 74 R: land walk clears WATERWALKING and writes isApplied 0
- 99 R: hover ack opcode and HOVER bit set and unset
- 115 R: flag acks do not stop a running move
- 130 R: acks after a root carry ROOT and echo their own counters
- 151 R: a new world clears the acked flag bits
- 173 R: feather fall ack opcode, FALLING_SLOW and isApplied
- 193 R: gravity acks carry no isApplied and pick opcode by direction
- 212 R: gravity-off refuses moves with disable_gravity until gravity returns
- 231 R: abort after transfer pending arms a watchdog that clears teleporting at 10 s
- 246 F: only asserts WORLDPORT_ACK was sent, true with or without a live watchdog; assert jest.getTimerCount() or blockedReason after 10 s distinguishes cancel
- 268 F: negative passes anyway because blockedReason is undefined without any watchdog; assert jest.getTimerCount() is 0 after the abort
- 280 R: dispose cancels the abort watchdog; timer count zero and still teleporting
- 297 R: CMSG_MOVE_SET_COLLISION_HGT_ACK layout with f32 height (MovementHandler.cpp:689)
- 313 F: name says echoes the packet value but only the opcode is asserted; decode the ack and check speed 3.14 and the counter
- 323 R: CMSG_MOVE_TIME_SKIPPED layout
- 336 R: CMSG_MOVE_FALL_RESET layout with fallTime 0 and no FALLING

### packages/core/src/wow/control-flight-timers.test.ts
- 14 R: with no flag seen the flight ends ten seconds after duration and emits flight_landed once
- 29 R: exactly one spline-done with the final point when the flag stays set
- 47 R: no spline-done when the flag cleared before the duration
- 58 R: no spline-done when the flag was never seen
- 66 R: dispose cancels pending flight timers
- 76 R: a second flight spline replaces the first one's timers and id
- 90 R: multi-map flight stays in_flight across the transfer and resumes on the new spline
- 108 R: landing after a map change ignores a spline point from another map
- 120 R: landing with a retained blocker publishes disable_move in every landing event
- 137 R: flight start events already report in_flight and no movement
- 156 R: table per unit flag (stunned, confused, fleeing, disable_move): fallback landing keeps the blocker
- 175 R: table per unit flag: replacement spline keeps the blocker seen during flight
- 188 R: a new flight after landing does not inherit the earlier blocker
- 201 R: taxi flag arriving after the duration sends spline-done and never lands by fallback
- 218 R: flag-first flight landing with no flags clears the blocker
- 229 R: a blocker cleared during the flight is not restored by fallback landing
- 240 R: a second flags update does not send a second spline-done

### packages/core/src/wow/control-flight.test.ts
- 17 R: a flying spline aborts local motion and reports in_flight
- 35 R: move, walk and face refuse with in_flight not disable_move
- 46 R: the flag alone reports in_flight and never disable_move
- 58 R: a non-flight self spline emits nothing and keeps its handling
- 67 R: flag clearing without a stop spline lands at the last spline point
- 109 R: landing a few yards above ground takes the ground height
- 122 R: the oracle is asked at the landing point on the landing map
- 137 R: first move after landing starts at the ground height
- 150 R: table of ground heights (far below, above, unknown, NaN) leaves landing z alone
- 161 R: with no ground oracle landing z is the spline point
- 174 R: fallback landing after the duration grounds the pose the same way
- 194 R: a stop spline during flight sets the server pose to the stop point
- 206 R: landing after a stop leaves the stop point and the next move starts there
- 227 R: a non-flight disable_move update still blocks local movement
- 237 R: a landing update that keeps a blocker stays blocked until cleared
- 252 R: a stop spline outside a flight changes nothing
- 261 R: first move after landing starts from the landing point

### packages/core/src/wow/control-free-move.test.ts
- 28 R: first step without ground is refused with its reason and sends nothing; table of five reasons
- 55 R: a leg stops at its last reachable half-yard step and keeps the reason
- 74 R: a key move stops at a wall on flat ground
- 89 R: a leg follows sloped ground half a yard at a time
- 104 R: backing away or halting clears a refused start
- 123 R: without a ground oracle a move reckons at server z until corrected

### packages/core/src/wow/control-jump.test.ts
- 41 R: standing jump packet, falling heartbeats and landing; airborne refusal
- 84 R: running jump carries its speed and keeps running after landing
- 107 R: releasing keys mid-air keeps falling until the landing
- 125 R: a server position mid-air cancels the jump
- 143 R: jump off a ledge falls until it meets lower ground with correct fall time
- 170 R: a jump keeps its speed over a gap with no walkable ground
- 186 R: running jump into a wall drops straight down

### packages/core/src/wow/control-pose.test.ts
- 15 R: each movement packet emits one pose_sent equal to the sent pose
- 43 R: a non-movement ack emits no pose_sent

### packages/core/src/wow/control-ride-flags.test.ts
- 89 R: table per forced flag: ack opcode, vehicle guid, bit set and cleared (Unit.cpp:16105)
- 105 R: gravity disabled on the vehicle refuses ground movement until it returns
- 115 R: a flag for an unrelated guid sends nothing and changes nothing
- 122 R: a flag for the vehicle is ignored while it is not the mover
- 131 R: the vehicle's flag does not stay on the character after the vehicle is dropped
- 146 R: the passenger's root block does not root the driven vehicle
- 160 R: the passenger's root is remembered for after the ride
- 170 R: unset can fly clears flight flags adopted from the vehicle's create block
- 190 R: gravity disabled during a ground drive stops it
- 206 R: the vehicle flies while driven but the character does not after exiting
- 224 R: a forced flight grant refuses ground moves and withdrawal allows them again
- 237 R: a character that could already fly keeps flying after the vehicle's grant is withdrawn

### packages/core/src/wow/control-ride-mover.test.ts
- 63 R: control update for the seat vehicle announces the mover (MovementHandler.cpp:779)
- 82 R: control update for a non-seat unit stays refused
- 93 R: control update before the seat is adopted when the seat lands
- 105 R: a pending mover for another vehicle is not adopted by a later seat
- 114 R: moves carry the vehicle guid, pose and run speed, no transport block
- 131 R: vehicle with flight flags refuses ground movement though passenger has no flying flag
- 148 R: ground vehicle permits ground movement; positive control for line 131
- 163 R: the character's own root does not block the vehicle or reach its movement info
- 183 R: a root for the driven vehicle refuses its movement and keeps the flag in its packet
- 205 R: the character stays rooted after the vehicle is lost until the unroot arrives
- 217 R: self observations do not move the driven pose
- 228 R: a mover state for another guid is ignored
- 241 F: name says speed acks but it calls forceRoot; send forceSpeed and assert the guid on the speed ack
- 249 R: passenger spline-done keeps its own guid and the seat block (TaxiHandler.cpp:204)
- 268 R: moverPacket builds from the mover guid and current movement info
- 287 R: allow 0 sends old mover then character and restores self control
- 303 R: the character's own speed returns after the vehicle is lost
- 311 R: leaving the seat while driving drops the mover
- 319 R: a driven walk stops when the vehicle is lost

#### Seams
- packages/core/src/wow/areas/compose.ts `stubOwners`: only client-handlers.test.ts:21 calls it
- packages/core/src/wow/client-handlers.ts `NOTICE_BACKLOG`: exported; client-handlers.test.ts:161 imports it (production uses it only internally)

#### Defects
- none

## core-wow-2

### packages/core/src/wow/control-ride-passenger.test.ts
- 48 R: a character flight grant must not block a ground vehicle and returns on exit; catches stuck "flying" block while driving
- 58 R: a hover flag change naming the character is deferred until the ride ends; catches leaking passenger flags into vehicle packets
- 75 R: observed flags during the ride are kept for release; catches losing CAN_FLY on exit
- 86 R: flight seen only in observed flags stays out of the vehicle's move packet (guid and flags asserted)
- 100 R: revoking the vehicle's grant over a passenger grant frees the ground vehicle; grant-counter bug
- 112 R: swimming state restored after the ride, with a stop-swim packet on later toggle
- 140 R: each air command throws "driving" without sending or mutating state; one refusal branch per command, table-driven
- 157 R: swimming works before and after a drive under the character guid; catches a stuck refusal after the ride

### packages/core/src/wow/control-ride-root.test.ts
- 74 R: boarding root never reaches the vehicle's movement flags; catches the vehicle being rooted by the passenger's root
- 87 R: passenger root comes back on vehicle loss; the later unroot clears it
- 98 R: pending vehicle root still blocks the drive and the move refuses with no packet
- 112 R: unroot of the pending vehicle forgets its root; catches a stale pending root
- 120 R: a pending vehicle root must not leak into the next ride; state reset on exit
- 134 R: a vehicle adopted with ROOT refuses without sending a root packet (MovementHandler.cpp:610-613)
- 142 R: an unroot naming the vehicle releases a root seeded from the movement block
- 149 R: an unroot before adoption wins over the cached ROOT flag; ordering
- 162 R: a pose correction without ROOT clears a cached passenger root
- 170 R: a correction with ROOT blocks movement with none cached, and a later unroot clears it
- 179 R: correction fall data reaches the next outgoing move; catches a dropped fall state
- 190 R: correction pitch reaches the next outgoing move; catches a dropped pitch
- 214 R: the passenger's ROOT must not leak into the vehicle unroot ack flags; the packet byte is asserted
- 242 R: a pre-boarding passenger root survives adopting and dropping a vehicle (Unit.cpp:13935-13942)
- 257 R: the passenger root stays out of vehicle movement and acks while driving
- 275 R: a root received while driving is kept for after the ride
- 287 R: an unroot received while driving is kept for after the ride and movement works

### packages/core/src/wow/control-ride.test.ts
- 45 R: seatWorldPose rotates the offset by vehicle orientation (VehicleDefines.h:144-153); catches a rotation sign error
- 58 R: seat facing reaches the ack transport orientation, parsed from the bytes
- 71 R: seat facing adds to the vehicle orientation in the adopted pose
- 84 R: a forced teleport cancels the boarding timer and the ride; catches a spurious spline done
- 99 R: boarding stops a walk and refuses free movement with reason "transport"
- 111 R: the next ack carries ON_TRANSPORT and the seat block (MovementHandler.cpp:555-559); packet fields asserted
- 129 C packages/core/src/wow/control-ride.test.ts:270: same offset rotation, same pose assertions; 270 also covers the walk-prediction case
- 149 R: spline done sent once at the duration with the spline id (TaxiHandler.cpp:204-214); exact body and timing
- 166 R: no boarding spline sends no spline done and keeps the transport block
- 180 R: leaving before the spline ends cancels the done and clears the ride
- 195 R: a seat change replaces the pending spline done with the new id and seat
- 209 R: dispose drops a pending spline done; timer leak
- 217 R: a world change ends the ride and cancels the timer
- 231 R: a transport teleport does not carry the transport block through a world change
- 258 R: boarding and leaving each emit control_changed with the reason
- 270 R: boarding after a walk or face adopts the seat pose, not the prediction; the later spline done carries the pose
- 300 R: the vehicle-left event already reports movement allowed; ordering of state before notify

### packages/core/src/wow/control-swim-cancel.test.ts
- 23 R: explicit swim-off over observed swimming sends STOP_SWIM and unblocks; catches ignoring server-observed state
- 34 R: swim-on over observed swimming sends nothing; catches a duplicate packet
- 42 R: true then false over observed swimming unblocks ground movement
- 53 R: fly-off over observed flying sends SET_FLY with FLYING cleared; grant keeps the block
- 66 R: fly-on over observed flying is idempotent
- 78 R: halt sends STOP_ASCEND for a running ascend, bit cleared, one packet
- 89 R: halt stops a descend with STOP_ASCEND and DESCENDING cleared
- 99 R: halt sends STOP_PITCH for a running pitch
- 109 R: halt with no air input sends nothing
- 115 R: halt stops both a pitch and an ascend, two opcodes
- 126 R: forced root and unroot clear air inputs, flight kept; stale-bit bug
- 145 R: losing client control clears air inputs and flight recovers

### packages/core/src/wow/control-swim-observed.test.ts
- 41 R: pitch over observed swimming sends START_PITCH_UP carrying SWIMMING
- 52 R: pitch, ascend and descend keep the observed FLYING|CAN_FLY grant in packets
- 68 R: takeoff on an observed grant carries CAN_FLY and FLYING
- 78 R: a server update revoking the grant drops CAN_FLY from later packets
- 86 R: observed FLYING alone refuses move and walkToward with no packets
- 96 R: a server update dropping swimming ends the pitch guard
- 105 R: landing keeps the grant so a later takeoff needs no second setCanFly
- 117 R: revoking the capability refuses takeoff with cannot_fly
- 124 R: landed with the grant kept stays blocked for ground movement
- 132 R: revoking flight drops PITCH_UP from the ack bytes
- 143 R: DISABLE_MOVE cancels an active ascend while flight stays
- 155 R: a stunned descend is gone after the blocker lifts
- 165 R: a server position correction drops a running pitch

### packages/core/src/wow/control-swim.test.ts
- 19 R: swim start/stop packets with SWIMMING and pitch semantics (MovementHandler.cpp:362-414), guid asserted
- 37 R: repeating the swim state sends nothing
- 46 R: the SWIMMING bit follows explicit swim state in later moves
- 63 R: a walking character is stopped before the swim starts; ordering
- 80 R: a jump into the water ends the fall before the swim starts
- 97 R: ground moves are refused while swimming with reason "swimming"
- 106 R: a world change resets swim state and pitch
- 117 R: each.table: rooted, no_control and teleporting refuse swim with no packet; distinct block branches
- 135 R: pitch refused outside water and air with not_swimming_or_flying
- 142 R: pitch up/down/stop opcodes and bits
- 163 R: numeric pitch sends SET_PITCH and persists in later messages
- 175 R: NaN, infinities and out-of-range pitch rejected with invalid_pitch and no packet
- 186 R: leaving the water clears the PITCH bits
- 200 R: setFlying without CAN_FLY throws cannot_fly and sends nothing
- 207 R: with CAN_FLY the SET_FLY packet carries FLYING, CAN_FLY and pitch; landing clears them
- 224 R: the server removing CAN_FLY ends flight state and the ascend bit
- 235 R: ground moves refused while flying
- 242 R: ascend and descend refused when not flying
- 251 R: ascend/descend opcodes and vertical bits
- 273 R: a descend replaces a running ascend; ASCENDING cleared

### packages/core/src/wow/control-transport-ride.test.ts
- 54 R: the leave event already carries ground pose and allows movement; ordering of state before notify
- 66 R: boarding sends one CMSG_MOVE_CHNG_TRANSPORT with ON_TRANSPORT and transport block, parsed bytes (MovementHandler.cpp:362-408)
- 83 R: leaving sends a world-pose packet without ON_TRANSPORT or transport block
- 96 R: boarding keeps the rotated offset, a regression guard (SR3-vehicles-46); catches a rotation bug in the offset
- 117 R: missing transport pose refuses with transport_data_missing and sends nothing
- 126 R: a moving transport refuses boarding with not_docked and sends nothing
- 146 R: leaving a moving transport throws not_docked with no new packet
- 167 R: the pose follows the transport during the ride; catches a frozen pose
- 186 R: a same-map world change keeps the transport block in later acks
- 204 R: a same-transport teleport keeps the ride and adopts the offset (Transport.cpp:623-635); pose and block asserted
- 238 R: boarding another transport after a teleport names the new guid with a recomputed offset
- 288 R: a teleport without the transport block ends the ride
- 301 R: an unrelated cross-map world change ends the ride
- 315 R: a transport-driven cross-map change keeps deck-local numbers out of the world pose (Player.cpp:1634-1640); stale marking and later arrival
- 376 R: the teleport ack after a cross-map transfer restores the world pose; stale cleared
- 406 C packages/core/src/wow/control-transport-ride.test.ts:186: same-map world change input; add the movementAllowed/throw assertions there
- 420 R: a refused leave keeps the ride and a later leave succeeds; recovery
- 444 R: a leave with no ground oracle throws ground_height_unavailable and keeps the ride
- 454 R: leaving after a same-transport teleport sends no transport block

### packages/core/src/wow/cooldown-store.test.ts
- 22 R: longest of spell, category and global cooldown wins; list entry fields asserted
- 33 R: server cooldowns expire and release clears the category
- 44 R: shift moves a known cooldown and marks it server (Player.cpp:11277-11281)
- 55 R: shift moves only the spell cooldown, never the category; both directions
- 68 R: shift creates no entry for an unknown cooldown

### packages/core/src/wow/destroy.test.ts
- 79 R: CMSG_DESTROYITEM bytes, pending state, confirmation only once the slot is observed empty, event order; guard is a throw
- 100 R: partial destroy sends the count and waits for the smaller stack; catches early confirmation
- 113 F: throws carry no code, so the message is the only branch label: keep "No carried bag item"/"exceeds the stack"/"limited to 255" as short fragments, add the rendered "bag 255 slot 30" values; drop sentence wording; keep no-send
- 123 R: server refusal maps to cant_drop_soulbound and silence ends unanswered via timeout; error recovery
- 152 R: a destroy from a refusal listener keeps its answer timeout; reentrancy bug

### packages/core/src/wow/entity-store.test.ts
- 13 R: create stores the entity and emits one appear event
- 25 R: UNIT default fields (power arrays, target 0n, etc.) that consumers read; a missing default breaks readers
- 46 R: PLAYER create takes the unit shape and keeps a passed level
- 56 R: GAMEOBJECT create has gameobject-specific defaults
- 68 R: CORPSE gets the base shape without unit fields
- 78 R: update merges fields and emits one update event naming the changed key
- 98 C packages/core/src/wow/entity-store.test.ts:78: same merge branch with a second key; its assertions sit in a vacuous `if`
- 116 R: an empty update emits nothing
- 129 R: update on an unknown guid is a no-op
- 139 R: destroy removes the entity and disappear carries guid and name
- 160 R: destroy on an unknown guid is a no-op
- 170 R: getByType separates units from gameobjects
- 183 R: clear removes everything and emits disappear per entity
- 198 F: the "changed" assertion is wrapped in `if (event.type === "update")`, so it can pass vacuously; assert the type unconditionally
- 217 F: same vacuous `if (event.type === "update")` guard around the changed assertion; assert the type unconditionally
- 237 C packages/core/src/wow/entity-store.test.ts:334: index cleanup after destroy is checked there at the disappear boundary; 296 covers the retype
- 246 F: name promises a snapshot but asserts only length 3; assert that mutating the returned array leaves the store unchanged
- 255 R: sparse power update keeps the other indices; array merge in update (entity-store.ts:203-205)
- 269 C packages/core/src/wow/entity-store.test.ts:255: same generic array-merge branch with another key
- 283 R: re-creating an entity of the same type replaces it with no duplicate
- 296 R: re-create with a different type cleans the old byType index
- 309 R: replacing an entity emits disappear then appear, in that order
- 334 R: disappear listeners see the entity already gone from get, byType and all; reentrancy ordering
- 355 R: raw fields merge into the stored view and appear in changed
- 369 R: event snapshots are isolated from later mutation

### packages/core/src/wow/experience.test.ts
- 14 R: parses a captured SMSG_LEVELUPINFO from a live server; wrong offsets change the deltas
- 26 R: captured kill vs quest XP packets are distinguished and totals read correctly
- 33 R: readExperience returns self XP fields and nothing for another player's entity

### packages/core/src/wow/faction-template.test.ts
- 17 R: missing FactionTemplate.dbc rejects with the file named; load error path
- 23 R: a truncated DBC with the wrong layout is rejected; catches a silent mis-parse
- 35 R: a missing template gives unknown, not hostile
- 44 R: the same parent faction is friendly
- 54 R: explicit enemy and friend lists decide hostile and friendly
- 67 R: group masks decide hostile, friendly and neutral when lists are empty
- 80 R: hostility is checked before friendship; ordering
- 90 R: friendly when the target lists the source as a friend
- 100 R: the hates-all-but-friends flag gives hostile and is asymmetric

### packages/core/src/wow/friend-store.test.ts
- 23 R: set replaces entries and emits friend-list with the list
- 43 R: a second set drops the earlier entries
- 52 R: update merges fields and emits friend-online with the friend
- 71 R: a status change to 0 emits friend-offline with guid and name
- 88 R: update on an unknown guid emits nothing
- 98 R: add stores and emits friend-added
- 115 R: remove deletes and emits friend-removed with name
- 133 R: remove on an unknown guid emits nothing
- 143 R: setName changes the stored name; no event is emitted by design
- 152 R: findByName is case-insensitive and returns the guid
- 162 R: findByName on an unknown name is undefined
- 169 R: all() is sorted by name
- 183 R: entries are copied on add; caller mutation cannot corrupt the store
- 194 R: setNote stores the note; the test pins the emitted event as "friend-online" (see Defects)
- 204 R: FriendStore.setNote applies truncateNote (friend-store.ts:96); keeper contacts store.test.ts:39 tests only the function, not this wiring
- 212 R: setNote on an unknown guid returns false and emits nothing

### packages/core/src/wow/gameplay-handlers-stores.test.ts
- 92 R: wire packets (initial spells, learned spell, attack start, XP gain) land in combat state; wrong handler registration drops them
- 112 R: wire item push, inventory failure and loot roll land in rewards state with no handler errors
- 127 R: an item query response names the item in later labels
- 146 R: kill progress, reclaim delay and vendor list reach their stores over the wire
- 169 R: a new zone updates place and raises place_changed then area_explored, ordered
- 228 R: an inventory failure naming the destroyed item settles only the destroy; the buy stays pending
- 239 R: an anonymous failure settles nothing while two requests are pending; avoids settling the wrong request
- 254 R: an anonymous failure settles a lone buy as inventory_full
- 265 R: an InventoryResult.NONE notice settles no store and records no error
- 279 R: rewards records every error but drops its take only when it owns the failure

### packages/core/src/wow/gameplay-handlers.test.ts
- 61 R: a spawned creature is listed at its update-object position with the observed provenance fields
- 72 R: SMSG_MONSTER_MOVE updates the store and nearby; the row is predicted at a later time
- 88 R: a creature that stops is listed where it stopped; prediction ends
- 104 R: a move for an unknown guid is ignored with no handler errors
- 115 R: SMSG_ATTACKSWING_NOTINRANGE maps to the named not_in_range error; this is the agent-facing key

### packages/core/src/wow/gameplay-lifecycle.test.ts
- 103 R: server close retires the mover and its timers with no packets sent during or after close; leak/ordering contract

### packages/core/src/wow/geometry.test.ts
- 5 R: 3D distance of a 2-3-6 triple gives 7
- 11 R: distance2d ignores height
- 17 R: bearing orientation convention (+y is pi/2)
- 23 R: normalizeAngle wraps negatives and 2pi into [0, 2pi)

### packages/core/src/wow/guild-store.test.ts
- 27 R: setRoster stores members and emits guild-roster with motd, info and members
- 48 R: a second roster replaces the first
- 62 R: setGuildMeta emits a roster event with name and ranks once members exist
- 79 R: setGuildMeta before a roster emits nothing
- 89 R: get() is undefined on a fresh store
- 95 R: setGuildMeta alone yields a roster with name and empty members
- 104 R: get() returns every roster and member field; catches a dropped field in the copy
- 145 R: all() is sorted by name
- 159 R: all() on a fresh store is empty
- 165 R: the event carries meta, motd and name-sorted members when meta arrived first
- 189 R: members are copied on setRoster
- 198 F: name claims "no event fires" but it only asserts get() is defined; rename to "mutations work without a listener"
- 207 R: setGuildMeta after a roster keeps motd and members
- 221 D: same input and assertions as 95 (setGuildMeta, no members, empty roster); keeper guild-store.test.ts:95
- 230 D: a fresh store's get() is undefined, as in 89; keeper guild-store.test.ts:89

### packages/core/src/wow/ignore-store.test.ts
- 6 R: a fresh store is empty
- 11 R: set replaces entries and emits ignore-list
- 26 R: a second set drops the earlier entries
- 35 R: add stores and emits ignore-added
- 47 R: remove deletes and emits ignore-removed with the name
- 64 R: remove of an unknown guid emits nothing
- 74 R: setName fills in a resolved name
- 83 R: setName on an unknown guid changes nothing
- 89 R: findByName is case-insensitive
- 98 R: findByName with no match is undefined
- 105 R: has() matches the guid low 32 bits, as in a chat packet guid
- 113 R: all() is sorted by name
- 125 R: set copies entries
- 134 R: add copies the entry
- 143 R: set, add and remove work with no listener

### packages/core/src/wow/index.test.ts
- 65 D: type names are checked by tsc where the harness imports them; the runtime asserts compare an empty object to [] and pin typeof; no contract
- 72 D: AREA_NAMES is Object.keys(AREAS).filter(...) (areas/compose.ts:80), so the equality is tautological; no contract

### packages/core/src/wow/inventory-bank.test.ts
- 7 R: bank and bankbag slot ranges and field offsets against Player.h:698-705; a wrong offset reads the wrong slots
- 17 R: bank bag-slot count read from byte 2 of PLAYER_BYTES_2 (Player.h:1291), with undefined for unknown self and entity

### packages/core/src/wow/inventory.test.ts
- 30 R: unknown, partial and complete inventory states; wrong authority reports an empty bag as known
- 56 R: literal player, item and container offsets; missing item data leaves count undefined rather than inventing 1
- 115 R: a GUID needs both halves unless a complete CREATE implies a zero high half
- 129 R: owner, contained chain, duplicate and bag-size mismatches become issues and demote status to partial
- 166 R: a container cycle is not followed and bank slots do not count as carried
- 199 R: a bank bag's items are read apart from the carried surface
- 238 R: an unavailable bank bag does not affect carried completeness or free slots
- 252 R: one equipped bag reachable through two addresses is not counted twice
- 275 R: count and coinage updates show in new reads without mutating an earlier snapshot
- 319 R: timed-item fields (creator, duration, charges with a -1 sign) at their offsets
- 338 R: enchantment slots at their field offsets with only non-empty slots listed
- 358 R: flag bit names derived from the item flag word
- 378 R: loaded ammo id with undefined for an unknown self
- 390 R: buyback slot 74 price and sale time read outside the carried slots (update-fields.ts:264, 307-308)
- 416 R: no buyback entry for empty or unknown slots
- 424 R: slot 85 reads price and sale time from the twelfth field; offset arithmetic on the last slot

### packages/core/src/wow/item-labels.test.ts
- 30 R: one CMSG_ITEM_QUERY per entry, null until answered, then the named label; repeated labels do not resend
- 46 R: a server denial keeps the label null and never re-queries
- 54 R: entry 0 or undefined is never queried
- 61 R: an unanswered query is retried only after the wait; fake timers
- 78 R: a query that failed to send is retried on the next label
- 93 R: only item and container entities trigger queries, not units
- 104 R: loot offers are queried when the window opens, and labelRewards names the answered one
- 146 R: itemKind classes consumables by subclass; boundaries 5, 1, 4 and a weapon
- 156 R: an unanswered label gives "other"

### packages/core/src/wow/item-use.test.ts
- 124 R: useItem casts the on-use spell (trigger 0, not the trigger-1 spell) with the slot's item identity
- 133 R: reason codes unknown_slot, empty_slot, slot_unobserved, no_use_spell and unknown_item, with no cast sent
- 152 R: the slot changing during the template query refuses with slot_changed; race
- 162 R: templates are queried once, deduplicated and cached, unknown items included
- 181 R: an unanswered template query rejects item_query_timeout and can be asked again
- 221 R: an item cast carries its item to the failed result; a second cast gives cast_in_progress
- 234 R: an inventory error for the used item (or guid 0) fails the pending item cast; other guids are ignored
- 251 R: a potion may follow a cancelled cast but not a live one; opcode order and stale-fail ignored
- 269 R: a template labels class, subclass and only on-use spell ids

#### Seams
- packages/core/src/wow/inventory.ts, item-labels etc.: no test-only exports seen; tests construct stores directly
- none further

#### Defects
- packages/core/src/wow/friend-store.test.ts:194 pins setNote emitting "friend-online" (a note edit announced as a friend coming online); a consumer treating it as a login would misfire. Suspect but unverified.

## core-wow-3

### packages/core/src/wow/logout.test.ts
- 55 R: duplicate logout() sends one CMSG_LOGOUT_REQUEST; socket stays open through countdown until COMPLETE
- 83 R: instant logout response plus complete closes the session; catches a hang on the instant path
- 96 R: refused response disconnects the session end to end; catches a stuck session after refusal
- 111 R: no answer within logoutTimeoutMs closes the session; timeout recovery path
- 134 R: result codes 1/2/3/9 map to in_combat/duel_or_frozen/falling/unknown per MiscHandler.cpp; wrong map misreports refusal
- 153 R: accepted response then complete resolves complete with no reason; catches a leaked refused reason
### packages/core/src/wow/loot-rolls.test.ts
- 70 R: SMSG_LOOT_START_ROLL reference bytes parse to pending item, countdown, allowed votes and remaining time
- 91 R: CMSG_LOOT_ROLL bytes (guid, slot, vote) sent once; a second answer throws and sends nothing
- 107 R: unknown roll, wrong guid, disallowed vote and expired roll each refuse and send nothing
- 125 R: a later loot offer binds the corpse guid to the roll so it can be answered by corpse
- 142 R: roll packets without a roll id match by slot and item; the win resolves into last with the winner
- 171 R: all-passed resolves the roll with outcome all_passed and no winner
### packages/core/src/wow/movement-handlers-transfer.test.ts
- 43 R: SMSG_TRANSFER_PENDING with only a map id yields transfer_pending with the map and no transport
- 47 R: transport form parses entry and old map from the body; a layout slip swaps the fields
- 55 R: empty body still emits transfer_pending so the transfer gate is not stuck
### packages/core/src/wow/movement-handlers.test.ts
- 54 R: self MSG_MOVE_TELEPORT reaches control with the exact server pose, stops movement and sends nothing
- 95 R: teleport of another unit moves it in the entity store and emits no self event
- 125 R: SMSG_FORCE_MOVE_ROOT packed guid and counter reach the self event; guid truncation breaks it
### packages/core/src/wow/nearby.test.ts
- 102 R: 3d and horizontal distance, bearing and signed turn from the pose; catches wrong geometry
- 114 R: bearing below zero wraps into [0, 2π); catches negative bearings
- 120 R: self row sorts first with zero distance, null bearing and the pose position
- 131 R: with no pose, origin falls back to the self entity position with source self_entity
- 140 R: unobserved rows share the stored Position object (no copy) with source update_object; catches per-query copying
- 151 R: other-map or position-less entities stay unmeasured with null distance and turn
- 163 R: ordering by distance, then guid, with unmeasured rows last
- 177 R: default 100 yd range boundary (100 kept, 100.01 dropped) and all:true includes everything
- 190 R: no origin means no range filter and null originSource
- 196 R: remote pose attaches by guid and every row gets preparedAt now
- 214 F: name says neutral standing but asserts relation "unknown"; rename, standing is owned by line 311
- 230 R: UNIT_DYNAMIC_FLAGS bits map to lootable, tapped and tappedByOther; wrong bit misreports loot
- 247 R: a unit without loot flags and a game object with loot bits are neither lootable nor tapped
- 264 R: npcFlags become roles on units; game objects get none
- 294 R: relation, attackable, attackingMe and targetOf come from the units source across hostile, friendly, unselectable, dead
- 311 R: missing units source leaves relation unknown, not neutral, and keeps targetOf
- 323 R: self row and game objects stay unknown standing even when the source says hostile
### packages/core/src/wow/npc-roles.test.ts
- 5 R: AzerothCore NPC flag bits map to role names in table order; wrong bit or order mislabels vendors and trainers
- 21 R: unknown and vehicle bits yield no roles
- 25 F: only asserts length 24 from a magic mask; assert the full role names list in order
### packages/core/src/wow/object-rotation-update.test.ts
- 68 R: create block rotation decodes to the quaternion from the uint64 (z about -0.9118)
- 74 R: a movement block with a position replaces the stored rotation
- 92 R: rotation-only movement block replaces rotation and keeps the earlier position
### packages/core/src/wow/observed-target.test.ts
- 37 R: idle creature stays targetable 60s after the last observation; catches a stale-expiry regression
- 43 R: a creature that finished a spline targets the endpoint
- 68 R: a creature destroyed in the store throws target_not_observed
- 75 R: target on another map throws target_map_changed
### packages/core/src/wow/packet-trace.test.ts
- 87 R: opcodeName names known opcodes and hex-labels unknown ones for trace rows
- 94 R: opcodeNumber accepts names and 0x hex, rejects invalid, out-of-range and prototype keys like toString
- 108 R: OpcodeDispatch.handle returns handled/unhandled and counts seen/unhandled; feeds the trace outcome
- 125 R: trace rows per packet in both directions; auth session row is size-only, other bodies kept
- 139 R: headers mode omits bodies on all rows
- 145 R: unhandled opcode row outcome, and the attached sender writes a real packet traced as out
- 161 R: compressed moves write per-inner rows with skipped/handled/error outcomes and an error outer row
- 181 R: sink closes once with seen, unhandled and sent counts per direction
### packages/core/src/wow/party-store.test.ts
- 43 R: applyList reports formed/added/removed and snapshot resets on leaving
- 75 R: loot rule names, stat retention across list refreshes and reset on leave and rejoin
- 121 R: raid type, member flags/roles/subgroup and difficulties parse into the snapshot
- 170 R: battleground group type 3 reads as raid; own branch of the type mapping
- 176 R: dungeon finder form type 8 exposes dungeonId and status
- 192 R: you-left form (type 16) clears group state
- 206 R: observed unit data wins over party stats while in view, with source "unit"
- 225 R: partial stat updates merge power, zone, position, auras, pet and vehicle seat without clobbering
- 263 R: explicit pet null clears the pet while hp-only updates keep it
- 273 R: offline flag and clear() drop to no group
### packages/core/src/wow/player-state.test.ts
- 20 R: ghost flag beats positive health; incomplete empty is unknown, complete without health is dead, health>0 alive
- 37 R: complete self CREATE zero-fills hidden field 0x492 only; other fields and other guids stay undefined

### packages/core/src/wow/quest-8325-capture.test.ts
- 12 R: captured auto-accept details/gossip bytes; accept refused once logged, no packet sent, already_on_quest mapped
- 47 R: eight captured ADD_KILL packets parse to 1..8 progress with npc/required; field misparse caught
- 67 R: captured turn-in flow picks COMPLETE_QUEST, choose-reward opcode, reward only after QUEST_COMPLETE
### packages/core/src/wow/quest-8326-capture.test.ts
- 22 R: captured query response links 8 Lynx Collars to quest; auto-accept details plus log yields item requirement
- 36 R: collect progress correlates push with observed stack (slot/bag/merged), not log counters
- 65 R: push ahead of its stack update is held in itemPushes and settled when bags arrive; ordering contract
- 83 R: login-logged quest is queried exactly once (CMSG_QUEST_QUERY body) and collars count after late response
- 109 R: captured turn-in with collars: request-items lists collar, reward push ignored, reward only on QUEST_COMPLETE
### packages/core/src/wow/quest-cancel.test.ts
- 14 R: cancel keeps ignored talk unresolved until server close; exact CMSG bytes; repeat cancel/close idempotent
- 35 R: second cancelled request must not overwrite first; each close settles one in order
- 56 R: cancelled accept stays unresolved until quest log shows it; wrong-evidence settle would be caught
### packages/core/src/wow/quest-inventory.test.ts
- 22 R: INVENTORY_CHANGE_FAILURE after choose-reward becomes lastError inventory_full, event emitted, survives reoffer, cleared on retry
- 45 R: blocked acceptance records bag_full inventory error; separate pending-action branch from reward
- 56 R: negative: inventory failure with no pending action, or ok result, never becomes a quest error
### packages/core/src/wow/quest-reply-bound.test.ts
- 11 R: captured trainer list settles the pending option, opens trainer offer, frees next giver
- 32 R: vendor list settles pending option and opens vendor window; distinct window branch
- 48 R: bank window after option settles with no lastError; sibling of quest-store.test.ts:58 via selectOption path
- 64 R: trainer list from a different guid must not settle pending talk; real guid-mismatch negative
- 72 R: quest_reply_unanswered refusal carries request, elapsed, bound and cancel recovery; asserts full agent-facing text code at start
- 81 R: reply timeout at exactly 5s: not expired at bound-1, expires as no_reply, unresolved recorded, next giver allowed
- 102 R: reply after the timeout is stale_dialog and opens nothing
- 111 R: timed-out acceptance stays unresolved until the quest log shows it
### packages/core/src/wow/quest-slots.test.ts
- 16 R: questLogChanges ordering of accepted/completed/removed across slots
- 24 R: flag change on same quest yields completed then progress
### packages/core/src/wow/quest-store.test.ts
- 28 R: details with divider and no giver is a shared dialog, not an error; no error event
- 39 R: details with no giver and no divider records stale_dialog; opposite branch of 28
- 45 R: divider details from other giver than pending talk still stale_dialog
- 58 R: SHOW_BANK settles pending talk without lastError and emits bank window event
- 74 R: auction window settles pending talk without lastError; receiveWindow auction branch
### packages/core/src/wow/quests.test.ts
- 61 R: selectQuest/selectOption authority, exact GOSSIP_SELECT_OPTION body, menu consumed after send
- 77 R: giver change rejects delayed old details as stale_dialog and revokes accept
- 87 R: query alone never authorizes accept/complete; unanswered query recorded
- 97 R: complete needs an offered quest, not merely log membership; sends COMPLETE_QUEST
- 109 R: request-items completability from server flags; unmet throws, no invented counts
- 124 R: reward index bounded to offer; choose sent is not reward evidence; QUEST_COMPLETE confirms
- 147 R: accepted/progress/completed/removed events derive only from observed log, abandon sent is not removal
- 176 R: slot swap is not accept/remove; failed flag reported distinctly
- 190 R: partial CREATE/missing self leaves log unknown; counters decode from slot; abandon unknown slot refused
- 205 R: authority loss and recovery produce no removed/accepted events
- 225 R: world reset revokes giver, accept stays unresolved, no fabricated outcome events
- 241 R: cancel recovery of silent request waits for server close; late menu/invalid don't resolve
- 263 R: unresolved settling rules across reset/cancel/close; accept never auto-settled
- 291 R: unanswered request not overwritten; stale menu cannot satisfy quest-specific request
- 305 R: reward for A precedes authorizing next quest B from same giver
- 329 R: reoffer after choose permits retry with no reward claimed
- 338 R: charmed self cannot give omitted-field authority after uncharm; no spurious accepted
- 355 R: snapshot mutation isolation for offered quests and log slots
- 367 R: send failure leaves menu open and publishes no intent event
- 377 R: QUEST_INVALID and QUESTLOG_FULL become lastError, never accepted
- 391 R: sign-magnitude kill target decode (-321) and empty ADD_ITEM carries no count
- 411 R: server close revokes accept; dispose rejects talk and silences events
### packages/core/src/wow/recovery.test.ts
- 87 R: release sends opcode 0x15a "00"; graveyard packets do not change life; only observed flags move dead→ghost
- 112 R: reclaim gating: query, delay, 3D range boundary z=40/39, exact CMSG_RECLAIM_CORPSE body, alive clears state
- 148 R: entrance-map corpse is not actual position; reclaim refused; absent corpse result handled
- 171 R: omitted delay keeps readiness unverified yet allows server-checked reclaim request
- 188 R: stale query tombstone across death epochs; fresh query only after reply; resurrection/delay cleared
- 213 R: resurrect response needs current offer; accept/decline bytes; override0 not a reclaim timer
- 246 R: entity disappear invalidates life/query before store removal; reappear restores
- 257 R: snapshot isolation of corpse position; dispose silences events and rejects actions
- 283 R: failed transport send creates no request; life stays dead
- 299 R: spirit-healer activation requires observed ghost and healer npc flag; exact opcode 0x21c body; clears on life
- 346 R: duplicate activation rejected through corpse query/reply, one 0x21c sent; overlaps 299's duplicate check but adds query interleave
- 404 R: timeout boundary (T-1 blocked, T allowed), cleared reason timeout, event order
- 429 R: halt clears unanswered request immediately and permits a new send
- 443 R: offer name falls back to observed caster entity name lazily
- 460 R: spirit-healer confirm retained for ghost with captured bytes, no packet sent, cleared on life
- 475 R: living character ignores confirmation, no events

### packages/core/src/wow/remote-motion-handlers.test.ts
- 29 R: MSG_MOVE_SET_RUN_SPEED packet decodes into unitmotion run speed with move_msg source and timestamp; misrouting breaks agent speed data
- 49 R: pitch-rate opcode lands on the pitch kind and leaves run untouched; a mis-mapped speed opcode would corrupt the wrong kind
- 65 R: SPLINE root/unroot/swim toggles reclassify the observed pose; wrong flag mutation misreports reachability
- 95 R: toggle preserves unrelated observer bits (FORWARD kept with WALKING); a flag overwrite would drop movement
- 115 R: toggle for a guid with no pose creates nothing and raises no error; handler boundary distinct from remote-motion.test.ts:351 (class level)
- 132 R: compressed SMSG_SPLINE_MOVE_SET_HOVER is unpacked and applied; a broken compressed-spline route would ignore hover
- 158 F: only asserts register does not throw on a dispatch-only conn; assert the opcode handlers are actually registered on the dispatch

### packages/core/src/wow/remote-motion-lifetime.test.ts
- 28 R: transfer invalidates, gates old-map packets, and NEW_WORLD clears poses; stale poses would leak across worlds
- 50 R: map-change invalidation refuses later heartbeats for the old map lifetime without refreshing age
- 64 R: same-GUID CREATE replacement emits removed then pose and resets validity; stale lifetime would carry old state
- 92 R: OUT_OF_RANGE removes the pose and later heartbeats do not resurrect it
- 106 R: death invalidates immediately, rejects observations while dead, and recovers after revive
- 123 R: UPDATE_OBJECT movement flag authority: swimming invalid, absent flags stay unknown, later flags recover
- 150 R: malformed movement block for known GUID invalidates while preserving position and age
- 168 R: NPC CREATE movement never yields a remote pose (only players); catches NPC spline data entering player poses

### packages/core/src/wow/remote-motion.test.ts
- 48 R: classifyGroundFlags table over every unsafe class and boundary; wrong reason misclassifies remote movement safety
- 77 R: captured packets give exact poses, no extrapolation, and entity-event ordering against real reference bytes
- 133 R: unknown, NPC and self GUIDs cannot create poses or move self; a mis-routed self guid would teleport own pose
- 159 R: malformed and time-skipped bodies invalidate without refreshing receivedAt; recovery after good packet
- 191 R: teleport and knockback produce invalid discontinuity reasons then recover on heartbeat
- 216 R: unsupported, contradictory and unknown flags are stored but rejected with right reason (swim, contradictory, unknown_flags)
- 251 R: compressed move subpackets each applied and a malformed one reported; error recovery path
- 302 R: applyFlags root makes moving stationary, hover makes invalid, clearing recovers; direct class boundary for toggle state machine
- 328 R: discontinuity, death and missing flags stay invalid through a toggle; guards against toggle laundering invalid poses
- 351 R: applyFlags on unknown guid creates no pose and emits nothing

### packages/core/src/wow/rewards-object.test.ts
- 48 R: chest open waits for server offer without sending CMSG_LOOT, then take sends 0x108; catches premature loot request on game objects
- 67 F: bare toThrow() with no message/type; assert the specific refusal so it cannot pass for an unrelated throw

### packages/core/src/wow/rewards-open-failure.test.ts
- 57 R: full response after the release-only message opens the window and the timer does not fire release_only; catches false failure
- 75 R: corpse despawn during opening closes it with loot_source_unavailable and frees the next open
- 94 R: release_only timeout boundary (bound-1 still opening, bound closes with release_only); timeout contract
- 114 R: abandonOpen closes unanswered opening, emits loot_open_failed once, next corpse opens
- 128 R: abandonOpen with no open request emits no event (idempotent)

### packages/core/src/wow/rewards-release.test.ts
- 72 R: removing last item sends exactly one CMSG_LOOT_RELEASE with guid, pending close, closes on reply; catches double/missing release
- 92 R: partial take sends only autostore and keeps window open; catches premature release
- 102 R: offered money holds the window open until cleared, then releases and moves to closing
- 113 R: manual close after an automatic release sends nothing further; catches duplicate release packets

### packages/core/src/wow/rewards.test.ts
- 92 R: opening is intent until a matching server offer; wrong-guid offer ignored, second open and early take refused
- 115 R: corpse eligibility checks and take limited to offered owner/allow slots; catches taking unoffered slots
- 137 R: slot removal and own item push stay separate from inventory observation; foreign-guid push ignored
- 184 R: later equipped-bag create introduces child item into inventory snapshot and event state
- 229 R: resuming inventory observation refreshes membership changed while listener absent; stale inventory otherwise
- 253 R: zero-GUID item push/money notice not labelled owned before self identity is known
- 271 R: money clearance/notices never bump coinage optimistically; only server field update does
- 303 R: inventory-full failure keeps item offered and retake works; recovery path
- 336 R: matching release is a barrier: foreign/unsuccessful releases ignored, pending slot removal during close handled
- 368 R: same-GUID offer accepted after unsolicited release and preliminary cleanup; catches stuck opening
- 395 R: release-only opening response stays unanswered, blocks retake/open, no extra sends
- 413 R: rejected opens and empty loot report actual error and refuse take/takeMoney with no fake progress
- 435 R: source disappearance invalidates the open window yet makes no fabricated release ACK; close still sends release
- 452 R: self disappearance hides stale private inventory and blocks takes before store clears
- 469 R: snapshot mutation cannot inject offered items and disposal blocks stale handlers and actions
- 494 R: malformed packet and failed send leave existing authorization and phase unchanged

### packages/core/src/wow/runtime-data.test.ts
- 24 R: capabilitiesOf reports no factions/spells before any load; default capability contract
- 33 R: warmCatalogs without a spell data source starts no loading promises
- 40 R: both catalogs load concurrently, capabilities flip true, combat.setCatalog called once
- 52 R: missing Spell.dbc rejects with the file name, leaves spells unloaded while factions load; partial-failure path

### packages/core/src/wow/self-store.test.ts
- 7 R: login wait resolves even when a listener throws; catches throwing listener stranding login
- 22 R: login wait times out at exactly the bound (999 pending, 1000 rejects)
- 40 R: NEW_WORLD updates the current map id; catches stale mapId after transfer

### packages/core/src/wow/spell-catalog.test.ts
- 73 R: missing Spell.dbc rejects naming the file; a silent empty catalog would hide a bad DBC dir
- 80 R: non-WDBC magic rejected (dbc.ts:38); a misread file would yield garbage spells
- 93 R: truncated record payload rejected (dbc.ts:59); prevents out-of-bounds row decode
- 105 R: Spell field count other than 234 rejected; guards the hardcoded build-12340 layout
- 117 R: SpellRange layout mismatch rejected by name; companion layout drift would shift ranges
- 128 R: missing companion table (SpellRadius.dbc) rejected by name; distinct from the Spell.dbc branch
- 144 R: unknown id is undefined while a present id resolves; catches wrong id indexing
- 159 R: joins Spell fields, float and locale strings with companion rows at DBC offsets; a shifted column fails
- 248 F: name claims no learned-only filtering but never asserts spell 9999 stays retrievable; add get(9999) defined
- 280 R: duration index 0 yields no duration row; catches a bogus row-0 join
- 294 R: aura-state/aura-spell offsets 20-27 decoded to the right fields; swapped columns fail toEqual

### packages/core/src/wow/spline.test.ts
- 6 R: linear interpolation at the midpoint; wrong time fraction or segment breaks position prediction
- 27 R: catmull-rom at t=0 yields the first control; a bad basis or index shifts launch position
- 49 R: open catmull uses orientation predecessor and repeated final node (numeric 5.0625 reference); wrong padding breaks curve
- 70 R: open catmull without finite launch orientation is unsupported; avoids a NaN position
- 88 R: cyclic spline wraps elapsed past duration; non-wrapping overshoots or clamps
- 107 R: falling flag returns unsupported with reason rather than a stationary sample
- 125 F: parabolic only asserts supported false; also assert reason "parabolic" to pin why
- 162 R: createTrajectory drops padding nodes and derives orientation from first segment
- 172 R: cyclic closing node is dropped and cyclic flag set; wrong count makes a duplicate stop
- 178 R: with fewer than two nodes the given facing is used as orientation

### packages/core/src/wow/trainer.test.ts
- 65 R: observed trainer list sends CMSG_TRAINER_LIST and labels spells by level and state; also recomputes on level change
- 88 R: gossip-opened list needs no request; non-trainer npc refused
- 98 R: new primary profession needs a free profession point; refusal sends nothing, point frees it
- 141 R: training confirmed only after server success, learned spell and coin drop; no early confirm
- 167 R: unlisted or too_low spells refused locally with no listing, not offered, or state reason
- 175 R: server buy-failed names reason not_enough_money; silence times out as unanswered
- 200 R: request started from a settle listener still arms the answer timeout (reentrancy)

### packages/core/src/wow/unit-relation.test.ts
- 92 R: targetRelation names hostile/neutral/friendly from templates and unknown for bad template or guid
- 126 R: forced reputation rank beats template masks (Unit.cpp reference); reordered precedence flips result
- 138 R: reputation rank decides, capped to neutral when at war; catches an uncapped at-war friendly
- 153 R: rank 0-7 mapped to hostile/neutral/friendly boundaries per Unit::IsHostileTo/IsFriendlyTo
- 169 R: player targets keep the template rule despite reputation view
- 179 R: no reputation rank falls back to template; unknown template stays unknown
- 189 R: reputationReaction faction mapping, forced-over-rank, at-war cap; unit-level boundary for the helper behind 138
- 224 R: neutral-to-all or unknown templates never aggro
- 234 R: templates hostile to the player (mask and enemy list) start the fight; friendly does not
- 242 R: listed reputation rank overrides template masks for aggro, including unlisted-without-rank case

### packages/core/src/wow/vendor.test.ts
- 118 R: list sends CMSG_LIST_INVENTORY, rejects a second pending list, reply opens window and events
- 138 R: non-vendor npc or unknown guid refused locally with nothing sent
- 145 R: SELL_ITEM failure cant_find_vendor on a pending list closes window and names reason
- 162 R: gossip-opened inventory opens window without request, one listed event
- 171 R: vendor disappearing invalidates window and blocks sell with reason
- 183 R: sale confirmed only after stack count drops and coinage rises; money delta recorded
- 204 R: whole-stack sale confirmed only when slot empties, not on money alone
- 216 R: server sell failure names cant_sell_item with zero money change
- 230 R: local sell refusals for no window, empty or equipped slot, oversize count
- 241 R: buy sends BUY_ITEM, confirms only with server ack plus money leaving; wrong money delta fails
- 260 R: buy of an unoffered slot refused locally
- 266 R: price-0 good bounds charge via gold pricing; extended-cost item keeps min/max 0
- 310 R: buy failure and inventory-full bag error map to named reasons with price bounds
- 339 R: repair confirmed when all damaged items return to full and money arrives; nothing-needs-repair guard
- 364 R: damaged bank item ignored by carried repair; regression for region scoping
- 409 R: vendor without repair flag refused locally
- 416 R: silence after window yields partial not_repaired, then unanswered for a sale; timeout path
- 443 R: purchase started from listed event keeps its answer timeout (reentrancy)

#### Seams
- none

#### Defects
- none

## devtools

### packages/devtools/src/area-names.test.ts
- 31 R: parses the 3.3.5 Area enum block by id; wrong block would name zones from vanilla ids
- 39 R: version selector picks another block; ignoring the arg would always read 3.3.5
- 43 C packages/devtools/src/area-names.test.ts:31: the full toEqual at 31 already excludes id 0 (NONE); not.toHaveProperty adds no branch
- 47 R: unknown version throws "no Area enum for version"; silent empty table would hide a bad generator input

### packages/devtools/src/cite-check.test.ts
- 64 R: citation inside the opcode's enclosing function is ok; false mismatch breaks the doc gate
- 72 R: handler-name binding (CMSG -> HandleTimeQueryOpcode) accepted
- 78 R: packet-class scope binds SMSG to its class, both .cpp writer and .h constructor
- 89 R: opcode-table line names the opcode directly
- 95 R: table line citing another opcode's row is a mismatch; a scope-wide check would pass it
- 106 R: every line of a comma list is checked, a bad first line is reported
- 117 R: enclosing function naming no bound opcode is a mismatch
- 128 R: missing, out_of_range and ambiguous verdicts each reported
- 138 R: no bound opcode gives "unbound", only file/line checked
- 154 R: failed() true only on a broken verdict, unbound is not a failure; exit-code contract
- 159 R: report format and totals are what the CLI prints
- 165 R: empty report totals line; cheap zero edge, kept (uncertain)

### packages/devtools/src/cite-markdown.test.ts
- 7 R: extracts path, line range expansion and binds the item's opcode
- 24 R: comma lists and checkout-prefix stripping
- 32 R: Peon sources and bare ":167" continuations are not citations
- 36 R: opcode binding per table row
- 43 R: binding stops at paragraph and list-item boundaries
- 50 R: all opcodes in a block are bound
- 60 R: MSG_MOVE_* prefix pattern is not an opcode

### packages/devtools/src/cite-source.test.ts
- 73 R: outermost function around nested block, not the next function
- 80 R: nested local type member resolves to the outer function
- 86 R: signature line above the brace is in scope
- 90 R: braces in comments, strings and macros do not shift scope
- 96 R: class scope for a member declaration without leaking the other class
- 103 R: line outside any scope falls back to the line itself
- 109 R: CMSG handler map extracted from the opcode table, Handle_NULL skipped
- 117 R: packet class to opcode map for server and client packets

### packages/devtools/src/git-env-guard.test.ts
- 4 R: clean command keeps its exit code, nothing changed
- 9 R: git config write through the exported GIT_DIR is caught and fails
- 14 R: command really runs with GIT_DIR/GIT_WORK_TREE on the sandbox

### packages/devtools/src/probe-account.test.ts
- 34 R: paths follow soap create layout; wrong path means the probe can't find an account
- 43 R: config read with uppercase SRP password and defaults
- 56 R: spell_data_dir wires dbc reader; missing file error
- 70 R: no spell_data_dir leaves dbc undefined
- 76 R: absent config refuses the account
- 82 R: config for another account refused
- 89 R: running puppet (live pid) blocks the probe; two clients on one account
- 98 R: stale pid file ignored
- 106 F: asserts lowercase "secret1" absent but loadAccount uppercases the password to SECRET1; also assert "SECRET1" (case-insensitive) is absent

### packages/devtools/src/probe-args.test.ts
- 8 R: step order, bodies, flow args, opcode by name and hex
- 41 R: wait, until, expect, bodies, out parsing and ms conversion
- 67 R: each table row is a distinct refusal branch with its usage text

### packages/devtools/src/probe-flows.test.ts
- 121 D: flow discovery; flow() throws on a missing name so every flow test below proves load; keeper packages/devtools/src/probe-flows.test.ts:129
- 129 R: login flow reports place state
- 147 R: unknown place waits out the settle time then reports nulls
- 163 R: nearest by role excludes the character, rounds and formats guid
- 188 R: gameobject and player kinds filter by object type
- 199 R: settle-time polling: finds late arrivals, empty after timeout
- 213 R: unknown kind refused
- 220 R: talk targets nearest entry through handle.talk
- 233 R: talk waits for the entity to appear
- 242 R: no such entity refuses and does not talk
- 251 R: missing or non-numeric entry refused

### packages/devtools/src/probe-run.test.ts
- 89 R: end to end send, until reply, report, trace rows and counts against the mock world server
- 142 R: headers only without --bodies and --out directory honored
- 155 R: exits 3 and names missing expected opcodes
- 162 R: notices include one injected before subscribe
- 179 R: failing flow recorded, logout still sent, exit 1
- 195 R: login, send, nearest run in order; flow results reported
- 213 R: unknown flow exits 2 before any login
- 222 R: login failure and unset account exit 1 with the error

### packages/devtools/src/protocol-tables.test.ts
- 58 R: only 3.3.5-valid messages, boundary cases 3.3.3 and 1.12 excluded
- 77 R: MSG client/server pair named once, core name overrides kept
- 95 R: AzerothCore-only opcodes get their numbers; hand-copied table of reference values (mild inventory risk, kept)
- 104 R: two names on one opcode throws
- 118 R: CREATED_BY goes under GAMEOBJECT_FIELDS as u64
- 132 R: core PLAYER slice names are added
- 137 R: unknown field type throws
- 144 R: long field wraps in generated output

### packages/devtools/src/stale-docs.test.ts
- 9 R: dated history wrapped across lines is reported at first line
- 22 R: each history form flagged
- 37 R: needed dates kept; false-positive guard
- 43 R: allowed tmp paths not flagged
- 55 R: other tmp paths, DECISIONS.md, old names flagged
- 70 R: nonexistent source paths flagged, external paths ignored
- 97 R: capability index complete and real is clean
- 103 R: retired scenario and missing new scenario both reported

#### Seams
- packages/devtools/src/probe-run.ts `ProbeDeps` (login, logoutMs, settleMs, root) and stale-docs `exists` param, cite-check `Tree`: injected params that tests use; [INFERENCE] production callers pass real ones

#### Defects
- packages/devtools/src/probe-account.test.ts:106 negative can pass for the wrong reason (password is uppercased to SECRET1, assertion checks lowercase)

## devtools-probe-flows

### packages/devtools/src/probe-flows/achievements-level.test.ts
- 113 R: flow targets the nearest living attackable hostile, not the guard, and reports earned achievements; wrong filter attacks a guard
- 135 R: self death ends the fight loop with self_dead; a missed check burns the whole time limit
- 147 R: loop ends at the deadline with timeout within 300-600 ms; a broken clock check hangs a probe
- 158 R: no hostile within 35 yd fails with a message instead of idling

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/achievements-title.test.ts
- 37 R: chooses the earned title bit then clears it; a skipped clear leaves a title on the account
- 73 R: a different title already chosen is not mistaken for ours; bit check settles on the right title
- 110 R: no SMSG_TITLE_EARNED fails instead of choosing nothing
- 115 R: refused setTitle surfaces the reason; swallowing it reports a false pass
- 133 R: title that never applies times out with an error rather than reporting success

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/auction-browse.test.ts
- 116 R: open/search/own/bids sequence calls the acts with the auctioneer guid and reports each status
- 133 R: name and from args reach searchAuctions; a dropped filter probes the wrong query
- 143 R: no auctioneer in view throws; guards a silent no-op

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/auction-trade.test.ts
- 169 R: post calls postAuction with the carried item, bid, buyout and 12 h duration
- 185 R: cancel sends only when the id is on the own list
- 193 R: a cancel for an id not on the own list sends nothing; guards cancelling someone else's auction
- 203 R: buyout bids the buyout price only on the row with the given owner
- 214 R: wrong owner sends no bid; guards buying out another seller's row
- 224 R: pending lists pending sales through listPendingSales
- 231 R: no auctioneer in view throws

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/bank-moves.test.ts
- 172 R: open, deposit then withdraw round trip uses the carried bag/slot and the bank slot it lands in
- 185 R: no carried item skips the deposit and sends nothing
- 195 R: item= picks the entry named, not the first carried item
- 209 R: withdraw finds a stack stored inside a bank bag and uses the bag's slot id
- 245 R: buy loop stops at the first refusal and reports each outcome
- 259 R: no banker in view throws

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/battlegrounds-queue.test.ts
- 13 R: join turns an act rejection into a reported error instead of throwing; flow keeps probing
- 23 R: leave targets the first non-empty queue slot, not slot 0
- 37 R: hello with no battlemaster or guid fails; guards a blind hello
- 42 R: unknown step lists the valid steps

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/channels-admin.test.ts
- 19 R: joins then runs all eight admin actions in order and collects a notice each
- 65 R: channel and partner are both required; each missing arg throws
- 74 R: a refused admin action surfaces its reason instead of passing

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/channels-list.test.ts
- 49 R: list, display list, count, and the non-member list in order; result shapes carry guids and the not_member reason
- 71 R: a partner missing from the list fails the flow
- 77 R: channel name is required
- 81 R: a refused list surfaces the timeout reason

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/charters-buy.test.ts
- 120 R: showList, buy, query, showSignatures and rename run in order with the master and charter guids
- 143 R: missing name throws before any act

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/combatlog-fight.test.ts
- 66 R: attacks the nearest hostile, casts the spell and counts log entries by kind and direction
- 103 R: no spell argument means no cast; guards casting a default spell
- 119 R: entry= skips nearer hostiles of other entries and attacks the matching one
- 144 R: bad entry arg throws; expect(async fn).toThrow is not awaited but verified to fail on mismatch
- 149 R: bad spell arg throws; same unawaited async toThrow form

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/combatlog-use.test.ts
- 53 R: item=<id> finds the matching item in a bag, ignores equipment slot, and counts the resulting entries
- 76 R: missing item throws with the id
- 81 R: spell=<id> casts on the character
- 89 R: neither or both of item and spell throw; two-way argument guard

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/contacts-notes.test.ts
- 33 R: add friend, set note, request contacts and ignore sequence with the reported note and counts
- 52 R: friend argument required

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/emotes-fight.test.ts
- 113 R: attacks the nearest attackable hostile and lists emote events from it; guard is never attacked
- 143 R: self death ends the loop; separate owner copy of the fight loop
- 155 R: loop ends at the deadline with timeout in 300-600 ms
- 166 R: no hostile within 35 yd fails

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/emotes-send.test.ts
- 64 R: wave emote then text emote at the nearest creature; echo reported with its target
- 96 R: no server echo naming the target fails the flow
- 108 R: a refused emote act reports the reason and never sends the text emote
- 119 R: no creature in view fails

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/guildadmin-roster.test.ts
- 16 R: guildless character resolves undefined and the flow still returns; one request issued
- 26 F: mock returns the roster and the test asserts it came back; add a member guid assertion so the json bigint serialisation is covered

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/inspect-partner.test.ts
- 86 R: inspect and inspectAchievements are called with the partner guid and specs and count reported
- 162 R: far=1 walks 40 yd away in legs of at most 20 yd and records the silent reply
- 181 R: far=1 standing on the partner (zero direction) still walks away; new direction branch
- 188 R: a stopped walk leg fails with its reason
- 193 R: name argument required
- 198 R: player not in view fails naming him

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/items-move.test.ts
- 59 R: equip passes bag/slot to handle.equip and reports the confirmed move
- 74 R: equip_to resolves the item guid at bag:slot and passes the equipment slot
- 81 R: unequip defaults the target bag to any bag (0) and honours to=
- 92 R: move and split parse to= as bag:slot or backpack slot; split passes the count
- 112 R: unknown do, missing slot and an empty source are refused

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/items-open.test.ts
- 58 R: read passes bag/slot and reports the outcome
- 70 R: open reports the loot window outcome
- 82 R: text queries by the item guid at bag:slot
- 95 R: unknown do, missing slot and empty slot are refused

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/items-refund.test.ts
- 150 R: buy sends the first free backpack slot and the vendor slot, reports the carried guid and priced rows
- 166 R: a full backpack refuses the buy instead of sending to a slot the server drops
- 188 R: missing slot takes the first vendor row
- 201 R: info and refund pass the full 64-bit guid beyond 2^53; a Number cast corrupts it
- 215 R: do, npc, item and a malformed guid are each refused

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/items-sets.test.ts
- 52 R: save passes index and name and reports the saved outcome
- 73 R: use and delete send the index
- 96 R: unknown do, missing index, index out of range and a name over 16 chars are refused

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/items-wrap.test.ts
- 70 R: entries resolve to carried positions, wrap is sent with them, and the wrapped item is reported
- 88 R: bag:slot arguments are used verbatim; separate parse branch
- 97 R: name returns the cached row or null when the server stays silent
- 106 R: unknown do, bad entry, missing gift and not-carried items are refused

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/looting-kill.test.ts
- 108 R: targets the nearest untapped attackable hostile and reports the loot owner after death; guard, tapped and far rows skipped
- 147 R: walks in 20 yd then 7 yd steps to melee range of a far creature
- 183 R: self death returns owner null; the deadline returns timeout
- 205 R: no hostile within 35 yd and seconds=0 are both refused

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/looting-master.test.ts
- 118 R: a loot window with no candidate list is closed before the next kill; attempt count and opened order are observable

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/mail-actions.test.ts
- 76 R: send uses the stack whose guid was requested, not the first stack of the entry
- 94 R: a stale guid is refused instead of substituting another stack
- 108 R: two stale guids for one entry do not send one stack twice
- 122 R: a stack spelled twice (decimal and hex) is refused as a duplicate; both orderings kept, second covers the hex-first parse
- 144 R: malformed guid reports bad item, not a raw SyntaxError

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/mail-inbox.test.ts
- 124 R: walks to the mailbox, queries, lists, marks the first unread and lists again; counts of acts asserted
- 137 R: inbox with only read letters skips the mark
- 173 R: a mailbox found by gameobject template type when no npc role names it
- 185 R: no mailbox in view throws

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/objects-fish.test.ts
- 45 R: casts Fishing with no target and reports the waiting phase
- 60 R: seconds argument validated before casting
- 69 R: facing argument validated before casting
- 80 R: hooked bite uses the bobber exactly once despite two events
- 99 R: without use= the bite never triggers a bobber use
- 111 R: fish_escaped ends the run before the deadline
- 123 R: an early use then fish_not_hooked ends before the deadline
- 138 R: face is called before cast via invocation order

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/pets-bar.test.ts
- 58 R: with a pet out it re-requests the bar and waits for the reply; no Call Pet cast
- 75 R: with no pet out it casts Call Pet on the character first
- 90 R: dismiss=1 casts Dismiss Pet and waits for the cleared bar

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/pets-command.test.ts
- 76 R: unknown do value refused
- 84 R: stance calls petStance and waits for the next bar
- 96 R: stay,follow issue petCommand in order, each after a bar reply
- 114 R: stop engages the nearest hostile, stops the pet and waits for its target to clear

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/pets-spell.test.ts
- 89 R: no spell, autocast or swap argument refused
- 97 R: spell casts the named bar spell at the nearest hostile
- 116 R: unknown bar spell name refused
- 124 R: autocast sends the toggle and waits for the next bar, reports previous state
- 142 R: swap refreshes the bar before swapping, then asks again; ordering asserted

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/pets-talent.test.ts
- 61 R: confirms only when the reply holds the requested talent
- 78 R: empty reply reports unconfirmed
- 95 R: reply with another talent reports unconfirmed; separate branch from empty
- 110 R: a higher rank than requested counts as confirmed
- 125 R: previews several talents with one call and confirms when all held
- 149 R: a missing pick reports unconfirmed for a preview
- 164 R: malformed talents list refused
- 170 R: missing talent id refused

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/quests-daily.test.ts
- 51 R: line uses the queried quest title
- 66 R: an unqueried quest falls back to the bare id
- 75 R: a quest still in the log has no done-today line

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/quests-extras.test.ts
- 54 R: a pong from before the auto-launch is ignored
- 65 R: a pong after the auto-launch reports rtt and seq
- 77 R: no pong reports ping false after the wait
- 85 R: without Erona in view the flow refuses and sends no hello

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/quests-share.test.ts
- 138 R: sharer takes the escort quest and waits for it in the log; accept once
- 148 F: asserts only .not.toBe("resolved"), any rejection passes; assert the timeout message
- 155 R: partner prints the confirm offer for the escort quest with sharer guid
- 164 F: asserts only .not.toBe("resolved"), any rejection passes; assert the specific message
- 170 F: asserts only .not.toBe("resolved"), any rejection passes; assert the specific message

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/reputation-settings.test.ts
- 62 R: default watches, marks inactive and clears war in order for the right factions
- 73 R: do=show sends nothing and reports both rows
- 85 R: do=restore reverses all three settings
- 95 R: missing factions gives an error and sends nothing
- 101 R: unknown mode refused

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/selfstate-mount.test.ts
- 59 R: non-integer spell refused
- 67 R: casts, reports mounted and dismounted collision heights, dismounts once, no special anim
- 85 R: no collision height after the cast fails and still dismounts
- 94 R: a height identical to the pre-cast one never counts as change; fails
- 102 R: special=1 sends the special animation between mount and dismount
- 118 R: dismounted event drawn by the dismount is reported
- 134 R: waits for mount fields when the collision height arrives first

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/selfstate-swim.test.ts
- 49 R: swim toggles on, pitches up then down, restores pitch and always leaves the water
- 64 R: lead delays the first send
- 74 R: a refused pitch still leaves the water
- 84 R: fly mode retries CAN_FLY refusals, climbs, descends, lands and dismounts in order
- 109 R: a refused climb still lands and dismounts
- 123 R: no CAN_FLY grant fails and dismounts
- 135 R: no mount fails before any send
- 144 R: each bad argument is refused before any send

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/spells-mirror.test.ts
- 48 R: a refused cast reports the failure reason even when images are nearby
- 55 R: a failure for another spell is ignored
- 62 R: accepted cast with no summons reports no_images
- 71 R: combat subscription released after success and after a cast throw; leak guard

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/spells-missile.test.ts
- 63 R: reports the target position and trajectory once the cast shows
- 85 R: sends no report when the cast never shows
- 96 R: no hostile in sight fails

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/talents-glyph.test.ts
- 44 R: without slot= moves past refusing sockets and stops at the first that takes the glyph
- 60 R: an explicit slot= is tried once
- 69 R: remove= sends removeGlyph after apply
- 82 R: a not-carried item is an error
- 88 R: neither item nor remove is an error

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/threat-fight.test.ts
- 129 R: sends the pet at the target and casts Auto Shot (75) at it
- 146 R: a pull of two sends the pet at the first and Auto Shot at the second; negative cast asserted
- 162 R: without a pet it shoots and records victim switches; whole-result toEqual
- 194 R: walks to Auto Shot range before shooting; step counted
- 231 R: target filter picks only living hostile attackable in range, rejects when none
- 257 R: a refused cast does not end the fight
- 272 R: target_coincident face failure does not end the fight
- 287 R: loop ends at the deadline with timeout in 300-600 ms
- 297 R: no creature in reach and pull=9 are refused

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/trade-offer.test.ts
- 79 R: answers, then offers item, gold and accepts only after the window opens; call order asserted
- 96 R: no request returns no_request after the wait

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/travel-bind.test.ts
- 100 R: binds at the nearest innkeeper and waits for the bound event
- 128 R: an unanswered bind is reported with bound null
- 140 R: no innkeeper in view refused
- 148 R: gossip=1 picks the home option and waits for the offer without bindActivate
- 169 R: gossip menu with no home option refused

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/travel-fly.test.ts
- 75 R: flies the planned route with activateTaxi and waits for flight_landed
- 117 R: an instant teleport lands at once without waiting for flight_landed

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/travel-walk.test.ts
- 44 R: walks in 20 yd steps and sums the traveled yards across three legs
- 68 R: text coordinates refused
- 74 R: a stopped leg with no progress ends the walk with its status

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/unitmotion-cast.test.ts
- 101 R: walks to range in 20 then 6 yd, casts at the nearest hostile and lists speed changes for that unit only
- 156 R: casts when the creature stands on the character; target_coincident face failure tolerated
- 172 R: no spell, no hostile and seconds=0 each refused

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/unitmotion-kill.test.ts
- 126 R: attacks the nearest living hostile and records only its toggles
- 145 R: walks 20 then 7 yd to melee range
- 181 R: self death and the deadline both end the run
- 199 R: no hostile and seconds=0 refused

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/unitmotion-toggle.test.ts
- 76 R: casts at the nearest friendly unit and lists only its flag changes
- 114 R: no spell, seconds=0 and no unit are each refused and nothing is cast

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/vehicles-click.test.ts
- 46 R: clicks the entry unit and reports board ok, seat and exit ok
- 61 R: no unit of the entry nearby rejects with the entry id
- 75 R: a refused click reports the refusal and skips the exit

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/vehicles-drive.test.ts
- 76 R: walks ten yards along the facing once controlled, then exits
- 91 R: seat change requested only when seat is given; both branches asserted
- 103 R: no control means no walk
- 112 R: a refused click reports it and does not exit

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/vehicles-mount.test.ts
- 48 R: waits for the dismount after the cancel, not the earlier mount events
- 64 R: no post-cancel dismount rejects
- 74 R: a refused cancel rejects with its reason

#### Seams
- none

#### Defects
- none

### packages/devtools/src/probe-flows/vehicles-ride-with.test.ts
- 59 R: keeps waiting past one settle period for the partner, then ejects him
- 70 R: an unrelated rider recorded earlier is ignored
- 80 R: partner name matched case-insensitively
- 89 R: nobody riding reports boarded null and sends no eject
- 99 R: partner name required

#### Seams
- none

#### Defects
- none

## factory-1

### packages/factory/src/attempts.test.ts
- 22 R: no open PR yields reason fresh; wrong reason sends the worker down a rework path
- 26 R: newest verdict failed on current head gives review rework, incl. history of mixed verdicts
- 33 R: failed review answered by newer unreviewed head is recovery, not review rework
- 38 R: PR with no verdict is recovery; run-reason branch for unreviewed PRs
- 42 R: passing latest verdict on a sent-back PR is merger rebase; wrong reason misroutes the worker
- 48 R: verdict order from GitHub does not matter, newest wins; a sort bug flips rebase/review

### packages/factory/src/bounce.test.ts
- 35 R: In review head changed after a passing review is detected as moved; contract for bounce trigger
- 41 R: failed review plus changed head is rework not a bounce; false bounce would block valid rework
- 55 R: reviewed, judged, draft, unreviewed and non-In-review cards never bounce; guards each exclusion in one table
- 74 R: a landing in flight suppresses all bounces; avoids bouncing the merger's own push
- 94 R: first two bounces stay In review with the parseable marker comment, round-tripped through headMarks
- 107 F: status blocked is the status code that proves the branch; drop prose toContain("move the card to In review"). Keep not-"@" (no notification) and add the computed values the comment renders: the count "3" of maxBounces (`Bounce 3 of at most 2`, from the distinct-head count) and the 7-char head `c.slice(0, 7)`, `#7` from moved.pr; toContain on those values, not the sentence
- 114 R: already-bounced head is idempotent; repeated pass would spam comments or double count
- 119 R: Blocked then maintainer move back stays put, later new head restarts at 1/2; recovery ordering
- 137 R: merger rebase marker neither bounces nor counts toward the limit
- 145 R: marker parsing reads bounce/rebase and ignores unrelated comments; parse contract for GitHub bodies

### packages/factory/src/config.test.ts
- 19 R: missing pace file means default; crash here would stop the factory
- 23 R: persisted levels read with trailing newline
- 30 R: unknown level throws instead of guessing; a typo would silently run at the wrong pace

### packages/factory/src/issue-cache.test.ts
- 22 R: fetch younger than window reused; boundary issueCacheMs-1 protects the GitHub rate limit
- 30 R: boundary at the window refetches; a stale cache would feed old board state to prechecks
- 38 R: cache from the future refetches; clock skew would pin stale data forever
- 45 R: corrupt cache file refetches rather than throwing
- 52 R: concurrent prechecks share one fetch via the lock; breakage multiplies API calls
- 65 R: failed fetch releases lock so next precheck can fetch; deadlock otherwise
- 75 R: stale lock from a killed precheck is taken over; a stuck lock blocks every precheck

### packages/factory/src/markers.test.ts
- 11 R: worker claim marker followed by visible sentence stays live; parse regression would drop claims
- 20 R: reviewer claim matches own head only, negative uses a different head
- 27 R: landing marker with sentence is listed with its run and comment id

### packages/factory/src/migrate.test.ts
- 5 R: legacy label to column mapping; a wrong column mis-migrates cards
- 15 R: precedence rules (worker lock beats all, question beats review)
- 20 R: answered question with ready is ready; precedence branch
- 24 R: no status-bearing label returns null so status is kept
- 31 R: plan order status, unlabel, delete repo labels; wrong order loses labels before status set
- 56 R: card already in mapped column only loses labels, no redundant status step
- 63 R: already migrated repo plans nothing; idempotence
- 70 R: qa label and Triage cards untouched; migration must not destroy those
- 79 R: empty or blank label listing parses to none
- 84 R: parses gh label list JSON names
- 91 R: empty listing plans no label deletions, with delete control when label exists

### packages/factory/src/namigator-library.test.ts
- 30 R: library key changes with upstream commit, patch or build script, stable otherwise; stale library reuse otherwise
- 48 R: measurement tools do not change the key; avoids needless rebuilds
- 56 R: returns the keyed installed path; the runtime loads this file
- 66 R: missing build refuses with the build task command; actionable agent/maintainer failure
- 73 R: build for another patch set is refused; stale native lib would run
- 85 R: builds once, installs keyed file, skips the next build
- 103 R: failed build leaves nothing installed; a partial file would be loaded later

### packages/factory/src/omp-factory.test.ts
- 116 R: default XDG dirs untouched outside peon worktrees; wrapper must not disturb maintainer shells
- 128 R: linked worktree gets per-run dirs mirroring all but peon, resolved paths and clean git status; isolation contract
- 159 R: factory role prompt isolates even outside a peon worktree
- 173 R: runtime dir stays short enough for the systemd private socket limit
- 183 R: nested launch reuses run dirs; double isolation would split state
- 193 R: runtime dirs of removed worktrees deleted, live ones kept; cleanup safety
- 203 R: Orca status extension passed to role and plain launches, rest of args unchanged
- 218 R: missing extension file adds nothing; broken flag would crash omp launch

### packages/factory/src/pace.test.ts
- 64 R: matching automation has no drift; baseline for the reporters below
- 68 R: schedule from the other pace is flagged with the wanted value
- 75 R: lost setupDecision, precheck, base branch and disabled drifts all reported
- 90 R: disabled automation is drift at a level, qa not flagged
- 99 R: pause accepts the three disabled at any schedule
- 104 R: pause flags running work and a stopped qa
- 115 R: pause edits disable work, review, merge only; qa untouched
- 124 R: ending a pause enables and sets schedules in one edit command
- 134 R: reapplying current state makes no edits; idempotence of setup
- 142 R: drop-in keeps boot trigger, exact firing and interval; systemd file text is the contract
- 170 R: interval read from OnUnitActiveSec not the boot trigger
- 177 R: running timer counts as scheduled; false drift would loop edits
- 182 R: timer with no next run is drift in both elapsed and dead states
- 193 R: interval must match pace unless paused, missing interval reported
- 202 R: default one-minute accuracy is drift unless paused

### packages/factory/src/patch.test.ts
- 20 R: rebase that only shifts context keeps patch id, a real change does not; real git repo proves same-patch skip logic

### packages/factory/src/precheck.test.ts
- 28 R: worker picks oldest Ready card, ignores other columns, fresh mode
- 43 R: open factory PR makes a rework with PR number and reason; closed PR stays fresh
- 68 R: open blocked-by blocks the card, closed blocker does not
- 78 R: claim since last move to Ready holds the card; stale claim and pre-rework claim do not
- 94 R: local picks within 3 minutes hold the card and count toward the cap; double dispatch guard
- 108 R: wip cap on In progress at the boundary
- 117 R: reviewer picks oldest In review PR lacking factory/review; ignores In progress
- 129 R: verdict on head, drafts, closed and missing PRs are skipped
- 143 R: verdict on an older head does not count for the new head
- 151 R: live claim for current head locks and counts toward cap; old head or expired claim does not
- 182 R: live landing marker holds the card from review, expired one does not
- 205 R: merger picks oldest with green signoff, ci and review; approval required flag
- 221 R: each of the three statuses must be green on current head, pending or missing blocks, moved head blocks
- 243 R: skips blocked-by and stacked children, lands past them
- 258 R: live landing marker blocks every merge, expired one does not
- 279 R: live landings listed oldest first, only In review cards and landing markers
- 297 R: qa runs when main moved or nothing stored, not when unchanged

### packages/factory/src/qa-changes.test.ts
- 75 R: commits from one PR share one PR and issue, one PR fetch; proof and acceptance sections extracted
- 113 R: commit without PR falls back to its message with source none
- 131 R: PR closing several issues links all via closes field and body keywords
- 147 R: trailers skip API lookup and add issues; spares API calls and keeps source trailers
- 169 R: parses log fields and trailer numbers from the delimiter format
- 185 R: parses trailers from a real git commit via logFormat; guards format against git behaviour
- 221 R: section stops at same-level heading and ignores fenced hashes
- 229 R: section is null for missing or empty bodies
- 235 R: keywordIssues ignores plain references; only closing keywords count

### packages/factory/src/realm-service.test.ts
- 40 R: env overrides soap.env and strips trailing slash
- 48 R: missing service var throws naming the variable
- 54 R: truth read hits correct URL with abort signal for timeout
- 70 R: setup body posted as JSON to the char endpoint
- 81 R: account reset POSTs to the reset endpoint
- 90 R: health, presets and accounts are plain GET paths
- 103 R: error body surfaces reason code and status; agents branch on reason
- 124 R: non-JSON body becomes bad_response
- 131 R: slow service aborts to timeout
- 142 R: refused connection maps to unreachable
- 151 R: protected names and accounts refused before any request; protects live accounts
- 165 R: unknown char endpoint rejected before any request; path traversal guard
- 175 R: isCharEndpoint allows documented endpoints only, rejects traversal, truth and bare items

### packages/factory/src/reaper-land.test.ts
- 14 R: no proof means unlanded; baseline for keeping worktrees
- 18 R: zero commits ahead is landed; safe to remove
- 22 R: squash-merged PR counts only when local tip was one of its heads
- 27 R: cherry must be all minus lines; a plus line is unlanded work
- 32 R: squash commit matching whole-branch patch id counts, empty patch id never matches
- 41 R: prHeads collects merged head, commits and force-pushed heads, tolerating empty nodes

### packages/factory/src/reaper-recover.test.ts
- 42 R: dead worker's In progress card returns to Ready then unclaim, body carries run, death, branch, sha and PR facts
- 57 R: retry after Ready move still deletes the claim; recovery is resumable
- 67 R: no branch and no PR says so without naming one
- 76 R: card whose latest claim is another run's is left alone
- 83 R: card moved after the run's claim belongs to next worker
- 92 R: move and claim in same second still recovers; timestamp boundary
- 104 R: reviewer's later claim does not hide the worker claim
- 114 R: cards past In progress are left alone
- 123 R: dead reviewer's claim deleted, others' claims stay
- 138 R: merger and qa deaths change nothing
- 150 R: completed run finished normally even past cap
- 157 R: run neither done nor over cap is alive, no false recovery
- 166 R: quiet dispatch_failed run death names status and Orca's error
- 172 R: run past cap dies of the cap with role hours

### packages/factory/src/reaper-report.test.ts
- 43 R: title round-trips the worktree name; the reaper matches drafts by title
- 48 F: keep not "@" (no pings) and the archive path (`/x/alpha.patch`) and the held name `alpha`; drop prose "What to do:", "deletes this card" and the negated "- Issue:"/"back to Ready" sentences (only the absence of the computed "- Issue:" line for a null issue is worth keeping as `not.toContain("- Issue:")`)
- 59 F: keep issueOf parsing and the computed "- Issue: #103" line (number parsed from the branch); drop prose toContain("move #103 back to Ready"), whose only value, 103, "- Issue: #103" already asserts
- 68 R: newly held worktree creates exactly one draft
- 75 R: unchanged hold changes nothing despite age drift; no churn
- 80 R: changed reason or body edits draft in place with content flag
- 96 R: draft moved out of Blocked goes back with status-only update
- 103 R: drafts for released worktrees and duplicates deleted
- 113 R: drafts without a reaper title left alone; protects maintainer cards
- 128 R: stray body gives value and the unset command, no @ mention
- 135 R: stray creates one draft and keeps hold drafts
- 142 R: unchanged stray changes nothing, new value edits
- 150 R: next normal pass deletes stray draft
- 158 R: only the bot's reaper issues are closed; protects human issues

### packages/factory/src/reaper-supersede.test.ts
- 12 R: merged PR supersedes commits with its reason string
- 17 R: closed PR supersedes commits
- 24 R: branch moved on with open PR supersedes; closed PR ignored in favor of open
- 34 R: behind branch holds, not superseded
- 41 R: branch gone from GitHub holds
- 46 R: no PR holds even when branch moved on

### packages/factory/src/reaper.test.ts
- 50 R: auto run worktrees owned by reaper with automation role
- 61 R: cli-created worktrees owned by parent
- 73 R: no cli provenance means maintainer; protects human worktrees
- 80 R: name only starting auto- is not a run; guards false positive deletion
- 86 R: role from automation name across four roles
- 93 R: unknown automations get the longest cap
- 99 R: idle uses newest of worktree activity and own terminals only
- 109 R: no terminals falls back to worktree activity
- 115 R: completed and failed runs are done, dispatched and unknown are not
- 122 R: dispatch_failed done only after terminals quiet, boundary 2 minutes
- 129 R: age prefers dispatchedAt, accepts ISO, falls back to creation
- 146 R: cap exceeded only past role hours, boundary
- 154 R: allowlisted ignored dirs at any depth are clean
- 160 R: other ignored files are dirty and listed for tarball
- 166 R: tracked or untracked changes dirty, empty clean
- 172 R: factory runs may leave ignored scratch but not real changes
- 180 R: running run within cap skipped
- 192 R: done, clean, pushed removed
- 204 R: dirty trees archived, stopped and held, done or over cap
- 226 R: clean unpushed commits held without archive
- 242 R: finished run whose deleted PR branch landed removed; dirty merged still archived (#251)
- 265 R: not idle skipped even when removable
- 272 R: removed only when idle, landed and clean
- 278 R: dirty beats unlanded and archives while terminals stay

#### Seams
- packages/factory/src/issue-cache.ts `issueCacheMs`/`lockStaleMs` exports and sharedIssues `now`/fetch/lock-wait params: only issue-cache.test.ts drives them
- packages/factory/src/realm-service.ts `timeoutMs` option and injectable `fetch`: only realm-service.test.ts uses them

#### Defects
- none

## factory-2

### packages/factory/src/repo-guard.test.ts
- 20 R: unset core.worktree returns null; a false positive blocks the factory repo
- 24 R: returns the stray worktree value from .git/config
- 29 F: name promises the value too but asserts only the unset command; add `toContain("/wt/run-26")` (substituted stray path, a CONTRACT value); keep the unset-command check as the value-bearing path `/r/.git/config`, drop any sentence pinning

### packages/factory/src/setup.test.ts
- 33 R: every automation prompt starts with its [factory:role] marker that omp-factory parses
- 49 R: plan creates/keeps/edits with change lists; drift detection regression
- 63 R: non-factory automations are ignored, so none are edited
- 68 R: enable only on request
- 78 R: never disables a maintainer-enabled automation
- 87 R: create is disabled unless --enable (orca-ide argv)
- 98 R: edit by id never touches enabled state
- 127 R: promptDrift edits prompts only, ignoring schedule, state and foreign automations
- 167 R: syncPrompts runs one prompt-only edit per drifted automation
- 179 R: failed edit or throw is logged and the rest still sync
- 195 R: failed listing logs, does not throw, runs nothing
- 203 R: dry run reports and does not edit
- 213 R: correct wrapper link is left alone
- 217 R: missing or stale link is replaced with ln -sfn

### packages/factory/src/soap-cli.test.ts
- 14 R: list view leaves passwords out; leaking them is a secret exposure
- 26 R: --with-passwords keeps them

### packages/factory/src/soap-console.test.ts
- 45 R: console command runs for an account this worktree created
- 52 R: one JSON audit line per command, password never logged
- 70 R: failed run is logged then rethrown
- 91 R: guard table; foreign or unledgered accounts never send a command

### packages/factory/src/soap-copy.test.ts
- 42 R: one pdump copy confirmed by pinfo
- 54 R: pdump success without a character triggers another copy
- 63 R: three silent failures fail with a clear message
- 76 R: copy retried while the new account is not yet visible to pdump
- 88 R: other pdump errors are fatal, not retried
- 97 R: a character owned by another account is fatal and not recopied

### packages/factory/src/soap-create-trace.test.ts
- 18 D: restates the declared bodies flag, no logic; no contract beyond the constant; row writing keeper soap-create-trace.test.ts:22
- 22 R: JSON row per packet in a 0700 directory; trace files hold session data

### packages/factory/src/soap-create.test.ts
- 129 R: specOf resolves created presets and refuses template ones
- 139 F: pdump absence is checked on `commands` but copy goes through deps.copy; assert deps.copy never called
- 178 F: same vacuity: copy is deps.copy, not in the joined text; assert deps.copy never called for every created preset
- 200 R: death knight created at GM 1 and staged at 0
- 220 R: demotion happens when creation throws
- 231 R: demotion when the raise applies then rejects
- 251 R: 0x33 refusal surfaces after demotion, no pinfo
- 283 R: demotion readback of another account fails creation
- 296 F: bare toThrow passes from the creation error alone; assert `toThrow("demotion")` (as line 283 does) - the label is a branch label separating demotion failure from the creation error "level_requirement", so keep that token only, no sentence
- 306 R: stuck GMLevel 1 fails creation
- 320 R: fresh account reachable after one auth 0x4 with backoff
- 339 R: persistent auth 0x4 fails creation
- 350 R: create failure reason propagates on the non-privileged path
- 361 R: fishing template copies then stages; keeper for the shared eversong template
- 373 R: soap.env template override honored on the copy path
- 386 R: online login failure fails creation
- 399 R: learn happens online before the pole item is staged
- 429 R: character_online retried with sleeps
- 450 R: other service refusals are not retried
- 466 R: character_online forever fails the step
- 481 R: learns the spell via console then logs out
- 497 R: refused console command fails the learn
- 510 R: missing skill after learn fails

### packages/factory/src/soap-gm.test.ts
- 11 R: command templates sent to the server for each verb
- 57 R: guild-invite targets the second account's character and both accounts
- 66 R: injection and range guards refuse bad arguments
- 124 R: non-factory account refused by planGm
- 144 R: runs the planned command and prints JSON
- 157 R: server refusal exits 1
- 163 R: a bad verb sends nothing at the runGm boundary
- 169 R: usage errors without account or verb
- 209 R: two-step verbs read the account's characters first and target the named one
- 222 R: rename accepts any case and sends the server's spelling
- 228 R: rename refuses own or absent character, nothing sent
- 238 R: rename refuses when lookup finds no players
- 244 R: arena-disband reads the team first
- 252 R: arena-disband refuses non-Fac or foreign-captain teams, sends no disband
- 263 R: arena-disband refuses a missing team

### packages/factory/src/soap-presets.test.ts
- 14 F: the sorted presets-vs-specs equality is the contract; drop the named-preset toContain loop
- 32 D: restates declared template names and coordinates; no logic; shaman/hunter start proven by soap-create.test.ts:139
- 49 D: isPreset known/unknown already covered at soap-presets.test.ts:14
- 55 R: env key naming underscore form that soap.env can hold
- 62 R: soap.env override wins over the built-in template
- 72 C packages/factory/src/soap-presets.test.ts:62: override logic is the same; shared eversong template proven at soap-create.test.ts:361
- 82 F: keep elwynn Common and one Horde Orcish; drop the loop restating seven declared factions
- 99 D: restates declared race/class/gender; shaman create spec proven by soap-create.test.ts:139
- 124 D: restates declared preset data; staging proven by soap-create.test.ts:139
- 145 D: restates declared stage list; DK staging proven by soap-create.test.ts:200
- 160 D: restates declared fishing stage; order proven by soap-create.test.ts:399
- 170 R: needsProtocol routing decides which path soap uses

### packages/factory/src/soap-service-cli.test.ts
- 24 D: copies the declared command inventory, no contract; commands exercised by soap-service-cli.test.ts:35
- 35 R: truth maps account to character URL
- 42 R: setup posts the JSON argument to the right endpoint
- 50 R: setup without a body sends {}
- 56 R: reset and health URLs
- 66 R: protected accounts refused without a service call
- 82 R: bad JSON and unknown endpoint rejected locally
- 93 R: service error prints reason and exits 1
- 108 R: missing args print usage

### packages/factory/src/soap-wrapper.test.ts
- 68 R: wrapper runs the worktree puppet with the account's XDG dirs
- 83 R: config logging in another character refused
- 93 F: asserts only non-zero and empty stdout; assert stderr `toContain` the substituted values (the config account "x" and the expected `${account}/${character}`) as line 83 does for the mismatch; drop the "logs in ... not ..." sentence
- 100 R: missing config refused
- 109 R: removes only the account's wrapper and dirs, idempotent

### packages/factory/src/soap.test.ts
- 23 R: account name layout, uppercase hex plus random byte
- 28 R: character name mapping and triple escape
- 33 R: new names carry the time and match the sweep regex
- 41 R: triple detection is case-insensitive
- 47 R: triple in time digits never moves the creation second
- 54 R: no creation second or random byte yields a triple character
- 63 R: accounts differing in the time digit around a triple stay distinct
- 69 R: every random byte in a triple window maps to its own character
- 80 R: password shape
- 86 R: reserved and system accounts refused by the guard
- 98 R: near-miss names refused
- 105 R: factory account accepted
- 111 R: age read back from the name
- 116 R: non-factory name refused for age
- 122 R: envelope escapes XML specials
- 128 R: result text ok with CR entities stripped
- 137 R: fault is not ok and carries faultstring
- 146 R: unrecognised body is not ok
- 154 R: entities decoded
- 162 R: pinfo account parsing
- 170 R: no Account line gives undefined
- 178 R: parseEnv KEY=VALUE, quotes, comments
- 192 R: inherited config uses patched library and copies realm and data paths
- 223 R: defaults to localhost without maintainer config
- 229 R: missing patched library refuses with its message
- 257 R: creates once when name is free
- 263 R: retries with fresh names after collision
- 272 R: gives up after eight collisions
- 280 R: other failures not retried

### packages/factory/src/squash.test.ts
- 12 R: squash message layout with trailers crediting the maintainer
- 26 R: PR without why or closed issue refused
- 35 R: hook-rejected title refused
- 43 R: scope, breaking mark, 50-char boundary
- 52 R: why takes first lead paragraph, wraps at 72
- 59 R: heading-first body gives empty why

### packages/factory/test-support/git.test.ts
- 4 R: gitEnv strips GIT_ vars; leaks would make nested git tests hit the outer repo

#### Seams
- none

#### Defects
- none

## harness-events-ui-1

### packages/harness/src/events/covered.test.ts
- 53 R: a death in an awaited run is consumed by its call; unconsumed rows would double-wake the agent
- 66 R: a released run no longer consumes; the death must still wake
- 76 R: recover consumes release/alive/teleport but not the death row
- 104 R: quest progress inside a quest engage is consumed
- 117 R: money just after an engage ends is attributed to that call (post-run window)

#### Seams
- none

#### Defects
- none

### packages/harness/src/events/delivery.test.ts
- 88 R: wake text ordering, ages and the whisper "Next: social(...)" hint the agent acts on
- 120 R: party/guild/say/foreign whisper reply-call hints the agent parses
- 151 R: idle wake is sent at once as followUp with triggerTurn; marks the row delivered
- 170 R: busy agent holds wakes; consumed rows are skipped
- 188 R: chat wake while busy steers in and frees the waiting tool (human yield)
- 211 R: non-chat wake while busy waits for idle, then followUp
- 225 R: row consumed by a running engage survives a flush and returns if the run stops
- 254 R: a tallied row leaves the queue once the run ends
- 276 R: 5 s gap joins wakes into one message; fake-timer boundary
- 293 R: passive flush once, capped at 20 with a count line
- 308 R: chat wake takes no passive lines
- 323 R: non-chat wake carries passive lines in time order
- 333 R: human rows go to the session entry only, never sendMessage
- 349 R: takePassive returns and clears the buffer, marks delivered
- 368 R: passive rows from the run are attached to its result, not the next wake
- 400 R: attachCallRows shows 5 rows then a count and consumes all
- 420 R: no rows or no call adds nothing; wake rows are not attached
- 447 R: a landing inside a DONE fly call starts no turn
- 458 R: a landing after the call returned wakes the agent
- 489 R: stale attack wake is dropped when its fight ended, live one kept
- 504 R: every stale attack dropped with no wake; passive still flushes quietly
- 518 R: exploration XP is never pushed outside a tool result

#### Seams
- none

#### Defects
- none

### packages/harness/src/events/guard.test.ts
- 40 R: passive and log classes pass the guard untouched
- 46 R: burst of 3 wakes then passive
- 52 R: refill rate boundary (10 s gives one wake)
- 61 R: chat lines never throttled per sender
- 71 R: chat lines do not drain the wake bucket
- 77 R: invite from one sender held 20 s after the first, boundary at SENDER_JOIN_MS/SENDER_GAP_MS
- 87 R: attacker gets one wake per 30 s, other attacker independent
- 100 F: wake class, single row, 5 min boundary stay; text has computed minutes and the untried list: assert toContain("5 min") and toContain('travel(to: "unstick")'), drop the full sentence

#### Seams
- none

#### Defects
- none

### packages/harness/src/events/install.test.ts
- 74 R: router gets a sink; [now] injected before each run with the wow-now customType and logged once
- 90 R: buffered passive lines follow the [now] line
- 105 R: passive lines flush at agent_end without triggering a turn
- 129 R: session file symlink and [now] re-sent on resume only
- 152 R: wake run gets a hidden [now] once; later requests and passive flushes do not
- 201 R: per-call [now] only with --now-per-call
- 223 R: offline/loading [now] lines when no snapshot
- 238 D: restates nowMessage constants (customType, NOW_DISPLAY); keeper install.test.ts:74 asserts the same message shape through the hook

#### Seams
- packages/harness/src/events/install.ts `nowMessage` second param `display`: only install.test.ts:238 passes true; production calls use the default

#### Defects
- none

### packages/harness/src/events/move-join.test.ts
- 50 R: stop and start between legs of one run leave no stop row
- 60 R: leg ending in range logs its stop as arrived
- 73 R: run end writes a held stop before the run row, tagged with the run
- 88 R: stop outside a run is written at once

#### Seams
- none

#### Defects
- none

### packages/harness/src/events/now.test.ts
- 112 R: full [now] line against the design example; field order the agent reads
- 118 R: truncation drops nearest first then the rest, never self/place/running; length cap
- 137 R: cast and corpse shown and dropped before attackers
- 151 R: no-progress line and wake-off line
- 167 R: quiet state with no pose, power, target or run
- 188 R: mounted shown only while mounted
- 196 D: nowClock is already asserted as 19:13:31 in the full line; keeper now.test.ts:112
- 202 R: breath seconds kept after vitals and never dropped
- 216 R: no breath text without a timer
- 223 R: CP shown after power when held
- 228 R: CP hidden at zero or absent

#### Seams
- none

#### Defects
- none

### packages/harness/src/events/router-items.test.ts
- 111 R: item push row waits for a late name, then writes the named text
- 131 R: vendor list row waits for late names
- 146 R: detach drops rows still waiting for names

#### Seams
- none

#### Defects
- none

### packages/harness/src/events/router-pilot.test.ts
- 51 R: pilot events write jev rows tagged loop pilot and the pilot game-log rows with tally
- 81 R: outcome then stopped emits exactly one pilot/ended row
- 126 R: attacked stop ends the pilot as stopped with the attack reason
- 154 C packages/harness/src/events/router.test.ts:172: same loop=combat tag asserted on every tactics jev row there

#### Seams
- none

#### Defects
- none

### packages/harness/src/events/router.test.ts
- 63 R: attach subscribes every mock hook and detach removes them
- 83 R: area event with no rule writes one quiet fallback row
- 101 R: area attach rules write rows at attach
- 128 R: unawaited run end is a wake with run id
- 136 R: awaited run end stays a log row
- 146 R: wake off turns wakes into passive
- 155 R: throttled wake becomes passive and logs session/wake_throttled
- 172 R: tactics events logged to jev; stopped row drops its state
- 236 R: wake rows appended by other modules are delivered
- 249 R: rows an engage run summarises are consumed by its call, others are not
- 307 R: stopped engage gives its rows back
- 340 R: outside an engage run nothing is consumed
- 362 F: keep class wake, event and sink.wake call; text renders the looked-up name and ref: assert toContain("Springpaw Stalker") and toContain("u17"), drop "died (no credit to you)" sentence
- 402 R: no sink still logs the run end and delivers nothing

#### Seams
- none

#### Defects
- none

### packages/harness/src/events/rules-chat.test.ts
- 31 R: whisper from another player is a wake with full data
- 49 R: own echoes never rise above log
- 69 R: group channels from others wake
- 80 R: say wakes only when it names the character
- 93 R: monster lines and emotes passive, channels log
- 107 R: quiet system lines log, others passive
- 123 R: colour-wrapped server banners stay log
- 133 R: login toggles and MOTD stay log
- 142 R: colour codes and link wrappers stripped from text
- 165 R: invite/kick/disband wake, roster changes passive
- 194 R: becoming leader wakes
- 207 R: group list names members and leader
- 231 R: duel request wakes, countdown dropped
- 253 R: whisper during a run is stamped with the run and delivered as wake

#### Seams
- none

#### Defects
- none

### packages/harness/src/events/rules-combat.test.ts
- 80 R: attack wakes only while no run is active
- 103 R: pet attack command is a log row; absent reason gives none
- 131 R: attack start and cast rows are log, cast_sent dropped
- 171 R: kill credit and xp once
- 208 R: level-up passive once
- 228 R: aura gain/fade by slot
- 243 R: aura rows name the spell and keep the name for the fade
- 262 R: low-health wake once per line, re-arms 10 points above
- 274 R: big drop gives one row at the lowest line; run active makes it log
- 288 R: other units, other fields and death ignored
- 310 R: fight start and end with duration, stop row dropped
- 368 R: stop without outcome ends the fight with the last outcome
- 385 R: fights inside a cycle are passive; cycle steps are run progress

#### Seams
- none

#### Defects
- none

### packages/harness/src/events/rules-cycle.test.ts
- 39 R: second cycle in the same run counts on from the first
- 56 R: a new run resets the count
- 78 R: a cycle outside any run starts from zero

#### Seams
- none

#### Defects
- none

### packages/harness/src/events/rules-death.test.ts
- 47 R: watched unit killed by another player wakes once
- 65 F: tap "none" maps to a label in text and data.by tells the branch: assert data.by === "none" (plus name), text only toContain("no credit to you") and not "killed by another player"; drop whole sentence
- 73 R: own tap, unwatched unit, non-health change give no row
- 83 R: active run keeps the row in the log
- 89 R: a unit that left view is no longer watched
- 101 R: never watches the character itself

#### Seams
- none

#### Defects
- none

### packages/harness/src/events/rules-life.test.ts
- 34 R: wake on each change of life only, with killer
- 62 R: resurrection offer is passive
- 91 R: alive row names pose, way back and corpse distance
- 126 R: spirit healer or resurrection is the way back

#### Seams
- none

#### Defects
- none

### packages/harness/src/events/rules-world-quest.test.ts
- 67 R: accept, complete, reward passive rows with title and rewards
- 99 R: kill/collect progress carries counts; missing progress falls back
- 125 R: repeated progress count is one row, reset by accept
- 152 R: quest named from the dialog that offered it
- 178 R: events without a quest id and other types dropped
- 187 R: own item push is a passive loot row; another guid ignored
- 230 R: loot open and release are log rows
- 254 R: started group roll is a wake row
- 285 R: money changes from coinage, loot reason after a notice within the window
- 306 R: vendor action named as the money reason; late or repeated cases fall to other
- 347 R: release without a loot window logs an empty open first, once

#### Seams
- none

#### Defects
- none

### packages/harness/src/events/rules-world.test.ts
- 109 R: correction drift against the last pose; near drift stays log
- 132 R: teleport is its own passive row
- 149 R: stops and place changes logged, facing dropped
- 176 R: purchase passive with item name; request dropped
- 202 R: stack purchase names the items it gives
- 234 R: vendor list is a log row with item count and npc
- 255 R: vendor list repeats only when it changed for that NPC
- 286 R: vendor list row carries item names with fallback
- 319 R: trained spell passive, list log, request dropped
- 342 R: entity rows only with --log-entities
- 385 R: packet errors and notices are log rows

#### Seams
- none

#### Defects
- none

## harness-events-ui-2

### packages/harness/src/events/rules-xp.test.ts
- 50 R: exploration XP row carries source/area/total/next data; exploration gain must not duplicate as a pending "other" row
- 72 R: quest XP is attributed to the quest with levelUp and total; wrong source attribution misreports xp
- 88 R: unattributed XP is held, then written as source other after XP_SOURCE_WAIT_MS (timing/ordering)

### packages/harness/src/events/rules.test.ts
- 31 R: unitIds hex guid and u-ref, empty for undefined; row ids drive agent refs
- 38 R: run/started row data and run id/tool call keys
- 60 R: progress throttle boundary at RUN_PROGRESS_MS per run
- 74 R: awaited end is log, unawaited end wakes the agent
- 93 R: cancelled/interrupted runs map to run/cancelled and never wake

### packages/harness/src/events/snapshot.test.ts
- 109 R: look snapshot is a full row, units within 60 yd nearest first
- 123 R: look radius widens the unit window and clamps narrow radii to 60
- 142 R: tick heartbeat vs changed vitals/units sequence
- 161 R: no world writes no row
- 167 R: attach ticks every SNAPSHOT_EVERY_MS and stops on detach
- 181 R: snapshot file written under a sanitized label

### packages/harness/src/ui/cards.test.ts
- 64 R: event card one line per entry with glyph and time; ctrl+o hint on the death row
- 77 R: expanded card shows typed data rows
- 88 R: death wake is error-toned and passive digest is muted
- 103 R: missing or empty details return undefined so Pi uses its default box
- 122 R: human line is muted and uses the entry text
- 131 R: human line without data draws nothing

### packages/harness/src/ui/context.test.ts
- 8 R: module starts on the nerd glyph set
- 13 R: setGlyphs switches the set returned by glyphs()

### packages/harness/src/ui/draw.test.ts
- 42 R: bar eighths, cell count, zero max, tone paint
- 57 R: ascii set bar characters
- 64 R: money drops leading zero coins
- 72 R: healthTone half/quarter thresholds
- 78 R: padding/fit by cell width, not UTF-16 length
- 84 R: hms/span/seconds formatting
- 91 R: argText accepts strings and numbers only
- 98 R: whisper wake, passive, death glyphs and notice/run tones
- 112 R: chat rows take the chat-type glyph
- 126 R: life/alive vs resurrect_offer glyph distinction
- 135 R: area rows use area glyph, fall back to system
- 148 R: entryGlyph reads the active set at call time (context.test.ts:13 only covers glyphs())
- 155 R: drawn caches per width and cuts lines to width

### packages/harness/src/ui/footer.test.ts
- 54 R: four-row layout content at 220 columns
- 77 R: combo points shown only above zero
- 92 R: ghost corpse row replaces target row
- 102 R: dead or zero-max target clears the target row
- 122 R: reclaim clause follows recovery facts (undefined/0/30s)
- 137 R: four rows within width at every width and snapshot state
- 148 R: narrow width keeps vitals and drops extras
- 156 F: name promises missing capabilities painted but only the backoff link is asserted; add the missing-capability paint
- 168 R: pre-snapshot placeholder text
- 174 F: only asserts nerd.self absent; assert the ascii glyph is present and no other nerd glyph remains
- 187 R: footer component caches and redraws on a snapshot change

### packages/harness/src/ui/glyphs.test.ts
- 18 F: hardcodes the count 83 (copied inventory); keep the key parity across sets and drop the literal
- 25 R: every glyph in every set is one cell wide
- 34 R: nerd and unicode glyphs are unique per name, so screen tagging is unambiguous
- 46 R: flag beats environment
- 50 R: environment applies without a flag
- 54 R: nerd default for undefined and empty
- 59 R: unknown value warns once and falls back to nerd
- 71 R: tagNerdGlyphs replaces glyphs with names; glyphName lookup

### packages/harness/src/ui/install.test.ts
- 67 R: card and human-line renderers registered
- 73 R: no UI call outside the TUI
- 78 R: footer 4 rows, ticker 6 rows above the editor
- 90 F: asserts only that setTitle/setWorkingMessage were called once; assert the title and message content
- 96 R: log appends repaint at most once per REPAINT_GAP_MS
- 113 R: periodic tick repaints while idle
- 120 R: kill and XP log rows reach the ticker head
- 142 R: session_shutdown stops timers
- 156 R: V5 fallback widget below the editor and footer mount

### packages/harness/src/ui/renderers/card.test.ts
- 224 R: interact/loot/journal call-line text
- 236 R: talk card lists offers and the money delta line
- 254 R: failed interact with no NPC draws no skull or blank lines
- 267 R: turn-in shows money reward, not a zero delta
- 287 R: loot rows with quality colour
- 297 R: journal log label, timeline rows and rest count
- 306 R: quests tracker with turn-in hint and progress
- 318 R: spells list with cost, cooldown, auras and bar
- 337 R: empty spell sections draw no headings
- 351 R: professions, totems and runes sections
- 373 R: bags journal worn durability, item marks, ammo
- 388 R: empty bags draw no blank row
- 406 R: bank journal stored lines
- 434 R: mail journal subjects
- 461 R: card results fit 40 columns

### packages/harness/src/ui/renderers/line.test.ts
- 33 R: social call line for whisper, say, emote
- 45 R: collapsed DONE social result is one green status line
- 51 R: expanded social result adds echo and evidence rows
- 57 R: refusal red line with reason, danger and next lines
- 76 R: stop call line and expanded stopped-run rows
- 114 R: running result head shows the run id
- 121 R: collapse keeps five rows and counts the rest
- 133 R: detailsOf throws on the wrong tool so Pi falls back to text

### packages/harness/src/ui/renderers/live-run.test.ts
- 113 R: travel/engage/rest/recover call lines
- 126 R: running travel progress bar, run id, warning tone
- 142 R: finished travel leg summary
- 155 R: engage target, vitals, cast, Jev strip and tally rows
- 171 R: dead target and empty vitals drop their rows
- 187 R: expanded engage targets, decisions and error codes
- 199 R: expanded engage draws all decisions
- 218 R: rest used items and recover summary line
- 233 R: all live-run results fit 40 columns

### packages/harness/src/ui/renderers/picture.test.ts
- 64 R: look call line shows the filter
- 74 R: collapsed look status, vitals, place and danger rows
- 89 R: without danger the third row names nearest hostile
- 96 R: unchanged badge counts repeated looks
- 102 R: expanded 100-column rows without a map
- 112 R: expanded 140-column mini-map beside rows
- 125 R: collapsed output fits every width

### packages/harness/src/ui/status-line.test.ts
- 6 R: tab title shows danger (AGGRO)
- 10 R: calm title shows health only
- 14 R: death/ghost life state in title
- 20 R: no snapshot gives program name
- 26 R: working message shows run in game words
- 37 R: label used before first progress text

### packages/harness/src/ui/ticker.test.ts
- 73 R: head row run plus session tally
- 82 R: rows 2-6 hold newest visible events, tool calls hidden
- 99 R: not-implemented notices dim
- 109 R: emote notices never reach the ticker
- 139 R: idle head with no run
- 147 R: six rows within width at every width
- 166 F: name promises a one-second line cache but never advances the clock; assert the cache window or rename to redraw-on-new-row
- 178 R: one not-implemented line per opcode per session
- 202 R: time derives from the source clock

### packages/harness/src/world/extension.test.ts
- 28 R: extension loaded by path reads the world and moves only while its claim holds
- 52 R: inline extension gets the service via onWorld

### packages/harness/src/world/hub.test.ts
- 48 R: session attach/cleanup/re-attach across reconnect
- 72 R: session exposes reads/events only, no writers or lifecycle; frozen surfaces
- 87 R: claim sends until a human claim takes over, then refuses
- 105 R: lower-priority claim refused while held; free body granted
- 115 R: held claim refuses offline; release frees the body
- 124 R: claim refuses while the connection is closing
- 133 R: second claim by same owner supersedes the first
- 148 R: dispose loses live claims, frees body, refuses new claims
- 166 R: reads, events and log entries are frozen detached copies
- 205 R: claim.areas sends a listed act and refuses not_owner after loss
- 217 R: claim.areas refuses offline with no session
- 226 F: keep the frozen area state assertion; drop EVENT_KEYS/typeof/version 1/isWorld assertions that restate declared constants

#### Seams
- none identified; tests use exported public functions (tickerLines, footerLines, runDrafts, unitIds, createWorldService) that production also calls

#### Defects
- none

## harness-grader-1

### packages/harness/src/grader/accounts.test.ts
- 29 R: retained contract, behaviour asserted at the grader boundary
- 61 R: retained contract, behaviour asserted at the grader boundary
- 77 R: retained contract, behaviour asserted at the grader boundary
- 102 R: retained contract, behaviour asserted at the grader boundary
- 118 R: retained contract, behaviour asserted at the grader boundary
- 135 R: retained contract, behaviour asserted at the grader boundary
- 160 R: retained contract, behaviour asserted at the grader boundary
- 184 R: retained contract, behaviour asserted at the grader boundary
- 201 R: retained contract, behaviour asserted at the grader boundary
- 212 R: retained contract, behaviour asserted at the grader boundary
- 224 R: retained contract, behaviour asserted at the grader boundary

### packages/harness/src/grader/bots.test.ts
- 19 R: retained contract, behaviour asserted at the grader boundary
- 37 R: retained contract, behaviour asserted at the grader boundary
- 45 R: retained contract, behaviour asserted at the grader boundary
- 57 R: retained contract, behaviour asserted at the grader boundary

### packages/harness/src/grader/cli.test.ts
- 44 R: retained contract, behaviour asserted at the grader boundary
- 50 R: retained contract, behaviour asserted at the grader boundary
- 54 R: retained contract, behaviour asserted at the grader boundary
- 64 R: retained contract, behaviour asserted at the grader boundary
- 70 R: retained contract, behaviour asserted at the grader boundary
- 80 R: retained contract, behaviour asserted at the grader boundary
- 89 R: retained contract, behaviour asserted at the grader boundary
- 98 R: retained contract, behaviour asserted at the grader boundary
- 106 R: retained contract, behaviour asserted at the grader boundary
- 130 R: retained contract, behaviour asserted at the grader boundary
- 157 R: retained contract, behaviour asserted at the grader boundary
- 191 R: retained contract, behaviour asserted at the grader boundary
- 214 R: retained contract, behaviour asserted at the grader boundary
- 226 R: retained contract, behaviour asserted at the grader boundary
- 246 R: retained contract, behaviour asserted at the grader boundary

### packages/harness/src/grader/concurrent.test.ts
- 22 R: retained contract, behaviour asserted at the grader boundary

### packages/harness/src/grader/conditions.test.ts
- 27 R: retained contract, behaviour asserted at the grader boundary
- 60 R: retained contract, behaviour asserted at the grader boundary
- 71 R: retained contract, behaviour asserted at the grader boundary

### packages/harness/src/grader/console-read.test.ts
- 45 R: retained contract, behaviour asserted at the grader boundary
- 80 R: retained contract, behaviour asserted at the grader boundary
- 104 R: retained contract, behaviour asserted at the grader boundary
- 127 R: retained contract, behaviour asserted at the grader boundary
- 153 R: retained contract, behaviour asserted at the grader boundary
- 172 R: retained contract, behaviour asserted at the grader boundary

### packages/harness/src/grader/draft-anchors.test.ts
- 86 R: retained contract, behaviour asserted at the grader boundary
- 99 R: retained contract, behaviour asserted at the grader boundary
- 113 R: retained contract, behaviour asserted at the grader boundary
- 125 R: retained contract, behaviour asserted at the grader boundary
- 139 R: retained contract, behaviour asserted at the grader boundary
- 163 R: retained contract, behaviour asserted at the grader boundary

### packages/harness/src/grader/draft-console.test.ts
- 29 R: retained contract, behaviour asserted at the grader boundary
- 56 R: retained contract, behaviour asserted at the grader boundary
- 68 R: retained contract, behaviour asserted at the grader boundary
- 75 R: retained contract, behaviour asserted at the grader boundary

### packages/harness/src/grader/draft-fill-truth.test.ts
- 59 R: retained contract, behaviour asserted at the grader boundary
- 80 R: retained contract, behaviour asserted at the grader boundary
- 92 R: retained contract, behaviour asserted at the grader boundary
- 103 R: retained contract, behaviour asserted at the grader boundary
- 133 R: retained contract, behaviour asserted at the grader boundary
- 146 R: retained contract, behaviour asserted at the grader boundary
- 178 R: retained contract, behaviour asserted at the grader boundary
- 189 R: retained contract, behaviour asserted at the grader boundary
- 201 R: retained contract, behaviour asserted at the grader boundary
- 209 R: retained contract, behaviour asserted at the grader boundary
- 217 R: retained contract, behaviour asserted at the grader boundary
- 250 R: retained contract, behaviour asserted at the grader boundary
- 273 R: retained contract, behaviour asserted at the grader boundary
- 291 R: retained contract, behaviour asserted at the grader boundary
- 342 R: retained contract, behaviour asserted at the grader boundary
- 365 R: retained contract, behaviour asserted at the grader boundary
- 378 R: retained contract, behaviour asserted at the grader boundary
- 402 F: expected value built with truthSummary() from the code under test; assert literal fields (see :59)

### packages/harness/src/grader/draft-fill.test.ts
- 42 R: retained contract, behaviour asserted at the grader boundary
- 56 R: retained contract, behaviour asserted at the grader boundary
- 69 R: retained contract, behaviour asserted at the grader boundary
- 88 R: retained contract, behaviour asserted at the grader boundary
- 105 R: retained contract, behaviour asserted at the grader boundary
- 123 R: retained contract, behaviour asserted at the grader boundary
- 132 R: retained contract, behaviour asserted at the grader boundary

### packages/harness/src/grader/draft-measure-pilot-units.test.ts
- 25 R: retained contract, behaviour asserted at the grader boundary
- 35 R: retained contract, behaviour asserted at the grader boundary
- 45 R: retained contract, behaviour asserted at the grader boundary
- 60 R: retained contract, behaviour asserted at the grader boundary
- 74 R: retained contract, behaviour asserted at the grader boundary
- 84 R: retained contract, behaviour asserted at the grader boundary
- 99 R: retained contract, behaviour asserted at the grader boundary
- 108 R: retained contract, behaviour asserted at the grader boundary
- 118 R: retained contract, behaviour asserted at the grader boundary

### packages/harness/src/grader/draft-measure-pilot.test.ts
- 93 R: retained contract, behaviour asserted at the grader boundary
- 108 R: retained contract, behaviour asserted at the grader boundary
- 146 R: retained contract, behaviour asserted at the grader boundary
- 170 R: retained contract, behaviour asserted at the grader boundary
- 190 R: retained contract, behaviour asserted at the grader boundary
- 235 R: retained contract, behaviour asserted at the grader boundary
- 262 R: retained contract, behaviour asserted at the grader boundary
- 274 R: retained contract, behaviour asserted at the grader boundary
- 286 R: retained contract, behaviour asserted at the grader boundary
- 298 R: retained contract, behaviour asserted at the grader boundary
- 317 R: retained contract, behaviour asserted at the grader boundary
- 334 R: retained contract, behaviour asserted at the grader boundary
- 370 R: retained contract, behaviour asserted at the grader boundary
- 385 R: retained contract, behaviour asserted at the grader boundary

### packages/harness/src/grader/draft-measure.test.ts
- 67 R: retained contract, behaviour asserted at the grader boundary
- 81 R: retained contract, behaviour asserted at the grader boundary
- 102 R: retained contract, behaviour asserted at the grader boundary
- 108 R: retained contract, behaviour asserted at the grader boundary
- 149 R: retained contract, behaviour asserted at the grader boundary
- 155 R: retained contract, behaviour asserted at the grader boundary
- 164 R: retained contract, behaviour asserted at the grader boundary
- 169 R: retained contract, behaviour asserted at the grader boundary

### packages/harness/src/grader/draft-window.test.ts
- 25 R: retained contract, behaviour asserted at the grader boundary
- 31 R: retained contract, behaviour asserted at the grader boundary
- 36 R: retained contract, behaviour asserted at the grader boundary
- 43 R: retained contract, behaviour asserted at the grader boundary
- 87 R: retained contract, behaviour asserted at the grader boundary
- 104 R: retained contract, behaviour asserted at the grader boundary
- 122 R: retained contract, behaviour asserted at the grader boundary
- 135 R: retained contract, behaviour asserted at the grader boundary
- 149 R: retained contract, behaviour asserted at the grader boundary
- 163 R: retained contract, behaviour asserted at the grader boundary
- 172 R: retained contract, behaviour asserted at the grader boundary
- 208 R: retained contract, behaviour asserted at the grader boundary
- 218 F: asserts only met not.toBe(true), passes for undefined; assert met false and count 0
- 223 R: retained contract, behaviour asserted at the grader boundary
- 231 R: retained contract, behaviour asserted at the grader boundary
- 240 R: retained contract, behaviour asserted at the grader boundary
- 268 R: retained contract, behaviour asserted at the grader boundary

### packages/harness/src/grader/efficiency.test.ts
- 84 R: retained contract, behaviour asserted at the grader boundary
- 94 R: retained contract, behaviour asserted at the grader boundary
- 101 R: retained contract, behaviour asserted at the grader boundary
- 120 R: retained contract, behaviour asserted at the grader boundary
- 133 R: retained contract, behaviour asserted at the grader boundary

### packages/harness/src/grader/exec.test.ts
- 8 R: bunExec returns stdout, stderr, exit code; real subprocess boundary
- 17 R: stdin reaches the process
- 22 R: cwd option honoured
- 27 R: timeout kills a hung process; a leak would hang the grader
- 36 R: parseJsonOutput undefined for non-JSON; callers branch on it
- 42 R: isRecord rejects arrays and null, which the parsers rely on
- 50 D: tests the fakeExec test helper itself; real use asserted at packages/harness/src/grader/accounts.test.ts:29 (calls argv)

### packages/harness/src/grader/fields.test.ts
- 30 R: retained contract, behaviour asserted at the grader boundary
- 43 R: retained contract, behaviour asserted at the grader boundary
- 57 R: retained contract, behaviour asserted at the grader boundary
- 67 R: retained contract, behaviour asserted at the grader boundary
- 78 R: retained contract, behaviour asserted at the grader boundary
- 105 R: retained contract, behaviour asserted at the grader boundary
- 117 R: retained contract, behaviour asserted at the grader boundary
- 139 R: retained contract, behaviour asserted at the grader boundary
- 153 R: retained contract, behaviour asserted at the grader boundary
- 181 R: retained contract, behaviour asserted at the grader boundary

### packages/harness/src/grader/frames.test.ts
- 9 R: every nerd glyph gets a stable tag; frames stay readable and diffable
- 15 C packages/harness/src/grader/frames.test.ts:9: that test already asserts non-glyph text is kept
- 21 R: captureFrame file name <seq>-<ms>.txt and returned shape
- 41 R: duplicate screens skipped, no file written

### packages/harness/src/grader/leak-check.test.ts
- 22 R: retained contract, behaviour asserted at the grader boundary
- 33 R: retained contract, behaviour asserted at the grader boundary
- 45 R: retained contract, behaviour asserted at the grader boundary
- 72 R: retained contract, behaviour asserted at the grader boundary
- 85 R: retained contract, behaviour asserted at the grader boundary

### packages/harness/src/grader/pane.test.ts
- 26 R: retained contract, behaviour asserted at the grader boundary
- 37 R: retained contract, behaviour asserted at the grader boundary
- 47 R: retained contract, behaviour asserted at the grader boundary
- 54 R: retained contract, behaviour asserted at the grader boundary
- 83 R: retained contract, behaviour asserted at the grader boundary
- 92 R: retained contract, behaviour asserted at the grader boundary
- 110 R: retained contract, behaviour asserted at the grader boundary
- 132 R: retained contract, behaviour asserted at the grader boundary
- 138 R: retained contract, behaviour asserted at the grader boundary
- 149 R: retained contract, behaviour asserted at the grader boundary
- 188 R: retained contract, behaviour asserted at the grader boundary
- 202 R: retained contract, behaviour asserted at the grader boundary
- 219 R: retained contract, behaviour asserted at the grader boundary
- 226 R: retained contract, behaviour asserted at the grader boundary
- 237 R: retained contract, behaviour asserted at the grader boundary
- 251 R: retained contract, behaviour asserted at the grader boundary
- 258 R: retained contract, behaviour asserted at the grader boundary

### packages/harness/src/grader/partner-reactive.test.ts
- 111 R: retained contract, behaviour asserted at the grader boundary
- 126 F: name says wake arrival order but varies the action list order; rename or reorder the wakes
- 135 R: retained contract, behaviour asserted at the grader boundary
- 144 R: retained contract, behaviour asserted at the grader boundary
- 156 R: retained contract, behaviour asserted at the grader boundary
- 162 R: retained contract, behaviour asserted at the grader boundary
- 168 R: retained contract, behaviour asserted at the grader boundary
- 181 R: retained contract, behaviour asserted at the grader boundary
- 227 R: retained contract, behaviour asserted at the grader boundary
- 239 R: retained contract, behaviour asserted at the grader boundary
- 249 R: retained contract, behaviour asserted at the grader boundary

#### Seams
- packages/harness/src/grader/console-read.ts `consoleArgv`: exported; only console-read.test.ts:172 calls it outside the module
- packages/harness/src/grader/concurrent.ts `LOWER_BOUND_NOTE`: exported; concurrent.test.ts:22 imports it
- packages/harness/src/grader/pane.ts `HARNESS_LAUNCH`, `shellQuote`: exported; only pane.test.ts uses them
- packages/harness/src/grader/frames.ts `tagFrame`: exported; only frames.test.ts calls it directly
- packages/harness/src/grader/efficiency.ts `sessionUsage`: exported; only efficiency.test.ts calls it directly

#### Defects
- none

## harness-grader-2

### packages/harness/src/grader/partner.test.ts
- 103 C packages/harness/src/grader/partner.test.ts:134: timeout constants restated; the behaviour tests at 121/128/134 hit the real timeouts
- 121 R: reply after 45 s to tradeRequest is a normal row, not a kill; guards the per-method agent-wait timeout
- 128 R: tradeAcceptOffered gets the doubled wait; an 80 s accept must not be killed
- 134 R: a full 120 s wait expiring gives an agentSilent row and the cursor moves
- 147 C packages/harness/src/grader/partner.test.ts:121: same success-after-wait branch for another entry of the AGENT_WAITS table
- 153 R: "unanswered" failure of an agent-wait call is a graded silent row, the run continues
- 167 R: a walk or whisper hitting its timeout (143) still aborts
- 182 R: a non-wait call failing aborts the run
- 188 R: a wait call failing with a non-silent stderr (puppet unreachable) still aborts
- 194 R: trade-state failure after a silent agent is a row and the cursor advances
- 214 R: puppet-crash stderr after a silent agent still aborts
- 232 R: one partner's silence must not excuse another partner's failure

### packages/harness/src/grader/preflight.test.ts
- 6 R: a scenario with no blockedBy yields no blockers; blockersOf default path
- 12 R: blockersOf keeps only keys the check reports blocked
- 22 D: asserts two scenario JSON files carry no blockedBy, no logic; keeper preflight.test.ts:6

### packages/harness/src/grader/result.test.ts
- 48 R: a complete result validates against the schema; baseline for the validator
- 52 R: tier-9 scenario ids pass the result schema; a stale pattern would reject real runs
- 58 R: validator names a missing required field
- 63 R: validator rejects an enum value, message lists the options
- 69 R: validator applies array item patterns
- 75 R: validator checks integer and minimum
- 84 R: validator recurses into nested required and maxLength
- 99 R: validator checks additionalProperties value schemas
- 106 R: abort object with the realm-service cause validates; the only test exercising the abort branch
- 116 R: removed check source is rejected; pins the source enum
- 123 R: non-object input is rejected

### packages/harness/src/grader/run-finish.test.ts
- 104 R: watcher stops before quit and a fresh final truth is kept; ordering contract
- 129 R: stale final truth aborts the run as stale_truth
- 137 R: an earlier abort cause is not overwritten by a stale truth
- 147 R: without a pane only the partner is stopped
- 162 R: partner final truth is read after its stop when a baseline exists
- 179 R: stale partner final truth is only a note, not an abort
- 197 R: console check reads after the final truth and logs console.jsonl
- 220 R: partner is stopped while the agent is still logging out; concurrency ordering
- 256 R: cleanup deletes accounts, quarantines leaked passwords, removes session files
- 277 R: an account still listed after delete writes cleanup-failed
- 286 R: a failing pane close still deletes accounts; failure recovery
- 298 R: failing soap list marks every account uncleaned
- 310 F: keep the summary line (draft 0/5 tools=0 wall=72: computed counts and seconds from ms), verdict null/validator message, and the check ids list read from the scenario; drop the toEqual on draft.checks[0] whose `expected` sentence is copied scenario prose (keep only met false, observed null, source truth if wanted)
- 346 R: a check's blockedBy propagates to the draft and result schema accepts it
- 384 R: wall time is measured to the accepted answer, exit time kept separately
- 403 R: a run not ending done measures wall time to its end
- 420 R: partner scenario wall time runs to the whisper reply after the first answer
- 450 R: scenario without steers or partner actions keeps the answer as wall end despite later rows
- 471 R: aborted run writes result.json with credential-leak friction

### packages/harness/src/grader/run-partners.test.ts
- 121 R: partner roles are numbered, single partner keeps role name
- 133 R: two partners are created, started with header trace, stopped and deleted
- 174 R: a failed second create deletes the first; failure recovery
- 186 R: actor 2 action runs on the second wrapper with all name placeholders expanded
- 221 R: each setup step is applied to its own partner after the start point
- 241 R: a setup step naming a missing partner is refused at parse time
- 250 R: a setup step with no actor is refused when no partner exists
- 261 R: placePartners throws for a missing partner instead of skipping
- 281 R: partner truth is read before each start and after each stop, ordered
- 312 R: a partner online at baseline aborts before its start
- 326 R: expandArgv maps PARTNER, PARTNER1, PARTNER2 and AGENT

### packages/harness/src/grader/run.test.ts
- 17 R: end-to-end finished run leaves a valid draft, deleted account, no password
- 93 R: launch failure aborts but still deletes the account
- 106 R: wrong character aborts and quits before the task is sent
- 125 R: budget overrun gets the stop steer and ends as budget
- 138 R: elapsed steer is typed and recorded
- 162 R: partner action runs through the partner wrapper at its time and holds the done
- 239 R: runScenario wires partners: start with header trace, stop and delete each
- 271 R: a blockedBy key grades blocked without creating an account
- 293 R: an unfired trigger steer drafts blocked
- 314 R: a question to the human ends stuck after one rescue nudge
- 331 R: a lifted preflight blocker lets the run proceed
- 342 R: a used run dir is refused

### packages/harness/src/grader/scenarios.test.ts
- 26 R: ROUND_1 and scenario files stay in sync with no duplicates
- 33 R: invalid scenario errors carry file name and path
- 50 R: schedule shapes missing required field are refused
- 70 R: truth check picks accept the schema list and refuse an unknown one
- 100 R: console check evidence validation: missing match, bad regex, arg rules
- 140 F: keep the echoed unknown id ("unknown scenario: t9-nope") and that the known list is computed from ROUND_1 (assert it contains a real id built from ROUND_1, not the literal first id "(known: t4-quest-first,", which breaks when the first scenario changes); drop the rest of the sentence
- 165 R: scenario with two partners loads
- 171 R: partner and partners together are refused
- 177 R: more than four partners refused
- 187 R: reactive action without trigger refused
- 199 R: action actor must exist and be at least 1
- 238 R: truth who accepts agent or an existing partner
- 249 R: truth who naming a missing partner is refused
- 262 R: every ROUND_1 scenario is well-formed (id, tier, pane minutes, unique check ids)
- 277 D: pins steer schedule in scenario JSON; no logic, validity covered by scenarios.test.ts:262
- 290 D: restates the t2-whisper-reply partnerActions JSON; keeper scenarios.test.ts:262 and run.test.ts:162 cover the machinery
- 300 D: restates t6 preset/setup/spawn JSON; keeper scenarios.test.ts:262 and spawn-slots.test.ts:28
- 307 D: restates t4-quests-level-five JSON (preset, checks, budget); keeper scenarios.test.ts:262
- 329 D: restates t3-ghostlands-kill measure names; keeper draft-measure.test.ts for the measures themselves
- 339 D: restates t7 check-to-measure map; keeper scenarios.test.ts:262
- 354 D: restates a t4-reputation-gain check's ids/events from JSON; keeper scenarios.test.ts:262
- 362 D: pins prose of a scenario task ("Springpaw Stalker", not "Lynx") and a spawn name; keeper scenarios.test.ts:262
- 368 D: restates t3-pilot-camp check measures from JSON; keeper scenarios.test.ts:262
- 391 D: restates env of four scenario JSONs; env schema covered by scenarios.test.ts:402
- 402 R: env schema refuses unknown keys and values
- 420 C packages/harness/src/grader/scenarios.test.ts:460: JSON events of wait-row restated; observeGameLog behaviour with that check is proved there
- 429 D: restates queued/left check events from JSON; keeper scenarios.test.ts:262
- 460 R: queue row after the proposal stays visible beside join and proposal timing
- 479 R: run with no queue row shows join and proposal timing alone

### packages/harness/src/grader/spawn-slots.test.ts
- 11 R: every run and partner gets a unique start point across two replicas
- 28 R: slots stay within 16 yd of spawn on its map and zone
- 45 R: crowd-sensitive runs start 60 yd from every other start
- 70 D: pins one scenario's slot onto the eversong spawn; covered by spawn-slots.test.ts:28 over every ROUND_1 scenario
- 78 D: copies the first ghostlands table row verbatim; keeper spawn-slots.test.ts:28
- 85 R: presets shared by no other run have no slot
- 90 R: a replica past the table throws a named error
- 95 D: copies the silvermoon-bank spawn table; keeper spawn-slots.test.ts:28

### packages/harness/src/grader/steer.test.ts
- 71 R: trigger steer waits for a matching row after the cursor
- 94 R: elapsed steer counts from the previous steer, boundary at the ms
- 104 R: nothing is due after the last steer
- 115 R: nth trigger steer needs n rows after the cursor
- 134 R: delay counts from the matching row
- 151 R: describeAt text lands in steers.jsonl trigger field
- 160 C packages/harness/src/grader/steer.test.ts:229: stuck thresholds restate constants; 229 and 243 exercise 180 s, 120 s and tier 0 90 s
- 169 R: agent working means wait
- 179 R: done after an answer plus 30 s quiet, boundary exact
- 191 R: pending action blocks done
- 198 R: active run blocks done
- 205 R: active run skips the stuck nudge
- 212 R: streaming agent blocks done
- 222 R: wall budget stops
- 229 R: one nudge when stuck then stuck stop at the boundaries
- 243 R: tier 0 nudges after 90 s
- 249 R: after a stop, ends when answered and idle, else escapes after 60 s
- 266 R: question to human is not done; one nudge then stuck
- 284 R: question followed by progress follows the done rule
- 299 R: a tool call after the nudge is not stuck
- 325 R: stale status.json aborts with evidence
- 333 R: asksHuman looks at the last sentence only
- 357 R: nothing scheduled is nothing pending
- 361 R: unfired steer or action is pending
- 366 R: fired steer stays pending until answered after it
- 372 R: fired action stays pending until its window closes
- 379 D: pins the RESCUE_NUDGE sentence, a constant restating itself; keeper run.test.ts:314

### packages/harness/src/grader/truth.test.ts
- 158 R: parseTruth keeps contract fields and drops extras; expected is an explicit literal
- 209 R: hearth, reputation, mail and durability survive parsing of a live reply
- 236 R: absent optional fields parse without keys
- 246 R: null hearth reads as none
- 251 R: wrong optional fields are named in errors
- 275 R: refusal throws its reason
- 285 R: wrong required fields are named
- 299 R: readTruth runs soap truth with the account and parses
- 308 R: service reason reported when soap truth fails
- 325 R: stderr reported when no JSON
- 337 R: offline save after exit minus 5 s accepted
- 348 R: reads again while still online
- 366 R: offline with old save is stale_truth at once
- 385 R: polls every 10 s until offline then checks the save
- 419 R: still online after 90 s is stale_truth
- 458 R: failed read gives service_down

### packages/harness/src/grader/watch-rows.test.ts
- 55 R: raid/ready_check row makes the partner answer due only after its delay
- 87 R: first human input is task_landed, later steers
- 102 R: only trigger events are kept with ts, seq, text
- 132 R: role check rows keep update state
- 159 R: lastAnswerAt keeps the newest agent message
- 170 R: lastAnswer returns newest message with text
- 183 R: log tail reads only new complete lines
- 192 R: log tail keeps a partial last line
- 205 R: log tail reads multi-byte text
- 214 R: idle time measured from newest progress or answer
- 233 R: no idle time before progress or answer
- 242 R: status reader ignores missing or half-written file

### packages/harness/src/grader/watch.test.ts
- 66 R: watchRun writes triggers once each, progress, frames, witness samples
- 114 R: no witness without wrapper and one frame for an unchanged screen
- 128 R: a failed job is logged and the watcher keeps going

#### Seams
- packages/harness/src/grader/truth.ts `finalTruth` `waitMs` and `clock` options: only truth.test.ts and run-finish.test.ts (`truthWaitMs`) override them
- packages/harness/src/grader/run-finish.ts `newRunState` `truthWaitMs`: only tests pass a short value

#### Defects
- none

## harness-loops-1

### packages/harness/src/loops/combat-actions-credit.test.ts
- 39 R: pins 3.3.5a gray-level bands from hand values; grayLevel gates pilot/look/engage/explore, a wrong band misclassifies gray mobs
- 45 R: gray kill credits at once with no XP wait; completes with reason gray
- 50 R: tapped-by-player corpse credits as no_xp_kill only after the 5 s XP wait
- 56 R: lootable corpse is credited as own kill after the wait; catches dropping the lootable flag branch
- 62 R: tapped by other (no player-tap bit) is blocked target_dead_tapped_by_other, not credited
- 71 R: unexplained death of a non-gray mob stays blocked without server credit
- 80 R: gray creature never fought is not credited; catches crediting by level alone

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/combat-actions-hunter-loop.test.ts
- 11 R: end-to-end tactics loop with a scripted Jev; pet_attack, Auto Shot, Arcane Shot send the right opcodes in order and set combat state

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/combat-actions-melee.test.ts
- 34 R: melee class with no spells offers wait+move, then attack once in reach; catches offering attack too early
- 52 R: stalled approach ends blocked target_unreachable at the persistence bound

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/combat-actions-movement.test.ts
- 13 R: observation carries separation and facingTarget that Jev reads
- 20 R: unobserved target position yields null separation, not an invented number
- 27 R: move candidates offered unless rooted; catches offering movement under root
- 45 R: wait refreshes the movement lease with the same direction; stopping would break a walking approach
- 65 R: wait while stationary does not start movement
- 79 R: stop_moving halts an active lease
- 92 R: standing-required spell halts movement before the cast is sent
- 108 R: movement-compatible spell keeps moving; negative pair of 92

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/combat-actions-observation.test.ts
- 90 R: retained goto creature target serializes as hex string for Jev; BigInt would break JSON
- 107 R: unobserved facts reach Jev as null, not a missing key
- 115 F: forces casting and pendingCast undefined so timeoutOutcome returns undefined for any channel; drive observe() with a long-running channel and elapsed time
- 133 R: damage taken in last 6 s grouped by source and school; boundary at 6001 ms and unrelated entries excluded
- 153 R: own misses counted by outcome in the 6 s window, others' and stale excluded
- 176 R: target immunities and combo points scoped to the target
- 196 R: immune spell removed from candidates and listed unavailable with reason immune
- 213 R: immunity for another creature entry or another spell leaves the spell offered
- 254 R: target cast observation with remaining time from the clock
- 265 R: no target cast for another caster, an overdue cast, or no spells state

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/combat-actions-pet.test.ts
- 24 R: pet observation guid/health/name/onTarget/target fields Jev parses
- 41 R: pet_attack sends CMSG_PET_ACTION with pet, attack action and target, records command, cools down 2.5 s
- 63 R: no pet_attack for a pet already on target, a dead pet, or no pet
- 73 R: pet command or Auto Shot counts as engagement after the target drops aim; credit needs it

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/combat-actions-position.test.ts
- 14 R: cooldown and cancelled cast leave the encounter alive with wait/move only
- 37 R: unsupported spellbook still allows face_target and attack
- 54 R: root blocks movement but a supported stationary spell stays offered
- 69 R: dead target offers only wait until real credit
- 82 R: unreachable target stops at the 5 s threshold, exact boundary 5999/6000
- 115 R: re-entering range resets the unreachable bound
- 162 R: closing in on a far target restarts the bound; non-closing does not
- 186 R: facing is recoverable and never stops as unreachable
- 208 R: unknown faction relation only engageable while the creature attacks; flips back after attack stop

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/combat-actions-ranged.test.ts
- 18 R: hunter with bow and arrows gets Auto Shot and shots; Raptor Strike unavailable with reason
- 29 R: melee dead zone and 35 yd limit with distinct reasons too_close/out_of_range
- 45 R: table of gear failures maps to distinct reasons (no_ammo, wrong ammo, unobserved) per shot
- 72 R: shot descriptions say cast 0ms and never leak the -1000000 DBC sentinel
- 81 R: Auto Shot lifecycle: starts once, stays on beside other shots, stoppable
- 114 R: slow-aura caster spell stays unsupported with unsupported_aura:33

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/combat-actions-spells.test.ts
- 12 F: execute of an unknown-metadata spell uses bare toThrow() and a redundant JSON toContain; assert the refusal reason
- 27 R: mana percent uses base mana; execute rechecks resources and refuses with action_no_longer_legal
- 46 R: unsupported effect in a multi-effect spell blocks the whole spell with reason
- 63 R: unsupported hostile range leaves only melee even on cooldown
- 81 R: form restriction uses the high form byte; execute refuses when form differs
- 102 R: stance mask permits normal form only with allowance flag
- 120 R: unobserved form is not treated as normal form
- 134 R: running channel offers only wait and names the channel
- 155 R: execute refuses a new cast while channelling; wait stays legal (cancel legality at :207)
- 185 F: asserts only outcome toBeDefined after a dead target; assert the outcome reason (credit/target_dead) and status
- 198 R: dead self fails the frame with self_dead even while channelling
- 207 R: channel offers cancel only at low health
- 218 R: channel cancel on third-party attacker but not the target alone
- 230 R: cancel sends CMSG_CANCEL_CHANNELLING and clears the cancel candidate
- 242 R: channel remaining time counts down from endsAt on the clock

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/combat-actions-target.test.ts
- 37 R: hostile and neutral creatures are engageable
- 42 R: friendly creature and player refused with distinct reasons
- 53 R: target out of view reads target_unobserved
- 57 R: unknown relation refused unless the creature attacks; friendly attacker allowed

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/combat-defense.test.ts
- 65 R: live attacker gets control halt then auto-attack; exact call sequence
- 72 R: a creature targeting the character in combat counts as attacking without the isAttackingSelf flag
- 77 R: existing swing is kept; no re-send of attack
- 83 R: dead attacker releases control and flags uncontrolled_in_combat; not-in-combat returns none

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/combat-progress.test.ts
- 34 R: no damage and no approach blocks no_progress exactly at NO_PROGRESS_MS
- 49 R: target damage restarts the bound; healing back does not
- 65 R: closing a yard restarts the bound; half a yard does not
- 81 R: unobserved separation never counts as approach
- 96 R: damage before pose observed keeps separation unobserved, bound still runs

#### Seams
- packages/harness/src/loops/combat-progress.ts `NO_PROGRESS_MS`: exported constant read by combat-progress.test.ts and combat-rejections is separate

#### Defects
- none

### packages/harness/src/loops/combat-ranged-gear.test.ts
- 56 R: reads ranged slot, ammo field and summed carried ammo count across stacks
- 79 R: empty slot and ammo id 0 read as null
- 86 R: missing item templates leave class undefined, not guessed
- 103 R: missing self reads as unobserved (undefined), distinct from null

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/combat-rejections.test.ts
- 51 R: facing rejection observed, re-face offered, fight continues to kill credit
- 71 R: recoverable rejections stop only at three in a row; a success resets
- 94 R: out_of_range and interrupts recoverable; bad_targets stops at once
- 115 R: channelling refusal waits and never counts as a rejection

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/cycle-approach.test.ts
- 35 R: target already within reach is not routed
- 42 R: 80 yd target is routed and halted within 25 yd
- 49 R: refused route is named target_unreachable
- 55 R: route stopped short by a blocked reason is target_unreachable
- 61 R: abort halts the route; no leaked navigation

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/cycle-beset.test.ts
- 8 C packages/harness/src/loops/encounter-cycle-attacker.test.ts:116: besetStop private predicate; the cycle test asserts the same stop cause and ref at the real boundary
- 19 R: negative controls (attacker not skipped, cause not unreachable) not covered at the cycle boundary

#### Seams
- packages/harness/src/loops/cycle-beset.ts `besetStop`: unit-tested directly; also called by the cycle runtime

#### Defects
- none

### packages/harness/src/loops/encounter-cycle-approach.test.ts
- 27 R: each queued target is routed to before its fight; ordering
- 43 R: unroutable target skipped, keeps its start budget
- 67 R: target that died during the walk is skipped as target_dead

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/encounter-cycle-attacker.test.ts
- 38 R: unreachable unit still attacking stops the cycle before the second pull
- 64 R: unreachable unit not attacking lets the cycle move on
- 86 R: attacker discovered during the next unit's approach prevents that start
- 116 R: later unreachable attacker stops the cycle although an earlier one does not attack

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/encounter-cycle-combat.test.ts
- 10 R: lost target records cause, advances; event order through stopped
- 39 R: blocked outcome skips without a loot open and advances
- 86 R: stop aborts the running fight; stop reason passed to tactics
- 123 R: stop inside loot_done emits nothing after stopped
- 144 R: max starts stops with max_starts_reached
- 165 R: empty queue and bad max rejected with cycle_empty_queue / cycle_invalid_max
- 183 R: second start replaces the first run

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/encounter-cycle-death.test.ts
- 53 R: death on the last target is recovered before the cycle ends; event order
- 73 R: loot failure after a death is recorded, recovery still continues

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/encounter-cycle-gate.test.ts
- 43 R: low mana ends the run before the next pull with pct detail
- 56 R: low health ends the run before the next pull
- 65 R: a queued attacker is still fought at low mana

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/encounter-cycle-ghost.test.ts
- 68 R: ghost legs walk into range, reclaim, continue the queue; leg count matches moves
- 106 R: a non-moving leg retries with heading offsets
- 124 R: blocked stop after progress keeps the direct heading
- 139 R: stalled legs exhaust offsets and stop corpse_unreachable
- 157 R: leg bound stops corpse_out_of_range with pose and range
- 174 R: phase resets to fighting at the start of each target
- 201 R: stale-generation loot cleanup keeps the newer listener; replaced run does not drop the new subscription

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/encounter-cycle-jev.test.ts
- 49 R: refused Jev key stops the cycle with jev_unavailable and keeps the queue
- 71 R: missing Jev key stops instead of skipping every target

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/encounter-cycle-loot-range.test.ts
- 76 R: corpse at 8.8 yd is approached before open; order move then open
- 94 R: corpse in reach opens without moving
- 101 R: corpse that closed to melee during the walk opens without moving
- 108 R: far corpse with no loot is not walked to
- 121 R: unanswered open is abandoned with loot_denied:timeout and next corpse still loots

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/encounter-cycle-loot.test.ts
- 12 R: takes every slot plus money and records coinage deltas
- 37 R: empty offer closes and advances without stopping
- 65 R: cycle waits for the loot release before completing
- 90 R: unanswered take records no loot and the queue continues
- 112 R: loot waits for the corpse death update after kill credit
- 137 R: dead creature with no loot is recorded as none and the cycle continues
- 159 R: corpse despawning before its death update counts as no loot
- 182 R: corpse never seen dying stops target_death_unconfirmed after the settle time
- 205 C packages/harness/src/loops/encounter-cycle-loot.test.ts:12: same taken [4,7] and lastLoot; fakeLoot take never races, so the order spy proves nothing more
- 229 R: denied offer stops with loot_denied:<code>
- 245 R: refused take stops with cause
- 259 R: full inventory stops loot_inventory_full
- 272 R: leftover window released before the next corpse
- 289 R: release-only open records no loot and continues
- 309 R: vanished corpse open failure records no loot and continues
- 325 R: current resurrection offer accepted; cycle continues

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/encounter-cycle-objective.test.ts
- 67 R: objective run fights picked targets until server log complete; seen set grows
- 88 R: refused target skipped and never picked again
- 111 R: start budget stops objective run before another fight
- 124 R: loot stop still reports server progress of the last kill
- 138 R: far objective target routed to, then fought
- 161 R: far objective target with no route stops naming it with distance/nearest/reach

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/encounter-cycle-recovery.test.ts
- 11 R: cycle started dead waits the reclaim delay schedule then fights
- 65 R: cross-map corpse stops corpse_out_of_range with pose and no moves
- 103 R: refused corpse-run move stops corpse_unreachable with reason

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/encounter-cycle-reserve.test.ts
- 53 R: leaves loot that would take the last free slot and keeps going
- 64 R: quest item taken before other loot uses free slots
- 75 R: stops with window closed before a quest item takes the last slot
- 95 R: quest item stacking onto a carried stack is taken at the reserve
- 107 R: halt during stack size lookup sends no take

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/encounter-cycle-vet.test.ts
- 49 R: unit dead before its turn skipped without a fight
- 66 R: unit tapped by another player skipped
- 76 R: unit fighting another player skipped
- 90 R: unit fighting this character is still fought; negative control for 76
- 97 R: skipped units do not use the fight budget
- 111 R: fight refused as target_dead not counted as a start
- 127 R: unit that left view skipped before any fight

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/event-waiter.test.ts
- 7 R: queued events returned in order
- 15 R: waits for the next push
- 22 R: second event pushed in the same tick is kept
- 31 R: timeout resolves undefined
- 42 R: abort rejects with AbortError
- 51 R: find skips non-matching events and keeps them queued

#### Seams
- none

#### Defects
- none

## harness-loops-2

### packages/harness/src/loops/game-shutdown.test.ts
- 24 R: logout order core logout then navmesh close; a swapped order would close the map under a live session
- 31 R: close order core close then navmesh close, and later travel throws session_closed

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/game.test.ts
- 88 R: raw move leaves cycle active until takeControl stops it with manual_override; real mock-world session
- 125 R: closed session retires an active tactics run without calling actuators on the dead handle
- 136 R: logout retires tactics (disposed, idle) before core logout; only the logout call reaches the handle

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/loot-room.test.ts
- 45 R: item fitting an existing carried stack needs 0 slots; over-reserving would skip loot
- 50 R: full stack, other entry, unknown stack size each need a slot (three distinct branches)
- 61 R: overflow past stack room needs whole new stacks (ceil math)
- 70 R: equipment-region stack is not a carried stack
- 79 R: reserve refuses the last free slot; boundary free/needed
- 85 R: slots used since window open counted before bags refresh
- 91 R: unobserved free slots allow only zero-slot items

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/loot-run.test.ts
- 21 R: lootObject takes items and money of the window the server opens and returns the record
- 45 R: never requests an open itself; loot waits for the server window (phase stays closed)
- 55 R: window already open for the object is looted, not released
- 67 R: window open for another guid released, then times out loot_denied:timeout
- 77 R: open failure surfaces as loot_denied:<reason>
- 88 R: 5 s with no window ends as loot_denied:timeout

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/pilot-deadman.test.ts
- 39 R: run_ahead lease expires and sends MSG_MOVE_STOP between 1.4 and 1.6 s; runaway mover on a stalled agent
- 50 R: renewed run_ahead extends the lease
- 62 R: halt stops the mover at once

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/pilot-greedy.test.ts
- 24 R: smallest goal bearing wins
- 34 R: tie-break run_ahead then smaller turn
- 49 R: jump only when it is the sole non-stop move
- 59 R: stop only when nothing else is offered
- 66 F: elapsedMs >= 0 is vacuous; keep model code:greedy and choice, drop or tighten the elapsed assertion

#### Seams
- packages/harness/src/loops/pilot-greedy.ts `greedyChoice`: exported, only pilot-greedy.test.ts imports it (createGreedySelect uses it in-file)

#### Defects
- none

### packages/harness/src/loops/pilot-jump.test.ts
- 67 R: thin rail reads as one low obstacle at every approach distance; jump offered inside 2.5 yd, withheld beyond 3.1
- 86 R: rail too close to jump still faceable via turn_right, back_up offers run-up, no jump_ahead
- 116 R: real runtime jump leaves the ground before the rail and lands past it
- 136 R: another decision cancels the armed jump (no MSG_MOVE_JUMP)

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/pilot-units.test.ts
- 55 R: same-level aggro radius 20 yd baseline
- 59 R: lower-level mob narrows range
- 63 R: higher-level mob widens range
- 67 R: lower clamp at 5 yd
- 71 R: upper clamp at 45 yd
- 78 R: head-on ray reports near-edge distance
- 84 R: ray missing circle reports nothing
- 90 R: ray starting inside and moving deeper reports 0
- 96 R: ray starting inside and leaving reports nothing
- 109 R: units ordered by margin; friendly and dead filtered
- 125 R: cap of five units
- 135 R: creatures beyond 60 yd ignored
- 140 R: gray creature listed with no range and adds no aggro circle
- 198 R: template 25 listed, no range, no circle; unitLine branch label "does not attack first" is the only text telling this branch apart: keep as tight toContain
- 213 R: templates 14 and 38 get ranges and circles via real aggro predicate
- 234 R: hostile reputation rank makes a template-25 creature aggro
- 253 R: heading into a range masked, clear heading stays
- 272 C packages/harness/src/loops/pilot-units.test.ts:96: same rayEntryYd inside-and-leaving inputs; margin<0 already implied by the 109 ordering
- 289 F: keep name+level ("Kobold Vermin, level 8"), "(observed)" (state branch) and "Inferred aggro range" labels; add the computed radius yd number; drop other prose

#### Seams
- packages/harness/src/loops/pilot-units.ts `aggroRadiusYd`: exported, only pilot-units.test.ts imports it
- packages/harness/src/loops/pilot-units.ts `unitLine`: exported, only pilot-units.test.ts imports it

#### Defects
- none

### packages/harness/src/loops/pilot.test.ts
- 151 R: open ground offers every movement option and stop, no jump_ahead
- 179 R: strafe/back-up goal bearings use motion direction not facing
- 198 R: escaping one range into another masks the move
- 223 R: wall 1 yd ahead masks forward options, keeps stop
- 240 R: airborne offers nothing
- 255 R: low fence offers jump_ahead; sole buildOptions positive case for jump
- 269 R: tall wall never offers jump_ahead
- 284 R: wall on the left reads as left
- 298 R: run_ahead faces heading and drives with the dead-man lease
- 306 R: turn faces new orientation before driving
- 313 R: strafe and back_up keep facing and are allowed beside a wall ahead
- 325 C packages/harness/src/loops/pilot-jump.test.ts:116: mock call-shape of jump_ahead; the real runtime test proves drive and jump
- 332 R: stop halts and drives nothing
- 339 R: unknown action throws unknown_pilot_action
- 346 R: travel is attributed to the previous decision
- 359 F: execute gets a new reach(30) object, so committed.context !== context and the committed frame is never used; reuse the same context and change the world
- 374 R: reach completes within 1.5 yd
- 383 R: reach completes when path since last frame passed the goal
- 392 R: death fails the run
- 398 R: circle completes after a full sweep at the start
- 415 R: circle far from the start stays open
- 431 R: back-and-forth jitter cannot complete a lap
- 451 R: chasing the next lap point completes ccw and cw laps within tolerance

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/quest-cycle-object-lag.test.ts
- 78 R: waits for a complete flag that arrives after the last loot
- 91 R: reports objective_targets_absent once the wait runs out
- 113 R: attacker during a visit is fought through the engage path, then resumes
- 153 R: attacker interrupting the chest cast is fought and the chest is then looted
- 199 R: a replaced cycle in the complete-flag wait keeps running and the old one settles
- 277 R: jev_unavailable in defense stops the run and rejects
- 303 R: second attacker past the start budget not fought; max_starts_reached
- 337 R: attacker is not fought again after a failed fight

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/quest-cycle-object.test.ts
- 30 R: spell-opened chest walked to, opened, looted; order lock/use/open
- 48 R: key-locked chest opened with the key item
- 71 R: missing key skipped with open_no_item
- 87 R: unreachable chest skipped target_unreachable
- 102 R: unopened chest skipped after loot window never opens; abandonOpen called
- 128 R: plain object used once, progress from quest events
- 187 R: object pick without visit stops objective_object_unsupported and never fights
- 194 R: object moving no counter picked twice then retired
- 212 R: object whose visits move the counter is not retired
- 241 R: chest whose loot was taken is not revisited
- 279 R: visit stop ends the run with its own cause

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/quest-objective.test.ts
- 118 R: creature targets keep log counter index and count
- 137 R: negative id becomes an object objective with counter index
- 152 R: item objective finds chest whose template lists the item
- 165 R: unpursuable objectives named (item sources unknown, unsupported)
- 177 R: supervisor-named creature sources used for item objectives
- 205 R: nearest live untried untapped creature chosen; tapped by others skipped
- 220 R: complete log slot ends the objective with server counters
- 234 R: filled kill counter stops targeting that creature
- 241 R: quest_not_in_log, quest_failed, absent targets named stops
- 249 R: in-view target beyond reach is picked to route to
- 282 R: nearest untried glowing chest picked
- 299 R: object objective picks its object until the counter fills
- 327 R: chest wanted only while its quest item is outstanding
- 362 R: creature and chest compete by distance

#### Seams
- packages/harness/src/loops/quest-objective.ts `OBJECTIVE_REACH`: exported, only quest-objective.test.ts imports it

#### Defects
- none

### packages/harness/src/loops/runs.test.ts
- 61 R: lootCorpse takes all slots and money and returns the record
- 82 R: no record for a corpse with nothing to loot
- 91 R: finished run frees the guard for the next
- 98 R: waits for the death update of its own target only
- 116 R: lootCorpse unsubscribes from world events on return
- 123 R: lootCorpse refuses (busy) while the encounter cycle runs
- 133 R: second run refused while one is open
- 146 R: pre-aborted signal returns cancelled
- 156 R: abort mid-run returns cancelled and takes nothing
- 187 R: recoverCorpse releases, finds corpse in range, reclaims
- 203 R: walks legs on control stop events to a far corpse
- 226 R: accepts a pending resurrection
- 236 R: life_unknown for a living character
- 244 R: recoverCorpse refuses (busy) while the encounter cycle runs
- 254 R: recover and loot share one guard
- 269 R: abort during recovery returns cancelled with no moves
- 284 R: recoverCorpse unsubscribes from world events on return
- 293 R: standalone loot walks to a corpse out of reach before the open

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/tactics-decisions.test.ts
- 11 R: capability lost between request and reply discards the action as unavailable
- 41 R: unrelated world changes and low confidence still execute a legal action
- 68 R: outcome observed before execution prevents a late cast; final state kept
- 99 R: pre-request block keeps isolated terminal observation and makes no request
- 127 R: server_action_rejected stop defends; other blocks halt
- 148 R: provider failure terminates once, defends, no hidden retry
- 169 R: wait-only frames skip inference until useful choices appear
- 198 R: stale reply (maxResultAgeMs) cannot execute; lastDiscardReason stale_age
- 223 R: execution rejection retained as discarded with its reason, not applied

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/tactics-lifecycle.test.ts
- 10 R: stop releases abort-insensitive preparation; never activates later
- 24 R: start resolves only after the decide loop records its outcome
- 52 R: start blocked in the decide loop resolves on external stop
- 68 R: replacement cannot overlap a pending provider call or activate after stop
- 99 R: late results from an old run do not overwrite a newer run's final state
- 122 R: aborting the external signal halts synchronously

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/tactics-modes.test.ts
- 12 R: preparation failure rejects start and records failed outcome
- 26 R: missing credentials never reach preparation (missing_jev_key)
- 39 R: replaced preparation's old completion cannot stop the newer mode
- 75 R: a stop from the request event prevents provider dispatch
- 87 R: unknown selected id never reaches executor (unknown_id)
- 104 R: null wait offers no wait candidate
- 119 C packages/harness/src/loops/tactics-provider-failures.test.ts:116: JevUnavailableError ends run once as jev_unavailable (code); keeper also asserts the code and reason value
- 136 R: request observations are deep-copied against later world changes
- 160 R: repeated decisions keep real cadence (minInterval) without concurrent requests
- 208 R: replacement waits for the old provider call to settle before dispatching
- 255 R: framing default none and pass-through reaches select, request event, lastRequest
- 284 R: character class reaches select and lastRequest
- 303 R: fault marker recorded once on started and in state

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/tactics-provider-failures.test.ts
- 77 C packages/harness/src/loops/tactics-decisions.test.ts:198: same stale_age discard branch; the fault marker is covered at tactics-modes.test.ts:303
- 94 R: halt during provider delay yields aborted discard with the action id and lastStopReason halt
- 116 R: refused key (402) ends the run immediately as jev_unavailable with one transport event
- 133 R: TRANSPORT_LIMIT consecutive server errors end the run as jev_unavailable
- 145 C packages/harness/src/loops/tactics-provider-failures.test.ts:133: same repeated-JevTransportError branch with another message; only the error string and fault label differ
- 160 R: transport failures below the limit keep the fight going to the kill

#### Seams
- none

#### Defects
- none

### packages/harness/src/loops/tactics-timeouts.test.ts
- 35 R: one timeout is discarded and the next request fights on to the kill
- 54 R: three timeouts in a row stop with jev_timeout and defend
- 75 R: answered request resets consecutive timeout count
- 89 R: reply after its timeout is discarded (aborted), not executed
- 129 R: late exchange and answer join the timed-out request by call number

#### Seams
- none

#### Defects
- none

## harness-misc

### packages/harness/src/config/flags.test.ts
- 12 R: default flag values (wake, stop-reflex, connect, packet trace); a flipped default changes run behaviour
- 30 R: every flag parses to its field; a swapped mapping misconfigures the run
- 70 R: repeated --extension kept in order and resolved absolute
- 82 R: default profile path and home override
- 89 R: bad thinking level is a usage error
- 95 R: wake value must be on/off
- 101 R: unknown packet-trace mode refused
- 107 R: unknown flag becomes UsageError (exit 2 path)
- 113 D: checks the USAGE constant contains literals copied from the test; flags are exercised by flags.test.ts:30 and docs by harness-doc.test.ts:32
- 133 R: persisted lock/state dir location the lock and run-dir code depend on

### packages/harness/src/config/lock.test.ts
- 44 R: lock file is 0600 and named by account and character, carrying pid/host/runDir
- 64 R: second harness is refused with holder text and the first file stays
- 89 R: lock of a dead pid is replaced
- 109 R: release/releaseSync remove only their own lock, never a successor's

### packages/harness/src/config/profile.test.ts
- 80 R: soap session JSON + account config load, password uppercased, dbc source reads the session's spell dir
- 95 R: navigation library comes from the session's config, not home
- 111 R: session whose config logs in as another character is refused
- 132 R: missing account dir names the missing config path
- 149 R: ledger entry takes realm and nav paths from home
- 174 R: ledger entry without home config connects to localhost:3724
- 188 R: Peon config.toml loads and uppercases account
- 201 R: table of protected accounts refused; each set member is a distinct safety entry (rndbot prefix row hits the prefix branch)
- 215 R: ledger entry without password refused missing_field
- 228 R: JSON of unknown shape refused unknown_format
- 234 R: extensions resolve against the listing file's directory for json and toml
- 259 R: malformed extension values refused (string, number, empty)
- 273 R: absent file refused unreadable
- 280 R: isProtected negatives (X, normal factory account) plus case-insensitive; 201 only covers positives
- 289 R: profile extensions ordered before flag extensions
- 298 R: unreadable extension path refused

### packages/harness/src/credentials/status.test.ts
- 16 R: auth.json location under the Peon config dir
- 22 R: explicit --model wins over logins
- 28 R: provider preference order codex, anthropic, openai
- 40 R: unknown or no provider gives no model
- 50 D: restates the FALLBACK_MODEL constant; real use asserted by main.test.ts:223
- 56 R: startup line for one login
- 62 R: startup line lists every login (plural branch)
- 68 D: pins the NO_LOGIN prose literal; exit-3 contract asserted at main.test.ts:113

### packages/harness/src/drive/held.test.ts
- 24 R: PLAY key table maps raw terminal sequences to drive commands (incl. F9, Ctrl-C/D pass, arrows)
- 45 R: kitty protocol press/repeat/release decode
- 53 R: held keys merge into one input; opposite keys cancel
- 67 R: first press lease covers OS repeat delay, repeat re-arms short lease, lapse sends stop
- 87 R: one key lapsing leaves the other driving
- 96 R: with key releases, stop on release not on lease

### packages/harness/src/drive/note.test.ts
- 43 R: hand-back note facts (duration, distance, dedup counts, targets, HP/mana) from observed data
- 59 R: predicted/unobserved pose labels and the lines cap with omitted count
- 70 R: no target vs unnamed target vs named
- 81 R: note says why control returned when not Esc
- 99 R: nextHostile cycle order, skips dead and friendly

### packages/harness/src/drive/play.test.ts
- 53 R: F1 claims human once; keys drive; TALK mode passes keys through
- 70 R: agent acting tools refuse while human drives, allowed after Esc
- 79 R: takeover cancels runs with human_stop and aborts the turn
- 92 R: Esc stops the character, releases control, sends one note with log lines
- 123 R: action just before Esc lands in that takeover's note
- 143 R: re-takeover during hand-back survives
- 157 R: closed connection ends the takeover and frees the character with note
- 192 R: requestedTarget wins over stale server selection
- 202 R: takeover ends when connection starts closing
- 218 F: name says it drops the held keys but asserts only holding() true; assert the held keys are released

### packages/harness/src/entry.test.ts
- 34 R: usage error exits 2 and prints usage (real process)
- 40 R: --check runs end to end, exits 0, never prints the token, creates no .pi

### packages/harness/src/eval/run-dir.test.ts
- 26 R: UTC run stamp to the second
- 30 R: run-dir file layout the eval tooling reads
- 50 R: stamped dir under the state root with its subdirs
- 68 R: --run-dir reuse refused once a game log exists
- 87 R: prune keeps newest stamped dirs and leaves other names
- 109 R: atomic JSON write, no temp left under concurrency
- 166 R: meta.json carries no password
- 181 R: session link re-points then becomes a copy at exit
- 197 R: dangling link removed at finalize; no link is tolerated

### packages/harness/src/eval/stats.test.ts
- 16 R: per-tool counts, statuses, errors and repeat hits
- 57 R: nearest-rank p50/p95
- 67 R: tick writes tools.json and stop writes the last state
- 85 F: asserts only that stop resolves; assert that no file is created or that start-less stop does not throw on a real path

### packages/harness/src/eval/status.test.ts
- 21 R: status snapshot reads session, active run and gates
- 62 R: status.json written per tick and at stop

### packages/harness/src/log/packet-trace.test.ts
- 33 R: off mode writes counts only, no trace rows
- 53 R: headers mode writes named rows, hex fallback for unknown opcodes, no bodies
- 80 R: bodies mode keeps the hex body
- 89 R: rows append at most once per flush interval
- 105 R: counts add across sessions

### packages/harness/src/log/query.test.ts
- 40 R: default window since last turn, tool rows hidden
- 52 R: last_turn reaches the previous turn's start
- 73 R: fallback rows hidden unless domain named
- 90 R: time window query
- 105 R: since r1 reads from the run start
- 127 R: unknown run and bad since refused with next call
- 143 R: word, from: and domain: search
- 177 R: limit keeps newest rows, oldest first, with more count
- 193 R: relative time prefixes

### packages/harness/src/log/store.test.ts
- 23 R: bigint serialized as lowercase hex
- 29 R: writer holds rows until flushMs, then one batch
- 45 R: row serialized at flush so later mutation lands
- 55 R: write order kept across overlapping flushes
- 67 R: sink appends on flush and close
- 78 D: asserts only that flush/close resolve with no file; no observable behaviour; createJsonlSink({file:undefined}) is used by log/query.test.ts:40 and runs setups
- 107 R: row stamps v, seq, ts, char
- 124 R: draft ts is kept
- 129 R: capacity drops oldest, since/recent/get consistent
- 141 R: since cursors are independent and non-consuming
- 152 R: mark patches stored row; unknown seq ignored
- 164 R: subscribe/unsubscribe
- 174 R: marks made before flush reach the file

### packages/harness/src/main.test.ts
- 91 R: --check prints login line, exits 0, releases lock
- 113 R: no login exits credential code 3 and releases lock
- 123 R: env API key counts as login
- 139 R: protected account refused before a lock is taken
- 151 R: live holder refuses and exit refused
- 168 R: full start builds run dir, Pi gets game tools, meta written, no password in any file
- 223 R: no login still starts on fallback model, logout notice
- 282 R: quit paths write exitReason quit and endedAt
- 292 R: SIGTERM writes sigterm, no logout notice
- 309 R: SIGINT during logout writes sigint, exit 130
- 322 R: fatal error writes fatal_error at process exit, lock released
- 364 R: warns once per missing required DBC, check still passes
- 381 R: silent when all DBC present
- 393 R: silent when spell_data_dir unset

### packages/harness/src/prompt/harness-doc.test.ts
- 32 R: docs/harness.md covers every USAGE flag (derived from code, catches undocumented flag)
- 41 R: docs cover every registered slash command
- 48 R: docs cover every game tool
- 57 D: no contract, greps fixed words in the doc

### packages/harness/src/prompt/install.test.ts
- 86 F: pins tool-note sentences ("Use find to filter...", "log is history..."); keep prompt start, "- look:"/"- journal:" note prefixes, one stop line; drop the prose
- 100 R: before ready only the profile character is named
- 111 R: unknown race/class/level dropped
- 125 R: prompt never carries password or account
- 136 R: context_with_system puts the prompt first, keeps tools, drops the foreign system text
- 179 R: wake turns through real Pi session get the same prompt

### packages/harness/src/prompt/system-prompt.test.ts
- 30 D: counts words in the archived design doc, not in production code; no contract
- 36 R: system prompt equals the approved design text with the first sentence filled
- 50 R: first-line fill table for each race/class/level combination
- 70 C packages/harness/src/prompt/system-prompt.test.ts:36: same rest-of-prompt equality, already part of the whole-text compare
- 75 C packages/harness/src/prompt/system-prompt.test.ts:36: substrings of the approved text that 36 already compares in full
- 86 D: negative substrings are implied by the word-for-word compare at system-prompt.test.ts:36
- 94 D: braces check on the rest of the prompt; covered by system-prompt.test.ts:36 equality and the first-line table at :50

### packages/harness/src/runs/adapters.test.ts
- 67 R: navigation category stripped from refusal text
- 79 R: goTo throwing yields refused with floors and next step
- 104 R: arrived on movement_stopped with distance
- 118 R: blocked route returns raw reason
- 136 R: replan pending delays the end until polled clear
- 168 R: abort halts and returns stopped
- 189 R: tactics run ends only on its own run's outcome
- 221 R: stopped without outcome takes last outcome
- 246 R: synchronous throw caught
- 259 R: rejected Jev start maps to jev_unavailable
- 273 R: Jev failure ending the fight maps to jev_unavailable
- 295 R: tactics abort halts
- 318 R: jevCode mapping and negatives
- 338 R: cycle ends at stopped event
- 365 R: rejected cycle start returns the error
- 379 R: already-aborted cycle is stopped
- 407 R: quest cycle stops on abort and passes its args
- 438 R: pilot budget timeout halts with pilot_timeout
- 450 R: attacked abort takes control, halts and reports attacked

### packages/harness/src/runs/registry.test.ts
- 51 R: ids, end record and jsonl rows
- 101 R: second concurrent run refused busy with stop next
- 128 R: started/progress/ended events
- 149 R: cancel causes map to reasons and statuses; cancelAll lost is interrupted
- 177 R: launch throw records failed and rejects done
- 195 R: release unmarks awaited
- 208 R: label and view of a record

### packages/harness/src/runs/wait.test.ts
- 36 R: run end returned when it ends first, awaited stays true
- 55 R: human yield releases the run
- 69 R: timeout yield releases the run

### packages/harness/src/smoke/g25-long-run.test.ts
- 20 F: keep RUNNING, runId, awaited:false, 120 s boundary, run continuing; detail/next: toContain values "Magistrix Erona (u1)", "0 yd walked", "400 yd to go", "HP 200/200", run id; drop sentences

### packages/harness/src/smoke/v2-context.test.ts
- 40 R: pins the Pi dependency behaviour that context-hook messages reach the model and are not persisted (test-local extension, guards a Pi upgrade)
- 85 R: same for a hidden custom message on a wake turn

### packages/harness/src/smoke/v3-yield.test.ts
- 115 R: steer during a blocking run tool yields after Pi queued it; model sees it next; input logged
- 150 R: stop steer cancels run through the reflex before the model runs
- 171 R: Esc aborts tool signal and stopAll(esc) ends the run

### packages/harness/src/smoke/v4-validation.test.ts
- 47 R: pins Pi behaviour that schema failure skips tool_result but reaches tool_execution_end, which tools/install.ts relies on

### packages/harness/src/smoke/v6-now.test.ts
- 30 R: hidden before_agent_start message arrives as user text after the prompt and stays hidden in the session file

### packages/harness/test-support/pi-recorder.test.ts
- 10 D: no contract, tests the test-only recorder helper itself
- 33 D: no contract, tests the fake tui helper counter

#### Seams
- packages/harness/src/config/lock.ts `acquireLock` params `procDir`, `host`, `pid`: injected only for lock.test.ts (main passes defaults)
- packages/harness/src/eval/run-dir.ts `runStamp`, `runsRoot`: exported; runStamp only run-dir.test.ts and run-dir.ts itself
- packages/harness/src/log/store.ts `FLUSH_MS` and packet-trace.ts `TRACE_FLUSH_MS`: exported for fake-timer tests
- packages/harness/src/drive/note.ts `NOTE_LINES_CAP` and held.ts lease constants: exported for tests
- packages/harness/src/runs/adapters.ts `rawRefusal`: exported, only adapters.test.ts:67 calls it directly (also used in-module)
- packages/harness/src/config/profile.ts `isProtected`: exported, only profile.test.ts:280 calls it outside profile.ts
- packages/harness/src/main.ts `MainDeps` (`proc`, `interactive`, `now`, `home`): injection points used by main.test.ts

#### Defects
- none

## harness-navigation

### packages/harness/src/navigation/collision.test.ts
- 24 R: collisionFree casts low, head and vertical rays; dropping a ray lets the walker clip a lintel or knee-high wall
- 41 R: the higher floor is followed across a platform edge only within the climb; a wrong climb test blocks or allows stairs
- 51 R: edge taller than the climb is refused in both directions; a loose bound walks the agent into a wall
- 59 R: obstacles on the upper floor or on level ground still refuse; guards the climb carve-out from over-allowing
- 73 R: plan() steps off a platform the direct GroundRoute refuses via the native corridor; end-to-end collision seam

### packages/harness/src/navigation/column.test.ts
- 21 R: three-floor column keeps the previous corner floor; picking the wrong floor teleports the route to another storey
- 28 R: two floors near the previous corner stay ambiguous; guessing would walk into the wrong floor
- 35 R: with no continuing floor the column refuses as route-ambiguous
- 42 R: a walkable native floor step is kept rather than refused as ambiguous

### packages/harness/src/navigation/floors.test.ts
- 39 R: headroom below agent height (1.59 vs 1.61) decides floor vs not; wrong cut reports floors under roofs or hides real ones
- 48 R: surfaces within ground error merge to the highest member in any order; order dependence would misplace Z
- 56 R: height() returns the clear floor, not the first raw entry, and refuses a truly ambiguous column
- 68 R: floors a step apart with headroom stay two floors; merging them would hide the choice from the agent
- 73 R: floor list drops surfaces without headroom and sorts highest first; the agent reads these floors
- 78 R: an explicit Z selects one floor of a multi-floor column
- 83 R: explicit Z off every floor refuses with the floors list and never substitutes one
- 99 R: the start pose must stand on a floor of its column; refuses ambiguous start and disagreeing pose
- 114 R: the one mesh-routable floor of a multi-floor column becomes the destination, upper or lower
- 121 R: several routable floors stay ambiguous and list only those routable
- 129 R: no routable floor refuses as snapped off rather than picking one
- 134 R: an explicit Z is never swapped for another routable floor
- 140 R: floorsAt lists clear floors of a column and drops the 9.9 under-headroom entry
- 146 R: a drop off the start platform before open ground names "leaving start"; agent next-step depends on the site
- 158 R: a refusal after open ground stays "at route"; guards the start/route site distinction
- 178 R: pose within one climb above the floor plans from the floor under it; agent hovering mid-jump still routes
- 187 R: pose within ground error is kept exactly as observed (not snapped)
- 192 R: poses far above/below or over a multi-floor column still refuse as disagreeing with ground

### packages/harness/src/navigation/goto-stale.test.ts
- 32 R: a predicted pose with an old server fix settles onto the floor under it instead of refusing
- 50 R: a recent server fix keeps the "wait" refusal; guards against settling on stale-looking-fresh data

### packages/harness/src/navigation/goto.test.ts
- 44 F: the observedPosition toEqual compares the fixture map with itself; assert only the active guid route or move the position check to the real owner
- 59 R: destination height derives from a unique column and the walk arrives at that Z; end-to-end goto
- 84 R: ambiguous destination refuses pick_destination with floors and sends no motion, then walks to the chosen floor
- 117 R: a guessed Z refuses pick_destination with floors rather than being replaced
- 134 R: redirect stops the old route with navigation_replaced and plans from the stopped pose
- 171 R: negative control for 134: an idle goto emits no navigation_replaced
- 182 R: three unreachable shapes (throw, short endpoint, one point) refuse unreachable with no motion packets
- 206 R: creature destination vanishing stops as target_lost, ignores other guids, never replans or moves afterwards
- 246 R: an unobserved creature refuses target_not_observed before any motion
- 280 R: creature on a multi-floor column picks the floor within 0.25 yd
- 301 F: bare toThrow() passes for any failure; assert the refusal state/reason beside the plan spy args (upper floor target)
- 313 R: never falls back to another floor when the creature floor has no route; zs list proves it
- 329 R: no floor near the creature keeps pick_destination with all floors and no motion
- 344 R: two floors within ground error merge into one destination and the route starts

### packages/harness/src/navigation/maps.test.ts
- 46 R: map id to navigation map name (Azeroth/Kalimdor/Expansion01/Northrend); a wrong name loads wrong tiles
- 54 R: each map opens once under its own name and close() closes all; leaks or double opens otherwise
- 65 R: missing map file refuses as unsupported without leaking the path to the agent
- 76 R: unnamed map refuses before native construction
- 83 R: missing native library is an explicit error, not flat ground; flat fallback would walk into walls
- 92 R: covers() true only for a named map with a map file; trailing slash dir tolerated

### packages/harness/src/navigation/northshire.test.ts
- 42 R: env-gated real-mesh route from the abbey steps to McBride; catches namigator/stair regressions the fakes cannot
- 47 R: env-gated real-mesh route from the post-unstick pose to McBride

### packages/harness/src/navigation/nudge-walk.test.ts
- 56 R: pose already on the mesh does not move
- 65 R: no reachable nudge target does not move
- 74 R: blocked walk reports no arrival
- 84 R: partial walk that stays off the mesh reports distance moved without arriving
- 98 R: partial walk that lands on the mesh arrives; spy checks the yard budget passed to the walk
- 117 R: an already-aborted signal rejects before walking
- 127 R: an abort during the walk propagates rather than being swallowed as no nudge
- 140 R: missing navigation reports no nudge instead of throwing
- 149 R: a native failure while snapping degrades to no nudge

### packages/harness/src/navigation/nudge.test.ts
- 63 R: env-gated recorded off-mesh starts (Sunspire, Fargodeep, Sunstrider) refuse raw with "start snapped off"
- 67 R: env-gated recorded off-mesh starts nudge within reach onto the mesh, step legally and plan onward

### packages/harness/src/navigation/observation.test.ts
- 20 F: toBe pins the full obstructed sentence (WORDING); keep a tight toContain("different route") as the branch label, no code or data separates branches
- 26 R: height_unresolved maps to a no-retry hint (branch discrimination)
- 32 R: both start-side refusals get the open-ground hint, not the choose-elsewhere hint
- 40 R: each ambiguous-column site and the non-floor Z refusal map to their own advice
- 52 R: target_lost and unreachable pathfind refusals map to no-retry advice
- 59 F: keep toContain("Move 3 to 5 yards") as the start-snap branch label (the number is the value); drop "off the walkable mesh", "Do not repeat" and the NPC negative
- 67 R: end snap shares the unreachable hint rather than the start-snap hint
- 73 F: keep one branch label ("another surface") that tells this corridor refusal from the next two; drop "nearer waypoint on the same floor" prose
- 79 F: keep one branch label ("mesh and the ground") for the path-corner refusal; drop the "nearer waypoint" and "do not repeat" sentences
- 86 F: keep one branch label ("object or a wall") for the corridor collision; drop the "nearer waypoint" and "do not repeat" sentences
- 93 R: other or missing reasons return null
- 101 F: toEqual pins the whole obstructed sentence (WORDING); keep the state spread and assert nextStep with toContain("different route") or non-null
- 113 R: start-refusal hint reaches observeNavigation
- 124 F: keep "10 yards" (distance value) and the replan_refused vs plain split via "refused a new route"; drop "Do not repeat" and "nearer grounded waypoint" prose
- 139 R: an unblocked active state has a null hint

### packages/harness/src/navigation/planner.test.ts
- 11 R: interior ridge sampled from terrain not funnel corners; interpolation would float or sink the walker
- 24 R: dense anchors are not linearly interpolated; the sample follows real terrain
- 36 R: an observed high pose or destination is never replaced by a distant floor
- 42 R: connected-height on a different surface is rejected
- 47 R: interior disconnected corridor is rejected despite valid funnel endpoints
- 60 R: collision between grounded points rejects (direct corridor case)
- 67 R: overhead geometry that clears agent height does not block the route
- 74 R: a route surface with less than headroom beneath another surface is rejected as ambiguous
- 81 R: the continuing floor is kept when the connected trace drops to a lower one
- 90 R: high mesh corner with no data near it is a hint; one with data refuses; -0.3 drop refuses
- 108 R: a high corner refuses when the data holds a surface near it (companion of 90)
- 121 R: native endpoint clamping refuses as snap even inside the old 8 yd limit, both ends
- 133 R: original start pose is preserved despite native float rounding; sample clamps at both ends
- 151 R: a later sample losing ground evidence throws instead of silently falling back
- 164 R: turn handling uses horizontal distance and clamps at the endpoint
- 185 R: return connectivity to the same anchored surface is required
- 190 R: empty and vertical-only routes are rejected
- 200 R: closed navigation and routes cannot query freed native state
- 219 R: out-of-domain coordinates reject before map open or native entry; guards native crashes
- 240 R: fully grounded direct travel replaces an ungroundable funnel corner
- 260 R: a rejected ambiguous direct column is avoided by a validated detour
- 276 R: refuses when both direct and funnel corridors collide
- 289 R: native lifecycle failures are not swallowed to try another corridor
- 308 R: native path rejection cannot be bypassed by a grounded direct line
- 318 R: a direct candidate cannot hide non-finite native corridor coordinates
- 332 R: destination height is derived at the target, not the origin altitude
- 343 R: planGround names start and route sites for ambiguous columns
- 358 R: planGround does not repair invalid original ground or bypass native path rejection
- 372 R: missing and non-finite destination columns reject as height errors
- 381 R: planGround keeps domain and closed gates, which are separate code from plan
- 390 R: height() on a unique column; baseline for 400
- 400 R: height with a known surface picks the matching floor of a multi-floor column
- 413 R: two column entries near the current surface still refuse
- 426 R: a distant query under a tree keeps the navmesh ground, not the canopy
- 437 R: the origin tile is primed (loadAdtAt) before the connected height query
- 458 F: the lineOfSight mock implements the asserted result; assert that clear() primes loadAdtAt(to) before the query, the only logic in clear()

### packages/harness/src/navigation/refusal.test.ts
- 5 R: classifyNavigationRefusal maps refusal text to wait/pick_destination/stop/unreachable; the agent acts on these keys

### packages/harness/src/navigation/riser.test.ts
- 45 R: climbs onto the only floor of a column over a covered surface (Northshire stair)
- 51 R: climbs a riser the low ray cannot clear within the mesh step
- 56 R: keeps the previous-sample floor over a far lower floor
- 66 R: refuses a pick onto a surface with no headroom
- 71 R: refuses a rise past the climb in a two-floor column
- 76 R: refuses a riser taller than the mesh step

### packages/harness/src/navigation/route-follower.test.ts
- 7 R: ground route samples mesh height; HALT stops motion and lease renewal
- 50 R: root stops navigation with blockedReason root
- 77 R: an old-origin route cannot reset a moving predicted pose
- 104 F: wait/pick_destination/stop mapping repeats refusal.test.ts:5; keep the store-then-clear-on-navigate assertions only
- 141 R: a route may only start on the floor just under the pose; other origins throw navigation_origin_changed

### packages/harness/src/navigation/route-replan.test.ts
- 51 R: mid-walk ground refusal stops, replans from the stopped pose after the delay and arrives with counts and stop reasons
- 92 F: name says "no manual advice" but it asserts nextStep not null (wait prose); rename and assert the replan.pending contract, drop the prose reliance
- 116 R: a refused replan is a terminal stop with replan_refused reason and counts, no further motion
- 140 R: refusal before meaningful displacement stops with replan_no_progress without replanning
- 154 R: HALT during the replan delay cancels the replan
- 171 R: a server correction replans from the observed server pose
- 192 R: other stops (root) never replan
- 207 R: target loss cancels a pending replan and ends a replanned route
- 277 R: replan needs 2 yd displacement from the previous plan origin
- 285 R: plan count, elapsed time and distance walked caps stop replanning

### packages/harness/src/navigation/route-swim.test.ts
- 48 R: swim packets sent on entering and leaving water while the route continues
- 72 R: halting in water sends STOP_SWIM and restores movement
- 90 R: a dry route sends no swim packets

### packages/harness/src/navigation/step.test.ts
- 7 R: a reachable collision surface wins over a navmesh height floating above it; far pose falls back to navmesh
- 18 R: highest surface within climbing reach is used when the navmesh probe fails
- 30 R: rise or short drop reachable, cliff refuses as ambiguous
- 49 R: withinStep boundary: 50 degree slope plus a cell up, 13 yd drop; only test of core withinStep

### packages/harness/src/navigation/sunstrider.test.ts
- 40 R: env-gated real-mesh route from the Sunstrider court to the eastern path
- 49 R: env-gated real-mesh route across the three-floor ramp on one floor

### packages/harness/src/navigation/swim.test.ts
- 22 R: surface followed across a river and only the wet stretch marked swimming
- 33 R: river without liquid walks the bed unmarked
- 40 R: a bank higher than a step above the water refuses
- 54 R: a start already in the water plans and marks swimming
- 61 C packages/harness/src/navigation/swim.test.ts:22: land stretches asserted unmarked there (wet(3), wet(17)); packet-level in route-swim.test.ts:90

### packages/harness/src/navigation/trace.test.ts
- 10 R: return trace losing ground falls back to the known column
- 22 R: return trace failing across a step keeps the ground refusal
- 36 R: lost height trace over the one walkable floor is crossed
- 46 R: a unit whose own point loses the trace is reachable
- 57 R: lost trace under a raised mesh corner walks the terrain line
- 68 R: lost trace over two walkable floors stays refused
- 81 R: falls back to the standable floor nearest the walker
- 95 C packages/harness/src/navigation/trace.test.ts:68: same refusal branch, 0.6 vs 0.4 both exceed GROUND_ERROR 0.25; no new branch

### packages/harness/src/navigation/travel.test.ts
- 39 R: dispose then core shutdown halt: map not queried after close, no replan, no leaked timers
- 70 R: disposing the follower during a pending replan settles it and clears timers
- 107 R: disposing travel during a raw move leaves the map open for the shutdown halt; no control_error
- 136 R: a retired travel refuses goTo and walkToward with session_closed before touching movement
- 165 R: a disposed follower cannot start a route

### packages/harness/src/navigation/walk.test.ts
- 9 R: walk to an ungrounded point refuses destination_not_grounded without cancelling manual motion
- 30 R: walk to a unit without navigation stops with missing_navigation before any motion packet

#### Seams
- packages/harness/src/navigation/maps.ts `navigationMapName`: exported; only maps.test.ts:46 calls it outside maps.ts
- packages/harness/src/navigation/travel.ts `nudgeOntoMesh` (exported with `deps` param): direct call only from nudge-walk.test.ts and navigation-fixtures.ts; production calls it inside travel.ts
- packages/harness/src/navigation/goto.ts `walkTowardTarget` export: also imported by walk.test.ts and navigation-fixtures; production uses it from travel.ts
- packages/harness/src/navigation/route-session.ts `RouteSession`/`REPLAN_LIMITS` exports: route-replan.test.ts:277,285 build RouteSession directly; route-follower.ts also uses them

#### Defects
- route-replan.test.ts:92 name says no manual advice but asserts nextStep is non-null (replan wait text); name/assertion mismatch, not a product bug

## harness-ops

### packages/harness/src/ops/danger.test.ts
- 49 R: attack start names the attacker but is not a HP-drop hit; a wrong ledger would report a hit age before any damage
- 61 R: HP drop is a hit for every current attacker, a heal is not; drives hit age
- 74 R: HP drops of other units are ignored; a wrong guid filter would invent hits
- 86 R: attacked event with no attacker leaves lastAttacker undefined (the `?? state.attackers` path still exists in danger.ts)
- 95 R: re-attach resets the ledger; stale hits would leak across sessions
- 106 F: dangerView toEqual keeps values; replace the dangerLine full-sentence toBe with toContain of "Springpaw Stalker u1", "3 s ago" (ms->s) and "41% HP"
- 131 F: replace the full-sentence toBe with toContain "Springpaw Stalker u1", "(12 yd)", "coming at you" (the no-hit branch label) and "100% HP"
- 146 F: hit age counts from the latest drop; replace sentence toBe with toContain "2 s ago" (computed age), "u1" and "41% HP"
- 170 F: bracket-free branch; replace sentence toBe with toContain name+ref "u9", "88% HP", "coming at you" and not.toContain("(")
- 188 F: replace sentence toBe with toContain "Mana Wyrm u3", "and 2 more" (computed count) and "30% HP"
- 206 R: empty attackers gives no line
- 210 F: replace the two sentence toBe with toContain "still coming" / "still attacking" (branch labels), "(12 yd)", "and 1 more", names and refs
- 243 R: attacker name falls back from sightings to 'an unknown unit'
- 304 R: a unit with you on its threat list joins the attackers once
- 316 R: victim switch to you by a new unit interrupts; a known one and newAttacker=false do not
- 412 R: installing while breath is low and draining aborts at once with the breath cause
- 422 R: drained timer on install aborts with 0 s
- 428 R: three negative inputs (plenty, paused, refilling) do not abort; each hits a distinct guard
- 438 R: an already-aborted outer signal keeps its reason over the breath read
- 460 R: breath_low event aborts the run with the seconds left
- 476 R: first cause stays and a disposed watch ignores breath_low

#### Seams
- none

#### Defects
- none

### packages/harness/src/ops/explore-floors.test.ts
- 12 R: an ambiguous column ahead is skipped by trying other distances on the same bearing (keeps its contract)
- 25 R: an ambiguous column at every distance blocks the bearing (keeps its contract)
- 42 R: an ambiguous floor that escapes the height retry is retried at another distance (keeps its contract)
- 64 R: an exhausted ambiguous bearing counts once, so an open perpendicular bearing is still tried (keeps its contract)

#### Seams
- none

#### Defects
- none

### packages/harness/src/ops/explore.test.ts
- 55 R: %s -> %s (keeps its contract)
- 61 R: walks planned point legs with no z and stops on a new hostile (keeps its contract)
- 84 R: keeps walking up to 100 yd when nothing new comes into view (keeps its contract)
- 104 R: without a direction it avoids a bearing whose cells were explored farther out (keeps its contract)
- 119 R: without a direction it heads away from the explore start (keeps its contract)
- 135 R: without a direction it turns away from a crowd of friendly NPCs (keeps its contract)
- 159 R: a leg on two floors walks on the floor nearest your height (keeps its contract)
- 181 R: a refused leg keeps its full length; 3 distinct refused bearings stop the walk (keeps its contract)
- 206 R: never re-issues a refused goal; a path corner disagreement tries both sides (keeps its contract)
- 224 R: a ledge tries both side bearings at full length before it counts (keeps its contract)
- 247 R: a side bearing that arrives keeps the original bearing for the next leg (keeps its contract)
- 274 R: a side refused for another reason still tries the other side (keeps its contract)
- 293 R: without a direction it skips a bearing refused from this cell (keeps its contract)
- 307 R: without a direction it turns to the nearest unvisited cell (keeps its contract)
- 323 R: turns aside instead of walking into cells explored before (keeps its contract)
- 342 R: a side bearing tried after a refusal skips explored cells too (keeps its contract)
- 361 R: stops without a leg when every bearing ahead was explored (keeps its contract)
- 378 R: moves off a start that refuses every leg the same way, then explores (keeps its contract)
- 403 R: keeps the obstruction when moving off the start fails (keeps its contract)

#### Seams
- none

#### Defects
- none

### packages/harness/src/ops/interrupts.test.ts
- 29 R: a new attacker aborts; the attacker at the start does not (keeps its contract)
- 52 R: before C5 it finds the new attacker in state.attackers (keeps its contract)
- 63 R: newAttacker false lets the run go on (keeps its contract)
- 75 R: an ignored attacker lets the run go on, another one stops it (keeps its contract)
- 96 R: rooted aborts (keeps its contract)
- 111 R: death aborts (keeps its contract)
- 124 R: a parent abort aborts the watch without a cause (keeps its contract)
- 135 R: dispose unsubscribes (keeps its contract)

#### Seams
- none

#### Defects
- none

### packages/harness/src/ops/item-names.test.ts
- 23 R: returns once every name has resolved (keeps its contract)
- 36 R: gives up after the bound (keeps its contract)
- 46 R: does not wait when nothing is pending (keeps its contract)
- 52 R: returns without throwing when the signal aborts (keeps its contract)
- 65 R: returns at once when the signal is already aborted (keeps its contract)
- 76 R: reads names from the vendor window (keeps its contract)
- 111 R: fills names and qualities that arrive late (keeps its contract)
- 156 R: an aborted signal stops the wait and keeps the id names (keeps its contract)

#### Seams
- none

#### Defects
- none

### packages/harness/src/ops/loot.test.ts
- 97 R: core path: names from the window, counts from pushes, money from notices (keeps its contract)
- 136 R: core path: names that arrive after the loot fill the lines (keeps its contract)

#### Seams
- none

#### Defects
- none

### packages/harness/src/ops/nav-log.test.ts
- 42 R: an arrived leg writes route_start and route_end with the run id (keeps its contract)
- 77 R: a refusal with no unit height writes nav/refused (keeps its contract)
- 110 R: a floor retry writes route_replaced before the second route ends (keeps its contract)
- 143 R: a stopped leg ends with its cancel status and reason (keeps its contract)
- 161 R: a goal already in range writes no route rows (keeps its contract)
- 172 R: explore legs inside a travel run each write a start, a floor retry and a refusal (keeps its contract)

#### Seams
- none

#### Defects
- none

### packages/harness/src/ops/next-guard.test.ts
- 27 R: test.each([ ["look()", { args: {}, tool: "look" }], [ 'engage(coun (keeps its contract)
- 42 R: test.each([ 'rest(), then engage(target: "u9")', 'ask the human: "Where? (keeps its contract)
- 62 R: a first PARTLY whose Next is the same call keeps it (keeps its contract)
- 73 R: a repeat with no progress from the same place asks the human (keeps its contract)
- 86 R: a repeat that made progress keeps its Next (keeps its contract)
- 97 R: test.each([ "loot_denied:release_only", "loot_denied:timeout", "loot (keeps its contract)
- 119 R: a Next the repeat guard would block asks the human instead (keeps its contract)
- 138 R: a different call, a DONE and a timed rest keep their Next (keeps its contract)
- 174 R: a run stopped by something other than the human may be started again (keeps its contract)
- 192 R: a quest engage that used up its starts may run again (keeps its contract)
- 210 R: under attack a blocked Next becomes engage on the attacker (keeps its contract)
- 242 R: under attack a repeat refusal engages the attacker, not the human (keeps its contract)
- 269 R: test.each([ "no_ground", "ambiguous_floor", "unreachable", (keeps its contract)
- 351 R: a no_ground failure moves first, then asks only after a failure from a new pose (keeps its contract)

#### Seams
- none

#### Defects
- none

### packages/harness/src/ops/now-snapshot.test.ts
- 78 R: is undefined offline or before the world is ready (keeps its contract)
- 83 R: holds self, target, attackers, cast, auras, run and no-progress (keeps its contract)
- 138 R: a ghost gets the corpse distance and the reclaim delay (keeps its contract)
- 169 R: lists self, place, target, attackers and units in view (keeps its contract)
- 180 R: is undefined offline (keeps its contract)

#### Seams
- none

#### Defects
- none

### packages/harness/src/ops/progress.test.ts
- 38 R: reports no progress after NO_PROGRESS_AT unchanged actions (keeps its contract)
- 53 R: a changed digest or reason resets the count (keeps its contract)
- 62 R: a read tool neither adds nor resets, whatever its name (keeps its contract)
- 81 R: logs agent/stuck once at STUCK_LOG_AT (keeps its contract)
- 91 R: a progress event in the log resets the count and sets lastProgress (keeps its contract)
- 110 R: a row marked progress resets the count, whatever its event (keeps its contract)
- 133 R: run rows change the digest (keeps its contract)
- 148 R: the digest keeps a 2 yd pose bucket (keeps its contract)
- 159 R: attach counts a move over 5 yd as progress (keeps its contract)

#### Seams
- packages/harness/src/ops/progress.ts `NO_PROGRESS_AT`, `STUCK_LOG_AT`: exported only for progress.test.ts

#### Defects
- none

### packages/harness/src/ops/quest-memory.test.ts
- 27 R: finds the NPC a talk or return goal names (keeps its contract)
- 42 R: finds no NPC in a goal that names none (keeps its contract)
- 49 R: a quest that became complete adds the turn-in step (keeps its contract)
- 73 R: a quest that was complete before adds nothing (keeps its contract)
- 88 R: with no known giver or ender the turn-in step looks for questgivers (keeps its contract)

#### Seams
- none

#### Defects
- none

### packages/harness/src/ops/range.test.ts
- 31 D: restates TALK_RANGE_YD and the LOOK_* constants; no contract exists, consumers in tools/look*.ts and interact.ts are tested at their boundaries
- 40 R: distanceTo reads a unit in view (keeps its contract)
- 49 R: distanceTo falls back to the sighting on the same map (keeps its contract)
- 63 R: compassTo uses WoW axes (keeps its contract)

#### Seams
- packages/harness/src/ops/range.ts `LOOK_DEFAULT_ROWS`, `LOOK_MAX_ROWS`: used by tools/look-find.ts, constants test at :31 is the only other user of the exports

#### Defects
- none

### packages/harness/src/ops/recover.test.ts
- 27 R: alternatives list is the computed set of other ways per via (looked-up healer, offer, self-res spell); keep the toEqual, no extra prose beyond the labels
- 54 R: alternatives per via are branch labels from state with no code telling them apart; keep the toEqual on the list beside the activate spy and outcome
- 73 R: spirit healer out of range: too_far and no packet (keeps its contract)
- 85 R: alternatives labels vary by state (self-res spell lookup, healer view); keep the toEqual on the list with the no-release and selfResurrect spies
- 130 R: the no-self-res label and the other-way list are branch labels; keep the toEqual on alternatives with the no_self_res cause and no-release spy
- 168 R: self when the server stays silent settles no_answer (keeps its contract)
- 194 R: self: an abort during the act rejects with the abort reason (keeps its contract)
- 205 R: self: an already aborted run never calls the act (keeps its contract)
- 221 R: alternatives[0] starts with the looked-up healer ref "spirit healer u" and the other labels are computed; already asserts values, not sentences
- 252 R: accept without an offer refuses in the outcome (keeps its contract)

#### Seams
- none

#### Defects
- none

### packages/harness/src/ops/refs.test.ts
- 11 R: writes lowercase hex without a prefix (keeps its contract)
- 18 R: reads u<n> and o<n> (keeps its contract)
- 24 R: gives undefined for anything else (keeps its contract)
- 35 R: gives refs in first-seen order and keeps them (keeps its contract)
- 43 R: maps a ref back to its guid (keeps its contract)
- 51 R: never reuses a ref (keeps its contract)
- 63 R: numbers objects separately from units (keeps its contract)
- 74 R: accepts creatures and players, not game objects (keeps its contract)

#### Seams
- none

#### Defects
- none

### packages/harness/src/ops/refusal.test.ts
- 5 R: carries the reason and detail in its message (keeps its contract)
- 16 R: defaults status to REFUSED and body to no lines (keeps its contract)
- 27 R: keeps a FAILED status, body lines and options (keeps its contract)

#### Seams
- none

#### Defects
- none

### packages/harness/src/ops/remembered.test.ts
- 50 R: a questgiver is remembered after the sightings TTL (keeps its contract)
- 57 R: travel to a questgiver out of view walks to where it was last seen, then to it (keeps its contract)
- 81 R: a respawned NPC is found again by its entry (keeps its contract)
- 98 F: keep reason/next/status; in the detail regex keep the name+ref, the computed "8 yd N" and "3 min ago", drop "is not where it was last seen"
- 115 R: after not_at_last_known the next look no longer lists the old point (keeps its contract)
- 126 R: interact with a questgiver out of view walks to it and talks (keeps its contract)
- 157 R: interact with a remembered NPC that is gone fails not_at_last_known (keeps its contract)
- 174 R: keeps a quest ender with no NPC flags past the TTL (keeps its contract)

#### Seams
- none

#### Defects
- none

### packages/harness/src/ops/repeat-guard-offers.test.ts
- 124 R: ${one.event} lets ${one.tool} ${one.reason} run again (keeps its contract)
- 134 R: a repeat of ${one.tool} ${one.reason} with no new offer stays refused (keeps its contract)
- 143 R: an offer that came before the ${one.tool} failure does not clear it (keeps its contract)
- 152 R: a trade request does not clear a failure of another reason (keeps its contract)
- 161 R: an offer for another call does not clear this failure (keeps its contract)
- 174 R: the retry that follows an offer and fails again is refused until the next offer (keeps its contract)
- 231 R: a ${one.event} row that opens no prompt does not clear ${one.reason} (keeps its contract)
- 245 R: an opening ${one.event} row clears ${one.reason} in every delivery class (keeps its contract)

#### Seams
- none

#### Defects
- none

### packages/harness/src/ops/repeat-guard.test.ts
- 50 R: blocks the same failed call from the same place (keeps its contract)
- 65 R: treats args with other key order as the same call (keeps its contract)
- 80 R: a move of REPEAT_MOVE_YD or more clears the block (keeps its contract)
- 89 R: a target that closed in by 10 yd does not block engage (keeps its contract)
- 106 R: a changed combat state clears the block (keeps its contract)
- 119 R: engage on a unit that attacks the character is never blocked (keeps its contract)
- 131 R: remembers where a tool failed for a positional reason (keeps its contract)
- 157 R: a changed progress digest clears the block (keeps its contract)
- 168 R: time codes and repeat refusals are never stored (keeps its contract)
- 175 R: a DONE of an action or run clears every failure, a read or control does not (keeps its contract)
- 201 R: an unanswered call is blocked until a read tool %s checks the result (keeps its contract)
- 226 R: look is never blocked (keeps its contract)
- 233 R: a failure stops blocking after 5 minutes (keeps its contract)
- 241 R: a PARTLY blocks its Next from here but is never refused (keeps its contract)
- 254 R: a continuation is never stored (keeps its contract)
- 264 R: untried leaves out the call it refuses (keeps its contract)
- 274 R: untried lists distinct next texts, newest first, at most 3 (keeps its contract)
- 299 F: reason is REPEAT/REFUSED and next/body are values; replace detail toBe with toContain("too_far") (reason echoed into text, nothing else asserts it)
- 313 F: replace the full-sentence next toBe with the 'ask the human:' prefix plus toContain of the substituted tool "travel" and reason "no_ground"

#### Seams
- packages/harness/src/ops/repeat-guard.ts `REPEAT_MOVE_YD`, `TIME_CODES`: exported only for repeat-guard.test.ts

#### Defects
- none

### packages/harness/src/ops/repeat-scene.test.ts
- 33 R: gives the target distance and whether it attacks you (keeps its contract)
- 42 R: reads npc and to as the target too (keeps its contract)
- 52 R: a call with no unit target has no distance (keeps its contract)

#### Seams
- none

#### Defects
- none

### packages/harness/src/ops/resolve.test.ts
- 28 R: a ref gives that unit (keeps its contract)
- 37 R: an unknown ref is not seen (keeps its contract)
- 45 R: an exact name gives the nearest living match (keeps its contract)
- 56 R: part of a name with one name among the matches gives the nearest living one (keeps its contract)
- 67 R: part of a name with different names is ambiguous, nearest first (keeps its contract)
- 80 R: a name nobody has is not seen (keeps its contract)
- 88 R: finds a unit out of view in the sightings (keeps its contract)
- 100 R: applies the alive, lootable and relation filters to names (keeps its contract)
- 122 F: keep reason, body rows (distance, bearing, ref, call), next and options; replace detail toBe with toContain "2" (count) and both looked-up names
- 142 F: reason not_seen proves the branch; drop the detail sentence (optionally toContain("Kobold")); keep reason and next

#### Seams
- none

#### Defects
- none

### packages/harness/src/ops/settle.test.ts
- 21 R: subscribes before send, so an answer sent inside send counts (keeps its contract)
- 33 R: skips events that do not match (keeps its contract)
- 45 R: gives undefined at the timeout and unsubscribes (keeps its contract)
- 62 R: an abort rejects with the signal's reason (keeps its contract)
- 76 R: an aborted signal rejects before send (keeps its contract)
- 91 R: awaits an async send (keeps its contract)
- 104 R: a send that rejects after an abort surfaces that error without an unhandled rejection (keeps its contract)

#### Seams
- none

#### Defects
- none

### packages/harness/src/ops/sightings.test.ts
- 28 R: note keeps position, relation, roles, level and time (keeps its contract)
- 49 R: skips self rows and game objects (keeps its contract)
- 56 R: a row without a position keeps the earlier sighting (keeps its contract)
- 65 R: an unknown relation does not overwrite a known one (keeps its contract)
- 72 R: hides sightings older than 30 minutes, and prune deletes them (keeps its contract)
- 86 R: attach follows entity appear and update events (keeps its contract)

#### Seams
- packages/harness/src/ops/sightings.ts `SIGHTING_TTL_MS`: exported for tests (remembered.test.ts too)

#### Defects
- none

### packages/harness/src/ops/travel-leg.test.ts
- 14 R: test.each([ ["unreachable: pathfind_find_height failed (UNKNOWN_HEIGHT)", "n (keeps its contract)
- 38 R: arrives at a point and remembers the start pose (keeps its contract)
- 51 R: does not move when the unit is already within range (keeps its contract)
- 73 R: maps a planner refusal to its code and keeps no good pose (keeps its contract)
- 91 R: core resolved the floor: a unit goal arrives on the first plan (keeps its contract)
- 115 R: core refused with one matching floor: retries once on that floor (keeps its contract)
- 149 R: a unit raised above its floor retries on the floor nearest its height (keeps its contract)
- 183 R: a raised game object retries on the floor nearest its height (keeps its contract)
- 215 R: a unit over a lower floor still walks to the chosen floor (keeps its contract)
- 250 C packages/harness/src/ops/travel-leg.test.ts:149: same nearest-floor selection with a unit whose height sits between floors
- 284 R: a unit whose height is unknown keeps the refusal (keeps its contract)
- 305 R: a point goal without z on two floors retries once on the floor nearest you (keeps its contract)
- 328 R: a point goal with z is never retried on another floor (keeps its contract)
- 345 R: a failed floor retry keeps the refusal and says it retried (keeps its contract)
- 366 R: a human stop cancels the leg with the cancel code (keeps its contract)
- 385 R: a refused off-mesh start nudges then replans to arrival (keeps its contract)
- 407 R: a blocked nudge keeps the off-mesh refusal (keeps its contract)
- 426 R: a partial nudge that stays off the mesh counts its distance (keeps its contract)
- 445 R: a stop during the nudge cancels the leg (keeps its contract)

#### Seams
- packages/harness/src/ops/travel-leg.ts `refusalCode`: exported only for travel-leg.test.ts

#### Defects
- none

### packages/harness/src/ops/unreached.test.ts
- 7 F: two branch texts with no code beyond the string; assert the 'ask the human:' prefix, toContain "Innkeeper Farley" and the branch label "no navigation data"
- 20 F: assert the 'ask the human:' prefix, toContain "Innkeeper Farley" and the branch label "cannot reach"; drop the rest of the sentence
- 33 R: a start off the mesh points at unstick (keeps its contract)
- 45 R: a transient stop still hints travel to the unit (keeps its contract)
- 54 R: structuralReach names map, path and ground failures only (keeps its contract)

#### Seams
- none

#### Defects
- none

### packages/harness/src/ops/unstick.test.ts
- 27 R: walks at most 5 yd toward the last good pose and names the refused goal (keeps its contract)
- 47 R: nudges back onto the mesh first and reports the nudge (keeps its contract)
- 60 R: falls through to the last good pose when the nudge fails (keeps its contract)
- 71 R: falls through to open ground when the nudge and the walk fail (keeps its contract)
- 81 R: with no good pose it routes to open ground away from the nearest object (keeps its contract)
- 95 R: samples the other bearings when the first route is refused (keeps its contract)
- 108 R: reports 0 yd when no bearing and no walk moves you (keeps its contract)

#### Seams
- packages/harness/src/ops/unstick.ts `UNSTICK_MAX_YD`: exported only for unstick.test.ts

#### Defects
- none

### packages/harness/src/ops/views.test.ts
- 70 R: uses WoW axes: +x north, +y west (keeps its contract)
- 82 R: pose has a source, an age and the server fix age (keeps its contract)
- 96 R: no pose gives undefined (keeps its contract)
- 102 R: rage is shown in whole points (keeps its contract)
- 130 R: shows the combo points held on the target when above zero (keeps its contract)
- 137 R: leaves the field out with none or a zero count (keeps its contract)
- 148 R: self reads class from the self entity and name from the profile (keeps its contract)
- 163 R: attackers put the character in combat (keeps its contract)
- 169 R: the mounted flag follows the selfstate store (keeps its contract)
- 177 R: place gives zone, area and age (keeps its contract)
- 197 R: a place getter that is not built yet gives undefined fields (keeps its contract)
- 213 R: unitView decodes one row (keeps its contract)
- 243 R: targetsMe reads the unit's target (keeps its contract)
- 251 R: unitViews lists units only and notes each in the sightings (keeps its contract)
- 262 R: knownUnits adds sightings out of view, nearest first (keeps its contract)
- 281 R: nearestByKind covers units out of view (keeps its contract)
- 291 R: nearestByKind skips units another player tapped for hostile and attackable (keeps its contract)
- 302 R: unitMatches needs a living unit for hostile (keeps its contract)
- 317 R: mana reads as current/max with the percent after it (keeps its contract)
- 355 R: sit, chair sits, sleep and kneel get a posture word; the rest none (keeps its contract)
- 370 R: the now snapshot counts a running breath timer down to the clock (keeps its contract)
- 396 R: a drained but still-active timer shows 0 s (keeps its contract)

#### Seams
- none

#### Defects
- none

## harness-runtime

### packages/harness/src/extension/chat-commands.test.ts
- 22 R: every slash alias sends through the matching WorldHandle chat call, trimmed, under the world mutex; a mis-mapped alias misroutes chat
- 49 R: typed command name is logged as human/input text
- 56 F: ruling A: usage notices substitute the typed command name; assert toContain("/guild"), "/tell", "/3" with the warning level and no sends; drop the full "Use /guild <text>." sentences
- 71 R: /r with no reply target sends nothing and warns; with a target whispers it
- 81 F: ruling A: keep sendChannel call counts and the warning level; assert the missing index value toContain("5"); drop the "You are not in channel 5." sentence
- 94 R: offline refuses every chat command with an error and sends nothing

### packages/harness/src/extension/commands.test.ts
- 41 R: /stop stops the active run and humanStop logs one human/input row with stoppedRuns
- 59 F: ruling A: keep session.wake flip and the substituted state toContain("off") at info level; drop the "Wake is off." sentence and the "Use /wake on or /wake off." usage prose, keep only the warning level
- 70 R: /now reprints the last [now] line verbatim; empty case notifies
- 81 R: /log caps rows at LOG_COMMAND_ROWS as human-only entries
- 98 R: /snapshot slugs the label passed to snapshots.write
- 106 F: ruling A: keep disconnect count and levels; keep the substituted failure value toContain("auth failed") at error level; drop the already-up/Disconnected/Connect failed sentences

### packages/harness/src/extension/extension.test.ts
- 7 R: wowExtension registers the input, guard and shutdown handlers and the two renderers
- 24 R: session_shutdown for reload/new/resume/fork detaches the sink but keeps the game session online
- 37 R: quit shuts the runtime down and logs out

### packages/harness/src/extension/guards.test.ts
- 6 F: ruling A: assert exitCode 1, cancelled false and truncated false; drop the static output sentence "Shell commands are off in the harness." (no computed value in it)
- 25 R: /login is left to Pi's own command; a swallowed Enter would break auth

### packages/harness/src/extension/input.test.ts
- 46 R: stop-reflex positives (stop, halt, freeze, hold on) incl. case and punctuation
- 58 R: reflex negatives (please stop, long sentence, stopwatch) so ordinary talk is not a stop
- 70 R: reflex cancels the run, halts the character, logs stoppedRuns with via reflex
- 91 R: --stop-reflex off lets stop text through without halting
- 100 R: human text mid-run sets humanWaiting, collects text, triggers the yield after YIELD_DELAY_MS
- 134 R: idle stop reflex stops nothing and does not set humanWaiting
- 144 R: extension-sourced input is never treated as human
- 150 R: session agent/tool state through a turn; clears humanWaiting on turn_start
- 178 R: assistant text is logged as agent/message
- 193 R: a run outliving the turn passes control to the loop
- 208 R: a background run ending frees the body
- 224 R: a run end frees only the loop grant it holds, not a newer claim
- 240 R: stop reflex pre-empts an agent grant and leaves the body free
- 254 R: F9 while the human drives stops runs and halts but keeps human control
- 269 R: F9 cancels every run and logs via key
- 286 C packages/harness/src/extension/input.test.ts:70: humanStop's cancelled-record ids are already observable as stoppedRuns there and in commands.test.ts:41

### packages/harness/src/jev/choice.test.ts
- 9 R: request body to the provider (url, model, criteria, signal, no key leak) and valid Choice mapped to result
- 55 R: unknown choice id from the provider cannot escape as success
- 78 R: malformed payload shapes (noul type, non-JSON) fail
- 107 R: malformed distributions (empty, unknown key, negative, confidence >1) fail
- 131 R: low-confidence complete distribution is still returned as a judgment

### packages/harness/src/jev/exchange.test.ts
- 64 R: a 200 answer records status and full body, with no key or endpoint leak
- 74 R: 402/503/400 keep status and body in the exchange
- 92 R: non-JSON answer keeps the raw text
- 104 R: network failure records error with no status
- 114 R: abort records the abort and elapsed time
- 132 R: logged request plus exchange rebuild the sent body byte for byte; evidence replay depends on it

### packages/harness/src/jev/failures.test.ts
- 9 R: HTTP 529 fails once with no retry
- 26 R: network rejection fails once with no retry
- 43 R: abort propagates AbortError, no retry
- 69 R: 2xx arriving after abort is not a success
- 85 R: missing API key fails with no fetch
- 102 R: missing probability key and non-unit total both fail
- 120 D: same probability.total cause assertion as numbers.test.ts:105 with another total; keeper numbers.test.ts:105
- 141 R: body read failure keeps the raw cause and never serializes it

### packages/harness/src/jev/fault.test.ts
- 30 R: unset or empty JEV_FAULT is no fault
- 35 R: parses delay:, http:, transport forms
- 44 R: @N limits a fault to one request and round-trips in the marker
- 55 R: malformed fault specs are refused
- 73 R: faultMarker text recorded as evidence for each kind
- 90 R: http fault goes through the real client's classification (transport error, jev_unavailable)
- 107 R: transport fault throws "fetch failed"
- 114 R: numbered fault hits only that request
- 127 R: delay fault holds the real result until the delay, even after abort

### packages/harness/src/jev/framing-variants.test.ts
- 5 D: parseFramingVariant has no production caller (only this test); no contract exists; keeper none, delete with the export
- 10 D: same dead function as 5; the variant values are covered through selectJevAction at framing.test.ts:40 and :68
- 16 D: same dead function as 5; error-text pin on an unused parser; no contract exists
- 27 R: none variant yields no framing text
- 31 R: unknown class is left out of the framing sentence
- 38 D: ruling A: level and class are interpolated values but the branch repeats 50; keeper framing-variants.test.ts:50 (assert the level/class values via toContain)
- 50 R: class and level are interpolated into the minimal sentence
- 57 R: missing level drops the level words
- 64 C packages/harness/src/jev/framing.test.ts:68: ruling A: the static mechanics sentences are wording, drop them; level/class interpolation is asserted there on the wire body

### packages/harness/src/jev/framing.test.ts
- 10 R: none framing yields a body byte-identical to no framing
- 40 R: minimal framing reaches state.framing with instructions on the wire
- 68 R: mechanics framing reaches state.framing on the wire
- 92 R: endpointUrl option redirects the request

### packages/harness/src/jev/http-failure.test.ts
- 14 R: refused key (402/401) classified jev_unavailable with the response error_type
- 29 R: unreadable refusal body falls back to the status name
- 35 R: 429/500/503 are retryable transport failures
- 43 R: other 4xx stay plain failures, not transport or unavailable

### packages/harness/src/jev/numbers.test.ts
- 9 R: float rounding within tolerance accepted without renormalising
- 27 R: token counts must be nonnegative safe integers
- 44 R: NaN/Infinity confidence and probabilities fail
- 63 R: already-aborted request never reaches fetch
- 80 R: probabilities within tolerance are renormalised to total 1 keeping ratios
- 105 R: total outside tolerance is rejected with the total in the cause

### packages/harness/src/jev/port.test.ts
- 5 R: no TypeSafe key means no Jev port
- 10 R: JEV_FAULT wraps the provider and names the fault
- 19 R: malformed JEV_FAULT is refused even without a key

### packages/harness/src/puppet/args.test.ts
- 7 R: puppet CLI grammar: start, raw (name or 0x opcode, hex body lowercased), read, nearby, events, stop, call
- 38 R: send -w joins the remaining words into the whisper
- 48 R: malformed argv (missing flags, bad opcode/body, extra args) raises UsageError

### packages/harness/src/puppet/boot.test.ts
- 62 R: logs in the character from the account's config.toml and starts listening
- 77 R: protected accounts (ADMIN, rndbot) refused before any login
- 89 R: missing config.toml refused before login
- 98 R: second puppet refused while the first answers, no login
- 108 R: stale socket from a dead puppet is replaced
- 119 R: headers trace writes packets and counts to the state dir and raw sends via its sender
- 152 R: trace off logs in without trace and refuses raw

### packages/harness/src/puppet/calls-lfg.test.ts
- 16 R: accept/decline, out/in, yes/no map to the right boolean act arguments; a swapped mapping inverts agent actions
- 29 R: invalid words for lfg calls are rejected before any act

### packages/harness/src/puppet/calls-marks.test.ts
- 13 R: setRaidMark passes the icon and a bigint guid
- 19 R: requestRaidMarks calls its act once with no args
- 25 R: pingMinimap passes both coordinates
- 31 R: fractional coordinates rejected before the act
- 37 R: non-numeric guid string rejected

### packages/harness/src/puppet/calls-raid.test.ts
- 13 R: answerReadyCheck yes/no map to boolean
- 22 R: other words refused for answerReadyCheck
- 29 R: answerSummon accept/decline map to boolean
- 38 R: other words refused for answerSummon

### packages/harness/src/puppet/calls.test.ts
- 50 R: decodeCall keeps method and string args
- 57 R: guid string becomes a bigint
- 64 R: undefined JSON is no arguments
- 71 R: rollLoot decodes full u64 guid, slot, vote
- 80 R: invalid methods and argument shapes (wrong type, count, hex/negative guid, bad vote) are refused
- 99 D: asserts PUPPET_CALLS keys are alphabetically sorted; a style rule with no behavior; keeper none, lint order only
- 104 D: re-derives act lookup with a copied alias table; run closures are typed against WorldHandle in calls.ts; keeper server.test.ts:249
- 110 D: checks the mock game exposes act objects, i.e. tests the mock; keeper none, supports only 104
- 116 C packages/harness/src/puppet/server.test.ts:249: handle call with decoded args is the same spy shape through the real server
- 124 R: walkToPlayer resolves a nearby player case-insensitively and stops short of it
- 145 R: walkToPlayer errors when the player is not nearby
- 155 R: tradeRequestQuiet treats an unanswered request as success
- 190 R: tradeRequestQuiet tolerates busy and trade_canceled declines
- 200 R: tradeRequestQuiet still fails on other refusals
- 210 R: tradeAnswer waits for an incoming request before answering
- 229 R: tradeAnswer fails with no_request after the wait
- 241 R: tradeAcceptOffered accepts only once the other side offers, with the offer version

### packages/harness/src/puppet/format.test.ts
- 219 R: nearby --json envelope and exact row JSON pinned to the CLI shape the agent parses
- 230 C packages/harness/src/puppet/format.test.ts:219: envelope with empty data is the same resultJson branch
- 236 R: read --json chat events with type names (WHISPER_FROM, SERVER_BROADCAST, TYPE_99) and link stripping
- 242 C packages/harness/src/puppet/format.test.ts:236: empty events envelope is the same eventsJson branch
- 248 C packages/harness/src/puppet/main.test.ts:141: same start result JSON asserted through runPuppet
- 286 R: stored movement adds flags, nine sourced speeds, rooted and serverControlled
- 307 C packages/harness/src/puppet/format.test.ts:321: rooted false for flags without the root bit is its second assertion
- 321 R: root bit detected among other flag bits and absent among all other bits
- 338 R: no stored movement leaves the row unchanged

### packages/harness/src/puppet/launch.test.ts
- 41 R: launch returns once the child is in the world and leaves it running
- 53 R: child's failure message is thrown
- 63 R: child exiting before the world throws with the exit code
- 70 R: timeout gives up and kills the child
- 88 R: packet trace mode is passed as argv to the child
- 104 R: no args when trace is off
- 115 R: packetTraceOf maps argv to a mode and unknown to off

### packages/harness/src/puppet/main.test.ts
- 62 R: bad command prints usage to stderr and exits 2
- 71 R: every request command with no puppet running exits 1 with "No puppet is running"
- 87 R: send -w issues one whisper request and prints OK
- 101 R: call sends method and raw args
- 113 R: events --json sends the events request and prints the reply
- 124 R: invalid call argument exits 2 before reaching the puppet
- 133 R: refused request exits 1 with the puppet's message
- 141 R: start launches once and prints the started result
- 152 R: start --packet-trace hands the mode to launch
- 162 R: raw sends opcode number and body
- 178 R: start with a live puppet does not launch another
- 189 R: launch failure exits 1 with its message
- 221 R: protected account from config.toml is refused in a real process
- 233 R: character that cannot log in fails, leaves no socket

### packages/harness/src/puppet/meeting-stone.test.ts
- 19 R: selects the member then uses the nearest meeting stone
- 60 R: missing member or stone throws
- 74 R: refused use is reported
- 101 R: uses the nearest summoning portal
- 136 R: no portal nearby throws

### packages/harness/src/puppet/protocol.test.ts
- 30 R: socket/pid in runtime dir, trace files in state dir, config path layout the factory scripts rely on
- 50 R: whisper request survives its line
- 55 R: call request survives its line
- 64 R: events request survives its line and its exact encoding
- 70 R: raw request survives its line
- 79 R: malformed or ill-typed request lines are refused
- 96 R: ok and error replies decode; anything else is unreadable
- 110 R: sendRequest sends one line and returns the reply
- 133 R: missing socket gives PuppetNotRunning
- 140 R: missing runtime dir gives PuppetNotRunning without touching cwd
- 148 R: stale socket gives PuppetNotRunning

### packages/harness/src/puppet/server.test.ts
- 106 R: pid file beside the socket and status reply
- 112 R: binds a socket path longer than a Unix address allows and removes it on stop
- 123 R: whisper then read drains chat in the CLI shape; second read empty
- 147 R: chat buffer keeps only the newest events
- 166 R: nearby rows carry the CLI's field order and movement block
- 220 R: stop logs out, waits for the server, removes socket and pid
- 232 R: stop closes the socket when the server never finishes logout
- 240 R: lost connection ends the puppet and removes its socket
- 249 R: call dispatches to the handle method with decoded args and names it
- 259 C packages/harness/src/puppet/calls.test.ts:57: bigint decoding of guid args is asserted there at the decoder
- 265 R: method outside the allow-list is refused with nothing called
- 276 R: a throwing method replies ok false with its message
- 290 R: refused and no_answer outcomes reply ok false naming the status
- 311 R: a rejected call replies ok false with its message
- 326 R: ok, done and lock outcomes reply ok true
- 343 R: calls during logout reply that the puppet is stopping
- 380 R: events drain group, notice, packet errors, duel, guild in arrival order with hooks
- 417 R: events buffer keeps only the newest rows
- 428 R: area events keep area and print bigint guids as decimal strings
- 443 R: events leaves chat to read
- 454 R: raw sends opcode and body bytes through the trace sender
- 472 R: empty raw body sends zero bytes
- 489 R: raw refused without a packet trace
- 503 R: raw reports the sender's failure

### packages/harness/src/runtime/connection.test.ts
- 62 R: connect logs in with the profile, attaches observers in order, goes online, logs session/connected
- 75 R: requireHandle refuses offline with the /connect hint
- 82 R: failed first login leaves the connection offline and rejects
- 90 R: disconnect logs out, detaches observers, goes offline
- 101 R: lost socket cancels runs as lost and reconnects after 5 s
- 128 R: three failed retries wake the agent once and stay offline
- 155 R: disconnect emits closing then offline once
- 164 R: disconnect during first login logs out the late handle
- 178 R: disconnect during a reconnect logs out the late handle
- 214 R: connect while closing waits and does not treat it as lost
- 232 R: disconnect waits for server logout completion and logs the wait
- 265 R: disconnect force-closes after LOGOUT_WAIT_MS and logs timeout

### packages/harness/src/runtime/control-owner.test.ts
- 29 R: free body goes to any claimant with no pre-emption
- 39 R: human > agent > loop pre-emption order and takeover records
- 57 R: lower claim refused while higher holds, no state change
- 80 R: second claim by same owner pre-empts the first grant
- 100 R: human claim always stops everything
- 110 R: release frees only for the current grant

### packages/harness/src/runtime/dbc-directory.test.ts
- 15 R: reads table bytes with or without trailing slash
- 27 R: missing table error names table and directory

### packages/harness/src/runtime/exit.test.ts
- 73 R: quit writes endedAt/exitReason before logout and again at the end
- 99 R: SIGTERM after Pi's handler writes sigterm from the first write, no logout notice
- 110 R: SIGHUP after Pi's handler writes sighup from the first write
- 117 R: SIGTERM before Pi listens still exits 143 with meta written
- 125 R: SIGINT during logout writes meta at once and exits 130
- 135 R: SIGINT with Pi's own ignore keeps the harness running until removed
- 149 R: fatal exit without shutdown writes fatal_error
- 157 R: exit 0 cut short in logout still records quit

### packages/harness/src/runtime/harness-runtime.test.ts
- 30 F: pins the whole default session object, restating defaults; keep wake taken from flags and agent idle
- 48 R: runtime connect attaches the six observers in that order
- 67 R: requireHandle throws Refusal offline before connect
- 73 R: stopAll cancels runs, halts, stops cycle and attack, returns the records
- 91 R: lost connection marks the active run interrupted with connection_lost
- 109 R: shutdown stops runs, logs out, goes offline
- 117 F: ruling A: keep the looked-up run id and kind: toThrow containing "r1" and "engage"; drop the "is still running." prose; rename test (no stop hint is asserted)

### packages/harness/src/runtime/managed-tools.test.ts
- 21 R: seeds silent fd and rg executables when host has none
- 32 R: never shadows a host binary
- 42 R: keeps an existing bin-dir tool

### packages/harness/src/runtime/mutex.test.ts
- 4 R: sends run one at a time in call order
- 21 R: a failed send rejects its caller without blocking the queue

### packages/harness/src/runtime/pi-runtime.test.ts
- 40 R: splits provider/id at the first slash
- 47 R: model without a provider refused
- 55 R: only extension tools, flag model and thinking level
- 67 R: session file under pi-sessions, cwd is workspace
- 78 R: new session reruns the extension factory and keeps the game handle
- 94 F: ruling A: keep one recorded system message and section keys; assert preamble toContain(rt.profile.character) (the substituted self name), drop the toStartWith prompt sentence
- 128 R: model missing from catalog refused, workspace still created
- 143 F: result depends on host fd/rg presence; seeding already proved by managed-tools.test.ts:21, assert the call happens or drop

### packages/harness/src/runtime/ready.test.ts
- 66 R: ready when pose known and entity count stable for READY_STABLE_MS; in_world logged
- 99 R: stays unready while entities keep arriving
- 118 R: whenReady resolves false on timeout and true when ready
- 135 R: unknown names and no capabilities when core data is missing
- 161 F: name says new handle but only detaches; assert attach of a new handle (194 covers) or rename to detach
- 175 R: not ready while the self pose is unknown
- 194 R: attaching a second handle resets readiness and in-world

### packages/harness/src/runtime/yield.test.ts
- 4 R: trigger resolves every pending wait after the yield delay
- 24 R: a wait started after a trigger waits for the next one

#### Seams
- packages/harness/src/jev/framing.ts `parseFramingVariant`: no production caller; only framing-variants.test.ts uses it
- packages/harness/src/extension/chat-commands.ts `NO_REPLY_TEXT`, `OFFLINE_TEXT`: exported only so tests can compare prose
- packages/harness/src/extension/commands.ts `LOG_COMMAND_ROWS`: exported for the test
- packages/harness/src/extension/input.ts `isStopReflex`: exported; only input.test.ts imports it outside input.ts

#### Defects
- none

## harness-tools-1

### packages/harness/src/tools/covered.test.ts
- 23 R: interact result marks its call's quest/money/quest-reward rows consumed, not earlier, chat or exploration xp; a wrong filter double-reports rows
- 51 R: interact bank result covers bank/opened and bank/deposit rows of its own call
- 67 F: no tool/call row exists for c1/c2, so nothing is covered for that reason alone; add the call row so FAILED and other-tool gating is what the test proves
- 83 R: group mark covers raid/mark but not raid/ping_row
- 99 R: group kick covers its roster row
- 113 R: mail tool covers listed and sent rows
- 129 R: vehicle call covers entered and control rows, not unrelated mail rows
- 147 R: DONE fly covers the landing row but not the start row
- 163 R: rows appended after coverRows ran stay uncovered
- 177 D: same assertion as 163; status never matters because the row is appended after coverRows; keeper covered.test.ts:163
- 191 R: coverRows with no matching tool/call row covers nothing

#### Seams
- none

#### Defects
- none

### packages/harness/src/tools/define-events.test.ts
- 20 R: passive rows during a call appear once as the last result line and get consumedBy and delivered; a regression double-delivers rows

#### Seams
- none

#### Defects
- none

### packages/harness/src/tools/define.test.ts
- 86 R: DONE result text, details shape, tool/call + tool/result rows and turn counter
- 106 R: tool/result log row is the result text truncated to 2000 chars
- 122 R: definition metadata and executionMode parallel for read, sequential for action
- 135 F: ruling A: REFUSED turn_budget status/reason already prove the branch; drop the whole-sentence toBe ("report to the human now"), assert toContain("REFUSED turn_budget") and the Next line "end your turn" as a tight contain, and keep run not called
- 145 F: ruling A: drop the whole-sentence toBe on the offline refusal; assert toContain("REFUSED offline") and keep the Next value "/connect" via toContain
- 152 F: ruling A: drop the whole-sentence toBe on the not_ready refusal; assert toContain("REFUSED not_ready") and keep the Next value "look" call via toContain
- 162 R: exact repeat of a failed call refuses without running and offers the untried Next
- 180 R: a repeat runs again once a unit attacks (guard is lifted by danger)
- 201 R: Next that repeats the call is kept until a repeat makes no progress, then asks the human
- 226 R: repeat with progress keeps the same call as Next
- 256 R: time_limit PARTLY keeps the same call as Next
- 273 R: Next that already failed from here is replaced by an ask-the-human step
- 302 R: look read tool is never blocked by the repeat guard
- 325 R: a thrown core error in a tool run becomes a typed refusal; wiring of coreErrorResult through the tool
- 333 R: Esc on the Pi signal calls halt on the handle
- 355 R: human_stop result becomes FAILED cancelled
- 370 R: RUNNING partials throttled to once per UPDATE_EVERY_MS
- 398 R: refusal after a partial keeps the partial's after block
- 418 R: evidence rows are consumed by the call
- 439 R: the only wiring test that defineGameTool invokes coverRows for interact quest rows
- 468 R: password in args is redacted from the tool/call log row
- 476 R: danger line appended while a unit attacks
- 505 R: kind read/control tool that sends fails expectSendKind; guards the helper enforcing the kind contract
- 515 D: action/run kinds can never fail the check, so this asserts only that the mock recorded one packet; keeper define.test.ts:505
- 524 R: read tool that sends nothing passes the check (false-positive guard)

#### Seams
- packages/harness/src/tools/define.ts `MAX_CONTENT_BYTES`: exported, used only by format.test.ts:104 and look.test.ts; production never enforces it
- packages/harness/test-support/tool-harness.ts `expectSendKind`: test helper whose action/run branch can never fail

#### Defects
- MAX_CONTENT_BYTES (700) is declared in define.ts but no production code truncates by bytes; tests only check a fixed short output stays under it

### packages/harness/src/tools/engage-approach.test.ts
- 67 F: ruling A: keep the computed "12 yd" walked distance and the looked-up ref (Springpaw Stalker u\d+) via toContain/tight regex; drop the wording ("not in view any more; it may have died or despawned", "the fight did not start") since reason target_not_observed proves the branch; keep started 0, reason and next
- 85 F: ruling A: target_broken branch; same as 67: keep "12 yd" and the u-ref, drop the sentence; keep started, reason and next
- 106 R: target_broken for another unit leaves the approach going and the fight starts
- 134 F: ruling A: keep the u-ref and computed "12 yd" via toContain; drop "died before you reached it; another unit killed it" (reason target_dead proves the branch); keep reason/next
- 162 F: ruling A: keep the u-ref and "12 yd" via toContain; drop the tapped/"no loot, experience or quest credit" prose (reason tapped_by_other proves it); keep reason and next
- 185 R: target tapped by arrival is not fought and Next points at the other stalker
- 214 R: count call losing its target keeps count in Next
- 231 R: count call hands a tapped first target to the cycle
- 256 R: Next never names a unit above the level cap

#### Seams
- none

#### Defects
- none

### packages/harness/src/tools/engage-beset.test.ts
- 15 R: an unreachable attacker still attacking blocks pulling a new hostile across cycle batches

#### Seams
- none

#### Defects
- none

### packages/harness/src/tools/engage-choose.test.ts
- 87 R: unnamed pick is the nearest hostile within 3 levels
- 98 R: tapped-by-other unit is never chosen when unnamed
- 117 F: ruling A: keep computed "L7, 6 levels above you" and the suggested engage(target: "u\d+") ref via tight regex/toContain; drop the "If the human asked for this fight" prose; keep reason too_strong and next undefined
- 134 R: gray unit passed for one that gives XP
- 159 F: ruling A: keep the looked-up unit entry "Mistbat u\d+ L9" (name, ref, level) via toContain; drop "they give no XP or kill credit" prose; keep reason not_seen and explore next
- 187 R: gray attacker is still fought
- 205 R: named target skips the level cap
- 213 F: ruling A: keep the u-ref in the detail via toContain; drop "is tapped by another player; killing it gives you no loot..." (reason tapped_by_other proves it); keep reason and next
- 243 R: tapped named unit with no other hostile points at engage()
- 262 R: tapped named unit points at an untapped one of the same name
- 293 R: unseen named target explores until it appears
- 310 R: in-view unit beats a nearer remembered one
- 324 R: only a remembered unit walks to where it was seen
- 347 F: ruling A: keep the computed "48 yd north" (distance and bearing) and the u-ref via toContain; drop "is not in view; it was last seen ... of you" wording; keep reason not_in_view and explore north next
- 368 R: remembered unit id behaves like a remembered name
- 380 R: count above 1 selects cycle mode
- 389 R: quest by id selects quest mode and the named creature as the item source
- 410 R: unknown quest refuses with the quest log body
- 423 R: under 50% HP refuses low_health with the rest-then-same-call Next
- 436 R: rage class is not refused for low power
- 442 R: another attacker must be fought first
- 455 R: defending skips the HP guard
- 464 R: missing Jev key refuses no_combat_helper
- 477 R: capabilities not implemented lets the fight try

#### Seams
- packages/harness/src/tools/engage-choose.ts `parseQuest`, `guardPull`, `checkHelper`: exported and called directly by these tests; also used by engage.ts

#### Defects
- none

### packages/harness/src/tools/engage-fight.test.ts
- 31 F: ruling A: replace the whole DONE-line regex with toContain on values: "killed Springpaw Stalker (u\d+) in 0 s", "+108 XP", "Looted Broken Fang x1, 12 copper", "HP 200/200, mana 300/300 (100%)"; drop the "server kill credit" wording; keep the after assertion
- 50 F: ruling A: keep "killed Springpaw Stalker (u\d+)" and the mapped label "gray target" (code-to-label, also in engage-reasons noXpText) via toContain; drop the rest of the regex; keep after targets
- 69 F: ruling A: keep computed values "0 s into the fight" and "dead at 0, 0" plus the u-ref via toContain; drop "killed you" prose; keep next recover(), reason died
- 89 F: ruling A: keep the computed seconds from 6200 ms: toContain("7 s"); drop the whole-sentence toBe "Surface now: you have 7 s of breath."; keep contract fields
- 109 R: fight time and walk distance reported apart on death; regex pins numbers
- 129 R: a kill after an approach counts only the fight seconds
- 148 R: Jev timeout maps to jev_unavailable
- 160 F: ruling A: keep computed values "2 of 3 kills", both u-refs, and "1 kill still needed" via toContain; drop "Stopped: no more Springpaw Stalker in view" wording (reason queue_exhausted and the stopText table prove it); keep reason/next/status
- 185 F: ruling A: keep "1 of 2 kills (<ref>)" and "no XP for <ref>" (substituted ref, computed count) plus the mapped label "gray target" via toContain; drop "Stopped:" prose; keep next engage(count: 1) and status
- 210 R: unnamed cycle does not refill with a gray same-name unit
- 258 F: ruling A: keep the computed "20 yd" walked distance and the u-ref via toContain; drop the "not in view any more; it may have died or despawned" sentence (reason proves it); keep started 0, reason, next
- 283 R: unreachable target points at another one in view
- 299 R: unreachable target with a different creature in view points at it
- 318 R: unreachable with nothing else in view sends the agent exploring
- 329 R: map without nav data asks the human
- 342 R: start off the mesh points at unstick
- 358 R: item quest with no known source refuses with the creature ask
- 383 R: second attacker after a single kill is named in Next
- 410 R: new attacker mid-cycle leads the next cycle
- 460 F: ruling A: replace the toBe on the detail with toContain of the computed values "0 of 1 kills", "HP 200/200, mana 300/300 (100%)" and "at 0, 0"; keep status RUNNING and runId

#### Seams
- none

#### Defects
- none

### packages/harness/src/tools/engage-loot-names.test.ts
- 20 F: ruling A: drop the toContain "killed you" prose (reason died proves it); keep died/recover and the after.loot fallback name "item 4813" (looked-up fallback value, already asserted)
- 44 R: loot named late by the server is reported by name

#### Seams
- none

#### Defects
- none

### packages/harness/src/tools/engage-progress.test.ts
- 122 R: cycle progress updates count each kill credit
- 132 F: ruling A: keep computed "1 of 8 kills" (updates and detail), the u-ref, "7 kills still needed" and next via toContain; drop "Stopped: the fight limit for one call was reached" wording (code max_starts_reached label is covered by engage-reasons plainReason table)
- 151 R: kills of different creatures are named per creature
- 170 R: quest kills are named by creature
- 185 R: completing kill points at the turn-in
- 211 F: ruling A: keep the substituted quest id "8325" via toContain and status DONE; drop the "nothing left to kill: the objectives of quest #8325 are complete." startsWith sentence

#### Seams
- none

#### Defects
- none

### packages/harness/src/tools/engage-queue.test.ts
- 25 R: an attacker not in view is not queued
- 100 F: ruling A: replace the exact toBe detail with toContain of computed values "1 of 3 kills" and "mana 72/300 (24%)"; keep next/reason/status
- 110 R: attacker at the low mana stop is engaged before rest
- 129 F: ruling A: replace the exact toBe detail with toContain of computed values "1 of 3 kills" and "40% HP"; keep reason/status
- 140 F: ruling A: keep the u-ref and computed "90 yd" via toContain; drop "and no route to it was found" wording; keep next travel(to: ref) and no look(

#### Seams
- none

#### Defects
- none

### packages/harness/src/tools/engage-reasons.test.ts
- 29 R: ruling A: plainReason is a code-to-label table the agent reads; all 14 rows are contract values (labels mapped from a code); keep every row, including the loot_denied:<n> prefix and unknown-code fallback at :57
- 57 R: unknown code stays as is
- 63 R: groups unkilled targets by reason
- 69 R: kills are left out of the skipped list
- 78 R: recheck-skip reasons map to plain words
- 92 R: kills-still-needed arithmetic on loot denial
- 104 R: empty queue names each target's outcome
- 116 R: empty stopText queue says none left in view
- 130 R: failText with no kills lists each target
- 144 R: failText empty-queue branch
- 158 R: single target failText
- 172 R: ruling A: failText branch for target_dead_without_server_credit uses a different template (name + mapped label, no "was not killed") and substitutes the target name; the label is a mapped value; keep
- 188 R: noXpText names gray kill
- 194 R: noXpText distinguishes no-kill-XP source

#### Seams
- none

#### Defects
- none

### packages/harness/src/tools/engage-stops.test.ts
- 27 F: ruling A: keep the substituted name "Springpaw Stalker" and the computed vitals "HP 200/200, mana 300/300 (100%)" via toContain; drop the whole-sentence toBe (the mapped label is covered by engage-reasons.test.ts:29); keep reason/next/status
- 50 F: ruling A: keep the name and the vitals via toContain; drop the whole-sentence toBe (mapped label covered by engage-reasons.test.ts:29); keep reason lost and status FAILED
- 65 F: ruling A: keep "0 of 3 kills", the grouping of refs (a and b together, then c) via a tight regex or toContain on the refs; drop the mapped labels and the startsWith sentence (covered by engage-reasons.test.ts:29,63); keep reason and status
- 88 R: beset unreachable stop ends REFUSED with attacker_unreachable
- 106 F: ruling A: keep computed "2 of 3 kills", both u-refs and "1 kill still needed" via toContain; drop "Stopped: the last corpse was out of loot range" wording (reason loot_denied:release_only proves it; label covered by plainReason table); keep status PARTLY

#### Seams
- none

#### Defects
- none

### packages/harness/src/tools/engage-tally.test.ts
- 109 R: decisionKind maps action ids to attack/spell/wait; production also uses it at engage-tally.ts:88
- 117 F: ruling A: the DONE text is the only carrier of the totals, so keep computed values via toContain: "Dealt 312, took 145", "avoided: dodge x1", "immune: Frost Nova"; drop the surrounding "server kill credit", "+108 XP" and loot sentence from the regex; keep the after assertions
- 149 R: totals cover whole run beyond the log ring
- 170 R: pet damage kept after the pet is gone
- 189 R: non-pet unit adds nothing
- 206 R: no combat log means no totals

#### Seams
- none

#### Defects
- none

### packages/harness/src/tools/engage.test.ts
- 45 R: dead refuses with recover()
- 53 F: ruling A: keep the computed vitals: toContain("mana 60/300 (20%)") instead of \d+ placeholders; drop "pull at 30% or more" prose; keep reason low_mana and runs empty
- 68 R: choice refusal inside the run returns a REFUSED result with the run id
- 89 F: ruling A: the dismount spy proves the branch and nothing else is computed; drop the toContain "Dismounted first." prose, keep the spy call count
- 110 R: taxi mount stops engage with in_flight through the real tool

#### Seams
- none

#### Defects
- none

### packages/harness/src/tools/format.test.ts
- 17 C packages/harness/src/tools/define.test.ts:86: asserts body [] which define.test.ts:86 already checks through the tool
- 28 R: status word first then body
- 39 R: reason code after status word and Next line
- 51 R: RUNNING carries the run id
- 65 R: danger line sits before Next
- 85 R: body cut to fit keeps line 1, danger and Next
- 104 D: fixed short string under the limits; production never enforces MAX_CONTENT_BYTES; keeper look.test.ts:16
- 121 R: nextCall quoting rules and argument order
- 133 R: askHuman quoting
- 200 R: coreErrorResult maps core error classes to status, reason, next
- 209 R: code: raw error maps to FAILED code
- 222 R: other errors map to FAILED error with the first line only
- 231 D: restates the emptySelf literal defaults; look.ts:67 only uses it; no behaviour; no keeper

#### Seams
- packages/harness/src/tools/define.ts `MAX_CONTENT_BYTES`: kept alive only by tests

#### Defects
- none

### packages/harness/src/tools/human-admission.test.ts
- 40 F: ruling A: keep refusal code "REFUSED human_waiting" and the Next "read the human's message" via toContain; drop the whole-sentence toBe ("the human wrote a message. Read it before you act."); keep the read/control DONE results
- 54 R: human driving refuses actions, reads run, control released
- 74 R: action beside a background run leaves run and loop hold alone
- 90 R: human_waiting quoting, truncation and multi-message joining

#### Seams
- none

#### Defects
- none

### packages/harness/src/tools/install.test.ts
- 59 R: hint appended on the second validation miss in a row
- 83 R: a good result resets the miss count
- 93 R: other tools and assistant messages left alone

#### Seams
- none

#### Defects
- none

### packages/harness/src/tools/interact-bank.test.ts
- 142 R: bank opens the banker once and lists cloth with next verbs
- 158 R: no reopen when the banker is already open
- 180 R: deposit calls act with bag/slot
- 204 R: withdraw calls act with bag/slot
- 228 R: buy_bank_slot price taken from the money fall
- 261 R: abort during open stops the deposit
- 285 R: abort during open stops the slot purchase
- 309 R: non-banker refuses not_banker with no act
- 323 F: name promises it lists the carried cloth but asserts only reason not_carried; assert the body list
- 340 R: ambiguous names refuse ambiguous_item
- 370 R: duplicate stacks deposit the first
- 396 R: empty bank refuses not_in_bank
- 413 R: refused deposit becomes FAILED with the bank reason
- 430 R: unanswered withdraw is UNCONFIRMED no_answer
- 443 R: unanswered open is UNCONFIRMED no_answer
- 460 D: expectSendKind never fails for an action-kind tool (tool-harness.ts:51); keeper define.test.ts:505

#### Seams
- none

#### Defects
- none

### packages/harness/src/tools/interact-bind.test.ts
- 45 F: ruling A: keep the looked-up area name "Falconwing Square" via toContain("Falconwing Square") (value from place state); drop the "Home is now" sentence; keep the act spy and DONE
- 73 R: non-innkeeper refuses not_innkeeper and sends nothing
- 85 F: ruling A: status UNCONFIRMED proves the branch; drop the "dead, out of range or in an instance" prose; assert status UNCONFIRMED and no_answer reason/text code
- 99 R: bind walks to the innkeeper first
- 123 D: expectSendKind never fails for an action-kind tool; keeper define.test.ts:505

#### Seams
- none

#### Defects
- none

### packages/harness/src/tools/interact-buyback.test.ts
- 38 F: ruling A: keep the looked-up item name "Linen Cloth" and the computed price "35 copper" (money diff) via two toContain; drop "Bought back ... for" sentence; keep the slot spy
- 63 F: name promises it names what is there, only reason not_in_buyback is asserted; assert the listed names
- 76 R: refused buyback becomes FAILED with the vendor reason
- 93 R: unanswered buyback is UNCONFIRMED
- 106 D: expectSendKind never fails for an action-kind tool; keeper define.test.ts:505

#### Seams
- none

#### Defects
- none

### packages/harness/src/tools/interact-flight.test.ts
- 75 R: flight master lists known destinations with price, hides unknown, Next is the fly call
- 90 R: non flight-master opens no taxi map
- 100 R: ruling A: the learned-reply line is a branch label with no status/data to tell it apart; keep toContain("Learned the flight path") plus the looked-up "Silvermoon City" and the reopen count
- 121 R: missing catalog prints nothing
- 134 R: ruling A: no-answer branch is only carried by the line text, so keep the short branch label toContain("did not show"); optionally add part.next undefined
- 146 R: ruling A: empty-destination branch is only carried by the line text, so keep the short label toContain("No other flight path") with next undefined

#### Seams
- packages/harness/src/tools/interact-flight.ts `flightExtra`: exported and called directly here; also used by interact.ts

#### Defects
- none

### packages/harness/src/tools/interact-quest-accept.test.ts
- 68 F: ruling A: next carries the branch (travel to the trigger); drop the toContain "objective region" prose; keep next travel(to: "-9843.54, 127.53, 5.37")
- 119 F: ruling A: keep the computed region coordinates via toContain("10385, -6316"); drop "objective region around" wording; keep next journal(about: "quests")
- 193 R: waits for the late region reply before choosing Next
- 222 R: gives up waiting after ANSWER_MS
- 305 R: trigger inside the region wins over a nearer one
- 313 R: inside trigger nearest the character first
- 321 C packages/harness/src/tools/interact-quest-accept.test.ts:313: same input as 313; assert the other inside trigger in detail there
- 329 R: falls back to the trigger nearest the centre
- 337 R: collection quest points at the journal
- 359 R: pending template query does not route to a trigger

#### Seams
- none

#### Defects
- none

## harness-tools-2

### packages/harness/src/tools/interact-quest.test.ts
- 73 R: next names the ender and status DONE; keeps the goal the details dialog showed
- 83 R: unanswered accept ends UNCONFIRMED no_answer with next at the quest log and exactly one accept sent
- 108 R: accept resolves the ender to a ref, distance and bearing from known units
- 147 R: journal turn-in field and ender name come from the accepted quest's goal
- 160 R: no_offer with a complete quest next points at the ender, not this NPC
- 178 R: unknown ender falls back to look(find: questgiver)
- 200 C packages/harness/src/tools/interact.test.ts:191: same reward_needed refusal with reward item body; :191 also takes the chosen reward
- 213 R: reward and money come from the rewarded event, not the coinage field
- 353 R: greeting placeholders $N/$C/$R are filled from the character
- 384 F: negative not.toContain('Greetings') (the hidden server fallback greeting branch; no status or data field tells it apart, so the text value is the contract) can pass if no greeting was read at all; keep it but pair it with a control that the dialog's real text still renders (e.g. toContain of the substituted quest/offer name) or a probability>0 case
- 414 R: talk waits for a greeting text that arrives after the dialog
- 462 R: gossip POI from the selected option marks the point and next is travel
- 492 R: a POI recorded before the option is not attributed to it; next stays undefined

### packages/harness/src/tools/interact-reputation.test.ts
- 73 R: standings arriving with the reward are listed in detail and after.reputation
- 104 R: a standing landing one microtask after rewarded is still kept
- 128 R: no standings gives an empty list
- 143 R: abort during the standing wait rejects AbortError

### packages/harness/src/tools/interact-stable.test.ts
- 133 R: talk lists pets out, stabled pets and free slots from the list request
- 144 R: stable sends the stable request and DONE on stabled
- 152 R: stable with no pet out refuses and sends nothing
- 163 R: buy_slot reply codes map to DONE, FAILED reasons and UNCONFIRMED
- 183 R: unstable by name with no pet out sends unstablePet with the pet id
- 190 R: unstable with a pet out swaps via swapStabledPet
- 199 R: unknown stabled name refuses and lists the stabled pets; nothing sent
- 211 R: duplicate pet names need the line number; the number then resolves
- 226 R: unstable requests the list first when none is known
- 235 R: silent server on the list read refuses unstable
- 247 R: unknown stable code fails with unknown_result
- 255 C packages/harness/src/tools/interact-stable.test.ts:163: exotic reply to FAILED reason is already in the reply-code table
- 263 R: a stable_list for another master does not settle the wait
- 279 R: abort while behind the mutex sends nothing
- 302 R: abort after the send was queued behind the mutex sends nothing (waitResult guard)
- 326 C packages/harness/src/tools/interact-stable.test.ts:302: same shared waitResult abort guard as :302 for another verb
- 350 R: buy_slot reports the balance from the money update before the wait times out
- 382 R: buy_slot still reports DONE when the money update never lands

### packages/harness/src/tools/interact-talents.test.ts
- 80 R: without max_cost the act gets maxCost 0 and the refusal names the price and the confirmed call
- 101 R: with max_cost it resets, reports free points and price, DONE
- 117 R: asserts computed values: free-point count with singular label ('1 point free') and the zero price ('Paid 0 copper'); those are rendered counts/amounts, keep the values; the 3-point/1g path at :101 is a separate case
- 128 R: trainer without the option refuses option_not_offered and sends nothing
- 142 R: NPC opening no gossip also refuses option_not_offered
- 156 F: each outcome asserts reason plus a lowercased prose word ('money', 'no talents'); the reason code already proves the branch, so keep reason and drop the prose toContain; the 'level 10' toContain at :128 is a computed value, keep
- 170 R: silent server gives UNCONFIRMED no_reply
- 177 R: act errors reach the caller
- 184 D: no contract: greps the stringified schema for 'reset_talents' and 'max_cost'; 'non-negative' is never asserted

### packages/harness/src/tools/interact-trainer.test.ts
- 126 R: train learns every affordable spell, skips too_low, reports cost and money change
- 153 F: toBe of the whole sentence 'nothing to learn from <npc> (<ref>) now. Next new spells at level 12.'; drop the sentence and npc/ref echo, keep a toContain('level 12') for the computed next-level number (and a status/after field if present)
- 164 R: talk on a trainer lists spells it teaches now
- 178 R: repair opens the vendor window, settles on repaired, repairCost field
- 195 R: repair with nothing damaged succeeds with repairCost 0
- 212 R: repair at an NPC without the repair role refuses not_repairer
- 224 R: train wires dismountFirst: dismount called once and detail prefixed
- 244 C packages/harness/src/areas/selfstate/dismount-first.test.ts:52: in_flight stop is the shared dismountFirst behaviour; wiring proven by :224

### packages/harness/src/tools/interact-vendor-names.test.ts
- 33 F: timing and after.stock names are the contract; drop the 'Sells:' sentence prefix, keep toContain('Tough Jerky 25 copper') and toContain('Ice Cold Water 25 copper') (looked-up names and computed prices)
- 55 R: buy without what waits for late names and refuses what_needed with a named next
- 65 R: item id form buys the right slot once late names resolve
- 73 C packages/harness/src/tools/interact-vendor-names.test.ts:174: number and name forms already table-tested there; late names covered by :55
- 84 R: abort during the name wait stops talk at the abort time
- 100 R: after the name bound, item <id> picks exactly
- 121 R: item <id> the vendor lacks refuses no_match, not a prefix match
- 174 R: every listed line buys by number, name and item <id>
- 192 R: the Next line of each refusal is itself a valid buy
- 202 R: number past the list does not match an item id
- 209 R: past the bound the refusal Next uses item <id> and resolves

### packages/harness/src/tools/interact-vendor.test.ts
- 44 R: partial name buy settles on the purchase with money and bags in the result
- 67 R: two matches refuse ambiguous_item with ready calls
- 86 R: vendor refusal becomes FAILED with the vendor's reason
- 97 F: drop the 'Sells:' and trailing-period prose; keep toContain of each 'Refreshing Spring Water 25 copper' / 'Tough Hunk of Bread 25 copper' entry (name plus computed price) and after.stock length
- 112 R: sell_junk sells grey items and records them in after.sold
- 158 C packages/harness/src/tools/interact-vendor-names.test.ts:174: line-number form is table-tested there
- 176 R: unanswered buy is UNCONFIRMED and stops at one call
- 195 R: all sales refused FAILED with reason and bags next
- 209 R: sell_junk stops at the first unanswered sale
- 224 R: mixed sold and refused gives PARTLY

### packages/harness/src/tools/interact.test.ts
- 32 R: talk offers rendered as the design example and the window closed once
- 55 F: toBe of the whole sentence 'Velan Brightoak (<ref>) opened no dialog in 3 s.'; drop the sentence and the echoed name/ref, keep toContain('3 s') (seconds computed from ms) and the branch label 'opened no dialog' only because no status or reason separates it; also assert status if one is set
- 67 R: accept selects then accepts the quest and next points at engage
- 91 R: unsupported map asks the human instead of travel; FAILED reason
- 107 R: goal-less quest points the next call at the NPC named in view
- 147 R: goal naming no NPC in view falls back to look(find: questgiver)
- 173 R: accept without what refuses which_quest with numbered offers
- 191 R: turn_in refuses with reward choices, then takes the chosen reward index
- 241 R: completed request-items dialog reads as ready
- 257 R: unfinished request-items dialog reads as incomplete
- 270 R: turn_in from request-items requests the reward then chooses
- 302 R: unfinished request-items turn_in refuses not_complete
- 316 R: reward number past the choices refuses and chooses nothing
- 344 R: NPC out of talk range is walked to first
- 356 R: type-2 object is used, not talked to, and opens the quest window
- 381 R: non quest-giver object refuses without a use

### packages/harness/src/tools/journal-bags-marks.test.ts
- 114 R: non-equippable item gets no wear mark
- 144 R: carried bag compared against equipped bag slots by container size
- 183 R: low durability shown with no item template
- 213 R: full inventory keeps every position retrievable within the line cap
- 259 R: compact mode keeps the buyback line last
- 294 R: level restriction names the level, class restriction names class
- 338 R: equipped gear low durability in Equipped line and after.bags.equipped

### packages/harness/src/tools/journal-bank.test.ts
- 78 R: lists stored items with count, free bank slots and bag slots
- 92 R: empty bank names free slots and deposit/withdraw
- 104 F: asserts openBank property is the same reference, vacuous; spy on openBank and assert not called
- 125 R: 28 stored items still fit the 24-line cap
- 145 R: empty slot rows still yield the true free count
- 170 R: unknown bank reported as unknown

### packages/harness/src/tools/journal-mail.test.ts
- 45 R: lists letter subject, body, money and attachment names within the line cap
- 85 F: name promises the unread flag but asserts only 'empty', which both 'Mail: empty.' and 'Mail: empty, unread waiting.' contain; assert toContain('unread waiting') with unread true and not.toContain('unread') with unread false (the branch label has no other signal)
- 94 F: compares listMail by reference, vacuous; spy on listMail and assert not called

### packages/harness/src/tools/journal-quests-regions.test.ts
- 49 R: objective region named with travel next; quest with no POI says no map region
- 96 R: completed quest names the turn-in region

### packages/harness/src/tools/journal-reputation.test.ts
- 29 R: reputation lines with ranks and war marker; after lists faction names
- 82 R: find with no match answers 'No faction matches'
- 111 F: toBe('read') restates the declared kind; expectSendKind is the real check

### packages/harness/src/tools/journal-spells.test.ts
- 22 R: inactive ranks hidden from the spell list
- 38 R: only cancellable auras are listed; mount aura included
- 66 R: aura lines cap at three plus a '+N more' line
- 81 R: bar slots listed from 1 and capped
- 108 R: auras and bar come before a long spell list within the cap
- 129 R: professions, totem and runes order and after fields
- 182 C packages/harness/src/tools/journal-spells.test.ts:208: profession cap with '+N more' also asserted there with weapons filtered
- 208 R: weapons and racials filtered out of professions; cap line
- 256 R: non-death-knight shows no rune block

### packages/harness/src/tools/journal.test.ts
- 147 R: quest log lines with ids, objectives, status and turnIn field
- 178 R: bags rows name bag, slot and item id with after.bags fields
- 241 R: wear and upgrade marks against the equipped item
- 308 F: name promises low durability but the Equipped row is excluded by slice(2); durability only checked in journal-bags-marks.test.ts:338
- 361 C packages/harness/src/tools/journal-bags-marks.test.ts:259: same last-line Buyback assertion, also under compact mode
- 382 R: no Buyback line when nothing was sold
- 388 R: spell list with cost and cooldown sorted by name
- 419 R: log shows rows since turn start oldest first
- 443 R: find and since:last_turn match a turn-in gain
- 471 R: log names the omitted older rows and respects the limit

### packages/harness/src/tools/look-cast.test.ts
- 72 R: self line channel time left from endsAt
- 82 R: channel time left from startedAt+duration when endsAt is missing
- 92 R: target line and after.targetCast for a cast
- 107 R: channel kind says channelling
- 124 R: another unit's cast is not shown as target's
- 135 R: overdue cast is dropped
- 144 R: unknown spell falls back to spell <id>
- 151 R: no cast and no channel leaves both lines plain

### packages/harness/src/tools/look-danger.test.ts
- 19 R: three identical looks add the loop note
- 30 R: line 2 names target and a running run
- 45 R: attacker replaces the calm line with danger line
- 55 R: threat table marks fightingMe, aggro and threat pct on rows; kind stays read

### packages/harness/src/tools/look-flight.test.ts
- 6 R: find flight_master lists only that role
- 29 R: empty result message
- 36 R: a flight master that left view is still listed by role

### packages/harness/src/tools/look-gray.test.ts
- 17 R: gray hostile marked in row and Nearest hostile
- 28 R: level above gray is not marked

### packages/harness/src/tools/look-movement.test.ts
- 41 R: rooted and slowed words and movement fields
- 63 R: swimming word
- 68 R: default movement adds no words or movement
- 76 R: unit without a motion row is unchanged
- 81 R: faster-than-before run speed is not slowed
- 91 R: root change breaks the unchanged digest and shows on the line

### packages/harness/src/tools/look-objects.test.ts
- 82 R: find object row with kind, quest flag, distance
- 93 R: locked and busy flags rendered
- 123 R: name filter with no match says no objects
- 129 R: within narrows the range

### packages/harness/src/tools/look-quests.test.ts
- 81 R: quest-available mark in row and after.questMark
- 98 R: turn-in and in-progress words
- 115 R: low-level and repeatable words
- 132 R: find questgiver sorts offers and turn-ins in one tier then distance
- 150 R: quest offer outranks a named unit in the cut list

### packages/harness/src/tools/look-remembered.test.ts
- 13 R: questgiver that left view reported by name and role at any distance
- 46 R: find innkeeper includes one that left view
- 63 R: remembered unit states are marked as past

### packages/harness/src/tools/look-saves.test.ts
- 70 R: save and queue share one line with time left
- 84 R: type-6 entry reads as random dungeon
- 96 R: type-1 entry reads as a specific dungeon
- 108 R: no save and no queue add no line
- 112 R: expired save reads as no saves
- 124 R: proposal status also shows the queue line
- 136 R: look output gains the Saved line
- 152 R: look output without save or queue has no such lines

### packages/harness/src/tools/look-self.test.ts
- 42 R: posture words before combat word
- 51 R: stand, dead and unknown add no posture word
- 56 R: mounted word only while mounted
- 65 C packages/harness/src/tools/look-talents.test.ts:44: same count value ('3 talent points free' rendered from freePoints 3) asserted there; the 'after the pose text' ordering is not asserted

### packages/harness/src/tools/look-talents.test.ts
- 44 R: free talent points sentence and after.talentPoints
- 50 R: singular for one point
- 56 R: falls back to the descriptor field without a player block
- 61 R: player block wins over the field
- 66 R: zero or unknown points say nothing

### packages/harness/src/tools/look.test.ts
- 16 R: golden look output within line and byte caps
- 37 R: details after fields and snapshot capture with within
- 57 R: filter with nothing seen answers without a Next line
- 65 R: empty hint names explored bearings and an untried one
- 85 R: out-of-range match names the nearest
- 95 R: within lists 20 rows and cuts at 24 lines
- 118 R: tapped unit marked and skipped for Nearest hostile
- 143 R: all hostiles tapped says none seen
- 156 R: name filter by part of a name
- 168 R: cut list keeps the quest ender and names the rest
- 190 R: human-named unit outranks nearer ones
- 209 R: attacker and hostiles precede questgivers and vendors

### packages/harness/src/tools/loot-quest.test.ts
- 12 R: loot completing a logged quest appends 'Quest N complete' and next turn_in with the ender

### packages/harness/src/tools/loot.test.ts
- 128 R: loots nearest corpse and names pushed items and coin
- 144 R: walks into range when farther than 3 yd
- 158 R: unsupported map asks the human
- 175 R: named corpse without lootable flag refuses not_lootable
- 187 R: no lootable corpse within 30 yd refuses
- 199 R: named corpse over 30 yd refuses too_far with travel next
- 214 R: items left behind give PARTLY bags_full with bags next
- 228 R: loot wires dismountFirst: dismount called once and detail prefixed
- 244 C packages/harness/src/areas/selfstate/dismount-first.test.ts:52: in_flight stop is the shared dismountFirst behaviour; wiring proven by :228

#### Seams
- none found: these tests use exported specs and tool definitions; no test-only exports identified

#### Defects
- journal.test.ts:308 name promises low durability but slice(2) drops the Equipped row that would show it
- interact-stable.test.ts:163 `out instanceof Refusal ? out : out` is a no-op branch

## harness-tools-3

### packages/harness/src/tools/params.test.ts
- 43 R: every tool param carries a description; missing docs leave the agent guessing
- 51 R: design invariant that no call needs more than one required field
- 56 R: look schema accepts design calls, rejects bad find/within
- 68 R: string count coerced, count 11 rejected
- 77 R: required fields journal.about, travel.to, interact.npc
- 89 R: social 255-char text cap and no do required
- 98 R: empty call valid for rest, recover, loot, stop
- 105 R: find with a name fails with the use-name hint via prepareArguments

### packages/harness/src/tools/pilot.test.ts
- 20 R: no_combat_helper refusal before any run starts
- 34 F: final assertion `runs.active() ?? res.runId` is nearly vacuous; assert res.runId and a run started
- 51 R: unsupported_map refusal
- 64 R: dead refusal
- 71 R: bad_objective for neither/both to and circle
- 89 R: report counts decisions, jumps, walked yards past the 200 log cap

### packages/harness/src/tools/recover.test.ts
- 31 F: toBe pins the whole sentence "DONE alive again near your corpse..."; keep values toContain "8766, -6560", "108/217", "0 s" and status DONE, drop the sentence
- 52 F: toBe pins the whole sentence; keep the rounded distance toContain("29 yd") (from 29.3), coords "8763, -6695", HP, corpseYd 29.3; drop the prose
- 81 F: corpse_unreachable FAILED with next spirit_healer; regex pins whole sentences; keep toContain "34 yd" and "resurrection sickness" (healer label), drop "No resurrection offer..." prose
- 103 R: too_far refusal for spirit healer out of range
- 118 R: asserts DONE, via self, looked-up spell name "Reincarnation" and place "at 8766, -6560"; values only, no sentence pinned
- 165 R: "where you died" is the dead-vs-ghost branch label and no status code tells those branches apart; keep with "Reincarnation" (looked-up name)
- 208 F: reason/status asserted; body toContain "Other ways:" is prose beside reason no_self_res; drop it
- 222 F: asserts reason self_res_unanswered; body[1] toContain prose "no-resurrection aura" beside that reason code; drop it
- 239 R: alive refusal
- 247 R: new attacker gives FAILED interrupted with engage next
- 277 F: RUNNING and active run kept; body toEqual pins prose "The human wrote a message..." beside status RUNNING; drop the body assertion

### packages/harness/src/tools/registry.test.ts
- 5 R: duplicate tool names would collide at registration

### packages/harness/src/tools/rest.test.ts
- 108 F: toBe pins the whole sentence; keep toContain "0 s", "Refreshing Spring Water" (item name from state), "HP 200/200", "mana 285/300 (95%)", "4 food"; drop prose
- 146 F: toMatch pins whole detail; keep status DONE, durationMs, "HP 180/200", "mana 300/300 (100%)"; drop the sentence
- 170 F: time_limit PARTLY kept; toStartWith pins prose; keep only toContain(`${REST_MAX_MS / 1000} s`) computed seconds
- 197 F: no_regen PARTLY kept; toBe pins whole detail; keep values "10 s", "HP 100/200", "mana 150/300 (50%)", projected "90%"; drop sentences
- 217 R: eats again when aura ends
- 248 R: no second use when aura never came
- 273 F: no_regen projection rows; keep computed values per row ("mana 240/300 (80%)", "reaches 90%" vs "about 70%"); drop "rested N s without" and "Nothing rose" prose
- 304 F: interrupted FAILED and next engage kept; detail toBe pins the sentence; keep ref, hp value and mapped verb (hit/attack) via toContain, drop the rest
- 357 F: breath_low interrupted with look next kept; detail toBe pins the sentence; keep toContain("8 s") computed breath seconds
- 372 R: in_combat refusal
- 391 R: dead refusal with recover next
- 398 R: mounted rest dismounts first
- 420 R: taxi mount refuses in_flight
- 435 F: RUNNING kept; detail toStartWith pins prose; keep toContain "0 s so far", "HP 100/200", "mana 300/300 (100%)", "at 0, 0"; drop the sentence

### packages/harness/src/tools/social-emote.test.ts
- 49 R: ref resolves, text emote sent, self echo confirms
- 99 R: echo with no target does not confirm targeted emote
- 106 R: echo at another name does not confirm
- 113 R: echo for another emote does not confirm
- 122 R: unrelated self echo does not confirm untargeted emote
- 127 R: stale echo from earlier request cannot confirm later one
- 147 R: echo arriving while act queued does not confirm the later send
- 163 R: positive control: echo for sent request confirms
- 179 R: abort during echo wait releases listeners
- 210 R: pre-aborted call releases listener and sends nothing
- 235 R: without to the emote has no target
- 256 R: echo from another unit does not confirm
- 275 R: no echo gives UNCONFIRMED
- 289 R: unknown_emote REFUSED lists closest names
- 307 R: ready_check refusal
- 323 R: dead refusal
- 338 R: missing_emote refused before send
- 347 R: not_seen target refused before send
- 356 R: aborted run FAILED before send
- 374 F: restates the declared kind flag; assert sequential execution behaviour instead

### packages/harness/src/tools/social.test.ts
- 22 F: toBe pins whole DONE sentence with echoed name and text; assert status DONE and the after fields (already toEqual), drop the sentence
- 45 F: toBe pins 'DONE said: "hello" (echo confirmed)'; echoed text is in after; assert status DONE and after, drop the sentence
- 59 F: toBe pins whole sentence; keep status UNCONFIRMED reason no_answer, toContain("2 s") and the next journal call; drop prose
- 70 F: toBe pins prose with echoed name; assert status FAILED reason player_not_found via result (after already asserted), drop the sentences
- 89 F: toBe pins prose beside reason secret; assert REFUSED reason secret and nothing sent, drop the sentence
- 101 F: toBe pins whole refusals; assert reasons missing_text and missing_name via result, plus next call for whisper; drop prose
- 111 F: toBe pins sentence with echoed name; assert status DONE for the server invite, drop the sentence
- 126 F: toBe pins the sentence; party result word is reason code already_in_group, assert FAILED reason already_in_group, drop prose
- 141 F: toBe pins whole sentence; keep status UNCONFIRMED reason no_answer and toContain("3 s"), drop the prose
- 152 F: toBe pins sentence beside reason nothing_to_accept; assert FAILED reason nothing_to_accept, drop prose
- 166 F: toBe pins sentence; keep status DONE and toContain("Kaelyn") (leader name looked up from group list), drop the sentence
- 183 F: toBe pins prose beside reason not_in_group; assert REFUSED reason not_in_group with leaveGroup not called, drop sentences
- 191 R: worst-case whisper fits line and byte caps

### packages/harness/src/tools/stop.test.ts
- 64 F: toBe pins whole sentence; keep toContain "r1", "engage, 1 of 3 kills" (computed count), "HP 190/217" and the abort; drop prose
- 78 F: toBe pins whole sentence; keep toContain "r1", "1 of 3 kills", "HP 190/217" and halt call; drop prose
- 87 F: toBe pins whole sentence; keep toContain("nothing was running") (branch label, status DONE for both) and "HP 190/217"; drop the rest
- 94 F: toBe pins whole refusal sentence; assert REFUSED reason no_such_run and next stop() via result; drop prose with echoed r7
- 101 F: toEqual of lines pins prose; keep toContain "Springpaw Stalker u1", "0 yd", "88% HP", "HP 190/217" (computed) plus after attackers; drop sentences
- 121 R: stop works while human message waits
- 128 F: pins "Channelling spell 5143"; keep only fallback id value toContain("spell 5143") (no definition, id substituted), add a looked-up name case; drop "Channelling"

### packages/harness/src/tools/travel-explore.test.ts
- 49 F: toMatch pins the sentence prefix; keep status DONE and toContain "20 yd", "north", "Springpaw Stalker L7", "22 yd" (computed values); drop prose
- 67 F: toBe pins whole sentence; keep values "80 yd", "Bristleback L15 30 yd N", boar/larva/gray refs and levels, "2 gray or critter units"; drop prose
- 120 F: toStartWith "explored 40 yd north." duplicates after.traveledYd 40; drop the prose assertion, keep traveledYd and the questgiver stop
- 157 R: for a name stops only on that unit
- 184 F: detail toStartWith pins prose; keep branch label toContain("explored already") with bearing "north" and "0 yd"; drop the sentence
- 203 F: three blocked legs end PARTLY obstructed; toStartWith pins sentence; keep status PARTLY reason obstructed, "3 legs", "0 yd"; drop prose
- 224 F: name claims three bearings, one leg refusal driven; same assertions as 203, assert legs or bearings set
- 240 R: all bearings blocked asks the human
- 263 R: second blocked bearing from same cell asks the human
- 289 R: target_not_observed FAILED with look next
- 306 R: attacked refusal before run
- 321 R: new attacker interrupts within leg

### packages/harness/src/tools/travel-floors.test.ts
- 20 R: asserts cause value, "floor retry" label, ask-human next beside FAILED reason; failed floor retry reports second goTo on nearest floor

### packages/harness/src/tools/travel-fly-stop.test.ts
- 55 R: stop while map reply pending never activates
- 79 R: stop while queued for send never activates

### packages/harness/src/tools/travel-fly.test.ts
- 109 R: fly happy path call order and DONE
- 130 R: settling step 1 yd ahead after landing
- 146 R: unstartable step reported, flight landed
- 160 R: thrown step reported
- 171 R: instant teleport takes no settling step
- 183 R: landing before activate returns still completes
- 198 R: learned reply reopens the map
- 215 C packages/harness/src/tools/travel-fly.test.ts:171: same instant:true activate mock; add DONE assertion there
- 227 R: far flight master walked to before the map opens
- 251 F: only asserts status not DONE; assert the reported status/reason
- 262 R: no_flight_master refusal with look next
- 271 R: walks to nearest known node on this map
- 286 R: nodes beyond 300 yd or other map not walked to
- 295 R: node walk without master still refuses
- 304 R: planFlight refusals map to reasons, never activate
- 321 R: ambiguous destination lists matches
- 338 R: already_there refusal
- 352 R: activate refusal reasons, mounted has no next
- 382 R: activate no_answer UNCONFIRMED
- 391 R: map never shows UNCONFIRMED, no plan
- 401 R: yields RUNNING at 120 s, later call busy
- 418 R: landing wait gives up after cap and releases listener
- 443 R: stopped run releases listener
- 463 R: bare fly asks for destination
- 470 R: in_flight refusal before any act
- 478 D: same expectSendKind(travelTool) check as travel.test.ts:403; keeper packages/harness/src/tools/travel.test.ts:403

### packages/harness/src/tools/travel-hearth.test.ts
- 104 R: cooldown refusal
- 116 R: attacked refusal
- 125 R: in_flight refusal
- 135 R: single use and arrival near home
- 146 R: new_world ends the wait
- 153 R: cast_interrupted refused interrupted
- 170 R: no teleport in time UNCONFIRMED
- 181 R: rejected use becomes use_failed refusal
- 191 R: new attacker interrupts with engage
- 202 R: finished cast without teleport refused after grace
- 220 R: teleport after finished cast still arrives
- 234 R: started far teleport waited for past finished cast

### packages/harness/src/tools/travel-recovery.test.ts
- 65 R: unstick, waypoint, human ladder per refusal code
- 101 R: waypoint arrival names goal again
- 119 R: new goal restarts ladder
- 129 R: tried/not-tried lists after unstick for other refusals

### packages/harness/src/tools/travel-ride.test.ts
- 104 R: board, ride, leave order
- 129 F: keep "Thunder Bluff", the "waiting at the dock" branch label (status RUNNING in both) and the ETA number; drop "expected in about" and "keep waiting" prose
- 161 R: riding updates
- 177 F: yielded dock result; keep status RUNNING, "Thunder Bluff", "waiting at the dock", after.wait; drop "expected in about" and next "keep waiting" prose
- 199 F: human yield at dock; keep RUNNING, "Thunder Bluff", "waiting at the dock"; drop "expected in about" prose
- 222 R: yielded result while aboard keeps riding text
- 238 C packages/harness/src/tools/travel-ride.test.ts:271: same dock-wait-then-board script; 271 adds the decoy transport
- 256 R: walks to dock out of range
- 271 R: boards the serving transport, not decoy
- 289 R: no_route refusal
- 296 R: transport_data_missing without pose
- 305 R: transport_data_missing without node file
- 312 R: already_there refusal
- 320 R: no_stop refusal
- 325 R: stop while riding stays aboard and rejects
- 344 R: leave refusal reported with reason
- 361 R: board refusal reported with reason

### packages/harness/src/tools/travel-structural.test.ts
- 37 F: detail toBe pins sentence; keep "unsupported map 0" and "530" values plus next MAP_ASK and no "travel("; drop prose
- 53 F: next toBe pins whole ask sentence; assert next startsWith 'ask the human:' and no "travel(" in text; drop the sentence
- 66 F: detail toBe pins sentence; keep "3 legs", "0 yd", "position_disagrees_with" (fault code); drop prose, keep the ask next

### packages/harness/src/tools/travel-triggers.test.ts
- 37 R: next trigger named while quest unfinished
- 45 R: no next after last trigger
- 51 R: no next once quest complete

### packages/harness/src/tools/travel-yards.test.ts
- 19 R: yd distance and direction parsing rows
- 38 R: diagonal walks full distance
- 49 R: yard refusal matches coordinate refusal
- 67 R: invalid yard inputs refused before any walk
- 83 R: 200 yd cap accepted
- 90 F: toContain("110") is the rendered point computed from yards; keep it as a value, tighten to "110, 200"

### packages/harness/src/tools/travel.test.ts
- 47 R: arrives at unit
- 59 R: start_off_mesh FAILED with unstick and remembered goal
- 77 F: toEqual of lines pins prose; keep toContain "UNKNOWN_HEIGHT", "Marniel Amberlight" and "Walked 0 yd"; drop sentences
- 93 F: toBe pins whole sentence; keep toContain "planner twice" label and "UNKNOWN_HEIGHT"; drop prose
- 127 R: core refusal codes with step and not-tried lines
- 178 R: two-floor coordinates refuse with floors
- 199 F: detail toBe pins sentence; keep floors "72.6, 80.1", "8764, -6683" and next on own floor; drop prose
- 219 F: toBe pins 'DONE moved 4.8 yd.' sentence; keep toContain("4.8 yd") and next travel(to: "u4"); drop prose
- 243 R: unstick moving 0 yd fails as stuck
- 274 R: failed unstick asks the human
- 292 R: bad_direction refusal before run
- 300 R: corpse while alive refuses
- 307 F: ghost hands over to recovery; toStartWith pins sentence; keep status DONE, "0.0 s", "HP 200/200"; drop prose
- 321 F: RUNNING and active run kept; body toEqual and next toBe pin prose; keep HP/mana/at values and run id in next; drop prose
- 346 R: new attacker interrupts
- 361 F: toEqual of lines pins prose; keep "rooted" (cause label), "0 yd" and next look(); drop sentence
- 385 F: toStartWith pins "you died on the way."; assert status FAILED reason died and the recover next; drop prose
- 403 R: walks to object and stops in range, send kind
- 425 R: flat wide object above walk plane still plans
- 479 R: unit name wins over object name
- 499 R: human stop ends run as cancelled

#### Seams
- packages/harness/src/tools/travel-fly.ts `FLIGHT_WAIT_MS`, travel-hearth.ts `FINISH_GRACE_MS`/`HEARTH_WAIT_MS`/`hearthWork`, rest.ts `REST_MAX_MS`: exported for tests (fake-time windows, direct hearthWork calls)

#### Defects
- none
