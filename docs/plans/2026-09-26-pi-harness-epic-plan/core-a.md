# Pi harness epic: core-a task file (key: core-a)

Plan index: [2026-09-26-pi-harness-epic-plan.md](../2026-09-26-pi-harness-epic-plan.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Area overview (5 lines).**
1. One builder does the core changes of design section G in this order, one commit each: C0 (G0 surface), C1 (G1), C5 (G5), C4 (G4), C3 (G3), C2a and C2b (G2), C9 (G9), C11 (G11), C10 (G10), then C12, C13, C14 ([plan index](../2026-09-26-pi-harness-epic-plan.md): C12 needs C11, because C5, C11, C12 and C13 all edit `docs/manual.md`).
2. The contract ([`contract.md`](contract.md)) uses task ids `C<n>`; design id `G<n>` is the same change (C0 = G0 … C11 = G11). This file uses the contract ids.
3. C0 adds every new `WorldHandle` member, type and row field with neutral values or `not_implemented` bodies; the later tasks fill only their own body files, so `mise ci` is green after each commit (R21).
4. Every task keeps the legacy CLI green and changes CLI output only where this file says so (C5: `combat --json`; C10: the same NYI text through a new path; C11: three new item JSON keys, documented).
5. C2a, C5, C9, C10 and C11 change runtime, protocol or daemon output, so each ends with the live gate L on two throwaway soap accounts; C0, C1, C3, C4 and C2b are pure and end with `mise ci`.

**Spec:** `docs/plans/2026-09-26-pi-harness-epic-design.md` (section 6, the G0–G11 table) and [`harness-design.md`](../2026-09-26-pi-harness-epic/harness-design.md) section G, both approved (R34). **Contract:** [`contract.md`](contract.md) sections 1, 3.1 and 4.1.

**Tech stack:** Bun 1.4.2, TypeScript strict (`noUncheckedIndexedAccess`, `noUnusedParameters`), `bun:test`, Biome 2.5.14, mise tasks.

## Contract issues

The contract is not changed. Each issue below is measured or read in the epic worktree at `3af5aa3`, and this file plans around it.

1. **3.1 `experience.test.ts` row is not needed (read).** `experience.test.ts:42` builds `{ lastLevelUp: undefined, lastXp: undefined }` for a `Pick<CombatState, "lastXp" | "lastLevelUp">` parameter (`experience.ts:17`). A new `CombatState.attackers` field does not touch it. The only other `CombatState` literals are `as unknown as CombatState` casts (`combat-actions-target.test.ts:57`, `combat-defense.test.ts:37`, `combat-progress.test.ts:86,103`) and a spread of the mock snapshot (`packages/cli/src/ui/format-combat.test.ts:190`). C0 does not edit `experience.test.ts`.
2. **1.13 `triggerCycleEvent` (read).** The mock's `onCycleEvent` subscribes to `cycle.onEvent(cb)`, the private emitter of its `EncounterCycleRuntime`, not to `events.cycle`. C0 forwards `cycle.onEvent((event) => events.cycle.emit(event))` once, switches `onCycleEvent` to `events.cycle.subscribe(cb)`, and `triggerCycleEvent` emits on `events.cycle`. Real cycle events still reach subscribers.
3. **1.3–1.5 C0 bodies and unused parameters (measured: `noUnusedParameters: true` in `tsconfig.base.json`).** A throwing body does not use `conn` or `rt`. C0 names them `_conn` and `_rt`; the body tasks (C2, C9; core-b C6b, C7a) rename the ones they start to use. The types are unchanged.
4. **1.7 `TARGET_BLOCK` is module-private (read, `combat-actions-target.ts:15`), and no core-a task owns that file.** C2 builds the same mask in `nearby.ts` from the exported `UnitFlag` constants (`ATTACK_BLOCK`, seven flags, same list).
5. **1.5/1.7 C2 needs the faction catalog in `client-control.ts` (read).** `Runtimes` has no accessor for `lazy.factions`. C2 adds `factions: () => FactionTemplateCatalog | undefined` to `Runtimes` beside the contract's `capabilities: () => Capabilities`. `Runtimes` is core-internal and not in the barrel.
6. **3.1 `runtime.ts` line budget (measured: 472 non-blank lines, cap 500).** C2 moves `LazyState`, `loadCatalog`, `loadFactions` and `loadNavigation` into a new sibling `packages/core/src/wow/runtime-data.ts` (owner C2, by the 3.1 split rule) and adds the new `warmCatalogs` and `capabilitiesOf` there.
7. **3.1 `WorldConn` fields have no initialiser owner (read).** `createWorldConn` is in `client-connection.ts:178`, which no task owns. C9 adds an optional `creatureInfoCache?: Map<number, CreatureInfo>` and creates it with `??=` on first use, as `control?` and `combat?` already are. core-b's C6b field has the same issue.
8. **3.1 order on `world-conn.ts` (read).** 3.1 lists C6b before C9, but 4.1 lets C9 start after C2 only. C9's edit is one new line at the end of the type, so it merges with C6b's line in either order. C9 does not wait for C6b. Overridden by the plan index "Verification (dag-commands)": C9 waits for C6b, so no two parallel tasks edit `world-conn.ts`.
9. **3.1 new test support file for C9.** Two C9 test files need the same full `SMSG_CREATURE_QUERY_RESPONSE` packet. C9 creates `packages/core/test-support/creature-query-fixtures.ts` (owner C9).
10. **1.11 "none unless the CLI opts in" is false for C11 (read).** `labelInventory`, `labelLoot` (`item-labels.ts`) and `client-vendor.ts:24` spread the whole `ItemLabel` into `inventory --json`, `loot --json` and `vendor --json`. C11 therefore documents the three new keys in `docs/manual.md` (lines 842–844 and 951–952) and `.claude/skills/tuicraft/SKILL.md` (lines 398 and 459), per AGENTS.md "Documentation". 3.1 does not list C11 as a docs editor.
11. **C10 edits files 3.1 does not list (read).** `packages/core/src/wow/world-handlers-chat.test.ts:317` asserts that a stub reaches `onMessage`; C10 changes that one test to `onNotice`. C10 also adds tests to `client-handlers.test.ts`, `packages/cli/src/ui/tui-session.test.ts` and a new `packages/cli/src/daemon/server.test.ts` (the colocated tests of its files). `registerStubs` in `stubs.ts` changes its `notify` parameter from a string to a `StubNotice` object (C10 owns `stubs.ts` after C6b).
12. **4.1 cross-area wait for C10.** C10 needs core-b's C6b on `epic/pi-harness` (both edit `stubs.ts` and `client-handlers.ts`). C9 also needs C6b ([plan index](../2026-09-26-pi-harness-epic-plan.md) "Verification (dag-commands)": both edit `world-conn.ts`); C11 does not. While C6b is pending the builder does C11, then C12, C13 and C14, then C9 and C10.
13. **0.5 NAV gate is already met (measured).** `git log -- packages/core/src/wow/client-control.ts` on `epic/pi-harness` shows `f80b559 fix: Pick the goto floor from the unit's Z`, and HANDOVER records F1–F4 landed. C2 does not wait.
14. **1.9 `attacker` on the event (read).** `CombatRuntime.emit(type, reason?)` is private and every event goes through it. C5 adds a third optional parameter `attacker?: bigint`; no other call site changes.
15. **1.8 numeric literals.** Biome `useNumericSeparators` is on; core writes hex with two-digit groups from four digits up (`0x20_00`, `0x80_00_00_00`, read). The code below follows that. `mise lint:fix` normalises any miss.

## Conventions for every task in this file

- Work in your Orca child worktree of `epic/pi-harness`. All paths are relative to that worktree root. Run `git -C . pull --ff-only` before each task.
- `grep`, `find` and `head` are shell functions on this machine: use `rg`, `/usr/bin/find` and `command head`.
- Single test file: `mise test <path>`. Type check one package: `mise typecheck core` or `mise typecheck cli`. Full gate: `mise ci` (typecheck, test:coverage, format, lint, lint:docs; the signoff step prints a note and exits 0 for an unpushed HEAD).
- Before each commit, run `mise format:fix` and `mise lint:fix` (Biome sorts imports, export lists and, outside `packages/core/src/wow/**`, object keys).
- Stage exact paths with `git add`, then commit as a separate command with `mise exec -- git commit -F -` and a heredoc. No attribution trailers.
- Never use `mock.module`. Use `jest.useFakeTimers()` in `try/finally` with `jest.useRealTimers()` when a test needs timers.

## Live gate L (C2a, C5, C9, C10, C11)

AGENTS.md "Testing": run it yourself on two throwaway accounts after the task's `mise ci` passes and before the commit. If `soap create` refuses because the namigator patch set changed, run `mise namigator:build` once and retry.

```bash
mkdir -p tmp
bun packages/factory/src/main.ts soap create fresh --gm 2 > tmp/live-1.json
bun packages/factory/src/main.ts soap create eversong10 > tmp/live-2.json
WOW_ACCOUNT_1="$(jq -r .account tmp/live-1.json)" \
WOW_PASSWORD_1="$(jq -r .password tmp/live-1.json)" \
WOW_CHARACTER_1="$(jq -r .character tmp/live-1.json)" \
WOW_ACCOUNT_2="$(jq -r .account tmp/live-2.json)" \
WOW_PASSWORD_2="$(jq -r .password tmp/live-2.json)" \
WOW_CHARACTER_2="$(jq -r .character tmp/live-2.json)" \
XDG_CONFIG_HOME="$(jq -r .dir tmp/live-1.json)/config" \
mise test:live
```

Expected: every live test passes. Keep the two accounts for the task's own live check (if it has one), then delete them:

```bash
bun packages/factory/src/main.ts soap delete "$(jq -r .account tmp/live-1.json)"
bun packages/factory/src/main.ts soap delete "$(jq -r .account tmp/live-2.json)"
rm tmp/live-1.json tmp/live-2.json
```

Never print the JSON files (they hold passwords). If the suite fails for an infrastructure reason (server down, SOAP unreachable), stop and report to the coordinator; do not claim the gate passed. Record "Live gate L passed" in the commit body.

## Review Focus

1. A unit when the faction catalog is not loaded (no spell data dir, or load still running): `relation` must stay `"unknown"` and `attackable` `false`, never `"neutral"`. Pinned in C2 ("without a units source every relation stays unknown").
2. A creature query answer that ends after the names (old fixtures, other emulators) or is masked: the name must still be cached and the entity named, and no creature info is invented. Pinned in C9 ("a response cut after the names keeps the name").
3. A stub packet that arrives before anyone subscribes to notices: it must not be lost; the next packet of that opcode delivers it once. Pinned in C10 ("a notice with no subscriber is retried").
4. The self row and game objects: no relation, roles, attack state or loot flags. Pinned in C4, C3 and C2 tests.
5. An attacker that dies or stops attacking: it must leave `attackers`. Pinned in C5 ("a dead or stopped attacker leaves attackers").

---

### Task C0 (G0): Core surface for the harness

**Files:**
- Create: `packages/core/src/wow/client-extras.ts`, `packages/core/src/wow/client-place.ts`, `packages/core/src/wow/client-runs.ts`, `packages/core/src/wow/npc-roles.ts`
- Modify: `packages/core/src/wow/client.ts` (imports; `WorldHandle` type ends at the `onDefenseEvent` line; `createHandle` spreads end at `...defenseMethods(conn, rt),`)
- Modify: `packages/core/src/wow/world-events.ts`, `packages/core/src/wow/control.ts:68-76`, `packages/core/src/wow/nearby.ts`, `packages/core/src/wow/combat.ts:96-137,197-219`, `packages/core/src/wow/item-labels.ts:9`, `packages/core/src/wow/index.ts`, `packages/core/test-support/mock-handle.ts`
- Test: `packages/core/src/wow/client-extras.test.ts`, `packages/core/src/wow/client-place.test.ts`, `packages/core/src/wow/client-runs.test.ts`, `packages/core/src/wow/npc-roles.test.ts` (all new); `packages/core/src/wow/nearby.test.ts`, `packages/core/src/wow/combat.test.ts`, `packages/core/src/wow/item-labels.test.ts`, `packages/core/test-support/mock-handle.test.ts`

**Interfaces:**
- Consumes: existing `WorldConn`, `Runtimes`, `Emitter`, `CycleStop` (`cycle-stop.ts`), `CycleRecovery` (`corpse-run.ts`), `CycleLootRecord` (`encounter-cycle.ts`), `FactionRelation` (`faction-template.ts`).
- Produces (contract 1.2–1.13, exact):
  - `WorldHandle` members: `capabilities: () => Capabilities`, `getPlaceState: () => PlaceState`, `lootCorpse: (guid: bigint, signal: AbortSignal) => Promise<LootOutcome>`, `recoverCorpse: (signal: AbortSignal) => Promise<RecoveryOutcome>`, `onNotice: (cb: (event: NoticeEvent) => void) => Unsubscribe`, `getCreatureInfo: (entry: number) => CreatureInfo | undefined`.
  - `client-extras.ts`: `Capabilities`, `NoticeEvent`, `CreatureRank`, `CreatureInfo`, `extrasMethods(conn: WorldConn, rt: Runtimes): Pick<WorldHandle, "capabilities" | "onNotice" | "getCreatureInfo">` (only `onNotice` is real).
  - `client-place.ts`: `PlaceState`, `placeMethods(conn, rt): Pick<WorldHandle, "getPlaceState">` (throws; body C6b).
  - `client-runs.ts`: `LootOutcome`, `RecoveryOutcome`, `runMethods(conn, rt): Pick<WorldHandle, "lootCorpse" | "recoverCorpse">` (rejects; bodies C7a, C7b).
  - `world-events.ts`: `WorldEvents.notice: Emitter<[NoticeEvent]>`.
  - `control.ts`: `ControlEventType` gains `"place_changed"`.
  - `nearby.ts`: `NearbyUnits`, `NearbySources.units?: NearbyUnits`, `NearbyRow` gains `relation`, `attackable`, `attackingMe`, `targetOf`, `roles`, `lootable`, `tapped`, `tappedByOther` with the neutral values of contract 1.7.
  - `npc-roles.ts`: `NpcRole`, `npcRoles(flags: number): NpcRole[]` (throws; body C3).
  - `combat.ts`: `CombatState.attackers: bigint[]` (`[]`), `CombatEvent.attacker?: bigint`.
  - `item-labels.ts`: `ItemLabel` gains `itemClass?`, `subclass?`, `useSpellIds?`; `ItemKind`; `itemKind(label: ItemLabel): ItemKind` (throws; body C11).
  - Mock: the six stubs of 1.13 and `triggerNotice`, `triggerCycleEvent`, `triggerTrainerEvent`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/wow/client-extras.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { extrasMethods, type NoticeEvent } from "#wow/client-extras";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { Runtimes } from "#wow/runtime";
import type { WorldConn } from "#wow/world-conn";
import { createWorldEvents } from "#wow/world-events";

const notice: NoticeEvent = {
  type: "not_implemented",
  opcode: GameOpcode.SMSG_WEATHER,
  label: "Weather change",
  text: "[tuicraft] Weather change is not yet implemented",
  at: 1,
};

function extras() {
  const conn = { events: createWorldEvents() } as unknown as WorldConn;
  return { conn, methods: extrasMethods(conn, {} as Runtimes) };
}

describe("extrasMethods", () => {
  test("onNotice delivers notice events until unsubscribed", () => {
    const { conn, methods } = extras();
    const seen: NoticeEvent[] = [];
    const off = methods.onNotice((event) => seen.push(event));
    conn.events.notice.emit(notice);
    off();
    conn.events.notice.emit(notice);
    expect(seen).toEqual([notice]);
  });

  test("capabilities and getCreatureInfo are not implemented yet", () => {
    const { methods } = extras();
    expect(() => methods.capabilities()).toThrow("not_implemented");
    expect(() => methods.getCreatureInfo(1)).toThrow("not_implemented");
  });
});
```

Create `packages/core/src/wow/client-place.test.ts`:

```ts
import { expect, test } from "bun:test";
import { placeMethods } from "#wow/client-place";
import type { Runtimes } from "#wow/runtime";
import type { WorldConn } from "#wow/world-conn";

test("getPlaceState is not implemented yet", () => {
  const methods = placeMethods({} as WorldConn, {} as Runtimes);
  expect(() => methods.getPlaceState()).toThrow("not_implemented");
});
```

Create `packages/core/src/wow/client-runs.test.ts`:

```ts
import { expect, test } from "bun:test";
import { runMethods } from "#wow/client-runs";
import type { Runtimes } from "#wow/runtime";
import type { WorldConn } from "#wow/world-conn";

test("lootCorpse and recoverCorpse reject until they are built", async () => {
  const methods = runMethods({} as WorldConn, {} as Runtimes);
  const { signal } = new AbortController();
  await expect(methods.lootCorpse(1n, signal)).rejects.toThrow("not_implemented");
  await expect(methods.recoverCorpse(signal)).rejects.toThrow("not_implemented");
});
```

Create `packages/core/src/wow/npc-roles.test.ts`:

```ts
import { expect, test } from "bun:test";
import { npcRoles } from "#wow/npc-roles";

test("npcRoles is not implemented yet", () => {
  expect(() => npcRoles(0x2)).toThrow("not_implemented");
});
```

Append to the `describe("queryNearby", …)` block of `packages/core/src/wow/nearby.test.ts`:

```ts
  test("rows carry neutral standing, roles and loot flags until filled", () => {
    const [row] = queryNearby(sources(pose(0, 0), [entity(2n, at(1, 0))]));
    expect(row).toMatchObject({
      relation: "unknown",
      attackable: false,
      attackingMe: false,
      roles: [],
      lootable: false,
      tapped: false,
      tappedByOther: false,
    });
    expect(row?.targetOf).toBeUndefined();
  });
```

Append to `packages/core/src/wow/combat.test.ts`:

```ts
test("combat state carries an attackers list", () => {
  const { combat } = setup();
  expect(combat.snapshot().attackers).toEqual([]);
});
```

Append to `packages/core/src/wow/item-labels.test.ts` (add `itemKind` to the existing `#wow/item-labels` import):

```ts
describe("itemKind", () => {
  test("is not implemented yet", () => {
    expect(() => itemKind({ name: null, quality: null })).toThrow(
      "not_implemented",
    );
  });
});
```

Append to `packages/core/test-support/mock-handle.test.ts`:

```ts
test("new surface stubs return neutral values", async () => {
  const handle = createMockHandle();
  const { signal } = new AbortController();
  expect(handle.capabilities()).toEqual({
    factions: false,
    jev: false,
    navigation: false,
    spells: false,
  });
  expect(handle.getPlaceState()).toEqual({
    area: undefined,
    areaId: undefined,
    at: undefined,
    mapId: undefined,
    zone: undefined,
    zoneId: undefined,
  });
  expect(handle.getCreatureInfo(1)).toBeUndefined();
  await expect(handle.lootCorpse(1n, signal)).resolves.toEqual({
    ok: true,
    record: undefined,
  });
  await expect(handle.recoverCorpse(signal)).resolves.toEqual({
    cause: "mock_recover_unavailable",
    ok: false,
  });
});

test("notice, cycle and trainer triggers reach their hooks", () => {
  const handle = createMockHandle();
  const seen: string[] = [];
  handle.onNotice((event) => seen.push(event.label));
  handle.onCycleEvent((event) => seen.push(event.type));
  handle.onTrainerEvent((event) => seen.push(event.type));
  handle.triggerNotice({
    at: 1,
    label: "Weather change",
    opcode: 1,
    text: "[tuicraft] Weather change is not yet implemented",
    type: "not_implemented",
  });
  handle.triggerCycleEvent({
    at: 1,
    state: handle.getCycleState(),
    type: "stopped",
  });
  handle.triggerTrainerEvent({
    at: 1,
    state: {
      coinage: undefined,
      lastOutcome: undefined,
      level: undefined,
      offer: undefined,
      pending: undefined,
    },
    type: "listed",
  });
  expect(seen).toEqual(["Weather change", "stopped", "listed"]);
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `mise test packages/core/src/wow/client-extras.test.ts packages/core/src/wow/client-place.test.ts packages/core/src/wow/client-runs.test.ts packages/core/src/wow/npc-roles.test.ts packages/core/src/wow/nearby.test.ts packages/core/src/wow/combat.test.ts packages/core/src/wow/item-labels.test.ts packages/core/test-support/mock-handle.test.ts`
Expected: FAIL. The four new files fail with `Cannot find module '#wow/client-extras'` (and `client-place`, `client-runs`, `npc-roles`); `item-labels.test.ts` fails with `Export named 'itemKind' not found`; the nearby test fails on `relation` (received object has no `relation`); the combat test fails with `expected [] but received undefined`; the mock tests fail with `handle.capabilities is not a function`.

- [ ] **Step 3: Create the three body files and `npc-roles.ts`**

`packages/core/src/wow/client-extras.ts`:

```ts
import type { WorldHandle } from "#wow/client";
import type { Runtimes } from "#wow/runtime";
import type { WorldConn } from "#wow/world-conn";

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

type Extras = Pick<WorldHandle, "capabilities" | "onNotice" | "getCreatureInfo">;

export function extrasMethods(conn: WorldConn, _rt: Runtimes): Extras {
  return {
    capabilities() {
      throw new Error("not_implemented");
    },
    onNotice(cb) {
      return conn.events.notice.subscribe(cb);
    },
    getCreatureInfo() {
      throw new Error("not_implemented");
    },
  };
}
```

`packages/core/src/wow/client-place.ts`:

```ts
import type { WorldHandle } from "#wow/client";
import type { Runtimes } from "#wow/runtime";
import type { WorldConn } from "#wow/world-conn";

export type PlaceState = {
  mapId: number | undefined;
  zoneId: number | undefined;
  areaId: number | undefined;
  zone: string | undefined;
  area: string | undefined;
  at: number | undefined;
};

type Place = Pick<WorldHandle, "getPlaceState">;

export function placeMethods(_conn: WorldConn, _rt: Runtimes): Place {
  return {
    getPlaceState() {
      throw new Error("not_implemented");
    },
  };
}
```

`packages/core/src/wow/client-runs.ts`:

```ts
import type { WorldHandle } from "#wow/client";
import type { CycleRecovery } from "#wow/corpse-run";
import type { CycleStop } from "#wow/cycle-stop";
import type { CycleLootRecord } from "#wow/encounter-cycle";
import type { Runtimes } from "#wow/runtime";
import type { WorldConn } from "#wow/world-conn";

export type LootOutcome =
  | { ok: true; record: CycleLootRecord | undefined }
  | CycleStop;
export type RecoveryOutcome = ({ ok: true } & CycleRecovery) | CycleStop;

type Runs = Pick<WorldHandle, "lootCorpse" | "recoverCorpse">;

export function runMethods(_conn: WorldConn, _rt: Runtimes): Runs {
  return {
    lootCorpse() {
      return Promise.reject(new Error("not_implemented"));
    },
    recoverCorpse() {
      return Promise.reject(new Error("not_implemented"));
    },
  };
}
```

`packages/core/src/wow/npc-roles.ts`:

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

export function npcRoles(_flags: number): NpcRole[] {
  throw new Error("not_implemented");
}
```

- [ ] **Step 4: Add the handle members and the spreads in `client.ts`**

Add these imports (Biome sorts them):

```ts
import {
  type Capabilities,
  type CreatureInfo,
  extrasMethods,
  type NoticeEvent,
} from "#wow/client-extras";
import { type PlaceState, placeMethods } from "#wow/client-place";
import {
  type LootOutcome,
  type RecoveryOutcome,
  runMethods,
} from "#wow/client-runs";
```

Add after the line `onDefenseEvent: (cb: (event: DefenseEvent) => void) => Unsubscribe;` in `WorldHandle`:

```ts
  capabilities: () => Capabilities;
  getPlaceState: () => PlaceState;
  lootCorpse: (guid: bigint, signal: AbortSignal) => Promise<LootOutcome>;
  recoverCorpse: (signal: AbortSignal) => Promise<RecoveryOutcome>;
  onNotice: (cb: (event: NoticeEvent) => void) => Unsubscribe;
  getCreatureInfo: (entry: number) => CreatureInfo | undefined;
```

Add after `...defenseMethods(conn, rt),` in `createHandle`:

```ts
    ...placeMethods(conn, rt),
    ...runMethods(conn, rt),
    ...extrasMethods(conn, rt),
```

- [ ] **Step 5: Add the event, the control type and the combat fields**

`world-events.ts`: add `import type { NoticeEvent } from "#wow/client-extras";`, add `notice: Emitter<[NoticeEvent]>;` as the last member of `WorldEvents`, and `notice: new Emitter(report),` as the last entry of the object in `createWorldEvents`.

`control.ts`: the union ends

```ts
  | "control_changed"
  | "control_error"
  | "place_changed";
```

`combat.ts`: add `attackers: bigint[];` after `lastLevelUp` in `CombatState`; add `attacker?: bigint;` after `spellName?: string;` in `CombatEvent`; add `attackers: [],` after `lastLevelUp: this.lastLevelUp,` in `snapshot()`.

- [ ] **Step 6: Add the row fields in `nearby.ts`**

Add imports:

```ts
import type { FactionRelation } from "#wow/faction-template";
import type { NpcRole } from "#wow/npc-roles";
```

Replace `NearbyRow` and `NearbySources` with:

```ts
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
```

Add after the `Measurement` type:

```ts
type Traits = Pick<
  NearbyRow,
  | "relation"
  | "attackable"
  | "attackingMe"
  | "targetOf"
  | "roles"
  | "lootable"
  | "tapped"
  | "tappedByOther"
>;

function traits(): Traits {
  return {
    relation: "unknown",
    attackable: false,
    attackingMe: false,
    targetOf: undefined,
    roles: [],
    lootable: false,
    tapped: false,
    tappedByOther: false,
  };
}
```

In `queryNearby`, the row object gains `...traits(),` after `self: isSelf,`.

- [ ] **Step 7: Add the item label fields**

In `item-labels.ts`, replace line 9 with:

```ts
export type ItemLabel = {
  name: string | null;
  quality: number | null;
  itemClass?: number;
  subclass?: number;
  useSpellIds?: number[];
};

export type ItemKind = "food_drink" | "potion" | "other";

export function itemKind(_label: ItemLabel): ItemKind {
  throw new Error("not_implemented");
}
```

- [ ] **Step 8: Add the barrel lines**

In `index.ts`: add

```ts
export type {
  Capabilities,
  CreatureInfo,
  CreatureRank,
  NoticeEvent,
} from "#wow/client-extras";
export type { PlaceState } from "#wow/client-place";
export type { LootOutcome, RecoveryOutcome } from "#wow/client-runs";
export { type NpcRole, npcRoles } from "#wow/npc-roles";
```

replace the `#wow/item-labels` statement with

```ts
export {
  type ItemKind,
  type ItemLabel,
  itemKind,
  type NamedInventoryState,
  type NamedRewardsState,
} from "#wow/item-labels";
```

and the `#wow/nearby` statement with `export type { NearbyQuery, NearbyRow, NearbyUnits } from "#wow/nearby";`.

- [ ] **Step 9: Add the mock stubs and triggers**

In `packages/core/test-support/mock-handle.ts`:

Imports: add `import type { NoticeEvent } from "#wow/client-extras";` and `import type { TrainerEvent } from "#wow/trainer";`, and change the cycle import to `import { type CycleEvent, EncounterCycleRuntime } from "#wow/encounter-cycle";`.

`MockHandle` type: add before `resolveClosed`:

```ts
  triggerNotice: (event: NoticeEvent) => void;
  triggerCycleEvent: (event: CycleEvent) => void;
  triggerTrainerEvent: (event: TrainerEvent) => void;
```

After `defense.onEvent((event) => events.defense.emit(event));` add:

```ts
  cycle.onEvent((event) => events.cycle.emit(event));
```

Replace the `onCycleEvent` entry with:

```ts
    onCycleEvent(cb) {
      return events.cycle.subscribe(cb);
    },
```

Add these entries to the `handle` object (keys stay sorted; `mise lint:fix` places them):

```ts
    capabilities: jest.fn(() => ({
      factions: false,
      jev: false,
      navigation: false,
      spells: false,
    })),
    getCreatureInfo: jest.fn(() => undefined),
    getPlaceState: jest.fn(() => ({
      area: undefined,
      areaId: undefined,
      at: undefined,
      mapId: undefined,
      zone: undefined,
      zoneId: undefined,
    })),
    lootCorpse: jest.fn(async () => ({ ok: true as const, record: undefined })),
    onNotice(cb) {
      return events.notice.subscribe(cb);
    },
    recoverCorpse: jest.fn(async () => ({
      cause: "mock_recover_unavailable",
      ok: false as const,
    })),
    triggerCycleEvent(event) {
      events.cycle.emit(event);
    },
    triggerNotice(event) {
      events.notice.emit(event);
    },
    triggerTrainerEvent(event) {
      events.trainer.emit(event);
    },
```

- [ ] **Step 10: Run the tests and see them pass**

Run: `mise test packages/core/src/wow/client-extras.test.ts packages/core/src/wow/client-place.test.ts packages/core/src/wow/client-runs.test.ts packages/core/src/wow/npc-roles.test.ts packages/core/src/wow/nearby.test.ts packages/core/src/wow/combat.test.ts packages/core/src/wow/item-labels.test.ts packages/core/test-support/mock-handle.test.ts`
Expected: PASS.

- [ ] **Step 11: Run the full gate**

Run: `mise format:fix && mise lint:fix && mise typecheck && mise ci`
Expected: all checks pass. The legacy CLI output does not change (no daemon code reads the new members; `combat --json` gains `"attackers":[]`, which C5 documents when it fills the field).

- [ ] **Step 12: Commit**

```bash
git add packages/core/src/wow/client.ts packages/core/src/wow/client-extras.ts packages/core/src/wow/client-extras.test.ts packages/core/src/wow/client-place.ts packages/core/src/wow/client-place.test.ts packages/core/src/wow/client-runs.ts packages/core/src/wow/client-runs.test.ts packages/core/src/wow/npc-roles.ts packages/core/src/wow/npc-roles.test.ts packages/core/src/wow/world-events.ts packages/core/src/wow/control.ts packages/core/src/wow/nearby.ts packages/core/src/wow/nearby.test.ts packages/core/src/wow/combat.ts packages/core/src/wow/combat.test.ts packages/core/src/wow/item-labels.ts packages/core/src/wow/item-labels.test.ts packages/core/src/wow/index.ts packages/core/test-support/mock-handle.ts packages/core/test-support/mock-handle.test.ts
```

```bash
mise exec -- git commit -F - <<'MSG'
chore: Add the Pi harness core surface

The harness and the core tasks after this one build against one fixed
surface: every new handle member, type and row field lands here with
neutral values or not_implemented bodies, so each later task edits
only its own body file and mise ci stays green (R21).
MSG
```

### Task C1 (G1): Barrel exports the harness names

**Files:**
- Modify: `packages/core/src/wow/index.ts`
- Test: `packages/core/src/wow/index.test.ts` (new)

**Interfaces:**
- Consumes: C0's barrel lines.
- Produces (contract 1.12, C1 list): from `@tuicraft/core`: `Unsubscribe`, `TrainerEvent`, `VendorEvent`, `DestroyEvent`, `RemoteMotionEvent`, `TacticsOutcome`, `JevUnavailableError` (value), `FactionRelation`, `PlayerLife`, `CycleStop`, `CycleRecovery`, `CombatAura`, `ControlEventType`, `CombatEventType`, `NamedInventoryItem`, `NamedInventorySlot`, `NamedLootItem`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/wow/index.test.ts`:

```ts
import { expect, test } from "bun:test";
import {
  type Capabilities,
  type CombatAura,
  type CombatEventType,
  type ControlEventType,
  type CreatureInfo,
  type CycleRecovery,
  type CycleStop,
  type DestroyEvent,
  type FactionRelation,
  type ItemKind,
  itemKind,
  JevUnavailableError,
  type LootOutcome,
  type NamedInventoryItem,
  type NamedInventorySlot,
  type NamedLootItem,
  type NearbyUnits,
  type NoticeEvent,
  type NpcRole,
  npcRoles,
  type PlaceState,
  type PlayerLife,
  type RecoveryOutcome,
  type RemoteMotionEvent,
  type TacticsOutcome,
  type TrainerEvent,
  type Unsubscribe,
  type VendorEvent,
} from "#wow/index";

type HarnessNames = {
  capabilities: Capabilities;
  aura: CombatAura;
  combatEvent: CombatEventType;
  controlEvent: ControlEventType;
  creature: CreatureInfo;
  recovery: CycleRecovery;
  stop: CycleStop;
  destroy: DestroyEvent;
  relation: FactionRelation;
  kind: ItemKind;
  loot: LootOutcome;
  item: NamedInventoryItem;
  slot: NamedInventorySlot;
  lootItem: NamedLootItem;
  units: NearbyUnits;
  notice: NoticeEvent;
  role: NpcRole;
  place: PlaceState;
  life: PlayerLife;
  recovered: RecoveryOutcome;
  motion: RemoteMotionEvent;
  tactics: TacticsOutcome;
  trainer: TrainerEvent;
  unsubscribe: Unsubscribe;
  vendor: VendorEvent;
};

test("the barrel carries every name the harness imports", () => {
  const names: Partial<HarnessNames> = {};
  expect(Object.keys(names)).toEqual([]);
  expect(new JevUnavailableError("probe")).toBeInstanceOf(Error);
  expect(typeof itemKind).toBe("function");
  expect(typeof npcRoles).toBe("function");
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/core/src/wow/index.test.ts`
Expected: FAIL with `SyntaxError: Export named 'JevUnavailableError' not found in module` (the type names fail in `mise typecheck core` with `TS2305: Module '"#wow/index"' has no exported member 'Unsubscribe'`).

- [ ] **Step 3: Add the export lines**

In `packages/core/src/wow/index.ts` add:

```ts
export type { Unsubscribe } from "#lib/emitter";
export type { CombatAura } from "#wow/aura-store";
export type { CycleRecovery } from "#wow/corpse-run";
export type { CycleStop } from "#wow/cycle-stop";
export type { FactionRelation } from "#wow/faction-template";
export { JevUnavailableError } from "#wow/jev-failure";
export type { PlayerLife } from "#wow/player-state";
```

and merge the other names into the statements that already exist for their module:

```ts
export type {
  CombatEvent,
  CombatEventType,
  CombatState,
  CombatUnit,
} from "#wow/combat";
export type {
  ControlEvent,
  ControlEventType,
  ControlPose,
  ControlState,
  MovementDirection,
  NavigationState,
  WalkOutcome,
} from "#wow/control";
export type {
  DestroyEvent,
  DestroyRequest,
  DestroyState,
} from "#wow/destroy";
export {
  type ItemKind,
  type ItemLabel,
  itemKind,
  type NamedInventoryItem,
  type NamedInventorySlot,
  type NamedInventoryState,
  type NamedLootItem,
  type NamedRewardsState,
} from "#wow/item-labels";
export type { RemoteMotionEvent, RemotePose } from "#wow/remote-motion";
export {
  DEFAULT_FIGHT_INSTRUCTION,
  type TacticsEvent,
  type TacticsOutcome,
  type TacticsState,
} from "#wow/tactics";
export type {
  TrainerEvent,
  TrainerOutcome,
  TrainerRequest,
} from "#wow/trainer";
export type {
  VendorEvent,
  VendorOutcome,
  VendorRequest,
} from "#wow/vendor";
```

- [ ] **Step 4: Run the test and see it pass**

Run: `mise test packages/core/src/wow/index.test.ts && mise typecheck core`
Expected: PASS, and tsc exits 0.

- [ ] **Step 5: Run the full gate**

Run: `mise format:fix && mise lint:fix && mise ci`
Expected: all checks pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/wow/index.ts packages/core/src/wow/index.test.ts
```

```bash
mise exec -- git commit -F - <<'MSG'
chore: Export the types the harness names

The harness may import core only through the barrel, and five event
types it routes plus the run, relation and item types it names were
missing there.
MSG
```

### Task C5 (G5): Attackers in combat state

**Files:**
- Modify: `packages/core/src/wow/combat.ts` (`snapshot()` near line 197, `applyAttackStart` near line 452, private `emit` near line 529)
- Modify: `docs/manual.md:285-286`, `.claude/skills/tuicraft/SKILL.md` (a bullet after line 258)
- Test: `packages/core/src/wow/combat.test.ts`, `packages/cli/src/daemon/commands-dispatch-combat.test.ts` (new)

**Interfaces:**
- Consumes: C0's `CombatState.attackers: bigint[]` and `CombatEvent.attacker?: bigint`; existing `CombatRuntime.attackers(): bigint[]` (`combat.ts:193`).
- Produces: `CombatState.attackers` = the live incoming attackers (same list as `attackers()`); the `attacked` `CombatEvent` carries `attacker` = the new attacker's guid. `combat --json` shows `attackers` as hex strings through `jsonSafe`.

- [ ] **Step 1: Write the failing tests**

Replace the C0 test "combat state carries an attackers list" in `packages/core/src/wow/combat.test.ts` with:

```ts
test("attackers lists live incoming attackers and attacked names each one", () => {
  const { combat } = setup();
  const events: CombatEvent[] = [];
  combat.onEvent((event) => events.push(event));
  combat.applyAttackStart({ attacker: 0x10n, victim: 1n });
  combat.applyAttackStart({ attacker: 0x20n, victim: 1n });
  expect(combat.snapshot().attackers).toEqual([0x10n, 0x20n]);
  const attacked = events.filter((event) => event.type === "attacked");
  expect(attacked.map((event) => event.attacker)).toEqual([0x10n, 0x20n]);
  expect(attacked.at(-1)?.state.attackers).toEqual([0x10n, 0x20n]);
});

test("a dead or stopped attacker leaves attackers", () => {
  const store = new EntityStore();
  store.create(0x10n, ObjectType.UNIT, { health: 50 });
  store.create(0x20n, ObjectType.UNIT, { health: 50 });
  const combat = new CombatRuntime({
    send() {},
    now: () => 1000,
    selfGuid: () => 1n,
    selectedGuid: () => undefined,
    getEntity: (guid) => store.get(guid),
    selfPose: () => undefined,
  });
  combat.applyAttackStart({ attacker: 0x10n, victim: 1n });
  combat.applyAttackStart({ attacker: 0x20n, victim: 1n });
  store.update(0x10n, { health: 0 });
  combat.applyAttackStop({ attacker: 0x20n, victim: 1n, dead: 0 });
  expect(combat.snapshot().attackers).toEqual([]);
});
```

Create `packages/cli/src/daemon/commands-dispatch-combat.test.ts`:

```ts
import { describe, expect, jest, test } from "bun:test";
import { createMockHandle } from "@tuicraft/core/test-support/mock-handle";
import { dispatchCommand, type EventEntry } from "#daemon/commands";
import { RingBuffer } from "#lib/ring-buffer";
import { createMockSocket } from "#test-support/commands-fixtures";

describe("combat json", () => {
  test("lists attackers as hex guids", async () => {
    const handle = createMockHandle();
    const base = handle.getCombatState();
    handle.getCombatState = jest.fn(() => ({
      ...base,
      attackers: [0xf1_30_00_3d_23_07_40_1fn],
    }));
    const socket = createMockSocket();
    await dispatchCommand(
      { type: "combat_json" },
      {
        cleanup: jest.fn(),
        events: new RingBuffer<EventEntry>(10),
        handle,
        socket,
      },
    );
    const parsed = JSON.parse(socket.written().trim());
    expect(parsed.attackers).toEqual(["0xf130003d2307401f"]);
  });
});
```

The CLI test guards the output shape; it already passes after C0 (the mock returns the field). The core tests are the failing tests of this task.

- [ ] **Step 2: Run the tests and see them fail**

Run: `mise test packages/core/src/wow/combat.test.ts`
Expected: FAIL. "attackers lists live incoming attackers" fails with `expected [16n, 32n] but received []`; "a dead or stopped attacker" passes by accident only because C0 returns `[]`, so the first test is the proof.

- [ ] **Step 3: Implement**

In `snapshot()` replace `attackers: [],` with:

```ts
      attackers: this.attackers(),
```

In `applyAttackStart` replace the `else if` branch body with:

```ts
    } else if (packet.victim === this.deps.selfGuid()) {
      this.incomingAttackers.add(packet.attacker);
      this.emit("attacked", undefined, packet.attacker);
    }
```

Replace the head of the private `emit`:

```ts
  private emit(type: CombatEventType, reason?: string, attacker?: bigint): void {
    const event: CombatEvent = { type, state: this.snapshot() };
    if (reason !== undefined) event.reason = reason;
    if (attacker !== undefined) event.attacker = attacker;
```

(The rest of `emit` is unchanged.) Run `mise format:fix`, then check the cap: `rg -c -v '^\s*$' packages/core/src/wow/combat.ts` must print at most 500 (measured 489 before C0; the formatter wraps the new `emit` signature, so expect about 497). If it prints more than 500, move the module function `stopStatus` (`combat.ts:542`) unchanged into a new C5-owned sibling `packages/core/src/wow/combat-stop.ts`, export it there, import it in `combat.ts`, and add that file to the commit. Do not change the `emit` parameter shape. If Biome `noUselessUndefined` (on in `biome.json`) reports the middle `undefined` argument, stop and report to the coordinator; do not put a reason string there.

- [ ] **Step 4: Document the field**

`docs/manual.md` line 286 becomes:

```
:: Print combat state. With `--json`, `data` is an object. GUIDs are hex. Predicted poses keep `source=predicted`. `attackers` lists the GUIDs of live units that are attacking the character.
```

Add this bullet to `.claude/skills/tuicraft/SKILL.md` directly after the `cast` bullet (line 258):

```
- `combat --json` `.data.attackers` lists the GUIDs of live units that are attacking the character; a unit leaves the list when it dies or stops attacking. COMBAT `attacked` events in `read --json` carry the new attacker's GUID in `attacker`.
```

- [ ] **Step 5: Run the tests and see them pass**

Run: `mise test packages/core/src/wow/combat.test.ts packages/cli/src/daemon/commands-dispatch-combat.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full gate and the live gate**

Run: `mise format:fix && mise lint:fix && mise ci`, then live gate L.
Expected: all checks pass; every live test passes.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/wow/combat.ts packages/core/src/wow/combat.test.ts packages/cli/src/daemon/commands-dispatch-combat.test.ts docs/manual.md .claude/skills/tuicraft/SKILL.md
```

```bash
mise exec -- git commit -F - <<'MSG'
feat: Report attackers in combat state

The harness danger line, the [now] line and the new-attacker wake need
the live attacker list and the guid of each new attacker; core already
tracked both but did not publish them. Live gate L passed.
MSG
```

### Task C4 (G4): Loot and tap flags on nearby rows

**Files:**
- Modify: `packages/core/src/wow/nearby.ts` (imports, `traits`)
- Test: `packages/core/src/wow/nearby.test.ts`

**Interfaces:**
- Consumes: C0's `NearbyRow` fields and `traits()`; `fieldOf`, `isUnit` (`entity-store.ts`), `UNIT_FIELDS.DYNAMIC_FLAGS` (`protocol/entity-fields.ts:150`).
- Produces: `lootable`, `tapped`, `tappedByOther` on every row. `traits(entity: Entity): Traits`. Bits (AzerothCore `SharedDefines.h:3353-3361`, read): `UNIT_DYNFLAG_LOOTABLE = 0x1`, `UNIT_DYNFLAG_TAPPED = 0x4`, `UNIT_DYNFLAG_TAPPED_BY_PLAYER = 0x8`. The server sets `TAPPED` when the creature has a loot recipient and adds `TAPPED_BY_PLAYER` when the receiving player is that recipient (`Unit.cpp:17016-17024`, read). Game objects, and units with no observed dynamic flags, are all `false`.

- [ ] **Step 1: Write the failing tests**

In `packages/core/src/wow/nearby.test.ts`, add `import { UNIT_FIELDS } from "#wow/protocol/entity-fields";` (merge with the `ObjectType` import) and `type UnitEntity` to the `#wow/entity-store` import, then add these helpers after `entity`:

```ts
function unit(guid: bigint, over: Partial<UnitEntity> = {}): UnitEntity {
  return {
    class_: 0,
    displayId: 0,
    entry: 1,
    factionTemplate: 0,
    gender: 0,
    guid,
    health: 100,
    level: 1,
    maxHealth: 100,
    maxPower: [],
    name: undefined,
    npcFlags: 0,
    objectType: ObjectType.UNIT,
    position: at(1, 0),
    power: [],
    race: 0,
    rawFields: new Map(),
    scale: 1,
    target: 0n,
    unitFlags: 0,
    ...over,
  };
}

function dynamic(flags: number): Map<number, number> {
  return new Map([[UNIT_FIELDS.DYNAMIC_FLAGS.offset, flags]]);
}
```

Append this block:

```ts
describe("loot flags", () => {
  test("read lootable and tapped from UNIT_DYNAMIC_FLAGS", () => {
    const rows = queryNearby(
      sources(pose(0, 0), [
        unit(2n, { rawFields: dynamic(0x1) }),
        unit(3n, { position: at(2, 0), rawFields: dynamic(0x4) }),
        unit(4n, { position: at(3, 0), rawFields: dynamic(0x4 | 0x8) }),
      ]),
    );
    expect(
      rows.map((row) => [row.lootable, row.tapped, row.tappedByOther]),
    ).toEqual([
      [true, false, false],
      [false, true, true],
      [false, true, false],
    ]);
  });

  test("an unobserved unit and a game object are neither lootable nor tapped", () => {
    const post = {
      ...entity(6n, at(2, 0)),
      objectType: ObjectType.GAMEOBJECT,
      rawFields: dynamic(0x1 | 0x4),
    };
    const rows = queryNearby(sources(pose(0, 0), [unit(5n), post]));
    expect(
      rows.map((row) => [row.lootable, row.tapped, row.tappedByOther]),
    ).toEqual([
      [false, false, false],
      [false, false, false],
    ]);
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/core/src/wow/nearby.test.ts`
Expected: FAIL in "read lootable and tapped" with `expected [[true, false, false], …] but received [[false, false, false], …]`.

- [ ] **Step 3: Implement**

In `nearby.ts` change the entity import to `import { type Entity, fieldOf, isUnit, type Position } from "#wow/entity-store";` and add `import { UNIT_FIELDS } from "#wow/protocol/entity-fields";`. Replace `traits()` with:

```ts
const DYNFLAG_LOOTABLE = 0x1;
const DYNFLAG_TAPPED = 0x4;
const DYNFLAG_TAPPED_BY_PLAYER = 0x8;

type LootFlags = Pick<NearbyRow, "lootable" | "tapped" | "tappedByOther">;

function lootFlags(entity: Entity): LootFlags {
  const offset = UNIT_FIELDS.DYNAMIC_FLAGS.offset;
  const flags = isUnit(entity) ? (fieldOf(entity, offset) ?? 0) : 0;
  const tapped = (flags & DYNFLAG_TAPPED) !== 0;
  const mine = (flags & DYNFLAG_TAPPED_BY_PLAYER) !== 0;
  const lootable = (flags & DYNFLAG_LOOTABLE) !== 0;
  return { lootable, tapped, tappedByOther: tapped && !mine };
}

function traits(entity: Entity): Traits {
  return {
    relation: "unknown",
    attackable: false,
    attackingMe: false,
    targetOf: undefined,
    roles: [],
    ...lootFlags(entity),
  };
}
```

In `queryNearby` change `...traits(),` to `...traits(entity),`.

- [ ] **Step 4: Run the test and see it pass**

Run: `mise test packages/core/src/wow/nearby.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full gate**

Run: `mise format:fix && mise lint:fix && mise ci`
Expected: all checks pass. No CLI output changes (the daemon builds `nearby --json` field by field in `packages/cli/src/daemon/nearby.ts`).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/wow/nearby.ts packages/core/src/wow/nearby.test.ts
```

```bash
mise exec -- git commit -F - <<'MSG'
feat: Read loot and tap flags on nearby rows

The harness picks corpses to loot and skips creatures another player
has tapped. The tapped-by-me meaning is read from AzerothCore
Unit.cpp:17016-17024 (TAPPED_BY_PLAYER set for the loot recipient)
and is not yet live-verified; round 1 checks it (design G4).
MSG
```

### Task C3 (G3): NPC roles

**Files:**
- Modify: `packages/core/src/wow/npc-roles.ts`, `packages/core/src/wow/nearby.ts` (`traits`)
- Test: `packages/core/src/wow/npc-roles.test.ts`, `packages/core/src/wow/nearby.test.ts`

**Interfaces:**
- Consumes: C0's `NpcRole` and `npcRoles` signature; C4's `traits(entity: Entity): Traits` and the `unit` test helper.
- Produces: `npcRoles(flags: number): NpcRole[]`, pure, in contract 1.8 list order; `NearbyRow.roles = npcRoles(unit.npcFlags)` for units, `[]` for other objects. Bits read in `../azerothcore-wotlk-playerbots/src/server/game/Entities/Unit/UnitDefines.h:322-348`: `0x4` and `0x8` are unknown and `0x2000000` is `PLAYER_VEHICLE`; none of them is a role.

- [ ] **Step 1: Write the failing tests**

Replace the body of `packages/core/src/wow/npc-roles.test.ts` with:

```ts
import { describe, expect, test } from "bun:test";
import { npcRoles } from "#wow/npc-roles";

describe("npcRoles", () => {
  test("maps AzerothCore NPC flag bits to roles in table order", () => {
    expect(npcRoles(0)).toEqual([]);
    expect(npcRoles(0x1 | 0x2)).toEqual(["gossip", "questgiver"]);
    expect(npcRoles(0x10_00 | 0x2_00 | 0x80)).toEqual([
      "vendor",
      "vendor_food",
      "repair",
    ]);
    expect(npcRoles(0x10 | 0x20)).toEqual(["trainer", "class_trainer"]);
    expect(npcRoles(0x1_00_00 | 0x4_00_00_00)).toEqual([
      "innkeeper",
      "mailbox",
    ]);
    expect(npcRoles(0x40_00)).toEqual(["spirit_healer"]);
  });

  test("ignores the unknown and vehicle bits", () => {
    expect(npcRoles(0x4 | 0x8 | 0x2_00_00_00)).toEqual([]);
  });

  test("names all 24 roles when every role bit is set", () => {
    expect(npcRoles(0x5_ff_ff_f3)).toHaveLength(24);
  });
});
```

Append to `packages/core/src/wow/nearby.test.ts`:

```ts
describe("npc roles", () => {
  test("units carry roles from their NPC flags; game objects none", () => {
    const post = { ...entity(7n, at(2, 0)), objectType: ObjectType.GAMEOBJECT };
    const rows = queryNearby(
      sources(pose(0, 0), [unit(6n, { npcFlags: 0x2 | 0x80 }), post]),
    );
    expect(rows.map((row) => row.roles)).toEqual([
      ["questgiver", "vendor"],
      [],
    ]);
  });
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `mise test packages/core/src/wow/npc-roles.test.ts packages/core/src/wow/nearby.test.ts`
Expected: FAIL. The `npcRoles` tests fail with `error: not_implemented`; the nearby test fails with `expected [["questgiver", "vendor"], []] but received [[], []]`.

- [ ] **Step 3: Implement `npcRoles`**

Replace the function in `npc-roles.ts` (the type stays):

```ts
const NPC_FLAGS: [flag: number, role: NpcRole][] = [
  [0x1, "gossip"],
  [0x2, "questgiver"],
  [0x10, "trainer"],
  [0x20, "class_trainer"],
  [0x40, "profession_trainer"],
  [0x80, "vendor"],
  [0x1_00, "vendor_ammo"],
  [0x2_00, "vendor_food"],
  [0x4_00, "vendor_poison"],
  [0x8_00, "vendor_reagent"],
  [0x10_00, "repair"],
  [0x20_00, "flight_master"],
  [0x40_00, "spirit_healer"],
  [0x80_00, "spirit_guide"],
  [0x1_00_00, "innkeeper"],
  [0x2_00_00, "banker"],
  [0x4_00_00, "petitioner"],
  [0x8_00_00, "tabard_designer"],
  [0x10_00_00, "battlemaster"],
  [0x20_00_00, "auctioneer"],
  [0x40_00_00, "stable_master"],
  [0x80_00_00, "guild_banker"],
  [0x1_00_00_00, "spellclick"],
  [0x4_00_00_00, "mailbox"],
];

export function npcRoles(flags: number): NpcRole[] {
  return NPC_FLAGS.filter(([flag]) => (flags & flag) !== 0).map(
    ([, role]) => role,
  );
}
```

- [ ] **Step 4: Fill `roles` in `nearby.ts`**

Add `import { type NpcRole, npcRoles } from "#wow/npc-roles";` (replacing the type-only import) and change the `roles` line of `traits`:

```ts
    roles: isUnit(entity) ? npcRoles(entity.npcFlags) : [],
```

- [ ] **Step 5: Run the tests and see them pass**

Run: `mise test packages/core/src/wow/npc-roles.test.ts packages/core/src/wow/nearby.test.ts packages/core/src/wow/index.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full gate**

Run: `mise format:fix && mise lint:fix && mise ci`
Expected: all checks pass; no CLI output changes.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/wow/npc-roles.ts packages/core/src/wow/npc-roles.test.ts packages/core/src/wow/nearby.ts packages/core/src/wow/nearby.test.ts
```

```bash
mise exec -- git commit -F - <<'MSG'
feat: Name NPC roles on nearby rows

look, interact and the sightings memory name vendors, trainers,
questgivers and innkeepers from the server's NPC flags. The bit table
follows AzerothCore UnitDefines.h NPCFlags.
MSG
```

### Task C2a (G2, part 1): Capabilities and warm catalogs

C2 is split in two (contract 0.4): C2a is the runtime side, C2b the nearby rows. C2a moves the lazy data loaders out of `runtime.ts` (472 of 500 non-blank lines, measured) into a sibling owned by C2 (contract 3.1 split rule).

**Files:**
- Create: `packages/core/src/wow/runtime-data.ts`
- Modify: `packages/core/src/wow/runtime.ts` (imports; `Runtimes`; delete `LazyState`, `loadCatalog`, `loadFactions`, `loadNavigation`; `createRuntimes`), `packages/core/src/wow/client-extras.ts` (`capabilities` body, `_rt` → `rt`)
- Test: `packages/core/src/wow/runtime-data.test.ts` (new), `packages/core/src/wow/client-extras.test.ts`

**Interfaces:**
- Consumes: C0's `Capabilities` and `extrasMethods`; existing `loadSpellCatalog`, `loadFactionTemplates`, `createNavigation`, `ignoreFailure`.
- Produces:
  - `runtime-data.ts`: `type LazyState = { disposed: boolean; catalogPromise?: Promise<void>; spellsLoaded?: boolean; factions?: FactionTemplateCatalog; factionPromise?: Promise<void>; navigation?: Navigation }`; `loadCatalog(config: SpellData, lazy: LazyState, combat: Pick<CombatRuntime, "setCatalog">): Promise<void>`; `loadFactions(config: SpellData, lazy: LazyState): Promise<void>`; `loadNavigation(config: NavigationData, lazy: LazyState): Navigation`; `warmCatalogs(config: SpellData, lazy: LazyState, combat: Pick<CombatRuntime, "setCatalog">): void`; `capabilitiesOf(config: Configured, lazy: LazyState): Capabilities`, where `SpellData = Pick<ClientConfig, "spellDataDir">`, `NavigationData = Pick<ClientConfig, "navigationDataDir" | "navigationLibrary">`, `Configured = NavigationData & Pick<ClientConfig, "jevApiKey">`.
  - `Runtimes.factions: () => FactionTemplateCatalog | undefined` (used by C2b) and `Runtimes.capabilities: () => Capabilities`.
  - `WorldHandle.capabilities()` returns `rt.capabilities()`: `factions` = faction catalog loaded, `spells` = spell catalog loaded, `navigation` = both navigation paths set, `jev` = Jev key set. Both catalog loads start when the runtimes are created if `spellDataDir` is set.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/wow/runtime-data.test.ts`:

```ts
import { afterEach, describe, expect, jest, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packDbc } from "#test-support/dbc";
import {
  capabilitiesOf,
  type LazyState,
  warmCatalogs,
} from "#wow/runtime-data";

const EMPTY_DBCS: [file: string, fields: number][] = [
  ["FactionTemplate.dbc", 14],
  ["Spell.dbc", 234],
  ["SpellRange.dbc", 40],
  ["SpellCastTimes.dbc", 4],
  ["SpellDuration.dbc", 4],
  ["SpellRadius.dbc", 4],
];
const dirs: string[] = [];

async function dataDir(files: [file: string, fields: number][]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "runtime-data-"));
  dirs.push(dir);
  await Promise.all(
    files.map(([file, fields]) => Bun.write(join(dir, file), packDbc(fields, []))),
  );
  return dir;
}

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })),
  );
});

describe("capabilitiesOf", () => {
  test("reports nothing when no data is configured or loaded", () => {
    expect(capabilitiesOf({}, { disposed: false })).toEqual({
      factions: false,
      spells: false,
      navigation: false,
      jev: false,
    });
  });

  test("navigation needs both paths and jev needs the key", () => {
    const lazy: LazyState = { disposed: false };
    expect(capabilitiesOf({ navigationDataDir: "d" }, lazy).navigation).toBe(false);
    const full = { jevApiKey: "k", navigationDataDir: "d", navigationLibrary: "l" };
    expect(capabilitiesOf(full, lazy)).toMatchObject({ jev: true, navigation: true });
  });
});

describe("warmCatalogs", () => {
  test("does nothing without a spell data dir", () => {
    const lazy: LazyState = { disposed: false };
    warmCatalogs({}, lazy, { setCatalog: jest.fn() });
    expect(lazy.catalogPromise).toBeUndefined();
    expect(lazy.factionPromise).toBeUndefined();
  });

  test("loads both catalogs at once and marks each one loaded", async () => {
    const lazy: LazyState = { disposed: false };
    const combat = { setCatalog: jest.fn() };
    warmCatalogs({ spellDataDir: await dataDir(EMPTY_DBCS) }, lazy, combat);
    await Promise.all([lazy.catalogPromise, lazy.factionPromise]);
    expect(capabilitiesOf({}, lazy)).toMatchObject({ factions: true, spells: true });
    expect(combat.setCatalog).toHaveBeenCalledTimes(1);
  });

  test("a missing spell file leaves spells unloaded and factions loaded", async () => {
    const lazy: LazyState = { disposed: false };
    const combat = { setCatalog: jest.fn() };
    const dir = await dataDir([["FactionTemplate.dbc", 14]]);
    warmCatalogs({ spellDataDir: dir }, lazy, combat);
    await lazy.factionPromise;
    await expect(lazy.catalogPromise).rejects.toThrow(/Spell\.dbc/);
    expect(capabilitiesOf({}, lazy)).toMatchObject({ factions: true, spells: false });
  });
});
```

In `packages/core/src/wow/client-extras.test.ts` replace the test "capabilities and getCreatureInfo are not implemented yet" with:

```ts
  test("capabilities come from the runtimes", () => {
    const flags = { factions: true, spells: false, navigation: true, jev: false };
    const conn = { events: createWorldEvents() } as unknown as WorldConn;
    const rt = { capabilities: () => flags } as unknown as Runtimes;
    expect(extrasMethods(conn, rt).capabilities()).toEqual(flags);
  });

  test("getCreatureInfo is not implemented yet", () => {
    const { methods } = extras();
    expect(() => methods.getCreatureInfo(1)).toThrow("not_implemented");
  });
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `mise test packages/core/src/wow/runtime-data.test.ts packages/core/src/wow/client-extras.test.ts`
Expected: FAIL. `runtime-data.test.ts` fails with `Cannot find module '#wow/runtime-data'`; "capabilities come from the runtimes" fails with `error: not_implemented`.

- [ ] **Step 3: Create `runtime-data.ts`**

```ts
import { ignoreFailure } from "#lib/ignore-failure";
import type { ClientConfig } from "#wow/client";
import type { Capabilities } from "#wow/client-extras";
import type { CombatRuntime } from "#wow/combat";
import {
  type FactionTemplateCatalog,
  loadFactionTemplates,
} from "#wow/faction-template";
import { createNavigation, type Navigation } from "#wow/navigation";
import { loadSpellCatalog } from "#wow/spell-catalog";

export type LazyState = {
  disposed: boolean;
  catalogPromise?: Promise<void>;
  spellsLoaded?: boolean;
  factions?: FactionTemplateCatalog;
  factionPromise?: Promise<void>;
  navigation?: Navigation;
};

type SpellData = Pick<ClientConfig, "spellDataDir">;
type NavigationData = Pick<
  ClientConfig,
  "navigationDataDir" | "navigationLibrary"
>;
type Configured = NavigationData & Pick<ClientConfig, "jevApiKey">;
type CatalogSink = Pick<CombatRuntime, "setCatalog">;

export function loadCatalog(
  config: SpellData,
  lazy: LazyState,
  combat: CatalogSink,
): Promise<void> {
  if (!config.spellDataDir)
    return Promise.reject(new Error("missing_spell_data"));
  lazy.catalogPromise ??= loadSpellCatalog(config.spellDataDir).then(
    (catalog) => {
      if (lazy.disposed) return;
      combat.setCatalog(catalog);
      lazy.spellsLoaded = true;
    },
  );
  return lazy.catalogPromise;
}

export function loadFactions(config: SpellData, lazy: LazyState): Promise<void> {
  if (!config.spellDataDir)
    return Promise.reject(new Error("missing_spell_data"));
  lazy.factionPromise ??= loadFactionTemplates(config.spellDataDir).then(
    (data) => {
      if (!lazy.disposed) lazy.factions = data;
    },
  );
  return lazy.factionPromise;
}

export function loadNavigation(
  config: NavigationData,
  lazy: LazyState,
): Navigation {
  if (!(config.navigationDataDir && config.navigationLibrary))
    throw new Error("missing_navigation");
  lazy.navigation ??= createNavigation({
    dataPath: config.navigationDataDir,
    libraryPath: config.navigationLibrary,
  });
  return lazy.navigation;
}

export function warmCatalogs(
  config: SpellData,
  lazy: LazyState,
  combat: CatalogSink,
): void {
  if (!config.spellDataDir) return;
  loadCatalog(config, lazy, combat).catch(ignoreFailure);
  loadFactions(config, lazy).catch(ignoreFailure);
}

export function capabilitiesOf(
  config: Configured,
  lazy: LazyState,
): Capabilities {
  return {
    factions: lazy.factions !== undefined,
    spells: lazy.spellsLoaded === true,
    navigation: Boolean(config.navigationDataDir && config.navigationLibrary),
    jev: Boolean(config.jevApiKey),
  };
}
```

- [ ] **Step 4: Use it from `runtime.ts`**

1. Delete the `LazyState` type and the functions `loadCatalog`, `loadFactions` and `loadNavigation` from `runtime.ts`.
2. Imports: remove `loadFactionTemplates` (keep `type FactionTemplateCatalog`), `createNavigation` (keep `type Navigation`, `type NavPoint`) and the `loadSpellCatalog` import; add

```ts
import type { Capabilities } from "#wow/client-extras";
import {
  capabilitiesOf,
  type LazyState,
  loadCatalog,
  loadFactions,
  loadNavigation,
  warmCatalogs,
} from "#wow/runtime-data";
```

3. Add to `Runtimes`, after `prepareCatalog: () => Promise<void>;`:

```ts
  factions: () => FactionTemplateCatalog | undefined;
  capabilities: () => Capabilities;
```

4. In `createRuntimes`, after `const prepareCatalog = …;` add `warmCatalogs(config, lazy, combat);`, and add to the returned object after `prepareCatalog,`:

```ts
    factions: () => lazy.factions,
    capabilities: () => capabilitiesOf(config, lazy),
```

- [ ] **Step 5: Implement `capabilities` in `client-extras.ts`**

Rename the parameter `_rt` to `rt` and replace the `capabilities` entry with:

```ts
    capabilities() {
      return rt.capabilities();
    },
```

- [ ] **Step 6: Run the tests and see them pass**

Run: `mise test packages/core/src/wow/runtime-data.test.ts packages/core/src/wow/client-extras.test.ts packages/core/src/wow/gameplay-lifecycle.test.ts`
Expected: PASS. `gameplay-lifecycle.test.ts:299-302` spies `loadSpellCatalog` and `loadFactionTemplates`; the loads now also start at runtime creation. If a test there fails because its spy is set after the session starts, stop and report to the coordinator (that file has no core-a owner).

- [ ] **Step 7: Run the full gate and the live gate**

Run: `rg -c -v '^\s*$' packages/core/src/wow/runtime.ts` (expected: at most 500), then `mise format:fix && mise lint:fix && mise ci`, then live gate L.
Expected: all checks pass; every live test passes (the fight tests exercise the faction catalog now loaded at start).

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/wow/runtime-data.ts packages/core/src/wow/runtime-data.test.ts packages/core/src/wow/runtime.ts packages/core/src/wow/client-extras.ts packages/core/src/wow/client-extras.test.ts
```

```bash
mise exec -- git commit -F - <<'MSG'
feat: Report loaded data as capabilities

Nearby rows need the faction catalog before the first fight, and the
harness must tell "no data" from "not loaded yet", so both catalogs
start loading with the runtimes and capabilities() reports what loaded.
The loaders move to runtime-data.ts to keep runtime.ts under the cap.
Live gate L passed.
MSG
```

### Task C2b (G2, part 2): Relation, attackable, attackingMe and targetOf on nearby rows

**Files:**
- Modify: `packages/core/src/wow/nearby.ts` (imports, new `standing`, `targetOf`, `traits` signature, row call), `packages/core/src/wow/client-control.ts` (`queryNearby` method only, lines 237-248), `packages/core/test-support/mock-handle.ts` (the `queryNearby` block only)
- Test: `packages/core/src/wow/nearby.test.ts`, `packages/core/src/wow/client-control.test.ts`, `packages/core/test-support/mock-handle.test.ts`

**Interfaces:**
- Consumes: C0's `NearbyUnits` and `NearbySources.units`; C2a's `Runtimes.factions`; C4's `lootFlags`; C3's `npcRoles`; existing `targetRelation(deps: { entity: EntityLookup; factions: () => FactionTemplateCatalog | undefined }, guid: bigint, selfGuid: bigint): FactionRelation` (`combat-actions-target.ts:58`); `CombatRuntime.isAttackingSelf(guid: bigint): boolean`; `UnitFlag` (`protocol/entity-fields.ts:81`).
- Produces: for rows of units other than self, when `units` is given: `relation = units.relation(guid)`, `attackable` = alive (`health > 0`) and relation `hostile` or `neutral` and no `ATTACK_BLOCK` unit flag, `attackingMe = units.attackingMe(guid)`. Self, game objects and a missing `units` give `"unknown"`, `false`, `false`. `targetOf` = the unit's `target`, `undefined` for `0n` and non-units. The real handle and the mock both pass `units`; the mock's `attackingMe` reads `getCombatState().attackers`, and its relation is `"unknown"`.

- [ ] **Step 1: Write the failing tests**

In `packages/core/src/wow/nearby.test.ts` add `import type { FactionRelation } from "#wow/faction-template";`, add `UnitFlag` to the `#wow/protocol/entity-fields` import, add `type NearbyUnits` to the `#wow/nearby` import, and append:

```ts
describe("unit standing", () => {
  const relations = new Map<bigint, FactionRelation>([
    [2n, "hostile"],
    [3n, "friendly"],
    [4n, "neutral"],
    [5n, "hostile"],
  ]);
  const units: NearbyUnits = {
    attackingMe: (guid) => guid === 2n,
    relation: (guid) => relations.get(guid) ?? "unknown",
  };
  const standing = [
    unit(2n, { target: SELF }),
    unit(3n, { position: at(2, 0) }),
    unit(4n, { position: at(3, 0), unitFlags: UnitFlag.NOT_SELECTABLE }),
    unit(5n, { health: 0, position: at(4, 0) }),
  ];

  test("fills relation, attackable, attackingMe and targetOf from the units source", () => {
    const rows = queryNearby({ ...sources(pose(0, 0), standing), units });
    expect(
      rows.map((row) => [row.relation, row.attackable, row.attackingMe, row.targetOf]),
    ).toEqual([
      ["hostile", true, true, SELF],
      ["friendly", false, false, undefined],
      ["neutral", false, false, undefined],
      ["hostile", false, false, undefined],
    ]);
  });

  test("without a units source every relation stays unknown, never neutral", () => {
    const [row] = queryNearby(sources(pose(0, 0), [unit(2n, { target: SELF })]));
    expect(row).toMatchObject({
      attackable: false,
      attackingMe: false,
      relation: "unknown",
      targetOf: SELF,
    });
  });

  test("the self row and game objects keep neutral standing", () => {
    const post = { ...entity(9n, at(5, 0)), objectType: ObjectType.GAMEOBJECT };
    const always: NearbyUnits = {
      attackingMe: () => true,
      relation: () => "hostile",
    };
    const rows = queryNearby({
      ...sources(pose(0, 0), [unit(SELF, { position: at(0, 0) }), post]),
      units: always,
    });
    expect(
      rows.map((row) => [row.self, row.relation, row.attackable, row.attackingMe]),
    ).toEqual([
      [true, "unknown", false, false],
      [false, "unknown", false, false],
    ]);
  });
});
```

Append to `packages/core/src/wow/client-control.test.ts` (add imports `EntityStore` from `#wow/entity-store`, `FactionTemplateCatalog` type from `#wow/faction-template`, `ObjectType` from `#wow/protocol/entity-fields`):

```ts
describe("queryNearby units", () => {
  test("passes faction relation and incoming attackers to the rows", () => {
    const control = setup();
    const entityStore = new EntityStore();
    const spot = { mapId: 530, orientation: 0, y: -6671.76, z: 70.34 };
    entityStore.create(0x07_64n, ObjectType.PLAYER, {
      health: 100,
      position: { ...spot, x: 8709.46 },
    });
    entityStore.create(0x99n, ObjectType.UNIT, {
      health: 50,
      position: { ...spot, x: 8712 },
    });
    const factions = {
      relation: () => "hostile",
    } as unknown as FactionTemplateCatalog;
    const rt = {
      combat: {
        isAttackingSelf: (guid: bigint) => guid === 0x99n,
        observedPosition: () => undefined,
      },
      control: control.runtime,
      factions: () => factions,
    } as unknown as Runtimes;
    const conn = {
      entityStore,
      remoteMotion: { all: () => [] },
    } as unknown as WorldConn;
    const rows = controlMethods(conn, rt).queryNearby();
    const row = must(rows.find((candidate) => candidate.entity.guid === 0x99n));
    expect(row).toMatchObject({
      attackable: true,
      attackingMe: true,
      relation: "hostile",
    });
  });
});
```

Append to `packages/core/test-support/mock-handle.test.ts`:

```ts
test("mock queryNearby marks attackers from the combat state", () => {
  const handle = createMockHandle();
  const npc = {
    class_: 0,
    displayId: 0,
    entry: 1,
    factionTemplate: 0,
    gender: 0,
    guid: 7n,
    health: 100,
    level: 1,
    maxHealth: 100,
    maxPower: [],
    name: "Wolf",
    npcFlags: 0,
    objectType: ObjectType.UNIT,
    position: undefined,
    power: [],
    race: 0,
    rawFields: new Map(),
    scale: 1,
    target: 0n,
    unitFlags: 0,
  } satisfies UnitEntity;
  const base = handle.getCombatState();
  handle.getNearbyEntities = () => [npc];
  handle.getCombatState = () => ({ ...base, attackers: [7n] });
  expect(handle.queryNearby()[0]).toMatchObject({
    attackingMe: true,
    relation: "unknown",
  });
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `mise test packages/core/src/wow/nearby.test.ts packages/core/src/wow/client-control.test.ts packages/core/test-support/mock-handle.test.ts`
Expected: FAIL. "fills relation…" fails with `expected [["hostile", true, true, 1n], …] but received [["unknown", false, false, undefined], …]`; "passes faction relation…" fails on `relation: "hostile"` (received `"unknown"`); the mock test fails on `attackingMe: true`.

- [ ] **Step 3: Implement in `nearby.ts`**

Change the imports to include `import { UNIT_FIELDS, UnitFlag } from "#wow/protocol/entity-fields";`. Add before `traits`:

```ts
const ATTACK_BLOCK =
  UnitFlag.NON_ATTACKABLE |
  UnitFlag.PLAYER_CONTROLLED |
  UnitFlag.NOT_ATTACKABLE_1 |
  UnitFlag.IMMUNE_TO_PC |
  UnitFlag.NON_ATTACKABLE_2 |
  UnitFlag.TAXI_FLIGHT |
  UnitFlag.NOT_SELECTABLE;

type Standing = Pick<NearbyRow, "relation" | "attackable" | "attackingMe">;

function standing(
  entity: Entity,
  self: boolean,
  units: NearbyUnits | undefined,
): Standing {
  if (self || !(units && isUnit(entity)))
    return { relation: "unknown", attackable: false, attackingMe: false };
  const relation = units.relation(entity.guid);
  const open = (entity.unitFlags & ATTACK_BLOCK) === 0;
  const opposed = relation === "hostile" || relation === "neutral";
  const attackable = entity.health > 0 && open && opposed;
  return { relation, attackable, attackingMe: units.attackingMe(entity.guid) };
}

function targetOf(entity: Entity): bigint | undefined {
  return isUnit(entity) && entity.target !== 0n ? entity.target : undefined;
}
```

Replace `traits` with:

```ts
function traits(
  entity: Entity,
  self: boolean,
  units: NearbyUnits | undefined,
): Traits {
  return {
    ...standing(entity, self, units),
    targetOf: targetOf(entity),
    roles: isUnit(entity) ? npcRoles(entity.npcFlags) : [],
    ...lootFlags(entity),
  };
}
```

In `queryNearby` change `...traits(entity),` to `...traits(entity, isSelf, sources.units),`.

- [ ] **Step 4: Pass `units` from the real handle**

In `client-control.ts` add `import { targetRelation } from "#wow/combat-actions-target";` and change `import { queryNearby } from "#wow/nearby";` to `import { type NearbyUnits, queryNearby } from "#wow/nearby";`. Replace the `queryNearby` method with:

```ts
    queryNearby(query) {
      const state = control.snapshot();
      const entity = (guid: bigint) => conn.entityStore.get(guid);
      const deps = { entity, factions: rt.factions };
      const units: NearbyUnits = {
        relation: (guid) => targetRelation(deps, guid, state.selfGuid),
        attackingMe: (guid) => rt.combat.isAttackingSelf(guid),
      };
      return queryNearby(
        {
          control: state,
          entities: conn.entityStore.all(),
          now: Date.now(),
          observedPosition: (guid) => rt.combat.observedPosition(guid),
          remotePoses: conn.remoteMotion.all(),
          units,
        },
        query,
      );
    },
```

- [ ] **Step 5: Pass `units` from the mock**

In `packages/core/test-support/mock-handle.ts`, the `queryNearby` block becomes:

```ts
    queryNearby: jest.fn((query?: NearbyQuery) =>
      queryNearby(
        {
          control: handle.getControlState(),
          entities: handle.getNearbyEntities(),
          now: Date.now(),
          observedPosition: (guid) => combat.observedPosition(guid),
          remotePoses: handle.getRemotePoses(),
          units: {
            attackingMe: (guid) =>
              handle.getCombatState().attackers.includes(guid),
            relation: () => "unknown",
          },
        },
        query,
      ),
    ),
```

- [ ] **Step 6: Run the tests and see them pass**

Run: `mise test packages/core/src/wow/nearby.test.ts packages/core/src/wow/client-control.test.ts packages/core/test-support/mock-handle.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the full gate**

Run: `mise format:fix && mise lint:fix && mise ci`
Expected: all checks pass. `nearby` and `nearby --json` output is unchanged (the daemon formats rows field by field, `packages/cli/src/daemon/nearby.ts:116`). C2a's live gate covers the runtime change; this task changes only how rows are computed.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/wow/nearby.ts packages/core/src/wow/nearby.test.ts packages/core/src/wow/client-control.ts packages/core/src/wow/client-control.test.ts packages/core/test-support/mock-handle.ts packages/core/test-support/mock-handle.test.ts
```

```bash
mise exec -- git commit -F - <<'MSG'
feat: Add unit relation to nearby rows

look, the [now] line and the engage guard must tell hostile, neutral
and friendly units apart and see who attacks whom. Without faction data
the relation stays unknown, never neutral, so the harness does not
attack on a guess.
MSG
```

### Task C9 (G9): Creature query details

**Files:**
- Create: `packages/core/test-support/creature-query-fixtures.ts`
- Modify: `packages/core/src/wow/protocol/entity-queries.ts:10-24`, `packages/core/src/wow/world-handlers-entity.ts` (imports; `handleCreatureQueryResponse` at line 224), `packages/core/src/wow/world-conn.ts` (one optional field), `packages/core/src/wow/client-extras.ts` (`getCreatureInfo` body)
- Test: `packages/core/src/wow/protocol/entity-queries.test.ts`, `packages/core/src/wow/client-extras.test.ts`

**Interfaces:**
- Consumes: C0's `CreatureInfo`, `CreatureRank`, `extrasMethods`; C2a's `rt` parameter name in `extrasMethods`.
- Produces:
  - `protocol/entity-queries.ts`: `type CreatureDetails = { subName: string; creatureType: number; family: number; rank: number }`; `CreatureQueryResult = { entry: number; name: string | undefined; details: CreatureDetails | undefined }`. Wire order (3.3.5, `wow_messages/wow_message_parser/wowm/world/queries/smsg_creature_query_response.wowm:60-90`, read): `u32 entry` (bit 31 = not found), `name1..name4`, `sub_name`, `description` (all CString), `u32 type_flags`, `u32 creature_type`, `u32 family`, `u32 rank`, then fields this parser does not read. `details` is `undefined` for a masked entry and for a packet that ends before `rank`.
  - `WorldConn.creatureInfoCache?: Map<number, CreatureInfo>`.
  - `WorldHandle.getCreatureInfo(entry)`: the cached `CreatureInfo`, `undefined` before the answer. Rank codes (`SharedDefines.h:2964-2968`, read): 0 `normal`, 1 `elite`, 2 `rare_elite`, 3 `boss`, 4 `rare`; any other code reads as `normal`. An empty `subName` reads as `undefined`. The name cache and entity naming do not change.
  - Test support: `creatureQueryResponse(answer: CreatureAnswer): Uint8Array` with `CreatureAnswer = { entry: number; name: string; subName: string; creatureType: number; family: number; rank: number }`.

- [ ] **Step 1: Write the test fixture and the failing tests**

Create `packages/core/test-support/creature-query-fixtures.ts`:

```ts
import { PacketWriter } from "#wow/protocol/packet";

export type CreatureAnswer = {
  entry: number;
  name: string;
  subName: string;
  creatureType: number;
  family: number;
  rank: number;
};

const TAIL_WORDS = 15;

export function creatureQueryResponse(answer: CreatureAnswer): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(answer.entry);
  w.cString(answer.name);
  for (let i = 0; i < 3; i++) w.cString("");
  w.cString(answer.subName);
  w.cString("");
  w.uint32LE(0);
  w.uint32LE(answer.creatureType);
  w.uint32LE(answer.family);
  w.uint32LE(answer.rank);
  for (let i = 0; i < TAIL_WORDS; i++) w.uint32LE(0);
  w.uint8(0);
  return w.finish();
}
```

Append to the `describe("creature query", …)` block of `packages/core/src/wow/protocol/entity-queries.test.ts` (add `import { creatureQueryResponse } from "#test-support/creature-query-fixtures";`):

```ts
  test("parseCreatureQueryResponse keeps subName, type, family and rank", () => {
    const packet = creatureQueryResponse({
      entry: 15366,
      name: "Springpaw Stalker",
      subName: "Pack Leader",
      creatureType: 1,
      family: 2,
      rank: 1,
    });
    expect(parseCreatureQueryResponse(new PacketReader(packet))).toEqual({
      entry: 15366,
      name: "Springpaw Stalker",
      details: { subName: "Pack Leader", creatureType: 1, family: 2, rank: 1 },
    });
  });

  test("a response cut after the names keeps the name and no details", () => {
    const w = new PacketWriter();
    w.uint32LE(1234);
    w.cString("Stormwind Guard");
    expect(parseCreatureQueryResponse(new PacketReader(w.finish()))).toEqual({
      entry: 1234,
      name: "Stormwind Guard",
      details: undefined,
    });
  });
```

In `packages/core/src/wow/client-extras.test.ts` add imports `creatureQueryResponse` from `#test-support/creature-query-fixtures`, `EntityStore` from `#wow/entity-store`, `PacketReader, PacketWriter` from `#wow/protocol/packet` and `handleCreatureQueryResponse` from `#wow/world-handlers-entity`, add this helper at module level after `extras()`:

```ts
function creatureConn(): WorldConn {
  return {
    creatureNameCache: new Map(),
    entityStore: new EntityStore(),
    events: createWorldEvents(),
    pendingNameQueries: new Set(),
  } as unknown as WorldConn;
}
```

and replace the test "getCreatureInfo is not implemented yet" with:

```ts
  test("getCreatureInfo returns the cached creature query answer by entry", () => {
    const conn = creatureConn();
    const methods = extrasMethods(conn, {} as Runtimes);
    expect(methods.getCreatureInfo(15366)).toBeUndefined();
    const packet = creatureQueryResponse({
      entry: 15366,
      name: "Springpaw Stalker",
      subName: "Pack Leader",
      creatureType: 1,
      family: 2,
      rank: 2,
    });
    handleCreatureQueryResponse(conn, new PacketReader(packet));
    expect(methods.getCreatureInfo(15366)).toEqual({
      entry: 15366,
      name: "Springpaw Stalker",
      subName: "Pack Leader",
      creatureType: 1,
      family: 2,
      rank: "rare_elite",
    });
  });

  test("an empty subName reads as undefined and an unknown rank as normal", () => {
    const conn = creatureConn();
    const packet = creatureQueryResponse({
      entry: 3,
      name: "Wolf",
      subName: "",
      creatureType: 1,
      family: 1,
      rank: 9,
    });
    handleCreatureQueryResponse(conn, new PacketReader(packet));
    expect(extrasMethods(conn, {} as Runtimes).getCreatureInfo(3)).toMatchObject(
      { rank: "normal", subName: undefined },
    );
  });

  test("a response cut after the names keeps the name and caches no info", () => {
    const conn = creatureConn();
    const w = new PacketWriter();
    w.uint32LE(1234);
    w.cString("Stormwind Guard");
    handleCreatureQueryResponse(conn, new PacketReader(w.finish()));
    expect(conn.creatureNameCache.get(1234)).toBe("Stormwind Guard");
    expect(extrasMethods(conn, {} as Runtimes).getCreatureInfo(1234)).toBeUndefined();
  });
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `mise test packages/core/src/wow/protocol/entity-queries.test.ts packages/core/src/wow/client-extras.test.ts`
Expected: FAIL. The parser tests fail because the result has no `details` key (`expected { entry, name, details: {…} } but received { entry: 15366, name: "Springpaw Stalker" }`); the `getCreatureInfo` tests fail with `error: not_implemented`.

- [ ] **Step 3: Parse the details**

Replace `CreatureQueryResult` and `parseCreatureQueryResponse` in `protocol/entity-queries.ts`:

```ts
export type CreatureDetails = {
  subName: string;
  creatureType: number;
  family: number;
  rank: number;
};

export type CreatureQueryResult = {
  entry: number;
  name: string | undefined;
  details: CreatureDetails | undefined;
};

const DETAIL_BYTES = 16;

export function parseCreatureQueryResponse(
  r: PacketReader,
): CreatureQueryResult {
  const raw = r.uint32LE();
  const masked = raw & 0x80_00_00_00;
  const entry = raw & 0x7f_ff_ff_ff;
  if (masked) return { entry, name: undefined, details: undefined };
  const name = r.cString();
  for (let i = 0; i < 3; i++) r.cString();
  const subName = r.cString();
  r.cString();
  if (r.remaining < DETAIL_BYTES) return { entry, name, details: undefined };
  r.uint32LE();
  const creatureType = r.uint32LE();
  const family = r.uint32LE();
  const rank = r.uint32LE();
  return { entry, name, details: { subName, creatureType, family, rank } };
}
```

- [ ] **Step 4: Cache the info and serve it**

`world-conn.ts`: add `import type { CreatureInfo } from "#wow/client-extras";` and, as the last member of `WorldConn`:

```ts
  creatureInfoCache?: Map<number, CreatureInfo>;
```

`world-handlers-entity.ts`: add `import type { CreatureInfo, CreatureRank } from "#wow/client-extras";`, add `type CreatureQueryResult` to the `#wow/protocol/entity-queries` import, and add before `handleCreatureQueryResponse`:

```ts
const RANKS: CreatureRank[] = ["normal", "elite", "rare_elite", "boss", "rare"];

function cacheCreatureInfo(conn: WorldConn, result: CreatureQueryResult): void {
  const { entry, name, details } = result;
  if (!(name && details)) return;
  const { subName, creatureType, family, rank } = details;
  const info: CreatureInfo = {
    entry,
    name,
    subName: subName === "" ? undefined : subName,
    creatureType,
    family,
    rank: RANKS[rank] ?? "normal",
  };
  (conn.creatureInfoCache ??= new Map()).set(entry, info);
}
```

In `handleCreatureQueryResponse`, add `cacheCreatureInfo(conn, result);` directly after `if (!result.name) return;`.

`client-extras.ts`: replace the `getCreatureInfo` entry with:

```ts
    getCreatureInfo(entry) {
      return conn.creatureInfoCache?.get(entry);
    },
```

- [ ] **Step 5: Run the tests and see them pass**

Run: `mise test packages/core/src/wow/protocol/entity-queries.test.ts packages/core/src/wow/client-extras.test.ts packages/core/src/wow/world-handlers-entity-queries.test.ts packages/core/src/wow/world-handlers-entity-lifecycle.test.ts`
Expected: PASS. The two integration files inject a name-only creature answer; they still name the entity.

- [ ] **Step 6: Run the full gate and the live gate**

Run: `mise format:fix && mise lint:fix && mise ci`, then live gate L.
Expected: all checks pass; every live test passes (live creature names still resolve, so the new parser reads real 3.3.5 answers).

- [ ] **Step 7: Commit**

```bash
git add packages/core/test-support/creature-query-fixtures.ts packages/core/src/wow/protocol/entity-queries.ts packages/core/src/wow/protocol/entity-queries.test.ts packages/core/src/wow/world-handlers-entity.ts packages/core/src/wow/world-conn.ts packages/core/src/wow/client-extras.ts packages/core/src/wow/client-extras.test.ts
```

```bash
mise exec -- git commit -F - <<'MSG'
feat: Keep creature rank and type details

The harness footer shows a rank badge and round-2 glyphs need the
creature type and family; the creature query answer carried them but
the parser dropped them. A short answer still names the creature.
Live gate L passed.
MSG
```

### Task C11 (G11): Item class, subclass and use spells on labels

**Files:**
- Modify: `packages/core/src/wow/item-labels.ts` (`itemKind` body), `packages/core/src/wow/item-use.ts:59-70` (`ItemTemplates.label`)
- Modify (docs, contract issue 10): `docs/manual.md:842-844,951-952`, `.claude/skills/tuicraft/SKILL.md:398,459`
- Test: `packages/core/src/wow/item-labels.test.ts`, `packages/core/src/wow/item-use.test.ts`

**Interfaces:**
- Consumes: C0's `ItemLabel` optional fields, `ItemKind`, `itemKind` signature; existing `ItemTemplate` (`protocol/item.ts:19-27`) and `ItemSpellTrigger.ON_USE = 0`.
- Produces: `ItemTemplates.label(entry)` returns `{ name, quality, itemClass, subclass, useSpellIds }` for an answered template (`useSpellIds` = ids of spells with trigger `ON_USE`, in template order) and `{ name: null, quality: null }` otherwise. `itemKind(label)`: class 0 subclass 5 → `"food_drink"`, class 0 subclass 1 → `"potion"`, else `"other"` (AzerothCore `ItemTemplate.h:291,314-319`, read: `ITEM_CLASS_CONSUMABLE = 0`, `ITEM_SUBCLASS_POTION = 1`, `ITEM_SUBCLASS_FOOD = 5`). `inventory --json`, `loot --json` and `vendor --json` items gain the three keys once the template is answered.

- [ ] **Step 1: Write the failing tests**

In `packages/core/src/wow/item-labels.test.ts`, change the expectation at line 36 to:

```ts
    expect(f.templates.label(858)).toEqual({
      name: "Lesser Healing Potion",
      quality: 1,
      itemClass: 0,
      subclass: 1,
      useSpellIds: [440],
    });
```

and replace the C0 `describe("itemKind", …)` block with:

```ts
describe("itemKind", () => {
  test("classes consumables by subclass", () => {
    const label = { name: "x", quality: 1 };
    expect(itemKind({ ...label, itemClass: 0, subclass: 5 })).toBe("food_drink");
    expect(itemKind({ ...label, itemClass: 0, subclass: 1 })).toBe("potion");
    expect(itemKind({ ...label, itemClass: 0, subclass: 4 })).toBe("other");
    expect(itemKind({ ...label, itemClass: 2, subclass: 5 })).toBe("other");
  });

  test("an unanswered label is other", () => {
    expect(itemKind({ name: null, quality: null })).toBe("other");
  });
});
```

Append to `packages/core/src/wow/item-use.test.ts`:

```ts
test("a known template labels class, subclass and only its on-use spells", () => {
  const templates = new ItemTemplates({ send: () => {} });
  templates.receive({ entry: 2687, template: ribs });
  expect(templates.label(2687)).toEqual({
    name: "Dry Pork Ribs",
    quality: 1,
    itemClass: 0,
    subclass: 5,
    useSpellIds: [5005],
  });
});
```

(`ribs` has spell 99 with trigger 1 and spell 5005 with trigger 0, read at `item-use.test.ts:11-35`.)

- [ ] **Step 2: Run the tests and see them fail**

Run: `mise test packages/core/src/wow/item-labels.test.ts packages/core/src/wow/item-use.test.ts`
Expected: FAIL. The label tests fail with `expected {…, itemClass: 0, subclass: 1, useSpellIds: [440]} but received { name: "Lesser Healing Potion", quality: 1 }`; the `itemKind` tests fail with `error: not_implemented`.

- [ ] **Step 3: Implement `itemKind`**

Replace the C0 `itemKind` in `item-labels.ts`:

```ts
const CONSUMABLE = 0;
const POTION = 1;
const FOOD_DRINK = 5;

export function itemKind(label: ItemLabel): ItemKind {
  if (label.itemClass !== CONSUMABLE) return "other";
  if (label.subclass === FOOD_DRINK) return "food_drink";
  if (label.subclass === POTION) return "potion";
  return "other";
}
```

- [ ] **Step 4: Fill the label**

In `item-use.ts` replace `label`:

```ts
  label(entry: number | undefined): ItemLabel {
    if (entry === undefined || entry === 0)
      return { name: null, quality: null };
    if (this.known.has(entry)) {
      const template = this.known.get(entry);
      return template ? templateLabel(template) : { name: null, quality: null };
    }
    if (!this.waiting.has(entry)) this.lookup(entry).catch(ignoreFailure);
    return { name: null, quality: null };
  }
```

and add after the class:

```ts
function templateLabel(template: ItemTemplate): ItemLabel {
  const { name, quality, itemClass, subclass, spells } = template;
  const useSpellIds = spells
    .filter((spell) => spell.trigger === ItemSpellTrigger.ON_USE)
    .map((spell) => spell.id);
  return { name, quality, itemClass, subclass, useSpellIds };
}
```

- [ ] **Step 5: Document the new JSON keys**

`docs/manual.md` lines 842–844 become:

```
inventory slot items and loot items carry `name` and `quality` (the server's
0–7 quality code) next to `entry`/`itemId`; both stay `null` until answered or
when the server has no such item. An answered item also carries `itemClass`,
`subclass` and `useSpellIds` (the IDs of its on-use spells).
```

`docs/manual.md` lines 951–952 become:

```
item has `slot`, `itemId`, `name`, `quality`, `price`, `stock` (`null` when
unlimited), `buyCount`, `maxDurability`, `displayId` and `extendedCost`, and
`itemClass`, `subclass` and `useSpellIds` once the item template is answered.
```

`.claude/skills/tuicraft/SKILL.md` line 398: after the sentence that ends "beside `entry`/`itemId`." insert ` Answered items also carry `itemClass`, `subclass` and `useSpellIds` (on-use spell IDs).` Line 459: replace the sentence that starts "JSON goods have" with: JSON goods have `slot`, `itemId`, `name`, `quality`, `price`, `stock` (`null` = unlimited), `buyCount`, `maxDurability`, and `itemClass`, `subclass`, `useSpellIds` once the template is answered.

- [ ] **Step 6: Run the tests and see them pass**

Run: `mise test packages/core/src/wow/item-labels.test.ts packages/core/src/wow/item-use.test.ts packages/cli/src/daemon/commands-vendor.test.ts packages/cli/src/ui/format-gameplay.test.ts`
Expected: PASS (the CLI files use literal labels, so they do not change).

- [ ] **Step 7: Run the full gate and the live gate**

Run: `mise format:fix && mise lint:fix && mise ci`, then live gate L. Before deleting the accounts, check the JSON with the account 2 wrapper:

```bash
TC="$(jq -r .wrapper tmp/live-2.json)"
"$TC" start
"$TC" read --wait 5 > /dev/null
"$TC" inventory --json | jq '[.data.slots[] | select(.status == "occupied") | .item | {name, itemClass, subclass, useSpellIds}] | .[0:5]'
"$TC" stop
```

Expected: the live suite passes; answered items show numeric `itemClass` and `subclass` and a `useSpellIds` array (a consumable such as a potion or food has one id). An item whose template is still unanswered shows `null` names and no class keys; run `inventory --json` again after a few seconds to see it answered.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/wow/item-labels.ts packages/core/src/wow/item-labels.test.ts packages/core/src/wow/item-use.ts packages/core/src/wow/item-use.test.ts docs/manual.md .claude/skills/tuicraft/SKILL.md
```

```bash
mise exec -- git commit -F - <<'MSG'
feat: Label items with class and use spells

rest must find food and drink and confirm the Food/Drink aura by its
spell id, and journal bags names consumables; the item template had the
class, subclass and spells but the label kept only name and quality.
Live gate L passed.
MSG
```

### Task C10 (G10): NYI notices as typed events

**Starts after:** core-b's C6b is on `epic/pi-harness` (both tasks edit `protocol/stubs.ts` and `client-handlers.ts`; contract issue 12). Pull first and confirm with `git log --oneline -- packages/core/src/wow/protocol/stubs.ts`.

**Files:**
- Modify: `packages/core/src/wow/protocol/stubs.ts` (`registerStubs`), `packages/core/src/wow/client-handlers.ts` (`registerWorldHandlers`), `packages/cli/src/daemon/server.ts` (`startDaemonServer`), `packages/cli/src/ui/tui.ts` (`subscribeEvents`)
- Modify (test outside 3.1, contract issue 11): `packages/core/src/wow/world-handlers-chat.test.ts` (the test "stubbed opcode notifies via onMessage")
- Test: `packages/core/src/wow/protocol/stubs.test.ts`, `packages/core/src/wow/client-handlers.test.ts`, `packages/cli/src/daemon/server.test.ts` (new), `packages/cli/src/ui/tui-session.test.ts`

**Interfaces:**
- Consumes: C0's `NoticeEvent`, `WorldEvents.notice`, `WorldHandle.onNotice`, mock `triggerNotice`; existing `onChatMessage(msg, events, log)` (`packages/cli/src/daemon/events.ts:90`) and `formatMessage` (`packages/cli/src/ui/format-chat.ts:40`).
- Produces:
  - `protocol/stubs.ts`: `type StubNotice = { opcode: number; label: string; text: string }`; `registerStubs(dispatch: OpcodeDispatch, notify: (notice: StubNotice) => boolean): void`. `text` is `[tuicraft] <label> is not yet implemented`, as before.
  - A stubbed opcode emits `NoticeEvent { type: "not_implemented", opcode, label, text, at: Date.now() }` on `conn.events.notice` and no chat message. Delivery keeps the old rule: once per opcode, counted only when `notice` has a subscriber, so a packet that nobody hears is retried on the next one.
  - The daemon and the TUI subscribe `onNotice` and print the same line as before: `[system] [tuicraft] <label> is not yet implemented` in `read`/TUI, and a `SYSTEM` chat object in `read --json` and the session log.

- [ ] **Step 1: Write the failing tests**

In `packages/core/src/wow/protocol/stubs.test.ts`, change the three `registerStubs` callbacks that collect messages to collect `notice.text`, and add a shape test:

```ts
  test("notifies on first receipt only", () => {
    const d = new OpcodeDispatch();
    const messages: string[] = [];
    registerStubs(d, (notice) => {
      messages.push(notice.text);
      return true;
    });

    d.handle(GameOpcode.SMSG_WEATHER, new PacketReader(new Uint8Array(0)));
    d.handle(GameOpcode.SMSG_WEATHER, new PacketReader(new Uint8Array(0)));

    const matching = messages.filter((m) => m.includes("Weather"));
    expect(matching).toHaveLength(1);
  });

  test("retries notification when notify returns false", () => {
    const d = new OpcodeDispatch();
    const messages: string[] = [];
    let ready = false;
    registerStubs(d, (notice) => {
      if (!ready) return false;
      messages.push(notice.text);
      return true;
    });

    d.handle(GameOpcode.SMSG_WEATHER, new PacketReader(new Uint8Array(0)));
    expect(messages).toHaveLength(0);

    ready = true;
    d.handle(GameOpcode.SMSG_WEATHER, new PacketReader(new Uint8Array(0)));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("Weather");

    d.handle(GameOpcode.SMSG_WEATHER, new PacketReader(new Uint8Array(0)));
    expect(messages).toHaveLength(1);
  });

  test("the notice names the opcode, the label and the old text", () => {
    const d = new OpcodeDispatch();
    const notices: StubNotice[] = [];
    registerStubs(d, (notice) => {
      notices.push(notice);
      return true;
    });
    d.handle(GameOpcode.SMSG_WEATHER, new PacketReader(new Uint8Array(0)));
    expect(notices).toEqual([
      {
        opcode: GameOpcode.SMSG_WEATHER,
        label: "Weather change",
        text: "[tuicraft] Weather change is not yet implemented",
      },
    ]);
  });
```

(Import `type StubNotice` with `registerStubs`. The "registers" and "skips" tests pass `() => true` and need no change.)

Append to `packages/core/src/wow/client-handlers.test.ts` (imports: `createWorldEvents` from `#wow/world-events`, `type NoticeEvent` from `#wow/client-extras`):

```ts
function stubConn(): WorldConn {
  const conn = {
    dispatch: new OpcodeDispatch(),
    events: createWorldEvents(),
  } as unknown as WorldConn;
  registerWorldHandlers(conn);
  return conn;
}

function weather(): PacketReader {
  return new PacketReader(new Uint8Array(0));
}

describe("stub notices", () => {

  test("a stubbed opcode emits a notice, not a chat line", () => {
    const conn = stubConn();
    const chat: string[] = [];
    const notices: NoticeEvent[] = [];
    conn.events.message.subscribe((msg) => chat.push(msg.message));
    conn.events.notice.subscribe((event) => notices.push(event));
    conn.dispatch.handle(GameOpcode.SMSG_WEATHER, weather());
    expect(chat).toEqual([]);
    expect(notices).toMatchObject([
      {
        type: "not_implemented",
        opcode: GameOpcode.SMSG_WEATHER,
        label: "Weather change",
        text: "[tuicraft] Weather change is not yet implemented",
      },
    ]);
  });

  test("a notice with no subscriber is retried on the next packet", () => {
    const conn = stubConn();
    conn.dispatch.handle(GameOpcode.SMSG_WEATHER, weather());
    const notices: NoticeEvent[] = [];
    conn.events.notice.subscribe((event) => notices.push(event));
    conn.dispatch.handle(GameOpcode.SMSG_WEATHER, weather());
    conn.dispatch.handle(GameOpcode.SMSG_WEATHER, weather());
    expect(notices).toHaveLength(1);
  });
});
```

Create `packages/cli/src/daemon/server.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { sendToSocket } from "#cli/ipc";
import { useIpcServer } from "#test-support/commands-fixtures";

describe("daemon notices", () => {
  const ipc = useIpcServer();

  test("a not-implemented notice reads back as the old system line", async () => {
    ipc.start();
    ipc.handle.triggerNotice({
      at: 1,
      label: "Weather change",
      opcode: 1,
      text: "[tuicraft] Weather change is not yet implemented",
      type: "not_implemented",
    });
    const lines = await sendToSocket("READ", ipc.sockPath);
    expect(lines).toEqual([
      "[system] [tuicraft] Weather change is not yet implemented",
    ]);
  });
});
```

Append to the `describe("startTui", …)` block of `packages/cli/src/ui/tui-session.test.ts`:

```ts
  test("a not-implemented notice writes the old system line", async () => {
    const handle = createMockHandle();
    const input = new PassThrough();
    const output: string[] = [];

    const done = startTui(handle, false, {
      input,
      write: (s) => void output.push(s),
    });
    handle.triggerNotice({
      at: 1,
      label: "Weather change",
      opcode: 1,
      text: "[tuicraft] Weather change is not yet implemented",
      type: "not_implemented",
    });

    expect(output.join("")).toContain(
      "[system] [tuicraft] Weather change is not yet implemented",
    );

    input.end();
    await done;
  });
```

In `packages/core/src/wow/world-handlers-chat.test.ts`, replace the test "stubbed opcode notifies via onMessage" with (import `type NoticeEvent` from `#wow/client-extras`):

```ts
  test("stubbed opcode notifies via onNotice", async () => {
    const ws = await startMockWorldServer();
    try {
      const handle = await worldSession(
        { ...base, host: "127.0.0.1", port: ws.port },
        fakeAuth(ws.port),
      );
      await waitForEchoProbe(handle);

      const received = new Promise<NoticeEvent>((resolve) => {
        handle.onNotice((event) => {
          if (event.label === "Ambiguous player name") resolve(event);
        });
      });

      ws.inject(GameOpcode.SMSG_CHAT_PLAYER_AMBIGUOUS, new Uint8Array(0));
      const notice = await received;
      expect(notice.type).toBe("not_implemented");
      expect(notice.text).toBe(
        "[tuicraft] Ambiguous player name is not yet implemented",
      );

      handle.close();
      await handle.closed;
    } finally {
      ws.stop();
    }
  });
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `mise test packages/core/src/wow/protocol/stubs.test.ts packages/core/src/wow/client-handlers.test.ts packages/core/src/wow/world-handlers-chat.test.ts packages/cli/src/daemon/server.test.ts packages/cli/src/ui/tui-session.test.ts`
Expected: FAIL. `stubs.test.ts` fails because `notice.text` is `undefined` (notify still receives a string); "a stubbed opcode emits a notice" fails with `expected [] but received ["[tuicraft] Weather change is not yet implemented"]` for `chat`; "stubbed opcode notifies via onNotice" times out; the daemon test fails with `expected ["[system] …"] but received []`; the TUI test fails on `toContain`.

- [ ] **Step 3: Pass a notice object from the stubs**

Replace only the `registerStubs` function in `protocol/stubs.ts` (keep the `STUBS` table exactly as it is after the pull; C6b removed its `SMSG_INIT_WORLD_STATES` row):

```ts
export type StubNotice = { opcode: number; label: string; text: string };

export function registerStubs(
  dispatch: OpcodeDispatch,
  notify: (notice: StubNotice) => boolean,
): void {
  for (const [opcode, label] of STUBS) {
    if (dispatch.has(opcode)) continue;
    const text = `[tuicraft] ${label} is not yet implemented`;
    let fired = false;
    dispatch.on(opcode, () => {
      if (!fired) fired = notify({ opcode, label, text });
    });
  }
}
```

- [ ] **Step 4: Emit on the notice emitter**

In `registerWorldHandlers` (`client-handlers.ts`), replace only the `registerStubs(…)` call and its callback; keep every other line of the function as you find it after the pull (C6b may have changed them). The call becomes:

```ts
  registerStubs(conn.dispatch, (notice) => {
    if (conn.events.notice.size === 0) return false;
    conn.events.notice.emit({
      type: "not_implemented",
      ...notice,
      at: Date.now(),
    });
    return true;
  });
```

Remove `ChatType` from the `#wow/protocol/opcodes` import if `mise typecheck core` reports it unused (it was used only here, read at `client-handlers.ts:10,159`).

- [ ] **Step 5: Print notices in the daemon and the TUI**

`packages/cli/src/daemon/server.ts`: change the barrel import to `import { ChatType, type WorldHandle } from "@tuicraft/core";` and add after `handle.onMessage((msg) => onChatMessage(msg, events, log));`:

```ts
  handle.onNotice(({ text }) =>
    onChatMessage(
      { message: text, sender: "", type: ChatType.SYSTEM },
      events,
      log,
    ),
  );
```

`packages/cli/src/ui/tui.ts`: in `subscribeEvents`, after the `handle.onMessage(…)` call, add:

```ts
  handle.onNotice(({ text }) =>
    echo(formatMessage({ message: text, sender: "", type: ChatType.SYSTEM })),
  );
```

- [ ] **Step 6: Run the tests and see them pass**

Run: `mise test packages/core/src/wow/protocol/stubs.test.ts packages/core/src/wow/client-handlers.test.ts packages/core/src/wow/world-handlers-chat.test.ts packages/cli/src/daemon/server.test.ts packages/cli/src/ui/tui-session.test.ts packages/cli/src/daemon/commands-ipc.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the full gate and the live gate**

Run: `mise format:fix && mise lint:fix && mise ci`, then live gate L. Before deleting the accounts, check the daemon text with the account 1 wrapper:

```bash
TC="$(jq -r .wrapper tmp/live-1.json)"
"$TC" start
"$TC" read --wait 10 | rg 'not yet implemented'
"$TC" stop
```

Expected: the live suite passes. `read` shows lines of the form `[system] [tuicraft] <label> is not yet implemented` for stub opcodes the server sent after the daemon subscribed (the text is unchanged from before C10). If the server sent no stubbed opcode in those 10 seconds, `rg` prints nothing; that is not a failure, because the unit and integration tests above prove the path.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/wow/protocol/stubs.ts packages/core/src/wow/protocol/stubs.test.ts packages/core/src/wow/client-handlers.ts packages/core/src/wow/client-handlers.test.ts packages/core/src/wow/world-handlers-chat.test.ts packages/cli/src/daemon/server.ts packages/cli/src/daemon/server.test.ts packages/cli/src/ui/tui.ts packages/cli/src/ui/tui-session.test.ts
```

```bash
mise exec -- git commit -F - <<'MSG'
refactor: Send NYI notices as typed events

The harness routes not-implemented notices as their own event instead
of reading a fake SYSTEM chat line; the daemon and the TUI subscribe
and print the same text as before. Live gate L passed.
MSG
```

---

## Navigation track follow-ups (C12, C13, C14)

The navigation track landed G8 (= ND F3 + F4) and N1 (= ND F1 + F2) on `epic/pi-harness` (head `c91f70f`, HANDOVER; the patched-library re-proof ran the legacy live suite 21/21 and 13/13 M3a routes). Its re-proof left follow-ups that the advisor asked to make plan tasks. The [plan index](../2026-09-26-pi-harness-epic-plan.md) (section "Nav follow-ups") lists them. These three tasks go to the core-a builder after C11 ([plan index](../2026-09-26-pi-harness-epic-plan.md): C12 needs C11 and C13 needs C12, because C5, C11, C12 and C13 all edit `docs/manual.md` and three of them edit `SKILL.md`). Ownership addendum to contract 3.1: `packages/core/src/wow/navigation-observation.ts` (+ test) C12; `docs/evidence/m3a/patched-namigator.md` C13 → C14 (one sentence); `docs/manual.md` lines 605–616 and 653–656 C12, C13 (disjoint paragraphs); `.claude/skills/tuicraft/SKILL.md` line 289 C12; `vendor/namigator/check.ts` (new) C14.

### Task C12 (ND F4 follow-up): nextStep for corner and collision refusals

**Why:** the re-proof measured `stop: path corner disagrees with connected ground` with an empty `nextStep` on slice 2's recorded route, and `nextStepFor` has no entry for it or for `ground corridor collision` (read). F2 moved 58 grid routes from `UNKNOWN_HEIGHT` (which has a hint) to the corner refusal and 10 to the collision refusal, so agents and Luna's `travel` now meet more refusals with no next step.

**Files:**
- Modify: `packages/core/src/wow/navigation-observation.ts` (`CONTAINED_STEPS`, two new entries)
- Modify: `docs/manual.md` (after the `ground corridor changes surface` paragraph, lines 653–655), `.claude/skills/tuicraft/SKILL.md` (line 289, after the `ground corridor changes surface` sentence)
- Test: `packages/core/src/wow/navigation-observation.test.ts`

**Interfaces:**
- Consumes: `nextStepFor(reason: string | undefined): string | null` (existing).
- Produces: no new name. `nextStepFor("path corner disagrees with connected ground")` and `nextStepFor("ground corridor collision")` return non-null hints.

- [ ] **Step 1: Write the failing test**

Add to the `describe("nextStepFor", …)` block in `packages/core/src/wow/navigation-observation.test.ts`, before the test `other or missing reasons have no hint`:

```ts
  test("a path corner that disagrees with the ground names a nearer waypoint", () => {
    const hint = nextStepFor("path corner disagrees with connected ground");
    expect(hint).toContain("mesh and the ground");
    expect(hint).toContain("nearer waypoint on open ground");
    expect(hint).toContain("do not repeat this goto unchanged");
  });

  test("a corridor collision names open ground, not a retry", () => {
    const hint = nextStepFor("ground corridor collision");
    expect(hint).toContain("hits an object or a wall");
    expect(hint).toContain("nearer waypoint in open ground");
    expect(hint).toContain("do not repeat this goto unchanged");
  });
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/core/src/wow/navigation-observation.test.ts`
Expected: FAIL in the 2 new tests: `nextStepFor` returns `null` for both reasons, so the first `toContain` fails.

- [ ] **Step 3: Implement**

In `packages/core/src/wow/navigation-observation.ts`, add these two entries at the end of `CONTAINED_STEPS` (after the `ground corridor changes surface` entry):

```ts
  [
    "path corner disagrees with connected ground",
    "A turn of the route is where the mesh and the ground heights do not agree, such as the edge of a step or a slope. Choose a nearer waypoint on open ground or another destination; do not repeat this goto unchanged.",
  ],
  [
    "ground corridor collision",
    "A straight part of the route hits an object or a wall. Choose a nearer waypoint in open ground or another destination; do not repeat this goto unchanged.",
  ],
```

In `docs/manual.md`, after the paragraph that ends `a nearer waypoint on the same floor or another destination.` (line 655), add:

```markdown
`path corner disagrees with connected ground` (`refusal=stop`) means a turn
of the route is where the mesh and the ground heights do not agree, such as
the edge of a step or a slope. Choose a nearer waypoint on open ground or
another destination; do not repeat the `goto` unchanged.
`ground corridor collision` (`refusal=stop`) means a straight part of the
route hits an object or a wall. Choose a nearer waypoint in open ground or
another destination; do not repeat the `goto` unchanged.
```

In `.claude/skills/tuicraft/SKILL.md` line 289, after the sentence `After \`ground corridor changes surface\`, choose a nearer waypoint on the same floor or another destination.`, add: ``After `path corner disagrees with connected ground` (a turn where the mesh and the ground disagree) or `ground corridor collision` (the route hits an object or a wall), choose a nearer waypoint in open ground or another destination; do not repeat the `goto` unchanged.``

- [ ] **Step 4: Run and pass**

Run: `mise test packages/core/src/wow/navigation-observation.test.ts` → PASS (all tests in the file, 2 new).
Run: `mise ci` → green. Live gate: not required. The change is text in a pure function; no protocol or daemon behaviour changes, and the re-proof's live suite ran on the same code path.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/wow/navigation-observation.ts packages/core/src/wow/navigation-observation.test.ts docs/manual.md .claude/skills/tuicraft/SKILL.md
mise exec -- git commit -F - <<'MSG'
fix: Hint the corner and collision refusals

The adt-edges default moved 68 grid routes to two refusals that had no
nextStep, so agents met more dead ends with no advice on what to do.
MSG
```

### Task C13 (re-proof follow-up): Correct the adt-edges height note and a manual wrap

**Why:** `patched-namigator.md` says twice that adt-edges changes heights by about 0.02 yards (the PR #155 review). The re-proof measured one Sunstrider chunk-edge point, (10392.857, −6400.000), at Z 37.962 on the default build and 38.595 on the patched build, between route points at 38.572 and 38.632: a 0.63 yard correction of a dip. `docs/manual.md:611` has a stray `The` on its own line.

**Files:**
- Modify: `docs/evidence/m3a/patched-namigator.md` (lines 244–247 and 500–502), `docs/manual.md` (lines 610–614)

**Interfaces:** none.

- [ ] **Step 1: Write the failing check**

Run: `rg -n '0\.02 yards' docs/evidence/m3a/patched-namigator.md; rg -n '^The$' docs/manual.md`
Expected (the failing state): two matches in `patched-namigator.md` (lines 245 and 502) and one in `docs/manual.md` (line 611).

- [ ] **Step 2: Implement**

In `docs/evidence/m3a/patched-namigator.md`, replace

```markdown
entry (section "Quad-edge points"). The PR #155 review found the new values
match points 0.02 yards away, so this is a real fix of an edge
discontinuity. `mise namigator:build` applies it by default (section
"Ruling: ADT edges by default").
```

with

```markdown
entry (section "Quad-edge points"). The PR #155 review found the new values
match nearby points, so this is a real fix of an edge discontinuity. The
change is not always small: at the Sunstrider chunk-edge point
(10392.857, −6400.000) the default build gives Z 37.962 and the patched
build 38.595, between route points at 38.572 and 38.632, so the patch
removes a 0.63 yard dip. `mise namigator:build` applies it by default
(section "Ruling: ADT edges by default").
```

and replace

```markdown
`GetADTHeight`, and the grid does not measure them; heights change only on
quad edges, by about 0.02 yards per the PR #155 review. The M3a live
```

with

```markdown
`GetADTHeight`, and the grid does not measure them; heights change only on
quad edges, by up to 0.63 yards where the old edge height dipped. The M3a
live
```

then rewrap that paragraph to 80 columns (`live records ran on the old installed library. The live re-proof of the M3a` becomes the next line).

In `docs/manual.md`, replace

```markdown
`ambiguous ground column at destination (floors …)` like the coordinate form.
The
route does not follow the creature. If the creature disappears from the
```

with

```markdown
`ambiguous ground column at destination (floors …)` like the coordinate form.
The route does not follow the creature. If the creature disappears from the
```

- [ ] **Step 3: Run the check and pass**

Run: `rg -n '0\.02 yards' docs/evidence/m3a/patched-namigator.md; rg -n '^The$' docs/manual.md` → no output (exit 1).
Run: `mise lint:docs` → exit 0. Run: `mise format` → exit 0.

- [ ] **Step 4: Commit**

```bash
git add docs/evidence/m3a/patched-namigator.md docs/manual.md
mise exec -- git commit -F - <<'MSG'
docs: Correct the adt-edges height change note

The re-proof measured a 0.63 yard correction at a Sunstrider chunk edge,
so the 0.02 yard figure understated what the default patch changes.
MSG
```

### Task C14 (ND F2 follow-up): Offline check of a namigator build at the spawn corner

**Why:** nav diagnosis F2 asks for a regression check that `findHeights(8733.33, -6666.67)` has ground and that the `eversong10` spawn plans to Halis Dawnstrider (8731.69, −6656.50) on the patched build. A `bun:test` file cannot hold it: it needs the built library and 3.8 GB of navigation data, and `biome.json` sets `noSkippedTests` to `error`, so a `skipIf`-gated test is not allowed. The check is a script beside `measure.ts`, with the same argument shape, run after every `mise namigator:build` and at Gate 2.

**Files:**
- Create: `vendor/namigator/check.ts`
- Modify: `docs/evidence/m3a/patched-namigator.md` (one sentence at the end of section "Ruling: ADT edges by default"; after C13)

**Interfaces:**
- Consumes: `createNavigation({ dataPath, libraryPath })` (`packages/core/src/wow/navigation.ts`, relative import as in `measure.ts`), `Navigation.height(mapId, x, y, from)`, `Navigation.planGround(mapId, from, to)`, `Navigation.close()`.
- Produces: the command `NAV_DATA=<nav dir> bun vendor/namigator/check.ts <libnamigator.so>`; prints `{"corner":"ok"|<error>,"route":"ok"|<error>}` and exits 0 when both are `ok`, 1 otherwise, 2 on a usage error.

- [ ] **Step 1: Write the check**

`vendor/namigator/check.ts`:

```ts
import { createNavigation } from "../../packages/core/src/wow/navigation";

const EXPANSION01 = 530;
const CORNER = { x: 8733.33, y: -6666.67 };
const SPAWN = { x: 8735, y: -6685, z: 70.5 };
const HALIS = { x: 8731.69, y: -6656.5 };

const [libraryPath] = process.argv.slice(2);
const dataPath = process.env["NAV_DATA"];
if (!libraryPath || !dataPath) {
  console.error("usage: NAV_DATA=<nav dir> check.ts <libnamigator.so>");
  process.exit(2);
}

function attempt(run: () => unknown): string {
  try {
    run();
    return "ok";
  } catch (error) {
    return error instanceof Error ? error.message : "error";
  }
}

const nav = createNavigation({ dataPath, libraryPath });
const corner = attempt(() => nav.height(EXPANSION01, CORNER.x, CORNER.y, SPAWN));
const route = attempt(() => nav.planGround(EXPANSION01, SPAWN, HALIS));
nav.close();
console.log(JSON.stringify({ corner, route }));
process.exit(corner === "ok" && route === "ok" ? 0 : 1);
```

- [ ] **Step 2: Run it on the unpatched build and see it fail**

Run: `NAV_DATA=/home/deity/wow-data/nav bun vendor/namigator/check.ts /home/deity/wow-data/libnamigator.so; echo "exit $?"`
Expected: `exit 1`, with an error text in `corner` or `route` (nav diagnosis measured an empty `findHeights` column at this corner on the July build that `~/.config/tuicraft/config.toml` names; the exact text is not measured). If it prints `exit 0`, the July build is no longer at that path: record that in the commit body and go on, because Step 3 is the check that matters.

- [ ] **Step 3: Run it on the patched build and pass**

Run: `NAV_DATA=/home/deity/wow-data/nav bun vendor/namigator/check.ts "$(/usr/bin/find ~/.local/share/tuicraft/namigator -name libnamigator.so | command head -1)"; echo "exit $?"`
Expected: `{"corner":"ok","route":"ok"}` and `exit 0`. If the directory has no library, run `mise namigator:build` once and retry.
Run: `mise lint` and `mise typecheck` → exit 0.

- [ ] **Step 4: Document the check**

At the end of section "Ruling: ADT edges by default" in `docs/evidence/m3a/patched-namigator.md`, add: ``After a rebuild, `NAV_DATA=<nav dir> bun vendor/namigator/check.ts <libnamigator.so>` checks that the spawn corner (8733.33, −6666.67) has ground and that the `eversong10` spawn plans to Halis Dawnstrider; it exits 1 on the unpatched build.``
Run: `mise lint:docs` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add vendor/namigator/check.ts docs/evidence/m3a/patched-namigator.md
mise exec -- git commit -F - <<'MSG'
chore: Check a namigator build at the spawn corner

The adt-edges default fixes the spawn corner that most routes north
cross; this check fails fast when a rebuild loses that fix.
MSG
```

## Files owned by core-a (summary)

C0 creates `client-extras.ts`, `client-place.ts`, `client-runs.ts`, `npc-roles.ts` (+ tests) and edits `client.ts`, `index.ts`, `world-events.ts`, `control.ts`, `nearby.ts`, `combat.ts`, `item-labels.ts`, `test-support/mock-handle.ts`. Later tasks: C1 `index.ts`; C5 `combat.ts`, `docs/manual.md`, `SKILL.md`, new `packages/cli/src/daemon/commands-dispatch-combat.test.ts`; C4, C3 `nearby.ts`, C3 `npc-roles.ts`; C2a new `runtime-data.ts`, `runtime.ts`, `client-extras.ts`; C2b `nearby.ts`, `client-control.ts` (`queryNearby` only), the mock's `queryNearby` block; C9 `protocol/entity-queries.ts`, `world-handlers-entity.ts`, `world-conn.ts` (one field), `client-extras.ts`, new `test-support/creature-query-fixtures.ts`; C11 `item-labels.ts`, `item-use.ts`, `docs/manual.md`, `SKILL.md`; C10 `protocol/stubs.ts`, `client-handlers.ts`, `world-handlers-chat.test.ts` (one test), `packages/cli/src/daemon/server.ts` (+ new `server.test.ts`), `packages/cli/src/ui/tui.ts`. All core paths are under `packages/core/src/wow/` unless shown. Navigation follow-ups: C12 `navigation-observation.ts` (+ test), `docs/manual.md` (lines 653–656), `SKILL.md` (line 289); C13 `docs/evidence/m3a/patched-namigator.md`, `docs/manual.md` (lines 610–614); C14 new `vendor/namigator/check.ts` and one sentence in `patched-namigator.md`.
