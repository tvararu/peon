# Pi harness epic: interface contract (key: contract)

Plan index: [2026-09-26-pi-harness-epic-plan.md](../2026-09-26-pi-harness-epic-plan.md).

Written 2026-09-26 for the nine area plan writers and the builders after
them. This file is the single source of truth for every name and type that
crosses a task boundary. If an area plan and this file disagree, this file
wins. A plan writer who finds a defect here reports it to the coordinator;
the writer does not invent a second name.

Sources: `design/harness-design.md` (A–K, approved R28–R38, and its two
verification sections), `design/eval-suite.md` (with the t1 service
revision), `design/luna-runtime.md`, `design/harness-architecture.md`,
`design/event-volume.md`, `design/ui-gallery.md`, `design/glyphs/`,
`design/nav-diagnosis.md`, `design/migration-plan.md` §2,
`t1-service/README.md`, `HANDOVER.md`. Code read at `epic/pi-harness`
`5d75de0`. Marks: **measured** (a command ran here), **read** (read in the
cited file), **decided** (a contract decision, with its reason).

## 0. Rules for every task

### 0.1 Build rules

- Worktree: `/home/deity/orca/workspaces/tuicraft/pi-epic`, branch
  `epic/pi-harness`. Builders work in Orca child worktrees and merge into
  that branch. Never merge PR #367.
- Commit with `mise exec -- git commit` (the `hk` hook needs the mise PATH).
  Subject is a Conventional Commit of at most 50 characters. `git add` the
  exact paths first, as a separate command.
- Tests: `bun:test`, colocated (`foo.ts` → `foo.test.ts`). Run one file with
  `mise test packages/<pkg>/src/<path>.test.ts`. Fake timers:
  `jest.useFakeTimers()` in `try/finally` with `jest.useRealTimers()`.
  Never `mock.module` (banned by `config/biome.grit`); inject dependencies.
- Style: `type` only, no `interface`, no `enum`, no comments, no
  `biome-ignore`, files at most 500 non-blank lines, `function` for named
  exports, a single object argument when an argument list would wrap.
  Throw inside code whose preconditions we control; validate only at
  boundaries (profile file, omp database, tool arguments, soap JSON, Pi
  events).
- Type check: `bun run tsc --noEmit -p packages/<pkg>` (HANDOVER: use
  `bun run tsc`, not `mise exec -- tsc`). Full gate: `mise ci`.

### 0.2 Import rules (measured in `biome.json` and the package manifests)

| From | May import |
|---|---|
| `packages/core` | only `#wow/*`, `#lib/*`; tests also `#test-support/*` |
| `packages/harness` | `@tuicraft/core`, `@tuicraft/core/session`, `@tuicraft/core/lib/{abort,config,errors,ignore-failure,paths}`, tests also `@tuicraft/core/test-support/{mock-handle,must,temp-paths,control-fixtures,internals}`; `@earendil-works/{pi-agent-core,pi-ai,pi-coding-agent,pi-tui}`; its own `#harness/*` and `#test-support/*` |
| `packages/devtools` | `@tuicraft/core` public surface and its own `#tools/*` |

- Every other package has `"exports": {}`. Nothing can import
  `@tuicraft/harness`, `@tuicraft/factory` or `@tuicraft/devtools`.
- F1 adds this `imports` map to `packages/harness/package.json`:
  `"#harness/*": "./src/*.ts"`, `"#test-support/*": "./test-support/*.ts"`.
  Harness code imports its own modules as `#harness/<dir>/<file>`.
- Core types that the harness names come only from the barrel
  `packages/core/src/wow/index.ts`. `lib/emitter` is not exported; the
  barrel re-exports `Unsubscribe` (C1).
- The harness reaches the factory only as a subprocess:
  `bun packages/factory/src/main.ts soap <verb> …`.

### 0.3 Shared-file rule

Each file has exactly one owner task (section 3). A task edits only files it
owns, except where section 3 names an **insertion point**: a named line or
block that a named later task adds, and nothing else. Two insertion points
exist in `packages/harness/src/extension/extension.ts` and in `mise.toml`;
core has a phase rule instead (C0 owns the three core surface files; later
core tasks edit only their body files). A builder who needs an edit outside
its files stops and reports to the coordinator.

### 0.4 Task ids

Ids are fixed: `C<n>` core, `F<n>` foundation, `L<n>` log and events,
`A<n>` ops and tools part A, `B<n>` ops and tools part B, `U<n>` UI, `P<n>`
prompt and docs, `E<n>` eval infrastructure. An area plan writer may split
a task into `<id>a`, `<id>b`, … when each part has its own test cycle. A
writer never merges, renames or moves a task to another area, and never
moves a file to another owner.

### 0.5 Navigation track

The navigation track (workflow `wf_76eada92-d4d`, branch `epic/nav-track`,
commits `ef796bf`, `fd4440f`, `200dc15`, `305acf6`, `8dff45c`, measured with
`git log`) lands design G8 (= ND F3 + F4) and N1 (= ND F1 + F2) on
`epic/pi-harness`. This plan does not build G8 or N1. Gate **NAV** = those
commits are on `epic/pi-harness`. Follow-ups this plan owns:

- C2 edits `client-control.ts` (the `queryNearby` method only). C2 starts
  after NAV, because the nav track also edits `client-control.ts`.
- B1 keeps the harness floor retry (ND F5). After G8 core resolves the floor
  for a unit goal itself, so the retry rarely fires; B1 tests both the
  "core resolved" path and the "core refused with one matching floor" path
  on the mock handle.
- F3b reads navigation paths from the soap session's
  `<dir>/config/config.toml`, which after N1 points at the patched library.
  F3b tests that `navigationLibrary` comes from that file, not from
  `~/.config/tuicraft/config.toml`.
- E5 marks the movement-bound round-1 scenarios (`t1-walk-to-npc`,
  `t4-quest-first`, `t5-vendor-buy-goldshire`, `t6-die-and-recover`) with
  `"navBound": true` and grades their movement failures as area `core`
  until NAV is on the eval worktree's commit (design I.4).

## 1. Core additions (`packages/core/src/wow/`)

### 1.1 Phase rule for core

- **C0** is one commit. It adds every new `WorldHandle` member, every new
  type and every new row field. Getter and action bodies throw
  `new Error("not_implemented")`. Two exceptions, decided: `onNotice`
  subscribes for real (the harness router subscribes every `on*` hook at
  connect, so a throwing hook would break every connect), and new row and
  state fields get neutral values (below), so every consumer type-checks
  from C0 on.
- C0 creates three new body files and spreads them once in `createHandle`
  (`client.ts`): `client-place.ts`, `client-runs.ts`, `client-extras.ts`.
  After C0 the body files belong to the tasks in section 3. **No task
  after C0 edits `client.ts`.** `index.ts` has one more editor, C1 (same
  builder, next commit). `test-support/mock-handle.ts` has one insertion
  point, the `queryNearby` block, for C2.
- `mise ci` is green after every core commit (R21). The mock handle is typed
  as `WorldHandle`, so it must hold a stub for every new member in the same
  commit (measured: `mock-handle.ts:29` `type MockHandle = WorldHandle & …`).
- A core task that changes CLI-visible output (C5: `combat --json` gains
  `attackers`; C6: the daemon formatter case for `place_changed`) updates
  `packages/cli/src/cli/help.ts`, `docs/manual.md`,
  `.claude/skills/tuicraft/SKILL.md` and `README.md` in the same commit only
  if the change is visible there (AGENTS.md "Documentation").

In section 1, "C6" means C6a (generator and data) plus C6b (parser, state,
handler), and "C7" means C7a (`lootCorpse`) plus C7b (`recoverCorpse`);
section 4 splits them.

### 1.2 New `WorldHandle` members (C0 adds to the type in `client.ts`)

```ts
capabilities: () => Capabilities;
getPlaceState: () => PlaceState;
lootCorpse: (guid: bigint, signal: AbortSignal) => Promise<LootOutcome>;
recoverCorpse: (signal: AbortSignal) => Promise<RecoveryOutcome>;
onNotice: (cb: (event: NoticeEvent) => void) => Unsubscribe;
getCreatureInfo: (entry: number) => CreatureInfo | undefined;
```

`createHandle` in `client.ts` gains three spreads, after `defenseMethods`:

```ts
...placeMethods(conn, rt),
...runMethods(conn, rt),
...extrasMethods(conn, rt),
```

### 1.3 `client-place.ts` (created by C0, body by C6)

```ts
export type PlaceState = {
  mapId: number | undefined;
  zoneId: number | undefined;
  areaId: number | undefined;
  zone: string | undefined;
  area: string | undefined;
  at: number | undefined;
};

export function placeMethods(conn: WorldConn, rt: Runtimes): Pick<WorldHandle, "getPlaceState">;
```

- C0 body: `getPlaceState` throws `not_implemented`.
- C6 body: returns the state parsed from the last `SMSG_INIT_WORLD_STATES`
  (`u32 mapId, u32 zoneId, u32 areaId, u16 count, count × {u32 state,
  u32 value}`); `zone` and `area` come from
  `packages/core/src/wow/data/area-names.json` (`Record<string, string>`,
  id → name). All fields are `undefined` before the first packet. On each
  packet whose map, zone or area differs from the last one, C6 emits
  `conn.events.control.emit({ type: "place_changed", state: <control snapshot> })`.

### 1.4 `client-runs.ts` (created by C0, body by C7)

```ts
export type LootOutcome = { ok: true; record: CycleLootRecord | undefined } | CycleStop;
export type RecoveryOutcome = ({ ok: true } & CycleRecovery) | CycleStop;

export function runMethods(conn: WorldConn, rt: Runtimes): Pick<WorldHandle, "lootCorpse" | "recoverCorpse">;
```

- These are exactly `Looted` from `loot-run.ts` and `Recovered` from
  `corpse-run.ts` (read), so C7 returns the result of `lootCorpse(run, guid)`
  and `recoverCorpse(run)` unchanged. `record: undefined` means the corpse
  had nothing to loot.
- C7 builds `LootRun` and `CorpseRun` the way `encounter-cycle.ts:345-393`
  does (read): new `EventWaiter`s fed by `conn.events.rewards`,
  `conn.events.entity` (filtered to the guid), `conn.events.recovery` and
  `conn.events.control`, unsubscribed in `finally`; `bags` built from
  `rt.quests` and `rt.items` as `runtime.ts:321-329` does (read). C7 does not
  edit `runtime.ts`, `loot-run.ts` or `corpse-run.ts`.
- A call while the cycle runs, or while another `lootCorpse` or
  `recoverCorpse` runs, returns `cycleStop("busy")`.

### 1.5 `client-extras.ts` (created by C0; bodies by C2, C9, C10)

```ts
export type Capabilities = {
  factions: boolean;
  spells: boolean;
  navigation: boolean;
  jev: boolean;
};

export type NoticeEvent = {
  type: "not_implemented";
  opcode: number;
  label: string;
  text: string;
  at: number;
};

export type CreatureRank = "normal" | "elite" | "rare_elite" | "boss" | "rare";

export type CreatureInfo = {
  entry: number;
  name: string;
  subName: string | undefined;
  creatureType: number;
  family: number;
  rank: CreatureRank;
};

export function extrasMethods(conn: WorldConn, rt: Runtimes): Pick<WorldHandle, "capabilities" | "onNotice" | "getCreatureInfo">;
```

- `capabilities` (C2): `factions` = the faction catalog is loaded; `spells` =
  the spell catalog is loaded; `navigation` = `navigationDataDir` and
  `navigationLibrary` are both set; `jev` = `jevApiKey` is set. C2 adds
  `capabilities: () => Capabilities` to `Runtimes` in `runtime.ts` and starts
  both catalog loads when the runtimes are created, if `spellDataDir` is set,
  so `unknown` relation means "no data", not "not loaded yet".
- `onNotice` (C0, real): `conn.events.notice.subscribe(cb)`. C10 makes
  `protocol/stubs.ts` emit a `NoticeEvent` instead of the fake SYSTEM chat
  line (`client-handlers.ts:156`, read), and makes the CLI daemon subscribe
  and print the same text as today. The fake SYSTEM lines in
  `client-social.ts` stay (the `social` tool reads them).
- `getCreatureInfo` (C9): the cached parse of
  `SMSG_CREATURE_QUERY_RESPONSE` per entry. Rank codes 0–4 map to
  `normal, elite, rare_elite, boss, rare`. `undefined` until the response
  arrives. C9 keeps the existing name cache and entity naming unchanged.

### 1.6 `world-events.ts` (C0)

```ts
notice: Emitter<[NoticeEvent]>;
```

added to `WorldEvents` and to `createWorldEvents` (`new Emitter(report)`).

### 1.7 `nearby.ts` row fields (C0 adds with neutral values; C4, C3, C2 fill)

```ts
export type NearbyUnits = {
  relation: (guid: bigint) => FactionRelation;
  attackingMe: (guid: bigint) => boolean;
};

export type NearbySources = {
  control: Pick<ControlState, "selfGuid" | "pose">;
  entities: readonly Entity[];
  observedPosition: (guid: bigint) => ObservedPosition | undefined;
  remotePoses: readonly RemotePose[];
  now: number;
  units?: NearbyUnits;
};

export type NearbyRow = {
  entity: Entity;
  position: Position | undefined;
  positionSource: NearbyPositionSource | null;
  positionKind: NearbyPositionKind | null;
  positionObservedAt: number | null;
  distance: number | null;
  horizontalDistance: number | null;
  bearingRadians: number | null;
  turnRadians: number | null;
  originSource: NearbyOriginSource | null;
  originUpdatedAt: number | null;
  self: boolean;
  remotePose: RemotePose | undefined;
  preparedAt: number;
  relation: FactionRelation;
  attackable: boolean;
  attackingMe: boolean;
  targetOf: bigint | undefined;
  roles: NpcRole[];
  lootable: boolean;
  tapped: boolean;
  tappedByOther: boolean;
};
```

| Field | C0 value | Filled by | Meaning |
|---|---|---|---|
| `relation` | `"unknown"` | C2 | `units.relation(guid)` for units; `"unknown"` for game objects, self and when `units` is absent. Computed with `targetRelation` (`combat-actions-target.ts:58`, read). `unknown` never becomes `neutral` |
| `attackable` | `false` | C2 | unit, alive, relation `hostile` or `neutral`, and no `TARGET_BLOCK` unit flag (`combat-actions-target.ts:15`, read) |
| `attackingMe` | `false` | C2 | `units.attackingMe(guid)` (`CombatRuntime.isAttackingSelf`) |
| `targetOf` | `undefined` | C2 | the guid this unit has targeted (`UnitEntity.target`), `undefined` for `0n` or a non-unit |
| `roles` | `[]` | C3 | `npcRoles(unit.npcFlags)` |
| `lootable` | `false` | C4 | the `UNIT_DYNFLAG_LOOTABLE` bit of `UNIT_DYNAMIC_FLAGS` |
| `tapped` | `false` | C4 | the `UNIT_DYNFLAG_TAPPED` bit |
| `tappedByOther` | `false` | C4 | `tapped` and not `UNIT_DYNFLAG_TAPPED_BY_PLAYER`; C4 records in its commit body that the "tapped by me" meaning is not yet live-verified (design G4) |

C2 passes `units` at both call sites: `client-control.ts` `queryNearby`
(C2 edits only that method, after NAV) and the mock handle's `queryNearby`
block (C2's insertion point).

### 1.8 `npc-roles.ts` (created by C0 with the type and a throwing function; body by C3)

```ts
export type NpcRole =
  | "gossip"
  | "questgiver"
  | "trainer"
  | "class_trainer"
  | "profession_trainer"
  | "vendor"
  | "vendor_ammo"
  | "vendor_food"
  | "vendor_poison"
  | "vendor_reagent"
  | "repair"
  | "flight_master"
  | "spirit_healer"
  | "spirit_guide"
  | "innkeeper"
  | "banker"
  | "petitioner"
  | "tabard_designer"
  | "battlemaster"
  | "auctioneer"
  | "stable_master"
  | "guild_banker"
  | "spellclick"
  | "mailbox";

export function npcRoles(flags: number): NpcRole[];
```

C3 maps the AzerothCore `NPCFlags` bits (`UnitDefines.h:322-343` in
`../azerothcore-wotlk-playerbots`, verify each bit there): `0x1` gossip,
`0x2` questgiver, `0x10` trainer, `0x20` class_trainer, `0x40`
profession_trainer, `0x80` vendor, `0x100` vendor_ammo, `0x200`
vendor_food, `0x400` vendor_poison, `0x800` vendor_reagent, `0x1000`
repair, `0x2000` flight_master, `0x4000` spirit_healer, `0x8000`
spirit_guide, `0x10000` innkeeper, `0x20000` banker, `0x40000` petitioner,
`0x80000` tabard_designer, `0x100000` battlemaster, `0x200000` auctioneer,
`0x400000` stable_master, `0x800000` guild_banker, `0x1000000` spellclick,
`0x4000000` mailbox. Output order is the order of this list.

### 1.9 `combat.ts` (C0 adds with neutral values; C5 fills)

```ts
export type CombatState = {
  self: CombatUnit;
  target: CombatUnit | undefined;
  selectedGuid: bigint | undefined;
  attacking: boolean;
  pendingAttack: bigint | undefined;
  attackTarget: bigint | undefined;
  casting: CombatCast | undefined;
  pendingCast: CombatCast | undefined;
  learned: number[];
  unknownLearned: number[];
  cooldowns: CombatCooldown[];
  auras: CombatAura[];
  targetAuras: CombatAura[];
  lastOutcome: CombatOutcome | undefined;
  lastXp: CombatXp | undefined;
  lastLevelUp: (LevelUpInfo & { at: number }) | undefined;
  attackers: bigint[];
};

export type CombatEvent = {
  type: CombatEventType;
  state: CombatState;
  reason?: string;
  spellName?: string;
  attacker?: bigint;
};
```

C0: `attackers: []` in `snapshot()`. C5: `attackers: this.attackers()`
(`combat.ts:193`, measured) and `attacker: packet.attacker` on the
`attacked` emit (`combat.ts:466`, measured). C5 exposes `attackers` in
`combat --json` through `jsonSafe`.

### 1.10 `control.ts` (C0)

`ControlEventType` gains `"place_changed"`. C6 emits it (1.3). C6 also adds
the daemon formatter case or an explicit ignore for it.

### 1.11 `item-labels.ts` (C0 adds optional fields and a throwing function; C11 fills)

```ts
export type ItemLabel = {
  name: string | null;
  quality: number | null;
  itemClass?: number;
  subclass?: number;
  useSpellIds?: number[];
};

export type ItemKind = "food_drink" | "potion" | "other";

export function itemKind(label: ItemLabel): ItemKind;
```

C11: `ItemTemplates.label` in `item-use.ts` fills `itemClass`, `subclass`
and `useSpellIds` (the ids of `spells` with trigger `ON_USE`) from the
parsed template (`protocol/item.ts:19-27`, read). `itemKind`: class 0
(consumable) with subclass 5 → `food_drink`; class 0 with subclass 1 →
`potion`; everything else and a missing class → `other`. The fields stay
optional so no existing literal breaks.

### 1.12 Barrel exports (`index.ts`)

C0 adds:

```ts
export type { Capabilities, CreatureInfo, CreatureRank, NoticeEvent } from "#wow/client-extras";
export type { PlaceState } from "#wow/client-place";
export type { LootOutcome, RecoveryOutcome } from "#wow/client-runs";
export { type ItemKind, itemKind } from "#wow/item-labels";
export type { NearbyUnits } from "#wow/nearby";
export { type NpcRole, npcRoles } from "#wow/npc-roles";
```

C1 adds (existing types the harness names; the first five measured missing
in HS §2):

```ts
export type { Unsubscribe } from "#lib/emitter";
export type { TrainerEvent } from "#wow/trainer";
export type { VendorEvent } from "#wow/vendor";
export type { DestroyEvent } from "#wow/destroy";
export type { RemoteMotionEvent } from "#wow/remote-motion";
export type { TacticsOutcome } from "#wow/tactics";
export { JevUnavailableError } from "#wow/jev-failure";
export type { FactionRelation } from "#wow/faction-template";
export type { PlayerLife } from "#wow/player-state";
export type { CycleStop } from "#wow/cycle-stop";
export type { CycleRecovery } from "#wow/corpse-run";
export type { CombatAura } from "#wow/aura-store";
export type { ControlEventType } from "#wow/control";
export type { CombatEventType } from "#wow/combat";
export type { NamedInventoryItem, NamedInventorySlot, NamedLootItem } from "#wow/item-labels";
```

Merge each line into the existing export statement for the same module
where one exists (biome sorts them). There is no other barrel change in
this epic.

### 1.13 Mock handle (`test-support/mock-handle.ts`, C0)

New stubs (neutral values, never throw):

```ts
capabilities: jest.fn(() => ({ factions: false, spells: false, navigation: false, jev: false })),
getPlaceState: jest.fn(() => ({ mapId: undefined, zoneId: undefined, areaId: undefined, zone: undefined, area: undefined, at: undefined })),
lootCorpse: jest.fn(async () => ({ ok: true as const, record: undefined })),
recoverCorpse: jest.fn(async () => ({ ok: false as const, cause: "mock_recover_unavailable" })),
onNotice(cb) { return events.notice.subscribe(cb); },
getCreatureInfo: jest.fn(() => undefined),
```

New trigger helpers on `MockHandle`:

```ts
triggerNotice: (event: NoticeEvent) => void;
triggerCycleEvent: (event: CycleEvent) => void;
triggerTrainerEvent: (event: TrainerEvent) => void;
```

Tests replace a stub by assignment, for example
`handle.capabilities = () => ({ factions: true, spells: true, navigation: true, jev: true })`,
because `MockHandle` types members as `WorldHandle` functions.

### 1.14 G8 and N1

Built by the navigation track (0.5). Nothing here.

## 2. Harness internal API (`packages/harness/src/`)

### 2.0 Layout and the frozen `contract/` module

Layout is design H.1 with four decided changes: `contract/` holds every
cross-module type (design H.1 verification note); `log/schema.ts` is folded
into `contract/log.ts`; `ops/views.ts`, `ops/refusal.ts`, `ops/resolve.ts`,
`runs/wait.ts`, `events/snapshot.ts`, `tools/params.ts`,
`tools/registry.ts`, `tools/install.ts`, `ui/context.ts`,
`ui/status-line.ts`, `ui/install.ts`, `events/install.ts`,
`prompt/install.ts`, `runtime/mutex.ts` are added; the grader tooling lives
in `grader/` (section 2.13).

F2 writes the seven `contract/*.ts` files exactly as below, type-only (no
runtime code), and they are frozen after F2. Every implementation file
satisfies these types (`const x: RefTable = …` or `class … implements …`).
A change to a contract type needs the coordinator.

Two helper spellings used below:

- `Guid` text is `guid.toString(16)` (lowercase hex, no prefix), from
  `guidHex` in `ops/refs.ts`. No `bigint` goes into a view, a log row or
  `details`.
- Time is epoch milliseconds from `Clock.now()`.

Where outside names come from (read in the installed 0.87.1 `.d.ts` files):

| Names | Import from |
|---|---|
| `Type`, `StringEnum`, `Static`, `TSchema`, `CredentialStore`, `Credential`, `CredentialInfo`, `AuthOperationOptions`, `fauxProvider`, `fauxAssistantMessage`, `fauxToolCall`, `fauxText` | `@earendil-works/pi-ai` |
| `ThinkingLevel`, `AgentToolResult`, `AgentToolUpdateCallback` | `@earendil-works/pi-agent-core` |
| `ExtensionAPI`, `ExtensionContext`, `ExtensionFactory`, `ExtensionUIContext`, `ToolDefinition`, `ToolRenderResultOptions`, `MessageRenderer`, `EntryRenderer`, `Theme`, `AgentSessionRuntime`, `createAgentSessionRuntime`, `createAgentSessionFromServices`, `createAgentSession`, `ModelRuntime`, `SessionManager`, `SettingsManager`, `InteractiveMode` | `@earendil-works/pi-coding-agent` |
| `Component`, `TUI`, `KeyId`, `visibleWidth` | `@earendil-works/pi-tui` |
| every core type and value named in section 1, plus `WorldHandle`, `ClientConfig`, `GotoTarget`, `ControlPose`, `CycleState`, `ChatMessage`, `GroupEvent`, `DuelEvent`, `CombatEvent`, `TacticsEvent`, `CycleEvent`, `RecoveryEvent`, `ControlEvent`, `QuestEvent`, `RewardsEvent`, `EntityEvent`, `NearbyRow`, `CLASS_NAMES`, `nextStepFor` | `@tuicraft/core` |
| `authWithRetry`, `worldSession` | `@tuicraft/core/session` |
| `parseConfig`, `clientConfig`, `Config` | `@tuicraft/core/lib/config` |
| `abortable`, `pause`, `isAbort` | `@tuicraft/core/lib/abort` |
| `messageOf` | `@tuicraft/core/lib/errors` |
| `ignoreFailure` | `@tuicraft/core/lib/ignore-failure` |
| `createMockHandle` (tests only) | `@tuicraft/core/test-support/mock-handle` |

#### `contract/result.ts`

```ts
export type ToolName =
  | "look"
  | "travel"
  | "engage"
  | "loot"
  | "interact"
  | "rest"
  | "recover"
  | "social"
  | "journal"
  | "stop";

export type ToolStatus = "DONE" | "PARTLY" | "RUNNING" | "UNCONFIRMED" | "REFUSED" | "FAILED";

export type Evidence = { seq: number; domain: string; event: string };

export type ToolResult<A> = {
  status: ToolStatus;
  reason?: string;
  detail: string;
  body: string[];
  next?: string;
  options?: unknown;
  after: A;
  runId?: string;
  evidence?: Evidence[];
};

export type ResultInit<A> = Omit<ToolResult<A>, "status" | "body"> & { body?: string[] };
```

- `detail` is the model's line 1 after the status word; `body` holds the
  lines between line 1 and the `Danger:` and `Next:` lines; `next` is the
  text after `Next: ` (without the prefix). Section 2.6 gives the format.
- `reason` is a snake_case code: the refusal codes named in design A and B
  (`too_far`, `no_ground`, `start_off_mesh`, `ambiguous_floor`, `busy`,
  `human_waiting`, `turn_budget`, `not_ready`, `offline`, `repeat`,
  `not_seen`, `ambiguous_unit`, `too_strong`, `low_health`, `low_mana`,
  `other_attacker`, `no_combat_helper`, `item_sources_unknown`, `dead`,
  `died`, `cancelled`, `interrupted`, `jev_unavailable`, `not_lootable`,
  `corpse_unreachable`, `secret`, `not_implemented`, …). A tool may add a
  code; it must be snake_case and appear in that tool's tests.

#### `contract/views.ts`

```ts
import type { Capabilities, FactionRelation, NpcRole, PlayerLife } from "@tuicraft/core";
import type { RunKind } from "#harness/contract/runs";

export type Compass = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

export type PoseView = {
  mapId: number;
  x: number;
  y: number;
  z: number;
  facing: Compass;
  source: "server" | "predicted";
  ageMs: number;
  serverFixAgeMs: number | undefined;
};

export type PowerKind = "mana" | "rage" | "energy" | "focus" | "runic_power" | "none";

export type VitalsView = {
  hp: number;
  maxHp: number;
  power: number;
  maxPower: number;
  powerKind: PowerKind;
};

export type SelfView = VitalsView & {
  name: string;
  guid: string;
  level: number;
  className: string;
  race: string;
  life: PlayerLife;
  inCombat: boolean;
  xpPct: number | undefined;
  copper: number | undefined;
  freeSlots: number | undefined;
  pose: PoseView | undefined;
};

export type PlaceView = {
  zone: string | undefined;
  area: string | undefined;
  zoneId: number | undefined;
  areaId: number | undefined;
  ageMs: number | undefined;
};

export type UnitView = {
  ref: string;
  guid: string;
  entry: number;
  name: string;
  kind: "creature" | "player";
  level: number;
  relation: FactionRelation;
  attackable: boolean;
  attackingMe: boolean;
  targetsMe: boolean;
  roles: NpcRole[];
  alive: boolean;
  hp: number;
  maxHp: number;
  hpPct: number;
  lootable: boolean;
  tappedByOther: boolean;
  distance: number | undefined;
  compass: Compass | undefined;
  x: number | undefined;
  y: number | undefined;
  z: number | undefined;
  seenAgoMs: number;
  inView: boolean;
};

export type NearestKind =
  | "hostile"
  | "attackable"
  | "questgiver"
  | "vendor"
  | "trainer"
  | "repair"
  | "lootable"
  | "player"
  | "spirit_healer";

export type AttackerView = { ref: string; guid: string; name: string; hitAgoMs: number | undefined };

export type DangerView = { attackers: AttackerView[]; hpPct: number };

export type CastView = { spell: string; elapsedMs: number; totalMs: number };

export type AuraView = { spellId: number; name: string; remainingMs: number | undefined; mine: boolean };

export type RunView = { id: string; kind: RunKind; label: string; elapsedMs: number; progress: string | undefined };

export type RecoveryView = {
  corpseYd: number | undefined;
  corpseCompass: Compass | undefined;
  reclaimInMs: number | undefined;
  spiritHealer: UnitView | undefined;
};

export type NoProgress = { actions: number; sinceMs: number; lastRefusal: string | undefined; untried: string[] };

export type NowSnapshot = {
  at: number;
  self: SelfView;
  place: PlaceView;
  target: UnitView | undefined;
  targetAuras: AuraView[];
  selfCast: CastView | undefined;
  attackers: AttackerView[];
  hpDelta5s: number | undefined;
  run: RunView | undefined;
  nearest: Partial<Record<NearestKind, UnitView>>;
  recovery: RecoveryView | undefined;
  noProgress: NoProgress | undefined;
  wake: boolean;
};

export type SnapshotWorld = {
  self: SelfView;
  place: PlaceView;
  target: UnitView | undefined;
  attackers: AttackerView[];
  units: UnitView[];
};

export type InWorld = {
  char: string;
  guid: string;
  account: string;
  level: number;
  className: string;
  race: string;
  mapId: number;
  zoneId: number | undefined;
  zone: string | undefined;
  pose: { mapId: number; x: number; y: number; z: number };
  capabilities: Capabilities;
  at: number;
};
```

- `NowSnapshot.nearest` includes units out of view (from `Sightings`), so a
  `UnitView` with `inView: false` has its last seen position and
  `seenAgoMs`.
- `NoProgress` is present only when the no-progress counter is 3 or more
  (design C.6).

#### `contract/details.ts`

```ts
import type { GameLogEntry } from "#harness/contract/log";
import type { ToolName, ToolResult } from "#harness/contract/result";
import type { RunRecord } from "#harness/contract/runs";
import type {
  AttackerView,
  CastView,
  Compass,
  DangerView,
  NearestKind,
  PlaceView,
  PoseView,
  RunView,
  SelfView,
  UnitView,
  VitalsView,
} from "#harness/contract/views";
import type { ItemKind, NpcRole } from "@tuicraft/core";

export type LookFilter =
  | "any"
  | "hostile"
  | "attackable"
  | "questgiver"
  | "vendor"
  | "trainer"
  | "repair"
  | "lootable"
  | "player"
  | "corpse"
  | "spirit_healer";

export type LookAfter = {
  self: SelfView;
  place: PlaceView;
  target: UnitView | undefined;
  run: RunView | undefined;
  filter: LookFilter;
  name: string | undefined;
  within: number | undefined;
  rows: UnitView[];
  matched: number;
  seen: number;
  nearest: Partial<Record<NearestKind, UnitView>>;
  danger: DangerView;
  unchanged: number;
};

export type LegStatus = "arrived" | "refused" | "failed" | "interrupted" | "cancelled";

export type LegView = { index: number; status: LegStatus; reason: string | undefined; traveledYd: number };

export type TravelGoalView =
  | { kind: "unit"; ref: string; name: string }
  | { kind: "point"; x: number; y: number; z: number | undefined }
  | { kind: "corpse" }
  | { kind: "explore"; direction: Compass | undefined }
  | { kind: "unstick"; refusedGoal: string | undefined };

export type TravelAfter = {
  goal: TravelGoalView;
  pose: PoseView | undefined;
  traveledYd: number;
  totalYd: number | undefined;
  remainingYd: number | undefined;
  elapsedMs: number;
  legs: LegView[];
  floors: number[] | undefined;
  floorRetried: boolean;
  newInView: UnitView[];
};

export type LootLine = { itemId: number; name: string; count: number; quality: number | null };

export type EngageTarget = {
  ref: string;
  name: string;
  outcome: "fighting" | "killed" | "lost" | "skipped";
  reason: string | undefined;
  durationMs: number | undefined;
  xp: number | undefined;
};

export type JevDecisionView = {
  at: number;
  kind: "wait" | "move" | "spell" | "face" | "attack" | "item";
  label: string;
  disposition: "applied" | "discarded";
};

export type CodeWord = { code: number; word: string; count: number };

export type EngageAfter = {
  mode: "single" | "cycle" | "quest";
  how: string;
  questId: number | undefined;
  wanted: number;
  kills: number;
  targets: EngageTarget[];
  current: UnitView | undefined;
  xp: number;
  loot: LootLine[];
  copper: number;
  self: VitalsView;
  cast: CastView | undefined;
  decisions: JevDecisionView[];
  timeouts: number;
  castErrors: CodeWord[];
  swingErrors: CodeWord[];
};

export type LootAfter = {
  corpse: UnitView | undefined;
  items: LootLine[];
  copper: number;
  windowClosed: boolean;
  freeSlots: number | undefined;
};

export type InteractAction = "talk" | "accept" | "turn_in" | "gossip" | "buy" | "sell_junk" | "train" | "repair";

export type QuestOffer = {
  line: number;
  id: number;
  title: string;
  level: number | undefined;
  state: "available" | "ready" | "incomplete";
};

export type GossipLine = { line: number; text: string; icon: number };

export type StockLine = {
  line: number;
  itemId: number;
  name: string;
  price: number;
  stack: number;
  available: number | undefined;
};

export type TrainerLine = {
  spellId: number;
  name: string;
  rank: string | undefined;
  cost: number;
  level: number;
  state: "available" | "unavailable" | "known";
};

export type RewardChoice = { index: number; name: string; count: number };

export type MoneyChange = { before: number; after: number };

export type InteractAfter = {
  npc: UnitView;
  action: InteractAction;
  roles: NpcRole[];
  dialogOpened: boolean;
  offers: QuestOffer[];
  gossip: GossipLine[];
  stock: StockLine[];
  spells: TrainerLine[];
  rewardChoices: RewardChoice[];
  bought: LootLine | undefined;
  sold: LootLine[];
  learned: string[];
  repairCost: number | undefined;
  money: MoneyChange | undefined;
  freeSlots: number | undefined;
};

export type RestAfter = {
  used: LootLine[];
  durationMs: number;
  hpPct: number;
  manaPct: number | undefined;
  idle: boolean;
  itemsLeft: number;
  auraConfirmed: boolean;
};

export type RecoverAfter = {
  via: "corpse" | "spirit_healer" | "accept";
  alive: boolean;
  durationMs: number;
  corpseYd: number | undefined;
  legs: number;
  pose: PoseView | undefined;
  hp: number | undefined;
  maxHp: number | undefined;
  alternatives: string[];
};

export type SocialAction = "say" | "whisper" | "party" | "guild" | "invite" | "accept_invite" | "decline_invite" | "leave_group";

export type SocialAfter = {
  action: SocialAction;
  to: string | undefined;
  text: string | undefined;
  confirmed: boolean;
  systemLine: string | undefined;
};

export type EquipSlotName =
  | "head"
  | "neck"
  | "shoulders"
  | "shirt"
  | "chest"
  | "waist"
  | "legs"
  | "feet"
  | "wrists"
  | "hands"
  | "finger1"
  | "finger2"
  | "trinket1"
  | "trinket2"
  | "back"
  | "main_hand"
  | "off_hand"
  | "ranged"
  | "tabard";

export type QuestLine = {
  id: number;
  title: string;
  level: number | undefined;
  status: "incomplete" | "complete" | "failed";
  objectives: { text: string; count: number; required: number }[];
  turnIn: string | undefined;
};

export type BagsView = {
  copper: number | undefined;
  freeSlots: number | undefined;
  equipped: { slot: EquipSlotName; name: string; quality: number | null }[];
  items: { name: string; count: number; quality: number | null; bag: number; slot: number; kind: ItemKind }[];
};

export type SpellLine = {
  id: number;
  name: string;
  rank: string | undefined;
  cost: number | undefined;
  cooldownMs: number | undefined;
};

export type JournalAfter =
  | { about: "quests"; quests: QuestLine[] }
  | { about: "bags"; bags: BagsView }
  | { about: "spells"; spells: SpellLine[] }
  | { about: "log"; rows: GameLogEntry[]; more: number; label: string };

export type StopAfter = {
  stopped: RunRecord[];
  self: VitalsView;
  attackers: AttackerView[];
};

export type AfterMap = {
  look: LookAfter;
  travel: TravelAfter;
  engage: EngageAfter;
  loot: LootAfter;
  interact: InteractAfter;
  rest: RestAfter;
  recover: RecoverAfter;
  social: SocialAfter;
  journal: JournalAfter;
  stop: StopAfter;
};

export type ToolDetailsFor<K extends ToolName> = { tool: K; result: ToolResult<AfterMap[K]> };

export type ToolDetails = { [K in ToolName]: ToolDetailsFor<K> }[ToolName];
```

- Every tool result's `details` is `ToolDetailsFor<name>`. Renderers narrow
  on `details.tool`.
- A run tool's `onUpdate` partials carry `details.result.status ===
  "RUNNING"` and the same `After` type with the partial values. Renderers
  see `isPartial: true` for them.
- `EngageAfter.decisions` keeps the last 200 (design B.4).
- `JournalAfter` with `about: "log"` carries typed rows; `more` is the count
  left out; `label` is the range text (`since r4 started (1m 12s ago)`).

#### `contract/log.ts`

```ts
export type LogClass = "wake" | "passive" | "log";

export type Domain =
  | "session"
  | "control"
  | "nav"
  | "chat"
  | "combat"
  | "xp"
  | "quest"
  | "loot"
  | "money"
  | "vendor"
  | "trainer"
  | "fight"
  | "life"
  | "group"
  | "social"
  | "aura"
  | "run"
  | "tool"
  | "human"
  | "agent"
  | "packet"
  | "notice"
  | "snapshot"
  | "entity";

export type LogEvent =
  | "session/in_world"
  | "session/connected"
  | "session/lost"
  | "session/wake_throttled"
  | "control/server_correction"
  | "control/move_start"
  | "control/move_stop"
  | "control/teleport"
  | "control/place_changed"
  | "nav/route_start"
  | "nav/route_replaced"
  | "nav/route_end"
  | "nav/refused"
  | "chat/in"
  | "chat/out"
  | "combat/kill_credit"
  | "combat/cast"
  | "combat/attack_start"
  | "combat/attacked"
  | "xp/gain"
  | "xp/level_up"
  | "quest/accepted"
  | "quest/progress"
  | "quest/completed"
  | "quest/rewarded"
  | "loot/item"
  | "loot/open"
  | "loot/release"
  | "money/change"
  | "vendor/list"
  | "vendor/buy"
  | "vendor/sell"
  | "vendor/repair"
  | "trainer/list"
  | "trainer/learn"
  | "fight/start"
  | "fight/end"
  | "life/dead"
  | "life/released"
  | "life/alive"
  | "life/low_health"
  | "life/resurrect_offer"
  | "group/invite"
  | "group/kicked"
  | "group/disbanded"
  | "group/roster"
  | "social/duel_request"
  | "aura/gain"
  | "aura/fade"
  | "run/started"
  | "run/progress"
  | "run/ended"
  | "run/cancelled"
  | "tool/call"
  | "tool/result"
  | "tool/validation_error"
  | "human/input"
  | "agent/message"
  | "agent/now"
  | "agent/stuck"
  | "packet/error"
  | "notice/not_implemented"
  | "snapshot/world"
  | "entity/appear"
  | "entity/disappear";

export type GameLogEntry = {
  v: 1;
  seq: number;
  ts: number;
  char: string;
  domain: Domain;
  event: LogEvent;
  class: LogClass;
  delivered?: boolean;
  consumedBy?: string;
  runId?: string;
  tool?: string;
  ref?: string;
  guid?: string;
  text: string;
  data: Record<string, unknown>;
};

export type LogDraft = Omit<GameLogEntry, "v" | "seq" | "ts" | "char"> & { ts?: number };

export type WowEventDetails = { kind: "wake" | "passive"; entries: GameLogEntry[] };

export type HumanLineDetails = { entry: GameLogEntry };
```

- `event` holds the full `domain/event` string, so graders match one field.
  `domain` repeats the prefix for filtering.
- `data` shapes per event are design D.2 (the table is the builder's
  checklist). `data` never holds a core state snapshot; only changed
  fields. Jev `request/result/applied` records go to `jev.jsonl`, never to
  the game log.
- `text` is one line written by the harness from typed data (R15); it never
  holds a password or the account name.

#### `contract/runs.ts`

```ts
export type RunKind = "travel" | "engage" | "rest" | "recover";

export type RunStatus = "running" | "succeeded" | "partly" | "failed" | "cancelled" | "interrupted";

export type StopCause = "human" | "esc" | "quit" | "lost" | "tool";

export type RunRecord = {
  id: string;
  kind: RunKind;
  args: Record<string, unknown>;
  toolCallId: string | undefined;
  startedAt: number;
  endedAt: number | undefined;
  status: RunStatus;
  reason: string | undefined;
  summary: string | undefined;
  progress: string | undefined;
  awaited: boolean;
};

export type RunEnd<R> = {
  status: Exclude<RunStatus, "running">;
  reason?: string;
  summary: string;
  value: R;
};

export type RunControl = { signal: AbortSignal; progress: (text: string) => void };

export type RunLaunch<R> = (run: RunControl) => Promise<RunEnd<R>>;

export type RunStart<R> = {
  kind: RunKind;
  args: Record<string, unknown>;
  toolCallId: string | undefined;
  launch: RunLaunch<R>;
};

export type RunHandle<R> = { id: string; signal: AbortSignal; done: Promise<RunEnd<R>> };

export type RunEvent = { type: "started" | "progress" | "ended"; record: RunRecord };

export type RunWait<R> = { kind: "ended"; end: RunEnd<R> } | { kind: "yielded"; why: "human" | "timeout" };

export type RunRegistry = {
  start: <R>(init: RunStart<R>) => RunHandle<R>;
  active: () => RunRecord | undefined;
  get: (id: string) => RunRecord | undefined;
  list: () => RunRecord[];
  cancel: (id: string, cause: StopCause) => RunRecord | undefined;
  cancelAll: (cause: StopCause) => RunRecord[];
  release: (id: string) => void;
  subscribe: (cb: (event: RunEvent) => void) => () => void;
};
```

- Ids are `r1`, `r2`, … per process, never reused.
- `start` throws `Refusal` (`ops/refusal.ts`) with reason `busy`, detail
  `r3 (engage) is still running.`, next `stop(run: "r3")` when a run is
  active (design A.3, K3).
- `cancel` aborts the run's signal with an `Error` whose message is the
  cancel code: `human_stop`, `esc`, `quit`, `connection_lost`,
  `stopped_by_tool` for the five causes in order. `lost` gives status
  `interrupted`; the others `cancelled`.
- A launch never rejects on abort: it returns `status: "cancelled"` (or
  `"interrupted"`) with the cancel code as `reason`. If it rejects for
  another reason, the registry records `failed` with the error message and
  `done` rejects with the same error.
- `awaited` is true from `start` until `release(id)`; a tool calls
  `release` when it yields. A run that ends with `awaited: false` becomes a
  `run/ended` wake (design A.3 "dedupe").

#### `contract/config.ts`

```ts
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Capabilities, ClientConfig } from "@tuicraft/core";
import type { ToolStatus } from "#harness/contract/result";
import type { LogEvent } from "#harness/contract/log";
import type { RunView } from "#harness/contract/views";

export type HarnessFlags = {
  profile: string;
  runDir: string | undefined;
  model: string;
  thinking: ThinkingLevel;
  connect: boolean;
  wake: boolean;
  glyphs: string | undefined;
  stopReflex: boolean;
  nowPerCall: boolean;
  logEntities: boolean;
  check: boolean;
};

export type ProfileSource = "soap_session" | "soap_ledger" | "config_toml";

export type Profile = {
  source: ProfileSource;
  path: string;
  account: string;
  character: string;
  client: ClientConfig;
};

export type RunPaths = {
  dir: string;
  meta: string;
  gamelog: string;
  jev: string;
  session: string;
  piSessions: string;
  tools: string;
  runs: string;
  status: string;
  snapshots: string;
  workspace: string;
};

export type ConnectionState = "offline" | "connecting" | "online" | "closing" | "backoff";

export type RunMeta = {
  v: 1;
  gitSha: string | undefined;
  account: string;
  character: string;
  characterGuid: string | undefined;
  model: string;
  thinking: ThinkingLevel;
  glyphs: "nerd" | "unicode" | "ascii";
  flags: HarnessFlags;
  startedAt: number;
  endedAt: number | undefined;
  exitReason: string | undefined;
  capabilities: Capabilities | undefined;
  files: { gamelog: string; session: string; tools: string; runs: string; jev: string; status: string };
};

export type ToolStatsRow = {
  calls: number;
  statuses: Partial<Record<ToolStatus, number>>;
  validationErrors: number;
  repeatHits: number;
  p50Ms: number | undefined;
  p95Ms: number | undefined;
  lastError: string | undefined;
};

export type ToolsJson = { v: 1; updatedAt: number; tools: Record<string, ToolStatsRow> };

export type AgentState = "idle" | "streaming" | "tool";

export type StatusJson = {
  v: 1;
  at: number;
  agent: AgentState;
  tool: string | undefined;
  run: RunView | undefined;
  lastToolCallAt: number | undefined;
  lastProgress: { at: number; event: LogEvent } | undefined;
  connection: ConnectionState;
  ready: boolean;
};
```

- `HarnessFlags` defaults (design H.8): `model`
  `"openai-codex/gpt-6-luna"`, `thinking` `"high"`, `connect` `true`,
  `wake` `true`, `glyphs` `undefined` (resolved later by
  `resolveGlyphSet(flag, env, warn)` in `ui/glyphs.ts`), `stopReflex`
  `true`, `nowPerCall` `false`, `logEntities` `false`, `check` `false`.
  `--profile` is required.
- `Profile.client` holds the password. No log row, meta, status, frame or
  tool result ever contains `client.password`. The account name may appear
  in `meta.json` and in `session/in_world` data (design I.1, D.2), but
  `social` refuses chat text that contains the account name or the
  password (design A.4 "Secrets").
- `RunMeta.files` values are the file names `gamelog.jsonl`,
  `session.jsonl`, `tools.json`, `runs.jsonl`, `jev.jsonl`, `status.json`.

#### `contract/services.ts`

```ts
import type {
  ClientConfig,
  FactionRelation,
  NearbyRow,
  NpcRole,
  Unsubscribe,
  WorldHandle,
} from "@tuicraft/core";
import type { AgentState, ConnectionState, HarnessFlags, Profile, RunPaths, ToolsJson } from "#harness/contract/config";
import type { GameLogEntry, LogDraft, LogEvent } from "#harness/contract/log";
import type { ToolName, ToolResult, ToolStatus } from "#harness/contract/result";
import type { RunRecord, RunRegistry, StopCause } from "#harness/contract/runs";
import type { InWorld, NoProgress, PoseView } from "#harness/contract/views";

export type Clock = { now: () => number };

export type HandleObserver = { attach: (handle: WorldHandle) => Unsubscribe };

export type JsonlSink = {
  write: (row: unknown) => void;
  flush: () => Promise<void>;
  close: () => Promise<void>;
};

export type GameLog = {
  append: (draft: LogDraft) => GameLogEntry;
  mark: (seq: number, patch: { consumedBy?: string; delivered?: boolean }) => void;
  get: (seq: number) => GameLogEntry | undefined;
  since: (seq: number) => GameLogEntry[];
  recent: (n: number) => GameLogEntry[];
  count: () => number;
  lastSeq: () => number;
  subscribe: (cb: (entry: GameLogEntry) => void) => Unsubscribe;
  flush: () => Promise<void>;
  close: () => Promise<void>;
};

export type RefTable = {
  refOf: (guid: bigint) => string;
  guidOf: (ref: string) => bigint | undefined;
  size: () => number;
};

export type Sighting = {
  guid: bigint;
  entry: number;
  name: string;
  kind: "creature" | "player";
  level: number;
  relation: FactionRelation;
  roles: NpcRole[];
  alive: boolean;
  lootable: boolean;
  mapId: number;
  x: number;
  y: number;
  z: number;
  seenAt: number;
};

export type Sightings = HandleObserver & {
  note: (row: NearbyRow) => void;
  get: (guid: bigint) => Sighting | undefined;
  all: () => Sighting[];
  prune: (now: number) => void;
};

export type ProgressTracker = HandleObserver & {
  digest: (handle: WorldHandle) => string;
  afterAction: (init: { tool: ToolName; status: ToolStatus; reason: string | undefined; digest: string; untried: string[] }) => void;
  noProgress: () => NoProgress | undefined;
  lastProgress: () => { at: number; event: LogEvent } | undefined;
  count: () => number;
};

export type RepeatCall = { tool: ToolName; args: unknown; pose: PoseView | undefined; digest: string };

export type RepeatHit = { reason: string; times: number; untried: string[] };

export type RepeatGuard = {
  check: (call: RepeatCall) => RepeatHit | undefined;
  record: (call: RepeatCall & { result: ToolResult<unknown> }) => void;
  hits: () => number;
};

export type AttackLedger = HandleObserver & {
  lastHitAt: (guid: bigint) => number | undefined;
  lastAttacker: () => bigint | undefined;
};

export type WorldSnapshots = HandleObserver & {
  capture: (cause: "look" | "tick") => void;
  write: (label: string) => Promise<string>;
};

export type ReadyGate = HandleObserver & {
  isReady: () => boolean;
  whenReady: (timeoutMs: number) => Promise<boolean>;
  inWorld: () => InWorld | undefined;
  onReady: (cb: (world: InWorld) => void) => Unsubscribe;
};

export type DeliverySink = {
  wake: (entries: GameLogEntry[]) => void;
  passive: (entry: GameLogEntry) => void;
  human: (entry: GameLogEntry) => void;
};

export type EventRouter = HandleObserver & {
  setSink: (sink: DeliverySink | undefined) => void;
};

export type YieldGate = {
  wait: () => Promise<"human">;
  trigger: () => void;
};

export type WorldMutex = { run: <T>(send: () => T) => Promise<T> };

export type ToolStats = {
  call: (tool: string) => void;
  result: (init: { tool: string; status: ToolStatus; reason: string | undefined; ms: number }) => void;
  validationError: (tool: string) => void;
  repeatHit: (tool: string) => void;
  error: (init: { tool: string; message: string }) => void;
  snapshot: () => ToolsJson;
  start: (init: { path: string; everyMs: number }) => void;
  stop: () => Promise<void>;
};

export type SessionFlags = {
  humanWaiting: boolean;
  turnToolCalls: number;
  agent: AgentState;
  tool: string | undefined;
  lastToolCallAt: number | undefined;
  turnStartSeq: number;
  lastNow: string | undefined;
  wake: boolean;
  unreadWhispers: number;
};

export type TravelMemory = {
  lastGoodPose: PoseView | undefined;
  lastRefusedGoal: string | undefined;
  visitedCells: Set<string>;
};

export type Login = (config: ClientConfig) => Promise<WorldHandle>;

export type ViewCtx = { rt: HarnessRuntime; handle: WorldHandle };

export type OpsCtx = ViewCtx & {
  signal: AbortSignal;
  toolCallId: string;
  progress: (text: string) => void;
};

export type ToolCtx<A> = OpsCtx & { update: (partial: ToolResult<A>) => void };

export type HarnessRuntime = {
  flags: HarnessFlags;
  profile: Profile;
  paths: RunPaths;
  clock: Clock;
  log: GameLog;
  jevLog: JsonlSink;
  runs: RunRegistry;
  refs: RefTable;
  sightings: Sightings;
  progress: ProgressTracker;
  repeats: RepeatGuard;
  attacks: AttackLedger;
  snapshots: WorldSnapshots;
  ready: ReadyGate;
  router: EventRouter;
  stats: ToolStats;
  mutex: WorldMutex;
  yields: YieldGate;
  travel: TravelMemory;
  session: SessionFlags;
  handle: () => WorldHandle | undefined;
  requireHandle: () => WorldHandle;
  connection: () => ConnectionState;
  onConnection: (cb: (state: ConnectionState) => void) => Unsubscribe;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  stopAll: (cause: StopCause) => RunRecord[];
  shutdown: () => Promise<void>;
};

export type RuntimeParts = Omit<
  HarnessRuntime,
  | "session"
  | "handle"
  | "requireHandle"
  | "connection"
  | "onConnection"
  | "connect"
  | "disconnect"
  | "stopAll"
  | "shutdown"
> & { login: Login };
```

Behaviour that every consumer relies on:

- `requireHandle` throws `Refusal` `{ reason: "offline", detail: "the game
  connection is down.", next: "ask the human to run /connect." }`.
- `connect` attaches every observer to the new handle, in this order:
  `ready`, `router`, `sightings`, `attacks`, `progress`, `snapshots`, and
  keeps the unsubscribe functions; the handle's `closed` promise detaches
  them. Reconnect policy is design H.3 (5 s, 15 s, 45 s, then one
  `session/lost` wake).
- `stopAll(cause)` is synchronous: `runs.cancelAll(cause)`, then
  `handle.halt()`, `handle.stopCycle()`, `handle.stopAttack()` when a handle
  exists, and returns the cancelled records. The caller writes the log row.
- `shutdown` (quit only): `stopAll("quit")`, `logout()`, await `closed` for
  5 s then `close()`, `log.flush()`, `jevLog.close()`, `stats.stop()`,
  release the lock. The lock is not in the runtime; `main.ts` releases it
  after `shutdown` resolves.
- The brief's "runtime `onReady`" is `rt.ready.onReady`; there is no second
  member on `HarnessRuntime`.
- `session` is created by `createHarnessRuntime` with `humanWaiting:
  false`, `turnToolCalls: 0`, `agent: "idle"`, `turnStartSeq: 0`, `wake:
  flags.wake`, `unreadWhispers: 0`, the rest `undefined`.
- `yields.trigger()` resolves every pending `wait()` after
  `setTimeout(…, YIELD_DELAY_MS)` (the next macrotask plus 50 ms, design
  C.4 step 2). `wait()` called after a trigger waits for the next one.

- `travel` (`TravelMemory`) is process state for `travel(to: "unstick")`
  and `explore`: the last pose from which a plan succeeded, the last goal
  that a leg refused (as the model's `to` text), and the visited 20 yd
  cells (`"<mapId>:<floor(x/20)>:<floor(y/20)>"`).

#### `ops/refusal.ts` (F2; the one runtime file in the contract task)

```ts
import type { ToolStatus } from "#harness/contract/result";

export type RefusalInit = {
  reason: string;
  detail: string;
  next?: string;
  body?: string[];
  options?: unknown;
  status?: Extract<ToolStatus, "REFUSED" | "FAILED" | "UNCONFIRMED">;
};

export class Refusal extends Error {
  readonly reason: string;
  readonly detail: string;
  readonly next: string | undefined;
  readonly body: string[];
  readonly options: unknown;
  readonly status: Extract<ToolStatus, "REFUSED" | "FAILED" | "UNCONFIRMED">;
  constructor(init: RefusalInit);
}
```

`message` is `${reason}: ${detail}`; `status` defaults to `"REFUSED"`,
`body` to `[]`. Any harness code may throw it; `tools/define.ts` turns it
into a `ToolResult` with the current `after` value.

### 2.1 `config/` (F3)

```ts
// config/flags.ts
export class UsageError extends Error {}
export const USAGE: string;
export const DEFAULT_MODEL = "openai-codex/gpt-6-luna";
export function parseFlags(argv: readonly string[]): HarnessFlags;
export function harnessStateDir(home: string): string;

// config/profile.ts
export type ProfileErrorCode = "unreadable" | "unknown_format" | "missing_field" | "protected_account" | "protected_character";
export class ProfileError extends Error {
  readonly code: ProfileErrorCode;
  constructor(code: ProfileErrorCode, message: string);
}
export const PROTECTED_ACCOUNTS: readonly string[];
export const PROTECTED_ACCOUNT_PREFIXES: readonly string[];
export const PROTECTED_CHARACTERS: readonly string[];
export function isProtected(account: string, character: string): boolean;
export function loadProfile(path: string, home?: string): Promise<Profile>;

// config/lock.ts
export type LockInit = { profile: Profile; stateDir: string; runDir: string; pid?: number; host?: string; procDir?: string };
export type Lock = { path: string; release: () => Promise<void>; releaseSync: () => void };
export class LockError extends Error {
  readonly code: "held_by_harness" | "held_by_daemon";
  readonly holder: string;
  constructor(code: "held_by_harness" | "held_by_daemon", holder: string);
}
export function acquireLock(init: LockInit): Promise<Lock>;
```

- `parseFlags` reads only `argv` (no `WOW_*` env, design H.4). Flag
  spellings are design H.8: `--profile <path>`, `--run-dir <path>`,
  `--model <provider/id>`, `--thinking <level>`, `--no-connect`,
  `--wake on|off`, `--glyphs <name>`, `--stop-reflex on|off`,
  `--now-per-call`, `--log-entities`, `--check`. A missing `--profile`
  throws `UsageError`.
- `harnessStateDir(home)` is `${home}/.local/state/tuicraft-harness` (a fixed
  home path, not XDG, so every worktree sees one lock dir; HA §4.2).
- `PROTECTED_ACCOUNTS` = `ADMIN, DEITY, X, Y, AUCTIONHOUSE, TCFACTORY,
  TCPRESETS`; `PROTECTED_ACCOUNT_PREFIXES` = `RNDBOT`;
  `PROTECTED_CHARACTERS` = `Xiara` (K6, R38: no override flag).
- `loadProfile` accepts a soap session JSON (`account, character, password,
  preset, dir, wrapper`; host, port, language, spell and navigation paths
  from `<dir>/config/config.toml`), a soap ledger JSON (`account,
  character, password, preset, createdAt, owner`; paths from
  `${home}/.config/tuicraft/config.toml`), or a tuicraft `config.toml`
  (`parseConfig` from `@tuicraft/core/lib/config`). It builds `client` with
  `clientConfig` (which reads `TYPESAFE_API_KEY`). It refuses a protected
  account or character before any network call.
- Lock path: `${stateDir}/locks/<ACCOUNT>-<character>.lock`, created with
  `open(path, "wx", 0o600)`, content `{pid, startedAt, runDir, host}`. A dead
  pid is replaced. A daemon holds the character when a `/proc/*/cmdline`
  has `--daemon` and its `XDG_CONFIG_HOME/tuicraft/config.toml` names the
  same account and character (design H.4).

### 2.2 `credentials/` (F4)

```ts
// credentials/omp-store.ts
import type { AuthOperationOptions, Credential, CredentialInfo, CredentialStore } from "@earendil-works/pi-ai";

export type OmpRow = { access: string; expires: number; accountId: string | undefined };
export type OmpStoreInit = { dbPath: string; now: () => number };

export function ompDbPath(home: string): string;
export function readOmpRow(dbPath: string): OmpRow | undefined;

export class CredentialExpiredError extends Error {
  readonly provider: string;
  readonly expires: number;
  constructor(provider: string, expires: number);
}

export class OmpCredentialStore implements CredentialStore {
  constructor(init: OmpStoreInit);
  read(providerId: string, options?: AuthOperationOptions): Promise<Credential | undefined>;
  list(options?: AuthOperationOptions): Promise<readonly CredentialInfo[]>;
  modify(providerId: string, fn: (current: Credential | undefined) => Promise<Credential | undefined>, options?: AuthOperationOptions): Promise<Credential | undefined>;
  delete(providerId: string, options?: AuthOperationOptions): Promise<void>;
  reads(): number;
}

// credentials/status.ts
export type CredentialStatus = { present: boolean; expiresAt: number | undefined; validForMs: number | undefined };
export type StartupCheck = { ok: true; warn: boolean; line: string } | { ok: false; exitCode: 3; line: string };
export const MIN_VALID_MS = 600_000;
export const WARN_VALID_MS = 1_800_000;
export function credentialStatus(store: CredentialStore, now: number): Promise<CredentialStatus>;
export function startupCheck(status: CredentialStatus): StartupCheck;
```

- Signatures of the four store methods are Pi's (`pi-ai/dist/auth/types.d.ts:57-79`, read).
- `ompDbPath(home)` = `${home}/.omp/agent/agent.db`. `readOmpRow` opens it
  with `new Database(path, { readonly: true })` from `bun:sqlite`, runs
  `select data from auth_credentials where provider = 'openai-codex' and
  credential_type = 'oauth' and disabled_cause is null order by updated_at
  desc limit 1` (LR, measured), parses `data` JSON, keeps `access`,
  `expires`, `accountId`, closes. On `SQLITE_BUSY` it retries 3 times at
  50 ms, then throws.
- `read("openai-codex")` returns `{ type: "oauth", access, refresh: "",
  expires, accountId }`; other providers `undefined`. The store caches the
  row keyed on the mtimes of the db file and its `-wal` file.
- `modify` never calls `fn`. It re-reads the row; with more than 5 min left
  it returns the row; else it throws `CredentialExpiredError`, whose message
  is `The Codex login expired at <ISO>. Run omp once so that it refreshes
  the login. Then send your message again.` `delete` throws `Error("The
  harness does not own this login.")`. `list` returns
  `[{ providerId: "openai-codex", type: "oauth" }]` when a row exists.
- `startupCheck` lines (strict STE, never a token): valid →
  `Codex login: valid until <YYYY-MM-DD HH:MM> UTC (omp).`; under 30 min →
  same line, `warn: true`; missing → `No Codex login found in omp. Run omp
  and log in to openai-codex. Then start the harness again.`; under 10 min
  → `The Codex login expires in <n> min. Run omp once so that it refreshes
  the login. Then start the harness again.` Both failures give exit code 3.

### 2.3 `runtime/` (F5)

```ts
// runtime/harness-runtime.ts
export function createHarnessRuntime(parts: RuntimeParts): HarnessRuntime;

// runtime/connection.ts
export type ConnectionInit = {
  profile: Profile;
  login: Login;
  observers: HandleObserver[];
  log: GameLog;
  runs: RunRegistry;
  clock: Clock;
  backoffMs?: readonly number[];
};
export type Connection = Pick<HarnessRuntime, "handle" | "requireHandle" | "connection" | "onConnection" | "connect" | "disconnect">;
export const BACKOFF_MS: readonly number[];
export function createConnection(init: ConnectionInit): Connection;
export function defaultLogin(config: ClientConfig): Promise<WorldHandle>;

// runtime/ready.ts
export type ReadyInit = { clock: Clock; log: GameLog; profile: Profile; stableMs?: number };
export const READY_STABLE_MS = 1000;
export function createReadyGate(init: ReadyInit): ReadyGate;

// runtime/mutex.ts
export function createWorldMutex(): WorldMutex;

// runtime/yield.ts
export const YIELD_DELAY_MS = 50;
export function createYieldGate(): YieldGate;

// runtime/pi-runtime.ts
import type { CredentialStore } from "@earendil-works/pi-ai";
import type { AgentSessionRuntime, ExtensionFactory } from "@earendil-works/pi-coding-agent";
export type PiRuntimeInit = { runtime: HarnessRuntime; credentials: CredentialStore; agentDir: string; extension: ExtensionFactory };
export function createPiRuntime(init: PiRuntimeInit): Promise<AgentSessionRuntime>;
```

- `BACKOFF_MS` = `[5000, 15000, 45000]`. `defaultLogin` =
  `authWithRetry(config, { maxAttempts: 2 })` then `worldSession(config,
  auth)` from `@tuicraft/core/session`.
- `createReadyGate`: ready when the self pose is known and the entity count
  has not changed for `stableMs`; on ready it builds `InWorld` (`guid` with
  `guidHex` from A2; class name from `CLASS_NAMES` in the barrel; race name
  from a `RACE_NAMES` table local to `ready.ts`, ids 1–11 of 3.3.5, because
  the barrel has none (measured: `protocol/world.ts` keeps only the id);
  an unknown id gives `"unknown"`; place from
  `getPlaceState`, capabilities from `capabilities()`; a
  `not_implemented` throw gives `undefined` fields and all-false
  capabilities), appends `session/in_world` (class `log`), and calls the
  `onReady` callbacks. A new handle resets it.
- `createPiRuntime` wraps `createAgentSessionRuntime` with a factory that
  calls `createAgentSessionFromServices` with: `ModelRuntime.create({
  credentials, modelsPath: null, refreshOnCreate: false })`; the model from
  `flags.model`; `thinkingLevel: flags.thinking`; `noTools: "builtin"`;
  resource loader options `noExtensions, noSkills, noPromptTemplates,
  noContextFiles` all `true`; settings `SettingsManager.inMemory({
  quietStartup: true, compaction: { enabled: false } })`; the `wow`
  extension factory as the only inline extension;
  `SessionManager.create(paths.workspace, paths.piSessions)`; cwd
  `paths.workspace`. The factory closes over `HarnessRuntime`, so `/new`,
  `/reload`, `/resume` and `/fork` keep the handle (design H.3).

Test support (F5): `packages/harness/test-support/runtime-fixture.ts`

```ts
import type { createMockHandle } from "@tuicraft/core/test-support/mock-handle";
export type MockHandle = ReturnType<typeof createMockHandle>;
export type TestClock = Clock & { set: (ms: number) => void; advance: (ms: number) => void };
export type TestRuntimeInit = { parts?: Partial<RuntimeParts>; ready?: boolean; flags?: Partial<HarnessFlags>; connect?: boolean };
export type TestRuntime = { rt: HarnessRuntime; handle: MockHandle; clock: TestClock };
export function createTestRuntime(init?: TestRuntimeInit): Promise<TestRuntime>;
export function testProfile(): Profile;
export function testPaths(dir: string): RunPaths;
```

It builds in-memory parts that satisfy every contract type, connects the
mock handle (unless `connect: false`) and forces the ready gate (unless
`ready: false`). These parts are test doubles, not reference
implementations: each keeps only the behaviour the contract states. A later
task tests its own part directly and passes it through `parts` when it
tests a consumer; the fixture's doubles stay as the defaults.

### 2.4 `entry.ts` and `main.ts` (F6)

```ts
// entry.ts: no exports. Order: parseFlags(Bun.argv.slice(2)); set
// PI_CODING_AGENT_DIR=`${harnessStateDir(home)}/agent`, PI_OFFLINE=1,
// PI_SKIP_VERSION_CHECK=1, PI_TELEMETRY=0 when each is unset; then
// const { main } = await import("#harness/main"); process.exit(await main(flags)).

// main.ts
export const EXIT = { ok: 0, usage: 2, refused: 2, credential: 3 } as const;
export function main(flags: HarnessFlags): Promise<number>;
```

- Order (design H.2): profile → lock → run dir (`createRunDir`) →
  credential status (`--check` stops here: print the line, exit 0) →
  parts (`createGameLog`, `createJsonlSink`, `createRunRegistry`,
  `createRefTable`, `createSightings`, `createProgressTracker`,
  `createRepeatGuard`, `createAttackLedger`, `createWorldSnapshots`,
  `createReadyGate`, `createEventRouter`, `createToolStats`,
  `createWorldMutex`, `createYieldGate`) → `createHarnessRuntime` →
  `writeMeta` → `resolveGlyphSet` + `setGlyphs` → status writer →
  `createPiRuntime` → `rt.connect()` unless `--no-connect` →
  `new InteractiveMode(piRuntime).run()` → `rt.shutdown()` → lock release
  → `writeMeta` with `endedAt` and `exitReason`.
- `process.on("exit")` calls `lock.releaseSync()`.
- Launch command for graders and docs: `bun packages/harness/src/entry.ts
  --profile <path> --run-dir <dir>` (`HARNESS_LAUNCH`, section 2.13).

### 2.5 `extension/` (F7)

```ts
// extension/extension.ts
export function wowExtension(rt: HarnessRuntime): ExtensionFactory;

// extension/input.ts
export const STOP_WORDS: readonly string[];
export const STOP_MAX_WORDS = 5;
export function isStopReflex(text: string): boolean;
export function humanStop(init: { rt: HarnessRuntime; via: "reflex" | "command" | "key"; text: string }): RunRecord[];
export function installInput(pi: ExtensionAPI, rt: HarnessRuntime): void;

// extension/guards.ts
export function installGuards(pi: ExtensionAPI, rt: HarnessRuntime): void;
```

`wowExtension` body, fixed order. Each line after `installInput` is an
insertion point added by the named task (one import and one call line,
nothing else):

```ts
return (pi) => {
  installInput(pi, rt);
  installGuards(pi, rt);
  installTools(pi, rt);
  installEvents(pi, rt);
  installPrompt(pi, rt);
  installUi(pi, rt);
  installCommands(pi, rt);
  installShutdown(pi, rt);
};
```

| Line | Added by | Defined in |
|---|---|---|
| `installInput`, `installGuards`, `installShutdown` | F7a (creates `input.ts` and `guards.ts` with empty installers; F7b and F7c fill the bodies) | `extension/input.ts`, `extension/guards.ts`, `extension/extension.ts` |
| `installTools` | A1 | `tools/install.ts` |
| `installEvents` | L10 | `events/install.ts` |
| `installPrompt` | P3 | `prompt/install.ts` |
| `installUi` | U11 | `ui/install.ts` |
| `installCommands` | U10 | `extension/commands.ts` |

- `isStopReflex`: at most 5 words, and the first word with punctuation
  stripped, lower-cased, is one of `stop`, `halt`, `freeze`, `hold`
  (`Stop!`, `Stop,` match; `wait` does not; design C.4).
- `installInput` subscribes:
  - `input`: when `flags.stopReflex` and `isStopReflex(text)`:
    `humanStop({ rt, via: "reflex", text })`, which calls
    `rt.stopAll("human")` and returns the stopped runs (`/stop` and F9 call
    `humanStop` with `via: "command"` and `"key"`). For every human text while `session.agent` is not
    `"idle"`: `session.humanWaiting = true` and `rt.yields.trigger()`.
    Always append `human/input {text, stopReflex, stoppedRuns}` (class
    `log`) and return `{ action: "continue" }`.
  - `agent_start`: `turnToolCalls = 0`, `agent = "streaming"`,
    `turnStartSeq = rt.log.lastSeq()`.
  - `turn_start`: `humanWaiting = false`.
  - `tool_execution_start` / `tool_execution_end`: `agent` `"tool"` /
    `"streaming"`, `tool`, `lastToolCallAt`.
  - `agent_end`: `agent = "idle"`, `tool = undefined`.
  - `message_end` of an assistant message with text: append `agent/message
    {text}`.
  - `registerShortcut("f9", …)`: `humanStop({ rt, via: "key", text: "F9" })`.
- `installGuards`: `user_bash` refused; a `ctx.ui.onTerminalInput`
  listener swallows Enter when the editor text starts with `/login` or
  `/logout` and appends a human-only line (smoke test V7; if V7 fails,
  F7 removes the listener and main prints the startup banner line
  `/login and /logout do nothing useful here.`).
- `installShutdown`: `session_shutdown` detaches this session's sinks
  (`rt.router.setSink(undefined)`); on reason `quit` only it awaits
  `rt.shutdown()`.
- Esc: Pi aborts the tool's `signal`; `tools/define.ts` then calls
  `rt.stopAll("esc")` (2.6). No extension hook is needed.

### 2.6 `tools/define.ts` and the result contract (A1)

```ts
import type { Static, TSchema } from "@earendil-works/pi-ai";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

export type ToolKind = "read" | "action" | "run" | "control";

export type GameToolSpec<P extends TSchema, K extends ToolName> = {
  name: K;
  kind: ToolKind;
  parameters: P;
  run: (args: Static<P>, ctx: ToolCtx<AfterMap[K]>) => Promise<ToolResult<AfterMap[K]>>;
  fallback: () => AfterMap[K];
  maxLines?: number;
};

export type GameTool = ToolDefinition<TSchema, ToolDetails>;

export const TURN_BUDGET = 40;
export const READY_WAIT_MS = 10_000;
export const UPDATE_EVERY_MS = 500;
export const MAX_CONTENT_LINES = 12;
export const MAX_CONTENT_BYTES = 700;

export function defineGameTool<P extends TSchema, K extends ToolName>(spec: GameToolSpec<P, K>): (rt: HarnessRuntime) => GameTool;
export function result<A>(status: ToolStatus, init: ResultInit<A>): ToolResult<A>;
export function formatContent(result: ToolResult<unknown>, init: { danger: string | undefined; maxLines: number }): string;
export function nextCall(tool: ToolName, args?: Record<string, string | number | boolean>): string;
export function askHuman(question: string): string;
export function coreErrorResult<A>(error: unknown, after: A): ToolResult<A>;
```

- `label`, `description` and `promptGuidelines` come from `TOOL_TEXT[name]`
  (`prompt/guidelines.ts`, P2). `executionMode` is `"parallel"` for
  `kind: "read"` (`look`, `journal`) and `"sequential"` for the rest (design
  A.3). `fallback()` builds an empty `After` for refusals that happen before
  `run` (budget, offline, not ready, repeat).
- `execute` order, fixed:
  1. `session.turnToolCalls += 1`; append `tool/call {toolCallId, name, args}`;
     `stats.call(name)`.
  2. `turnToolCalls > TURN_BUDGET` → `REFUSED turn_budget: report to the
     human now.`
  3. no handle → `REFUSED offline` (the `requireHandle` text in the
     `contract/services.ts` notes).
  4. `kind` is `action` or `run` and `session.humanWaiting` → `REFUSED
     human_waiting: the human wrote a message. Read it before you act.`
  5. `ready.whenReady(READY_WAIT_MS)` is false → `REFUSED not_ready: the
     world is still loading.` with next `call look again in a few seconds.`
  6. `name !== "look"`: `repeats.check(...)` hit → `REFUSED repeat:` with
     the untried options; `stats.repeatHit(name)`.
  7. The Pi `signal` gets a listener that calls `rt.stopAll("esc")`; it is
     removed when `execute` ends.
  8. `spec.run(args, ctx)`; a thrown `Refusal` becomes its result; any other
     throw becomes `coreErrorResult`.
  9. `repeats.record`, `progress.afterAction`, `stats.result`, append
     `tool/result {toolCallId, status, reason, ms}`, `log.mark(seq, {
     consumedBy: toolCallId })` for each `evidence` row.
  10. `danger = dangerLine(dangerView(ctx))` when a handle exists.
  11. Return `{ content: [{ type: "text", text: formatContent(result, {
      danger, maxLines: spec.maxLines ?? MAX_CONTENT_LINES }) }], details: {
      tool: name, result } }`.
- Time-based reason codes exempt from the repeat guard: `not_ready`,
  `offline`, `turn_budget`, `busy`, `human_waiting` (design A.4).
- `ctx.update(partial)` calls Pi's `onUpdate` with the same `details`
  shape, at most once per `UPDATE_EVERY_MS`, and sets
  `partial.status = "RUNNING"`.
- `formatContent` layout, one item per line:
  - line 1: `<STATUS>` then ` <runId>:` when `status` is `RUNNING`, else
    ` <reason>:` when `reason` is set, then ` <detail>`;
  - the `body` lines;
  - the danger line, when given;
  - `Next: <next>` when `next` is set.
  When the text has more than `maxLines` lines, `formatContent` keeps line
  1, the danger line and the `Next:` line, cuts `body` to fit, and makes
  the last body line `+<n> more; narrow the call.` It never throws. `look`
  and `journal` set `maxLines: 24` (`LOOK_MAX_ROWS` 20 rows, 15 log rows plus
  header); every other tool uses `MAX_CONTENT_LINES`. The limits are test
  assertions: each tool's tests check its design examples against its
  `maxLines` and `MAX_CONTENT_BYTES` (a byte overrun is a test failure, not a
  runtime cut). The text never holds a glyph, JSON or a stack.
- `nextCall("engage", { target: "u9" })` → `engage(target: "u9")`; strings
  are double-quoted, numbers and booleans are bare, keys in the given order;
  `nextCall("recover")` → `recover()`. `askHuman(q)` → `ask the human:
  "<q>"`.
- `coreErrorResult` mapping (design A.2): message `World socket is not
  connected` → `REFUSED offline`; `self_not_alive` → `REFUSED dead`, next
  `recover()`; `missing_jev_key` or `JevUnavailableError` with detail `missing_jev_key` →
  `REFUSED no_combat_helper: TYPESAFE_API_KEY is not set.`, next `ask the
  human to set it.`; any other `JevUnavailableError` → `FAILED
  jev_unavailable: the fight helper is not answering (<detail>).`, next
  `ask the human: "The fight helper is not answering. What should I do?"`; `not_implemented` → `FAILED not_implemented: this part of the
  harness is not built yet.`, next `ask the human: "This action is not
  built yet. What should I do instead?"`; a message of the
  form `<code>: <raw>` → `FAILED <code>` with `nextStepFor(<code>)` from the
  barrel as the body line when it has text; anything else → `FAILED error:
  <message first line>`. No stack reaches the model.
- Human stop: a run that ends with reason `human_stop` gives `FAILED
  cancelled: the human stopped you. Start nothing new.` and next `end your
  turn and wait for the human.` (design A.2). The danger line is still shown.

### 2.7 `tools/params.ts`, `tools/registry.ts`, `tools/install.ts` (A1)

`tools/params.ts` holds the ten TypeBox schemas, exactly design B.2–B.11
(`Type` and `StringEnum` from `@earendil-works/pi-ai`, every enum a
`StringEnum`, every parameter a one-line `description`):

```ts
export const lookParams = Type.Object({
  find: Type.Optional(StringEnum(["any", "hostile", "attackable", "questgiver", "vendor", "trainer", "repair", "lootable", "player", "corpse", "spirit_healer"], { description: "What kind of unit to list. Default: any." })),
  name: Type.Optional(Type.String({ description: 'Part of a unit name, for example "Stalker".' })),
  within: Type.Optional(Type.Integer({ minimum: 5, maximum: 100, description: "List every unit within this many yards (up to 20 rows). Default: the 6 nearest within 60 yd." })),
});
export const travelParams = Type.Object({
  to: Type.String({ description: 'A unit id (u4), a unit name, "corpse", "explore" or "explore north" (any of north, south, east, west, northeast, northwest, southeast, southwest), "unstick", or coordinates "8764, -6683" or "8764, -6683, 72.7".' }),
  within: Type.Optional(Type.Number({ minimum: 1, maximum: 40, description: "Stop this many yards from the goal. Default 3 for a unit, 1 for coordinates." })),
});
export const engageParams = Type.Object({
  target: Type.Optional(Type.String({ description: 'Unit id (u9) or name ("Springpaw Stalker"). Default: the nearest hostile you can attack.' })),
  count: Type.Optional(Type.Integer({ minimum: 1, maximum: 10, description: "How many kills of this kind of creature. Default 1; with quest, the kills the quest still needs." })),
  quest: Type.Optional(Type.String({ description: 'Quest id like "8325" or the quest title from journal: fight the creatures its objectives need.' })),
  how: Type.Optional(Type.String({ maxLength: 120, description: 'Short instruction for the fight helper, for example "only Smite".' })),
  loot: Type.Optional(Type.Boolean({ description: "Loot each kill. Default true." })),
});
export const lootParams = Type.Object({
  target: Type.Optional(Type.String({ description: "Corpse unit id or name. Default: the nearest lootable corpse within 30 yd." })),
});
export const interactParams = Type.Object({
  npc: Type.String({ description: "NPC unit id (u3) or the NPC's name." }),
  do: Type.Optional(StringEnum(["talk", "accept", "turn_in", "gossip", "buy", "sell_junk", "train", "repair"], { description: "Default talk: list what this NPC offers." })),
  what: Type.Optional(Type.String({ description: 'Line number or title from the talk list, gossip option number, or part of an item name to buy ("water").' })),
  count: Type.Optional(Type.Integer({ minimum: 1, maximum: 20, description: "How many times to buy. One buy gives the vendor's stack (water: 5). Default 1." })),
  reward: Type.Optional(Type.Integer({ minimum: 1, maximum: 6, description: "Reward choice number for turn_in." })),
});
export const restParams = Type.Object({
  until: Type.Optional(Type.Integer({ minimum: 50, maximum: 100, description: "Stop at this percent of health and mana. Default 90." })),
});
export const recoverParams = Type.Object({
  how: Type.Optional(StringEnum(["corpse", "spirit_healer", "accept"], { description: "Default corpse: walk back to your body. accept: take a resurrection offer." })),
});
export const socialParams = Type.Object({
  do: Type.Optional(StringEnum(["say", "whisper", "party", "guild", "invite", "accept_invite", "decline_invite", "leave_group"], { description: "Default: whisper when to is set, else say." })),
  to: Type.Optional(Type.String({ description: "Exact player name for whisper or invite, as the [game] line shows it." })),
  text: Type.Optional(Type.String({ maxLength: 255, description: "What to say." })),
});
export const journalParams = Type.Object({
  about: StringEnum(["quests", "bags", "spells", "log"], { description: "quests: your own quest log. bags: money, free bag slots, equipped gear (main hand and others) and items. spells: spells you know. log: what happened earlier." }),
  find: Type.Optional(Type.String({ description: 'For log: words to search, "from:Name" or "domain:quest".' })),
  since: Type.Optional(Type.String({ description: 'For log: "5m", a run id like "r4", or "last_turn". Default last_turn.' })),
});
export const stopParams = Type.Object({
  run: Type.Optional(Type.String({ description: "Run id like r3. Default: stop everything." })),
});

export type LookArgs = Static<typeof lookParams>;
export type TravelArgs = Static<typeof travelParams>;
export type EngageArgs = Static<typeof engageParams>;
export type LootArgs = Static<typeof lootParams>;
export type InteractArgs = Static<typeof interactParams>;
export type RestArgs = Static<typeof restParams>;
export type RecoverArgs = Static<typeof recoverParams>;
export type SocialArgs = Static<typeof socialParams>;
export type JournalArgs = Static<typeof journalParams>;
export type StopArgs = Static<typeof stopParams>;
```

(`social.text` gets a `description` here; design B.9 had none and B.1 asks
for one on every parameter; decided.)

```ts
// tools/registry.ts
export function gameTools(rt: HarnessRuntime): GameTool[];

// tools/install.ts
export function installTools(pi: ExtensionAPI, rt: HarnessRuntime): void;
```

- A1 creates all ten tool files with the final schema and a `run` that
  returns `REFUSED not_implemented`. Each later tool task edits only its own
  file(s). `gameTools` returns them in design B.1 order: `look, travel,
  engage, loot, interact, rest, recover, social, journal, stop`.
- Tool files and their exported factories:
  `tools/look.ts` `lookTool`, `tools/travel.ts` `travelTool`,
  `tools/engage.ts` `engageTool` (plus `tools/engage-choose.ts`,
  `tools/engage-fight.ts`), `tools/loot.ts` `lootTool`,
  `tools/interact.ts` `interactTool` (plus `tools/interact-quest.ts`,
  `tools/interact-vendor.ts`, `tools/interact-trainer.ts`),
  `tools/rest.ts` `restTool`, `tools/recover.ts` `recoverTool`,
  `tools/social.ts` `socialTool`, `tools/journal.ts` `journalTool`,
  `tools/stop.ts` `stopTool`. Each is `(rt: HarnessRuntime) => GameTool`
  from `defineGameTool`.
- `installTools` registers `{ ...tool, ...rendererFor(tool.name) }` for each
  tool (`ui/renderers/registry.ts`, U5), and adds a `tool_result` hook that
  counts validation failures (`stats.validationError`, log
  `tool/validation_error`) and, after 2 in a row on one tool, appends that
  tool's minimal valid call to the error text (design A.4; depends on smoke
  test V4).

### 2.8 `ops/` (A2–A9 part A, B1–B4 part B)

```ts
// ops/refs.ts (A2)
export function guidHex(guid: bigint): string;
export function parseRef(text: string): number | undefined;
export function createRefTable(): RefTable;

// ops/sightings.ts (A8)
export const SIGHTING_TTL_MS = 1_800_000;
export function createSightings(clock: Clock): Sightings;

// ops/views.ts (A3)
export function compassOf(radians: number): Compass;
export function poseView(ctx: ViewCtx): PoseView | undefined;
export function vitalsView(ctx: ViewCtx): VitalsView;
export function selfView(ctx: ViewCtx): SelfView;
export function placeView(ctx: ViewCtx): PlaceView;
export function unitView(ctx: ViewCtx, row: NearbyRow): UnitView;
export function sightingView(ctx: ViewCtx, sighting: Sighting): UnitView;
export function unitViews(ctx: ViewCtx): UnitView[];
export function nearestByKind(ctx: ViewCtx): Partial<Record<NearestKind, UnitView>>;
export function nowSnapshot(rt: HarnessRuntime): NowSnapshot | undefined;
export function snapshotWorld(rt: HarnessRuntime): SnapshotWorld | undefined;

// ops/resolve.ts (A3)
export type UnitQuery = { text: string; alive?: boolean; lootable?: boolean; relation?: readonly FactionRelation[] };
export type Resolved =
  | { kind: "unit"; unit: UnitView; guid: bigint }
  | { kind: "ambiguous"; candidates: UnitView[] }
  | { kind: "not_seen"; text: string };
export function resolveUnit(ctx: ViewCtx, query: UnitQuery): Resolved;
export function unitRefusal(init: { resolved: Exclude<Resolved, { kind: "unit" }>; tool: ToolName; param: string }): Refusal;

// ops/settle.ts (A4)
export type SettleInit<E> = {
  subscribe: (cb: (event: E) => void) => Unsubscribe;
  match: (event: E) => boolean;
  timeoutMs: number;
  signal?: AbortSignal;
  send?: () => void | Promise<void>;
};
export function settle<E>(init: SettleInit<E>): Promise<E | undefined>;

// ops/range.ts (A5)
export const TALK_RANGE_YD = 5;
export const INTERACT_APPROACH_YD = 4;
export const LOOT_APPROACH_YD = 3;
export const LOOT_WALK_MAX_YD = 30;
export const ENGAGE_APPROACH_YD = 30;
export const LOOK_DEFAULT_YD = 60;
export const LOOK_DEFAULT_ROWS = 6;
export const LOOK_MAX_ROWS = 20;
export function distanceTo(ctx: ViewCtx, guid: bigint): number | undefined;
export function compassTo(from: { x: number; y: number }, to: { x: number; y: number }): Compass;

// ops/repeat-guard.ts (A6)
export const TIME_CODES: readonly string[];
export const REPEAT_MOVE_YD = 2;
export function createRepeatGuard(clock: Clock): RepeatGuard;
export function repeatRefusal(init: { hit: RepeatHit; tool: ToolName }): Refusal;

// ops/danger.ts (A7)
export type InterruptRules = { newAttacker: boolean; rooted: boolean; death: boolean };
export type InterruptCause = { code: "attacked" | "rooted" | "died"; detail: string; attacker: bigint | undefined };
export type InterruptWatch = { signal: AbortSignal; cause: () => InterruptCause | undefined; dispose: () => void };
export function createAttackLedger(clock: Clock): AttackLedger;
export function dangerView(ctx: ViewCtx): DangerView;
export function dangerLine(view: DangerView): string | undefined;
export function watchInterrupts(ctx: OpsCtx, rules: InterruptRules): InterruptWatch;

// ops/progress.ts (A9)
export const NO_PROGRESS_AT = 3;
export const STUCK_LOG_AT = 6;
export function createProgressTracker(init: { clock: Clock; log: GameLog }): ProgressTracker;
```

- `guidHex(0x1fn)` → `"1f"`. `parseRef("u12")` → `12`; anything else →
  `undefined`. `refOf` gives `u1`, `u2`, … in first-seen order and never
  reuses one in a process.
- `unitViews` returns creatures and players only (never game objects,
  design B.2), nearest first, calls `sightings.note(row)` for each, and
  gives each unit its ref. `nearestByKind` covers units in view and
  sightings out of view.
- `nowSnapshot` returns `undefined` when there is no handle or the ready
  gate is not ready. `hpDelta5s` is the self HP change over the last 5 s.
- `resolveUnit` (design A.2 unit refs): `u<n>` → that guid; else an exact
  name (nearest living match); else a case-insensitive part of a name
  (nearest living match when all matches share one name). Different names
  → `ambiguous` (candidates nearest first). No match in view or in
  sightings → `not_seen`. `unitRefusal` texts: ambiguous → `REFUSED
  ambiguous_unit: "<text>" matches <n> units.` with one body line per
  candidate as a ready call (`engage(target: "u14")`) and next the nearest
  candidate's call; not seen → `REFUSED not_seen: no unit named "<text>"
  was seen.` with next `travel(to: "explore")`.
- `settle` subscribes before it calls `send`, resolves with the first
  matching event or `undefined` at `timeoutMs`, and always unsubscribes.
  An abort rejects with the signal's reason.
- `dangerLine`: one attacker → `Danger: <Name> <ref> is attacking you (hit
  you <n> s ago). You are at <p>% HP.`; no hit seen yet → drop the brackets;
  two or more → `Danger: <Name> <ref> and <k> more are attacking you. You
  are at <p>% HP.`; no attacker → `undefined`.
- `watchInterrupts` aborts its `signal` on the first rule that fires:
  a unit attacks that was not an attacker when the watch started, the
  control state's `blockedReason` becomes `"rooted"` (`control-core.ts:182`,
  read), or life
  becomes `dead` (design principle 9).
- `createRepeatGuard`: an exact repeat is the same tool, the same args
  (stable JSON), the same refusal reason, the pose moved less than
  `REPEAT_MOVE_YD` and the same progress digest. A `DONE` of any other tool
  clears the entries. `TIME_CODES` = `not_ready, offline, turn_budget,
  busy, human_waiting`. `repeatRefusal` → `REFUSED repeat: you already
  tried this from here and it failed (<reason>).` with one body line
  `Untried: <list>` when there is one.
- Progress digest (design C.6): life, 2 yd pose bucket, target guid and
  10 % HP bucket, 5 yd corpse distance bucket, active run status, last
  refusal code. `noProgress()` is defined when the count is at least
  `NO_PROGRESS_AT`; at `STUCK_LOG_AT` the tracker appends `agent/stuck`
  once. Progress events (reset the stuck clock): pose change over 5 yd,
  kill credit, item push, quest counter change, life change, chat out.

```ts
// ops/travel-leg.ts (B1)
export type LegGoal = { kind: "unit"; guid: bigint; name: string } | { kind: "point"; x: number; y: number; z?: number };
export type LegResult = {
  status: LegStatus;
  reason: string | undefined;
  detail: string;
  floors: number[] | undefined;
  nextStep: string | undefined;
  traveledYd: number;
  floorRetried: boolean;
  pose: PoseView | undefined;
};
export const FLOOR_MATCH_YD = 0.25;
export function refusalCode(refusal: string): string;
export function travelLeg(ctx: OpsCtx, init: { goal: LegGoal; within: number }): Promise<LegResult>;

// ops/explore.ts (B2)
export type UnstickResult = { movedYd: number; toward: "last_good_pose" | "away_from_object"; refusedGoal: string | undefined };
export type ExploreStop = "new_unit" | "danger" | "obstructed" | "distance";
export type ExploreResult = { direction: Compass; walkedYd: number; legs: LegView[]; obstructed: number; newInView: UnitView[]; stoppedBy: ExploreStop };
export const UNSTICK_MAX_YD = 5;
export const EXPLORE_MAX_YD = 40;
export const EXPLORE_MAX_OBSTRUCTED = 3;
export function parseDirection(text: string): Compass | undefined;
export function unstick(ctx: OpsCtx): Promise<UnstickResult>;
export function explore(ctx: OpsCtx, init: { direction: Compass | undefined; wanted?: (unit: UnitView) => boolean }): Promise<ExploreResult>;

// ops/loot.ts (B3)
export type LootOpResult = { outcome: LootOutcome; items: LootLine[]; copper: number; freeSlots: number | undefined };
export function lootCorpseOp(ctx: OpsCtx, guid: bigint): Promise<LootOpResult>;

// ops/recover.ts (B4)
export type RecoverHow = "corpse" | "spirit_healer" | "accept";
export type RecoverOpResult = {
  outcome: RecoveryOutcome;
  via: RecoverHow;
  legs: number;
  corpseYd: number | undefined;
  alternatives: string[];
};
export function recoverOp(ctx: OpsCtx, how: RecoverHow): Promise<RecoverOpResult>;
```

- `travelLeg` calls `awaitGoto` (`runs/adapters.ts`) and maps the refusal
  text with `refusalCode`: `pathfind_find_height failed (UNKNOWN_HEIGHT)` →
  `no_ground`; `ambiguous ground column at destination` and `not on a
  ground floor` → `ambiguous_floor`; `start snapped off the requested
  ground position` → `start_off_mesh`; `ground corridor changes surface` →
  `surface_change`; anything else → the snake_case of its first words.
  Floor retry (ND F5): a unit goal refused with `ambiguous_floor` and exactly
  one listed floor within `FLOOR_MATCH_YD` of the unit's observed z →
  one retry with that floor as a point goal; `floorRetried: true`. On
  `arrived` it sets `rt.travel.lastGoodPose`; on a refusal it sets
  `rt.travel.lastRefusedGoal` only through the travel tool (the tool knows
  the model's `to` text).
- `unstick` walks at most `UNSTICK_MAX_YD` with `handle.walkToward` toward
  `rt.travel.lastGoodPose`, or away from the nearest object when none is
  known (ND R3b). It is the only user of `walkToward`.
- `explore` legs are `goTo({ kind: "point", x, y })` with no z through
  `travelLeg`, never a straight walk (ND §3c). It marks visited cells in
  `rt.travel.visitedCells` and, without a direction, picks the nearest
  compass direction whose next cell is not visited.
- `lootCorpseOp` calls `handle.lootCorpse(guid, signal)`; it collects item
  names and counts from `onRewardsEvent` `item_push` and money from
  `money_notice` during the call. If `lootCorpse` throws `not_implemented`
  (C7 not landed), it runs the harness sequence of design B.5 (release a
  leftover window, open, take each slot after the previous push, take
  money, release, await the release) with `settle`.
- `recoverOp`: dead and not released → `releaseSpirit`; `corpse` →
  `handle.recoverCorpse(signal)` (C7; on `not_implemented` it returns
  `{ ok: false, cause: "not_implemented" }`); `spirit_healer` →
  `activateSpiritHealer` on the nearest spirit healer in view;
  `accept` → `respondResurrection(true)`, settled by a `life_observed`
  alive event. `alternatives` names the ways not used (design B.8).

### 2.9 `runs/` (L3, L4)

```ts
// runs/registry.ts (L3)
export function createRunRegistry(init: { clock: Clock; log: GameLog; sink: JsonlSink }): RunRegistry;

// runs/wait.ts (L3)
export const YIELD_AFTER_MS = 120_000;
export function awaitRun<R>(init: { rt: HarnessRuntime; run: RunHandle<R>; yieldAfterMs?: number }): Promise<RunWait<R>>;

// runs/adapters.ts (L4)
export type GotoEnd = {
  status: "arrived" | "refused" | "stopped";
  refusal: string | undefined;
  floors: number[] | undefined;
  nextStep: string | undefined;
  traveledYd: number;
  pose: ControlPose | undefined;
};
export type FightEnd = { outcome: TacticsOutcome | undefined; error: string | undefined };
export type CycleEnd = { state: CycleState; error: string | undefined };
export const GOTO_POLL_MS = 500;
export function awaitGoto(handle: WorldHandle, init: { target: GotoTarget; signal: AbortSignal; pollMs?: number }): Promise<GotoEnd>;
export function awaitTactics(handle: WorldHandle, init: { guid: bigint; instruction: string; signal: AbortSignal }): Promise<FightEnd>;
export function awaitCycle(handle: WorldHandle, init: { guids: bigint[]; instruction: string; maxStarts: number; signal: AbortSignal }): Promise<CycleEnd>;
export function awaitQuestCycle(handle: WorldHandle, init: { questId: number; sources: number[]; instruction: string; maxStarts: number | undefined; signal: AbortSignal }): Promise<CycleEnd>;
export function jevCode(end: FightEnd): string | undefined;
```

- The registry writes one `runs.jsonl` line per run at its end (`id, kind,
  args, startedAt, endedAt, status, reason, summary`) and appends
  `run/started`, `run/progress` (at most one per 5 s), `run/ended` or
  `run/cancelled` to the game log. Class: `log`, except `run/ended` with
  `awaited: false`, which is `wake` (the router's guard may still make it
  passive).
- `awaitRun` races `run.done`, `rt.yields.wait()` and a
  `yieldAfterMs` timer; on a yield it calls `rt.runs.release(run.id)`.
- `awaitGoto`: `goTo` throws a refusal at once (→ `refused`); otherwise the
  end is the first of an `onControlEvent` `movement_stopped` with
  `getNavigationState().active === false`, or the poll every `pollMs`
  seeing `active === false`. An abort calls `handle.halt()` and returns
  `stopped`. `refusal`, `floors` and `nextStep` come from
  `getNavigationState()` and `nextStepFor`.
- `awaitTactics` catches both failure shapes of `startTactics`: a
  synchronous throw (`self_not_alive`) and a rejected promise
  (`missing_jev_key`, `JevUnavailableError`) (design V.4 #2), and resolves
  on the `outcome` tactics event of its run id. An abort calls
  `handle.halt()`.
- `awaitCycle` and `awaitQuestCycle` resolve when `getCycleState().active`
  becomes false after a `stopped` cycle event (`CycleEvent` types, read:
  `started, resumed, target_done, loot_done, recovery, recovered,
  stopped`); an abort calls
  `handle.stopCycle()`. `maxStarts` counts fight starts, not kills
  (design B.4).
- `jevCode`: outcome reason `jev_timeout` or an error that is a
  `JevUnavailableError` → `"jev_unavailable"`; else `undefined`.

### 2.10 `log/` (L1, L2)

```ts
// log/store.ts (L1)
export const LOG_CAPACITY = 5000;
export const FLUSH_MS = 250;
export function createGameLog(init: { file: string | undefined; char: () => string; clock: Clock; capacity?: number; flushMs?: number }): GameLog;
export function createJsonlSink(init: { file: string | undefined; flushMs?: number }): JsonlSink;

// log/query.ts (L2)
export const JOURNAL_LOG_LIMIT = 15;
export type LogQuery = { find?: string; since?: string; limit?: number };
export type LogPage = { rows: GameLogEntry[]; more: number; label: string };
export function queryLog(init: { log: GameLog; runs: RunRegistry; turnStartSeq: number; now: number; query: LogQuery }): LogPage;
export function formatLogRows(rows: readonly GameLogEntry[], now: number): string[];
```

- `append` sets `v: 1`, the next `seq`, `ts` (from the draft or the clock)
  and `char`, keeps the entry in a ring of `capacity` rows, writes one JSON
  line to `file` (buffered, flushed every `flushMs` and on `flush`/`close`),
  and calls subscribers. `file: undefined` keeps memory only (tests).
  Reads never change the store; there is no shared cursor (design D.3; do
  not reuse the cli `ring-buffer`).
- `queryLog`: no `find` → tail; `find` supports plain words
  (case-insensitive on `text`), `from:Name` (chat sender) and
  `domain:<domain>`; `since` supports `5m`/`30s`, a run id (`r4`, rows from
  that run's start) and `last_turn` (the default, `seq > turnStartSeq`).
  At most `limit` (default `JOURNAL_LOG_LIMIT`) rows, oldest first; `more`
  counts the rest; `label` is `since r4 started (1m 12s ago)` style.
- `formatLogRows` → `-72s run started: engage Springpaw Stalker u9` style
  lines (relative seconds or minutes, then `text`).

### 2.11 `events/` (L5–L11)

```ts
// events/rules.ts (L5)
export type RuleContext = { selfName: string; selfGuid: bigint; runActive: boolean; wake: boolean; now: number; refOf: (guid: bigint) => string };
export type Drafts = LogDraft[];
export function runDrafts(event: RunEvent, rc: RuleContext): Drafts;

// events/rules-chat.ts (L6)
export function chatDrafts(msg: ChatMessage, rc: RuleContext): Drafts;
export function groupDrafts(event: GroupEvent, rc: RuleContext): Drafts;
export function duelDrafts(event: DuelEvent, rc: RuleContext): Drafts;

// events/rules-combat.ts (L7)
export function combatDrafts(event: CombatEvent, rc: RuleContext): Drafts;
export function tacticsDrafts(event: TacticsEvent, rc: RuleContext): Drafts;
export function cycleDrafts(event: CycleEvent, rc: RuleContext): Drafts;
export function recoveryDrafts(event: RecoveryEvent, rc: RuleContext): Drafts;
export function vitalsDrafts(event: EntityEvent, rc: RuleContext): Drafts;

// events/rules-world.ts (L8)
export function controlDrafts(event: ControlEvent, rc: RuleContext): Drafts;
export function questDrafts(event: QuestEvent, rc: RuleContext): Drafts;
export function rewardsDrafts(event: RewardsEvent, rc: RuleContext): Drafts;
export function vendorDrafts(event: VendorEvent, rc: RuleContext): Drafts;
export function trainerDrafts(event: TrainerEvent, rc: RuleContext): Drafts;
export function entityDrafts(event: EntityEvent, rc: RuleContext & { logEntities: boolean }): Drafts;
export function packetErrorDrafts(opcode: number, error: Error, rc: RuleContext): Drafts;
export function noticeDrafts(event: NoticeEvent, rc: RuleContext): Drafts;

// events/router.ts (L5)
export type RouterInit = {
  log: GameLog;
  jevLog: JsonlSink;
  runs: RunRegistry;
  attacks: AttackLedger;
  guard: WakeGuard;
  flags: HarnessFlags;
  context: () => RuleContext;
};
export function createEventRouter(init: RouterInit): EventRouter;

// events/guard.ts (L9)
export type WakeGuard = { admit: (entry: GameLogEntry) => LogClass };
export const WAKE_MIN_GAP_MS = 5000;
export const WAKE_PER_MINUTE = 6;
export const WAKE_BURST = 3;
export const SENDER_GAP_MS = 20_000;
export const STUCK_WAKE_MS = 300_000;
export function createWakeGuard(clock: Clock): WakeGuard;
export function createStuckWatch(init: { rt: HarnessRuntime; everyMs?: number }): { start: () => void; stop: () => void };

// events/delivery.ts (L9)
export const PASSIVE_FLUSH_CAP = 20;
export function formatWake(entries: readonly GameLogEntry[], now: number): string;
export function createDelivery(init: { pi: ExtensionAPI; rt: HarnessRuntime }): DeliverySink & { flush: () => void };

// events/now.ts (L10)
export const NOW_MAX_CHARS = 300;
export function formatNow(snapshot: NowSnapshot): string;

// events/install.ts (L10)
export function installEvents(pi: ExtensionAPI, rt: HarnessRuntime): void;

// events/snapshot.ts (L11)
export const SNAPSHOT_EVERY_MS = 5000;
export function createWorldSnapshots(init: { log: GameLog; clock: Clock; paths: RunPaths; world: () => SnapshotWorld | undefined; everyMs?: number }): WorldSnapshots;
```

- Every translator is pure, returns zero or more drafts with `class` set by
  design C.1, and never reads the handle. The router subscribes all 21
  `on*` hooks of a new handle (the 20 of design H.3 plus `onNotice`) and
  `runs.subscribe`, turns each event into drafts, passes each `wake` or
  `passive` draft's entry through `guard.admit`, appends every entry to
  `log`, and hands `wake`/`passive` entries to the sink. Jev `request`,
  `result` and `applied` tactics events go to `jevLog`, not the log.
- Self-authored chat and echoes of the character's own actions are never
  above `log` (design C.5). `life/dead.data.killer` comes from
  `attacks.lastAttacker()` (design V.4 #3). `fight/start` and `fight/end`
  are logged for every fight, also inside a cycle.
- Wake classes, passive classes and log-only events are design C.1;
  throttles are design C.5 (the constants above). A throttled wake becomes
  passive and appends `session/wake_throttled`.
- `formatWake` (closes design LU.3 #1): one line per entry,
  `[game <age>s] <text>`; a whisper reads `[game 0s] Whisper from Kaelyn:
  "hey, what level are you?" Next: social(to: "Kaelyn", text: "…")` (spec
  §6.C, settlement 2; party, guild and say wakes give `do: "party"`,
  `"guild"`, `"say"`). Passive lines flushed with a non-chat wake go after
  the wake lines; a wake message that holds a chat wake takes no passive
  lines, which stay queued for the next flush (spec §6.C, settlement 3;
  closes design LU.3 #11).
- `createDelivery`: `wake` → `pi.sendMessage({ customType: "wow-event",
  content: formatWake(entries, now), display: true, details: { kind:
  "wake", entries } }, { triggerTurn: true, deliverAs: "followUp" })` and
  marks each entry `delivered: true`; entries with `consumedBy` set are
  skipped. `passive` → buffer; `flush` (at `agent_end` and before a wake)
  sends one `wow-event` message with `triggerTurn: false`. `human` →
  `pi.appendEntry("wow-human", { entry })`.
- `formatNow` is design C.3: `[now HH:MM:SS] <name> L<lvl> <Class> HP
  <hp>/<max> (<delta> in 5s) <power> <life> <combat> · <zone>, <area>
  (<x>,<y>) server fix <n>s · target … · attackers … · running … · nearest
  …`; fields drop from the right to fit `NOW_MAX_CHARS`; self, place and
  `running` never drop. A second line `No progress: <n> actions in <t>
  (last refusal <tool> <code> x<k>). Change plan.` when
  `snapshot.noProgress` is set; `Wake is off.` when `wake` is false.
- `installEvents`: creates the delivery sink and calls
  `rt.router.setSink`; `before_agent_start` returns `{ message: {
  customType: "wow-now", content: <formatNow text>, display: false } }`,
  appends `agent/now {text}`, sets `session.lastNow`; on `session_start`
  with reason `resume` it injects the same message first; `agent_end`
  flushes passive lines; starts the stuck watch. A `context` hook (always
  on) appends a hidden `wow-now` custom message when the last message is a
  `wow-event` wake, because a wake run does not fire `before_agent_start`
  (main plan ruling R-L10). With `flags.nowPerCall` the same hook also
  appends the `[now]` text as a user message before every LLM call (off by
  default; smoke tests V1, V2).
- `createWorldSnapshots` appends `snapshot/world` (class `log`) on
  `capture("look")`, and every `everyMs` only when the unit set or self
  vitals changed by 5 % or more, else `{ unchanged: true }`; `write(label)`
  writes `<paths.snapshots>/<label>.json` and returns the path (`/snapshot`
  command). `main.ts` passes `world: () => snapshotWorld(rt)`.

### 2.12 `eval/` (L12–L14)

```ts
// eval/run-dir.ts (L12)
export class RunDirError extends Error {}
export const KEEP_RUNS = 50;
export function runsRoot(home: string): string;
export function createRunDir(init: { flag: string | undefined; home: string; character: string; now: Date }): Promise<RunPaths>;
export function writeMeta(paths: RunPaths, meta: RunMeta): Promise<void>;
export function linkSession(paths: RunPaths, sessionFile: string): Promise<void>;
export function finalizeSession(paths: RunPaths): Promise<void>;
export function pruneRuns(root: string, keep?: number): Promise<string[]>;

// eval/stats.ts (L13)
export const STATS_EVERY_MS = 10_000;
export function createToolStats(clock: Clock): ToolStats;

// eval/status.ts (L14)
export type StatusWriter = { start: (everyMs: number) => void; stop: () => Promise<void> };
export const STATUS_EVERY_MS = 1000;
export function statusSnapshot(rt: HarnessRuntime): StatusJson;
export function createStatusWriter(init: { path: string; snapshot: () => StatusJson }): StatusWriter;
```

- `runsRoot(home)` = `${harnessStateDir(home)}/runs`. Without `--run-dir`
  the dir is `<runsRoot>/<UTC yyyymmddThhmmssZ>-<character>/` and
  `pruneRuns` keeps the newest `KEEP_RUNS`; a `--run-dir` is never pruned.
  A dir that already has `gamelog.jsonl` → `RunDirError`. Layout is design
  I.1: `meta.json`, `gamelog.jsonl`, `jev.jsonl`, `session.jsonl` (a symlink
  to the Pi session file, re-pointed on `/new` and `/fork`, replaced by a
  copy at exit), `pi-sessions/`, `tools.json`, `runs.jsonl`, `status.json`,
  `snapshots/`, `workspace/` (empty Pi cwd). The harness never writes
  `frames/`, `grader/`, `triggers.jsonl`, `progress.json`, `steers.jsonl` or
  `result.json`.
- `statusSnapshot` fills `StatusJson` from `rt.session`, `rt.runs.active()`,
  `rt.progress.lastProgress()`, `rt.connection()` and `rt.ready.isReady()`.

### 2.13 `grader/` eval tooling (E1–E7), and why it lives in the harness package

Decided: the grader tooling goes in `packages/harness/src/grader/`, not in
`packages/devtools`. Reasons (measured in `biome.json` and the manifests):
the harness has `"exports": {}` and the shell override bans every
`@tuicraft/**` import except core, so devtools cannot import
`ui/glyphs.ts`; the glyph README requires graders to import the same
`glyphs.ts` the harness renders with (`tagNerdGlyphs`), and the watcher
reads `GameLogEntry` and `StatusJson`. The factory is reached only as a
subprocess. The watcher is tracked here, although design I.2 calls it a
grader-side script, because the coordinator's brief lists it as eval
infrastructure to build and review; it still writes only into the run dir.

```ts
// grader/exec.ts (E1)
export type ExecResult = { code: number; stdout: string; stderr: string };
export type Exec = (argv: readonly string[], opts?: { stdin?: string; timeoutMs?: number; cwd?: string }) => Promise<ExecResult>;
export const bunExec: Exec;

// grader/pane.ts (E1)
export const HARNESS_LAUNCH = "bun packages/harness/src/entry.ts";
export type Pane = {
  id: string;
  send: (text: string, opts?: { enter?: boolean }) => Promise<void>;
  screen: () => Promise<string>;
  escape: () => Promise<void>;
  quit: () => Promise<void>;
  waitExit: (timeoutMs: number) => Promise<boolean>;
  close: () => Promise<void>;
};
export function harnessCommand(init: { profile: string; runDir: string }): string;
export function openPane(init: { exec: Exec; worktree: string; title: string; command: string }): Promise<Pane>;
export function attachPane(init: { exec: Exec; id: string }): Pane;

// grader/frames.ts (E2)
export type Frame = { seq: number; at: number; file: string; text: string };
export function tagFrame(screen: string): string;
export function captureFrame(init: { pane: Pane; dir: string; seq: number; last: string | undefined; now: number }): Promise<Frame | undefined>;

// grader/truth.ts (E3)
export type TruthItem = { bag: number; slot: number; item: number; name: string; count: number };
export type TruthQuest = { quest: number; status: number; rewarded: boolean; mobCounts: number[]; itemCounts: number[] };
export type Truth = {
  ok: true;
  online: boolean;
  savedAt: string;
  guid: number;
  account: string;
  name: string;
  race: number;
  class: number;
  level: number;
  xp: number;
  money: number;
  position: { map: number; zone: number; x: number; y: number; z: number; o: number };
  alive: boolean;
  deathState: "alive" | "dead" | "ghost";
  health: number;
  inventory: TruthItem[];
  quests: TruthQuest[];
  rewardedQuests: number[];
  spells: number[];
};
export type FinalTruth = { ok: true; truth: Truth } | { ok: false; cause: "stale_truth" | "service_down"; detail: string };
export function parseTruth(json: unknown): Truth;
export function readTruth(exec: Exec, account: string): Promise<Truth>;
export function finalTruth(init: { exec: Exec; account: string; exitMs: number; retries?: number; waitMs?: number }): Promise<FinalTruth>;
export function leakCheck(init: { exec: Exec; runDir: string; secretFiles: readonly string[] }): Promise<string[]>;

// grader/result.ts (E4)
export type EvalVerdict = "pass" | "fail" | "blocked" | "aborted";
export type EvalResult = {
  scenario: string;
  round: number;
  replica: number;
  sha: string;
  tab?: string;
  accounts?: string[];
  verdict: EvalVerdict;
  verdictReason?: string;
  blockedBy?: string[];
  abort?: { cause: AbortCause; evidence: string };
  end?: "done" | "budget" | "stuck" | "abort";
  checks: EvalCheck[];
  efficiency: EvalEfficiency;
  attempts?: EvalAttempts;
  interventions: EvalIntervention[];
  friction: FrictionItem[];
  evidence: EvalEvidence;
  notes?: string;
};
export function validateResult(value: unknown): string[];

// grader/scenarios.ts (E5)
export type TriggerName = "fight_start" | "kill" | "death" | "movement_start" | "answer_text" | "steer_landed";
export type SteerAt = { kind: "trigger"; trigger: TriggerName } | { kind: "elapsed"; ms: number };
export type ScenarioCheck = { id: string; source: "truth" | "verifier" | "witness" | "game_log" | "session" | "frame"; expect: string };
export type Scenario = {
  id: string;
  tier: number;
  preset: string;
  partner: "partner" | "witness" | null;
  setup: { endpoint: string; body: Record<string, unknown> }[];
  budget: { minutes: number; turns: number; tools: number };
  paneMinutes: number;
  task: string;
  steers: { at: SteerAt; text: string }[];
  checks: ScenarioCheck[];
  needsWatcher: boolean;
  navBound: boolean;
};
export const ROUND_1: readonly string[];
export function loadScenario(id: string): Scenario;

// grader/watch.ts (E6)
export type TriggerRow = { ms: number; trigger: TriggerName; seq: number; text: string };
export type ProgressJson = {
  at: number;
  agent: AgentState;
  lastToolCallAt: number | undefined;
  lastProgress: { at: number; event: LogEvent } | undefined;
  idleSinceMs: number | undefined;
};
export const TRIGGER_EVENTS: Readonly<Record<TriggerName, readonly LogEvent[]>>;
export const FRAME_EVERY_MS = 5000;
export type Watcher = { stop: () => Promise<void> };
export function watchRun(init: { runDir: string; pane: Pane; exec: Exec; clock: Clock; witness?: string; frameEveryMs?: number }): Watcher;
```

- `AbortCause`, `EvalCheck`, `EvalEfficiency`, `EvalAttempts`,
  `EvalIntervention`, `FrictionItem` and `EvalEvidence` in `grader/result.ts`
  follow `design/eval-suite.md` §4 field by field (with the t1 revision:
  `abort.cause` adds `service_down`, `stale_truth`, `setup_failed`;
  `checks.source` is `truth | verifier | witness | game_log | session |
  frame`; `evidence.finalSavedAt`). The JSON Schema is copied verbatim to
  `grader/eval-result.schema.json`.
- Pane commands (LR, measured): `orca-ide terminal create --worktree
  path:<wt> --title <t> --command <cmd> --json`; `orca-ide terminal send
  --terminal <id> --text <t> [--enter] --json`; `orca-ide terminal read
  --terminal <id> --screen --json`; escape sends `$'\e'`; `quit` sends two
  `\x03` back to back (Pi exits on two within 500 ms); `orca-ide terminal
  wait --terminal <id> --for exit --timeout-ms <ms>`; `orca-ide terminal
  close --terminal <id> --tab --json`. Always `orca-ide`, never `orca`
  (global CLAUDE.md). Sends cannot be confirmed for a Pi pane, so callers
  confirm with `screen()`.
- `harnessCommand` → `bun packages/harness/src/entry.ts --profile <p>
  --run-dir <d> --glyphs nerd`.
- `readTruth` runs `bun packages/factory/src/main.ts soap truth <ACC>` and
  `parseTruth` validates the reply at the boundary (fields from
  `t1-service/README.md` `GET /truth`, read). `finalTruth` implements
  eval-suite step 12 (offline and `savedAt ≥ exitMs − 5 s`, up to 3 reads
  10 s apart, else `stale_truth`). `leakCheck` runs `rg -uu -l -F -f
  <secrets> <runDir>` excluding the secret files and returns file names
  only (step 13); it never prints a secret.
- Scenario data: one file per round-1 scenario,
  `grader/scenarios/<id>.json`, for the 13 ids of eval-suite §6 in its
  hand-schedule order: `t4-quest-first, t6-die-and-recover,
  t4-alliance-first, t7-question-while-acting, t7-halt-resume,
  t3-ghostlands-kill, t3-kill-one-hunter, t1-walk-to-npc,
  t5-vendor-buy-goldshire, t2-whisper-reply, t0-hostiles, t0-who-is-near,
  t0-self-state`. Task text, steers and checks are copied verbatim from
  eval-suite §2.3 (with the t1 revision). `ROUND_1` lists them in that order.
- `TRIGGER_EVENTS` (design I.2): `fight_start` → `fight/start`; `kill` →
  `combat/kill_credit`; `death` → `life/dead`; `movement_start` →
  `nav/route_start`, `control/move_start`; `answer_text` →
  `agent/message`; `steer_landed` → `human/input`.
- `watchRun` tails `gamelog.jsonl` and `status.json`, appends
  `triggers.jsonl` rows and rewrites `progress.json`, saves a frame every
  `frameEveryMs` when the screen changed, and with `witness` (a soap
  wrapper path) appends one `nearby --json` sample every 5 s to
  `witness.jsonl`.
- `grader/cli.ts` (E7): `bun packages/harness/src/grader/cli.ts
  <launch|send|frame|watch|truth|final-truth|leak-check|validate|scenario>
  …`; one subcommand per function above, JSON on stdout, never a password.

### 2.14 `ui/` and human commands (U1–U11)

```ts
// ui/glyphs.ts (U1): design/glyphs/glyphs.ts moved unchanged. Exports (read):
// nerdFontsVersion, nerdClasses, GlyphName, glyphSetNames, GlyphSetName, GlyphSet,
// nerd, unicode, ascii, glyphSets, isGlyphSetName, resolveGlyphSet, glyphNamesByChar,
// glyphName, tagNerdGlyphs.

// ui/context.ts (U1)
export function setGlyphs(name: GlyphSetName): void;
export function glyphs(): GlyphSet;
export function glyphSetName(): GlyphSetName;

// ui/renderers/registry.ts (U5)
export type ToolRenderers = Pick<GameTool, "renderCall" | "renderResult">;
export function rendererFor(tool: ToolName): ToolRenderers;

// ui/renderers/line.ts (U5)
export const socialRenderers: ToolRenderers;
export const stopRenderers: ToolRenderers;

// ui/renderers/picture.ts (U6)
export const lookRenderers: ToolRenderers;

// ui/renderers/live-run.ts (U7)
export const travelRenderers: ToolRenderers;
export const engageRenderers: ToolRenderers;
export const restRenderers: ToolRenderers;
export const recoverRenderers: ToolRenderers;

// ui/renderers/card.ts (U8)
export const interactRenderers: ToolRenderers;
export const lootRenderers: ToolRenderers;
export const journalRenderers: ToolRenderers;

// ui/footer.ts (U2)
export type FooterChrome = {
  model: string;
  thinking: string;
  contextPct: number | undefined;
  wake: boolean;
  glyphSet: GlyphSetName;
  logRows: number;
  unreadWhispers: number;
  missing: ("jev" | "nav" | "factions" | "spells")[];
  connection: ConnectionState;
};
export type FooterSource = { snapshot: () => NowSnapshot | undefined; chrome: () => FooterChrome };
export const FOOTER_ROWS = 4;
export function footerLines(init: { snapshot: NowSnapshot | undefined; chrome: FooterChrome; width: number; theme: Theme }): string[];
export function createFooter(source: FooterSource): Parameters<ExtensionUIContext["setFooter"]>[0];

// ui/ticker.ts (U3)
export type TickerSource = { recent: (n: number) => GameLogEntry[]; run: () => RunView | undefined; kills: () => number; xp: () => number };
export const TICKER_ROWS = 6;
export function tickerLines(init: { source: TickerSource; width: number; theme: Theme; now: number }): string[];
export function createTicker(source: TickerSource): (tui: TUI, theme: Theme) => Component;

// ui/cards.ts (U4)
export const renderEventCard: MessageRenderer<WowEventDetails>;
export const renderHumanLine: EntryRenderer<HumanLineDetails>;

// ui/status-line.ts (U9)
export function titleFor(snapshot: NowSnapshot | undefined): string;
export function workingMessage(run: RunView | undefined): string | undefined;

// ui/install.ts (U11)
export function installUi(pi: ExtensionAPI, rt: HarnessRuntime): void;

// extension/commands.ts (U10)
export function installCommands(pi: ExtensionAPI, rt: HarnessRuntime): void;
```

- `rendererFor` returns `{}` for a tool whose family is not built yet, so
  Pi draws the plain text (a throwing renderer also falls back to the text,
  LR §4). U6, U7 and U8 each add their entries to the map in
  `ui/renderers/registry.ts` (insertion points in that file, owned by U5).
- Every renderer draws only from `details` (`ToolDetails`), reads glyphs
  from `glyphs()`, pads with pi-tui `visibleWidth` (never `.length`), and
  uses theme colour tokens only: success for `DONE`, warning for
  `PARTLY`/`RUNNING`/`UNCONFIRMED`, error for `REFUSED`/`FAILED` (design
  E.1). Collapsed results are at most 5 rows; `ctrl+o` expands.
- `footerLines` always returns exactly `FOOTER_ROWS` lines at every width
  from 30 to 220 (UG §2); `tickerLines` exactly `TICKER_ROWS`. Layout and
  row content are design E.2 and E.3. Reuse the concept code in
  `~/.cache/pi-epic-scratch/ui-unit-frames/src/unit-frames.ts`,
  `ui-event-ticker/src/{ticker,card}.ts` and
  `ui-tool-renderers-nerd/src/{renderers,draw}.ts`, adapted to the contract
  types (the concept `details.ts` shapes are not the contract).
- `installUi`: on `session_start` `ctx.ui.setFooter(createFooter(…))`,
  `ctx.ui.setWidget("wow-ticker", createTicker(…), { placement:
  "aboveEditor" })`, `pi.registerMessageRenderer("wow-event",
  renderEventCard)`, `pi.registerEntryRenderer("wow-human",
  renderHumanLine)`; repaint at most 10 Hz on log appends and a 1 s tick;
  `ctx.ui.setTitle(titleFor(…))` and `ctx.ui.setWorkingMessage(…)`.
- `installCommands` registers `/now` (prints `session.lastNow` as a human
  line), `/log [filter]` (last 20 rows through `queryLog`), `/stop` (`humanStop`
  with `via: "command"`), `/connect`, `/disconnect`, `/say <text>`,
  `/w <name> <text>`, `/p <text>`, `/g <text>`, `/wake on|off` (sets
  `session.wake`), `/snapshot <label>` (`rt.snapshots.write`). Slash
  commands that send take `rt.mutex` (design H.9).

### 2.15 `prompt/` (P1–P3)

```ts
// prompt/system-prompt.ts (P1)
export type PromptInit = { character: string; level: number | undefined; race: string | undefined; className: string | undefined };
export function buildSystemPrompt(init: PromptInit): string;

// prompt/guidelines.ts (P2)
export type ToolText = { label: string; description: string; guidelines: string[] };
export const TOOL_TEXT: Readonly<Record<ToolName, ToolText>>;

// prompt/install.ts (P3)
export function installPrompt(pi: ExtensionAPI, rt: HarnessRuntime): void;
```

- `buildSystemPrompt` returns design F.1 verbatim with the first sentence
  filled: `You play World of Warcraft 3.3.5a as <character>, a level <level>
  <race> <className>.`; unknown parts drop (`… as <character>.`).
- `TOOL_TEXT[tool].description` is one short paragraph per tool in STE
  (what it does, what it returns, when not to use it), written from design
  B; `guidelines` are the per-tool lines of design F.2 ("Use find to
  filter. …"). Labels: `Look`, `Travel`, `Engage`, `Loot`, `Interact`,
  `Rest`, `Recover`, `Social`, `Journal`, `Stop`.
- `installPrompt`: `before_agent_start` returns `{ systemPrompt:
  buildSystemPrompt(<from rt.ready.inWorld(), else rt.profile.character>) }`
  (this also removes Pi's `<cwd>` block, design F.2). Two handlers are
  safe: Pi runs every `before_agent_start` handler, collects every
  `message`, and the last `systemPrompt` wins
  (`pi-coding-agent/dist/core/extensions/runner.js:1016-1057`, read), so
  L10's `[now]` message and P3's prompt combine. P3 also registers
  `context_with_system`, which replaces the system message on every LLM
  request, because a wake run does not fire `before_agent_start` (main plan
  ruling R-P3).

### 2.16 What each tool consumes (for the B-, A- and L-area edges)

| Tool | Task | Consumes |
|---|---|---|
| `look` | A10 | views, resolve (for `name`), range, sightings, danger, `snapshots.capture("look")` |
| `journal` | A11 | `queryLog`/`formatLogRows` (L2), `getQuestState`, `getInventoryState`, `getSpellbook`, `itemKind` (C11) |
| `social` | A12 | settle, `onMessage` echo, group events, fake SYSTEM lines, profile secrets |
| `stop` | A13 | `rt.runs.cancel`/`rt.stopAll("tool")`, danger, views |
| `travel` | B5 | `travelLeg`, `explore`, `unstick`, `recoverOp` (ghost `corpse`), resolve, registry, `awaitRun`, `watchInterrupts` |
| `loot` | B6 | resolve, range, `travelLeg`, `lootCorpseOp` |
| `interact` | B7–B9 | resolve, `travelLeg`, settle, quest/vendor/trainer handle members |
| `rest` | B10 | `itemKind`, `useSpellIds` (C11), registry, `awaitRun`, `watchInterrupts`, auras |
| `recover` | B11 | `recoverOp`, registry, `awaitRun` |
| `engage` | B12, B13 | resolve, views, `explore`, `travelLeg`, `awaitTactics`/`awaitCycle`/`awaitQuestCycle`, `jevCode`, `lootCorpseOp`, registry, `awaitRun`, `watchInterrupts`, danger |

Rule for design V.4 #6 (decided): inside an `engage` run a new attacker does
not stop the run; `engage` passes `newAttacker: false` to
`watchInterrupts` and takes the new attacker as the next target when
`count` allows, else it reports it in the result. `travel`, `rest` and
`recover` pass `newAttacker: true` (principle 9).

## 3. File ownership

Each source file's colocated `*.test.ts` has the same owner. "→" means the
file passes to the next task after the earlier one lands (same file, later
owner); only the named body or block changes. Paths are relative to the
worktree root.

### 3.1 Core (`packages/core/…`, `packages/cli/…`, `packages/devtools/…`)

| File | Owner | Later edits (only these) |
|---|---|---|
| `packages/core/src/wow/client.ts` | C0 | none |
| `packages/core/src/wow/index.ts` | C0 | C1 (its export lines) |
| `packages/core/test-support/mock-handle.ts` | C0 | C2 (the `queryNearby` block) |
| `packages/core/src/wow/world-events.ts` | C0 | none |
| `packages/core/src/wow/control.ts` | C0 | none |
| `packages/core/src/wow/experience.test.ts` | C0 | none (adds `attackers: []` to its `CombatState` literal) |
| `packages/core/src/wow/client-place.ts` | C0 → C6b | |
| `packages/core/src/wow/client-runs.ts` | C0 → C7a (`lootCorpse`) → C7b (`recoverCorpse`) | |
| `packages/core/src/wow/client-extras.ts` | C0 → C2 (`capabilities`) → C9 (`getCreatureInfo`) | C10 none (C0 wires `onNotice`) |
| `packages/core/src/wow/nearby.ts` | C0 → C4 → C3 → C2 | |
| `packages/core/src/wow/npc-roles.ts` | C0 → C3 | |
| `packages/core/src/wow/combat.ts` | C0 → C5 | |
| `packages/core/src/wow/item-labels.ts` | C0 → C11 (`itemKind` body) | |
| `packages/core/src/wow/item-use.ts` | C11 | |
| `packages/core/src/wow/runtime.ts` | C2 | |
| `packages/core/src/wow/client-control.ts` | C2 (`queryNearby` method only; after NAV) | |
| `packages/core/src/wow/world-handlers-entity.ts`, `protocol/entity-queries.ts` | C9 | |
| `packages/core/src/wow/world-conn.ts` | C6b (a field for the last place parse) → C9 (a creature-info cache beside `creatureNameCache`, `world-conn.ts:45`) | |
| `packages/core/src/wow/protocol/world-states.ts` (new) | C6b | |
| `packages/core/src/wow/data/area-names.json` (new, generated) | C6a | |
| `packages/core/src/wow/protocol/stubs.ts` | C6b (remove the `SMSG_INIT_WORLD_STATES` row) → C10 | |
| `packages/core/src/wow/client-handlers.ts` | C6b (register the world-states handler) → C10 (stub notify → `notice` emitter) | |
| `packages/devtools/src/area-names.ts` (new generator) | C6a | |
| `biome.json` | C6a (adds `"!**/wow/data/area-names.json"` to `files.includes`) | |
| `packages/cli/src/daemon/events.ts` | C6b (`place_changed` case or ignore) | |
| `packages/cli/src/daemon/server.ts`, `packages/cli/src/ui/tui.ts` | C10 (subscribe `onNotice`, print the same text as today) | |
| CLI tests that assert `combat --json` | C5 | |
| `packages/cli/src/cli/help.ts`, `docs/manual.md`, `.claude/skills/tuicraft/SKILL.md`, `README.md` (the CLI parts) | C5, C6b only if their change is visible there | P6 edits only the new harness section of `README.md` |
| `packages/core/src/wow/navigation-observation.ts` (`CONTAINED_STEPS`), `docs/manual.md` lines 653–656, `SKILL.md` line 289 | C12 (navigation follow-up, main plan) | |
| `docs/evidence/m3a/patched-namigator.md`, `docs/manual.md` lines 610–614 | C13 (navigation follow-up) | C14 (one sentence in patched-namigator.md) |
| `vendor/namigator/check.ts` (new) | C14 (navigation follow-up) | |

The generator runs as `bun packages/devtools/src/area-names.ts <area.wowm>
<out.json>`, default input
`/home/deity/code/wow_messages/wow_message_parser/wowm/world/enums/area.wowm`
(measured present; AGENTS.md's `../wow_messages` is relative to the main
checkout, not the Orca worktree). JSON import is measured to type-check
and run under the repo `tsconfig.base.json` (`module: Preserve`):
`import names from "./names.json" with { type: "json" }`, tsc exit 0.

### 3.2 Harness (`packages/harness/…`)

| File(s) | Owner | Later edits (only these) |
|---|---|---|
| `package.json` (imports map), `tsconfig.json`, `src/index.ts` | F1 | none |
| `src/contract/{result,views,details,log,runs,config,services}.ts`, `src/ops/refusal.ts` | F2 | none (frozen) |
| `src/config/flags.ts` | F3a | |
| `src/config/profile.ts` | F3b | |
| `src/config/lock.ts` | F3c | |
| `src/credentials/omp-store.ts` | F4a | |
| `src/credentials/status.ts` | F4b | |
| `src/runtime/harness-runtime.ts`, `src/runtime/mutex.ts`, `src/runtime/yield.ts`, `test-support/runtime-fixture.ts` | F5a | `runtime-fixture.ts`: none; later tests pass real parts through `parts` |
| `src/runtime/connection.ts` | F5b | |
| `src/runtime/ready.ts` | F5c | |
| `src/runtime/pi-runtime.ts`, `test-support/faux-session.ts` | F6a | |
| `src/entry.ts`, `src/main.ts` | F6b | none |
| `src/extension/extension.ts` | F7a | insertion lines: A1, L10, P3, U10, U11 (2.5) |
| `src/extension/input.ts` | F7a (empty `installInput`) → F7b | |
| `src/extension/guards.ts` | F7a (empty `installGuards`) → F7c | |
| `src/smoke/v3-yield.test.ts` | F8a | |
| `src/smoke/v4-validation.test.ts` | F8b | |
| `src/smoke/v6-now.test.ts` | F8c | |
| `src/smoke/v2-context.test.ts` | F8d | |
| `docs/plans/2026-09-26-pi-harness-epic/smoke-live.md` (V1, V5, V6, V7 live record) | F8e | |
| `src/tools/define.ts`, `src/tools/params.ts`, `src/tools/registry.ts`, `src/tools/install.ts` | A1 | none |
| `src/tools/{look,travel,engage,loot,interact,rest,recover,social,journal,stop}.ts` (stubs) | A1 → the tool's task | |
| `src/ops/refs.ts` | A2 | |
| `src/ops/views.ts`, `src/ops/resolve.ts` | A3 | |
| `src/ops/settle.ts` | A4 | |
| `src/ops/range.ts` | A5 | |
| `src/ops/repeat-guard.ts` | A6 | |
| `src/ops/danger.ts` | A7 | |
| `src/ops/sightings.ts` | A8 | |
| `src/ops/progress.ts` | A9 | |
| `src/tools/look.ts` | A10 | |
| `src/tools/journal.ts` | A11 | |
| `src/tools/social.ts` | A12 | |
| `src/tools/stop.ts` | A13 | |
| `src/ops/travel-leg.ts` | B1 | |
| `src/ops/explore.ts` | B2 | |
| `src/ops/loot.ts` | B3 | |
| `src/ops/recover.ts` | B4 | |
| `src/tools/travel.ts` | B5 | |
| `src/tools/loot.ts` | B6 | |
| `src/tools/interact.ts`, `src/tools/interact-quest.ts` | B7 | B8, B9 add their `do` branches to the dispatch in `interact.ts` |
| `src/tools/interact-vendor.ts` | B8 | |
| `src/tools/interact-trainer.ts` | B9 | |
| `src/tools/rest.ts` | B10 | |
| `src/tools/recover.ts` | B11 | |
| `src/tools/engage.ts`, `src/tools/engage-choose.ts` | B12 | |
| `src/tools/engage-fight.ts` | B13 | B13 also wires the fight into `engage.ts` |
| `src/log/store.ts` | L1 | |
| `src/log/query.ts` | L2 | |
| `src/runs/registry.ts`, `src/runs/wait.ts` | L3 | |
| `src/runs/adapters.ts` | L4 | |
| `src/events/rules.ts`, `src/events/router.ts` | L5 | |
| `src/events/rules-chat.ts` | L6 | |
| `src/events/rules-combat.ts` | L7 | |
| `src/events/rules-world.ts` | L8 | |
| `src/events/guard.ts`, `src/events/delivery.ts` | L9 | |
| `src/events/now.ts`, `src/events/install.ts` | L10 | |
| `src/events/snapshot.ts` | L11 | |
| `src/eval/run-dir.ts` | L12 | |
| `src/eval/stats.ts` | L13 | |
| `src/eval/status.ts` | L14 | |
| `src/ui/glyphs.ts`, `src/ui/context.ts` | U1 | none |
| `src/ui/footer.ts` | U2 | |
| `src/ui/ticker.ts` | U3 | |
| `src/ui/cards.ts` | U4 | |
| `src/ui/renderers/registry.ts`, `src/ui/renderers/line.ts` | U5 | registry map entries: U6, U7, U8 |
| `src/ui/renderers/picture.ts` | U6 | |
| `src/ui/renderers/live-run.ts` | U7 | |
| `src/ui/renderers/card.ts` | U8 | |
| `src/ui/status-line.ts` | U9 | |
| `src/extension/commands.ts` | U10 | |
| `src/ui/install.ts` | U11 | |
| `src/prompt/system-prompt.ts` | P1 | |
| `src/prompt/guidelines.ts` | P2 | |
| `src/prompt/install.ts` | P3 | |
| `src/grader/exec.ts`, `src/grader/pane.ts` | E1 | |
| `src/grader/frames.ts` | E2 | |
| `src/grader/truth.ts` | E3 | |
| `src/grader/result.ts`, `src/grader/eval-result.schema.json` | E4 | |
| `src/grader/scenarios.ts`, `src/grader/scenarios/*.json` (13 files) | E5 | |
| `src/grader/watch.ts` | E6 | |
| `src/grader/cli.ts` | E7 | |

A file over 500 non-blank lines splits into siblings owned by the same
task (for example `events/rules-world.ts` → `rules-world-quest.ts`); the
split is recorded in the area plan.

### 3.3 Repository files

| File | Owner | Later edits (only these) |
|---|---|---|
| `mise.toml` | P4 (adds `[tasks.harness]`) | E7 (adds `[tasks.eval]`) |
| `docs/harness.md` (new) | P5 | |
| `README.md` (a new "Pi harness" section only) | P6 | |
| `AGENTS.md` (Commands list: `mise harness`, `mise eval`) | P6 | |
| `packages/harness/src/**` `promptGuidelines` text | P2 (`TOOL_TEXT`) | |

The four CLI doc places (`help.ts`, `docs/manual.md`, `SKILL.md`,
`README.md` CLI parts) change only for a CLI-visible core change (3.1);
the harness adds no CLI verb (R21).

## 4. Task DAG

The task index in [the plan index](../2026-09-26-pi-harness-epic-plan.md) supersedes the tables below for split ids
(for example `F5a` → `F5aa`, `F5b`, `F5ab`) and for the edges that the
area files and the main plan's rulings add (F6b: A3b, L9a, F8a and no B
tool; L10b: F8c, F8d; P3: P2, F5ab; C12–C14 added; and the shared-file and import edges of the plan index "Verification (dag-commands)").

`Needs` lists the tasks whose output (section 1–3 names) the task consumes.
A task starts when every task it needs has landed on `epic/pi-harness`.
Gates: **NAV** (0.5); **SURFACE** = C1 and F2 landed; **V3** = F8a passes
(the blocking-run model is proven; design H.7, V.4 #1); **BOOT** = F6b
landed (the harness starts end to end); **FINAL** = `mise ci`, `mise
test:live` on two throwaway soap accounts (AGENTS.md "Testing"), and the
round-1 canary `t0-self-state`.

### 4.1 Tasks

core-a (one builder, one commit each, in this order):

| Id | Design | Produces | Needs |
|---|---|---|---|
| C0 | G0 | all of 1.2–1.13 surface, neutral values, stubs | — |
| C1 | G1 | 1.12 C1 export lines | C0 |
| C5 | G5 | `attackers`, `CombatEvent.attacker`, `combat --json` | C1 |
| C4 | G4 | `lootable`, `tapped`, `tappedByOther` | C1 |
| C3 | G3 | `npcRoles`, `roles` | C4 |
| C2 | G2 | `capabilities`, `relation`, `attackable`, `attackingMe`, `targetOf`, `NearbySources.units` wiring | C3, C5, NAV |
| C9 | G9 | `getCreatureInfo` | C2 |
| C11 | G11 | `itemKind`, `ItemLabel` class/subclass/`useSpellIds` | C1 |
| C10 | G10 | `onNotice` emits; CLI prints notices as before | C6b, C9 |

core-b (parallel with core-a after C1):

| Id | Design | Produces | Needs |
|---|---|---|---|
| C6a | G6 | `packages/devtools/src/area-names.ts`, `data/area-names.json`, `biome.json` ignore | C1 |
| C6b | G6 | `protocol/world-states.ts`, `getPlaceState`, `place_changed`, stub row removed, daemon case | C6a |
| C7a | G7 | `lootCorpse` | C1 |
| C7b | G7 | `recoverCorpse` | C7a |

found:

| Id | Produces | Needs |
|---|---|---|
| F1 | harness `package.json` imports map, `tsconfig.json`, empty `index.ts` | — |
| F2 | `contract/*.ts`, `ops/refusal.ts` | F1, C1 |
| F3a | `parseFlags`, `harnessStateDir`, `UsageError` | F2 |
| F3b | `loadProfile`, `ProfileError`, protected lists (and the NAV follow-up test) | F2 |
| F3c | `acquireLock`, `LockError` | F3b |
| F4a | `OmpCredentialStore`, `readOmpRow`, `CredentialExpiredError` | F2 |
| F4b | `credentialStatus`, `startupCheck` | F4a |
| F5a | `createHarnessRuntime`, `createWorldMutex`, `createYieldGate`, `runtime-fixture.ts` | F2 |
| F5b | `createConnection`, `defaultLogin` | F5a |
| F5c | `createReadyGate` | F5a, A2 |
| F6a | `createPiRuntime`, `test-support/faux-session.ts` | F5a |
| F7a | `wowExtension`, `installShutdown`, empty `installInput` and `installGuards` | F5a |
| F7b | `installInput`, `isStopReflex`, `humanStop` | F7a |
| F7c | `installGuards` (V7 path) | F7a |
| F8a | smoke V3 (faux; runs first) | F6a, F7b |
| F8b | smoke V4 | F8a |
| F8c | smoke V6 | F8a |
| F8d | smoke V2 | F8a |
| F6b | `entry.ts`, `main.ts` (composition root) | F3a, F3b, F3c, F4b, F5b, F5c, F6a, F7a, F7b, F7c, L1, L3, L5, L11, L12, L13, L14, A2, A6, A7, A8, A9, A1, U1 |
| F8e | live checks V1, V5, V6, V7 in an Orca pane on a soap account; record in `smoke-live.md` | F6b, U11, L10, P3 |

log-events:

| Id | Produces | Needs |
|---|---|---|
| L1 | `createGameLog`, `createJsonlSink` | F2 |
| L3 | `createRunRegistry`, `awaitRun` | F2, F5a |
| L2 | `queryLog`, `formatLogRows` | L1, L3 |
| L4 | `awaitGoto`, `awaitTactics`, `awaitCycle`, `awaitQuestCycle`, `jevCode` | F2 |
| L5 | `createEventRouter`, `RuleContext`, `runDrafts` | L1, L3 |
| L6 | `chatDrafts`, `groupDrafts`, `duelDrafts` | L5 |
| L7 | `combatDrafts`, `tacticsDrafts`, `cycleDrafts`, `recoveryDrafts`, `vitalsDrafts` | L5 |
| L8 | `controlDrafts`, `questDrafts`, `rewardsDrafts`, `vendorDrafts`, `trainerDrafts`, `entityDrafts`, `packetErrorDrafts`, `noticeDrafts` | L5 |
| L9 | `createWakeGuard`, `createStuckWatch`, `createDelivery`, `formatWake` | L5, A9 |
| L10 | `formatNow`, `installEvents` (+ its `extension.ts` line) | L9, A3, F7a |
| L11 | `createWorldSnapshots` | L1 |
| L12 | run dir functions | F3a |
| L13 | `createToolStats` | F2 |
| L14 | `statusSnapshot`, `createStatusWriter` | L3, F5a |

ops-tools-a:

| Id | Produces | Needs |
|---|---|---|
| A1 | `defineGameTool`, `result`, `formatContent`, `nextCall`, `askHuman`, `coreErrorResult`, `params.ts`, the ten tool stubs, `gameTools`, `installTools` (+ its `extension.ts` line) | F2, F5a, F7a, P2, U5 |
| A2 | `guidHex`, `parseRef`, `createRefTable` | F2 |
| A4 | `settle` | F2 |
| A6 | `createRepeatGuard`, `repeatRefusal` | F2 |
| A7 | `createAttackLedger`, `dangerView`, `dangerLine`, `watchInterrupts` | A2, F5a |
| A8 | `createSightings` | A2 |
| A9 | `createProgressTracker` | F2, L1 |
| A3 | views, `nowSnapshot`, `snapshotWorld`, `resolveUnit`, `unitRefusal` | A2, A7, A8 |
| A5 | range constants, `distanceTo`, `compassTo` | A3 |
| A10 | `look` | A1, A3, A5, A7, L11 |
| A11 | `journal` | A1, L2, C11 |
| A12 | `social` | A1, A4 |
| A13 | `stop` | A1, A3, A7, L3 |

ops-tools-b:

| Id | Produces | Needs |
|---|---|---|
| B1 | `travelLeg`, `refusalCode` | A1, A3, L4 |
| B2 | `unstick`, `explore`, `parseDirection` | B1 |
| B3 | `lootCorpseOp` | A3, A4 (C7a for the core path; fallback without it) |
| B4 | `recoverOp` | A3, A4 (C7b for the core path) |
| B5 | `travel` | B1, B2, B4, L3, A7, V3 |
| B6 | `loot` | B1, B3, A5 |
| B7 | `interact` talk/accept/turn_in/gossip | B1, A4, A5 |
| B8 | `interact` buy/sell_junk | B7 |
| B9 | `interact` train/repair | B7 |
| B10 | `rest` | A1, A3, A7, L3, C11, V3 |
| B11 | `recover` | B4, L3, V3 |
| B12 | `engage` choose and guards | B1, B2, A3, A5, A7 |
| B13 | `engage` fight, loot, report | B12, B3, L3, L4, V3 |

ui:

| Id | Produces | Needs |
|---|---|---|
| U1 | `ui/glyphs.ts` (moved), `ui/context.ts` | F1 |
| U5 | `rendererFor`, `ToolRenderers`, line family | U1, F2 |
| U2 | footer | U1, F2 |
| U3 | ticker | U1, F2 |
| U4 | event cards, human lines | U1, F2 |
| U6 | picture family (`look`) | U5 |
| U7 | live-run family | U5 |
| U8 | card family | U5 |
| U9 | `titleFor`, `workingMessage` | F2 |
| U10 | `installCommands` (+ its `extension.ts` line) | F7b, L2, F5a |
| U11 | `installUi` (+ its `extension.ts` line) | U2, U3, U4, U9, A3, F7a |

prompt-docs:

| Id | Produces | Needs |
|---|---|---|
| P1 | `buildSystemPrompt` | F1 |
| P2 | `TOOL_TEXT` | F2 |
| P3 | `installPrompt` (+ its `extension.ts` line) | P1, F5c, F7a |
| P4 | `mise.toml` `[tasks.harness]` | F6b |
| P5 | `docs/harness.md` | F6b |
| P6 | `README.md` harness section, `AGENTS.md` commands | P4, P5, E7 |

eval-infra:

| Id | Produces | Needs |
|---|---|---|
| E1 | `Exec`, `bunExec`, `Pane`, `openPane`, `attachPane`, `harnessCommand` | F1 |
| E4 | `EvalResult`, `validateResult`, schema file | F1 |
| E5 | `Scenario`, `loadScenario`, `ROUND_1`, 13 scenario files | F1 |
| E2 | `tagFrame`, `captureFrame` | E1, U1 |
| E3 | `Truth`, `readTruth`, `finalTruth`, `leakCheck` | E1 |
| E6 | `watchRun` | E1, E2, E5, F2 |
| E7 | `grader/cli.ts`, `mise.toml` `[tasks.eval]` | E2, E3, E4, E5, E6, P4 |

### 4.2 Waves (what runs in parallel after which gate)

| Wave | Starts after | Tasks that can run at once |
|---|---|---|
| 0 | — | core-a C0 → C1; F1; then U1, P1, E1, E4, E5 (each needs only F1) |
| 1 | SURFACE | core-a C5, C4, C11 in order; core-b C6a, C7a; F3a, F3b, F4a, F5a; L1, L4, L13; A2, A4, A6; U2, U3, U4, U5, U9; P2; E2, E3 |
| 2 | wave-1 producers | C3; C6b, C7b; F3c, F4b, F5b, F5c, F6a, F7a; L3, L11, L12; A7, A8, A9; U6, U7, U8; E6 |
| 3 | wave-2 producers | C2 (also NAV); F7b, F7c; L2, L5, L14; A1, A3; P3 |
| 4 | wave-3 producers | C9; F8a (V3); L6, L7, L8, L9; A5, A12, A13; B1, B3, B4; U10, U11 |
| 5 | V3 | C10; F8b, F8c, F8d; L10; A10, A11; B2, B6, B7, B10, B11 |
| 6 | wave-5 producers | B5, B8, B9, B12 → B13 |
| 7 | all of the above | F6b (BOOT) |
| 8 | BOOT | P4, P5, F8e, E7 → P6 |
| 9 | everything | FINAL |

Nine builders map to the nine areas; within an area a builder takes tasks
in `Needs` order. A task whose `Needs` crosses areas waits for that
commit on `epic/pi-harness`.

### 4.3 Critical path

C0 → C1 → F2 → F5a → F7a → F7b → F8a (V3) → B5/B10/B11/B13 → F6b → F8e →
FINAL. V3 is the first behaviour test to run; if it fails, the coordinator
applies design H.7's fallback (raise the yield delay; last resort: runs
return at 20 s) before any run tool (B5, B10, B11, B13) is built.

## 5. Decisions this contract adds to the design

| # | Decision | Reason |
|---|---|---|
| D1 | Grader tooling in `packages/harness/src/grader/`, not devtools | 2.13: devtools cannot import `ui/glyphs.ts` (exports `{}`, biome shell rule) |
| D2 | The P6 watcher is tracked (`grader/watch.ts`) | the coordinator's brief lists it as eval infrastructure; it writes only into the run dir |
| D3 | C0 pre-adds `NearbyRow`, `CombatState` and `ItemLabel` fields with neutral values; `onNotice` is real in C0 | harness types stabilise at C0; a throwing hook would break every connect |
| D4 | `Relation` is core's `FactionRelation`; `LootOutcome`/`RecoveryOutcome` are core's `Looted`/`Recovered` shapes | reuse existing types, no second name |
| D5 | G9 surface is `getCreatureInfo(entry)`, not a row field | one surface; the footer rank badge reads it by the target's entry |
| D6 | `place_changed` is a `ControlEventType`, place data from `getPlaceState()` | design G6; no new hook |
| D7 | `ToolResult` gains `body: string[]` | design A.2's type had no place for `look`'s rows or candidate lines |
| D8 | `formatContent` line 1 is the status word, then `<runId>:` (RUNNING) or `<reason>:` when set, then the detail | matches every design B example |
| D9 | Tools are created as stubs by A1; each tool task edits only its own files | no shared registry edits between parallel builders |
| D10 | `extension.ts` has named insertion lines (2.5) | one owner, predictable additions |
| D11 | Inside `engage`, a new attacker becomes the next target (no interrupt); other runs stop on it | closes design V.4 #6 |
| D12 | Pi tool timeout: none in `pi-agent-core/dist/agent-loop.js` (measured: the file exists, 27083 bytes, and `rg -c -i timeout` finds 0 matches), so the 120 s yield stands | closes design V.4 #5 |
| D13 | `area-names.json` is imported as JSON (measured to type-check) and excluded from biome | closes design V.4 #9 |
| D14 | The faux provider API is `fauxProvider(options)` with `setResponses`/`appendResponses` (`pi-ai/dist/providers/faux.d.ts`, read); design H.7's `registerFauxProvider` is not the 0.87.1 name | smoke tests F8a–F8d |
| D15 | `social.text` gets a `description` | design B.1 rule: every parameter has one |
| D16 | The Truth reader goes through `soap truth <ACC>` as a subprocess | factory exports nothing |

## 6. Name index

Name → file (under `packages/harness/src/` unless the path starts with
`packages/`) → owning task.

| Name | File | Task |
|---|---|---|
| `Capabilities`, `NoticeEvent`, `CreatureInfo`, `CreatureRank`, `extrasMethods` | `packages/core/src/wow/client-extras.ts` | C0 (bodies C2, C9) |
| `PlaceState`, `placeMethods` | `packages/core/src/wow/client-place.ts` | C0 (body C6b) |
| `LootOutcome`, `RecoveryOutcome`, `runMethods` | `packages/core/src/wow/client-runs.ts` | C0 (bodies C7a, C7b) |
| `NearbyUnits`, `NearbyRow` fields | `packages/core/src/wow/nearby.ts` | C0 (C4, C3, C2) |
| `NpcRole`, `npcRoles` | `packages/core/src/wow/npc-roles.ts` | C0 (C3) |
| `ItemKind`, `itemKind`, `ItemLabel` fields | `packages/core/src/wow/item-labels.ts` | C0 (C11) |
| `CombatState.attackers`, `CombatEvent.attacker` | `packages/core/src/wow/combat.ts` | C0 (C5) |
| `"place_changed"` | `packages/core/src/wow/control.ts` | C0 |
| `notice` emitter | `packages/core/src/wow/world-events.ts` | C0 |
| area generator | `packages/devtools/src/area-names.ts` | C6a |
| `ToolName`, `ToolStatus`, `Evidence`, `ToolResult`, `ResultInit` | `contract/result.ts` | F2 |
| `Compass`, `PoseView`, `PowerKind`, `VitalsView`, `SelfView`, `PlaceView`, `UnitView`, `NearestKind`, `AttackerView`, `DangerView`, `CastView`, `AuraView`, `RunView`, `RecoveryView`, `NoProgress`, `NowSnapshot`, `SnapshotWorld`, `InWorld` | `contract/views.ts` | F2 |
| `LookFilter`, `LookAfter`, `LegStatus`, `LegView`, `TravelGoalView`, `TravelAfter`, `LootLine`, `EngageTarget`, `JevDecisionView`, `CodeWord`, `EngageAfter`, `LootAfter`, `InteractAction`, `QuestOffer`, `GossipLine`, `StockLine`, `TrainerLine`, `RewardChoice`, `MoneyChange`, `InteractAfter`, `RestAfter`, `RecoverAfter`, `SocialAction`, `SocialAfter`, `EquipSlotName`, `QuestLine`, `BagsView`, `SpellLine`, `JournalAfter`, `StopAfter`, `AfterMap`, `ToolDetailsFor`, `ToolDetails` | `contract/details.ts` | F2 |
| `LogClass`, `Domain`, `LogEvent`, `GameLogEntry`, `LogDraft`, `WowEventDetails`, `HumanLineDetails` | `contract/log.ts` | F2 |
| `RunKind`, `RunStatus`, `StopCause`, `RunRecord`, `RunEnd`, `RunControl`, `RunLaunch`, `RunStart`, `RunHandle`, `RunEvent`, `RunWait`, `RunRegistry` | `contract/runs.ts` | F2 |
| `HarnessFlags`, `ProfileSource`, `Profile`, `RunPaths`, `ConnectionState`, `RunMeta`, `ToolStatsRow`, `ToolsJson`, `AgentState`, `StatusJson` | `contract/config.ts` | F2 |
| `Clock`, `HandleObserver`, `JsonlSink`, `GameLog`, `RefTable`, `Sighting`, `Sightings`, `ProgressTracker`, `RepeatCall`, `RepeatHit`, `RepeatGuard`, `AttackLedger`, `WorldSnapshots`, `ReadyGate`, `DeliverySink`, `EventRouter`, `YieldGate`, `WorldMutex`, `ToolStats`, `SessionFlags`, `TravelMemory`, `Login`, `ViewCtx`, `OpsCtx`, `ToolCtx`, `HarnessRuntime`, `RuntimeParts` | `contract/services.ts` | F2 |
| `Refusal`, `RefusalInit` | `ops/refusal.ts` | F2 |
| `parseFlags`, `UsageError`, `USAGE`, `DEFAULT_MODEL`, `harnessStateDir` | `config/flags.ts` | F3a |
| `loadProfile`, `ProfileError`, `ProfileErrorCode`, `PROTECTED_ACCOUNTS`, `PROTECTED_ACCOUNT_PREFIXES`, `PROTECTED_CHARACTERS`, `isProtected` | `config/profile.ts` | F3b |
| `acquireLock`, `Lock`, `LockInit`, `LockError` | `config/lock.ts` | F3c |
| `OmpCredentialStore`, `OmpRow`, `OmpStoreInit`, `ompDbPath`, `readOmpRow`, `CredentialExpiredError` | `credentials/omp-store.ts` | F4a |
| `CredentialStatus`, `StartupCheck`, `MIN_VALID_MS`, `WARN_VALID_MS`, `credentialStatus`, `startupCheck` | `credentials/status.ts` | F4b |
| `createHarnessRuntime` | `runtime/harness-runtime.ts` | F5a |
| `createWorldMutex` | `runtime/mutex.ts` | F5a |
| `createYieldGate`, `YIELD_DELAY_MS` | `runtime/yield.ts` | F5a |
| `createTestRuntime`, `TestRuntime`, `TestRuntimeInit`, `TestClock`, `MockHandle`, `testProfile`, `testPaths` | `packages/harness/test-support/runtime-fixture.ts` | F5a |
| `createConnection`, `Connection`, `ConnectionInit`, `BACKOFF_MS`, `defaultLogin` | `runtime/connection.ts` | F5b |
| `createReadyGate`, `ReadyInit`, `READY_STABLE_MS` | `runtime/ready.ts` | F5c |
| `createPiRuntime`, `PiRuntimeInit` | `runtime/pi-runtime.ts` | F6a |
| faux session helpers | `packages/harness/test-support/faux-session.ts` | F6a |
| `main`, `EXIT` | `main.ts` | F6b |
| `wowExtension`, `installShutdown` | `extension/extension.ts` | F7a |
| `installInput`, `isStopReflex`, `humanStop`, `STOP_WORDS`, `STOP_MAX_WORDS` | `extension/input.ts` | F7b |
| `installGuards` | `extension/guards.ts` | F7c |
| `defineGameTool`, `GameToolSpec`, `GameTool`, `ToolKind`, `result`, `formatContent`, `nextCall`, `askHuman`, `coreErrorResult`, `TURN_BUDGET`, `READY_WAIT_MS`, `UPDATE_EVERY_MS`, `MAX_CONTENT_LINES`, `MAX_CONTENT_BYTES` | `tools/define.ts` | A1 |
| `lookParams`, `travelParams`, `engageParams`, `lootParams`, `interactParams`, `restParams`, `recoverParams`, `socialParams`, `journalParams`, `stopParams`, `LookArgs`, `TravelArgs`, `EngageArgs`, `LootArgs`, `InteractArgs`, `RestArgs`, `RecoverArgs`, `SocialArgs`, `JournalArgs`, `StopArgs` | `tools/params.ts` | A1 |
| `gameTools` | `tools/registry.ts` | A1 |
| `installTools` | `tools/install.ts` | A1 |
| `guidHex`, `parseRef`, `createRefTable` | `ops/refs.ts` | A2 |
| `compassOf`, `poseView`, `vitalsView`, `selfView`, `placeView`, `unitView`, `sightingView`, `unitViews`, `nearestByKind`, `nowSnapshot`, `snapshotWorld` | `ops/views.ts` | A3 |
| `UnitQuery`, `Resolved`, `resolveUnit`, `unitRefusal` | `ops/resolve.ts` | A3 |
| `settle`, `SettleInit` | `ops/settle.ts` | A4 |
| `TALK_RANGE_YD`, `INTERACT_APPROACH_YD`, `LOOT_APPROACH_YD`, `LOOT_WALK_MAX_YD`, `ENGAGE_APPROACH_YD`, `LOOK_DEFAULT_YD`, `LOOK_DEFAULT_ROWS`, `LOOK_MAX_ROWS`, `distanceTo`, `compassTo` | `ops/range.ts` | A5 |
| `createRepeatGuard`, `repeatRefusal`, `TIME_CODES`, `REPEAT_MOVE_YD` | `ops/repeat-guard.ts` | A6 |
| `createAttackLedger`, `dangerView`, `dangerLine`, `watchInterrupts`, `InterruptRules`, `InterruptCause`, `InterruptWatch` | `ops/danger.ts` | A7 |
| `createSightings`, `SIGHTING_TTL_MS` | `ops/sightings.ts` | A8 |
| `createProgressTracker`, `NO_PROGRESS_AT`, `STUCK_LOG_AT` | `ops/progress.ts` | A9 |
| `lookTool` | `tools/look.ts` | A10 |
| `journalTool` | `tools/journal.ts` | A11 |
| `socialTool` | `tools/social.ts` | A12 |
| `stopTool` | `tools/stop.ts` | A13 |
| `travelLeg`, `refusalCode`, `LegGoal`, `LegResult`, `FLOOR_MATCH_YD` | `ops/travel-leg.ts` | B1 |
| `unstick`, `explore`, `parseDirection`, `UnstickResult`, `ExploreResult`, `ExploreStop`, `UNSTICK_MAX_YD`, `EXPLORE_MAX_YD`, `EXPLORE_MAX_OBSTRUCTED` | `ops/explore.ts` | B2 |
| `lootCorpseOp`, `LootOpResult` | `ops/loot.ts` | B3 |
| `recoverOp`, `RecoverHow`, `RecoverOpResult` | `ops/recover.ts` | B4 |
| `travelTool` | `tools/travel.ts` | B5 |
| `lootTool` | `tools/loot.ts` | B6 |
| `interactTool` | `tools/interact.ts` (+ `interact-quest.ts`) | B7 (+ B8 `interact-vendor.ts`, B9 `interact-trainer.ts`) |
| `restTool` | `tools/rest.ts` | B10 |
| `recoverTool` | `tools/recover.ts` | B11 |
| `engageTool` | `tools/engage.ts` (+ `engage-choose.ts`) | B12 (+ B13 `engage-fight.ts`) |
| `createGameLog`, `createJsonlSink`, `LOG_CAPACITY`, `FLUSH_MS` | `log/store.ts` | L1 |
| `queryLog`, `formatLogRows`, `LogQuery`, `LogPage`, `JOURNAL_LOG_LIMIT` | `log/query.ts` | L2 |
| `createRunRegistry` | `runs/registry.ts` | L3 |
| `awaitRun`, `YIELD_AFTER_MS` | `runs/wait.ts` | L3 |
| `awaitGoto`, `awaitTactics`, `awaitCycle`, `awaitQuestCycle`, `jevCode`, `GotoEnd`, `FightEnd`, `CycleEnd`, `GOTO_POLL_MS` | `runs/adapters.ts` | L4 |
| `RuleContext`, `Drafts`, `runDrafts` | `events/rules.ts` | L5 |
| `createEventRouter`, `RouterInit` | `events/router.ts` | L5 |
| `chatDrafts`, `groupDrafts`, `duelDrafts` | `events/rules-chat.ts` | L6 |
| `combatDrafts`, `tacticsDrafts`, `cycleDrafts`, `recoveryDrafts`, `vitalsDrafts` | `events/rules-combat.ts` | L7 |
| `controlDrafts`, `questDrafts`, `rewardsDrafts`, `vendorDrafts`, `trainerDrafts`, `entityDrafts`, `packetErrorDrafts`, `noticeDrafts` | `events/rules-world.ts` | L8 |
| `WakeGuard`, `createWakeGuard`, `createStuckWatch`, `WAKE_MIN_GAP_MS`, `WAKE_PER_MINUTE`, `WAKE_BURST`, `SENDER_GAP_MS`, `STUCK_WAKE_MS` | `events/guard.ts` | L9 |
| `createDelivery`, `formatWake`, `PASSIVE_FLUSH_CAP` | `events/delivery.ts` | L9 |
| `formatNow`, `NOW_MAX_CHARS` | `events/now.ts` | L10 |
| `installEvents` | `events/install.ts` | L10 |
| `createWorldSnapshots`, `SNAPSHOT_EVERY_MS` | `events/snapshot.ts` | L11 |
| `createRunDir`, `writeMeta`, `linkSession`, `finalizeSession`, `pruneRuns`, `runsRoot`, `RunDirError`, `KEEP_RUNS` | `eval/run-dir.ts` | L12 |
| `createToolStats`, `STATS_EVERY_MS` | `eval/stats.ts` | L13 |
| `statusSnapshot`, `createStatusWriter`, `StatusWriter`, `STATUS_EVERY_MS` | `eval/status.ts` | L14 |
| glyph module exports | `ui/glyphs.ts` | U1 |
| `setGlyphs`, `glyphs`, `glyphSetName` | `ui/context.ts` | U1 |
| `footerLines`, `createFooter`, `FooterChrome`, `FooterSource`, `FOOTER_ROWS` | `ui/footer.ts` | U2 |
| `tickerLines`, `createTicker`, `TickerSource`, `TICKER_ROWS` | `ui/ticker.ts` | U3 |
| `renderEventCard`, `renderHumanLine` | `ui/cards.ts` | U4 |
| `ToolRenderers`, `rendererFor` | `ui/renderers/registry.ts` | U5 |
| `socialRenderers`, `stopRenderers` | `ui/renderers/line.ts` | U5 |
| `lookRenderers` | `ui/renderers/picture.ts` | U6 |
| `travelRenderers`, `engageRenderers`, `restRenderers`, `recoverRenderers` | `ui/renderers/live-run.ts` | U7 |
| `interactRenderers`, `lootRenderers`, `journalRenderers` | `ui/renderers/card.ts` | U8 |
| `titleFor`, `workingMessage` | `ui/status-line.ts` | U9 |
| `installCommands` | `extension/commands.ts` | U10 |
| `installUi` | `ui/install.ts` | U11 |
| `buildSystemPrompt`, `PromptInit` | `prompt/system-prompt.ts` | P1 |
| `TOOL_TEXT`, `ToolText` | `prompt/guidelines.ts` | P2 |
| `installPrompt` | `prompt/install.ts` | P3 |
| `Exec`, `ExecResult`, `bunExec` | `grader/exec.ts` | E1 |
| `Pane`, `openPane`, `attachPane`, `harnessCommand`, `HARNESS_LAUNCH` | `grader/pane.ts` | E1 |
| `Frame`, `tagFrame`, `captureFrame` | `grader/frames.ts` | E2 |
| `Truth`, `TruthItem`, `TruthQuest`, `FinalTruth`, `parseTruth`, `readTruth`, `finalTruth`, `leakCheck` | `grader/truth.ts` | E3 |
| `EvalResult`, `EvalVerdict`, `AbortCause`, `EvalCheck`, `EvalEfficiency`, `EvalAttempts`, `EvalIntervention`, `FrictionItem`, `EvalEvidence`, `validateResult` | `grader/result.ts` | E4 |
| `Scenario`, `ScenarioCheck`, `SteerAt`, `TriggerName`, `ROUND_1`, `loadScenario` | `grader/scenarios.ts` | E5 |
| `watchRun`, `Watcher`, `TriggerRow`, `ProgressJson`, `TRIGGER_EVENTS`, `FRAME_EVERY_MS` | `grader/watch.ts` | E6 |
| grader CLI | `grader/cli.ts` | E7 |
