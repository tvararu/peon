# Protocol coverage: session (key: session)

Plan index: [2026-09-27-protocol-coverage-plan.md](../2026-09-27-protocol-coverage-plan.md).
Contract: [contract.md](contract.md). Design:
[2026-09-27-protocol-coverage-design.md](../2026-09-27-protocol-coverage-design.md)
(section numbers such as "design 5.18" point into it).

The `session` unit builds the packets that frame a world session rather
than a game system (design 5.18): the login noise the server sends at
auth and at world entry, the ping sequence and keep-alive, login failure,
logout cancel and the auth queue, account data and tutorials, the
character screen (create, delete, rename, customize, faction and race
change, declined names), appearance toggles, played time, realm split and
the barber shop, GM tickets, the GM response and survey, bug and lag
reports, the GM-only opcodes, Warden, the play-time warning and the
cluster redirect pair.

- Phase: 1 for `session-1`, `session-2` and `session-5` (the cheap login
  cleanup that N22 pulls into wave 1); 4 for every other task (wave 4,
  design 5.1).
- Worktree: `proto-session`, created with the command of contract 0.1,
  branch renamed to `proto/area-session`.
- Code areas (design 5.1): `login`, `account`, `charscreen`,
  `appearance`, `tickets`, `guard`. `login` is seeded by `SEED-1`; the
  other five by `SEED-4`.
- Opcodes: 79 rows, 68 relevant (4 stubs, 59 missing, 5 absent) and 11
  dead (design 5.18). The corrections of the research move no opcode into
  or out of this unit. The five absent opcodes (`CMSG_SET_FACTION_CHEAT`,
  `SMSG_PLAY_TIME_WARNING`, `SMSG_LEARNED_DANCE_MOVES`,
  `TC9_CMSG_PREPARE_FOR_REDIRECT`, `TC9_SMSG_READY_FOR_REDIRECT`) reach
  `GameOpcode` in `S0-2` (contract 1.11). No session task edits
  `CORE_OPCODES` or `protocol/opcodes.ts`; this overrides the "one
  `CORE_OPCODES` entry" words of design 5.18 for session-1, -13 and -14.
- No verb, no eval and no `docs/capabilities.md` row (N23). Live proof
  comes from probe flows (T-3) on accounts the task creates. The tasks
  that touch the login path rerun the closest existing scenarios with the
  D17 gates (contract 3.6).
- Owned paths (contract 2.5), for each code area `<a>` above:
  `packages/core/src/wow/areas/<a>/*`,
  `packages/core/test-support/areas/<a>.ts`,
  `packages/harness/src/areas/<a>/*`,
  `packages/devtools/src/probe-flows/<a>-*.ts`, `docs/areas/<a>.md`,
  `docs/protocol-coverage/<a>.md` (regenerated only).
- Leases wanted (contract 2.7, D12, one task at a time):
  `client-connection.ts` (session-2, session-5, session-6), `client.ts`
  (session-2, session-6), `logout.ts` (session-5), `protocol/world.ts`
  (the `SMSG_CHAR_ENUM` parser only, D21; session-6). No task uses the
  lease on harness `runtime/connection.ts` (contract issue 3 below).

## Proposed `owns` per code area

The unit never edits `owns` (contract 2.5); the seed commits write it.
This is the split this plan assumes. If a seed differs, the coordinator
states the new split and the task bodies below follow it.

| Code area | Seed | `owns` (relevant) | `owns` (dead) | `stubs` at seed |
|---|---|---|---|---|
| `login` | `SEED-1` | `SMSG_ADDON_INFO`, `SMSG_CLIENTCACHE_VERSION`, `SMSG_TUTORIAL_FLAGS`, `SMSG_ACCOUNT_DATA_TIMES`, `SMSG_FEATURE_SYSTEM_STATUS`, `SMSG_LEARNED_DANCE_MOVES`, `SMSG_PONG`, `CMSG_KEEP_ALIVE`, `SMSG_CHARACTER_LOGIN_FAILED`, `CMSG_PLAYER_LOGOUT`, `CMSG_LOGOUT_CANCEL`, `SMSG_LOGOUT_CANCEL_ACK` (12) | none | `SMSG_TUTORIAL_FLAGS`, `SMSG_ACCOUNT_DATA_TIMES`, `SMSG_FEATURE_SYSTEM_STATUS` |
| `account` | `SEED-4` | `CMSG_READY_FOR_ACCOUNT_DATA_TIMES`, `CMSG_REQUEST_ACCOUNT_DATA`, `SMSG_UPDATE_ACCOUNT_DATA`, `CMSG_UPDATE_ACCOUNT_DATA`, `SMSG_UPDATE_ACCOUNT_DATA_COMPLETE`, `CMSG_TUTORIAL_FLAG`, `CMSG_TUTORIAL_CLEAR`, `CMSG_TUTORIAL_RESET` (8) | none | none |
| `charscreen` | `SEED-4` | `CMSG_CHAR_CREATE`, `SMSG_CHAR_CREATE`, `CMSG_CHAR_DELETE`, `SMSG_CHAR_DELETE`, `CMSG_SET_PLAYER_DECLINED_NAMES`, `SMSG_SET_PLAYER_DECLINED_NAMES_RESULT`, `CMSG_CHAR_RENAME`, `SMSG_CHAR_RENAME`, `CMSG_CHAR_CUSTOMIZE`, `SMSG_CHAR_CUSTOMIZE`, `CMSG_CHAR_FACTION_CHANGE`, `CMSG_CHAR_RACE_CHANGE`, `SMSG_CHAR_FACTION_CHANGE` (13) | `SMSG_INVALIDATE_PLAYER` | none |
| `appearance` | `SEED-4` | `CMSG_TOGGLE_HELM`, `CMSG_TOGGLE_CLOAK`, `CMSG_SET_SHEATHED`, `CMSG_PLAYED_TIME`, `SMSG_PLAYED_TIME`, `CMSG_REALM_SPLIT`, `SMSG_REALM_SPLIT`, `CMSG_ALTER_APPEARANCE`, `SMSG_ENABLE_BARBER_SHOP`, `SMSG_BARBER_SHOP_RESULT` (10) | none | none |
| `tickets` | `SEED-4` | `CMSG_GMTICKET_SYSTEMSTATUS`, `SMSG_GMTICKET_SYSTEMSTATUS`, `CMSG_GMTICKET_GETTICKET`, `SMSG_GMTICKET_GETTICKET`, `CMSG_GMTICKET_CREATE`, `SMSG_GMTICKET_CREATE`, `CMSG_GMTICKET_UPDATETEXT`, `SMSG_GMTICKET_UPDATETEXT`, `CMSG_GMTICKET_DELETETICKET`, `SMSG_GMTICKET_DELETETICKET`, `SMSG_GMRESPONSE_RECEIVED`, `CMSG_GMRESPONSE_RESOLVE`, `SMSG_GMRESPONSE_STATUS_UPDATE`, `CMSG_GMSURVEY_SUBMIT`, `CMSG_BUG`, `CMSG_GM_REPORT_LAG` (16) | `CMSG_GMTICKETSYSTEM_TOGGLE`, `SMSG_GM_TICKET_STATUS_UPDATE`, `SMSG_GMRESPONSE_DB_ERROR` | none |
| `guard` | `SEED-4` | `CMSG_WORLD_TELEPORT`, `CMSG_WHOIS`, `SMSG_WHOIS`, `CMSG_SET_FACTION_CHEAT`, `SMSG_WARDEN_DATA`, `CMSG_WARDEN_DATA`, `SMSG_PLAY_TIME_WARNING`, `TC9_CMSG_PREPARE_FOR_REDIRECT`, `TC9_SMSG_READY_FOR_REDIRECT` (9) | `CMSG_BOOTME`, `CMSG_DBLOOKUP`, `CMSG_TELEPORT_TO_UNIT`, `MSG_MOVE_TELEPORT_CHEAT`, `CMSG_MOVE_SET_RAW_POSITION`, `SMSG_KICK_REASON`, `SMSG_REDIRECT_CLIENT` | `SMSG_WARDEN_DATA` |

12 + 8 + 13 + 10 + 16 + 9 = 68 relevant; 1 + 3 + 7 = 11 dead.
`SMSG_TUTORIAL_FLAGS` and `SMSG_ACCOUNT_DATA_TIMES` sit in `login`, not
`account`, because they arrive at every login and wave 1 handles them;
`account` reaches `SMSG_ACCOUNT_DATA_TIMES` through `ctx.expect` and
lists it in `uses`.

## Tasks

In order (one task at a time in the unit, contract 0.1):

| Id | Title | codeArea | Phase | Opcodes | Size | Depends on |
|---|---|---|---|---|---|---|
| `session-1` | Login noise | `login` | 1 | 6 | M | item6, `S0-5`, `SEED-1`, `T-2`, `T-3`, `T-4` |
| `session-2` | Ping sequence and keep-alive | `login` | 1 | 2 | S | `session-1`, leases on `client-connection.ts` and `client.ts` |
| `session-5` | Login failure, logout cancel, auth queue | `login` | 1 | 4 | M | `session-2`, leases on `client-connection.ts` and `logout.ts` |
| `session-3` | Account data | `account` | 4 | 5 | M | `session-5`, `SEED-4` |
| `session-4` | Tutorials | `account` | 4 | 3 | S | `session-3` |
| `session-6` | Character screen, create and delete | `charscreen` | 4 | 6 | L | `session-4`, `SEED-4`, leases on `client-connection.ts`, `client.ts`, `protocol/world.ts` (D21); `COORD` for `session.ts` and the probe hook (issues 3, 4) |
| `session-7` | Rename, customize, faction and race change | `charscreen` | 4 | 7 | M | `session-6`, `T-6` |
| `session-8` | Appearance toggles, played time, realm split | `appearance` | 4 | 7 | M | `session-7`, `SEED-4` |
| `session-9` | Barber shop | `appearance` | 4 | 3 | S | `session-8`; the `objects` `use` tool only for the optional chair proof |
| `session-10` | GM ticket reads | `tickets` | 4 | 4 | S | `session-9`, `SEED-4` |
| `session-11` | GM ticket writes | `tickets` | 4 | 6 | M | `session-10` |
| `session-12` | GM response and survey | `tickets` | 4 | 4 | M | `session-11` |
| `session-13a` | Bug and lag reports | `tickets` | 4 | 2 | S | `session-12` |
| `session-13b` | GM-only opcodes | `guard` | 4 | 4 | S | `session-13a`, `SEED-4` |
| `session-14` | Warden, play-time warning, redirect | `guard` | 4 | 5 | M | `session-13b` |

Total: 15 tasks, 68 opcodes (6 + 2 + 4 + 5 + 3 + 6 + 7 + 7 + 3 + 4 + 6 +
4 + 2 + 4 + 5). The design's `session-13` is split into `session-13a`
(`tickets`) and `session-13b` (`guard`), because it spans two code areas
and each part has its own test cycle (contract 0.10). A dependency on
`session-13` means `session-13b`. Inside the unit the tasks run in the
order above; the only hard data dependencies are session-1 before 2, 3,
4 and 5 (the `login` store), session-5 before 6 (the fail-fast login),
6 before 7, 8 before 9, 10 before 11 and 12, and 13b before 14 (the
`guard` files).

The first task of each code area creates its `docs/areas/<a>.md` and
writes the area's `dead` list and dead proof rows: `session-1` (`login`),
`session-3` (`account`), `session-6` (`charscreen`), `session-8`
(`appearance`), `session-10` (`tickets`), `session-13b` (`guard`).

## Contract issues

These are gaps found while planning. The contract is not changed. Each
workaround is a decision **accepted by the maintainer (P2-5)**.

1. **Where the ping loop lives (session-2).** Design 5.18 wants a rising
   `CMSG_PING` sequence and the last round trip as latency. The loop is
   `startPingLoop` in `packages/core/src/wow/client-connection.ts:138-148`,
   started from `client.ts:370` with `config.pingIntervalMs`, and
   `client.test.ts:142-149` runs it at 1 ms. An area runtime has no
   access to `ClientConfig`. The plan keeps the loop in
   `client-connection.ts` under lease and gives it the `login` store:
   `startPingLoop(conn, login, intervalMs)` calls `login.nextPing(now)`,
   which returns `{ seq, latencyMs }` and records `{ seq, sentAt }`. The
   store sends nothing and arms no timer (contract 1.2); the `login` area
   owns `SMSG_PONG`. The alternative, a runtime timer started on
   `login_verified`, was not taken because it moves a working loop, drops
   the `pingIntervalMs` option and changes the order of `worldSession`.
   The 27 s floor of design 5.18 is kept by the 30 s default; the code
   does not reject shorter intervals, because tests use 1 ms.
2. **`SMSG_ADDON_INFO` has no count, and the live body may be empty.**
   The entry count equals the number of addons the server read from
   `CMSG_AUTH_SESSION` (`Server/WorldSession.cpp:1263-1336`). The server
   reads a `u32` decompressed size before the zlib block and gives up
   when it is over 0xFFFFF (`:1268-1278`). Peon writes the zlib block
   right after the digest with no size
   (`packages/core/src/wow/protocol/world.ts:120-122`), so the server
   probably reads the zlib header as the size, registers no addon, and
   sends a body of only the banned count [I: no captured body was read].
   The plan therefore makes the parser count-free: an entry always starts
   with `u8` 2 (state) and `u8` 1 (crcpub), and the banned count that
   follows the list is a small `u32` whose second byte is 0, so the
   parser reads entries while the next two bytes are `02 01`. It needs no
   addon list and no edit to `protocol/world.ts`. The missing size prefix
   in `CMSG_AUTH_SESSION` is a `protocol/world.ts` fix outside every
   session lease: `session-1` reports it with the measured body size and
   does not fix it.
3. **Login failure has no area row.** `contract/log.ts` is frozen after
   `S0-3`, and a refused character login rejects `worldSession` before a
   handle exists, so no area event reaches the router. The named reason
   travels in the error message: `packages/harness/src/runtime/connection.ts`
   already writes `data.error: messageOf(error)` into the `session/lost`
   row of a failed reconnect (`connection.ts:231-239`) and `main.ts:214`
   reports the first failure. So no task takes the `runtime/connection.ts`
   lease. The other rows of design 5.18 go into their area domains:
   `tickets/gm_reply`, `guard/play_time`, `guard/warden`.
4. **The probe has no pre-login flow kind (session-6, session-7).**
   Design 5.18 has session-6 add it, but `packages/devtools/src/probe.ts`
   belongs to `tooling-probe` and is not in contract 2.5 or 2.7. The flow
   needs a stage between `SMSG_CHAR_ENUM` and `CMSG_PLAYER_LOGIN`.
   session-6 asks the coordinator for a `COORD` commit (or a lease) that
   lets a flow module export `stage: "charscreen"` and makes `probe.ts`
   call `characterScreen(config, auth)` and pass the screen to the flow
   instead of logging in. Until that lands, session-6 builds and
   unit-tests everything else and stops as `blocked` on the live step.
5. **`characterScreen` needs a public export.** The probe reaches core
   through `@peon/core/session`, which is
   `packages/core/src/wow/session.ts` (two lines today). It is not in the
   session lease list. session-6 asks for a `COORD` line
   `export { characterScreen } from "#wow/client";` in that file, in the
   same `COORD` commit as issue 4.
6. **Probe flow signature.** T-3 fixes the flow module shape (design
   4.2). This plan names each flow file and its behaviour; the builder
   copies the shape of `packages/devtools/src/probe-flows/login.ts` as
   T-3 lands it. The exact signature could not be determined before T-3
   lands.
7. **Self update fields without a lease.** `player-state.ts` has no
   session lease (contract 2.7). session-8 and session-9 read
   `PLAYER_FIELDS.FLAGS` (`packages/core/src/wow/protocol/update-fields.ts:152`),
   `PLAYER_FIELDS.FIELD_BYTES` (`:153`, the `PLAYER_BYTES` slot),
   `PLAYER_FIELDS.BYTES_2` (`:154`) and `UNIT_FIELDS.BYTES_2` (`:135`)
   from `deps.getEntity(deps.selfGuid())?.rawFields` inside the
   `appearance` store, refreshed from `ctx.listen("entity", ...)`: the
   pattern of `threat.md` contract issue 4.

## Decisions this plan takes

Each is **accepted by the maintainer (P2-5)**.

- S1. `CMSG_SET_FACTION_CHEAT`, `CMSG_BUG`, `CMSG_GM_REPORT_LAG`,
  `CMSG_GMSURVEY_SUBMIT` and every ticket write that succeeds are proven
  by a builder test only and go into `unseen` (N25). No task sends them
  live. The area design's "one live faction-cheat send" is not taken.
- S2. `CMSG_WARDEN_DATA` gets a builder and a builder test and no act.
  It is never sent live (design 5.18 "Never answer `SMSG_WARDEN_DATA`
  in play"). Its proof row is `builder`, marked `unseen`, until the
  maintainer rules on one `MODULE_FAILED` send.
- S3. The ticket loop over SOAP (`ticket complete`, `ticket delete`) is
  not built: T-6 has no such verbs. Ticket replies that need a ticket
  (`SMSG_GMTICKET_CREATE`, `SMSG_GMTICKET_DELETETICKET`,
  `SMSG_GMRESPONSE_RECEIVED`, `SMSG_GMRESPONSE_STATUS_UPDATE`) are
  proven by mock (R22).
- S4. Rows that cannot occur with the default config
  (`SMSG_PLAY_TIME_WARNING`, `TC9_SMSG_READY_FOR_REDIRECT`,
  `SMSG_SET_PLAYER_DECLINED_NAMES_RESULT`, `SMSG_WHOIS`,
  `SMSG_CHARACTER_LOGIN_FAILED`) stay relevant with mock proof (design
  5.18 "Decisions").
- S5. Tasks that change no login-path code (session-3, 4, 8 to 14) run no
  eval rerun. session-1, 2, 5, 6 and 7 rerun `t1-walk-to-npc`,
  `t7-halt-resume` and `t3-ghostlands-kill` with the D17 gates.
- S6. Every free-text field Peon sends in tickets, surveys and reports
  has `|` removed before the send (design 5.18 "Runtime policy").

---

## Task session-1: Login noise

Rulings: SR1-session-2, SR1-session-8, SR1-session-9, SR1-session-11.

**codeArea:** `login`. **Phase:** 1. **Size:** M. **Proof:** live.

**Files:**

- Create: `packages/core/src/wow/areas/login/protocol.ts`,
  `packages/core/src/wow/areas/login/protocol.test.ts`
- Create: `packages/core/src/wow/areas/login/store.ts`,
  `packages/core/src/wow/areas/login/store.test.ts`
- Create: `packages/core/src/wow/areas/login/area.test.ts`
- Create: `packages/core/test-support/areas/login.ts`
- Create: `packages/harness/src/areas/login/area.test.ts`
- Create: `docs/areas/login.md`
- Modify: `packages/core/src/wow/areas/login/area.ts` (seeded by
  `SEED-1`), `packages/core/src/wow/areas/login/opcodes.ts` (delete the
  three `stubs` lines; never `owns`)
- Modify: `packages/harness/src/areas/login/area.ts` (seeded by `SEED-1`)
- Regenerate: `docs/protocol-coverage/login.md` with `mise protocol:coverage`

**Depends on:** item6, `S0-5` (the area mechanism, `areaRig`, and the
absent opcodes of `S0-2`), `SEED-1` (the `login` seed), `T-2` (the tap:
it records handled and unhandled per opcode), `T-3` (the probe and its
`login` flow), `T-4` (cite-check).

**Opcodes:** `SMSG_ADDON_INFO` (0x2EF), `SMSG_CLIENTCACHE_VERSION`
(0x4AB), `SMSG_TUTORIAL_FLAGS` (0x0FD, stub), `SMSG_ACCOUNT_DATA_TIMES`
(0x209, stub), `SMSG_FEATURE_SYSTEM_STATUS` (0x3C9, stub),
`SMSG_LEARNED_DANCE_MOVES` (0x455, absent before `S0-2`).

**Wire** (AzerothCore wins over wowm):

- 0x2EF (`Server/WorldSession.cpp:1352-1414`): per addon `u8` state
  (always 2), `u8` crcpub (always 1), then if crcpub a `u8` usepk (1 when
  the addon CRC is not `0x4c1c776d`, `Addons/AddonMgr.h:57`), 256 key
  bytes when usepk, `u32` 0; after the list a `u32` banned count and 44
  bytes per banned addon (`u32` id, 16-byte name MD5, 16-byte version
  MD5, `u32` timestamp, `u32` 1; `:1399-1411`). The list has no count; it
  has one entry per addon the server read from `CMSG_AUTH_SESSION`,
  possibly none (contract issue 2). wowm
  (`login_logout/smsg_addon_info.wowm:81`) fixes each entry at 8 bytes;
  AzerothCore wins.
- 0x4AB: `u32` version (`Handlers/AuthHandler.cpp:56-61`).
- 0x0FD: `u32[8]` (`Server/WorldSession.cpp:1084-1090`).
- 0x209: `u32` server time, `u8` 1, `u32` mask, then one `u32` time per
  set bit among the 8 account-data types (`Server/WorldSession.cpp:1057-1066`).
  At world entry the mask is the per-character mask 0xEA
  (`Handlers/CharacterHandler.cpp:834`).
- 0x3C9: `u8` complaint status (2), `u8` voice (0)
  (`Handlers/CharacterHandler.cpp:836-839`).
- 0x455: `u32` 0, `u32` 0 (`Handlers/CharacterHandler.cpp:882-885`), the
  last packet of the world-entry set.
- The auth-time trio (0x2EF, 0x4AB, 0x0FD) goes out once per world
  session, before the character list, only when cluster mode is off
  (`Server/WorldSession.cpp:1624-1629`). `registerWorldHandlers` runs
  before `connectWorld` (`packages/core/src/wow/client.ts:365,398`), so
  the area's handlers see them.

**Steps:**

- [ ] **Step 1: Write the packet builders.** In
  `packages/core/test-support/areas/login.ts`: `loginAddonInfoBody({
  entries, banned })` (each entry `{ usePk: boolean }`, a key of 256
  bytes written when `usePk`), `loginClientCacheVersionBody({ version })`,
  `loginTutorialFlagsBody({ flags })` (eight `u32`),
  `loginAccountDataTimesBody({ serverTime, mask, times })`,
  `loginFeatureSystemStatusBody({ complaints, voice })` and
  `loginLearnedDanceMovesBody()`, each returning `Uint8Array` from a
  `PacketWriter`, in the field order of the AzerothCore writers above.
- [ ] **Step 2: Write the failing parser tests** in `protocol.test.ts`:
  - `parseAddonInfo(reader)` reads 23 entries where 19 carry a key and
    4 do not, returns `{ addons: { state, keyed }[], banned: { id }[] }`
    and leaves the reader at its end; a 4-byte body (no entry, banned
    count 0) returns no addons; a body with two banned entries returns
    two ids; a body whose entry does not start `02 01` and is not a
    valid banned count throws (contract issue 2).
  - `parseAccountDataTimes` returns `{ serverTime, mask, times }` where
    `times` has one entry per set bit, for masks 0xEA and 0x15.
  - `parseTutorialFlags`, `parseClientCacheVersion`,
    `parseFeatureSystemStatus`, `parseLearnedDanceMoves` return the fields
    above.
  Run `mise test packages/core/src/wow/areas/login/protocol.test.ts` and
  see it fail on the missing module.
- [ ] **Step 3: Implement the parsers** in `protocol.ts`. Do not sort keys in object literals that read packets.
- [ ] **Step 4: Write the failing store tests.** Over
  `new LoginStore(deps)`: each packet fills its part of `LoginState`;
  the `login_noise` event fires once, on the first 0x455 after the other
  world-entry packets, with `{ addons, keyed, cacheVersion, complaints,
  voice }`; a second 0x455 (a reconnect in the same session) does not
  fire it again; `account_data_times` fires on each 0x209 with its mask.
- [ ] **Step 5: Implement the store.** `store.ts` exports:

  ```ts
  export type LoginState = {
    addons: { count: number; keyed: number; banned: number } | undefined;
    cacheVersion: number | undefined;
    tutorials: readonly number[] | undefined;
    accountDataTimes:
      | { serverTime: number; mask: number; times: readonly (readonly [type: number, time: number])[] }
      | undefined;
    features: { complaints: number; voice: number } | undefined;
    danceMoves: readonly [number, number] | undefined;
  };
  export type LoginEvent =
    | { type: "login_noise"; addons: number; keyed: number; cacheVersion: number; complaints: number; voice: number }
    | { type: "account_data_times"; mask: number };
  export class LoginStore { /* AreaStore<LoginState, LoginEvent> */ }
  ```

  `session-2` and `session-5` extend both types. The emitter is a plain
  `new Emitter()` (contract 1.2).
- [ ] **Step 6: Register.** `area.ts`: `on` for the six opcodes;
  `eventTypes: ["login_noise", "account_data_times"]`;
  `store: (deps) => new LoginStore(deps)`. `opcodes.ts`: delete the three
  `stubs` lines. No runtime yet.
- [ ] **Step 7: Area test.** `area.test.ts` over `areaRig("login")`:
  inject each packet from the step 1 builders in the server's order (the
  auth trio, then 0x209, 0x3C9, 0x455) and check `rig.handle.state()` and
  the events. Run the reviewer's revert check once: without
  `protocol.ts` and `store.ts` the tests fail.
- [ ] **Step 8: Harness rules.** In `packages/harness/src/areas/login/area.ts`
  add `rules: () => ({ event: () => [] })` for `login_noise` and
  `account_data_times`, so no fallback row is written for login noise
  (design 5.18 "Verbs": handling them only removes their
  `notice/not_implemented` rows). `worldActs: []`. `area.test.ts` checks
  both events return `[]`.
- [ ] **Step 9: Live proof.** From the worktree root:
  1. `mise factory soap create eversong10` (note the account).
  2. `mise protocol:probe <ACCOUNT> --flow login --expect SMSG_ADDON_INFO
     --expect SMSG_CLIENTCACHE_VERSION --expect SMSG_TUTORIAL_FLAGS
     --expect SMSG_ACCOUNT_DATA_TIMES --expect SMSG_FEATURE_SYSTEM_STATUS
     --expect SMSG_LEARNED_DANCE_MOVES --wait 5`. Exit 0 and a trace in
     which all six rows are `handled` and no notice names any of them
     prove the six live. Record the size of the 0x2EF row from the T-2
     trace, the addon count and `keyed` count, the cache version, and
     whether `SMSG_WARDEN_DATA` arrived (it settles whether Warden is
     on, for `session-14`). If the 0x2EF body is 4 bytes, the server
     read no addon from Peon's `CMSG_AUTH_SESSION` (contract issue 2):
     say so in the report for the coordinator, and do not change
     `protocol/world.ts`.
  3. `mise factory soap delete <ACCOUNT>`.
  No `soap gm` command. If the server or SOAP is down, report it and
  stop (contract 0.6).
- [ ] **Step 10: Eval rerun** (S5, contract 3.6): `mise eval run
  t1-walk-to-npc --round <n>`, `mise eval run t7-halt-resume --round <n>`,
  `mise eval run t3-ghostlands-kill --round <n>`. Gates (D17):
  `t1-walk-to-npc` passes; `t7-halt-resume` passes or fails only with the
  known stale `life/low_health` wake, quoted by the grader;
  `t3-ghostlands-kill` shows no failure cause the R0 baseline did not
  show. Record each verdict in the report.
- [ ] **Step 11: Write `docs/areas/login.md`** with the fixed headings of
  contract 3.8, present tense, no dates:
  - Wire notes: the `SMSG_ADDON_INFO` layout against
    `login_logout/smsg_addon_info.wowm:81`; the entry count is the
    number of addons the server read from `CMSG_AUTH_SESSION`, and the
    measured live count (zero if the body was 4 bytes, because Peon's
    auth body has no addon size, `Server/WorldSession.cpp:1268-1278`);
    the auth trio is once per world session.
  - Left out: none yet (later tasks fill it).
  - Capabilities row: "No verb (N23)".
  - Proof: six `live` rows, evidence "probe flow `login`, exit 0",
    sources `Server/WorldSession.cpp:1352-1414`,
    `Handlers/AuthHandler.cpp:56-61`, `Server/WorldSession.cpp:1084-1090`,
    `Server/WorldSession.cpp:1057-1066`,
    `Handlers/CharacterHandler.cpp:836-839`,
    `Handlers/CharacterHandler.cpp:882-885`.
  Run `mise protocol:cite-check` and `mise lint:docs`.
- [ ] **Step 12: Checks.** `mise protocol:coverage`, `mise typecheck
  core`, `mise typecheck harness`, `mise lint
  packages/core/src/wow/areas/login`, `mise ci:checks`.
- [ ] **Step 13: Commit.** `git add` the paths above, then
  `mise exec -- git commit`:

  ```
  feat: Read the login noise packets

  Six packets arrive at every login and were reported as not
  implemented, which buried real gaps in every report. The login area
  now reads them and keeps the addon, cache and tutorial state.
  ```

---

## Task session-2: Ping sequence and keep-alive

Rulings: SR1-session-1, SR1-session-5, SR1-session-6, SR1-session-9, SR1-session-11.

**codeArea:** `login`. **Phase:** 1. **Size:** S. **Proof:** live
(`SMSG_PONG`) and accepted (`CMSG_KEEP_ALIVE`).

**Files:**

- Modify: `packages/core/src/wow/areas/login/protocol.ts` and test,
  `store.ts` and test, `area.ts` and `area.test.ts`
- Create: `packages/core/src/wow/areas/login/runtime.ts`,
  `packages/core/src/wow/areas/login/runtime.test.ts`
- Modify: `packages/core/test-support/areas/login.ts`
- Modify (lease): `packages/core/src/wow/client-connection.ts`
  (`startPingLoop` only) and its colocated test
- Modify (lease): `packages/core/src/wow/client.ts` (the one
  `startPingLoop` call, `:370`) and `client.test.ts` (`:142-149`)
- Modify: `packages/harness/src/areas/login/area.ts` and test
- Modify: `docs/areas/login.md`
- Regenerate: `docs/protocol-coverage/login.md`

**Depends on:** `session-1`; the leases on `client-connection.ts` and
`client.ts`.

**Opcodes:** `SMSG_PONG` (0x1DD), `CMSG_KEEP_ALIVE` (0x407). Body gap:
`CMSG_PING` (core-sent, not owned).

**Wire:** `SMSG_PONG` is a `u32` echo of the ping's first field
(`Server/WorldSocket.cpp:799-801`). `CMSG_PING` is `u32` sequence, `u32`
latency; AzerothCore stores the latency for the session
(`Server/WorldSocket.cpp:748-749,791`). A ping less than 27 s after the
previous one counts as over-speed, and the server kicks after
`MaxOverspeedPings` of them (`Server/WorldSocket.cpp:762-777`).
`CMSG_KEEP_ALIVE` is empty; the socket layer resets the idle timer and
sends nothing (`Server/WorldSocket.cpp:452-462`).

**Steps:**

- [ ] **Step 1: Write the failing tests.**
  - `protocol.test.ts`: `parsePong` returns `{ seq }`;
    `buildKeepAlive()` returns an empty body.
  - `store.test.ts`: `nextPing(now)` returns sequence 1, then 2, with
    `latencyMs` 0 before any pong; a pong for sequence 1 at `sentAt + 40`
    sets `rttMs` 40 and `lastPongAt`, removes the pending entry and emits
    `pong` `{ seq: 1, rttMs: 40 }`; the next `nextPing` carries latency
    40; a pong for an unknown sequence changes nothing and emits nothing;
    at most 8 pings stay pending (the oldest is dropped).
  - `client-connection` test: `startPingLoop(conn, login, 1)` with a fake
    timer writes `CMSG_PING` bodies with sequences 1 and 2.
  - `runtime.test.ts` over `areaRig("login")`: `act.keepAlive()` records
    one `CMSG_KEEP_ALIVE` with an empty body in `rig.sent`.
  Run the four files and see them fail.
- [ ] **Step 2: Implement.** `LoginState` gains
  `link: { lastSeq: number; rttMs: number | undefined; lastPongAt: number | undefined }`;
  `LoginEvent` gains `{ type: "pong"; seq: number; rttMs: number }`;
  `LoginStore` gains `nextPing(now): { seq: number; latencyMs: number }`.
  `runtime.ts` exports `loginRuntime(ctx, store)` returning
  `{ act: { keepAlive }, dispose }` with
  `LoginActs = { keepAlive: () => void }`. `area.ts` registers
  `SMSG_PONG` and adds `runtime: loginRuntime`.
  `startPingLoop(conn, login, intervalMs)` takes `stores.areas.login`
  (contract issue 1) and writes `seq` and `latencyMs` from `nextPing`;
  `client.ts:370` passes `stores.areas.login`. The default stays 30 s.
- [ ] **Step 3: Harness rule.** The `login` harness module returns `[]`
  for `pong` (one event every 30 s would write a fallback row each time).
- [ ] **Step 4: Live proof.**
  1. `mise factory soap create eversong10`.
  2. `mise protocol:probe <ACCOUNT> --flow login --expect SMSG_PONG --wait
     70 --bodies`. Exit 0, two `CMSG_PING` `out` rows whose bodies start
     with sequences 1 and 2, and two `SMSG_PONG` rows that echo them prove
     the sequence live. Record the round trips from
     `handle.login.state().link` as the flow prints it.
  3. `mise protocol:probe <ACCOUNT> --send CMSG_KEEP_ALIVE --expect
     SMSG_PONG --wait 40`. The session stays up and a later pong arrives:
     `CMSG_KEEP_ALIVE` is `accepted`.
  4. `mise factory soap delete <ACCOUNT>`.
- [ ] **Step 5: Eval rerun** with the gates of `session-1` step 10.
- [ ] **Step 6: Records.** `docs/areas/login.md`: `SMSG_PONG` `live`
  (probe `login --wait 70`, source `Server/WorldSocket.cpp:799-801`),
  `CMSG_KEEP_ALIVE` `accepted` (source `Server/WorldSocket.cpp:452-462`);
  a wire note on the 27 s over-speed rule. `mise protocol:coverage`,
  `mise protocol:cite-check`, `mise ci:checks`.
- [ ] **Step 7: Commit.**

  ```
  feat: Send a real ping sequence and read pongs

  Every ping carried sequence 0 and latency 0, so pongs could not be
  matched and the server never learned the client's latency. Pings now
  count up, report the last round trip, and the login area keeps it.
  ```

---

## Task session-5: Login failure, logout cancel, auth queue

Rulings: SR1-session-3, SR1-session-4, SR1-session-6, SR1-session-7, SR1-session-10, SR1-session-11.

**codeArea:** `login`. **Phase:** 1. **Size:** M. **Proof:** live
(`CMSG_LOGOUT_CANCEL`, `SMSG_LOGOUT_CANCEL_ACK`), accepted
(`CMSG_PLAYER_LOGOUT`) and mock (`SMSG_CHARACTER_LOGIN_FAILED`, the queue
form of `SMSG_AUTH_RESPONSE`).

**Files:**

- Modify: `packages/core/src/wow/areas/login/protocol.ts` and test,
  `store.ts` and test, `runtime.ts` and test, `area.ts` and
  `area.test.ts`
- Modify: `packages/core/test-support/areas/login.ts`
- Modify (lease): `packages/core/src/wow/client-connection.ts`
  (`authenticateWorld`, `selectCharacter`) and its colocated test
- Modify (lease): `packages/core/src/wow/logout.ts` and `logout.test.ts`
  (create the test if none exists)
- Create: `packages/devtools/src/probe-flows/login-logout-cancel.ts`
  (and its test, if T-3 gives flows tests)
- Modify: `docs/areas/login.md`
- Regenerate: `docs/protocol-coverage/login.md`

**Depends on:** `session-2`; the leases on `client-connection.ts` and
`logout.ts`.

**Opcodes:** `SMSG_CHARACTER_LOGIN_FAILED` (0x041), `CMSG_PLAYER_LOGOUT`
(0x04A), `CMSG_LOGOUT_CANCEL` (0x04E), `SMSG_LOGOUT_CANCEL_ACK` (0x04F).
Body gaps: `SMSG_AUTH_RESPONSE` (the queue status) and
`SMSG_LOGOUT_RESPONSE` (the refusal reason), both core-handled, not
owned.

**Wire:**

- 0x041: `u8` `LoginFailureReason` 0-8
  (`Handlers/CharacterHandler.cpp:2622-2627`;
  `src/server/shared/SharedDefines.h:4001-4012`: failed, no world,
  duplicate character, no instances, disabled, no character, locked for
  transfer, locked by billing, using remote). wowm
  (`character_screen/smsg_character_login_failed.wowm:3`) reads a
  `WorldResult`; AzerothCore wins.
- 0x04A: empty; the handler body is empty
  (`Handlers/MiscHandler.cpp:476-478`).
- 0x04E: empty; the server answers 0x04F (empty), then unroots and
  stands the character (`Handlers/MiscHandler.cpp:480-497`).
- `SMSG_AUTH_RESPONSE` 0x1B `AUTH_WAIT_QUEUE`
  (`src/server/shared/SharedDefines.h:3599`): the first one is the long
  form with a `u32` queue position (`Server/WorldSessionMgr.cpp:258`,
  `Handlers/AuthHandler.cpp:23-53`); later ones are `u8` 0x1B, `u32`
  position, `u8` 0, and admission is a short `u8` 0x0C `AUTH_OK`
  (`Server/WorldSession.cpp:979-995`).
- `SMSG_LOGOUT_RESPONSE` reason: 1 in combat, 2 duel, frozen or AFK in a
  sanctuary, 3 jumping or falling (`Handlers/MiscHandler.cpp:435-441`).

**Steps:**

- [ ] **Step 1: Write the failing tests.**
  - `protocol.test.ts`: `parseCharacterLoginFailed` returns
    `{ code, reason }` with `reason` one of the nine names and `unknown`
    for code 12, without throwing; `buildPlayerLogout()` and
    `buildLogoutCancel()` return empty bodies.
  - `store.test.ts`: 0x041 emits `login_failed` `{ code, reason }`; 0x04F
    emits `logout_cancelled`.
  - `runtime.test.ts` over `areaRig("login")`: `act.cancelLogout()`
    records one `CMSG_LOGOUT_CANCEL` and resolves when an injected 0x04F
    arrives; with no reply it rejects with `timeout` after 5 s (fake
    timers inside `try`/`finally`); `act.playerLogout()` records one
    `CMSG_PLAYER_LOGOUT` and resolves at once.
  - `client-connection` test, over a real `OpcodeDispatch` fed with
    `dispatch.handle()`: `selectCharacter` rejects with
    "Character login failed: no world" as soon as a 0x041 with code 1
    arrives, not after the 10 s `waitLogin` timeout
    (`packages/core/src/wow/self-store.ts:13,47`); `authenticateWorld`
    on a long-form 0x1B keeps waiting, then resolves on a short 0x0C; on
    0x1D it rejects naming "already online" (codes named from
    `src/server/shared/SharedDefines.h:3584-3601`).
  - `logout.test.ts`: `requestLogout` on a response with result 1
    resolves `"refused"` and reports reason `in_combat` through the new
    `reason` field.
  Run each file and see it fail.
- [ ] **Step 2: Implement.**
  - `LoginEvent` gains `{ type: "login_failed"; code: number; reason: string }`
    and `{ type: "logout_cancelled" }`; `LoginActs` gains
    `cancelLogout: () => Promise<void>` (a send, then
    `ctx.until((e) => e.type === "logout_cancelled", { timeoutMs: 5000 })`)
    and `playerLogout: () => void`. `area.ts` registers 0x041 and 0x04F.
  - `selectCharacter` races `stores.self.waitLogin()` against
    `conn.dispatch.expect(GameOpcode.SMSG_CHARACTER_LOGIN_FAILED)` and
    parses the reason with `parseCharacterLoginFailed` from
    `#wow/areas/login/protocol`. A waiter resolves alongside the owner
    (`protocol/world.ts:239-262`), so no store coupling is needed. If a
    lint rule refuses a legacy import of an area module, stop as
    `blocked` and name the rule.
  - `authenticateWorld`: on 0x1B read the position and expect the next
    `SMSG_AUTH_RESPONSE` again, up to a 10-minute queue cap [I: the
    server sends a new position only when it changes,
    `Server/WorldSessionMgr.cpp:304`]; name the codes from
    `SharedDefines.h` instead of the two names at
    `client-connection.ts:98-101`.
  - `logout.ts`: `requestLogout` resolves
    `{ outcome: LogoutOutcome; reason?: LogoutRefusal }`, where
    `LogoutRefusal` is `"in_combat" | "duel_or_frozen" | "falling" |
    "unknown"`. `client.ts:384` ignores the value, so it does not change.
- [ ] **Step 3: Write the probe flow.**
  `probe-flows/login-logout-cancel.ts`, in the shape T-3 gives
  `login.ts`: send `CMSG_LOGOUT_REQUEST` through the probe's sender,
  wait 2 s, call `handle.login.act.cancelLogout()`, then wait 25 s and
  check the session is still up. It records `SMSG_LOGOUT_RESPONSE` and
  0x04F from the probe's received list.
- [ ] **Step 4: Live proof.**
  1. `mise factory soap create eversong10` **without** `--gm` (a GM
     account logs out at once, so there is no timer to cancel:
     `data/sql/base/db_auth/rbac_linked_permissions.sql:53`,
     `Handlers/MiscHandler.cpp:423-424`). The preset spawn is outside an
     inn [I: if the flow sees `instant` 1 in the logout response, record
     it and move the character one step with the `nearest` flow first].
  2. `mise protocol:probe <ACCOUNT> --flow login-logout-cancel --expect
     SMSG_LOGOUT_CANCEL_ACK --wait 40`. Exit 0 proves 0x04E and 0x04F.
  3. `mise protocol:probe <ACCOUNT> --send CMSG_PLAYER_LOGOUT --expect
     SMSG_PONG --wait 40`. The session stays up: 0x04A is `accepted`
     (N24).
  4. `mise factory soap delete <ACCOUNT>`.
  `SMSG_CHARACTER_LOGIN_FAILED` has no on-demand path (it needs the
  realm login disabled or a reconnect race,
  `Handlers/CharacterHandler.cpp:685,713`): its proof is the `areaRig`
  test and the `selectCharacter` test, built from
  `Handlers/CharacterHandler.cpp:2622-2627`. The queue form is proven
  the same way from `Server/WorldSession.cpp:979-995`.
- [ ] **Step 5: Eval rerun** with the gates of `session-1` step 10.
- [ ] **Step 6: Records.** `opcodes.ts`:
  `unseen: ["SMSG_CHARACTER_LOGIN_FAILED"]`. `docs/areas/login.md`: rows
  for 0x041 (`mock`, source `Handlers/CharacterHandler.cpp:2622-2627`),
  0x04A (`accepted`, `Handlers/MiscHandler.cpp:476-478`), 0x04E and 0x04F
  (`live`, flow `login-logout-cancel`, `Handlers/MiscHandler.cpp:480-497`);
  wire notes on `LoginFailureReason` against wowm and on the queue form;
  "Left out" names 0x041 as not seen live and why.
  `mise protocol:coverage`, `mise protocol:cite-check`, `mise ci:checks`.
- [ ] **Step 7: Commit.** If the probe flow lands first, its subject is
  `chore: Add the logout cancel probe flow`.

  ```
  feat: Name login failures and cancel a logout

  A refused character login showed only as a 10 s timeout, and a queued
  realm failed the login outright. Login now fails at once with the
  server's reason, waits in the queue, and a logout can be cancelled.
  ```

---

## Task session-3: Account data

**codeArea:** `account`. **Phase:** 4. **Size:** M. **Proof:** live.

**Files:**

- Create: `packages/core/src/wow/areas/account/protocol.ts`, `store.ts`,
  `runtime.ts`, each with its test, and `area.test.ts`
- Modify: `packages/core/src/wow/areas/account/area.ts` (seeded by
  `SEED-4`), `packages/core/src/wow/areas/account/opcodes.ts` (`uses`)
- Create: `packages/core/test-support/areas/account.ts`
- Create: `packages/devtools/src/probe-flows/account-data.ts`
- Create: `docs/areas/account.md`
- Regenerate: `docs/protocol-coverage/account.md`

**Depends on:** `session-5` (unit order), `session-1` (the `login` owner
of `SMSG_ACCOUNT_DATA_TIMES`), `SEED-4`.

**Opcodes:** `CMSG_READY_FOR_ACCOUNT_DATA_TIMES` (0x4FF),
`CMSG_REQUEST_ACCOUNT_DATA` (0x20A), `SMSG_UPDATE_ACCOUNT_DATA` (0x20C),
`CMSG_UPDATE_ACCOUNT_DATA` (0x20B), `SMSG_UPDATE_ACCOUNT_DATA_COMPLETE`
(0x463).

**Wire** (all `Handlers/MiscHandler.cpp`):

- 0x4FF: empty; the reply is `SMSG_ACCOUNT_DATA_TIMES` with the global
  mask 0x15 (`:1624-1630`).
- 0x20A: `u32` type 0-7; types 8 and up are dropped silently
  (`:863-893`).
- 0x20C: `u64` player guid (0 at the character screen), `u32` type,
  `u32` time, `u32` decompressed size, zlib bytes, empty when the size is
  0 (`:885-892`). wowm (`login_logout/smsg_update_account_data.wowm:2`)
  has no guid, time or size; AzerothCore wins.
- 0x20B: `u32` type, `u32` time, `u32` decompressed size, zlib bytes;
  size 0 erases the type; a size over 0xFFFF is dropped (`:810-861`,
  `:832-837`).
- 0x463: `u32` type, `u32` 0 (`:824-827`, `:857-860`).

**Steps:**

- [ ] **Step 1: Builders.** `accountUpdateAccountDataBody({ guid, type,
  time, text })` (deflates `text`) and
  `accountUpdateAccountDataCompleteBody({ type })` in
  `packages/core/test-support/areas/account.ts`.
- [ ] **Step 2: Write the failing tests.**
  - `protocol.test.ts`: `parseUpdateAccountData` returns `{ guid, type,
    time, text }` and inflates the tail; a size of 0 returns `text: ""`;
    `buildUpdateAccountData({ type, time, text })` writes the size and a
    zlib stream that inflates back to `text`; an empty `text` writes size
    0 and no bytes; a text over 0xFFFF bytes throws;
    `buildRequestAccountData(type)` refuses types outside 0-7.
  - `store.test.ts`: 0x20C stores `{ time, text }` per type and emits
    `account_data`; 0x463 emits `account_data_saved` `{ type }`.
  - `runtime.test.ts` over `areaRig("account")`:
    `act.readyForAccountDataTimes()` sends 0x4FF and resolves with the
    mask of an injected `SMSG_ACCOUNT_DATA_TIMES` (owned by `login`,
    listed in `uses`, reached through `ctx.expect`);
    `act.accountData(7)` sends 0x20A with type 7 and resolves with the
    text of the matching 0x20C; `act.saveAccountData(7, time, "peon")` and
    `act.eraseAccountData(7)` resolve on the matching 0x463; each rejects
    with `timeout` after 5 s.
  Run them and see them fail.
- [ ] **Step 3: Implement.** `AccountState = { data: readonly { type:
  number; time: number; text: string }[]; lastSaved: number | undefined }`;
  `AccountEvent` = `account_data` `{ type, time, bytes }` and
  `account_data_saved` `{ type }`; `AccountActs = {
  readyForAccountDataTimes, accountData, saveAccountData,
  eraseAccountData }`. zlib: use `inflateSync` and `deflateSync` from
  `node:zlib`, as `packages/core/src/wow/protocol/remote-movement.ts:1,161`
  does (no new dependency). If the import scan of contract 1.12 refuses
  `node:zlib` in an area source, stop as `blocked`. `opcodes.ts`:
  `uses: ["SMSG_ACCOUNT_DATA_TIMES"]`.
- [ ] **Step 4: Probe flow.** `probe-flows/account-data.ts`:
  `readyForAccountDataTimes()`, `saveAccountData(7, now, "peon")`,
  `accountData(7)` (the text must equal `"peon"`), then
  `eraseAccountData(7)` and `accountData(7)` (the text must be empty).
  Type 7 is a per-character type (mask 0xEA holds bit 7); the flow
  touches no other type.
- [ ] **Step 5: Live proof.** `mise factory soap create eversong10`;
  `mise protocol:probe <ACCOUNT> --flow account-data --expect
  SMSG_UPDATE_ACCOUNT_DATA --expect SMSG_UPDATE_ACCOUNT_DATA_COMPLETE
  --wait 10`; exit 0 proves all five. The data lives only on the
  worker's own account, and the flow erases it; `mise factory soap
  delete <ACCOUNT>`.
- [ ] **Step 6: Write `docs/areas/account.md`** (contract 3.8): wire notes
  on the 0x20C layout against wowm and on the size prefix of 0x20B
  (whether wowm's `compressed` array carries it could not be determined;
  AzerothCore wins); "Left out": none; "Capabilities row": "No verb
  (N23)"; five `live` rows, flow `account-data`, sources `:1624-1630`,
  `:863-893`, `:885-892`, `:810-861`, `:824-827` (each written with the
  `Handlers/MiscHandler.cpp` prefix). `mise protocol:cite-check`,
  `mise lint:docs`, `mise protocol:coverage`, `mise ci:checks`.
- [ ] **Step 7: Commit.**

  ```
  feat: Read and save account data

  The server keeps the client's saved UI settings per account and Peon
  could neither read nor write them. The account area now requests,
  saves and erases one type and waits for the server's answer.
  ```

---

## Task session-4: Tutorials

**codeArea:** `account`. **Phase:** 4. **Size:** S. **Proof:** live.

**Files:**

- Modify: `packages/core/src/wow/areas/account/protocol.ts`, `runtime.ts`
  and their tests
- Create: `packages/devtools/src/probe-flows/account-tutorials.ts`
- Modify: `docs/areas/account.md`
- Regenerate: `docs/protocol-coverage/account.md`

**Depends on:** `session-3`.

**Opcodes:** `CMSG_TUTORIAL_FLAG` (0x0FE), `CMSG_TUTORIAL_CLEAR`
(0x0FF), `CMSG_TUTORIAL_RESET` (0x100).

**Wire:** 0x0FE is a `u32` bit number 0-255
(`Handlers/CharacterHandler.cpp:1305-1319`); 0x0FF is empty and sets
every bit (`:1321-1325`); 0x100 is empty and clears every bit
(`:1327-1331`). None has a reply. The bits come back in
`SMSG_TUTORIAL_FLAGS` at the next world session (owned by `login`).

**Steps:**

- [ ] **Step 1: Write the failing tests.** `buildTutorialFlag(bit)`
  writes one `u32` and refuses a bit outside 0-255; over
  `areaRig("account")`, `act.tutorialFlag(3)`, `act.clearTutorials()` and
  `act.resetTutorials()` each record one packet with the right opcode and
  body and resolve at once.
- [ ] **Step 2: Implement.** `AccountActs` gains `tutorialFlag`,
  `clearTutorials`, `resetTutorials`.
- [ ] **Step 3: Probe flow.** `probe-flows/account-tutorials.ts` takes
  `--arg op=reset|clear|flag` and `--arg bit=<n>`; it prints
  `handle.login.state().tutorials` first, then sends the op.
- [ ] **Step 4: Live proof.** One account, four probe runs (each run is a
  new world session, so each prints the flags the previous run left):
  1. `--flow account-tutorials --arg op=reset`;
  2. `--arg op=flag --arg bit=3`: the printed flags are eight zeros;
  3. `--arg op=clear`: the printed flags are `8` then seven zeros;
  4. `--arg op=reset`: the printed flags are eight `0xFFFFFFFF`.
  Each run exits 0. Delete the account. The tutorial bits live only on
  the worker's own account.
- [ ] **Step 5: Records.** Three `live` rows in `docs/areas/account.md`
  (flow `account-tutorials`, sources
  `Handlers/CharacterHandler.cpp:1305-1319`, `:1321-1325`, `:1327-1331`).
  `mise protocol:coverage`, `mise protocol:cite-check`, `mise ci:checks`.
- [ ] **Step 6: Commit.**

  ```
  feat: Set, clear and reset tutorial flags

  Tutorial state is account data the server saves and sends at every
  login. The account area can now change it, which the login area's
  tutorial flags show at the next session.
  ```

---

## Task session-6: Character screen, create and delete

**codeArea:** `charscreen`. **Phase:** 4. **Size:** L. **Proof:** live
(create, delete), accepted (declined names), mock (the declined-names
result).

**Files:**

- Create: `packages/core/src/wow/areas/charscreen/protocol.ts`,
  `names.ts`, `store.ts`, `runtime.ts`, each with its test, and
  `area.test.ts`
- Modify: `packages/core/src/wow/areas/charscreen/area.ts` (seeded by
  `SEED-4`), `opcodes.ts` (`dead`, `unseen`)
- Create: `packages/core/test-support/areas/charscreen.ts`
- Modify (lease D21): `packages/core/src/wow/protocol/world.ts`, the
  `SMSG_CHAR_ENUM` parser `parseCharacterList` and its `CharacterInfo`
  type only (`:9-20`, `:127-165`), and `protocol/world.test.ts`
- Modify (lease): `packages/core/src/wow/client-connection.ts`
  (`selectCharacter` split into the stage and `enter`) and its test
- Modify (lease): `packages/core/src/wow/client.ts` (`characterScreen`,
  `worldSession` on top of it) and `client.test.ts`
- Create: `packages/devtools/src/probe-flows/charscreen-create.ts`
- Create: `docs/areas/charscreen.md`
- Regenerate: `docs/protocol-coverage/charscreen.md`
- By the coordinator (`COORD`, contract issues 4 and 5):
  `packages/core/src/wow/session.ts` (the `characterScreen` export) and
  the pre-login stage in `packages/devtools/src/probe.ts`

**Depends on:** `session-4` (unit order), `session-5` (the fail-fast
login this task moves into `enter`), `SEED-4`; the three leases; the
`COORD` commit for the live step only.

**Opcodes:** `CMSG_CHAR_CREATE` (0x036), `SMSG_CHAR_CREATE` (0x03A),
`CMSG_CHAR_DELETE` (0x038), `SMSG_CHAR_DELETE` (0x03C),
`CMSG_SET_PLAYER_DECLINED_NAMES` (0x419),
`SMSG_SET_PLAYER_DECLINED_NAMES_RESULT` (0x41A). Body gap:
`SMSG_CHAR_ENUM` (core-handled, not owned).

**Wire** (all `Handlers/CharacterHandler.cpp` unless marked):

- 0x036: CString name, `u8` race, class, gender, skin, face, hair style,
  hair colour, facial hair, outfit id (`:265-605`). The name passes
  `normalizePlayerName` and `ObjectMgr::CheckPlayerName` (`:345,353`).
- 0x03A: `u8` code; success is 0x2F (`:2608-2613`;
  `src/server/shared/SharedDefines.h:3623`).
- 0x038: `u64` guid; a guild leader or arena captain is refused
  (`:620-679`). 0x03C: `u8` code; success is 0x47 (`:2615-2620`;
  `src/server/shared/SharedDefines.h:3650`).
- 0x419: `u64` guid, CString name, five CStrings (`:1453-1530`); it is
  dropped with no reply unless `DeclinedNames = 1` (`:1456-1457`; the
  default is 0, `src/server/apps/worldserver/worldserver.conf.dist:1930`).
- 0x41A: `u32` result, `u64` guid (`:2678-2684`).
- `SMSG_CHAR_ENUM` per character (`Entities/Player/Player.cpp:1186-1254`):
  after the fields Peon reads today come skin, face, hair style, hair
  colour, facial hair (today `r.skip(4)`, `r.skip(1)`), position x, y, z,
  character flags (`:1241`), customize flags (`:1244-1251`), first login
  (`:1254`), pet display, level and family, and 23 equipment slots of
  `u32` display, `u8` inventory type, `u32` enchant aura. Flag values
  (`Entities/Player/Player.cpp:108-148`): `CHARACTER_FLAG_RENAME`
  0x4000, `GHOST` 0x2000, `HIDE_HELM` 0x400, `HIDE_CLOAK` 0x800,
  `LOCKED_BY_BILLING` 0x1000000, `DECLINED` 0x2000000;
  `CHAR_CUSTOMIZE_FLAG_CUSTOMIZE` 0x1, `FACTION` 0x10000, `RACE`
  0x100000. A rename-flagged character is kicked during load with no
  message (`Entities/Player/PlayerStorage.cpp:5492-5496`).

**Steps:**

- [ ] **Step 1: Builders.** In `packages/core/test-support/areas/charscreen.ts`:
  `charscreenCharCreateBody({ code })`, `charscreenCharDeleteBody({ code })`,
  `charscreenDeclinedNamesResultBody({ result, guid })` and
  `charscreenCharEnumBody({ characters })`, which writes the full
  AzerothCore layout above for any number of characters.
- [ ] **Step 2: Write the failing parser tests.**
  - `protocol/world.test.ts`: `parseCharacterList` over two characters
    returns every field above, including `flags`, `customizeFlags`,
    `firstLogin`, `pet` and 23 `equipment` slots; the fields it returns
    today keep their names and values.
  - `charscreen/protocol.test.ts`: the three reply parsers name the codes
    they know (`success`, `name_in_use`, `failed` and the rest the
    builder reads from `src/server/shared/SharedDefines.h:3600-3660`),
    with `unknown` for any other; `buildCharCreate`, `buildCharDelete`
    and `buildSetDeclinedNames` write the fields in the reader order.
  - `names.test.ts`: `checkCharacterName` accepts `Peonzq`, refuses a
    name with a digit, a space, fewer than 2 or more than 12 letters, and
    returns the normalized form (first letter upper, rest lower). The
    builder reads `ObjectMgr::CheckPlayerName` in
    `src/server/game/Globals/ObjectMgr.cpp` and cites its line in the
    proof table; the exact line could not be determined while planning.
  Run the files and see them fail.
- [ ] **Step 3: Implement** the parser change under the D21 lease (no
  other edit to `protocol/world.ts`) and the charscreen parsers,
  builders and `names.ts`.
- [ ] **Step 4: Write the failing store and runtime tests** over
  `areaRig("charscreen")`:
  - `act.refresh()` sends `CMSG_CHAR_ENUM`, and an injected enum body
    fills `state().characters`.
  - `act.create({ name, race, class, gender, skin, face, hairStyle,
    hairColor, facialHair })` refuses a bad name without sending; else it
    sends 0x036, resolves with the code of the injected 0x03A, then
    refreshes; a second call while one is in flight rejects with `busy`
    (one request at a time, design 5.18); no reply rejects with
    `timeout` after 10 s.
  - `act.remove(guid)` refuses a guid that is not in `characters`; else
    it sends 0x038 and resolves with the code of 0x03C, then refreshes.
  - `act.setDeclinedNames(guid, name, forms)` refuses a guid not in the
    list, sends 0x419, and resolves `"ignored"` after 3 s with no reply
    or with the result of an injected 0x41A.
  - Each reply emits `character_result` `{ op, code, result }`.
- [ ] **Step 5: Implement.** `CharscreenState = { characters: readonly
  CharacterInfo[]; last: { op: string; code: number } | undefined }`;
  `CharscreenEvent` = `character_result` and `characters` (after a
  refresh); `CharscreenActs = { refresh, create, remove, setDeclinedNames
  }`. The runtime keeps the in-flight flag. `opcodes.ts`:
  `dead: ["SMSG_INVALIDATE_PLAYER"]`,
  `unseen: ["SMSG_SET_PLAYER_DECLINED_NAMES_RESULT"]`.
- [ ] **Step 6: Write the failing stage tests** in `client.test.ts` and
  the `client-connection` test, against `mock-world-server.ts` (whose
  `buildCharEnumBody` already writes the full layout,
  `packages/core/test-support/mock-world-server.ts:109-138`):
  - `characterScreen(config, auth)` resolves after `SMSG_CHAR_ENUM` with
    `characters()` holding the fixture character and does not send
    `CMSG_PLAYER_LOGIN`.
  - `screen.enter(name)` logs in and resolves a `WorldHandle` like
    `worldSession` does today.
  - `enter` of a character whose `flags` hold 0x4000 rejects with
    "Character <name> is flagged for rename" and sends nothing (an
    enum body built with the step 1 builder, through a real
    `OpcodeDispatch`).
  - `enter` fails at once on `SMSG_CHARACTER_LOGIN_FAILED` (the
    `session-5` race moves here).
  - The existing `worldSession` tests pass unchanged.
- [ ] **Step 7: Implement the stage** (design 5.18, "Character-screen
  stage"). `characterScreen(config, auth): Promise<CharacterScreen>` in
  `client.ts` builds the connection, stores and runtimes as
  `worldSession` does, authenticates, and calls
  `rt.areas.runtimes.charscreen.act.refresh()`. `CharacterScreen` holds
  `characters()`, the `charscreen` acts, the `account` acts of
  session-3 (the builder spreads the act object, no new names; session-8
  adds `realmSplit` the same way when it lands), `enter(name)` and `close()`.
  `worldSession(config, auth)` keeps its signature and calls
  `characterScreen(config, auth).then((s) => s.enter(config.character))`.
  The order inside the session stays (design 3.7). `enter` warns on a
  pending customize, faction or race flag through a `charscreen` event
  `login_flag` `{ name, flags }` and logs in: nothing in `game/` checks
  those flags at login (design 5.18).
- [ ] **Step 8: Probe flow.** `probe-flows/charscreen-create.ts`, with
  the pre-login stage of contract issue 4: create a Blood Elf mage (race
  10, class 8, the preset's faction) with a random name of 8 letters,
  check it is listed, call `setDeclinedNames` on it, `remove` it unless
  `--arg keep=1`, check it is gone, then `enter` the ledger character so
  the probe continues as a normal login. With `keep=1` it prints the new
  name for `session-7`.
- [ ] **Step 9: Live proof.** `mise factory soap create eversong10`;
  `mise protocol:probe <ACCOUNT> --flow charscreen-create --expect
  SMSG_CHAR_CREATE --expect SMSG_CHAR_DELETE --wait 10`. Exit 0 with codes
  0x2F and 0x47 proves 0x036, 0x03A, 0x038 and 0x03C live; the session
  staying up after 0x419 proves it `accepted`. `mise factory soap delete
  <ACCOUNT>`. If the `COORD` commit of issues 4 and 5 has not landed,
  report `blocked` on this step only, with every other step done.
  `SMSG_SET_PLAYER_DECLINED_NAMES_RESULT` cannot occur with
  `DeclinedNames = 0`: its proof is the `areaRig` test built from
  `Handlers/CharacterHandler.cpp:2678-2684`.
- [ ] **Step 10: Eval rerun** with the gates of `session-1` step 10: this
  task changes the login path every session uses (design 5.18 "Risks").
- [ ] **Step 11: Write `docs/areas/charscreen.md`** (contract 3.8): wire
  notes on the full enum layout and the rename kick; "Left out": the
  declined-names result (not seen live, config) and
  `SMSG_INVALIDATE_PLAYER` (dead); "Capabilities row": "No verb (N23)";
  rows: 0x036, 0x03A, 0x038, 0x03C `live` (flow `charscreen-create`),
  0x419 `accepted`, 0x41A `mock`, `SMSG_INVALIDATE_PLAYER` `dead` (no
  send site, `Server/Protocol/Opcodes.cpp:927`). `mise protocol:cite-check`,
  `mise lint:docs`, `mise protocol:coverage`, `mise ci:checks`.
- [ ] **Step 12: Commit.** Two commits keep each green:

  ```
  feat: Read the full character list

  The character list parser skipped appearance, flags, pet and gear, so
  a rename-flagged character looked normal and was kicked on login. It
  now reads every field the server writes.
  ```

  ```
  feat: Add a character screen to core

  Peon could not create or delete a character, and logged in straight
  after the list. The character screen now pauses there, creates and
  deletes characters, and refuses a character the server would kick.
  ```

---

## Task session-7: Rename, customize, faction and race change

**codeArea:** `charscreen`. **Phase:** 4. **Size:** M. **Proof:** live.

**Files:**

- Modify: `packages/core/src/wow/areas/charscreen/protocol.ts`,
  `runtime.ts`, `store.ts` and their tests, `area.ts` and `area.test.ts`
- Modify: `packages/core/test-support/areas/charscreen.ts`
- Create: `packages/devtools/src/probe-flows/charscreen-flags.ts`
- Modify: `docs/areas/charscreen.md`
- Regenerate: `docs/protocol-coverage/charscreen.md`

**Depends on:** `session-6`, `T-6` (the `soap gm` verbs `rename`,
`customize`, `changefaction`, `changerace` on a second character of the
worker's ledger account, N31).

**Opcodes:** `CMSG_CHAR_RENAME` (0x2C7), `SMSG_CHAR_RENAME` (0x2C8),
`CMSG_CHAR_CUSTOMIZE` (0x473), `SMSG_CHAR_CUSTOMIZE` (0x474),
`CMSG_CHAR_FACTION_CHANGE` (0x4D9), `CMSG_CHAR_RACE_CHANGE` (0x4F8),
`SMSG_CHAR_FACTION_CHANGE` (0x4DA).

**Wire** (all `Handlers/CharacterHandler.cpp`):

- 0x2C7: `u64` guid, CString name (`:1365-1452`); it needs the rename
  at-login flag (`:1415-1421`). 0x2C8: `u8` code; on success `u64` guid
  and CString name (`:2629-2639`).
- 0x473: `u64` guid, CString name, `u8` gender, skin, hair colour, hair
  style, facial hair, face (`:1644-1682`); it needs the customize flag
  (`:1707-1713`) and refuses an online character (`:1660-1667`). 0x474:
  `u8` code; on success guid, name, gender, skin, face, hair style, hair
  colour, facial hair, in that order, which differs from the request
  (`:2660-2676`).
- 0x4D9 and 0x4F8: the customize fields plus `u8` race, one handler that
  picks the flag by opcode (`:1952-1990`, `:1983`, `:2025`); both answer
  0x4DA (`:2641-2658`).
- A guid of another account kicks the session (`:1650-1657`,
  `:1958-1965`), so every act takes a guid only from `characters`.

**Steps:**

- [ ] **Step 1: Write the failing tests.**
  - `protocol.test.ts`: builders write the request fields in reader
    order; `parseCharRename`, `parseCharCustomize` and
    `parseCharFactionChange` read the code and, on success, the fields in
    the writer order above; a failure code reads no more bytes.
  - `runtime.test.ts` over `areaRig("charscreen")`: `act.rename(guid,
    name)`, `act.customize(guid, spec)`, `act.changeFaction(guid, spec)`
    and `act.changeRace(guid, spec)` refuse a guid that is not in
    `characters` and send nothing; refuse a bad name (`names.ts`); else
    send the right opcode (race change sends 0x4F8, faction change
    0x4D9), resolve with the injected reply and refresh; `busy` and the
    10 s `timeout` as in `session-6`.
  Run them and see them fail.
- [ ] **Step 2: Implement.** `CharscreenActs` gains the four acts; the
  three parsers register with `on`; `character_result` carries the new
  `op` values. `CharacterScreen` (session-6) exposes them through the
  spread of the act object, with no new name.
- [ ] **Step 3: Probe flow.** `probe-flows/charscreen-flags.ts` takes
  `--arg name=<C2>` and `--arg op=rename|customize|race|faction|delete`
  (plus `--arg to=<new name>` for rename). It runs in the pre-login
  stage, finds `<C2>` in `characters`, and sends one op: rename to
  `to`; customize with the current appearance and gender flipped; race
  change to Undead (race 5, a legal mage race); faction change to Human
  (race 1). It prints the reply code and fields, then enters the ledger
  character.
- [ ] **Step 4: Live proof.** One account, on a second character the
  worker creates (never the ledger's own character, N31):
  1. `mise factory soap create eversong10`.
  2. `mise protocol:probe <ACCOUNT> --flow charscreen-create --arg
     keep=1`: note `<C2>`.
  3. `mise factory soap gm <ACCOUNT> rename <C2>`, then
     `--flow charscreen-flags --arg name=<C2> --arg op=rename --arg
     to=<C3>` `--expect SMSG_CHAR_RENAME`. Check with `mise factory soap
     gm <ACCOUNT> read characters` that `<C3>` is listed.
  4. `soap gm ... customize <C3>`, then `op=customize --expect
     SMSG_CHAR_CUSTOMIZE`.
  5. `soap gm ... changerace <C3>`, then `op=race --expect
     SMSG_CHAR_FACTION_CHANGE`.
  6. `soap gm ... changefaction <C3>`, then `op=faction --expect
     SMSG_CHAR_FACTION_CHANGE`. On a PvP realm the server may refuse a
     second faction on the account [I]; any reply proves the opcode live,
     and the report records the code.
  7. `op=delete` on `<C3>`, then `mise factory soap delete <ACCOUNT>`.
  Record every `soap gm` line from `gm.log` in the report.
- [ ] **Step 5: Eval rerun** with the gates of `session-1` step 10.
- [ ] **Step 6: Records.** Seven `live` rows in `docs/areas/charscreen.md`
  (flow `charscreen-flags` and its `op`, sources as above); a wire note on
  the customize reply order. `mise protocol:coverage`,
  `mise protocol:cite-check`, `mise ci:checks`.
- [ ] **Step 7: Commit.**

  ```
  feat: Rename and change characters at the screen

  A GM can flag a character for rename, customize, race or faction
  change, and Peon had no way to answer the flag. The character screen
  now sends each change, only for characters on the account.
  ```

---

## Task session-8: Appearance toggles, played time, realm split

**codeArea:** `appearance`. **Phase:** 4. **Size:** M. **Proof:** live.

**Files:**

- Create: `packages/core/src/wow/areas/appearance/protocol.ts`,
  `store.ts`, `runtime.ts`, each with its test, and `area.test.ts`
- Modify: `packages/core/src/wow/areas/appearance/area.ts` (seeded by
  `SEED-4`), `opcodes.ts` (`uses` if any)
- Create: `packages/core/test-support/areas/appearance.ts`
- Create: `packages/devtools/src/probe-flows/appearance-toggles.ts`
- Create: `docs/areas/appearance.md`
- Regenerate: `docs/protocol-coverage/appearance.md`

**Depends on:** `session-7` (unit order), `SEED-4`. No lease (contract
issue 7).

**Opcodes:** `CMSG_TOGGLE_HELM` (0x2B9), `CMSG_TOGGLE_CLOAK` (0x2BA),
`CMSG_SET_SHEATHED` (0x1E0), `CMSG_PLAYED_TIME` (0x1CC),
`SMSG_PLAYED_TIME` (0x1CD), `CMSG_REALM_SPLIT` (0x38C),
`SMSG_REALM_SPLIT` (0x38B). Field reads: `PLAYER_FLAGS` bits 0x400,
0x800, 0x1000, 0x2000 and the sheath byte of `UNIT_FIELD_BYTES_2`.

**Wire:**

- 0x2B9 and 0x2BA: one `bool` each (`Server/Packets/CharacterPackets.cpp:20-28`;
  handlers `Handlers/CharacterHandler.cpp:1349-1363`). They clear or set
  `PLAYER_FLAGS_HIDE_HELM` 0x400 and `HIDE_CLOAK` 0x800
  (`Entities/Player/Player.h:469-470`). wowm
  (`item/cmsg_toggle_helm.wowm:3`, `item/cmsg_toggle_cloak.wowm:3`) has
  an empty body; AzerothCore names them `CMSG_SHOWING_HELM` and
  `CMSG_SHOWING_CLOAK` (`Server/Protocol/Opcodes.cpp:828-829`); both
  facts favour AzerothCore. No reply; the self `PLAYER_FLAGS` changes.
  `PARTIAL_PLAY_TIME` 0x1000 and `NO_PLAY_TIME` 0x2000 are
  `Entities/Player/Player.h:471-472`.
- 0x1E0: `u32` state 0-2 (`Server/Packets/CombatPackets.cpp:20-23`,
  `Handlers/CombatHandler.cpp:73-82`); byte 0 of `UNIT_FIELD_BYTES_2`
  changes (`Entities/Unit/Unit.h:1779-1780`).
- 0x1CC: `u8` show-in-chat (`Server/Packets/CharacterPackets.cpp:37-40`,
  `Handlers/MiscHandler.cpp:968-974`). 0x1CD: `u32` total seconds, `u32`
  level seconds, `u8` echo (`Server/Packets/CharacterPackets.cpp:42-48`).
- 0x38C: `u32` realm id. 0x38B: `u32` echo, `u32` state 0, CString date
  `"01/01/01"` (`Handlers/MiscHandler.cpp:1168-1182`).

**Steps:**

- [ ] **Step 1: Builders.** `appearancePlayedTimeBody({ total, level,
  show })` and `appearanceRealmSplitBody({ realm, state, date })`.
- [ ] **Step 2: Write the failing tests.**
  - `protocol.test.ts`: `buildToggleHelm(true)` is the one byte `01`,
    `buildToggleCloak(false)` is `00`; `buildSetSheathed(3)` throws;
    `parsePlayedTime` and `parseRealmSplit` read the fields above.
  - `store.test.ts`: `observeSelf(rawFields)` over raw fields built with
    `PLAYER_FIELDS.FLAGS` (`packages/core/src/wow/protocol/update-fields.ts:152`)
    and `UNIT_FIELDS.BYTES_2` (`:135`) sets `hideHelm`, `hideCloak`,
    `partialPlayTime`, `noPlayTime` and `sheath`, and emits
    `appearance_changed` only when one of them changes; 0x1CD emits
    `played_time`; 0x38B emits `realm_split`.
  - `runtime.test.ts` over `areaRig("appearance", { selfGuid })`: an
    entity `update` for the character on `rig.events.entity` calls
    `observeSelf`; `act.showHelm(false)` sends `CMSG_TOGGLE_HELM` `00` and
    resolves when an injected self update sets 0x400, and rejects with
    `timeout` after 3 s; `act.sheathe(1)`, `act.playedTime(false)` and
    `act.realmSplit(0)` resolve on their answers (5 s for the replies).
  Run them and see them fail.
- [ ] **Step 3: Implement** (contract issue 7). `AppearanceState = {
  hideHelm, hideCloak, partialPlayTime, noPlayTime: boolean | undefined;
  sheath: number | undefined; played: { totalSeconds, levelSeconds, at }
  | undefined; realmSplit: { state, date } | undefined }`;
  `AppearanceEvent` = `appearance_changed`, `played_time`,
  `realm_split`; `AppearanceActs = { showHelm, showCloak, sheathe,
  playedTime, realmSplit }`. The runtime reads the self fields with
  `ctx.listen("entity", ...)` and `deps.getEntity(deps.selfGuid())`.
- [ ] **Step 4: Probe flow.** `probe-flows/appearance-toggles.ts`:
  `showHelm(false)`, `showCloak(false)`, `sheathe(1)`,
  `playedTime(false)`, `realmSplit(0)`, print the state, then restore
  `showHelm(true)`, `showCloak(true)`, `sheathe(0)`.
- [ ] **Step 5: Live proof.** `mise factory soap create eversong10`;
  `mise protocol:probe <ACCOUNT> --flow appearance-toggles --expect
  SMSG_PLAYED_TIME --expect SMSG_REALM_SPLIT --wait 10`. Exit 0, with the
  printed state showing 0x400 and 0x800 set and sheath 1, proves the
  seven live. `mise factory soap delete <ACCOUNT>`.
- [ ] **Step 6: Write `docs/areas/appearance.md`** (contract 3.8): wire
  notes on the helm and cloak `bool` and names against wowm; "Left out":
  none; "Capabilities row": "No verb (N23)"; seven `live` rows, flow
  `appearance-toggles`, sources as in "Wire". `mise protocol:cite-check`,
  `mise lint:docs`, `mise protocol:coverage`, `mise ci:checks`.
- [ ] **Step 7: Commit.**

  ```
  feat: Toggle helm, cloak and sheath

  Peon could not hide its helm or cloak, sheathe a weapon, or ask for
  played time. The appearance area sends them and reads the flags back
  from the character's own update fields.
  ```

---

## Task session-9: Barber shop

**codeArea:** `appearance`. **Phase:** 4. **Size:** S. **Proof:** live
(`CMSG_ALTER_APPEARANCE`, `SMSG_BARBER_SHOP_RESULT` with result 2) and
mock (`SMSG_ENABLE_BARBER_SHOP`, unless a chair is reached).

**Files:**

- Modify: `packages/core/src/wow/areas/appearance/protocol.ts`,
  `store.ts`, `runtime.ts` and their tests, `area.ts`, `area.test.ts`,
  `opcodes.ts` (`unseen`)
- Create: `packages/core/src/wow/areas/appearance/barber-styles.ts` and
  test
- Modify: `packages/core/test-support/areas/appearance.ts`
- Create: `packages/devtools/src/probe-flows/appearance-barber.ts`
- Modify: `docs/areas/appearance.md`
- Regenerate: `docs/protocol-coverage/appearance.md`

**Depends on:** `session-8`. The optional chair proof needs the `use`
tool of the `objects` unit.

**Opcodes:** `CMSG_ALTER_APPEARANCE` (0x426), `SMSG_ENABLE_BARBER_SHOP`
(0x427), `SMSG_BARBER_SHOP_RESULT` (0x428). Field reads: `PLAYER_BYTES`
and `PLAYER_BYTES_2`.

**Wire:**

- 0x426: four `u32`: hair, hair colour, facial hair, skin colour
  (`Handlers/CharacterHandler.cpp:1532-1602`, `:1537`). wowm
  (`character_screen/cmsg_alter_appearance.wowm:1`) has three; AzerothCore
  wins. Hair and facial hair are `BarberShopStyle.dbc` ids that must
  match the character's race and gender, or the packet is dropped with no
  reply (`:1541-1553`).
- 0x428: `u32` result: 0 success, 1 not enough money, 2 no chair within 5
  yards or not seated (`:1555-1587`). A success changes `PLAYER_BYTES`
  and `PLAYER_BYTES_2` and costs money (`:1590-1597`).
- 0x427: empty; sent when the character uses a barber chair game object
  (`Entities/GameObject/GameObject.cpp:2042-2043`).

**Steps:**

- [ ] **Step 1: Write the failing tests.**
  - `protocol.test.ts`: `buildAlterAppearance({ hair, hairColor,
    facialHair, skin })` writes four `u32` in that order;
    `parseBarberShopResult` names 0, 1, 2 and `unknown`.
  - `barber-styles.test.ts`: `barberStyles(dbc, race, gender)` over a
    small DBC built in the test returns the hair and facial-hair ids of
    that race and gender only; with `dbc` undefined it returns `[]`. The
    builder reads the `BarberShopStyle` record layout from AzerothCore's
    DBC format string and cites it in the proof table.
  - `store.test.ts`: 0x427 sets `barberOpen` and emits `barber`
    `{ open: true }`; 0x428 emits `barber` `{ result }`; `observeSelf`
    also reads skin, face, hair style, hair colour and facial hair from
    `PLAYER_FIELDS.FIELD_BYTES` (`update-fields.ts:153`) and `BYTES_2`
    (`:154`).
  - `runtime.test.ts`: `act.alterAppearance(ids)` sends 0x426 and
    resolves with the injected result, or `"ignored"` after 3 s with no
    reply.
  Run them and see them fail.
- [ ] **Step 2: Implement.** `barber-styles.ts` reads the DBC through
  `openDbc` (`packages/core/src/wow/dbc.ts:20`) and `ctx.dbc` (D4).
  `AppearanceActs` gains `alterAppearance` and `barberStyles`.
- [ ] **Step 3: Probe flow.** `probe-flows/appearance-barber.ts`: call
  `barberStyles()`, pick the first hair and facial-hair ids, keep the
  current colour and skin, call `alterAppearance` away from any chair,
  and print the result.
- [ ] **Step 4: Live proof.** `mise factory soap create eversong10`;
  `mise protocol:probe <ACCOUNT> --flow appearance-barber --expect
  SMSG_BARBER_SHOP_RESULT --wait 10`. Exit 0 with result 2 proves 0x426
  and 0x428 live. If `barberStyles()` returns `[]` (the probe has no DBC
  source), the server drops the packet: record 0x426 as `accepted` and
  0x428 as `mock` from `Handlers/CharacterHandler.cpp:1585-1588`.
  A chair was not located while planning (design 5.18 open point); if
  the `use` tool has landed and the worker finds a chair within reach of
  a `soap gm tele` name, it may add the chair proof of 0x427 and result 0
  with `soap gm money`. Otherwise 0x427 is `mock` from
  `Entities/GameObject/GameObject.cpp:2042-2043` and goes into `unseen`.
  `mise factory soap delete <ACCOUNT>`.
- [ ] **Step 5: Records.** Rows for 0x426, 0x427, 0x428 in
  `docs/areas/appearance.md`; a wire note on the fourth `u32`;
  "Left out" names what stayed mock and why. `mise protocol:coverage`,
  `mise protocol:cite-check`, `mise ci:checks`.
- [ ] **Step 6: Commit.**

  ```
  feat: Ask the barber for a new appearance

  The barber request carries four fields, not the three wowm lists, and
  Peon could not send it. The appearance area now sends valid styles for
  the character and reads the result and the new appearance.
  ```

---

## Task session-10: GM ticket reads

**codeArea:** `tickets`. **Phase:** 4. **Size:** S. **Proof:** live.

**Files:**

- Create: `packages/core/src/wow/areas/tickets/protocol.ts`, `store.ts`,
  `runtime.ts`, each with its test, and `area.test.ts`
- Modify: `packages/core/src/wow/areas/tickets/area.ts` (seeded by
  `SEED-4`), `opcodes.ts` (`dead`)
- Create: `packages/core/test-support/areas/tickets.ts`
- Create: `packages/devtools/src/probe-flows/tickets-read.ts`
- Create: `docs/areas/tickets.md`
- Regenerate: `docs/protocol-coverage/tickets.md`

**Depends on:** `session-9` (unit order), `SEED-4`.

**Opcodes:** `CMSG_GMTICKET_SYSTEMSTATUS` (0x21A),
`SMSG_GMTICKET_SYSTEMSTATUS` (0x21B), `CMSG_GMTICKET_GETTICKET` (0x211),
`SMSG_GMTICKET_GETTICKET` (0x212).

**Wire:**

- 0x21A: empty; 0x21B: `u32` 1 enabled, 0 disabled
  (`Handlers/TicketHandler.cpp:188-195`).
- 0x211: empty; the server answers `SMSG_QUERY_TIME_RESPONSE` (the `time`
  area's) and then 0x212, or `SMSG_GMRESPONSE_RECEIVED` for a completed
  ticket (`Handlers/TicketHandler.cpp:173-186`).
- 0x212: `u32` status, 10 with no ticket and 6 with one; on 6 `u32` id,
  CString text, `u8` need more help, three `f32` ages in days, `u8`
  escalation, `u8` read by GM (`Tickets/TicketMgr.cpp:436-446`,
  `GmTicket::WritePacket` `:115-133`).

**Steps:**

- [ ] **Step 1: Builders.** `ticketsSystemStatusBody({ enabled })`,
  `ticketsGetTicketBody({ status, ticket? })`.
- [ ] **Step 2: Write the failing tests.** `parseGmTicketSystemStatus`;
  `parseGmTicketGetTicket` for status 10 (no ticket) and 6 (every
  field); the store keeps `systemEnabled` and `ticket` (`status: "none" |
  "open"`) and emits `ticket` `{ kind: "status" | "ticket" }`; over
  `areaRig("tickets")`, `act.ticketSystem()` and `act.ticket()` send
  their opcode and resolve on the injected reply, or reject with
  `timeout` after 5 s.
- [ ] **Step 3: Implement.** `TicketsState = { systemEnabled: boolean |
  undefined; ticket: { status, id, text, needMoreHelp, ageDays,
  oldestAgeDays, updatedAgeDays, escalation, readByGm } | undefined }`;
  `TicketsEvent` = `ticket`; `TicketsActs = { ticketSystem, ticket }`.
  `opcodes.ts`: `dead: ["CMSG_GMTICKETSYSTEM_TOGGLE",
  "SMSG_GM_TICKET_STATUS_UPDATE", "SMSG_GMRESPONSE_DB_ERROR"]`.
- [ ] **Step 4: Probe flow.** `probe-flows/tickets-read.ts`:
  `ticketSystem()`, then `ticket()`; prints both. It writes nothing.
- [ ] **Step 5: Live proof.** `mise factory soap create eversong10`;
  `mise protocol:probe <ACCOUNT> --flow tickets-read --expect
  SMSG_GMTICKET_SYSTEMSTATUS --expect SMSG_GMTICKET_GETTICKET --wait 10`.
  Exit 0 with status 10 proves the four live. Delete the account.
- [ ] **Step 6: Write `docs/areas/tickets.md`** (contract 3.8): wire notes
  on the ages in days; "Left out": the three dead rows with evidence
  (`Server/Protocol/Opcodes.cpp:797` no client handler, `:939` and
  `:1393` no send site); "Capabilities row": "No verb (N23)"; four
  `live` rows (flow `tickets-read`) and three `dead` rows.
  `mise protocol:cite-check`, `mise lint:docs`, `mise protocol:coverage`,
  `mise ci:checks`.
- [ ] **Step 7: Commit.**

  ```
  feat: Read the GM ticket status

  Peon could not tell whether the ticket system is on or whether its
  character has an open ticket. The tickets area now asks for both and
  keeps the answer.
  ```

---

## Task session-11: GM ticket writes

**codeArea:** `tickets`. **Phase:** 4. **Size:** M. **Proof:** live
(the update error path), accepted (delete with no ticket), builder and
mock (create and a real delete; S1, S3).

**Files:**

- Modify: `packages/core/src/wow/areas/tickets/protocol.ts`, `store.ts`,
  `runtime.ts` and their tests, `area.ts`, `area.test.ts`, `opcodes.ts`
  (`unseen`)
- Create: `packages/core/src/wow/areas/tickets/text.ts` and test
- Modify: `packages/core/test-support/areas/tickets.ts`
- Create: `packages/devtools/src/probe-flows/tickets-none.ts`
- Modify: `docs/areas/tickets.md`
- Regenerate: `docs/protocol-coverage/tickets.md`

**Depends on:** `session-10`.

**Opcodes:** `CMSG_GMTICKET_CREATE` (0x205), `SMSG_GMTICKET_CREATE`
(0x206), `CMSG_GMTICKET_UPDATETEXT` (0x207), `SMSG_GMTICKET_UPDATETEXT`
(0x208), `CMSG_GMTICKET_DELETETICKET` (0x217),
`SMSG_GMTICKET_DELETETICKET` (0x218).

**Wire** (all `Handlers/TicketHandler.cpp`):

- 0x205 (`:30-129`): map, position, CString message, then a `u32`
  need-response (`:57,75`), `bool` need-more-help, `u32` count, the
  times, `u32` decompressed size and a zlib chat log. wowm
  (`gamemaster/cmsg_gmticket_create.wowm:19`) has a 1-byte need-response;
  AzerothCore wins. With the system off there is no reply (`:33-34`).
- 0x206: `u32` 2 success, 3 error (`:126-128`; `Tickets/TicketMgr.h:40-48`).
- 0x207: CString (`:131-156`); with no ticket the reply 0x208 is 5, and
  nothing is written. 0x208: `u32` 4 or 5 (`:153-155`).
- 0x217: empty (`:158-171`); with no ticket, no reply. 0x218: `u32` 9
  (`:162-164`).
- Every text passes `ValidateHyperlinksAndMaybeKick` (`:65,105,136`),
  which kicks on a malformed link (`Server/WorldSession.cpp:917-929`).

**Steps:**

- [ ] **Step 1: Write the failing tests.**
  - `text.test.ts`: `cleanText("a|Hb|r")` returns `"aHbr"` (S6); a text
    over the reader's limit is refused.
  - `protocol.test.ts`: `buildGmTicketCreate({ map, x, y, z, text,
    needMoreHelp })` writes a 4-byte need-response, a count of 0 and a
    size of 0, and the fields in the reader order (the builder reads
    `:30-129` for which fields follow a zero count); `buildGmTicketUpdate`
    cleans the text; the three reply parsers name their codes.
  - `store.test.ts` and `runtime.test.ts` over `areaRig("tickets")`:
    `act.createTicket(text, needMoreHelp)`, `act.updateTicket(text)` and
    `act.abandonTicket()` send cleaned bodies and resolve on the injected
    reply (`created`, `updated`, `deleted` kinds of `ticket`);
    `abandonTicket` with no reply resolves `"none"` after 5 s.
  Run them and see them fail.
- [ ] **Step 2: Implement.** `TicketsActs` gains `createTicket`,
  `updateTicket`, `abandonTicket`.
- [ ] **Step 3: Probe flow.** `probe-flows/tickets-none.ts`:
  `ticket()` must show status 10, then `updateTicket("peon probe")` and
  `abandonTicket()`. With no ticket both write nothing.
- [ ] **Step 4: Live proof.** `mise factory soap create eversong10`;
  `mise protocol:probe <ACCOUNT> --flow tickets-none --expect
  SMSG_GMTICKET_UPDATETEXT --wait 10`. Exit 0 with code 5 proves 0x207
  and 0x208 live; the session staying up proves 0x217 `accepted`. Delete
  the account. `CMSG_GMTICKET_CREATE` is never sent live (N25): proof
  `builder` from `Handlers/TicketHandler.cpp:30-129`. 0x206 and 0x218 are
  `mock` from `:126-128` and `:162-164`.
- [ ] **Step 5: Records.** `opcodes.ts` `unseen`: `CMSG_GMTICKET_CREATE`,
  `SMSG_GMTICKET_CREATE`, `SMSG_GMTICKET_DELETETICKET`. Six rows in
  `docs/areas/tickets.md`; a wire note on the 4-byte need-response;
  "Left out" names the ticket writes as not sent until the maintainer
  rules. `mise protocol:coverage`, `mise protocol:cite-check`,
  `mise ci:checks`.
- [ ] **Step 6: Commit.**

  ```
  feat: Build GM ticket create, update and delete

  The ticket packets write a table on the server, so they are built and
  tested but only the harmless no-ticket paths run live. Every text Peon
  sends drops link escapes so the server cannot kick it.
  ```

---

## Task session-12: GM response and survey

**codeArea:** `tickets`. **Phase:** 4. **Size:** M. **Proof:** accepted
(`CMSG_GMRESPONSE_RESOLVE`), mock (the two replies) and builder (the
survey).

**Files:**

- Modify: `packages/core/src/wow/areas/tickets/protocol.ts`, `store.ts`,
  `runtime.ts` and their tests, `area.ts`, `area.test.ts`, `opcodes.ts`
  (`unseen`)
- Modify: `packages/core/test-support/areas/tickets.ts`
- Modify: `packages/devtools/src/probe-flows/tickets-none.ts`
- Modify: `packages/harness/src/areas/tickets/area.ts` and create its
  `area.test.ts`
- Modify: `docs/areas/tickets.md`
- Regenerate: `docs/protocol-coverage/tickets.md`

**Depends on:** `session-11`. Not on `T-6`: the ticket loop over SOAP is
not built (S3).

**Opcodes:** `SMSG_GMRESPONSE_RECEIVED` (0x4EF),
`CMSG_GMRESPONSE_RESOLVE` (0x4F0), `SMSG_GMRESPONSE_STATUS_UPDATE`
(0x4F1), `CMSG_GMSURVEY_SUBMIT` (0x32A).

**Wire:**

- 0x4EF: `u32` response id (1), `u32` ticket id, CString message, then
  four CStrings that hold the response split into chunks of up to 3999
  bytes (`Tickets/TicketMgr.cpp:135-160`).
- 0x4F0: empty; with a ticket the server answers 0x4F1, 0x218 and 0x212;
  with none, nothing (`Handlers/TicketHandler.cpp:280-300`). 0x4F1: `u8`
  show survey (`:289-291`).
- 0x32A: `u32` survey id, then `{ u32 question id, u8 answer, CString
  comment }` entries that stop at the first question id 0, then a
  CString comment (`Handlers/TicketHandler.cpp:197-254`, `:207-212`).
  wowm (`gamemaster/cmsg_gmsurvey_submit.wowm:14`) fixes ten entries;
  AzerothCore wins. It has no reply and inserts rows.

**Steps:**

- [ ] **Step 1: Write the failing tests.**
  - `parseGmResponseReceived` joins the four chunks into one `text`;
    `parseGmResponseStatusUpdate` returns `{ showSurvey }`;
    `buildGmSurveySubmit(surveyId, answers, comment)` with three answers
    writes three entries, then a bare `u32` 0, then the cleaned comment,
    and refuses more than ten answers.
  - Store: 0x4EF sets `response` and the ticket status `completed` and
    emits `gm_response` `{ ticketId, text }`; 0x4F1 emits `gm_survey`
    `{ offered }`.
  - Runtime over `areaRig("tickets")`: `act.resolveGmResponse()` sends
    0x4F0 and resolves on 0x4F1 or `"none"` after 5 s;
    `act.submitSurvey(...)` records the bytes and resolves at once.
  - Harness `area.test.ts`: a `gm_response` event returns one `wake`
    row named `gm_reply`, "A GM answered your ticket: <text>"; other
    ticket events return `[]` or the fallback.
  Run them and see them fail.
- [ ] **Step 2: Implement** the parsers, store, acts and the harness rule
  (the row is `tickets/gm_reply`, contract issue 3).
- [ ] **Step 3: Live proof.** Extend `tickets-none.ts` with
  `resolveGmResponse()` after `abandonTicket()`. One probe run; the
  session staying up proves 0x4F0 `accepted`. 0x4EF and 0x4F1 are `mock`
  from `Tickets/TicketMgr.cpp:135-160` and
  `Handlers/TicketHandler.cpp:289-291`; 0x32A is `builder` from
  `Handlers/TicketHandler.cpp:197-254` (N25). Delete the account.
- [ ] **Step 4: Records.** `unseen`: `SMSG_GMRESPONSE_RECEIVED`,
  `SMSG_GMRESPONSE_STATUS_UPDATE`, `CMSG_GMSURVEY_SUBMIT`. Four rows;
  wire notes on the chunked response and the survey terminator.
  `mise protocol:coverage`, `mise protocol:cite-check`, `mise typecheck
  harness`, `mise ci:checks`.
- [ ] **Step 5: Commit.**

  ```
  feat: Read GM answers to tickets

  A GM's answer arrives split over four strings and Peon dropped it. The
  tickets area joins it, wakes the agent with the text, and builds the
  survey the server offers after a ticket closes.
  ```

---

## Task session-13a: Bug and lag reports

**codeArea:** `tickets`. **Phase:** 4. **Size:** S. **Proof:** builder
(N25).

**Files:**

- Modify: `packages/core/src/wow/areas/tickets/protocol.ts`,
  `runtime.ts` and their tests, `opcodes.ts` (`unseen`)
- Modify: `docs/areas/tickets.md`
- Regenerate: `docs/protocol-coverage/tickets.md`

**Depends on:** `session-12`.

**Opcodes:** `CMSG_BUG` (0x1CA), `CMSG_GM_REPORT_LAG` (0x502).

**Wire:** 0x1CA: `u32` suggestion flag, `u32` length and text, `u32`
length and text; it inserts a `bug_report` row
(`Handlers/MiscHandler.cpp:616-630`). 0x502: `u32` type, `u32` map, three
`f32`; it inserts a `lag_reports` row with the session latency
(`Handlers/TicketHandler.cpp:256-278`). Neither has a reply.

**Steps:**

- [ ] **Step 1: Write the failing tests.** `buildBug({ suggestion,
  subject, text })` writes each length as the byte length of the cleaned
  text; `buildReportLag({ kind, map, x, y, z })` writes two `u32` and
  three `f32`; over `areaRig("tickets")`, `act.reportBug(...)` and
  `act.reportLag(...)` record one packet each. Run them and see them
  fail.
- [ ] **Step 2: Implement.** `TicketsActs` gains `reportBug` and
  `reportLag`.
- [ ] **Step 3: Proof.** No live send: both write a row that outlives the
  account (N25). Two `builder` rows with the reader lines above; both go
  into `unseen`. `mise protocol:coverage`, `mise protocol:cite-check`,
  `mise ci:checks`.
- [ ] **Step 4: Commit.**

  ```
  feat: Build bug and lag reports

  Both reports insert rows the player cannot remove, so they are built
  and tested against the server's readers and never sent in play.
  ```

---

## Task session-13b: GM-only opcodes

**codeArea:** `guard`. **Phase:** 4. **Size:** S. **Proof:** live
(the two denials), mock (`SMSG_WHOIS`) and builder
(`CMSG_SET_FACTION_CHEAT`).

**Files:**

- Create: `packages/core/src/wow/areas/guard/protocol.ts`, `store.ts`,
  `runtime.ts`, each with its test, and `area.test.ts`
- Modify: `packages/core/src/wow/areas/guard/area.ts` (seeded by
  `SEED-4`), `opcodes.ts` (`uses`, `dead`, `unseen`)
- Create: `packages/core/test-support/areas/guard.ts`
- Create: `packages/devtools/src/probe-flows/guard-denied.ts`
- Create: `docs/areas/guard.md`
- Regenerate: `docs/protocol-coverage/guard.md`

**Depends on:** `session-13a` (unit order), `SEED-4`.

**Opcodes:** `CMSG_WORLD_TELEPORT` (0x008), `CMSG_WHOIS` (0x064),
`SMSG_WHOIS` (0x065), `CMSG_SET_FACTION_CHEAT` (0x126, absent before
`S0-2`).

**Wire:**

- 0x008: `u32` time, `u32` map, `f32` x, y, z, orientation
  (`Handlers/MiscHandler.cpp:1051-1079`). wowm
  (`movement/cmsg/cmsg_world_teleport_3_3_5.wowm:5`) has a `u64` after
  the map; AzerothCore wins. Without permission 42
  (`Accounts/RBAC.h:93`, administrators only,
  `data/sql/base/db_auth/rbac_linked_permissions.sql:43`) the server sends
  the permission-denied `SMSG_NOTIFICATION` (`:1075-1078`).
- 0x064: CString name; without permission 43 the same denial
  (`Handlers/MiscHandler.cpp:1081-1091`). 0x065: CString text, which
  holds another account's name, e-mail and last address
  (`:1134-1136`), so it must never be made live.
- 0x126: empty (`Handlers/CharacterHandler.cpp:1299-1303`); it logs a
  server error line and sends every faction standing.

**Steps:**

- [ ] **Step 1: Builders and tests.** `guardWhoisBody({ text })`. Write
  the failing tests: `buildWorldTeleport` writes six fields and no `u64`;
  `buildWhois(name)`; `buildSetFactionCheat()` is empty; `parseWhois`;
  over `areaRig("guard", { register })` with the core owner of
  `SMSG_NOTIFICATION` passed as `init.register` (D24, contract 1.8):
  `act.worldTeleport(...)` and `act.whois(name)` resolve `"denied"` when
  an injected `SMSG_NOTIFICATION` arrives within 3 s (read through
  `ctx.expect`) and `"whois"` with the text on an injected 0x065;
  0x065 emits `whois`; `act.requestFactionStates()` records one empty
  0x126.
- [ ] **Step 2: Implement.** `GuardState = { whois: string | undefined;
  warden: ...; playTime: ...; redirect: ... }` (session-14 fills the
  rest); `GuardEvent` = `whois`; `GuardActs = { worldTeleport, whois,
  requestFactionStates }`. `opcodes.ts`: `uses: ["SMSG_NOTIFICATION"]`,
  `dead` the seven rows of the table at the end, `unseen:
  ["SMSG_WHOIS", "CMSG_SET_FACTION_CHEAT"]`.
- [ ] **Step 3: Probe flow.** `probe-flows/guard-denied.ts`:
  `worldTeleport` to the character's own map and position (so a server
  that allowed it would move the character nowhere), then
  `whois(<own name>)`; both must return `"denied"`.
- [ ] **Step 4: Live proof.** `mise factory soap create eversong10`
  (no `--gm`); `mise protocol:probe <ACCOUNT> --flow guard-denied
  --expect SMSG_NOTIFICATION --wait 10`. Exit 0 with two denials proves
  0x008 and 0x064 live. Delete the account. 0x065 is `mock` from
  `Handlers/MiscHandler.cpp:1134-1136`; 0x126 is `builder` from
  `Handlers/CharacterHandler.cpp:1299-1303` (N25, S1).
- [ ] **Step 5: Write `docs/areas/guard.md`** (contract 3.8): wire notes
  on the teleport body against wowm; "Left out": `SMSG_WHOIS` (it would
  print another account's data), the faction cheat (it writes a server
  error line) and the seven dead rows; "Capabilities row": "No verb
  (N23)"; four rows plus seven `dead` rows with their
  `Server/Protocol/Opcodes.cpp` lines (table at the end).
  `mise protocol:cite-check`, `mise lint:docs`, `mise protocol:coverage`,
  `mise ci:checks`.
- [ ] **Step 6: Commit.**

  ```
  feat: Send the GM-only opcodes and read the denial

  World teleport and whois are for administrators and the server answers
  a player with a permission notice. The guard area sends them in the
  server's own layout and reads the denial.
  ```

---

## Task session-14: Warden, play-time warning, redirect

**codeArea:** `guard`. **Phase:** 4. **Size:** M. **Proof:** live
(`SMSG_WARDEN_DATA` if Warden is on), accepted
(`TC9_CMSG_PREPARE_FOR_REDIRECT`), mock (the play-time warning, the
redirect reply) and builder (`CMSG_WARDEN_DATA`, S2).

**Files:**

- Modify: `packages/core/src/wow/areas/guard/protocol.ts`, `store.ts`,
  `runtime.ts` and their tests, `area.ts`, `area.test.ts`, `opcodes.ts`
  (delete the `SMSG_WARDEN_DATA` stub line, `unseen`)
- Modify: `packages/core/test-support/areas/guard.ts`
- Modify: `packages/harness/src/areas/guard/area.ts` and create its
  `area.test.ts`
- Modify: `docs/areas/guard.md`
- Regenerate: `docs/protocol-coverage/guard.md`

**Depends on:** `session-13b`.

**Opcodes:** `SMSG_WARDEN_DATA` (0x2E6, stub), `CMSG_WARDEN_DATA`
(0x2E7), `SMSG_PLAY_TIME_WARNING` (0x2F5), `TC9_CMSG_PREPARE_FOR_REDIRECT`
(0x51F), `TC9_SMSG_READY_FOR_REDIRECT` (0x520). The last three are absent
before `S0-2`.

**Wire:**

- 0x2E6: opaque, RC4-encrypted with a key derived from the session key
  (`Warden/WardenWin.cpp:113-135`); the first plaintext byte is the
  command (module use = 0, `Warden/Warden.cpp:76-96`). The server sends
  it at auth when `Warden.Enabled = 1` (the default,
  `src/server/apps/worldserver/worldserver.conf.dist:1169`) and the
  client reports Windows, which Peon does.
- 0x2E7: opaque, encrypted the other way (`Warden/Warden.cpp:320-356`).
  Any answer starts the check cycle and its 600 s timer; only command 5
  `MODULE_FAILED` is logged and ignored (`:349-351`). Never sent.
- 0x2F5: `u32` flag, `i32` seconds left
  (`Server/Packets/MiscPackets.cpp:172-176`,
  `Server/Packets/MiscPackets.h:240-249`); only when `CAIS.Enable = 1`
  (`Server/WorldSession.cpp:240-246,412-414`; the default is 0).
- 0x51F: empty; it returns at once unless cluster mode is on
  (`Server/WorldSession.cpp:1632-1660`, `:1634-1635`). 0x520: `u8` 0
  success, 1 failure (`:1640-1642`, `:1652-1654`); cluster mode is off
  on the live server, because `SMSG_ADDON_INFO` arrives at every login
  and is sent only then (`:1624-1629`).

**Steps:**

- [ ] **Step 1: Write the failing tests.**
  - `protocol.test.ts`: `parseWardenData` returns `{ size }` and keeps
    the body opaque (S7 below); `buildWardenData(payload)` writes the
    payload bytes unchanged; `parsePlayTimeWarning` reads a negative
    `i32`; `parseReadyForRedirect` names 0 and 1;
    `buildPrepareForRedirect()` is empty.
  - Store: each 0x2E6 counts a request and the first one emits
    `warden_request` `{ size }`; 0x2F5 emits `play_time_warning`
    `{ flag, remainingSeconds }`; 0x520 emits `redirect_ready` `{ ok }`.
  - Runtime over `areaRig("guard")`: `act.prepareForRedirect()` sends
    0x51F and resolves `"ignored"` after 3 s, or with `ok` on an injected
    0x520. No act sends 0x2E7.
  - Harness `area.test.ts`: the first `warden_request` of a session
    returns one `log` row `warden`, "The server asked for the anti-cheat
    module. Peon does not answer it."; later ones return `[]`;
    `play_time_warning` returns one `wake` row `play_time` with the
    minutes left.
  Run them and see them fail.
- [ ] **Step 2: Implement.** Register 0x2E6, 0x2F5 and 0x520; delete the
  stub line of 0x2E6. `GuardActs` gains `prepareForRedirect`. The
  harness rules write `guard/warden` and `guard/play_time` (contract
  issue 3).
- [ ] **Step 3: Live proof.** `mise factory soap create eversong10`;
  `mise protocol:probe <ACCOUNT> --flow login --send
  TC9_CMSG_PREPARE_FOR_REDIRECT --expect SMSG_PONG --wait 40`. The
  session staying up proves 0x51F `accepted`. If the trace holds 0x2E6
  (and `session-1` recorded whether it did), the row is `live`; if not,
  Warden is off on the live server and 0x2E6 is `mock` from
  `Warden/Warden.cpp:76-96`. Delete the account. 0x2F5 is `mock` from
  `Server/Packets/MiscPackets.cpp:172-176`; 0x520 is `mock` from
  `Server/WorldSession.cpp:1652-1654`; 0x2E7 is `builder` from
  `Warden/Warden.cpp:320-356`.
- [ ] **Step 4: Records.** `unseen`: `SMSG_PLAY_TIME_WARNING`,
  `TC9_SMSG_READY_FOR_REDIRECT`, `CMSG_WARDEN_DATA`, and
  `SMSG_WARDEN_DATA` if it was not seen. Five rows in
  `docs/areas/guard.md`; "Left out" names the Warden decryption and the
  answer (both need the maintainer) and the two config-gated replies.
  `mise protocol:coverage`, `mise protocol:cite-check`, `mise typecheck
  harness`, `mise ci:checks`.
- [ ] **Step 5: Unit wrap-up rerun** (S5): `mise eval run t1-walk-to-npc
  --round <n>` once, to show the wave-4 session tasks left basic play
  alone. Record the verdict.
- [ ] **Step 6: Commit.**

  ```
  feat: Notice Warden and the play-time warning

  The anti-cheat request and the play-time warning arrived unhandled.
  The guard area now counts Warden requests without answering them, and
  logs the warning and the redirect reply.
  ```

**S7 (accepted by the maintainer (P2-5)):** the area does not decrypt
`SMSG_WARDEN_DATA`. The key needs the session key, which no area context
carries (`AreaRuntimeCtx`, contract 1.2), and the area import allow-list
has no `#wow/crypto` (contract 1.12). Counting the requests is enough to
tell the agent that Warden is on (design 5.18 open point on Warden).

---

## Dead opcodes

The 11 `relevant=no` rows of the unit (design 5.18 "Dead"). Each goes
into its code area's `dead` list with a `dead` proof row. Lines are in
AzerothCore `Server/Protocol/Opcodes.cpp`.

| Opcode | Code area | Why it is dead | Evidence |
|---|---|---|---|
| `CMSG_BOOTME` 0x001 | `guard` | `STATUS_NEVER`, `Handle_NULL`; the server logs "not allowed opcode" | `:132`; `Server/WorldSession.cpp:529-532` |
| `CMSG_DBLOOKUP` 0x002 | `guard` | `STATUS_NEVER`, `Handle_NULL` | `:133` |
| `CMSG_TELEPORT_TO_UNIT` 0x009 | `guard` | `Handle_NULL`: accepted and ignored | `:140` |
| `MSG_MOVE_TELEPORT_CHEAT` 0x0C6 | `guard` | `STATUS_NEVER`, `Handle_NULL`, no send site | `:329` |
| `CMSG_MOVE_SET_RAW_POSITION` 0x0E1 | `guard` | `STATUS_NEVER`, `Handle_NULL` | `:356` |
| `SMSG_KICK_REASON` 0x3C5 | `guard` | no send site | `:1096` |
| `SMSG_REDIRECT_CLIENT` 0x50D | `guard` | no send site | `:1424` |
| `SMSG_INVALIDATE_PLAYER` 0x31C | `charscreen` | no send site | `:927` |
| `CMSG_GMTICKETSYSTEM_TOGGLE` 0x29A | `tickets` | registered as a server opcode with `STATUS_NEVER`; no client handler | `:797` |
| `SMSG_GM_TICKET_STATUS_UPDATE` 0x328 | `tickets` | no send site | `:939` |
| `SMSG_GMRESPONSE_DB_ERROR` 0x4EE | `tickets` | no send site | `:1393` |

Relevant rows that cannot occur with the default config stay in scope
with mock proof (S4): `SMSG_PLAY_TIME_WARNING`,
`TC9_SMSG_READY_FOR_REDIRECT`, `SMSG_SET_PLAYER_DECLINED_NAMES_RESULT`,
`SMSG_WHOIS`, and `SMSG_CHARACTER_LOGIN_FAILED`, which needs a server
condition no worker can make.

## COMPLETE

## Seed rulings (SEED-1)

The coordinator rules every contract issue, lease request and decision of
this unit that a wave-1 task (`session-1`, `session-2`, `session-5`)
meets, before `SEED-1`. Contract issues 4, 5 and 7 and decisions S1, S2,
S3 and S6 are met only by wave-4 tasks (`session-6` to `session-14`), so
they are not ruled here; the `SEED-4` ruling pass rules them. S4 and S5
are ruled here only for the wave-1 tasks. No ruling amends the contract
or the design. Each ruling is **accepted by the maintainer (P2-5)**.

| Id | Issue | Ruling | Status |
|---|---|---|---|
| SR1-session-1 | Contract issue 1: "Where the ping loop lives (session-2) ... The plan keeps the loop in `client-connection.ts` under lease and gives it the `login` store: `startPingLoop(conn, login, intervalMs)` calls `login.nextPing(now)`" | Stands. `startPingLoop(conn, intervalMs)` (now at `client-connection.ts:144`) becomes `startPingLoop(conn, login, intervalMs)`, with `login: LoginStore` imported as a type from `#wow/areas/login/store`. `stores.areas.login` has the concrete `LoginStore` type (contract 1.3, `AreaStores`), so `nextPing` needs no cast. The only call site passes `stores.areas.login` and keeps `config.pingIntervalMs ?? 30_000`. `nextPing` only records and returns; it sends nothing and arms no timer (contract 1.2). The line numbers of the task body (`client.ts:370`, `client-connection.ts:138-148`) have moved since T-2 and move again with S0-1b; the builder finds each edit by its symbol | accepted by the maintainer (P2-5) |
| SR1-session-2 | Contract issue 2: "`SMSG_ADDON_INFO` has no count, and the live body may be empty ... The missing size prefix in `CMSG_AUTH_SESSION` is a `protocol/world.ts` fix outside every session lease: `session-1` reports it with the measured body size and does not fix it" | Stands. The count-free parser stands. The coordinator checked both halves: AzerothCore reads a `u32` size before the zlib block and returns when the size is over 0xFFFFF (`Server/WorldSession.cpp:1263-1278`), and Peon writes the zlib block right after the digest with no size (`protocol/world.ts:122`). `session-1` does not edit `protocol/world.ts`. It reports the measured 0x2EF body size, and the coordinator decides after `session-1` lands whether a `COORD-<n>` commit or a later lease adds the size. That decision does not block any wave-1 task | accepted by the maintainer (P2-5) |
| SR1-session-3 | Contract issue 3: "Login failure has no area row ... So no task takes the `runtime/connection.ts` lease" | Stands. No task of this unit takes the harness `runtime/connection.ts` lease; the named reason travels in the error message of `selectCharacter`. `session-5` does not edit `packages/harness/src/areas/login/area.ts`: its Files list does not name it, and a `logout_cancelled` event with no rule writes one fallback row, which `journal(about: "log")` hides (contract 1.9). A `login_failed` event never reaches the router, because `worldSession` rejects before a handle exists | accepted by the maintainer (P2-5) |
| SR1-session-4 | Contract issue 6: "Probe flow signature ... The exact signature could not be determined before T-3 lands" (`session-5`). `session-5` step 3: "send `CMSG_LOGOUT_REQUEST` through the probe's sender, wait 2 s, call `handle.login.act.cancelLogout()` ... It records `SMSG_LOGOUT_RESPONSE` and 0x04F from the probe's received list" | T-3 has landed. The flow is `packages/devtools/src/probe-flows/login-logout-cancel.ts` and exports `flow: ProbeFlow = { name: "login-logout-cancel", usage, run }`; `loadFlows` refuses a flow whose `name` is not its file stem. `FlowContext` is `{ handle, args, settle }`: a flow has no sender and no received list. So the logout request is a probe step before the flow, and the command of step 4.2 becomes `mise protocol:probe <ACCOUNT> --send CMSG_LOGOUT_REQUEST --flow login-logout-cancel --expect SMSG_LOGOUT_RESPONSE --expect SMSG_LOGOUT_CANCEL_ACK --wait 40` (steps run in order, `probe-run.ts:118-124`). The flow sleeps 2 s with `Bun.sleep`, awaits `handle.login.act.cancelLogout()`, then sleeps 25 s with `Bun.sleep` and returns `{ cancelled: true }`. A completed logout does not close the socket (the server returns the account to the character screen), so neither `handle.closed` nor a later pong shows that the cancel held. The proof that the cancel held is `SMSG_LOGOUT_CANCEL_ACK` in the trace and no `SMSG_LOGOUT_COMPLETE` row in the report's `counts.seen` or in `packets.jsonl` after the 25 s wait; the builder reads the report for it. `settle` gives up after 5 s (`SETTLE_MS`), so every longer wait is the flow's own sleep. The two `--expect` rows and the trace record 0x04B's reply and 0x04F. The flow does not call `handle.logout()`, because that closes the session when the logout ends. T-3 gives flows no per-flow test, so the "(and its test, if T-3 gives flows tests)" file is not written | accepted by the maintainer (P2-5) |
| SR1-session-5 | `session-2` step 4.2: "Record the round trips from `handle.login.state().link` as the flow prints it" | The `login` flow is T-3's file (`probe-flows/login.ts`, not a `login-*.ts` file of this unit) and prints the place only. `session-2` writes no flow and does not edit `login.ts`. It reads each round trip from the trace: the `at` of the `out` `CMSG_PING` row and of the `in` `SMSG_PONG` row that echoes its sequence (`TraceRow.at`, `packet-trace.ts:7`). The command stands: `--expect` is checked only at finish and does not end the wait (only `--until` does, `probe-sink.ts:88-100`), so `--wait 70` holds the session for the pings at about 30 s and 60 s | accepted by the maintainer (P2-5) |
| SR1-session-6 | "Leases wanted (contract 2.7, D12, one task at a time): `client-connection.ts` (session-2, session-5, session-6), `client.ts` (session-2, session-6), `logout.ts` (session-5)"; the bodies also edit `client.test.ts`, a "client-connection test" and `logout.test.ts` | The leases go as the plan "Leases" table queues them. `session-2` holds `packages/core/src/wow/client-connection.ts` (`startPingLoop` only) and `packages/core/src/wow/client.ts` (the one `startPingLoop` call). When `session-2` lands, `client-connection.ts` goes to `session-5` (`authenticateWorld`, `selectCharacter`) and `client.ts` waits for `session-6` (wave 4). `session-5` holds `packages/core/src/wow/logout.ts`; when it lands, `client-connection.ts` waits for `session-6` and `logout.ts` has no next holder. `protocol/world.ts` is not assigned at `SEED-1`. A lease on a legacy file also covers its colocated test file of the same stem and nothing else. No `client-connection.test.ts` exists, so the holder creates it; the "client-connection test" of `session-2` and `session-5` goes there, not into `client.test.ts`, which `session-5` does not hold. `session-2` edits `client.test.ts` only at the `pingIntervalMs: 1` test | accepted by the maintainer (P2-5) |
| SR1-session-7 | `session-5` step 2: "If a lint rule refuses a legacy import of an area module, stop as `blocked` and name the rule"; the race and the queue wait of the same step | Legacy core files may import `#wow/areas/login/*` (contract 0.3: core runtime imports `#wow/*`). Contract 1.12 limits only imports out of an area, and `biome.json` has no rule on imports into `#wow/areas/*` [M, `rg areas biome.json config/biome.grit`], so the `blocked` clause is not expected to fire and stays as a fallback. `dispatch.expect` rejects after its `timeoutMs` (default 10 s, `protocol/world.ts:226-234`), so the losing side of the `selectCharacter` race ends in `.catch(ignoreFailure)` (AGENTS.md). In `authenticateWorld` each wait for the next `SMSG_AUTH_RESPONSE` passes the time left of the 10-minute queue cap as `timeoutMs`, because the server sends a new position only when it changes. `requestLogout` changes its resolved value to `{ outcome, reason? }`; its one caller (`client.ts`, `.then(close)`) ignores the value, so `session-5` does not edit `client.ts` | accepted by the maintainer (P2-5) |
| SR1-session-8 | Proposed `owns` for `login`: "`SEED-1` ... `owns` (relevant) ... (12) ... `stubs` at seed `SMSG_TUTORIAL_FLAGS`, `SMSG_ACCOUNT_DATA_TIMES`, `SMSG_FEATURE_SYSTEM_STATUS`"; `session-1` step 6: "`opcodes.ts`: delete the three `stubs` lines" | `SEED-1` seeds `login` with the split of this file: the 12 `owns` names, the three `stubs` entries with the labels they have in `protocol/stubs.ts:47-49` ("Account data", "System features", "Tutorial flags"), no `dead`. The seed commit moves those three lines out of `STUBS` (contract 1.5). GR-6 freezes `protocol/stubs.ts` for tasks, not for a seed commit. The five other session areas are seeded by `SEED-4` | accepted by the maintainer (P2-5) |
| SR1-session-9 | `session-1` step 9: "a trace in which all six rows are `handled` and no notice names any of them prove the six live" | The evidence is the absence of a `not_implemented` notice for each of the six opcodes in the probe report's `notices`, together with the parsed state; the outcome `handled` alone proves nothing for the three opcodes that were stubs (GR-20). The same holds for `SMSG_PONG` in `session-2` | accepted by the maintainer (P2-5) |
| SR1-session-10 | Decision S4: rows that cannot occur with the default config "stay relevant with mock proof", for `SMSG_CHARACTER_LOGIN_FAILED` (`session-5`) | Stands for `session-5`: `SMSG_CHARACTER_LOGIN_FAILED` and the queue form of `SMSG_AUTH_RESPONSE` get mock proof from the AzerothCore writers, and `SMSG_CHARACTER_LOGIN_FAILED` goes into `unseen`. The other S4 rows wait for `SEED-4` | accepted by the maintainer (P2-5) |
| SR1-session-11 | Decision S5: "session-1, 2, 5, 6 and 7 rerun `t1-walk-to-npc`, `t7-halt-resume` and `t3-ghostlands-kill` with the D17 gates"; the bodies write `--round <n>` | Stands for `session-1`, `session-2` and `session-5`. The round is 11 (a task's own runs in phase A, contract 3.6 and the plan "Eval loop"). Each scenario runs in `proto-session` as replica 1 in `session-1`, 2 in `session-2` and 3 in `session-5` (`--replica <k>`). A single `t7-halt-resume` failure runs again with the next free replica after 3 before it counts | accepted by the maintainer (P2-5) |

## Build rulings

| Id | Issue | Ruling | Status |
|---|---|---|---|
| BR-session-5-1 | `session-5` step 2 names the `authenticateWorld` codes from `SharedDefines.h`, which fixes two wrong names that `packages/core/src/wow/client.test.ts` pins: the test for 0x0D expects "World auth failed: system error" (`client.test.ts:96,104`) and the test for 0x15 expects "World auth failed: account in use" (`client.test.ts:110,118`). 0x0D is `AUTH_FAILED` and 0x15 is `AUTH_UNKNOWN_ACCOUNT` (`src/server/shared/SharedDefines.h:3585,3593`). `client.test.ts` is not leased to `session-5` (SR1-session-6), and these two tests are the only failures of `mise ci:checks` (4085 pass, 2 fail) | The coordinator gives `session-5` a narrow lease on `packages/core/src/wow/client.test.ts`, limited to these two tests, in the same way SR1-session-6 gives `session-2` the `pingIntervalMs: 1` test. The `client.ts` lease chain does not change: `session-2` has landed, `session-6` is the next holder and has not started, so no holder conflicts. The edits are exactly these: the title at `:96` becomes "rejects with named message for auth failed (0x0d)" and `:104` expects "World auth failed: failed"; the title at `:110` becomes "rejects with named message for unknown account (0x15)" and `:118` expects "World auth failed: unknown account". The step 2 table (`client-connection.ts`, `AUTH_FAILURES` from 0x0D) gives these strings. The builder makes the edit in its own `session-5` commit and changes nothing else in the file. The builder then runs `mise ci:checks` again and after that the step 5 eval reruns (SR1-session-11) | accepted by the maintainer (P2-5) |
