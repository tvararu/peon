# Protocol coverage: guild (key: guild)

Plan index: [2026-09-27-protocol-coverage-plan.md](../2026-09-27-protocol-coverage-plan.md).
Contract: [contract.md](contract.md). Design: section 5.20 of
[2026-09-27-protocol-coverage-design.md](../2026-09-27-protocol-coverage-design.md).

The `guild` unit gives the character the whole guild: guild info, ranks
and rank rights, notes, info text, permissions, the event log, the
emblem, the guild bank (money, tabs, items, text, logs), guild charters
(buy, offer, sign, rename, turn in) and the calendar (events, invites,
answers, moderators, guild filter, arena team, raid lockouts). It also
fixes the body gaps of the four guild opcodes that core handles today.
The agent gets three new tools (contract 1.9): `guild`, `guild_bank` and
`calendar`, all kind `action`, and `interact do:"repair"` gains
`from: "guild"`.

- **Rows.** 77 rows in the research table for area `guild`: 74 relevant
  and 3 dead. The verify reports move no opcode into or out of this area
  and mark no further row dead [M: a case-insensitive search of every
  verify report for guild, petition, charter, tabard and calendar finds
  only the count check "guild admin 15, bank 12, charters 14, calendar
  36: confirmed"]. Every relevant opcode is in exactly one task below.
  The dead rows are listed at the end.
- **Phase:** 4 for every task. Design 5.1 puts `guild` whole in wave 4
  (the long tail), and N22 pulls no guild task into wave 1.
- **Worktree:** `proto-guild`, created by the coordinator with the
  command of contract 0.1; branch `proto/area-guild` (D19). One task at a
  time, in the order of this file.
- **Code areas** (design 5.1): `guildadmin` (guild-1 to -4, -14, -15),
  `guildbank` (guild-5, -6, -16), `charters` (guild-7, -8) and
  `calendar` (guild-9 to -13, -17). `guild` itself is a harness core
  domain, so no code area has that name. The first task of each code
  area creates its `docs/areas/<area>.md`: guild-1, guild-5, guild-7 and
  guild-9.
- **Scenarios** (design 5.20; tier 9 from design 5.2): `t9-guild-admin`,
  `t9-guild-join`, `t9-guild-charter`, `t9-guild-tabard`,
  `t9-guild-bank-money`, `t9-guild-bank-items`, `t9-calendar-plan`. The
  plan index does not exist at the time of writing, so the tier is the
  design's (contract 3.7, D14).

Code lines are at `71fba0ab` [M: read for this plan]. AzerothCore paths
are relative to `src/server/game/` unless they start with `src/` or
`data/` (contract 0.5); wowm paths are relative to
`wow_message_parser/wowm/world/`. Core paths without a prefix are under
`packages/core/src/wow/`. Marks follow the contract: [M] read or run,
[I] inferred.

## Fixed names for this unit

These follow contract D7 and 1.8. A builder adds private helpers but no
second public name. Names the contract does not fix are plan decisions,
accepted by the maintainer (P2-5).

| Name | File | Created by |
|---|---|---|
| `GUILDADMIN_OPCODES`, `GUILDBANK_OPCODES`, `CHARTERS_OPCODES`, `CALENDAR_OPCODES` | `areas/<area>/opcodes.ts` | `SEED-4` |
| `guildadminArea`, `guildbankArea`, `chartersArea`, `calendarArea` | `areas/<area>/area.ts` | `SEED-4`; filled by the first task of each area |
| `GuildadminState`, `GuildadminEvent`, `GuildadminStore` | `areas/guildadmin/store.ts` | guild-1 |
| `GuildadminActs`, `guildadminRuntime` | `areas/guildadmin/runtime.ts` | guild-1 |
| `GuildbankState`, `GuildbankEvent`, `GuildbankStore`, `GuildbankActs`, `guildbankRuntime` | `areas/guildbank/store.ts`, `runtime.ts` | guild-5 |
| `ChartersState`, `ChartersEvent`, `ChartersStore`, `ChartersActs`, `chartersRuntime` | `areas/charters/store.ts`, `runtime.ts` | guild-7 |
| `CalendarState`, `CalendarEvent`, `CalendarStore`, `CalendarActs`, `calendarRuntime` | `areas/calendar/store.ts`, `runtime.ts` | guild-9 |
| `writePackedTime(w: PacketWriter, t: PackedTime): void`, `packPackedTime(t: PackedTime): number` | `protocol/packed-time.ts` (lease) | guild-1 |
| test packet builders `<area><Opcode>Body(...)` | `packages/core/test-support/areas/<area>.ts` | the first task of each area |
| `guildadminHarness`, `guildbankHarness`, `chartersHarness`, `calendarHarness` | `packages/harness/src/areas/<area>/area.ts` | `SEED-4` |
| `guildTool` | `packages/harness/src/areas/guildadmin/tool.ts` (charter part in `tool-charter.ts`) | guild-14, guild-15 |
| `guildBankTool` | `packages/harness/src/areas/guildbank/tool.ts` | guild-16 |
| `calendarTool` | `packages/harness/src/areas/calendar/tool.ts` | guild-17 |
| probe flows | `packages/devtools/src/probe-flows/<area>-<name>.ts` | per task |

### State placement (a plan decision, accepted by the maintainer (P2-5))

Design 5.20 extends the legacy `GuildStore` with info, emblem, rank
rights, permissions and the event log. This plan puts every new field in
the area stores instead, and changes the legacy guild files only for the
body fixes of guild-2. Reasons: `LegacyViews.guild` returns `GuildRoster`
(contract 1.2), and a wider `GuildRoster` would change a frozen type;
the area stores can read the legacy-owned opcodes through `peek` (N3);
the lease footprint stays at one task.

- `guildadmin` peeks `SMSG_GUILD_ROSTER` (rank rights),
  `SMSG_GUILD_QUERY_RESPONSE` (emblem, rank count), `SMSG_GUILD_EVENT`,
  `SMSG_GUILD_COMMAND_RESULT` and `SMSG_GUILD_INVITE` (the harness rows of
  guild-14). All five go into `GUILDADMIN_OPCODES.uses`. The area parses
  them with the legacy parsers from `#wow/protocol/guild`, which the
  import allow-list permits (contract 1.12).
- `guildbank` peeks `SMSG_GUILD_EVENT` (bank codes 15-18) and
  `SMSG_GUILD_COMMAND_RESULT`.
- `charters` peeks `SMSG_GUILD_COMMAND_RESULT` (name taken, target in a
  guild, guild created).
- The legacy handlers stay the owners. The harness router keeps dropping
  `onGuildEvent` (`packages/harness/src/events/router.ts:214`); the
  guild log rows come from the `guildadmin` area events instead, with
  the domain `guildadmin` (contract 1.9: `Domain = CoreDomain | AreaName`).
- Entity reads (the vault's gameobject type and position, the
  character's `PLAYER_GUILDID` and `PLAYER_GUILDRANK`) go through
  `deps.getEntity` of `SessionDeps` (`session-stores.ts:20-21`), never an
  import of `entity-store` or a lease on `player-state.ts`.

### Seed ownership (a request to the coordinator for `SEED-4`)

| Code area | `owns` |
|---|---|
| `guildadmin` | `CMSG_GUILD_CREATE`, `SMSG_GUILD_DECLINE`, `CMSG_GUILD_INFO`, `SMSG_GUILD_INFO`, `CMSG_GUILD_DISBAND`, `MSG_SAVE_GUILD_EMBLEM`, `MSG_TABARDVENDOR_ACTIVATE`, `CMSG_GUILD_RANK`, `CMSG_GUILD_ADD_RANK`, `CMSG_GUILD_DEL_RANK`, `CMSG_GUILD_SET_PUBLIC_NOTE`, `CMSG_GUILD_SET_OFFICER_NOTE`, `CMSG_GUILD_INFO_TEXT`, `MSG_GUILD_PERMISSIONS`, `MSG_GUILD_EVENT_LOG_QUERY` (15) |
| `guildbank` | `CMSG_GUILD_BANKER_ACTIVATE`, `CMSG_GUILD_BANK_QUERY_TAB`, `SMSG_GUILD_BANK_LIST`, `CMSG_GUILD_BANK_SWAP_ITEMS`, `CMSG_GUILD_BANK_BUY_TAB`, `CMSG_GUILD_BANK_UPDATE_TAB`, `CMSG_GUILD_BANK_DEPOSIT_MONEY`, `CMSG_GUILD_BANK_WITHDRAW_MONEY`, `MSG_GUILD_BANK_LOG_QUERY`, `MSG_GUILD_BANK_MONEY_WITHDRAWN`, `MSG_QUERY_GUILD_BANK_TEXT`, `CMSG_SET_GUILD_BANK_TEXT` (12) |
| `charters` | the 14 `PETITION` rows plus `MSG_PETITION_RENAME` (14; guild-7 and guild-8 list them) |
| `calendar` | the 36 `CALENDAR` rows (guild-9 to guild-13 list the 34 relevant ones; the two `INVITE_NOTES` rows are dead) |

`SEED-4` moves the four stub lines into the areas: `SMSG_GUILD_INFO`
(`guildadmin`), `SMSG_GUILD_BANK_LIST` (`guildbank`),
`SMSG_CALENDAR_SEND_CALENDAR` and `SMSG_CALENDAR_EVENT_INVITE_ALERT`
(`calendar`), and writes the three dead rows into `dead` (N13).

## Leases and coordinator requests this unit needs

The coordinator assigns leases at the seed of wave 4 (contract 2.7). A
task that reaches one of these files without its lease stops as
`blocked`.

| File | Task | Edit | Holder before this unit |
|---|---|---|---|
| `protocol/packed-time.ts` and its test | guild-1 | add `writePackedTime` and `packPackedTime` next to the reader of S0-5 | S0-5 (contract 2.7 names `guild` as holder) |
| `protocol/guild.ts`, `guild-store.ts`, `world-handlers-guild.ts` and their tests | guild-2 | the body fixes of design 5.20 "Body gaps" | none |
| `client-social.ts` (the guild block, `client-social.ts:186-243`) and its test | guild-2 | the roster hang (#394) and the guild id source | **not in the contract 2.7 candidate list.** The coordinator adds the row, or guild-2 stops `blocked`. `client-connection.ts:129` stays untouched: it is frozen (contract 2.3), so the fix reads the guild id from the entity, as `client-chat.ts:16-17` already does |
| `protocol/vendor.ts` and its test | guild-16 | an optional guild-bank byte on `buildRepairAll` (`protocol/vendor.ts:110-116`), default 0 | economy, if an economy task holds it first |
| harness `tools/interact*.ts` (`interact.ts`, `interact-trainer.ts` and their tests) | guild-16 | `from: "guild"` on `do: "repair"` (`tools/interact-trainer.ts:177-222`) | the last of objects, quests, travel, pets, talents, economy in wave order |

**Coordinator requests** (each a `COORD-<n>` commit or a ruling; each is
accepted by the maintainer (P2-5)):

1. **Eval guild staging.** Five scenarios need the scenario character (or
   its partner) to lead a guild: `t9-guild-admin`, `t9-guild-join`,
   `t9-guild-tabard`, `t9-guild-bank-money`, `t9-guild-bank-items`.
   Contract 0.7 and 3.6 forbid `soap gm` inside an eval except the N30
   mail staging step, and the grader `setup` accepts only realm-service
   `{ endpoint, body }` rows
   (`packages/harness/src/grader/scenario.schema.json:222-237`). Whether
   the realm service has a guild endpoint could not be determined. No
   tooling task adds a GM setup step. The request: rule one of (a) a
   grader setup step that runs `soap gm guild-create Fac<letters>` before
   the baseline and `guild-delete` after the finish, as a second N30
   exception, built by a tooling lane; (b) a realm-service guild endpoint
   from the maintainer. guild-14, guild-15 (tabard) and guild-16 depend on
   the ruling. Without it, each of those scenarios lands as a bullet under
   "Not shown by any scenario" (D16) with the gap "needs a staged guild",
   and the task is not blocked. `t9-guild-charter` and
   `t9-calendar-plan` need no guild.
2. **Console check names.** `read guild <name>` (T-6, T-10) needs the
   guild name in the scenario file, but a staged name is random. With
   request 1 (a) the setup step should expose the name to the console
   check; how could not be determined. Until then the guild scenarios
   grade with game-log rows and money and item truth only.
3. **`client-social.ts` lease** (table above).

## Live staging (every task that needs a guild)

- Characters: `mise factory soap create max80` (preset spawn in Dalaran,
  map 571, `packages/factory/src/soap-presets.ts:55-61`). A second or
  third account is made the same way, same faction.
- Positions from base data (`data/sql/base/db_world/creature.sql`,
  `gameobject.sql`) [M base, I live]: guild master Andrew Matthews
  (entry 28774, npcflag `0xC0001`: gossip, petitioner, tabard designer)
  at (5767.96, 627.19); Guild Vaults (gameobject type 34, entries
  193086-193089) at (5974.59, 634.29) and (5959.15, 593.50); arena
  organizers (npcflag `0x40000`) at (5853.55, 667.39) and
  (5799.17, 599.56). A flow reaches them with `walkTowardPoint`
  (`client.ts:232`). The first live run checks the live positions.
- A guild: `.guild create` needs the target online
  (`src/server/scripts/Commands/cs_guild.cpp:57-60`). So start
  `tmp/puppet-<A> start --json`, run
  `mise factory soap gm <A> guild-create Fac<letters>` (T-5), stop the
  puppet, then run the probe (the probe refuses while the puppet runs).
  Names are `Fac` plus letters only (design 4.3; whether digits pass
  `IsValidCharterName` could not be determined).
- A second member: `mise factory soap gm <A> guild-invite <B> Fac<letters>`
  (T-5; `.guild invite` does not need the target online,
  `cs_guild.cpp:118-141`).
- Money and items: `mise factory soap gm <A> money <copper>` and
  `items <id>:<n>` (T-5).
- Cleanup, in the same run (contract 0.7, N30): disband with the
  guild-1 act (`CMSG_GUILD_DISBAND`), or `soap gm <A> guild-delete
  Fac<letters>` (T-6) if the act failed; then `soap gm <A> read guild
  Fac<letters>` must fail; then delete partner accounts before the
  leader's (a deleted sole leader disbands the guild,
  `Guilds/Guild.cpp:2345-2349`); then `mise factory soap delete` every
  account.

---

## Task guild-1: packed-time writer, guild info and disband

- **codeArea:** `guildadmin`. **Size:** S. **Phase:** 4.
- **Files:**
  - Edit (lease): `packages/core/src/wow/protocol/packed-time.ts`,
    `protocol/packed-time.test.ts`
  - Edit: `packages/core/src/wow/areas/guildadmin/opcodes.ts` (remove the
    `SMSG_GUILD_INFO` stub line; `unseen: ["CMSG_GUILD_CREATE"]`),
    `areas/guildadmin/area.ts`
  - Create: `areas/guildadmin/protocol.ts`, `protocol.test.ts`,
    `store.ts`, `runtime.ts`, `area.test.ts`
  - Create: `packages/core/test-support/areas/guildadmin.ts`
  - Edit: `packages/harness/src/areas/guildadmin/area.ts`; create its test
  - Create: `packages/devtools/src/probe-flows/guildadmin-info.ts`
  - Create: `docs/areas/guildadmin.md`
  - Regenerate: `docs/protocol-coverage/guildadmin.md`
- **Depends on:** `SEED-4`, S0-5 (`readPackedTime`), T-2, T-3, T-5, T-6.
- **Opcodes:** `CMSG_GUILD_INFO`, `SMSG_GUILD_INFO`, `CMSG_GUILD_DISBAND`,
  `CMSG_GUILD_CREATE` (builder only, N25).

**Steps:**

- [ ] **Step 1: Failing packed-time writer test** in
  `protocol/packed-time.test.ts`: `packPackedTime` of
  `{ year: 2026, month: 9, day: 27, weekday: 0, hour: 20, minute: 5 }`
  gives the number that `parsePackedTime` turns back into the same
  object; `writePackedTime` writes that number as one `u32`. The layout
  is AzerothCore's (`src/server/shared/Packets/ByteBuffer.cpp:95-107,137-141`):
  bits 0-5 minute, 6-10 hour, 11-13 weekday, 14-19 day minus 1, 20-23
  month (0-11), 24-28 year minus 2000. Nothing converts to epoch (design
  5.20 "Stores and events"). Run
  `mise test packages/core/src/wow/protocol/packed-time.test.ts` and see
  it fail on the missing export.
- [ ] **Step 2: Implement** `packPackedTime` and `writePackedTime` in
  `protocol/packed-time.ts`. Out-of-range fields throw.
- [ ] **Step 3: Test builders** in
  `packages/core/test-support/areas/guildadmin.ts`:
  `guildadminGuildInfoBody({ name, created, members, accounts })` from
  `Server/Packets/GuildPackets.cpp:50-58` (CString name, packed time,
  `u32` members, `u32` accounts; sender `Guilds/Guild.cpp:1824-1834`).
- [ ] **Step 4: Failing tests.** `areas/guildadmin/protocol.test.ts`:
  `parseGuildInfo` returns the four fields with `created` as a
  `PackedTime`; `buildGuildCreate("Fac")` gives the CString body that
  `Server/Packets/GuildPackets.cpp:45-48` reads; `CMSG_GUILD_INFO` and
  `CMSG_GUILD_DISBAND` have empty bodies. `areas/guildadmin/area.test.ts`
  through `areaRig("guildadmin")`: an injected `SMSG_GUILD_INFO` sets
  `info` and emits `info`; `act.info()` sends `CMSG_GUILD_INFO` and
  resolves with the injected reply; with no reply it resolves
  `{ status: "no_reply" }` after 5 s (fake timers inside `try`/`finally`);
  `act.disband({ confirm: false })` sends nothing and returns
  `{ status: "refused" }`; `act.disband({ confirm: true })` sends
  `CMSG_GUILD_DISBAND` and resolves on a peeked `SMSG_GUILD_EVENT`
  `GE_DISBANDED` (code 8, `Guilds/Guild.cpp:1123`). Run
  `mise test packages/core/src/wow/areas/guildadmin` and see it fail.
- [ ] **Step 5: Implement.** `protocol.ts`: `parseGuildInfo`,
  `buildGuildCreate` (no act sends it: the handler only logs a
  "hacking attempt", `Handlers/GuildHandler.cpp:37-40`). `store.ts`:
  `GuildadminState = { info: GuildInfo | undefined; disbanded: boolean }`
  (later tasks add fields), `GuildadminEvent` with `info` and
  `disbanded`. `register` owns `SMSG_GUILD_INFO` and peeks
  `SMSG_GUILD_EVENT` for code 8 only; `uses` gains `SMSG_GUILD_EVENT`.
  `runtime.ts`: `GuildadminActs = { info, disband }`; each waits with
  `ctx.until` and a 5 s timeout and resolves `no_reply` on the timeout.
- [ ] **Step 6: Harness rule.** `guildadminHarness` gets an `event` rule:
  `disbanded` writes one `wake` row `disbanded`; `info` returns `[]`
  (the tool of guild-14 reports it). Test it with the rule input fixture
  of S0-3.
- [ ] **Step 7: Live proof.** Stage a guild (section "Live staging").
  The flow `guildadmin-info` calls `act.info()`, then
  `act.disband({ confirm: true })`. Run
  `mise protocol:probe <A> --flow guildadmin-info --expect SMSG_GUILD_INFO --expect SMSG_GUILD_EVENT --bodies`.
  Check the name in the info body and code 8 in the event. Then
  `soap gm <A> read guild Fac<letters>` must fail. Delete the account.
- [ ] **Step 8: Docs.** Create `docs/areas/guildadmin.md` with the fixed
  headings of contract 3.8. "Left out": `SMSG_GUILD_DECLINE` (dead) and
  `CMSG_GUILD_CREATE` (N25: the handler writes a worldserver log line,
  `Handlers/GuildHandler.cpp:39`). Proof rows for the four opcodes. Run
  `mise protocol:coverage`.
- [ ] **Step 9: Checks.** `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_GUILD_INFO` | live | flow `guildadmin-info`; reader `Handlers/GuildHandler.cpp:89-95` |
| `SMSG_GUILD_INFO` | live | flow `guildadmin-info`; writer `Server/Packets/GuildPackets.cpp:50-58` |
| `CMSG_GUILD_DISBAND` | live | flow `guildadmin-info` (`GE_DISBANDED` follows); handler `Handlers/GuildHandler.cpp:133-139` |
| `CMSG_GUILD_CREATE` | builder (`unseen`) | builder test; reader `Server/Packets/GuildPackets.cpp:45-48` |

**Commit:**

```
feat: Read guild info and disband a guild

The character can read its guild's name, creation date and size, and a
leader can disband the guild. The packed-time writer lands here because
the calendar tasks build on it.
```

## Task guild-2: fix the handled guild opcodes

- **codeArea:** `guildadmin`. **Size:** M. **Phase:** 4.
- **Files:**
  - Edit (lease): `packages/core/src/wow/protocol/guild.ts`,
    `protocol/guild.test.ts`, `guild-store.ts`, `guild-store.test.ts`,
    `world-handlers-guild.ts`, `world-handlers-guild.test.ts`
  - Edit (lease, coordinator request 3): `client-social.ts` and its test
  - Edit: `packages/core/test-support/areas/guildadmin.ts`,
    `docs/areas/guildadmin.md` ("Wire notes")
  - Create: `packages/devtools/src/probe-flows/guildadmin-roster.ts`
- **Depends on:** guild-1, T-5, T-6, coordinator request 3.
- **Opcodes:** none new. It fixes the bodies of the handled
  `SMSG_GUILD_ROSTER`, `SMSG_GUILD_QUERY_RESPONSE`, `SMSG_GUILD_EVENT`
  and `SMSG_GUILD_COMMAND_RESULT` (design 5.20 "Body gaps"). A `fix:`
  change: no behaviour is new, existing parses were wrong.

**Steps:**

- [ ] **Step 1: Test builders** in
  `packages/core/test-support/areas/guildadmin.ts`:
  `guildadminRosterBody({ motd, info, ranks, members })` with each rank's
  rights, gold per day and six `(flags, slots)` pairs
  (`Server/Packets/GuildPackets.cpp:194-206`);
  `guildadminQueryResponseBody({ id, name, rankNames, emblem, rankCount })`
  (`:35-40`); `guildadminEventBody({ code, params, guid? })`;
  `guildadminCommandResultBody({ command, name, result })`.
- [ ] **Step 2: Failing tests.**
  - `protocol/guild.test.ts`: `parseGuildRoster` returns each rank's
    rights, gold per day and tabs; `parseGuildQueryResponse` returns the
    five emblem values and the rank count; `GuildCommand` has AC's values
    (CREATE 0, INVITE 1, QUIT 3, ROSTER 5, PROMOTE 6, DEMOTE 7, REMOVE 8,
    CHANGE_LEADER 10, EDIT_MOTD 11, GUILD_CHAT 13, FOUNDER 14,
    CHANGE_RANK 16, PUBLIC_NOTE 19, VIEW_TAB 21, MOVE_ITEM 22, REPAIR 25;
    `Guilds/Guild.h:97-115`); `GuildCommandResult` has 20, 25, 26, 28 and
    29 (`Guild.h:138-142`); `GuildEventCode` has 10, 11, 15, 16, 17 and 18.
  - `world-handlers-guild.test.ts`: an event with code 17 and the one
    parameter `"0000000000000C80"` emits
    `{ type: "bank_money", balance: 3200n }` (the balance is 16 hex
    digits, most significant first, `Guilds/Guild.cpp:1731-1732`,
    `src/common/Utilities/Util.cpp:545-564`); codes 10, 11, 15, 16 and 18
    emit `rank_updated`, `rank_deleted`, `bank_tab_purchased`,
    `bank_tab_updated` and `bank_reset`; a command result with result 0
    emits `command_result` (today it is dropped,
    `world-handlers-guild.ts:105`).
  - `guild-store.test.ts`: `get()` returns a roster with no members when
    the guild id is known and the query response arrived (today it
    returns `undefined`, `guild-store.ts:76-77`).
  - `client-social.test.ts`: `requestGuildRoster` resolves `undefined`
    when a `SMSG_GUILD_COMMAND_RESULT` command 5, result 9 arrives
    instead of the roster (`Handlers/GuildHandler.cpp:101-104`; #394);
    after a join in the session it sends `CMSG_GUILD_QUERY` with the id
    from the self entity's `PLAYER_FIELDS.GUILDID`, like
    `client-chat.ts:16-17`.
  Run `mise test packages/core/src/wow/protocol/guild.test.ts` and the
  other three files and see them fail.
- [ ] **Step 3: Implement** the fixes in the leased files. The new
  `GuildEvent` variants go into the union in `guild-store.ts:24`. The
  formatter still prints nothing for result 0.
- [ ] **Step 4: Live proof.** One `max80` account with no guild: the
  flow `guildadmin-roster` calls `requestGuildRoster()` and checks that it
  resolves `undefined` before its timeout. Then stage a guild with a
  second member (a second account, `guild-invite`), run the flow again:
  the roster has rank rights, the query response has the emblem fields
  and rank count. Run
  `mise protocol:probe <A> --flow guildadmin-roster --expect SMSG_GUILD_COMMAND_RESULT --expect SMSG_GUILD_ROSTER --expect SMSG_GUILD_QUERY_RESPONSE --bodies`.
  The new event codes are proven live by guild-3 (10, 11) and guild-5
  and guild-6 (15-18). Clean up.
- [ ] **Step 5: Docs.** In `docs/areas/guildadmin.md` "Wire notes": the
  command enum follows `Guilds/Guild.h:97-115`, not
  `guild/smsg_guild_command_result.wowm`; the bank balance format of
  `GE_BANK_MONEY_SET`. No proof row changes (these opcodes are not in
  `owns`).
- [ ] **Step 6: Checks.** `mise ci:checks`.

**Proof:** live for the roster hang and the parse fixes (flow
`guildadmin-roster`); unit tests for the event codes until guild-3,
guild-5 and guild-6 capture them.

**Commit:**

```
fix: Parse the full guild roster and events

The roster request hung for a character with no guild, and the guild
parsers dropped rank rights, the emblem, bank events and success
results. Later guild tasks need all of them.
```

## Task guild-3: ranks, notes, info text, permissions and event log

- **codeArea:** `guildadmin`. **Size:** M. **Phase:** 4.
- **Files:**
  - Edit: `areas/guildadmin/opcodes.ts` (`uses` gains
    `SMSG_GUILD_ROSTER`, `SMSG_GUILD_COMMAND_RESULT`),
    `areas/guildadmin/protocol.ts`, `protocol.test.ts`, `store.ts`,
    `runtime.ts`, `area.test.ts`; create `areas/guildadmin/limits.ts` if
    `runtime.ts` passes 500 lines
  - Edit: `packages/core/test-support/areas/guildadmin.ts`
  - Create: `packages/devtools/src/probe-flows/guildadmin-ranks.ts`
  - Edit: `docs/areas/guildadmin.md`; regenerate
    `docs/protocol-coverage/guildadmin.md`
- **Depends on:** guild-2.
- **Opcodes:** `CMSG_GUILD_RANK`, `CMSG_GUILD_ADD_RANK`,
  `CMSG_GUILD_DEL_RANK`, `CMSG_GUILD_SET_PUBLIC_NOTE`,
  `CMSG_GUILD_SET_OFFICER_NOTE`, `CMSG_GUILD_INFO_TEXT`,
  `MSG_GUILD_PERMISSIONS`, `MSG_GUILD_EVENT_LOG_QUERY`.

**Steps:**

- [ ] **Step 1: Test builders:** `guildadminPermissionsBody({ rank, rights, goldPerDay, tabs, slots })`
  from `Server/Packets/GuildPackets.cpp:164-178`;
  `guildadminEventLogBody(entries)` from `:144-162` in AC's form: `u8`
  type from `GuildEventLogTypes` (1 invite, 2 join, 3 promote, 4 demote,
  5 uninvite, 6 leave; `Guilds/Guild.h:208-216`), `u64` player, `u64`
  other unless the type is 2 or 6, `u8` rank if the type is 3 or 4,
  `u32` seconds ago. The wowm file
  (`queries/msg_guild_event_log_query.wowm`) uses another enum;
  AzerothCore wins.
- [ ] **Step 2: Failing tests.** `protocol.test.ts`: `buildGuildRank`
  writes `u32 rank, u32 rights, CString name, u32 gold, 6 x (u32, u32)`
  as `GuildPackets.cpp:180-192` reads it; `buildGuildAddRank`,
  `buildGuildNote(name, note)` (both note opcodes, `:218-222`),
  `buildGuildInfoText` (`:213-216`); `parseGuildPermissions` reads
  gold per day as `i32` (`-1` unlimited); `parseGuildEventLog` handles
  each of the six types. `area.test.ts` (rig): an injected permissions
  reply sets `permissions` and emits `permissions`; the event-log reply
  sets `eventLog`; a peeked roster sets `ranks` with rights; the acts
  refuse locally before any send: a rank name over 15 characters, a note
  over 31, info text over 500 (`Server/Packets/GuildPackets.h:291,309,320`),
  an add at 10 ranks, a remove at 5 ranks (`Guilds/Guild.h:45-46`),
  `removeLowestRank` without `confirm`, and any act whose right the
  character's rank lacks (the rank from the peeked roster entry of the
  self guid); `addRank` resolves on a peeked `rank_updated`;
  `setNote` resolves on the next peeked roster; `setInfoText` sends, then
  asks for the roster and resolves when the info text matches, or
  `no_reply` (the server sends nothing, `Guilds/Guild.cpp:1305-1322`).
- [ ] **Step 3: Implement.** State gains `ranks`, `permissions`,
  `eventLog`; events `permissions`, `event_log`, `ranks`. Acts:
  `permissions()`, `eventLog()`, `setRank(rankId, spec)`,
  `addRank(name)`, `removeLowestRank({ confirm })`,
  `setNote(name, note, { officer })`, `setInfoText(text)`. The refusal
  names the missing right. A permissions query unsubscribes the member
  from bank pushes (`Guilds/Guild.cpp:1898-1901`); the act emits
  `permissions`, and guild-5's bank store marks itself stale on it (a
  peek there, not a cross-area import).
- [ ] **Step 4: Live proof.** Stage a guild, leader alone. The flow
  `guildadmin-ranks` adds a rank, renames it, removes it, sets the
  character's own public and officer note, sets the info text, asks for
  permissions and the event log. Run
  `mise protocol:probe <A> --flow guildadmin-ranks --expect MSG_GUILD_PERMISSIONS --expect MSG_GUILD_EVENT_LOG_QUERY --expect SMSG_GUILD_EVENT --bodies`.
  Check `GE_RANK_UPDATED` and `GE_RANK_DELETED` in the event bodies
  (`Guilds/Guild.cpp:1413,1672,1700`), the notes in the roster, and the
  info text with `soap gm <A> read guild Fac<letters>`. Clean up.
- [ ] **Step 5: Docs.** Wire note for the event log; proof rows. Run
  `mise protocol:coverage`.
- [ ] **Step 6: Checks.** `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_GUILD_RANK` | live | flow `guildadmin-ranks`; reader `Server/Packets/GuildPackets.cpp:180-192` |
| `CMSG_GUILD_ADD_RANK` | live | same; reader `Server/Packets/GuildPackets.cpp:208-211` |
| `CMSG_GUILD_DEL_RANK` | live | same; handler `Handlers/GuildHandler.cpp:217-223` |
| `CMSG_GUILD_SET_PUBLIC_NOTE` | live | same; reader `Server/Packets/GuildPackets.cpp:218-222` |
| `CMSG_GUILD_SET_OFFICER_NOTE` | live | same; handler `Handlers/GuildHandler.cpp:167-175` |
| `CMSG_GUILD_INFO_TEXT` | live | same, and `read guild`; reader `Server/Packets/GuildPackets.cpp:213-216` |
| `MSG_GUILD_PERMISSIONS` | live | same; writer `Server/Packets/GuildPackets.cpp:164-178` |
| `MSG_GUILD_EVENT_LOG_QUERY` | live | same; writer `Server/Packets/GuildPackets.cpp:144-162` |

**Commit:**

```
feat: Manage guild ranks, notes and logs

A guild leader can add, rename and remove ranks, write notes and the
info text, and read permissions and the event log. Local limits turn
the server's silent refusals into answers.
```

## Task guild-4: emblem and tabard vendor

- **codeArea:** `guildadmin`. **Size:** S. **Phase:** 4.
- **Files:**
  - Edit: `areas/guildadmin/opcodes.ts` (`uses` gains
    `SMSG_GUILD_QUERY_RESPONSE`), `protocol.ts`, `protocol.test.ts`,
    `store.ts`, `runtime.ts`, `area.test.ts`
  - Edit: `packages/core/test-support/areas/guildadmin.ts`
  - Create: `packages/devtools/src/probe-flows/guildadmin-tabard.ts`
  - Edit: `docs/areas/guildadmin.md`; regenerate the coverage file
- **Depends on:** guild-2.
- **Opcodes:** `MSG_SAVE_GUILD_EMBLEM`, `MSG_TABARDVENDOR_ACTIVATE`.

**Steps:**

- [ ] **Step 1: Test builders:** `guildadminSaveEmblemResultBody(code)`
  (`u32`, `Server/Packets/GuildPackets.cpp:453-458`),
  `guildadminTabardVendorBody(npc)` (guid, `Handlers/NPCHandler.cpp:67-72`).
- [ ] **Step 2: Failing tests.** `buildSaveGuildEmblem(npc, emblem)`
  writes the guid and five `u32` as `GuildPackets.cpp:443-451` reads;
  `buildTabardVendor(npc)`; `parseSaveEmblemResult` returns codes 0-5
  (`Guilds/Guild.h:218-226`). Rig: an injected emblem result emits
  `emblem_result { code }`; a peeked query response stores `emblem`;
  `act.saveEmblem(npc, emblem)` resolves on the result;
  `act.openTabardVendor(npc)` resolves on the echoed guid.
- [ ] **Step 3: Implement.** State gains `emblem`; events
  `emblem_result`, `tabard_vendor`, `emblem`.
- [ ] **Step 4: Live proof.** Stage a guild and 20 gold
  (`soap gm <A> money 200000`). The flow `guildadmin-tabard` walks to the
  guild master, opens the tabard vendor, saves an emblem, and waits for
  the query response. Expect result 0 and the new emblem values
  (`Guilds/Guild.cpp:1333-1339`). Then disband and repeat the save on the
  same character with no guild: result 2 (`Handlers/GuildHandler.cpp:251`).
  Run with `--expect MSG_SAVE_GUILD_EMBLEM --expect MSG_TABARDVENDOR_ACTIVATE --bodies`.
  Clean up.
- [ ] **Step 5: Docs** and `mise protocol:coverage`.
- [ ] **Step 6: Checks.** `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `MSG_SAVE_GUILD_EMBLEM` | live | flow `guildadmin-tabard`; writer `Guilds/Guild.cpp:126-131` |
| `MSG_TABARDVENDOR_ACTIVATE` | live | same; writer `Handlers/NPCHandler.cpp:67-72` |

**Commit:**

```
feat: Save a guild emblem at the tabard vendor

A guild leader can open the tabard designer and save an emblem, and
the character sees the result code and the new emblem.
```

## Task guild-5: bank open and money

- **codeArea:** `guildbank`. **Size:** M. **Phase:** 4.
- **Files:**
  - Edit: `areas/guildbank/opcodes.ts` (remove the `SMSG_GUILD_BANK_LIST`
    stub line; `uses`: `SMSG_GUILD_EVENT`, `SMSG_GUILD_COMMAND_RESULT`,
    `MSG_GUILD_PERMISSIONS`), `areas/guildbank/area.ts`
  - Create: `areas/guildbank/protocol.ts`, `protocol.test.ts`,
    `store.ts`, `runtime.ts`, `area.test.ts`
  - Create: `packages/core/test-support/areas/guildbank.ts`
  - Edit: `packages/harness/src/areas/guildbank/area.ts`; create its test
  - Create: `packages/devtools/src/probe-flows/guildbank-money.ts`
  - Create: `docs/areas/guildbank.md`; regenerate
    `docs/protocol-coverage/guildbank.md`
- **Depends on:** guild-2 (bank event codes), T-5, T-6.
- **Opcodes:** `CMSG_GUILD_BANKER_ACTIVATE`, `CMSG_GUILD_BANK_QUERY_TAB`,
  `SMSG_GUILD_BANK_LIST`, `CMSG_GUILD_BANK_DEPOSIT_MONEY`,
  `CMSG_GUILD_BANK_WITHDRAW_MONEY`, `MSG_GUILD_BANK_MONEY_WITHDRAWN`.

`guildbank` peeks `MSG_GUILD_PERMISSIONS`, which `guildadmin` owns. A
peek on another area's opcode is legal (N3; the owner is registered
before the peek pass).

**Steps:**

- [ ] **Step 1: Test builders:** `guildbankBankListBody({ balance, tab, withdrawalsLeft, full, tabs?, slots })`
  in AC's form (`Server/Packets/GuildPackets.cpp:285-329`): no content
  result byte; the tab list only when `tab == 0 && full`; an empty slot
  is `u8 slot, u32 0`; an item slot adds flags, random property, the seed
  when the property is not 0, count, enchant, charges and sockets.
  `guildbankMoneyLeftBody(value)` (`i32`, `:272-277`).
- [ ] **Step 2: Failing tests.** `protocol.test.ts`: a full tab-0 list
  with two tabs, a partial list with one filled and one empty slot, and
  an item with sockets and a random property each parse; the builders
  for activate (`:239-243`), query tab (`:265-270`), deposit
  (`:259-263`) and withdraw (`:279-283`). Rig (`area.test.ts`): a list
  merges by slot and item id 0 deletes the slot; a peeked
  `SMSG_GUILD_EVENT` code 17 sets `balance`; a peeked
  `MSG_GUILD_PERMISSIONS` sets `stale: true`; the acts refuse when the
  vault guid is not a known gameobject of type 34 in interaction range
  (from `deps.getEntity`; the range is the one the `objects` area uses,
  or 5 yards if none exists yet [I]); `open(vault)` resolves on the
  list; `deposit(vault, copper)` and `withdraw(vault, copper)` resolve on
  the peeked `bank_money`, or on a command result, or `no_reply` after
  5 s; `moneyLeft()` resolves on the reply.
- [ ] **Step 3: Implement.** `GuildbankState = { vault, subscribed,
  stale, balance, tabs, moneyLeft }` (design 5.20 names the fields; logs
  and text arrive in guild-6). The item reader is local to this area
  until a shared item-instance reader exists (design area Q6; could not
  determine whether `economy` adds one).
- [ ] **Step 4: Harness rule.** `bank_money` writes one `log` row
  `bank_money` with the balance; `bank_list` returns `[]` (flood guard).
- [ ] **Step 5: Live proof.** Stage a guild and 20 gold. The flow
  `guildbank-money` walks to a vault, opens the bank (list for tab 0, no
  tabs), deposits 1 gold, withdraws 50 silver, asks for money left. Run
  `mise protocol:probe <A> --flow guildbank-money --expect SMSG_GUILD_BANK_LIST --expect MSG_GUILD_BANK_MONEY_WITHDRAWN --expect SMSG_GUILD_EVENT --bodies`.
  Check two `GE_BANK_MONEY_SET` bodies (`Guilds/Guild.cpp:1731-1732,1796`)
  and the bank gold with `read guild`. `CMSG_GUILD_BANK_QUERY_TAB`
  answers only with a bought tab, so its live send comes in guild-6's
  flow and its proof row names that flow. Clean up.
- [ ] **Step 6: Docs.** Create `docs/areas/guildbank.md`: the three
  `SMSG_GUILD_BANK_LIST` disagreements with
  `guild_bank/smsg_guild_bank_list.wowm` under "Wire notes"; proof rows.
  Run `mise protocol:coverage`.
- [ ] **Step 7: Checks.** `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_GUILD_BANKER_ACTIVATE` | live | flow `guildbank-money`; handler `Handlers/GuildHandler.cpp:280-297` |
| `CMSG_GUILD_BANK_QUERY_TAB` | live (guild-6 flow) | flow `guildbank-items`; reader `Server/Packets/GuildPackets.cpp:265-270` |
| `SMSG_GUILD_BANK_LIST` | live | flow `guildbank-money`; writer `Server/Packets/GuildPackets.cpp:285-329` |
| `CMSG_GUILD_BANK_DEPOSIT_MONEY` | live | same; handler `Handlers/GuildHandler.cpp:310-319` |
| `CMSG_GUILD_BANK_WITHDRAW_MONEY` | live | same; handler `Handlers/GuildHandler.cpp:321-328` |
| `MSG_GUILD_BANK_MONEY_WITHDRAWN` | live | same; writer `Server/Packets/GuildPackets.cpp:272-277` |

**Commit:**

```
feat: Open the guild bank and move money

The character can open a guild vault, read the bank list and move
money in and out. The store follows the server's bank pushes and
knows when a permissions query ended them.
```

## Task guild-6: bank tabs, items, text and logs

- **codeArea:** `guildbank`. **Size:** M. **Phase:** 4.
- **Files:**
  - Edit: `areas/guildbank/opcodes.ts` (`uses` gains
    `SMSG_INVENTORY_CHANGE_FAILURE`), `protocol.ts`, `protocol.test.ts`,
    `store.ts`, `runtime.ts`, `area.test.ts`; `areas/guildbank/items.ts`
    for the swap forms if `runtime.ts` passes 500 lines
  - Edit: `packages/core/test-support/areas/guildbank.ts`
  - Create: `packages/devtools/src/probe-flows/guildbank-items.ts`
  - Edit: `docs/areas/guildbank.md`; regenerate the coverage file
- **Depends on:** guild-5, items-3a (`ownsInventoryFailure` from
  `#wow/protocol/inventory`, N28).
- **Opcodes:** `CMSG_GUILD_BANK_SWAP_ITEMS`, `CMSG_GUILD_BANK_BUY_TAB`,
  `CMSG_GUILD_BANK_UPDATE_TAB`, `MSG_GUILD_BANK_LOG_QUERY`,
  `MSG_QUERY_GUILD_BANK_TEXT`, `CMSG_SET_GUILD_BANK_TEXT`.

**Steps:**

- [ ] **Step 1: Test builders:** `guildbankLogBody({ tab, entries })` in
  AC's form (`Server/Packets/GuildPackets.cpp:385-417`): `u8 tab, u8
  count`, then per entry `i8 type, u64 player`, then by type
  (`Guilds/Guild.h:195-206`) `u32 item, u32 count` for 1-2, plus `i8`
  other tab for 3 and 7, else `u32 money`, then `u32` seconds ago. The
  wowm file (`queries/msg_guild_bank_log_query.wowm`) has a leading time
  and a fixed entry; AzerothCore wins. `guildbankTextBody({ tab, text })`
  (`:419-430`).
- [ ] **Step 2: Failing tests.** `buildGuildBankSwap` in three forms
  (bank to bank; bag to bank and bank to bag with `toChar`; bank to bag
  auto-store) as `Server/Packets/GuildPackets.cpp:337-378` reads them;
  buy tab (`:245-249`), update tab (`:251-257`), log query (`:380-383`),
  text query and set text (`:432-436`). Rig: logs per tab (tab 6 is
  money, `Guilds/Guild.cpp:1852-1853`); text per tab; the acts refuse a
  tab name over 16, an icon over 100, text over 500 characters
  (`Server/Packets/GuildPackets.h:400-401,585`), an empty name or icon
  (`Handlers/GuildHandler.cpp:383`), and `setText` without
  `GUILD_BANK_RIGHT_UPDATE_TEXT` on that tab (N29; the server does not
  check it, `Handlers/GuildHandler.cpp:405-411`); `buyTab` sends the
  tab id equal to the number of tabs and resolves on the peeked
  `bank_tab_purchased`; `deposit`/`withdraw`/`move` of an item resolve on
  the list update for that slot, or on an inventory failure that
  `ownsInventoryFailure` claims.
- [ ] **Step 3: Implement.** Acts `buyTab`, `updateTab`, `viewTab`,
  `depositItem`, `withdrawItem`, `moveItem`, `log`, `text`, `setText`.
- [ ] **Step 4: Live proof.** Stage a guild, 110 gold and an item
  (`soap gm <A> items <id>:5`, a cloth item; the builder names the id it
  used). The flow `guildbank-items` walks to a vault, opens it, buys tab
  0, names it, sets its text, views it, deposits the item, moves it,
  withdraws it, and asks for the tab log and the money log (tab 6). Run
  `mise protocol:probe <A> --flow guildbank-items --expect MSG_GUILD_BANK_LOG_QUERY --expect MSG_QUERY_GUILD_BANK_TEXT --expect SMSG_GUILD_BANK_LIST --expect SMSG_GUILD_EVENT --bodies`.
  If the live tab cost is above 100 gold, the flow reports the shortfall
  and the builder stages more money (the default is
  `Guild.BankTabCost0 = 1000000`,
  `src/server/apps/worldserver/worldserver.conf.dist:3636`). Clean up.
- [ ] **Step 5: Docs** (log wire note, proof rows) and
  `mise protocol:coverage`.
- [ ] **Step 6: Checks.** `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_GUILD_BANK_SWAP_ITEMS` | live | flow `guildbank-items`; reader `Server/Packets/GuildPackets.cpp:337-378` |
| `CMSG_GUILD_BANK_BUY_TAB` | live | same; handler `Handlers/GuildHandler.cpp:369-376` |
| `CMSG_GUILD_BANK_UPDATE_TAB` | live | same; reader `Server/Packets/GuildPackets.cpp:251-257` |
| `MSG_GUILD_BANK_LOG_QUERY` | live | same; writer `Server/Packets/GuildPackets.cpp:385-417` |
| `MSG_QUERY_GUILD_BANK_TEXT` | live | same; writer `Server/Packets/GuildPackets.cpp:419-430` |
| `CMSG_SET_GUILD_BANK_TEXT` | live | same; reader `Server/Packets/GuildPackets.cpp:432-436` |

**Commit:**

```
feat: Use guild bank tabs, items and logs

The character can buy and name a bank tab, move items in and out,
write tab text and read the item and money logs.
```

## Task guild-7: charter list, buy, query, show and rename

- **codeArea:** `charters`. **Size:** M. **Phase:** 4.
- **Files:**
  - Edit: `areas/charters/opcodes.ts` (`uses`: `SMSG_GUILD_COMMAND_RESULT`,
    `SMSG_ITEM_PUSH_RESULT`), `areas/charters/area.ts`
  - Create: `areas/charters/protocol.ts`, `protocol.test.ts`, `store.ts`,
    `runtime.ts`, `area.test.ts`
  - Create: `packages/core/test-support/areas/charters.ts`
  - Edit: `packages/harness/src/areas/charters/area.ts`; create its test
  - Create: `packages/devtools/src/probe-flows/charters-buy.ts`
  - Create: `docs/areas/charters.md`; regenerate
    `docs/protocol-coverage/charters.md`
- **Depends on:** `SEED-4`, T-3, T-5.
- **Opcodes:** `CMSG_PETITION_SHOWLIST`, `SMSG_PETITION_SHOWLIST`,
  `CMSG_PETITION_BUY`, `CMSG_PETITION_QUERY`,
  `SMSG_PETITION_QUERY_RESPONSE`, `CMSG_PETITION_SHOW_SIGNATURES`,
  `SMSG_PETITION_SHOW_SIGNATURES`, `MSG_PETITION_RENAME`.

**Steps:**

- [ ] **Step 1: Test builders:** `chartersShowlistBody({ npc, entries })`
  (`Handlers/PetitionsHandler.cpp:848-925`; field 5 is 0 for a guild and
  2, 3 or 5 for arena, field 6 the signatures needed);
  `chartersQueryResponseBody(...)` (`:288-333`: `u32` id, owner guid,
  name, empty body, `u32` min and max, then the fixed fields and a `u32`
  type flag, 0 guild, 1 arena); `chartersSignaturesBody({ item, owner,
  petition, signers })` (`:259-272`); `chartersRenameBody({ item, name })`
  (`:394-397`).
- [ ] **Step 2: Failing tests.** Builders: showlist (guid), buy with the
  full 3.3.5 body of zeros and empty strings (`:40-61`), query
  (`u32`, guid), show signatures (guid), rename (guid, CString). Parsers
  for the four server bodies. Rig: the showlist stores `offers` per NPC;
  a query response stores the petition by item guid; signatures update
  `signers`; a signatures packet for an item not in the bags sets
  `pendingOffer` [I: how the client tells an offer from its own view];
  `buy(npc, name, index)` resolves on the peeked `SMSG_ITEM_PUSH_RESULT`
  of item 5863 (`Petitions/PetitionMgr.h:31`) or on the command result
  (command 0, result 7 name taken, 6 invalid; `:139-149`), else
  `no_reply`; `rename` resolves on the echo or the command result.
- [ ] **Step 3: Implement.** `ChartersState = { offers, petitions,
  pendingOffer }`; events `showlist`, `signatures`, `query`, `renamed`,
  `bought`. The act names the petition by the charter's item guid.
- [ ] **Step 4: Harness rule.** `showlist` writes one `log` row with the
  price and the signatures needed; `query` returns `[]`.
- [ ] **Step 5: Live proof.** One `max80` account with no guild and 1
  gold. The flow `charters-buy` walks to the guild master, asks for the
  showlist, buys a charter named `Fac<letters>`, queries it, shows its
  signatures (0), renames it, then walks to an arena organizer and asks
  for its showlist (3 entries). Run
  `mise protocol:probe <A> --flow charters-buy --expect SMSG_PETITION_SHOWLIST --expect SMSG_PETITION_QUERY_RESPONSE --expect SMSG_PETITION_SHOW_SIGNATURES --expect MSG_PETITION_RENAME --bodies`.
  Record the live `MinPetitionSigns` (field 6 of the guild entry,
  `Handlers/PetitionsHandler.cpp:875`) in the report and in
  `docs/areas/charters.md`; guild-8 needs it. Delete the account (a
  character delete removes its petitions,
  `Entities/Player/Player.cpp:10287-10305`).
- [ ] **Step 6: Docs.** Create `docs/areas/charters.md` (wire notes: the
  "owner" guid of the signatures packet is the requester or offerer,
  `Handlers/PetitionsHandler.cpp:261,645`); proof rows. Run
  `mise protocol:coverage`.
- [ ] **Step 7: Checks.** `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_PETITION_SHOWLIST` | live | flow `charters-buy`; handler `Handlers/PetitionsHandler.cpp:838-846` |
| `SMSG_PETITION_SHOWLIST` | live | same; writer `Handlers/PetitionsHandler.cpp:848-925` |
| `CMSG_PETITION_BUY` | live | same (the item push follows); reader `Handlers/PetitionsHandler.cpp:40-61` |
| `CMSG_PETITION_QUERY` | live | same; handler `Handlers/PetitionsHandler.cpp:275-286` |
| `SMSG_PETITION_QUERY_RESPONSE` | live | same; writer `Handlers/PetitionsHandler.cpp:288-333` |
| `CMSG_PETITION_SHOW_SIGNATURES` | live | same; handler `Handlers/PetitionsHandler.cpp:236-273` |
| `SMSG_PETITION_SHOW_SIGNATURES` | live | same; writer `Handlers/PetitionsHandler.cpp:259-272` |
| `MSG_PETITION_RENAME` | live | same; handler `Handlers/PetitionsHandler.cpp:335-398` |

**Commit:**

```
feat: Buy, query and rename a guild charter

The character can read a petitioner's charter list, buy a guild
charter, read its signatures and rename it. The showlist also tells how
many signatures the server needs.
```

## Task guild-8: charter signing and turn-in

- **codeArea:** `charters`. **Size:** M. **Phase:** 4.
- **Files:**
  - Edit: `areas/charters/opcodes.ts` (`unseen` gains
    `MSG_PETITION_DECLINE` for its server form), `protocol.ts`,
    `protocol.test.ts`, `store.ts`, `runtime.ts`, `area.test.ts`
  - Edit: `packages/core/test-support/areas/charters.ts`
  - Edit: `packages/harness/src/areas/charters/area.ts` and its test
  - Edit (shared, sorted keys, contract 2.6):
    `packages/harness/src/puppet/calls.ts` and its test: `offerCharter`,
    `signCharter`, `declineCharter`, each calling the `charters` act on
    the puppet's handle
  - Create: `packages/devtools/src/probe-flows/charters-sign.ts`
  - Edit: `docs/areas/charters.md`; regenerate the coverage file
- **Depends on:** guild-7, T-7a (`call`), T-7b (`events --json`), T-7c
  (`start --packet-trace`).
- **Opcodes:** `CMSG_PETITION_SIGN`, `SMSG_PETITION_SIGN_RESULTS`,
  `MSG_PETITION_DECLINE`, `CMSG_OFFER_PETITION`,
  `CMSG_TURN_IN_PETITION`, `SMSG_TURN_IN_PETITION_RESULTS`.

**Steps:**

- [ ] **Step 1: Test builders:** `chartersSignResultBody({ item, signer, result })`
  (`Handlers/PetitionsHandler.cpp:501-511,529-544`; only 0 and 1 are
  sent), `chartersDeclineBody(signer)` (`:562-564`),
  `chartersTurnInResultBody(code)` with AC codes 0 OK, 2 already in a
  guild, 4 need more signatures (`Guilds/Guild.h:169-174`; the wowm file
  reuses the sign enum; AzerothCore wins).
- [ ] **Step 2: Failing tests.** Builders: sign (guid, `u8`), decline
  (guid), offer (`u32`, petition guid, target guid; `:568-657`), turn-in
  (guid, and five `u32` emblem values only for an arena charter,
  `:790-791`). Parsers for the three server bodies. Rig: a sign result
  updates `signers` and emits `sign_result`; a decline emits `declined`;
  a turn-in result emits `turn_in { code }`; `turnIn(item)` resolves on
  the result and, for code 0, on the peeked command result with the
  guild name (`:780`); `sign(item)` refuses when `pendingOffer` is empty;
  `offer(item, player)` resolves on a command result (command 1, result
  3: the target is in a guild; the name field is the offerer's own,
  `:627-631`, so the event carries no target name from it) or
  `no_reply`.
- [ ] **Step 3: Implement.** Acts `offer`, `sign`, `decline`, `turnIn`.
- [ ] **Step 4: Harness rule.** `signatures` with `pendingOffer` set
  writes one `wake` row `offer`; `sign_result` on the character's own
  charter writes one `passive` row `signed`.
- [ ] **Step 5: Puppet calls.** Add the three sorted keys to
  `puppet/calls.ts`; `calls.test.ts` checks each key calls its act.
- [ ] **Step 6: Live proof.** Owner A (`max80`, no guild, 1 gold) and
  partners B and C on two more accounts, same faction, no guild. Start B
  with `tmp/puppet-<B> start --packet-trace --json`. The flow
  `charters-sign` buys a charter, offers it to B, waits for B, then turns
  it in. B runs `tmp/puppet-<B> call signCharter '["<item>"]'`; both
  sides get result 0. A second sign from B's account: result 1
  (AzerothCore checks signatures per account,
  `Handlers/PetitionsHandler.cpp:489-513`); B gets it by signing a second
  time [I: the same account check applies]; if B's second sign gives no
  result 1, the report records result 1 as `mock` in Evidence. C declines with `call declineCharter`: the
  server accepts it (no disconnect, no error packet). A turns in with too
  few signatures: result 4. Turn-in result 0 and guild creation run live
  only if the live `MinPetitionSigns` from guild-7 is at most 2;
  otherwise the result-0 path is `mock` from
  `Handlers/PetitionsHandler.cpp:780,833-835` (R22) and the report says
  so. Run
  `mise protocol:probe <A> --flow charters-sign --expect SMSG_PETITION_SIGN_RESULTS --expect SMSG_TURN_IN_PETITION_RESULTS --bodies`
  and read B's trace for `SMSG_PETITION_SHOW_SIGNATURES` and its own
  `SMSG_PETITION_SIGN_RESULTS`. The server form of `MSG_PETITION_DECLINE`
  never reaches the owner: AzerothCore never reads the owner guid
  (`:551-553`), so the lookup at `:560` finds nobody; its parser is a
  `mock` test. Delete all accounts; a guild made by a turn-in is disbanded
  first.
- [ ] **Step 7: Docs** (turn-in codes and the arena form under "Wire
  notes"; proof rows) and `mise protocol:coverage`.
- [ ] **Step 8: Checks.** `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_PETITION_SIGN` | live | partner `call signCharter`; handler `Handlers/PetitionsHandler.cpp:400-545` |
| `SMSG_PETITION_SIGN_RESULTS` | live | flow `charters-sign` and partner trace; writer `Handlers/PetitionsHandler.cpp:501-511` |
| `MSG_PETITION_DECLINE` | accepted (`unseen`) | partner `call declineCharter`, accepted; the server form is a `mock` test from `Handlers/PetitionsHandler.cpp:562-564`, not seen live |
| `CMSG_OFFER_PETITION` | live | flow `charters-sign` (B gets the signatures); handler `Handlers/PetitionsHandler.cpp:568-657` |
| `CMSG_TURN_IN_PETITION` | live | flow `charters-sign` (result 4); handler `Handlers/PetitionsHandler.cpp:659-836` |
| `SMSG_TURN_IN_PETITION_RESULTS` | live | same; writer `Handlers/PetitionsHandler.cpp:755-757` |

**Commit:**

```
feat: Offer, sign and turn in a guild charter

The character can offer its charter, sign or decline one offered to
it, and turn it in. A partner character proves both sides of each
exchange.
```

## Task guild-9: calendar read

- **codeArea:** `calendar`. **Size:** M. **Phase:** 4.
- **Files:**
  - Edit: `areas/calendar/opcodes.ts` (remove the
    `SMSG_CALENDAR_SEND_CALENDAR` stub line), `areas/calendar/area.ts`
  - Create: `areas/calendar/protocol.ts`, `protocol.test.ts`, `store.ts`,
    `runtime.ts`, `area.test.ts`; `areas/calendar/protocol-read.ts` for
    the send-calendar parser if `protocol.ts` passes 500 lines
  - Create: `packages/core/test-support/areas/calendar.ts`
  - Edit: `packages/harness/src/areas/calendar/area.ts`; create its test
  - Create: `packages/devtools/src/probe-flows/calendar-read.ts`
  - Create: `docs/areas/calendar.md`; regenerate
    `docs/protocol-coverage/calendar.md`
- **Depends on:** `SEED-4`, S0-5 (`readPackedTime`), T-3.
- **Opcodes:** `CMSG_CALENDAR_GET_CALENDAR`,
  `SMSG_CALENDAR_SEND_CALENDAR`, `CMSG_CALENDAR_GET_EVENT`,
  `SMSG_CALENDAR_SEND_EVENT`, `CMSG_CALENDAR_GET_NUM_PENDING`,
  `SMSG_CALENDAR_SEND_NUM_PENDING`, `SMSG_CALENDAR_COMMAND_RESULT`.

**Steps:**

- [ ] **Step 1: Test builders:** `calendarSendCalendarBody(...)`
  (`Handlers/CalendarHandler.cpp:60-192`: invites, events, `u32` server
  time, packed zone time, permanent binds, `u32` relative time, raid
  reset periods, holidays); `calendarSendEventBody(...)` in AC's form
  with the description string after the title
  (`Calendar/CalendarMgr.cpp:627-671`; the wowm file has no
  description, AzerothCore wins); `calendarNumPendingBody(n)`
  (`Handlers/CalendarHandler.cpp:788-790`);
  `calendarCommandResultBody({ error, name })` (`u32 0, u8 0`, the name
  for errors 4, 10 and 13 else empty, `u32` error;
  `Calendar/CalendarMgr.cpp:696-719`).
- [ ] **Step 2: Failing tests.** Parsers for the four bodies, including
  an empty holiday list and a holiday with its 26 dates, 10 durations,
  10 flags and texture. Builders: get calendar (empty), get event (`u64`,
  `Server/Packets/CalendarPackets.cpp:21-24`), get pending (empty). Rig:
  a send-calendar reply sets `invites`, `events`, `serverTime`,
  `zoneTime`, `serverOffsetSeconds` (epoch minus the packed zone time
  read as UTC [I]; `Handlers/CalendarHandler.cpp:98-99`), `binds`,
  `resetPeriods`, `holidays`; a send-event reply stores `details` by
  event id and emits `event { sendType }`; `pending` and
  `command_result` events; `act.get()`, `act.event(id)` (resolves on the
  event or the command result), `act.pending()`.
- [ ] **Step 3: Implement** the store and read acts. Ids are `bigint`.
  Times stay `PackedTime` in state; only the offset is a number.
- [ ] **Step 4: Harness rule.** `command_result` writes one `log` row;
  `calendar` and `event` return `[]` (the tool of guild-17 reports them).
- [ ] **Step 5: Live proof.** One `max80` account. The flow
  `calendar-read` asks for the calendar, for event id 1 (a bad id gives
  error 6), and for the pending count. Run
  `mise protocol:probe <A> --flow calendar-read --expect SMSG_CALENDAR_SEND_CALENDAR --expect SMSG_CALENDAR_COMMAND_RESULT --expect SMSG_CALENDAR_SEND_NUM_PENDING --bodies`.
  `SMSG_CALENDAR_SEND_EVENT` is proven live in guild-10's flow (the
  create reply, type 1); its row names that flow. Delete the account.
- [ ] **Step 6: Docs.** Create `docs/areas/calendar.md` (packed time,
  the offset, the send-event disagreement); proof rows. Run
  `mise protocol:coverage`.
- [ ] **Step 7: Checks.** `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_CALENDAR_GET_CALENDAR` | live | flow `calendar-read`; handler `Handlers/CalendarHandler.cpp:53-193` |
| `SMSG_CALENDAR_SEND_CALENDAR` | live | same; writer `Handlers/CalendarHandler.cpp:60-192` |
| `CMSG_CALENDAR_GET_EVENT` | live | same; reader `Server/Packets/CalendarPackets.cpp:21-24` |
| `SMSG_CALENDAR_SEND_EVENT` | live (guild-10 flow) | flow `calendar-events`; writer `Calendar/CalendarMgr.cpp:627-671` |
| `CMSG_CALENDAR_GET_NUM_PENDING` | live | flow `calendar-read`; handler `Handlers/CalendarHandler.cpp:781-791` |
| `SMSG_CALENDAR_SEND_NUM_PENDING` | live | same; writer `Handlers/CalendarHandler.cpp:788-790` |
| `SMSG_CALENDAR_COMMAND_RESULT` | live | same (error 6); writer `Calendar/CalendarMgr.cpp:696-719` |

**Commit:**

```
feat: Read the calendar and its events

The character can read its calendar, one event's details and the
pending invite count, and learns the server's clock offset from the
calendar reply.
```

## Task guild-10: calendar events

- **codeArea:** `calendar`. **Size:** M. **Phase:** 4.
- **Files:**
  - Edit: `areas/calendar/opcodes.ts` (remove the
    `SMSG_CALENDAR_EVENT_INVITE_ALERT` stub line), `protocol.ts`,
    `protocol.test.ts`, `store.ts`, `runtime.ts`, `area.test.ts`;
    `areas/calendar/guards.ts` for the owner guard and limits
  - Edit: `packages/core/test-support/areas/calendar.ts`
  - Edit: `packages/harness/src/areas/calendar/area.ts` and its test
  - Create: `packages/devtools/src/probe-flows/calendar-events.ts`
  - Edit: `docs/areas/calendar.md`; regenerate the coverage file
- **Depends on:** guild-9, guild-1 (`writePackedTime`).
- **Opcodes:** `CMSG_CALENDAR_ADD_EVENT`, `CMSG_CALENDAR_UPDATE_EVENT`,
  `CMSG_CALENDAR_REMOVE_EVENT`, `CMSG_CALENDAR_COPY_EVENT`,
  `SMSG_CALENDAR_EVENT_INVITE_ALERT`, `SMSG_CALENDAR_EVENT_UPDATED_ALERT`,
  `SMSG_CALENDAR_EVENT_REMOVED_ALERT`.

**Steps:**

- [ ] **Step 1: Test builders:** `calendarInviteAlertBody(...)`
  (`Calendar/CalendarMgr.cpp:603-625`), `calendarUpdatedAlertBody(...)`
  with the description after the title, then `u8` repeat, `u32` max
  invites, `u32 0` (`:537-555`; the wowm file has no description and
  calls the last field a date), `calendarRemovedAlertBody(...)`
  (`:571-579`).
- [ ] **Step 2: Failing tests.** `buildCalendarAddEvent` writes title,
  description, type, repeat, max invites, dungeon, two packed times and
  flags, then the invite list only when the flags are not a guild
  announcement (`Handlers/CalendarHandler.cpp:249-252,319-340`; the wowm
  file has no description, AzerothCore wins); `buildCalendarUpdateEvent`
  (`:381-384`); remove writes event, invite and flags (`:421-430`; AC
  reads only the event); copy (`:432-515`). Parsers for the three
  alerts. Rig: an alert updates `invites` or `events`; `create(spec)`
  refuses a title over 31 bytes, a description over 255 bytes, a time
  more than a day in the past, and a second create within 5 s
  (`:255,258-265,298-305`); it resolves on the send-event reply type 1
  (`Calendar/CalendarMgr.cpp:135-140`) and records the id in
  `createdByMe`; `update`, `remove` and `copy` refuse an event not in
  `createdByMe` (N29; the server does not check the owner,
  `Handlers/CalendarHandler.cpp:403-417`,
  `Calendar/CalendarMgr.cpp:157-222`).
- [ ] **Step 3: Implement.** `create` puts the character itself first in
  the invite list, with rank owner and status confirmed (design area
  section 4 [I]).
- [ ] **Step 4: Harness rule.** `alert_invite` from another creator
  writes one `wake` row `invite`; `alert_updated` and `alert_removed`
  write one `log` row `changed` each.
- [ ] **Step 5: Live proof.** One `max80` account. The flow
  `calendar-events` asks for the calendar (for the offset), creates an
  event for tomorrow (send-event type 1 and the invite alert, which a
  non-guild event also sends its creator, `Calendar/CalendarMgr.cpp:145-146`),
  updates it (updated alert), waits 5 s and copies it (send-event type
  2), then removes both (removed alerts). Run
  `mise protocol:probe <A> --flow calendar-events --expect SMSG_CALENDAR_SEND_EVENT --expect SMSG_CALENDAR_EVENT_INVITE_ALERT --expect SMSG_CALENDAR_EVENT_UPDATED_ALERT --expect SMSG_CALENDAR_EVENT_REMOVED_ALERT --bodies`.
  Delete the account (the events go with the character [I]).
- [ ] **Step 6: Docs** (the add, update and updated-alert disagreements;
  proof rows) and `mise protocol:coverage`.
- [ ] **Step 7: Checks.** `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_CALENDAR_ADD_EVENT` | live | flow `calendar-events`; reader `Handlers/CalendarHandler.cpp:249-252` |
| `CMSG_CALENDAR_UPDATE_EVENT` | live | same; reader `Handlers/CalendarHandler.cpp:381-384` |
| `CMSG_CALENDAR_REMOVE_EVENT` | live | same; handler `Handlers/CalendarHandler.cpp:421-430` |
| `CMSG_CALENDAR_COPY_EVENT` | live | same; handler `Handlers/CalendarHandler.cpp:432-515` |
| `SMSG_CALENDAR_EVENT_INVITE_ALERT` | live | same; writer `Calendar/CalendarMgr.cpp:603-625` |
| `SMSG_CALENDAR_EVENT_UPDATED_ALERT` | live | same; writer `Calendar/CalendarMgr.cpp:537-555` |
| `SMSG_CALENDAR_EVENT_REMOVED_ALERT` | live | same; writer `Calendar/CalendarMgr.cpp:571-579` |

**Commit:**

```
feat: Create, edit and remove calendar events

The character can plan, change, copy and cancel its own calendar
events. Core refuses to change events it did not create, which the
server would allow.
```

## Task guild-11: calendar invites and answers

- **codeArea:** `calendar`. **Size:** M. **Phase:** 4.
- **Files:**
  - Edit: `areas/calendar/protocol.ts`, `protocol.test.ts`, `store.ts`,
    `runtime.ts`, `area.test.ts`, `guards.ts`
  - Edit: `packages/core/test-support/areas/calendar.ts`
  - Create: `packages/devtools/src/probe-flows/calendar-invites.ts`
  - Edit: `docs/areas/calendar.md`; regenerate the coverage file
- **Depends on:** guild-10.
- **Opcodes:** `CMSG_CALENDAR_EVENT_INVITE`, `SMSG_CALENDAR_EVENT_INVITE`,
  `CMSG_CALENDAR_EVENT_RSVP`, `CMSG_CALENDAR_EVENT_SIGNUP`,
  `CMSG_CALENDAR_EVENT_STATUS`, `SMSG_CALENDAR_EVENT_STATUS`,
  `SMSG_CALENDAR_CLEAR_PENDING_ACTION`.

**Steps:**

- [ ] **Step 1: Test builders:** `calendarEventInviteBody(...)`
  (`Calendar/CalendarMgr.cpp:503-535`; the last byte is
  `sender != invitee`, so 0 means a sign-up, `:521`),
  `calendarEventStatusBody(...)` (`:557-569`),
  `calendarClearPendingBody()` (empty, `:687-694`).
- [ ] **Step 2: Failing tests.** Builders: invite (`u64, u64, CString,
  bool, bool`; `Handlers/CalendarHandler.cpp:517-609`), RSVP (`u64,
  u64, u32`; `:637-671`), sign-up (`u64, bool`; `:611-635`), event status
  in AC's form: packed invitee guid, `u64` event, `u64` invite, `u64`
  owner invite, `u8` status (`:710-711`; the wowm file has no packed
  guid, AzerothCore wins). Parsers for the three server bodies. Rig:
  `invite(id, name)` resolves on the invite packet or the command result
  (11 unknown name, 12 wrong faction); `answer(id, inviteId, status)` and
  `signUp(id, tentative)` resolve on the status and clear-pending
  packets; `setStatus(id, inviteId, invitee, status)` refuses an event
  not in `createdByMe`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Live proof.** Accounts A and B (`max80`, same faction; B
  only has to exist, `Handlers/CalendarHandler.cpp:529-556`). The flow
  `calendar-invites` creates an event, invites B by name, answers its own
  invite, signs up (a new invite each time, `:629-630`), and sets B's
  invite to confirmed (status 3). Run
  `mise protocol:probe <A> --flow calendar-invites --expect SMSG_CALENDAR_EVENT_INVITE --expect SMSG_CALENDAR_EVENT_STATUS --expect SMSG_CALENDAR_CLEAR_PENDING_ACTION --bodies`.
  The flow removes the event at the end. Delete both accounts.
- [ ] **Step 5: Docs** and `mise protocol:coverage`.
- [ ] **Step 6: Checks.** `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_CALENDAR_EVENT_INVITE` | live | flow `calendar-invites`; handler `Handlers/CalendarHandler.cpp:517-609` |
| `SMSG_CALENDAR_EVENT_INVITE` | live | same; writer `Calendar/CalendarMgr.cpp:503-535` |
| `CMSG_CALENDAR_EVENT_RSVP` | live | same; handler `Handlers/CalendarHandler.cpp:637-671` |
| `CMSG_CALENDAR_EVENT_SIGNUP` | live | same; handler `Handlers/CalendarHandler.cpp:611-635` |
| `CMSG_CALENDAR_EVENT_STATUS` | live | same; reader `Handlers/CalendarHandler.cpp:710-711` |
| `SMSG_CALENDAR_EVENT_STATUS` | live | same; writer `Calendar/CalendarMgr.cpp:557-569` |
| `SMSG_CALENDAR_CLEAR_PENDING_ACTION` | live | same; writer `Calendar/CalendarMgr.cpp:687-694` |

**Commit:**

```
feat: Invite to and answer calendar events

The character can invite players to its events, answer and sign up
for events, and confirm an invitee.
```

## Task guild-12: calendar invite removal, moderators and complaints

- **codeArea:** `calendar`. **Size:** S. **Phase:** 4.
- **Files:**
  - Edit: `areas/calendar/opcodes.ts` (`unseen` gains
    `CMSG_CALENDAR_COMPLAIN`), `protocol.ts`, `protocol.test.ts`,
    `store.ts`, `runtime.ts`, `area.test.ts`, `guards.ts`
  - Edit: `packages/core/test-support/areas/calendar.ts`
  - Edit: `packages/harness/src/areas/calendar/area.ts` and its test
  - Create: `packages/devtools/src/probe-flows/calendar-moderate.ts`
  - Edit: `docs/areas/calendar.md`; regenerate the coverage file
- **Depends on:** guild-11, T-7b, T-7c.
- **Opcodes:** `CMSG_CALENDAR_EVENT_REMOVE_INVITE`,
  `SMSG_CALENDAR_EVENT_INVITE_REMOVED`,
  `SMSG_CALENDAR_EVENT_INVITE_REMOVED_ALERT`,
  `CMSG_CALENDAR_EVENT_MODERATOR_STATUS`,
  `SMSG_CALENDAR_EVENT_MODERATOR_STATUS_ALERT`, `CMSG_CALENDAR_COMPLAIN`.

**Steps:**

- [ ] **Step 1: Test builders:** `calendarInviteRemovedBody(...)`
  (packed guid, `u64`, `u32` flags, bool; `Calendar/CalendarMgr.cpp:581-590`),
  `calendarInviteRemovedAlertBody(...)` (`:673-685`),
  `calendarModeratorAlertBody(...)` (`:592-601`).
- [ ] **Step 2: Failing tests.** Builders in AC's forms: remove invite is
  packed invitee guid, `u64` invite, `u64` owner invite, `u64` event
  (`Handlers/CalendarHandler.cpp:681-682`); moderator status is packed
  invitee guid, `u64` event, `u64` invite, `u64` owner invite, `u8` rank
  (`:742-743`); complain is `u64` event, `u64` guid
  (`Server/Packets/CalendarPackets.cpp:38-42`). The wowm files differ in
  each case; AzerothCore wins. Parsers for the three server bodies. Rig:
  `removeInvite` and `setModerator` refuse an event not in `createdByMe`
  and removing the creator (error 22, `:689-693`); `complain` exists as
  a builder only: no act sends it (N25).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Harness rule.** `alert_invite_removed` writes one `log`
  row `changed`.
- [ ] **Step 5: Live proof.** A and B (`max80`, same faction). Start B
  with `tmp/puppet-<B> start --packet-trace --json`. The flow
  `calendar-moderate` creates an event, invites B, makes B a moderator
  (rank 1), then removes B's invite, then removes the event. Read B's
  events with `tmp/puppet-<B> events --json` and B's trace for the
  moderator alert and the removed alert (sent only to an online
  invitee). Run
  `mise protocol:probe <A> --flow calendar-moderate --expect SMSG_CALENDAR_EVENT_INVITE_REMOVED --bodies`.
  `CMSG_CALENDAR_COMPLAIN` is never sent live: a live send may insert a
  spam-report row that outlives the accounts
  (`Handlers/CalendarHandler.cpp:764-777`). Delete both accounts.
- [ ] **Step 6: Docs** ("Left out": the complain opcode, N25; proof
  rows) and `mise protocol:coverage`.
- [ ] **Step 7: Checks.** `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_CALENDAR_EVENT_REMOVE_INVITE` | live | flow `calendar-moderate`; reader `Handlers/CalendarHandler.cpp:681-682` |
| `SMSG_CALENDAR_EVENT_INVITE_REMOVED` | live | same; writer `Calendar/CalendarMgr.cpp:581-590` |
| `SMSG_CALENDAR_EVENT_INVITE_REMOVED_ALERT` | live | partner trace; writer `Calendar/CalendarMgr.cpp:673-685` |
| `CMSG_CALENDAR_EVENT_MODERATOR_STATUS` | live | flow `calendar-moderate`; reader `Handlers/CalendarHandler.cpp:742-743` |
| `SMSG_CALENDAR_EVENT_MODERATOR_STATUS_ALERT` | live | partner trace; writer `Calendar/CalendarMgr.cpp:592-601` |
| `CMSG_CALENDAR_COMPLAIN` | builder (`unseen`) | builder test; reader `Server/Packets/CalendarPackets.cpp:38-42` |

**Commit:**

```
feat: Remove calendar invites and set moderators

The creator of an event can remove an invite and make an invitee a
moderator, and the invitee sees both alerts.
```

## Task guild-13: calendar guild filter, arena team and raid lockouts

- **codeArea:** `calendar`. **Size:** S. **Phase:** 4.
- **Files:**
  - Edit: `areas/calendar/opcodes.ts` (`unseen` gains
    `SMSG_CALENDAR_ARENA_TEAM`, `SMSG_CALENDAR_RAID_LOCKOUT_ADDED`,
    `SMSG_CALENDAR_RAID_LOCKOUT_REMOVED`,
    `SMSG_CALENDAR_RAID_LOCKOUT_UPDATED` unless the live runs below see
    them), `protocol.ts`, `protocol.test.ts`, `store.ts`, `runtime.ts`,
    `area.test.ts`
  - Edit: `packages/core/test-support/areas/calendar.ts`
  - Create: `packages/devtools/src/probe-flows/calendar-filter.ts`
  - Edit: `docs/areas/calendar.md`; regenerate the coverage file
- **Depends on:** guild-9, T-5, T-6.
- **Opcodes:** `CMSG_CALENDAR_GUILD_FILTER`, `SMSG_CALENDAR_FILTER_GUILD`,
  `CMSG_CALENDAR_ARENA_TEAM`, `SMSG_CALENDAR_ARENA_TEAM`,
  `SMSG_CALENDAR_RAID_LOCKOUT_ADDED`, `SMSG_CALENDAR_RAID_LOCKOUT_REMOVED`,
  `SMSG_CALENDAR_RAID_LOCKOUT_UPDATED`.

**Steps:**

- [ ] **Step 1: Test builders:** `calendarFilterGuildBody(members)`
  (`u32` count, then packed guid and a `u8` that AzerothCore writes as 0;
  `Guilds/Guild.cpp:2200-2231`), `calendarArenaTeamBody(members)`
  (`Battlegrounds/ArenaTeam.cpp:613-628`), `calendarLockoutAddedBody(...)`
  (packed time, map, difficulty, seconds left, instance id;
  `Handlers/CalendarHandler.cpp:821-838`), `calendarLockoutRemovedBody(...)`
  (same without the time), `calendarLockoutUpdatedBody(...)` (`:840-852`).
- [ ] **Step 2: Failing tests.** Builders: guild filter (three `u32`,
  `Server/Packets/CalendarPackets.cpp:26-31`), arena team (`u32`,
  `:33-36`). Parsers for the five server bodies. Rig: the filter reply
  emits `filter_guild`; the arena reply emits `arena_team`; the lockout
  packets add, remove and update `binds` and emit `lockout_added`,
  `lockout_removed`, `lockout_updated`; `filterGuild(min, max, rank)`
  and `arenaTeam(teamId)` resolve on the reply or `no_reply`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Live proof.** Stage a guild on A with a second member B
  (`guild-invite`). The flow `calendar-filter` sends the guild filter
  (levels 1-80, rank 10) and expects a list that holds B and not A
  (`Guilds/Guild.cpp:2220`). Run
  `mise protocol:probe <A> --flow calendar-filter --expect SMSG_CALENDAR_FILTER_GUILD --bodies`.
  The arena-team pair and the three lockout packets need an arena team
  or a permanent raid bind; if the `pvp` or `instances` unit has landed
  a probe flow that stages one, the builder runs it and records `live`;
  otherwise each is a `mock` test through `areaRig` from the writer
  (R22) and stays in `unseen`. `CMSG_CALENDAR_ARENA_TEAM` without a team
  gets no reply; its row is `accepted` from the live send. Clean up.
- [ ] **Step 5: Docs** (the `u8` that wowm calls a level; proof rows)
  and `mise protocol:coverage`.
- [ ] **Step 6: Checks.** `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_CALENDAR_GUILD_FILTER` | live | flow `calendar-filter`; reader `Server/Packets/CalendarPackets.cpp:26-31` |
| `SMSG_CALENDAR_FILTER_GUILD` | live | same; writer `Guilds/Guild.cpp:2200-2231` |
| `CMSG_CALENDAR_ARENA_TEAM` | accepted | same flow, no team; reader `Server/Packets/CalendarPackets.cpp:33-36` |
| `SMSG_CALENDAR_ARENA_TEAM` | mock (`unseen`) | `areaRig` test; writer `Battlegrounds/ArenaTeam.cpp:613-628` |
| `SMSG_CALENDAR_RAID_LOCKOUT_ADDED` | mock (`unseen`) | `areaRig` test; writer `Handlers/CalendarHandler.cpp:821-838` |
| `SMSG_CALENDAR_RAID_LOCKOUT_REMOVED` | mock (`unseen`) | `areaRig` test; writer `Handlers/CalendarHandler.cpp:821-838` |
| `SMSG_CALENDAR_RAID_LOCKOUT_UPDATED` | mock (`unseen`) | `areaRig` test; writer `Handlers/CalendarHandler.cpp:840-852` |

**Commit:**

```
feat: Read calendar guild, arena and lockouts

The calendar can list guild members for an invite filter, read an
arena team, and track raid lockouts that the server reports.
```

## Task guild-14: the `guild` tool (status, membership, text, ranks, log)

- **codeArea:** `guildadmin`. **Size:** L. **Phase:** 4.
- **Files:**
  - Edit: `areas/guildadmin/opcodes.ts` (`uses` gains
    `SMSG_GUILD_INVITE`), `store.ts`, `area.test.ts` (the peeked legacy
    events become area events: `invited`, `joined`, `left`, `removed`,
    `rank_changed`, `motd`, `leader_changed`, `command_result`)
  - Create: `packages/harness/src/areas/guildadmin/tool.ts`,
    `tool.test.ts`
  - Edit: `packages/harness/src/areas/guildadmin/area.ts` and its test
    (rules and `worldActs: ["info", "permissions"]`)
  - Edit (shared, contract 2.6): `packages/harness/src/contract/result.ts`
    (`ToolName` gains `"guild"` at the end),
    `packages/harness/src/tools/registry.ts` (`GAME_TOOLS` gains
    `guildTool` at the end), `docs/harness.md` (one tool-table row)
  - Create: `packages/harness/src/grader/scenarios/t9-guild-admin.json`,
    `t9-guild-join.json`
  - Edit (shared, one commit per scenario, D15):
    `packages/harness/src/grader/scenarios.ts` (`ROUND_1`),
    `docs/capabilities.md`, `docs/evals.md`
  - Edit (shared, sorted key): `packages/harness/src/puppet/calls.ts` and
    its test, only if the partner needs a method T-7a lacks;
    `packages/harness/src/tools/covered.ts` (`COVERS`), only if a tool
    result repeats a router row
- **Depends on:** guild-1, guild-2, guild-3, S0-3, S0-4, T-7a, T-10,
  coordinator request 1.
- **Opcodes:** none new.

**Steps:**

- [ ] **Step 0: Tool spec (contract 1.9 "Tool spec").** The builder writes `text` (label, description of at most 60 STE words, one or two STE guideline lines), `minimalArgs`, `renderers` and `fallback`, and quotes the text in its report. A test checks that `minimalArgs` passes the tool's `parameters` schema.

- [ ] **Step 1: Failing core tests** (rig): each peeked legacy packet
  gives its area event (an invite from another player gives `invited`
  with inviter and guild name; `GE_JOINED` for the self guid gives
  `joined`; and so on). Sign-on and sign-off give no event (they arrive
  for every member at each login [I], `Guilds/Guild.cpp:1948`).
- [ ] **Step 2: Failing harness tests** in `tool.test.ts` with the tool
  harness: `do: "status"` reads the roster and the area state and sends
  the roster and info requests when the data is older than 60 s [I]; it
  shows name, member count, the character's rank and that rank's rights
  in words; `invite`, `accept`, `decline`, `leave`, `remove`, `promote`,
  `demote`, `leader`, `motd` call the existing handle methods
  (`client-social.ts:208-240`) and settle within 3 s on the matching
  guild event, else `UNCONFIRMED`; `info`, `note`, `officer_note`,
  `rank` (`step: add | remove | rename`), `log` and `disband` call the
  `guildadmin` acts; the tool refuses before it sends and names the
  missing right; `disband` and `leader` need `text: "confirm"`;
  `expectSendKind(guildTool)` passes. Area rules: `invited` and
  `disbanded` write `wake` rows; `joined`, `left`, `removed` and
  `rank_changed` for the character write `passive` rows, for others
  `log` rows; `motd` writes a `log` row. Run
  `mise test packages/harness/src/areas/guildadmin` and see it fail.
- [ ] **Step 3: Implement** the tool (kind `action`, sends inside
  `ctx.rt.mutex.run`), its `After` type and renderers in its module
  (contract 1.9), the rules, and the three shared appends. If a tool
  result repeats a router row, add the `COVERS` key
  (`tools/covered.ts:5`, sorted). Commit (tool commit below).
- [ ] **Step 4: Scenario `t9-guild-admin`.** Setup: a guild led by the
  scenario character and a partner member (coordinator request 1).
  Task: "Set the guild message of the day to 'Raid at eight', write
  'tank' as your public note, and promote <partner> once." Checks: game
  log rows `guildadmin/motd`, `guildadmin/command_result`; a console
  check on `read guild` for the MOTD when request 2 is ruled. Run
  `mise test packages/harness/src/grader/scenarios.test.ts`, then
  `mise eval` on it; record the verdict. One commit with the JSON, its
  `ROUND_1` entry, the `docs/capabilities.md` line and the
  `docs/evals.md` row "guild (the `guild` tool)" (contract 3.2).
- [ ] **Step 5: Scenario `t9-guild-join`.** Setup: the partner leads a
  guild (request 1) and invites the character with
  `call guildInvite`. Task: "Someone invites you to a guild. Join it."
  Checks: a `guildadmin/joined` row. Same commit rule.
- [ ] **Step 6: Checks.** `mise ci:checks`, then the live gates of
  contract 3.6 are the coordinator's wave round.

**Proof:** eval `t9-guild-admin`, `t9-guild-join`. Without request 1,
each lands as a "Not shown by any scenario" bullet (D16).

**Commits:**

```
feat: Add the guild tool

The agent can read its guild and rank rights, manage members, text,
notes and ranks, and sees invites and disbands as wake rows. Guild
events were dropped before.
```

```
test: Add the t9-guild-admin scenario

It proves the guild tool sets the MOTD, a note and a promotion in a
real guild.
```

```
test: Add the t9-guild-join scenario

It proves the agent answers a guild invite from another player.
```

## Task guild-15: the `guild` tool: charter, sign and tabard

- **codeArea:** `guildadmin` (tool) and `charters` (rules). **Size:** M.
  **Phase:** 4.
- **Files:**
  - Create: `packages/harness/src/areas/guildadmin/tool-charter.ts`,
    `tool-charter.test.ts`
  - Edit: `packages/harness/src/areas/guildadmin/tool.ts`, `tool.test.ts`
    (the `charter`, `sign`, `decline step:"charter"` and `tabard` values)
  - Edit: `packages/harness/src/areas/charters/area.ts` and its test
  - Create: `packages/harness/src/grader/scenarios/t9-guild-charter.json`,
    `t9-guild-tabard.json`
  - Edit (shared, D15): `grader/scenarios.ts` (`ROUND_1`),
    `docs/capabilities.md`, `docs/evals.md` (the guild row)
- **Depends on:** guild-14, guild-4, guild-7, guild-8; coordinator
  request 1 for `t9-guild-tabard` only.
- **Opcodes:** none new.

**Steps:**

- [ ] **Step 1: Failing tests.** `do: "charter"` with `step: "buy"`
  refuses when no petitioner is in range (the agent uses `travel`
  first; `npc-roles.ts:44`), else runs the showlist and the buy and
  settles on `bought` or the command result; `step: "status"` shows the
  signers and the signatures needed; `step: "offer"` needs a player
  `name` in view; `step: "turn_in"` settles on the turn-in code;
  `step: "rename"`. `do: "sign"` signs a pending offer; `do: "decline"`
  with `step: "charter"` declines it (design 5.20 decision);
  `do: "tabard"` takes five numbers in `text` and settles on
  `emblem_result`. `expectSendKind` still passes.
- [ ] **Step 2: Implement.** The charter branch lives in
  `tool-charter.ts` so `tool.ts` stays under 500 lines.
- [ ] **Step 3: Scenario `t9-guild-charter`.** No guild; money 1 gold.
  Task: "Buy a guild charter named '<unique>' and tell me how many
  signatures it needs." Checks: truth `items` 5863 +1, `delta: [money]`
  of the live price; the answer equals the showlist's needed count (the
  `charters/showlist` row). Run `mise eval`; one commit (D15).
- [ ] **Step 4: Scenario `t9-guild-tabard`.** A guild led by the
  character (request 1); money 20 gold. Task: "Design a guild tabard at
  the guild master." Checks: `delta: [money]` of 10 gold
  (`Guilds/Guild.cpp:42`), a `guildadmin/emblem_result` row with code 0.
  One commit (D15).
- [ ] **Step 5: Checks.** `mise ci:checks`.

**Proof:** eval `t9-guild-charter`, `t9-guild-tabard`.

**Commits:**

```
feat: Run charters and tabards in the guild tool

The agent can buy, offer, sign, decline and turn in a guild charter,
and design a tabard, from the guild tool.
```

```
test: Add the t9-guild-charter scenario

It proves the agent buys a charter and reads how many signatures the
server needs.
```

```
test: Add the t9-guild-tabard scenario

It proves a guild leader designs a tabard at the guild master.
```

## Task guild-16: the `guild_bank` tool and guild repair

- **codeArea:** `guildbank`. **Size:** L. **Phase:** 4.
- **Files:**
  - Edit: `areas/guildbank/runtime.ts`, `area.test.ts` (the
    `repair(vendor)` act)
  - Edit (lease): `packages/core/src/wow/protocol/vendor.ts` and its test
    (`buildRepairAll(vendorGuid, { fromGuild })`, default false)
  - Create: `packages/harness/src/areas/guildbank/tool.ts`, `tool.test.ts`
  - Edit: `packages/harness/src/areas/guildbank/area.ts` and its test
  - Edit (lease): `packages/harness/src/tools/interact-trainer.ts`,
    `interact.ts` and their tests (`from: "guild"` on `do: "repair"`)
  - Edit (shared): `contract/result.ts` (`ToolName` gains
    `"guild_bank"`), `tools/registry.ts` (`guildBankTool` at the end),
    `docs/harness.md` (one row)
  - Create: `grader/scenarios/t9-guild-bank-money.json`,
    `t9-guild-bank-items.json`
  - Edit (shared, D15): `grader/scenarios.ts`, `docs/capabilities.md`,
    `docs/evals.md` (the guild row)
  - Edit: `docs/areas/guildbank.md` (the repair note)
- **Depends on:** guild-5, guild-6, guild-14, coordinator request 1,
  the `protocol/vendor.ts` and `tools/interact*.ts` leases.
- **Opcodes:** none new (`CMSG_REPAIR_ITEM` is handled; guild-16 sets
  its guild-bank byte).

**Steps:**

- [ ] **Step 0: Tool spec (contract 1.9 "Tool spec").** The builder writes `text` (label, description of at most 60 STE words, one or two STE guideline lines), `minimalArgs`, `renderers` and `fallback`, and quotes the text in its report. A test checks that `minimalArgs` passes the tool's `parameters` schema.

- [ ] **Step 1: Failing core tests.** `buildRepairAll(guid, { fromGuild: true })`
  writes the byte as 1 (AzerothCore reads it as "pay from the guild
  bank", `Handlers/NPCHandler.cpp:764-766`); the default still writes 0.
  Rig: `act.repair(vendor)` refuses without `GR_RIGHT_WITHDRAW_REPAIR`
  (`Guilds/Guild.h:91`) and otherwise sends the repair with the byte set.
- [ ] **Step 2: Failing harness tests.** `do: "open"` (default) finds the
  nearest gameobject of type 34 and fails with "No guild vault in
  reach." otherwise; `tab`, `deposit`, `withdraw` (with `money` or
  `item`), `buy_tab`, `name_tab`, `text` and `log` map to the acts and
  settle on their events; `tab` is 1-6 in text and 0-5 on the wire;
  `log` with no tab reads tab 6 (money); `expectSendKind(guildBankTool)`.
  `interact do:"repair" from:"guild"` calls the act and reports the bank
  money change. Area rule: `bank_money` writes a `log` row.
- [ ] **Step 3: Implement** and commit the tool.
- [ ] **Step 4: Scenario `t9-guild-bank-money`.** A guild led by the
  character (request 1); money 20 gold. Task: "Put 5 gold in the guild
  bank, then take 2 gold back." Checks: `delta: [money]` of -3 gold
  (truth today); two `guildbank/bank_money` rows. One commit (D15).
- [ ] **Step 5: Scenario `t9-guild-bank-items`.** A guild (request 1);
  110 gold; 5 cloth items staged with a realm-service `items/add` setup
  row. Task: "Buy the first guild bank tab, put your cloth in it, then
  take one back." Checks: truth `items` cloth count 1, `delta: [money]`
  of the live tab price. One commit (D15).
- [ ] **Step 6: Checks.** `mise ci:checks`.

**Proof:** eval `t9-guild-bank-money`, `t9-guild-bank-items`; the repair
byte is live-checked by a probe run of `act.repair` at a Dalaran
repairer in the builder's own staged guild, recorded in
`docs/areas/guildbank.md` "Wire notes" (no proof row: the opcode is not
in `owns`).

**Commits:**

```
feat: Add the guild_bank tool and guild repair

The agent can open a guild vault, move money and items, buy and name
tabs and read the logs, and a raider can repair from the guild bank.
```

```
test: Add the t9-guild-bank-money scenario

It proves the agent moves money into and out of the guild bank.
```

```
test: Add the t9-guild-bank-items scenario

It proves the agent buys a bank tab and moves items through it.
```

## Task guild-17: the `calendar` tool

- **codeArea:** `calendar`. **Size:** M. **Phase:** 4.
- **Files:**
  - Create: `packages/harness/src/areas/calendar/tool.ts`, `tool.test.ts`
  - Edit: `packages/harness/src/areas/calendar/area.ts` and its test
    (`worldActs: ["get", "event"]`)
  - Edit (shared): `contract/result.ts` (`ToolName` gains
    `"calendar"`), `tools/registry.ts` (`calendarTool` at the end),
    `docs/harness.md` (one row)
  - Create: `grader/scenarios/t9-calendar-plan.json`
  - Edit (shared, D15): `grader/scenarios.ts`, `docs/capabilities.md`,
    `docs/evals.md` (a row "calendar (the `calendar` tool)")
- **Depends on:** guild-9, guild-10, guild-11, S0-3, S0-4.
- **Opcodes:** none new.

**Steps:**

- [ ] **Step 0: Tool spec (contract 1.9 "Tool spec").** The builder writes `text` (label, description of at most 60 STE words, one or two STE guideline lines), `minimalArgs`, `renderers` and `fallback`, and quotes the text in its report. A test checks that `minimalArgs` passes the tool's `parameters` schema.

- [ ] **Step 1: Failing tests.** `do: "list"` (default) asks for the
  calendar and lists events and invites with a number each; `show` takes
  `event` (a number from `list`); `create` takes `title`, `text`, `when`
  ("2026-10-02 20:00", server time, turned into a `PackedTime` with the
  stored offset), `type` (`raid`, `dungeon`, `pvp`, `meeting`, `other`);
  `invite` takes `event` and `name`; `answer` takes `event` and
  `answer` (`accept`, `decline`, `tentative`, `signup`); `cancel` works
  only on the character's own events. Update, copy, moderator, event
  status, complain, guild filter and arena team stay core-only (design
  area section 4). `expectSendKind(calendarTool)`.
- [ ] **Step 2: Implement** and commit the tool.
- [ ] **Step 3: Scenario `t9-calendar-plan`.** A partner character on a
  second account exists (offline is enough). Task: "Plan a raid called
  'Test night' for tomorrow at 20:00 server time and invite <partner>."
  Checks: a `calendar/invite` row for the partner and the send-event
  row; the eval checks the day, not the hour, because the server time
  zone could not be determined (design area Q4). One commit (D15).
- [ ] **Step 4: Checks.** `mise ci:checks`.

**Proof:** eval `t9-calendar-plan`.

**Commits:**

```
feat: Add the calendar tool

The agent can list, create and cancel calendar events, invite players
and answer invites in server time.
```

```
test: Add the t9-calendar-plan scenario

It proves the agent plans a calendar event and invites a player.
```

## Dead opcodes

Written into the `dead` lists by `SEED-4` (N13), with a `dead` proof row
in the area file of the first task of each code area.

| Opcode | Code area | Why it is dead |
|---|---|---|
| `SMSG_GUILD_DECLINE` | `guildadmin` | No send site in AzerothCore. `CMSG_GUILD_DECLINE` clears the invite and tells the inviter nothing (`Handlers/GuildHandler.cpp:76-87`). |
| `SMSG_CALENDAR_EVENT_INVITE_NOTES` | `calendar` | Listed as not used in the header comment of `Handlers/CalendarHandler.cpp:19-24`; no send site. |
| `SMSG_CALENDAR_EVENT_INVITE_NOTES_ALERT` | `calendar` | Same comment; no send site. |

Not dead, but never sent or seen live (each keeps a task above):
`CMSG_GUILD_CREATE` and `CMSG_CALENDAR_COMPLAIN` (builder only, N25);
the server form of `MSG_PETITION_DECLINE` (mock); `SMSG_CALENDAR_ARENA_TEAM`
and the three `SMSG_CALENDAR_RAID_LOCKOUT_*` packets (mock unless a
`pvp` or `instances` flow stages them).

## COMPLETE
