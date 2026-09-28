# step0: the area structure and the `time` example (key: step0)

Plan index: [2026-09-27-protocol-coverage-plan.md](../2026-09-27-protocol-coverage-plan.md).
Design: [2026-09-27-protocol-coverage-design.md](../2026-09-27-protocol-coverage-design.md)
sections 3.1 to 3.16. Names and types: [contract.md](contract.md)
sections 1 and 2.3, which win over this file.

## What the unit delivers

Step 0 makes the fan-out possible. After it lands, a worker adds a code
area by filling one directory that the coordinator seeded, and never
edits a hub file. The unit delivers:

1. The core area mechanism: `OpcodeDispatch.peek`, `areas/contract.ts`,
   `areas/compose.ts`, `areas/port.ts`, an empty `areas/registry.ts`, the
   area rig, and the one-time hub edits (stores, events, runtimes, handle,
   handlers, stubs, barrel, mock handle, `package.json`, `biome.json`).
2. Per-area coverage files, the 10 relevant absent opcode names, and the
   "Add an area" section of `docs/protocol.md`.
3. The harness mechanism: log types derived from `AreaName`, fallback
   rows, harness area modules and rules, the router hook, tool kind on
   call records, and the tool send check.
4. The world service surface `session.areas` and `claim.areas`.
5. The worked example `time`, which owns `SMSG_LOGIN_SETTIMESPEED`,
   `CMSG_QUERY_TIME` and `SMSG_QUERY_TIME_RESPONSE`, proven live.

**Phase:** 0 (step 0). **Worktree:** `proto-step0`. **Branch:**
`proto/area-step0`. Create it from the coordinator's worktree:

```
orca-ide worktree create --name proto-step0 \
  --base-branch origin/factory/426-protocol-coverage \
  --parent-worktree active --setup run \
  --comment 'owner: coordinator, item 4 step0'
git -C <worktree> branch -m proto/area-step0
```

**Order and gates.**

- Builds start only after item 6 has fully merged and R0 has landed its
  report (design 6.2, 6.3).
- S0-1a branches from `origin/factory/426-protocol-coverage` after T-2
  (the tap) has landed, because T-2 and S0-1 both edit `client.ts`,
  `client-handlers.ts` and `protocol/world.ts` (contract 2.2).
- Step 0 lands after R0 and the tooling of design 4.8 (T-1 to T-4) have
  landed (contract 1.1). T-5 may land later. S0-5 needs T-1, T-3 and T-4
  for its live proof and its proof table.
- One task at a time. Each task starts from the current
  `origin/factory/426-protocol-coverage` after the previous one landed.
- After S0-5 lands, the files of contract 2.3 are frozen for workers, and
  the coordinator lands `SEED-1` (wave 1).
- Every task follows contract 0.2 to 0.8: test first, `mise ci:checks`
  green before review, `git add` exact paths, then
  `mise exec -- git commit` as a separate command, no attribution
  trailer.

## Task index

| Id | Title | Depends on | Opcodes | Proof | Size |
|---|---|---|---|---|---|
| S0-1a | `OpcodeDispatch.peek` | item6, R0, T-2 | none | unit | S |
| S0-1b | Core area mechanism and hub edits | S0-1a | none | unit | L |
| S0-2 | Coverage split and absent opcode names | S0-1b | none handled; adds 10 names | unit | M |
| S0-3 | Harness area mechanism | S0-2 | none | eval (gates) | L |
| S0-4 | World service areas | S0-3 | none | unit | M |
| S0-5 | Worked example `time` | S0-4, T-1, T-3, T-4 | `SMSG_LOGIN_SETTIMESPEED`, `CMSG_QUERY_TIME`, `SMSG_QUERY_TIME_RESPONSE` | live | M |

S0-1 is split into S0-1a and S0-1b (contract 0.10): `peek` has its own
test cycle in `protocol/world.test.ts` and no dependency on the area
types. A dependency on `S0-1` means S0-1b.

## Contract gaps found while planning

Each gap is reported to the coordinator (contract precedence 3). The plan
works around it as stated; nobody invents a second name. Ruled at Gate R:
G1 to G7 are GR-1 to GR-7 in the plan index ("Gate R rulings").

| # | Gap | Evidence | Plan |
|---|---|---|---|
| G1 | Contract 1.6 has the builder pass the peek error reporter "at construction". `OpcodeDispatch` is constructed in `client-connection.ts:187` [M], which S0-1 may not edit. | `protocol/world.ts:193` [M]: the constructor takes no argument; `onUnhandled(report)` (`:202`) is the existing setter pattern | S0-1a adds a setter `onPeekError(report: (opcode: number, error: unknown) => void)` beside `onUnhandled`; S0-1b calls it in `registerWorldHandlers` (`client-handlers.ts:177-196` [M]) with `(opcode, error) => conn.events.packetError.emit(opcode, toError(error))`. With no reporter set, a peek error is dropped after the other peeks ran. The contract allows this ("the reporter plumbing is the builder's choice"). |
| G2 | Moving `ToolKind` to `contract/result.ts` breaks `tools/human-admission.test.ts:6` [M], which imports it from `#harness/tools/game-tool`. A re-export is not possible: `noExportedImports` is an error (`biome.json:65` [M]). | `rg ToolKind packages/harness` [M] | S0-3 changes that one import line. The file is not in contract 1.1; the coordinator grants it to S0-3 as a one-time test edit, or S0-3 stops `blocked`. |
| G3 | A required `kind` on `RepeatCall` breaks the `RepeatCall` literals in `ops/next-guard.test.ts` (`:28-37`, `:335-360` [M]), which contract 1.1 does not list. `afterAction: () => {}` in `events/guard.test.ts:88`, `ops/now-snapshot.test.ts:31` and `test-support/runtime-fixture.ts:161` [M] still typecheck. | `rg -n "RepeatCall\|afterAction" packages/harness` [M] | S0-3 adds `kind` to those literals in `ops/next-guard.test.ts` under the same grant as G2. |
| G4 | Contract 1.11 files the stub-shadow test and the 57-pair test under S0-2, but contract 1.1 gives the `protocol/stubs.ts` and `registerWorldHandlers` edits to S0-1. | contract 1.1 and 1.11 | The tests land with the code they guard, in S0-1b (test first). |
| G5 | Contract 1.1 and design 3.16 put `docs/protocol.md` "Add an opcode" becoming "Add an area". `AGENTS.md:57` [M] and `docs/protocol-coverage.md:5` [M] link `#add-an-opcode`, and T-2 appends a paragraph at the end of "Add an opcode". | `rg add-an-opcode` [M] | S0-2 keeps the heading "Add an opcode" (the generated tables and the steps for legacy owners), rewrites its step 2 to name `peek` and point new work at areas, and adds a new section "Add an area" after it. Recorded as a deviation from design 3.14 (the design wins where a builder finds a conflict; this keeps `AGENTS.md`, which step 0 does not own, correct). |
| G6 | S0-5 must remove `[GameOpcode.SMSG_LOGIN_SETTIMESPEED, "Game time"]` from `STUBS` (`protocol/stubs.ts:46` [M]), or the stub-shadow test fails once `time` owns the opcode. Contract 1.1 lists `protocol/stubs.ts` under S0-1 only. | `rg SETTIMESPEED packages` [M] | S0-5 deletes that one line. The file belongs to this unit and freezes only after S0-5. |
| G7 | The `mise.toml` description of `protocol:coverage` says "Rewrite docs/protocol-coverage.md" (`mise.toml:122` [M]); after S0-2 it writes a directory of files. `mise.toml` is shared (T-3, T-4 only). | `mise.toml:121-123` [M] | S0-2 leaves it. The coordinator may reword it in a `COORD-<n>` commit. |

---

## Task S0-1a: `OpcodeDispatch.peek`

Gate R rulings: GR-1, GR-18 (plan index).

**Design:** 3.6, test 10 of 3.15. **Contract:** 1.6 (`protocol/world.ts`).
**codeArea:** step0.

**Files:**
- Modify: `packages/core/src/wow/protocol/world.ts` (the `OpcodeDispatch`
  class only, `:185-309` [M] at `02b83919`; T-2 landed after the plan first measured these lines, so re-read the cited ranges at the PR tip)
- Test: `packages/core/src/wow/protocol/world.test.ts`

**Depends on:** item6, R0, T-2 (landed on the PR branch).

**Opcodes:** none.

**Steps:**

- [ ] **Step 1: Write the failing tests** in `protocol/world.test.ts`, one
  `describe("OpcodeDispatch.peek")`. Bodies are hand-built
  `PacketWriter` bytes (no wire claim, so no AzerothCore citation).
  1. A peek runs after the owner: the owner and the peek push to one
     array; the order is `["owner", "peek"]`.
  2. A peek reads a fresh fork: the owner reads the whole `uint32` body;
     the peek still reads the same `uint32`.
  3. A peek runs after the waiter step: an `expect` on the opcode resolves
     with a reader that still reads the body, and the peek also sees it.
  4. A peek never runs when the owner throws: the owner throws, `handle`
     rethrows, the peek array stays empty, and a pending `expect` rejects.
  5. A throwing peek goes to the reporter set by `onPeekError` with the
     opcode and the error; the waiter stays resolved; a second peek on the
     same opcode still runs.
  6. `peek` on an opcode with no owner throws
     `peek needs an owner; own the opcode instead`.
  7. `has()` ignores peeks: after a peek on an owned opcode, `has()` of an
     unrelated opcode is false and the owned one is true only from `on`.
- [ ] **Step 2: Run and see them fail.**
  `mise test packages/core/src/wow/protocol/world.test.ts`. Expected:
  `peek is not a function` and `onPeekError is not a function`.
- [ ] **Step 3: Implement.** In `OpcodeDispatch`:
  - a private `peeks: Map<number, Read[]>` and a private
    `peekError: (opcode: number, error: unknown) => void`, default no-op;
  - `peek(opcode, read)`: throw the message of test 6 when
    `!this.handlers.has(opcode)`, else append;
  - `onPeekError(report)`: store it (gap G1);
  - in `handle()`, after the waiter step of today's code
    (`protocol/world.ts:270-274` [M]; `handle()` is `:252-276`), run each peek on `body.fork()`, each
    in its own `try`, a failure going to `peekError`. The owner-throw path
    returns through its existing `throw` before the peeks.
  - `has()` stays owner-only (`:214-216` [M]).
  Keep the file under 500 non-blank lines.
- [ ] **Step 4: Run and see them pass.** Same command. Then
  `mise typecheck core`, `mise lint packages/core/src/wow/protocol`,
  `mise format packages/core/src/wow/protocol`, `mise ci:checks`.

**Proof:** unit. No behaviour change on the wire: no caller uses `peek`
yet.

**Commit:**

```
refactor: Add peek readers to the opcode dispatch

Areas must read opcodes that a legacy module already owns without
editing that owner. A peek runs after the owner and the waiter, on its
own fork, so it can never break the owner or leave a wait unresolved.
```

---

## Task S0-1b: Core area mechanism and hub edits

Gate R rulings: GR-1, GR-4, GR-18, GR-26, GR-27, GR-29 to GR-31, GR-33, GR-36, GR-40 to GR-42 (plan index).

Build rulings: BR-S0-1b-1 (section "Build rulings").

**Design:** 3.2 to 3.9, tests 1 to 5, 7 to 9, 11 to 14, 17 of 3.15.
**Contract:** 1.1 to 1.8, 1.12. **codeArea:** step0.

**Files:**
- Create: `packages/core/src/wow/areas/contract.ts`,
  `areas/compose.ts`, `areas/port.ts`, `areas/registry.ts`,
  `areas/typecheck-fixture.ts`, `areas/registry.test.ts`,
  `areas/compose.test.ts` (all under `packages/core/src/wow/`)
- Create: `packages/core/test-support/area-rig.ts`
- Modify (one-time): `packages/core/src/wow/session-stores.ts`,
  `world-events.ts`, `client-handlers.ts` and `client-handlers.test.ts`,
  `client.ts`, `runtime.ts`, `index.ts` and `index.test.ts`,
  `protocol/stubs.ts`; `packages/core/test-support/mock-handle.ts` and
  `mock-handle.test.ts`; `packages/core/package.json`; `biome.json` (the
  two overrides of contract 1.7)

**Depends on:** S0-1a.

**Opcodes:** none.

**Steps:**

- [ ] **Step 1: Contract types and the type fixture.** Write
  `areas/contract.ts` verbatim from contract 1.2 and `areas/compose.ts`
  types from contract 1.3, with `registry.ts` as
  `export const AREAS = {};`. Write `areas/typecheck-fixture.ts`: two
  fixture modules `alpha` and `beta`, each with a store of one event type,
  a runtime with one act, and a peek; a second registry
  `FIXTURE_AREAS = { alpha, beta }`; every derived type of contract 1.3
  applied to it; a `ctx.until((e) => e.type === "...")` that must narrow;
  and a `@ts-expect-error` line that assigns an area named `halt` to the
  `AREA_NAMES_FREE` guard shape. Run `mise typecheck core` and see it fail
  on the missing values, then add them. If typing `eventTypes` from `St`
  breaks inference or narrowing, move the list to an exported
  `<AREA>_EVENT_TYPES` const and report it (contract 1.2). Measure
  `mise typecheck core` time before this task and after it (`time`), and
  record both (design 3.15 test 17).
- [ ] **Step 2: Write the failing compose tests** in
  `areas/compose.test.ts`, over fixture module lists and the list-taking
  cores (a fixture cannot join `AREAS`):
  - registration: `registerModules` routes `on` to `dispatch.on`, queues
    `peek` and applies it after every module registered; a peek on a
    legacy owner registered first attaches; a peek with no owner throws;
    two modules that own one opcode throw "already has a handler"
    (test 9);
  - inert build (test 11): the modules built over `testPort({ send })`
    whose `send` throws, under `jest.useFakeTimers()` in `try`/`finally`,
    send nothing and `jest.getTimerCount()` is 0;
  - fan-in and order (test 13): a runtime listener runs before the
    forwarder; `port.events().area` gets `{ area, event }`; each
    `areaHandles(...)[name].onEvent` gets only its area; a listener throw
    reaches `packetError` through `createWorldEvents(report)`;
  - `until` (test 14): resolves on a match; rejects `timeout` under fake
    timers; rejects on `options.signal` abort; rejects with
    `abortReason(signal)` when the lifetime is disposed; clears its timer
    each time;
  - handles: `state()` returns the store snapshot; `act` holds the
    runtime's acts; a module without a runtime gets `{}`.
  Run `mise test packages/core/src/wow/areas/compose.test.ts`; expected
  failures: the value exports do not exist.
- [ ] **Step 3: Implement `compose.ts` and `port.ts`.** Follow contract
  1.3 and 1.4: `looseModule` is the single cast site for module functions
  [D6]; `registerModules` runs two passes; `createModuleRuntimes` makes
  one lifetime `AbortController`, builds each context from the port,
  calls `runtime?.(ctx, store, core)`, then subscribes the forwarder;
  `until` and `listen` as contract 1.3 states. `areaPort(conn, dbc)`
  reads `conn` fields at call time with no `.bind`, and sends through
  `sessionDeps(conn).send` (`session-stores.ts:39-46` [M]); `legacy`
  views copy the bodies of `getPartyState`, `getFriends`, `getIgnored`,
  the guild roster read and `conn.channels`. `testPort(init)` as contract
  1.4. The `AREAS` wrappers call the cores with
  `Object.values(AREAS).map(looseModule)`. Run the compose tests green.
- [ ] **Step 4: Write the failing registry tests** in
  `areas/registry.test.ts`, each looping over `AREAS` (so it runs for
  every seeded area) and over `FIXTURE_AREAS` modules where a loop over
  zero areas proves nothing:
  1. `areas/*/area.ts` directories equal the `AREAS` keys; each key
     equals its module's `name`; each name matches `/^[a-z]+$/`, is not a
     `CoreHandle` key, not `onAreaEvent`, not a harness core domain (the
     24 names of `contract/log.ts:3-27` [M], as a literal list), and not a
     file stem of `packages/core/src/wow/areas/*.ts` or
     `packages/harness/src/areas/*.ts` [D26].
  2. Ownership is a partition; every name is a `GameOpcode` key; `stubs`,
     `dead` and `unseen` are subsets of `owns`; no area owns or uses
     `SMSG_LOGOUT_RESPONSE` or `SMSG_LOGOUT_COMPLETE` (`logout.ts:26-29`
     [M]).
  3. Each area registered alone on a recording `AreaRegister`: each `on`
     opcode is in `owns`, each `peek` opcode in `uses`.
  4. Each `GameOpcode.<NAME>` in an area's non-test source is in its
     `owns` or `uses`.
  5. The import scan of contract 1.12 over each area's non-test source.
  6. The 57 frozen `[opcode, label]` pairs of `040c6c15` (copied from
     `git show 040c6c15:packages/core/src/wow/protocol/stubs.ts`): each
     pair is in `[...STUBS, ...areaStubs()]`, or its opcode has an area
     `on` handler (gap G4).
  7. Each area's `eventTypes` match `/^[a-z_]+$/`.
  With zero areas, tests 1 to 5 and 7 pass vacuously; the test file also
  runs checks 2, 3, 5 and 7 over the two fixture modules and one bad
  fixture per rule, so each check is seen to fail. Run and see the bad
  fixtures fail for the stated reason.
- [ ] **Step 5: Write the failing hub tests.**
  - `client-handlers.test.ts`: the stub-shadow test checks
    `[...STUBS, ...areaStubs()]` and names the area from `stubOwners()` on
    failure (test 8); the exactly-once fake dispatch gains `peek` (test
    9); `registerGameHandlers` with a fake `{ dispatch }` and
    `registerWorldHandlers` with the coverage generator's
    `{ dispatch, events }` fake do not throw (test 12).
  - `mock-handle.test.ts`: the mock has `sent`, `triggerAreaEvent` and
    `onAreaEvent`; `onAreaEvent` returns an unsubscribe (the `time`
    cases of test 16 land in S0-5).
  - `index.test.ts`: the barrel exports `AREA_NAMES`.
  Run and see them fail.
- [ ] **Step 6: Implement the hub edits** exactly as contract 1.6:
  `CoreStores` and `SessionStores` with `areas`; `CoreEvents` and
  `WorldEvents` with `area: new Emitter(report)`; `Runtimes.areas`
  built last by `createAreaRuntimes(areaPort(conn, config.dbc),
  stores.areas, stores)` and disposed last, `halt()` unchanged
  (`runtime.ts:240-270` [M]); `CoreHandle` and `WorldHandle` in
  `client.ts`, `createHandle` (`client.ts:323` [M]) spreading
  `areaHandles(stores.areas, rt.areas.runtimes, () => conn.events.area)`
  and adding `onAreaEvent`, with the order inside `worldSession`
  (`client.ts:351-365` [M]) unchanged; `registerAreas` last in
  `registerGameHandlers` (`client-handlers.ts:159-173` [M]);
  `registerWorldHandlers` passing `[...STUBS, ...areaStubs()]` and
  calling `conn.dispatch.onPeekError(...)` (gap G1); `registerStubs`
  with the `stubs` parameter defaulting to `STUBS`
  (`protocol/stubs.ts:79-91` [M]); the one `index.ts` export block; the
  two `package.json` exports; the mock handle of contract 1.8; the two
  `biome.json` overrides of contract 1.7, the first placed after the core
  `useSortedKeys: off` override (`biome.json:205-219` [M]).
- [ ] **Step 7: The area rig.** Write `test-support/area-rig.ts` as
  contract 1.8 (`init.register` first, then no-op owners for unowned
  `uses`, then the area's `register` [D24]; the port's `expect` is the
  rig's `dispatch.expect` [D8]; `inject` through `dispatch.handle`).
  `AreaName` is `never` until S0-5, so no test can call `areaRig` here:
  the rig is typechecked in this task and exercised first in S0-5.
- [ ] **Step 8: Run everything.**
  `mise test packages/core/src/wow/areas`,
  `mise test packages/core/src/wow/client-handlers.test.ts`,
  `mise test packages/core/test-support/mock-handle.test.ts`,
  `mise typecheck core`, `mise typecheck harness` (the harness `Game` and
  `MockGame` must still compile, design 3.8), `mise ci:checks`.

**Proof:** unit, plus the two `mise typecheck core` timings in the
report. The live gates for these hub edits run in S0-3 and S0-5, once the
harness side is in place.

**Commit:**

```
refactor: Add the core area mechanism

Every new opcode today edits the same hub files, so parallel workers
would conflict on each one. Areas plug into one registry with typed
stores, events, runtimes and a sub-handle, and the hubs never change
again.
```

---

## Task S0-2: Coverage split and absent opcode names

Gate R rulings: GR-5, GR-7 (plan index).

**Design:** 3.9 "Coverage", 3.12 "Absent opcodes", 3.14, tests 18 and
19 of 3.15. **Contract:** 1.11. **codeArea:** step0.

**Files:**
- Modify: `packages/core/test-support/protocol-coverage.ts` and
  `protocol-coverage.test.ts`
- Create (generated): `docs/protocol-coverage/core.md`
- Rewrite (fixed text): `docs/protocol-coverage.md`
- Modify: `packages/devtools/src/protocol-tables.ts` (`CORE_OPCODES`,
  `:52-69` [M]) and `protocol-tables.test.ts`
- Regenerate: `packages/core/src/wow/protocol/opcodes.ts`
- Modify: `docs/protocol.md` ("Add an opcode" step 2, a new "Add an
  area" section, "Session stores")

**Depends on:** S0-1b.

**Opcodes:** none handled. It adds the names of the 10 relevant absent
opcodes (design 1), each checked against AzerothCore
`Server/Protocol/Opcodes.h` [M, read for this plan]:

| Name | Number | `Opcodes.h` line |
|---|---|---|
| `SMSG_DESTRUCTIBLE_BUILDING_DAMAGE` | 0x032 | 80 |
| `CMSG_SET_FACTION_CHEAT` | 0x126 | 324 |
| `SMSG_EQUIPMENT_SET_SAVED` | 0x137 | 341 |
| `CMSG_STABLE_REVIVE_PET` | 0x274 | 658 |
| `SMSG_PLAY_TIME_WARNING` | 0x2F5 | 787 |
| `SMSG_LEARNED_DANCE_MOVES` | 0x455 | 1139 |
| `CMSG_FORCE_PITCH_RATE_CHANGE_ACK` | 0x45D | 1147 |
| `SMSG_SPLINE_SET_PITCH_RATE` | 0x45E | 1148 |
| `TC9_CMSG_PREPARE_FOR_REDIRECT` | 0x51F | 1341 |
| `TC9_SMSG_READY_FOR_REDIRECT` | 0x520 | 1342 |

None of the ten numbers is in `protocol/opcodes.ts` today [M, `rg`], so
`gameOpcodes` raises no collision. The areas that own them are seeded
later; until then they render `missing` in `core.md`.

**Steps:**

- [ ] **Step 1: Failing generator test.** In `protocol-tables.test.ts`,
  a test that `gameOpcodes` of the minimal IR the file already builds
  holds each of the ten names at its number. Run
  `mise test packages/devtools/src/protocol-tables.test.ts`; it fails on
  the first missing name.
- [ ] **Step 2: Add the names and regenerate.** Add the ten entries to
  `CORE_OPCODES` in sorted key order (the file's existing order). Run
  `mise protocol:tables`, then
  `mise test packages/core/src/wow/protocol/opcodes.test.ts`
  (it keeps every number declared before, `opcodes.test.ts:8` [M]) and
  the generator test.
- [ ] **Step 3: Failing coverage tests** in `protocol-coverage.test.ts`:
  - `renderCoverage()` returns a `Map` whose keys are exactly
    `docs/protocol-coverage.md`, `docs/protocol-coverage/core.md` and one
    `docs/protocol-coverage/<area>.md` per `AREA_NAMES` entry;
  - the staleness test compares every rendered file with the disk and
    fails on an extra file in `docs/protocol-coverage/` (test 18);
  - status (test 19), over a fixture area list passed to the renderer
    (the renderer takes the module list, the `AREAS` wrapper passes the
    real one): an owned opcode with no handler renders `missing`; one in
    `dead` renders `dead`; one in `unseen` renders `not seen live` in the
    live column; one in the area's `stubs` renders `stub`; one with an
    `on` handler renders `handled`. Order: `dead`, `stub`, `handled`,
    `missing` (design 3.9: stub before handled, because `has()` is true
    for every stub);
  - `direction` gives `client` for `TC9_CMSG_*` and `server` for
    `TC9_SMSG_*`;
  - the index holds no count line.
  Run and see them fail.
- [ ] **Step 4: Implement.** `renderCoverage` in
  `test-support/protocol-coverage.ts` reads `[...STUBS, ...areaStubs()]`
  (not `STUBS` alone, `protocol-coverage.ts:51` [M]), splits rows by
  `owns`, and writes columns opcode, name, direction, status, live. The
  CLI (`mise protocol:coverage`, `mise.toml:121-123` [M]) writes every
  file, removes stale files in `docs/protocol-coverage/`, and prints the
  counts per area and in total on stdout. The fixed index names the
  per-area files by the rule (`docs/protocol-coverage/<area>.md`) and
  `core.md`, links `protocol.md#add-an-area`, and holds no count.
- [ ] **Step 5: Regenerate** with `mise protocol:coverage`. Check:
  `docs/protocol-coverage/core.md` has 933 rows (923 plus the ten names)
  and the total line on stdout reads 933.
- [ ] **Step 6: `docs/protocol.md`** (gap G5). Keep "## Add an opcode"
  for the generated tables and legacy owners; rewrite its step 2 to say
  that new work goes in an area and that a second reader of an owned
  opcode uses `peek`; rewrite its steps 3 and 5 for area `stubs` and the
  per-area coverage files. Add "## Add an area" after it: the worker
  loop of design 3.11 and its file table, naming `areaRig`,
  `test-support/areas/<area>.ts`, `docs/areas/<area>.md` and
  `mise protocol:coverage`, with no dates and no history. Change "Session
  stores" to name the core stores and to say that area stores live under
  `stores.areas`, listed in `areas/registry.ts` (design 3.14). Do not
  touch the reference list (contract 0.8). Run `mise lint:docs`.
- [ ] **Step 7: Run everything.** `mise test packages/core/test-support`,
  `mise test packages/devtools/src`, `mise typecheck core`,
  `mise typecheck devtools`, `mise ci:checks`.

**Proof:** unit, plus the stdout of `mise protocol:coverage` in the
report. No behaviour change on the wire.

**Commit:**

```
chore: Split protocol coverage by area

One coverage file for all opcodes would conflict on every parallel area
change. Each area now regenerates its own file, and the ten absent
opcodes the server uses get names before any worker needs them.
```

---

## Task S0-3: Harness area mechanism

Gate R rulings: GR-2, GR-3, GR-34, GR-37, GR-41 (plan index).

Build rulings: BR-S0-1b-1 (section "Build rulings").

**Design:** 3.10 "Log types", "Router", "Harness area contract", "Tools"
(N10, N11, N12), tests 20, 21, 23 to 25 and 27 of 3.15. **Contract:**
1.9 (log types, harness contract, registry, rules, router, guards, send
check, docs). **codeArea:** step0.

**Files:**
- Create: `packages/harness/src/areas/contract.ts`,
  `areas/registry.ts`, `areas/rules.ts`, `areas/registry.test.ts`,
  `areas/rules.test.ts` (under `packages/harness/src/`)
- Modify (one-time): `contract/log.ts`, `contract/result.ts`
  (`ToolKind`), `contract/services.ts`, `ui/draw.ts` and its test,
  `events/router.ts`, `events/router.test.ts`, `log/query.ts` and its
  test, `ops/progress.ts` and `ops/progress.test.ts`,
  `ops/repeat-guard.ts` and `ops/repeat-guard.test.ts`,
  `tools/define.ts` and `tools/define.test.ts`, `tools/game-tool.ts`,
  `packages/harness/test-support/tool-harness.ts`,
  `packages/harness/test-support/mock-game.ts` (only if the type needs
  it), `docs/harness.md` (`:5` and `:118`, the "ten" lines)
- Modify under the coordinator's grant (gaps G2, G3):
  `tools/human-admission.test.ts` (one import line),
  `ops/next-guard.test.ts` (`kind` in `RepeatCall` literals)

**Depends on:** S0-2.

**Opcodes:** none.

`AreaName` is `never` until S0-5 seeds `time`. The tests below therefore
build area events through one helper in `areas/rules.test.ts` that casts a
fixture `{ area, event }` to `AreaEvent` once, and pass a fixture
registry to `areaRuleSet(registry)`. S0-5 adds the cases with the real
`time` area.

**Steps:**

- [ ] **Step 1: Log types and glyphs (test 20).** Failing test in
  `ui/draw.test.ts`: an entry whose domain is an area name gets that
  area's `glyph` from the registry passed in, else `system`. Implement:
  `CoreDomain` (today's 24 members, `contract/log.ts:3-27` [M]),
  `Domain = CoreDomain | AreaName`, `CoreLogEvent`,
  `LogEvent = CoreLogEvent | \`${AreaName}/${string}\``, `progress?: true`
  on `GameLogEntry` and `LogDraft`; `DOMAIN_GLYPH` typed
  `Readonly<Record<CoreDomain, GlyphName>>` (`ui/draw.ts:104` [M]);
  `entryGlyph` falls back to `HARNESS_AREAS[domain]?.glyph`, then
  `system` (`ui/draw.ts:215-218` [M]).
- [ ] **Step 2: Harness area contract and registry (test 24).** Write
  `areas/contract.ts` from contract 1.9 and `areas/registry.ts` as
  `export const HARNESS_AREAS = {};` plus `HARNESS_AREAS_TOTAL`. Failing
  tests in `areas/registry.test.ts`: every key is in `AREA_NAMES`; no key
  is a `DOMAIN_GLYPH` key; every `worldActs` entry is a function on
  `createMockGame()[area].act`; the compile guard holds (a
  `@ts-expect-error` line over a fixture registry missing a key). Loops
  run over `HARNESS_AREAS` and over a fixture registry.
- [ ] **Step 3: Rules and the fallback row (test 21).** Failing tests in
  `areas/rules.test.ts`: `fallbackDraft` gives class `log`, domain the
  area, event `<area>/<type>`, the event's scalar fields as `data`,
  bigints as decimal strings, and `data.fallback: true`; an `event` rule
  replaces it; a rule returning `[]` gives no draft (G17); `attachDrafts`
  calls each `attach` rule with `handle[area].state()`; draft names must
  match `/^[a-z_]+$/` (a bad name throws). In `log/query.test.ts`:
  `journal(about: "log")` hides rows whose `data.fallback` is `true`
  (`log/query.ts:35` [M] is the filter site), and a `domain:<area>` query
  still finds them (N12). Implement `rules.ts` and the `query.ts`
  filter.
- [ ] **Step 4: Router (test 23).** In `events/router.test.ts`, replace
  `expect(hooks).toHaveLength(20)` (`router.test.ts:44` [M]) with a list
  derived from the mock game's `on*` keys, which now include
  `onAreaEvent`; add a case that an area event routed through
  `onAreaEvent` writes the fallback row, and one that `attach` writes the
  rows of `attachDrafts`. Implement in `events/router.ts`:
  `handle.onAreaEvent((e) => route((rc) => areaDrafts(rules, e, rc)))` in
  `subscribeAll` (`router.ts:185-220` [M]) and
  `route((rc) => attachDrafts(rules, handle, rc))` in `attach` next to the
  memo reset. The router sets `domain: area` and
  `event: \`${area}/${name}\`` on every area draft.
- [ ] **Step 5: Kind on call records (test 25, N10, N11).** Failing
  tests: in `ops/progress.test.ts`, a row with `progress: true` counts as
  progress, and an `afterAction` of kind `read` is skipped as `look` is
  today; in `ops/repeat-guard.test.ts`, a call of kind `read` verifies
  and clears as `look` and `journal` do today, keyed on `kind`, not on
  the tool name. Implement: move `ToolKind` to `contract/result.ts`
  (`tools/game-tool.ts:10` [M]) and import it in `tools/game-tool.ts`,
  `tools/define.ts` and the two tests of gap G2; add `kind: ToolKind` to
  the `afterAction` init and `RepeatCall`
  (`contract/services.ts:88-114` [M]); fill it in `tools/define.ts` from
  `spec.kind`; delete `READS` (`ops/progress.ts:20` [M]), `CLEARING` and
  `VERIFYING` (`ops/repeat-guard.ts:40-49` [M]). Check before deleting
  that `CLEARING` holds exactly the tools of kind `read` in `GAME_TOOLS`;
  if it does not, keep the behaviour by testing the kind that matches and
  report the difference.
- [ ] **Step 6: Tool send check.** Add `expectSendKind(tool)` to
  `test-support/tool-harness.ts`: it runs the tool through `runTool` on a
  `createMockGame()` and fails when the run recorded a packet in the mock
  handle's `sent` and the tool's kind is `read` or `control`. Failing
  tests first in `tools/define.test.ts`: a fixture `read` tool that calls
  a sending mock act fails the check; the same tool of kind `action`
  passes.
- [ ] **Step 7: Docs (test 27).** Reword `docs/harness.md:5` ("acts
  through ten game tools") and `:118` ("uses only these ten tools") to
  drop the count. `mise test packages/harness/src/prompt/harness-doc.test.ts`
  and `mise lint:docs` pass.
- [ ] **Step 8: Run everything.** `mise test packages/harness/src/areas`,
  `mise test packages/harness/src/events`,
  `mise test packages/harness/src/ops`,
  `mise test packages/harness/src/tools`,
  `mise test packages/harness/src/log`, `mise test packages/harness/src/ui`,
  `mise typecheck harness`, `mise ci:checks`.

**Proof:** eval gates (contract 3.6, [D17]). This task changes the
router, the log contract and the progress and repeat guards that every
run passes through (design 3.15 test 29). From an eval worktree of the
task head, run
`mise eval run t1-walk-to-npc --round <n>` and
`mise eval run t7-halt-resume --round <n>`. `t1-walk-to-npc` must pass;
`t7-halt-resume` passes, or fails only with the known stale
`life/low_health` wake, which the grader quotes. Record both verdicts in
the report. If the server or SOAP is down, report it and stop.

**Commit:**

```
refactor: Route area events into the game log

Area events need log rows, glyphs and progress without editing the log
contract per area. The router gains one hook, fallback rows stay out of
the journal, and the guards read the tool kind instead of name lists.
```

---

## Task S0-4: World service areas

Gate R ruling: GR-39 (plan index).

**Design:** 3.10 "World service (N5)", test 26 of 3.15. **Contract:**
1.9 "World service", [D23]. **codeArea:** step0.

**Files:**
- Create: `packages/harness/src/areas/world.ts` and
  `packages/harness/src/areas/world.test.ts`
- Modify (one-time): `packages/harness/src/world/service.ts`,
  `packages/harness/src/world/hub.ts`,
  `packages/harness/src/world/hub.test.ts`

**Depends on:** S0-3.

**Opcodes:** none.

**Steps:**

- [ ] **Step 1: Failing tests** in `areas/world.test.ts`, over a fixture
  registry (`areaViews` and `areaActs` take the registry and the handle as
  arguments) and a fixture handle with one fixture area (cast once to
  `WorldHandle`, because `AreaName` is `never` until S0-5):
  - `areaViews(...).<area>.state()` returns a frozen copy (mutating it
    throws in strict mode and leaves the store unchanged);
  - `onEvent` forwards the area's events, and each subscription passes
    through `hold`, so closing the world handle releases it;
  - `areaActs` exposes only the acts in `worldActs`; a fixture act not in
    `worldActs` is absent at run time, and a `@ts-expect-error` line pins
    its absence from the type;
  - each act goes through `guard`.
  In `world/hub.test.ts`: `claim.areas.<area>.<act>` refuses with
  `not_owner` after the claim is lost and with `offline` with no
  session; `session.areas` exists; `EVENT_KEYS` holds `onAreaEvent`;
  `version` stays 1 and `isWorld` accepts the service.
  Run `mise test packages/harness/src/areas/world.test.ts
  packages/harness/src/world/hub.test.ts`; expected failures: missing
  exports.
- [ ] **Step 2: Implement.** `areas/world.ts` exactly as contract 1.9.
  `world/service.ts`: export `Sender` (private today,
  `world/service.ts:28-30` [M]); `WorldSession` gains
  `readonly areas: AreaViews`; `Claim` gains `readonly areas:
  AreaClaimActs`; `EVENT_KEYS` gains `"onAreaEvent"` (`:57` [M]).
  `world/hub.ts`: build `session.areas` with the existing snapshot
  wrapper and the subscription tracker (`world/hub.ts:130-158` [M]), and
  `claim.areas` with the claim's existing mutex, `not_owner` and
  `offline` guard (`world/hub.ts:168-205` [M]). `claim.act`,
  `WorldActuators` and `drive/actions.ts` do not change.
- [ ] **Step 3: Run everything.** Same tests,
  `mise test packages/harness/src/world`,
  `mise test packages/harness/src/drive`, `mise typecheck harness`,
  `mise ci:checks`.

**Proof:** unit. The live claim call on a real area is part of the S0-5
proof.

**Commit:**

```
refactor: Expose areas through the world service

Extensions need area state and acts without a new world-service key per
area. Reads come through session.areas and acts only through a claim,
limited to each area's listed world acts.
```

---

## Task S0-5: Worked example `time`

Gate R rulings: GR-6, GR-19 to GR-21, GR-28, GR-32, GR-33, GR-35, GR-37 (plan index).

**Design:** 3.13, N6, tests 15, 16, 19 (the `time` rows), 22, 26 (the
`time` case), 27, 28, 29 and 30 of 3.15. **Contract:** 1.10, 1.5 (the
`time` registry lines), 3.8. **codeArea:** time.

**Files:**
- Create (core, under `packages/core/src/wow/`):
  `areas/time/opcodes.ts`, `areas/time/protocol.ts` and
  `protocol.test.ts`, `areas/time/store.ts` and `store.test.ts`,
  `areas/time/runtime.ts` and `runtime.test.ts`, `areas/time/area.ts`,
  `protocol/packed-time.ts` and `protocol/packed-time.test.ts`
- Create: `packages/core/test-support/areas/time.ts`
- Create (harness): `packages/harness/src/areas/time/area.ts` and
  `area.test.ts`
- Create: `docs/areas/time.md`
- Modify (one-time): `packages/core/src/wow/areas/registry.ts` and
  `packages/harness/src/areas/registry.ts` (the `time` line);
  `packages/core/src/wow/protocol/stubs.ts` (delete the `Game time` line,
  gap G6); `packages/core/test-support/mock-handle.test.ts` (test 16);
  `packages/core/src/wow/client.test.ts` (test 15);
  `packages/devtools/src/stale-docs.ts` (add `docs/areas/*.md` to
  `sources`, `stale-docs.ts:77-82` [M])
- Regenerate: `docs/protocol-coverage/core.md`,
  `docs/protocol-coverage/time.md`

**Depends on:** S0-4, T-1 (soap name retry), T-3 (probe), T-4
(cite-check).

**Opcodes:** `SMSG_LOGIN_SETTIMESPEED` (0x042), `CMSG_QUERY_TIME`
(0x1CE), `SMSG_QUERY_TIME_RESPONSE` (0x1CF).

**Wire** (AzerothCore `deployed` `9d4e36d81`, paths under
`src/server/game/` unless marked; read for this plan [M]):

- `SMSG_LOGIN_SETTIMESPEED`: packed game time `uint32`, speed `float`
  (0.01666667), `uint32` 0. Writer:
  `Entities/Player/Player.cpp:11803-11807`, sent at every login.
- Packed time: `(tm_year - 100) << 24 | tm_mon << 20 | (tm_mday - 1) << 14
  | tm_wday << 11 | tm_hour << 6 | tm_min`
  (`src/server/shared/Packets/ByteBuffer.cpp:137-141`). `tm_mon` is 0 to
  11, so `PackedTime.month` is the field plus 1, `day` the field plus 1,
  and `year` the field plus 2000.
- `CMSG_QUERY_TIME`: empty body, `STATUS_LOGGEDIN`, `PROCESS_INPLACE`
  (`Server/Protocol/Opcodes.cpp:593`).
- `SMSG_QUERY_TIME_RESPONSE`: `uint32` server Unix time, then `uint32`
  seconds until the next daily quest reset
  (`Server/Packets/QueryPackets.cpp:47-53`, fields at
  `Server/Packets/QueryPackets.h:71-72`, handler
  `Handlers/QueryHandler.cpp:72-85`).

**Steps:**

- [ ] **Step 1: Packed time (test first).** In
  `protocol/packed-time.test.ts`: a round trip of the AzerothCore formula
  (a helper in the test packs a known date with the `ByteBuffer.cpp:140`
  expression; `parsePackedTime` returns `{ year, month, day, weekday,
  hour, minute }` with month and day 1-based); `readPackedTime` reads the
  same value from a `PacketReader`. Run
  `mise test packages/core/src/wow/protocol/packed-time.test.ts`, see it
  fail on the missing module, then write `protocol/packed-time.ts` as
  contract 1.10 [D10].
- [ ] **Step 2: Test packets.** Write
  `test-support/areas/time.ts`: `timeLoginSetTimeSpeedBody({ gameTime,
  speed })` (packed `uint32`, `float`, `uint32` 0, as
  `Player.cpp:11803-11807`) and `timeQueryResponseBody({ serverTime,
  dailyResetInSec })` (two `uint32`, as `QueryPackets.cpp:49-50`).
- [ ] **Step 3: Parsers.** Failing tests in `areas/time/protocol.test.ts`
  from those bodies, then `parseLoginSetTimeSpeed` and
  `parseTimeQueryResponse` in `areas/time/protocol.ts`. A short body
  throws through the reader, as other parsers do.
- [ ] **Step 4: Store.** Failing tests in `areas/time/store.test.ts`:
  `receiveSetSpeed` sets `gameTime`, `speed` and `receivedAt` from `now()`
  and emits `set_speed` with a detached state; `receiveQueryReply` sets
  `serverTime`, `dailyResetInSec` and `receivedAt` and emits
  `query_reply`; `snapshot()` is a copy; `dispose()` clears listeners.
  Implement `TimeState`, `TimeEvent` and `TimeStore` (contract 1.10)
  with a plain `new Emitter()`, no send and no timer (design 3.3).
- [ ] **Step 5: Opcodes, area and registry.** Write `areas/time/opcodes.ts`
  (`TIME_OPCODES` owns the three names; `uses`, `stubs`, `dead`, `unseen`
  empty) and `areas/time/area.ts` (`timeArea = defineArea({ name:
  "time", opcodes: TIME_OPCODES, eventTypes: ["set_speed",
  "query_reply"], store, register, runtime: timeRuntime })`, `register`
  calling `wire.on` for the two server opcodes). Add
  `time: timeArea` to the core `AREAS` and `time: timeHarness` to
  `HARNESS_AREAS`. Delete `[GameOpcode.SMSG_LOGIN_SETTIMESPEED, "Game
  time"]` from `STUBS` (`protocol/stubs.ts:46` [M]). Rig test in
  `store.test.ts` or `protocol.test.ts`: `areaRig("time")` then `inject`
  of each body updates `rig.handle.state()`. The registry, stub and
  frozen-pair tests of S0-1b now run over `time` and pass.
- [ ] **Step 6: Runtime.** Failing tests in `areas/time/runtime.test.ts`
  with `areaRig("time")`:
  - `act.query()` sends one `CMSG_QUERY_TIME` with an empty body (check
    `rig.sent`), and resolves with the state after an injected
    `SMSG_QUERY_TIME_RESPONSE`;
  - with no reply it rejects `timeout` after 5 s (fake timers in
    `try`/`finally`);
  - a `login_verified` event on `rig.stores.self` sends one
    `CMSG_QUERY_TIME` (N6); the builder records in its report how often
    `login_verified` fires in one session (could not determine while
    planning);
  - dispose rejects a pending `query()` with the lifetime abort reason.
  Implement `timeRuntime` and `TimeActs` (contract 1.10): the query is
  `ctx.send`, then `ctx.until((e) => e.type === "query_reply", {
  timeoutMs: 5000 })`; the login query subscribes through
  `core.self.onEvent` (`self-store.ts:16` [M]) and is released at
  dispose. The login query ends in `.catch(ignoreFailure)`.
- [ ] **Step 7: Harness module.** Failing tests in
  `packages/harness/src/areas/time/area.test.ts`: the `attach` rule turns
  stored state into one `log` row `time/synced` (test 22); the `event`
  rule turns a `query_reply` into one `time/synced` row whose data
  carries `dailyResetInSec`, and a `set_speed` event into one row
  without it; `worldActs` is `["query"]`; through the world hub,
  `claim.areas.time.query` refuses `not_owner` and `offline`, and
  `session.areas.time.state()` is frozen (test 26). Implement
  `timeHarness` with `defineHarnessArea`, sorted keys.
- [ ] **Step 8: Lifecycle and mock.** `mock-handle.test.ts` (test 16):
  `handle.time` has `state`, `onEvent` and `act.query`;
  `triggerAreaEvent("time", ...)` reaches `onAreaEvent` and
  `handle.time.onEvent`; `handle.time.act.query()` records a
  `CMSG_QUERY_TIME` in `sent`. `client.test.ts` (test 15): after
  `cleanupSession`, `conn.events.area.size` is 0, a pending
  `time` query has rejected, and the time store's listeners are gone
  (runtimes disposed before stores).
- [ ] **Step 9: Docs and coverage.** Write `docs/areas/time.md` with the
  fixed headings of contract 3.8: wire notes (the packed-time layout and
  the 0-based `tm_mon`; wowm and AzerothCore agree on these three bodies
  unless the builder finds otherwise, in which case it cites both);
  "Left out": none; "Capabilities row": "No agent verb; the world-service
  act `time.query` only (R9)."; the proof table with one row per owned
  opcode (below). Add `docs/areas/*.md` to `sources`
  in `stale-docs.ts` in this commit. Run `mise protocol:coverage`,
  `mise lint:docs` and `mise protocol:cite-check`.
- [ ] **Step 10: Run everything.** `mise test packages/core/src/wow/areas`,
  `mise test packages/core/src/wow/protocol`,
  `mise test packages/core/test-support`,
  `mise test packages/harness/src/areas`, `mise typecheck core`,
  `mise typecheck harness`, `mise ci:checks`. Record the `mise
  typecheck core` time with one area.

**Proof:** live (design 3.13, test 28), on one account of the task's own:

1. `mise factory soap create <preset>` into a file under `tmp/`; read the
   account with `jq`, never print the password.
2. `mise protocol:probe <ACCOUNT> --flow login --expect
   SMSG_LOGIN_SETTIMESPEED --expect SMSG_QUERY_TIME_RESPONSE --wait 5`:
   exit 0; the output lists one sent `CMSG_QUERY_TIME` (from N6) and both
   server opcodes received, and no packet error. Then
   `mise protocol:probe <ACCOUNT> --send CMSG_QUERY_TIME --expect
   SMSG_QUERY_TIME_RESPONSE`: exit 0 (the server accepts the client
   opcode and answers).
3. The harness on the same account with `--packet-trace headers` and a
   throwaway extension in `tmp/` loaded with `--extension`. While no
   agent turn holds control, the extension takes a `loop` claim, calls
   `claim.areas.time.query()`, logs the result, and releases the claim.
   The game log shows a `time/synced` row from `attach` and a
   `time/synced` row whose data carries `dailyResetInSec`. The trace
   shows `SMSG_LOGIN_SETTIMESPEED` `handled`, not a `not_implemented`
   notice.
4. `mise factory soap delete <ACCOUNT>`.

No GM command is needed. The proof table rows:

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_LOGIN_SETTIMESPEED` | `live` | probe flow `login`, exit 0 | `Entities/Player/Player.cpp:11803` |
| `CMSG_QUERY_TIME` | `live` | probe `--send CMSG_QUERY_TIME`, exit 0; the reply follows | `Server/Protocol/Opcodes.cpp:593` |
| `SMSG_QUERY_TIME_RESPONSE` | `live` | probe flow `login`, exit 0; harness run `time/synced` row | `Server/Packets/QueryPackets.cpp:47` |

**Gates** (contract 3.6, [D17]; design 3.15 test 29), because N6 adds one
packet to every login and this is the last step-0 task: from an eval
worktree of the task head run `t1-walk-to-npc` (must pass),
`t7-halt-resume` (passes, or fails only with the known stale wake) and
`t3-ghostlands-kill` (no failure cause that the R0 baseline did not
show), each with `mise eval run <id> --round <n>`. No eval scenario is
added: `time` adds no agent verb (R9).

**Commit:**

```
feat: Track game time and the daily reset

The first area proves every attachment point before workers fan out.
The login game time is parsed instead of stubbed, and one time query
after login gives the seconds until the daily quest reset.
```

---

## Dead opcodes

None. All three `time` opcodes are relevant: the server sends
`SMSG_LOGIN_SETTIMESPEED` at every login (`Player.cpp:11803-11807`),
handles `CMSG_QUERY_TIME` when logged in (`Opcodes.cpp:593`) and answers
with `SMSG_QUERY_TIME_RESPONSE` (`Handlers/QueryHandler.cpp:84`). The UI
timer pair that world-1 adds to `time` under a lease belongs to the
`world` unit, not to this one.

## Build rulings

- **BR-S0-1b-1.** Issue: contract 1.8 adds `onAreaEvent` to `MockHandle`,
  and `createMockGame()` spreads the handle
  (`packages/harness/test-support/mock-game.ts:61` [M]), so the hook
  filter in `packages/harness/src/events/router.test.ts:33-35` [M] counts
  21 keys and "attach subscribes all 20 hooks and detach removes them"
  fails at `router.test.ts:44` [M]. The router subscribes `onAreaEvent`
  only in S0-3 (design 3.15 test 23, design 3.16 commit 0c, contract 1.1
  row S0-3), and `router.test.ts` belongs to S0-3. Ruling: S0-1b makes one
  edit outside its files. It adds `&& key !== "onAreaEvent"` to the
  filter at `router.test.ts:34` [M], keeps `toHaveLength(20)`, and changes
  nothing else in that file. This amends contract 1.1 for that one line
  only; the S0-1b commit then stages 22 paths. S0-3 step 4 removes the
  exclusion when it replaces the pinned 20 with the derived list, so that
  list includes `onAreaEvent`. The fix stays in the S0-1b commit, which
  causes the failure, so every commit on the branch passes on its own.
  Not yet ruled by the maintainer.

## COMPLETE
