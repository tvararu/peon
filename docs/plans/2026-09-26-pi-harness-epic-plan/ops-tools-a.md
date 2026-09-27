# ops-tools-a: ops layer part A and the tools look, journal, social, stop (key: ops-tools-a)

Plan index: [2026-09-26-pi-harness-epic-plan.md](../2026-09-26-pi-harness-epic-plan.md).

Area plan for tasks A1–A13 of `contract.md`. Names, types, files and task
ids are the contract's. Paths are relative to the worktree root
(`/home/deity/orca/workspaces/tuicraft/pi-epic`, branch `epic/pi-harness`;
builders work in Orca child worktrees and merge into it).

## Contract issues

Each item names a defect or a gap in `contract.md` and how this plan works
around it. This plan does not change the contract.

1. **Validation failures never reach a `tool_result` hook** (contract 2.7).
   Measured in `pi-agent-core/dist/agent-loop.js:384-389, 479-537`: a
   schema miss gives `kind: "immediate"`, and only
   `finalizeExecutedToolCall` (`:568-600`) calls `afterToolCall`, which is
   where `agent-session.js:265` emits `tool_result`. Both paths emit
   `tool_execution_end` (with `isError` and `result`) and then
   `message_start`/`message_end` of the tool result message
   (`agent-loop.js:634-637`), and `agent-session.js:747-760` lets a
   `message_end` handler replace a `toolResult` message. Plan: A1d counts
   misses on `tool_execution_end` (`isError` and text starting
   `Validation failed for tool "`) and appends the minimal valid call in a
   `message_end` handler. F8b (smoke V4) confirms it live.
2. **A1 `Needs` misses three edges.** `defineGameTool` step 6 needs
   `poseView` (A3) for `RepeatCall.pose` and `repeatRefusal` (A6); step 10
   needs `dangerView`/`dangerLine` (A7). `unitRefusal` (A3) needs
   `nextCall` (A1). Plan: A1 splits into A1a (pure result helpers, needs F2
   only), A1b (`params.ts`), A1c (`defineGameTool`, needs A1a, A3a, A6,
   A7a, P2, F5a) and A1d (stubs, registry, `installTools`, needs A1b, A1c,
   U5, F7a). A3c (resolve) needs A1a.
3. **`Resolved` "ambiguous" has no `text`**, but the contract's
   `unitRefusal` text quotes it (`"<text>" matches <n> units.`). Plan: the
   detail names the distinct candidate names instead:
   `the name matches 3 units (Springpaw Stalker, Springpaw Cub).`
4. **`NowSnapshot.hpDelta5s` has no source.** `nowSnapshot(rt)` is a pure
   function and no `HarnessRuntime` part keeps HP history. Plan: A3b sets
   `undefined`; `formatNow` (L10) drops the field.
5. **`SelfView.race`**: the barrel has no race table (`RACE_NAMES` is
   private to `runtime/ready.ts`, contract 2.3). Plan:
   `rt.ready.inWorld()?.race ?? "unknown"`.
6. **`SelfView.inCombat`** would need the unit-flag combat bit, and
   `noBitwiseOperators` is an error outside `core/src/wow`. Plan:
   `combat.attackers.length > 0 || combat.attacking`.
7. **`Sighting` needs a position** but `NearbyRow.position` can be
   `undefined`. Plan: `note` keeps the earlier sighting unchanged and never
   makes one without a position.
8. **`createProgressTracker` gets no run registry**, but the digest holds
   "active run status". Plan: the tracker subscribes to `log` and reads
   `run/started`, `run/ended`, `run/cancelled`. The same subscription
   gives the progress events (kill credit, item, quest counter, life,
   chat out). A pose change over 5 yd reports
   `lastProgress().event === "control/move_stop"`, because `LogEvent` has
   no pose event.
9. **`createRepeatGuard(clock)`**: the contract gives no use for the
   clock. Plan: a stored failure stops blocking 5 min after it was
   recorded.
10. **`repeatRefusal` has no `Next:` line** in the contract text, but A.2
    requires one on every non-`DONE` result. Plan: next is the first
    untried option, else `ask the human: "My <tool> call keeps failing
    (<reason>). What should I do?"`.
11. **`RepeatHit.untried`** is not defined. Plan: the distinct `next`
    texts of the stored failures, newest first, at most 3.
12. **Renderers are not in the tool files.** The brief asks for each tool
    "with renderCall and renderResult delegating to the ui renderer
    families"; contract 2.7 puts that merge in `installTools`
    (`{ ...tool, ...rendererFor(tool.name) }`). Plan: A1d does the merge
    and tests it for all ten tools; A10–A13 add no renderer code.
    `rendererFor` returns `{}` until U6/U7/U8 land (Pi then draws the
    text).
13. **`MAX_CONTENT_BYTES` (700) does not fit a 24-line page.** A 20-row
    `look(within: …)` or a 15-row `journal(about: "log")` is about
    900–1100 bytes. Plan: the byte limit is asserted on the design
    examples (as contract 2.6 says); full pages are asserted on
    `maxLines` only.
14. **`stop` example text** (`is still attacking you`) differs from
    `dangerLine` (`is attacking you`). Plan: `define.ts` appends the
    contract `dangerLine` with `still: true` for the `control` kind
    (`stop`), so the text is the design's; `stop` adds no second danger
    text (main plan "Fix-ups before approval").
15. **The `tool/call` log row can hold the password** (a model that
    passes it to `social`). E3 `leakCheck` scans the run dir. Plan:
    `define.ts` replaces `rt.profile.client.password` in the logged args
    with `[secret]`.
16. **No synchronous spell names** for `AuraView.name` and
    `CastView.spell` (`getSpellbook` is async and knows learned spells
    only). Plan: `spell <id>`.
17. **`QuestLine.turnIn`** has no source in core. Plan: `undefined`.
18. **New files that section 3 does not list** (test support only):
    `packages/harness/test-support/world-fixtures.ts` (A2) and
    `packages/harness/test-support/tool-harness.ts` (A1c).
19. **New exports in files this area owns** (used only inside this area
    and by B tools that choose to): `isUnitEntity` (`ops/refs.ts`, A2),
    `nameOf` (`ops/danger.ts`, A7a), `unitMatches`, `knownUnits`,
    `nearestOf` (`ops/views.ts`, A3a), `emptyVitals`, `emptySelf`,
    `emptyPlace`, `emptyUnit` (`tools/define.ts`, A1a) and `notBuilt`
    (`tools/define.ts`, A1d).

## Overview

- The ops layer is small, pure or near-pure modules under `packages/harness/src/ops/`: unit refs, event settlement, the repeat guard, the attack ledger and danger line, the sightings memory, the no-progress tracker, the views and unit resolution, and the range helpers.
- `tools/define.ts` is the one result contract: status word first, at most 12 lines (24 for `look` and `journal`), one `Next:` line, the danger line, `details` for the human, stats and log rows for graders.
- A1d creates all ten tool stubs and registers them with the renderer families merged in; each later tool task edits only its own tool file.
- `look`, `journal`, `social` and `stop` are thin compositions over the ops layer; they never send a packet outside `rt.mutex` and never block on a run.
- No task here changes core protocol or the daemon, so none needs `mise test:live`; the live evidence for these tools is F8e and the round-1 canary `t0-self-state` after BOOT.

Task order (each starts when its `Needs` have landed on `epic/pi-harness`):
A2, A4, A6, A1a, A1b → A8, A7a → A7b, A9 → A3a → A3b, A3c, A5 → A1c →
A1d → A12, A13 → A10, A11.

Rules for every task below:

- Tests are `bun:test`, colocated. One file runs with
  `mise test packages/harness/src/<path>.test.ts`.
- Before each commit run `mise lint:fix` (it sorts object keys and
  imports; `useSortedKeys` is on for `packages/harness/**`), then
  `bun run tsc --noEmit -p packages/harness` and `mise lint`. Both must
  exit 0.
- Commit with `git add <exact paths>` and then, as a separate command,
  `mise exec -- git commit -m "<subject>" -m "<why>"`. The hk
  `commit-msg` hook wraps the body at 72 columns itself (`hk.pkl`
  `wrap-body`, `fix = true`) and fails a subject over 50 characters; never
  set `HK=0`.
- A test replaces a mock member by assignment
  (`handle.getCombatState = () => …`). No `mock.module`.
- Live gate: none of A1–A13 changes core protocol or daemon behaviour
  (AGENTS.md "Testing" asks for `mise test:live` only for those). Each
  task says so in its last step.

---

## Task A2: unit refs and the shared world fixture

Needs: F2.

**Files**

- Create: `packages/harness/src/ops/refs.ts`
- Create: `packages/harness/test-support/world-fixtures.ts`
- Test: `packages/harness/src/ops/refs.test.ts`

**Interfaces**

- Consumes: `RefTable` (`#harness/contract/services`); `Entity`,
  `UnitEntity`, `ObjectType`, `NearbyRow`, `CombatState`, `CombatUnit`,
  `ControlPose`, `ControlState`, `PlaceState`, `RecoveryState`,
  `GameObjectEntity`, `WorldHandle` (`@tuicraft/core`).
- Produces:

```ts
export function guidHex(guid: bigint): string;
export function parseRef(text: string): number | undefined;
export function createRefTable(): RefTable;
export function isUnitEntity(entity: Entity | undefined): entity is UnitEntity;
```

and, in `test-support/world-fixtures.ts`:

```ts
export const SELF_GUID: bigint;
export const MAP_ID: number;
export const ORIGIN: { x: number; y: number; z: number };
export type UnitInit = Partial<Omit<UnitEntity, "objectType" | "position">> & { dx?: number; dy?: number; player?: boolean };
export type WorldInit = { rows?: NearbyRow[]; pose?: ControlPose; serverPose?: ControlPose; combat?: Partial<CombatState>; life?: RecoveryState["life"]; place?: Partial<PlaceState> };
export function unitEntity(init?: UnitInit): UnitEntity;
export function gameObject(guid: bigint, name: string): GameObjectEntity;
export function nearbyRow(entity: Entity, over?: Partial<NearbyRow>): NearbyRow;
export function selfRow(over?: UnitInit): NearbyRow;
export function selfPose(at: number, over?: Partial<ControlPose>): ControlPose;
export function selfCombat(over?: Partial<CombatUnit>): CombatUnit;
export function setWorld(handle: WorldHandle, init: WorldInit): void;
```

- [ ] **Step 1: Write the failing test** `packages/harness/src/ops/refs.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import { createRefTable, guidHex, isUnitEntity, parseRef } from "#harness/ops/refs";
import { gameObject, unitEntity } from "#test-support/world-fixtures";

describe("guidHex", () => {
  test("writes lowercase hex without a prefix", () => {
    expect(guidHex(0x1fn)).toBe("1f");
    expect(guidHex(0xf130_0000_0000_12abn)).toBe("f1300000000012ab");
  });
});

describe("parseRef", () => {
  test("reads u<n>", () => {
    expect(parseRef("u12")).toBe(12);
    expect(parseRef(" u3 ")).toBe(3);
  });

  test("gives undefined for anything else", () => {
    expect(parseRef("u0")).toBeUndefined();
    expect(parseRef("12")).toBeUndefined();
    expect(parseRef("u4x")).toBeUndefined();
    expect(parseRef("Springpaw Stalker")).toBeUndefined();
  });
});

describe("createRefTable", () => {
  test("gives refs in first-seen order and keeps them", () => {
    const refs = createRefTable();
    expect(refs.refOf(0x50n)).toBe("u1");
    expect(refs.refOf(0x60n)).toBe("u2");
    expect(refs.refOf(0x50n)).toBe("u1");
    expect(refs.size()).toBe(2);
  });

  test("maps a ref back to its guid", () => {
    const refs = createRefTable();
    refs.refOf(0x50n);
    expect(refs.guidOf("u1")).toBe(0x50n);
    expect(refs.guidOf(" u1 ")).toBe(0x50n);
    expect(refs.guidOf("u9")).toBeUndefined();
  });

  test("never reuses a ref", () => {
    const refs = createRefTable();
    for (let guid = 1n; guid <= 30n; guid += 1n) refs.refOf(guid);
    expect(refs.refOf(31n)).toBe("u31");
    expect(new Set(Array.from({ length: 31 }, (_, i) => refs.refOf(BigInt(i + 1)))).size).toBe(31);
  });
});

describe("isUnitEntity", () => {
  test("accepts creatures and players, not game objects", () => {
    expect(isUnitEntity(unitEntity())).toBe(true);
    expect(isUnitEntity(unitEntity({ player: true }))).toBe(true);
    expect(isUnitEntity(gameObject(0x70n, "Signpost"))).toBe(false);
    expect(isUnitEntity(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/ops/refs.test.ts`
Expected: FAIL, `Cannot find module '#harness/ops/refs'` (and
`#test-support/world-fixtures`).

- [ ] **Step 3: Implement** `packages/harness/src/ops/refs.ts`

```ts
import { type Entity, ObjectType, type UnitEntity } from "@tuicraft/core";
import type { RefTable } from "#harness/contract/services";

const REF = /^u([1-9]\d*)$/;

export function guidHex(guid: bigint): string {
  return guid.toString(16);
}

export function parseRef(text: string): number | undefined {
  const match = REF.exec(text.trim());
  return match?.[1] ? Number(match[1]) : undefined;
}

export function isUnitEntity(entity: Entity | undefined): entity is UnitEntity {
  return entity?.objectType === ObjectType.UNIT || entity?.objectType === ObjectType.PLAYER;
}

export function createRefTable(): RefTable {
  const refs = new Map<bigint, string>();
  const guids = new Map<string, bigint>();
  return {
    guidOf: (ref) => guids.get(ref.trim()),
    refOf(guid) {
      const known = refs.get(guid);
      if (known) return known;
      const ref = `u${refs.size + 1}`;
      refs.set(guid, ref);
      guids.set(ref, guid);
      return ref;
    },
    size: () => refs.size,
  };
}
```

Then `packages/harness/test-support/world-fixtures.ts` (used by A3–A13
tests; positions are relative to `ORIGIN`, so `dx` is north and `dy` is
west, as in WoW; `setWorld` returns `rows` from `queryNearby` in the
given order, so tests pass them nearest first, as core does):

```ts
import {
  type CombatState,
  type CombatUnit,
  type ControlPose,
  type ControlState,
  type Entity,
  type GameObjectEntity,
  type NearbyRow,
  ObjectType,
  type PlaceState,
  type RecoveryState,
  type UnitEntity,
  type WorldHandle,
} from "@tuicraft/core";

export const SELF_GUID = 0x10n;
export const MAP_ID = 530;
export const ORIGIN = { x: 8735, y: -6685, z: 72 };

export type UnitInit = Partial<Omit<UnitEntity, "objectType" | "position">> & {
  dx?: number;
  dy?: number;
  player?: boolean;
};

export type WorldInit = {
  rows?: NearbyRow[];
  pose?: ControlPose;
  serverPose?: ControlPose;
  combat?: Partial<CombatState>;
  life?: RecoveryState["life"];
  place?: Partial<PlaceState>;
};

export function unitEntity(init: UnitInit = {}): UnitEntity {
  const { dx = 0, dy = 0, player = false, ...over } = init;
  return {
    class_: 0,
    displayId: 0,
    entry: 0,
    factionTemplate: 0,
    gender: 0,
    guid: 0x100n,
    health: 100,
    level: 1,
    maxHealth: 100,
    maxPower: [0],
    name: "Unit",
    npcFlags: 0,
    objectType: player ? ObjectType.PLAYER : ObjectType.UNIT,
    position: { mapId: MAP_ID, orientation: 0, x: ORIGIN.x + dx, y: ORIGIN.y + dy, z: ORIGIN.z },
    power: [0],
    race: 0,
    rawFields: new Map(),
    scale: 1,
    target: 0n,
    unitFlags: 0,
    ...over,
  };
}

export function gameObject(guid: bigint, name: string): GameObjectEntity {
  return {
    bytes1: 0,
    displayId: 0,
    entry: 0,
    flags: 0,
    gameObjectType: 0,
    guid,
    name,
    objectType: ObjectType.GAMEOBJECT,
    position: { mapId: MAP_ID, orientation: 0, ...ORIGIN },
    rawFields: new Map(),
    scale: 1,
  };
}

export function nearbyRow(entity: Entity, over: Partial<NearbyRow> = {}): NearbyRow {
  const { position } = entity;
  const dx = position ? position.x - ORIGIN.x : 0;
  const dy = position ? position.y - ORIGIN.y : 0;
  const distance = position ? Math.hypot(dx, dy) : null;
  return {
    attackable: false,
    attackingMe: false,
    bearingRadians: position ? Math.atan2(dy, dx) : null,
    distance,
    entity,
    horizontalDistance: distance,
    lootable: false,
    originSource: "server",
    originUpdatedAt: 0,
    position,
    positionKind: position ? "observed" : null,
    positionObservedAt: null,
    positionSource: position ? "update_object" : null,
    preparedAt: 0,
    relation: "unknown",
    remotePose: undefined,
    roles: [],
    self: entity.guid === SELF_GUID,
    tapped: false,
    tappedByOther: false,
    targetOf: undefined,
    turnRadians: null,
    ...over,
  };
}

export function selfRow(over: UnitInit = {}): NearbyRow {
  const entity = unitEntity({ class_: 5, guid: SELF_GUID, level: 10, name: "Fgklibhlflc", player: true, ...over });
  return nearbyRow(entity, { self: true });
}

export function selfPose(at: number, over: Partial<ControlPose> = {}): ControlPose {
  return { mapId: MAP_ID, orientation: 0, source: "predicted", updatedAt: at, ...ORIGIN, ...over };
}

export function selfCombat(over: Partial<CombatUnit> = {}): CombatUnit {
  return {
    baseMana: undefined,
    guid: SELF_GUID,
    health: 217,
    level: 10,
    maxHealth: 217,
    maxPower: 100,
    motion: undefined,
    name: "Fgklibhlflc",
    pose: undefined,
    power: 100,
    powerType: 0,
    serverPose: undefined,
    ...over,
  };
}

export function setWorld(handle: WorldHandle, init: WorldInit): void {
  const rows = init.rows ?? [];
  const control: ControlState = { ...handle.getControlState(), pose: init.pose, selfGuid: SELF_GUID, serverPose: init.serverPose };
  const combat: CombatState = { ...handle.getCombatState(), self: selfCombat(), ...init.combat };
  const recovery: RecoveryState = { ...handle.getRecoveryState(), life: init.life ?? "alive" };
  const place: PlaceState = { area: undefined, areaId: undefined, at: undefined, mapId: undefined, zone: undefined, zoneId: undefined, ...init.place };
  handle.getControlState = () => control;
  handle.getCombatState = () => combat;
  handle.getRecoveryState = () => recovery;
  handle.getPlaceState = () => place;
  handle.getNearbyEntities = () => rows.map((row) => row.entity);
  handle.queryNearby = () => rows;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `mise test packages/harness/src/ops/refs.test.ts`
Expected: PASS, 7 tests. Then `mise lint:fix`,
`bun run tsc --noEmit -p packages/harness`, `mise lint`: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/ops/refs.ts packages/harness/src/ops/refs.test.ts packages/harness/test-support/world-fixtures.ts
mise exec -- git commit -m "feat: Add harness unit refs" -m "Tools name units as u<n> refs that never change in a process, so the model can pass a ref back instead of a guid. The shared world fixture lets the ops and tool tests build rows on the mock handle."
```

Live gate: none (no protocol or daemon change).

---

## Task A4: settle against core events

Needs: F2.

**Files**

- Create: `packages/harness/src/ops/settle.ts`
- Test: `packages/harness/src/ops/settle.test.ts`

**Interfaces**

- Consumes: `Unsubscribe` (`@tuicraft/core`, C1).
- Produces:

```ts
export type SettleInit<E> = {
  subscribe: (cb: (event: E) => void) => Unsubscribe;
  match: (event: E) => boolean;
  timeoutMs: number;
  signal?: AbortSignal;
  send?: () => void | Promise<void>;
};
export function settle<E>(init: SettleInit<E>): Promise<E | undefined>;
```

- [ ] **Step 1: Write the failing test** `packages/harness/src/ops/settle.test.ts`

```ts
import { describe, expect, jest, test } from "bun:test";
import { settle } from "#harness/ops/settle";

function channel<E>() {
  const subscribers = new Set<(event: E) => void>();
  return {
    emit(event: E) {
      for (const subscriber of subscribers) subscriber(event);
    },
    size: () => subscribers.size,
    subscribe(cb: (event: E) => void) {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
  };
}

describe("settle", () => {
  test("subscribes before send, so an answer sent inside send counts", async () => {
    const events = channel<number>();
    const answer = await settle({ match: (n) => n === 3, send: () => events.emit(3), subscribe: events.subscribe, timeoutMs: 1000 });
    expect(answer).toBe(3);
    expect(events.size()).toBe(0);
  });

  test("skips events that do not match", async () => {
    const events = channel<number>();
    const pending = settle({ match: (n) => n > 5, subscribe: events.subscribe, timeoutMs: 1000 });
    events.emit(1);
    events.emit(7);
    expect(await pending).toBe(7);
  });

  test("gives undefined at the timeout and unsubscribes", async () => {
    jest.useFakeTimers();
    try {
      const events = channel<number>();
      const pending = settle({ match: () => true, subscribe: events.subscribe, timeoutMs: 2000 });
      jest.advanceTimersByTime(2000);
      expect(await pending).toBeUndefined();
      expect(events.size()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test("an abort rejects with the signal's reason", async () => {
    const events = channel<number>();
    const controller = new AbortController();
    const pending = settle({ match: () => false, signal: controller.signal, subscribe: events.subscribe, timeoutMs: 1000 });
    controller.abort(new Error("esc"));
    await expect(pending).rejects.toThrow("esc");
    expect(events.size()).toBe(0);
  });

  test("an aborted signal rejects before send", async () => {
    const controller = new AbortController();
    controller.abort(new Error("human_stop"));
    const send = jest.fn();
    const pending = settle({ match: () => true, send, signal: controller.signal, subscribe: channel<number>().subscribe, timeoutMs: 1000 });
    await expect(pending).rejects.toThrow("human_stop");
    expect(send).not.toHaveBeenCalled();
  });

  test("awaits an async send", async () => {
    const events = channel<string>();
    const send = () => Promise.resolve().then(() => events.emit("echo"));
    expect(await settle({ match: (text) => text === "echo", send, subscribe: events.subscribe, timeoutMs: 1000 })).toBe("echo");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/ops/settle.test.ts`
Expected: FAIL, `Cannot find module '#harness/ops/settle'`.

- [ ] **Step 3: Implement** `packages/harness/src/ops/settle.ts`

```ts
import type { Unsubscribe } from "@tuicraft/core";

export type SettleInit<E> = {
  subscribe: (cb: (event: E) => void) => Unsubscribe;
  match: (event: E) => boolean;
  timeoutMs: number;
  signal?: AbortSignal;
  send?: () => void | Promise<void>;
};

export async function settle<E>(init: SettleInit<E>): Promise<E | undefined> {
  const { match, send, signal, subscribe, timeoutMs } = init;
  signal?.throwIfAborted();
  const outcome = Promise.withResolvers<E | undefined>();
  const timer = setTimeout(() => outcome.resolve(undefined), timeoutMs);
  const abort = () => outcome.reject(signal?.reason);
  const unsubscribe = subscribe((event) => {
    if (match(event)) outcome.resolve(event);
  });
  signal?.addEventListener("abort", abort, { once: true });
  try {
    await send?.();
    return await outcome.promise;
  } finally {
    clearTimeout(timer);
    unsubscribe();
    signal?.removeEventListener("abort", abort);
  }
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `mise test packages/harness/src/ops/settle.test.ts`
Expected: PASS, 6 tests. Then `mise lint:fix`, type check, `mise lint`.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/ops/settle.ts packages/harness/src/ops/settle.test.ts
mise exec -- git commit -m "feat: Add event settlement for harness tools" -m "Every action tool must report the server's answer, not its own intent. settle subscribes before it sends and gives the first matching event or nothing at a timeout."
```

Live gate: none (no protocol or daemon change).

---

## Task A6: repeat guard

Needs: F2.

**Files**

- Create: `packages/harness/src/ops/repeat-guard.ts`
- Test: `packages/harness/src/ops/repeat-guard.test.ts`

**Interfaces**

- Consumes: `Clock`, `RepeatCall`, `RepeatGuard`, `RepeatHit`
  (`#harness/contract/services`); `ToolName`, `ToolResult`
  (`#harness/contract/result`); `PoseView` (`#harness/contract/views`);
  `Refusal` (`#harness/ops/refusal`).
- Produces:

```ts
export const TIME_CODES: readonly string[];
export const REPEAT_MOVE_YD = 2;
export function createRepeatGuard(clock: Clock): RepeatGuard;
export function repeatRefusal(init: { hit: RepeatHit; tool: ToolName }): Refusal;
```

Decisions (contract issues 9–11): a failure is a result with status
`REFUSED` or `FAILED`, a `reason`, and a reason that is not in
`TIME_CODES` and is not `repeat`. `look` is never recorded or blocked. A
`DONE` of an action tool (`travel`, `engage`, `loot`, `interact`, `rest`,
`recover`, `social`) clears every stored failure; a `DONE` of `look`,
`journal` or `stop` does not. A failure stops blocking 5 min after it was
recorded.

- [ ] **Step 1: Write the failing test** `packages/harness/src/ops/repeat-guard.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import type { ToolResult } from "#harness/contract/result";
import type { RepeatCall } from "#harness/contract/services";
import type { PoseView } from "#harness/contract/views";
import { createRepeatGuard, REPEAT_MOVE_YD, repeatRefusal, TIME_CODES } from "#harness/ops/repeat-guard";

function pose(x: number): PoseView {
  return { ageMs: 0, facing: "N", mapId: 530, serverFixAgeMs: 0, source: "server", x, y: 0, z: 0 };
}

function call(over: Partial<RepeatCall> = {}): RepeatCall {
  return { args: { npc: "u3" }, digest: "d1", pose: pose(0), tool: "interact", ...over };
}

function outcome(status: ToolResult<unknown>["status"], reason?: string, next?: string): ToolResult<unknown> {
  return { after: undefined, body: [], detail: "x.", next, reason, status };
}

function guardAt(now: { t: number }) {
  return createRepeatGuard({ now: () => now.t });
}

describe("createRepeatGuard", () => {
  test("blocks the same failed call from the same place", () => {
    const guard = guardAt({ t: 0 });
    expect(guard.check(call())).toBeUndefined();
    guard.record({ ...call(), result: outcome("REFUSED", "too_far", 'travel(to: "u3")') });
    expect(guard.check(call())).toEqual({ reason: "too_far", times: 2, untried: ['travel(to: "u3")'] });
    expect(guard.hits()).toBe(1);
  });

  test("treats args with other key order as the same call", () => {
    const guard = guardAt({ t: 0 });
    const reordered = Object.fromEntries([["npc", "u3"], ["do", "buy"]]);
    guard.record({ ...call({ args: { do: "buy", npc: "u3" } }), result: outcome("FAILED", "not_enough_money") });
    expect(guard.check(call({ args: reordered }))?.reason).toBe("not_enough_money");
  });

  test("a move of REPEAT_MOVE_YD or more clears the block", () => {
    const guard = guardAt({ t: 0 });
    guard.record({ ...call(), result: outcome("REFUSED", "too_far") });
    expect(guard.check(call({ pose: pose(REPEAT_MOVE_YD - 0.5) }))).toBeDefined();
    expect(guard.check(call({ pose: pose(REPEAT_MOVE_YD) }))).toBeUndefined();
  });

  test("a changed progress digest clears the block", () => {
    const guard = guardAt({ t: 0 });
    guard.record({ ...call({ args: {}, tool: "engage" }), result: outcome("REFUSED", "low_health", "rest()") });
    expect(guard.check(call({ args: {}, digest: "d2", tool: "engage" }))).toBeUndefined();
  });

  test("time codes and repeat refusals are never stored", () => {
    const guard = guardAt({ t: 0 });
    for (const reason of [...TIME_CODES, "repeat"]) guard.record({ ...call(), result: outcome("REFUSED", reason) });
    expect(guard.check(call())).toBeUndefined();
  });

  test("a DONE of another action clears every failure, a DONE of look does not", () => {
    const guard = guardAt({ t: 0 });
    guard.record({ ...call(), result: outcome("REFUSED", "too_far") });
    guard.record({ ...call({ args: {}, tool: "look" }), result: outcome("DONE") });
    expect(guard.check(call())).toBeDefined();
    guard.record({ ...call({ args: {}, tool: "rest" }), result: outcome("DONE") });
    expect(guard.check(call())).toBeUndefined();
  });

  test("look is never blocked", () => {
    const guard = guardAt({ t: 0 });
    guard.record({ ...call({ args: {}, tool: "look" }), result: outcome("FAILED", "error") });
    expect(guard.check(call({ args: {}, tool: "look" }))).toBeUndefined();
  });

  test("a failure stops blocking after 5 minutes", () => {
    const now = { t: 0 };
    const guard = guardAt(now);
    guard.record({ ...call(), result: outcome("REFUSED", "too_far") });
    now.t = 300_001;
    expect(guard.check(call())).toBeUndefined();
  });

  test("untried lists distinct next texts, newest first, at most 3", () => {
    const now = { t: 0 };
    const guard = guardAt(now);
    const nexts = ["a()", "b()", "c()", "d()"];
    for (const [index, next] of nexts.entries()) {
      now.t += 1;
      guard.record({ ...call({ args: { n: index } }), result: outcome("REFUSED", "too_far", next) });
    }
    now.t += 1;
    guard.record({ ...call({ args: { n: 9 } }), result: outcome("REFUSED", "too_far", "d()") });
    expect(guard.check(call({ args: { n: 9 } }))?.untried).toEqual(["d()", "c()", "b()"]);
  });
});

describe("repeatRefusal", () => {
  test("names the failure and the untried options", () => {
    const refusal = repeatRefusal({ hit: { reason: "too_far", times: 2, untried: ['travel(to: "u3")'] }, tool: "interact" });
    expect(refusal.reason).toBe("repeat");
    expect(refusal.status).toBe("REFUSED");
    expect(refusal.detail).toBe("you already tried this from here and it failed (too_far).");
    expect(refusal.body).toEqual(['Untried: travel(to: "u3")']);
    expect(refusal.next).toBe('travel(to: "u3")');
  });

  test("asks the human when nothing is untried", () => {
    const refusal = repeatRefusal({ hit: { reason: "no_ground", times: 3, untried: [] }, tool: "travel" });
    expect(refusal.body).toEqual([]);
    expect(refusal.next).toBe('ask the human: "My travel call keeps failing (no_ground). What should I do?"');
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/ops/repeat-guard.test.ts`
Expected: FAIL, `Cannot find module '#harness/ops/repeat-guard'`.

- [ ] **Step 3: Implement** `packages/harness/src/ops/repeat-guard.ts`

```ts
import type { ToolName, ToolResult } from "#harness/contract/result";
import type { Clock, RepeatCall, RepeatGuard, RepeatHit } from "#harness/contract/services";
import type { PoseView } from "#harness/contract/views";
import { Refusal } from "#harness/ops/refusal";

export const TIME_CODES: readonly string[] = ["not_ready", "offline", "turn_budget", "busy", "human_waiting"];
export const REPEAT_MOVE_YD = 2;

const REPEAT_TTL_MS = 300_000;
const UNTRIED_MAX = 3;
const CLEARING: ReadonlySet<ToolName> = new Set(["travel", "engage", "loot", "interact", "rest", "recover", "social"]);

type Failure = {
  at: number;
  digest: string;
  next: string | undefined;
  pose: PoseView | undefined;
  reason: string;
  times: number;
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    entries.sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function keyOf({ args, tool }: RepeatCall): string {
  return `${tool}:${stable(args)}`;
}

function moved(a: PoseView | undefined, b: PoseView | undefined): boolean {
  if (!(a && b)) return a !== b;
  return a.mapId !== b.mapId || Math.hypot(a.x - b.x, a.y - b.y) >= REPEAT_MOVE_YD;
}

function storable(result: ToolResult<unknown>): result is ToolResult<unknown> & { reason: string } {
  const failed = result.status === "REFUSED" || result.status === "FAILED";
  return failed && result.reason !== undefined && result.reason !== "repeat" && !TIME_CODES.includes(result.reason);
}

function untriedOf(failures: Map<string, Failure>): string[] {
  const newest = [...failures.values()].sort((a, b) => b.at - a.at);
  const nexts = newest.flatMap((failure) => (failure.next ? [failure.next] : []));
  return [...new Set(nexts)].slice(0, UNTRIED_MAX);
}

export function createRepeatGuard(clock: Clock): RepeatGuard {
  const failures = new Map<string, Failure>();
  let hitCount = 0;
  const blocks = (failure: Failure, call: RepeatCall) =>
    clock.now() - failure.at <= REPEAT_TTL_MS && failure.digest === call.digest && !moved(failure.pose, call.pose);
  return {
    check(call) {
      const failure = call.tool === "look" ? undefined : failures.get(keyOf(call));
      if (!(failure && blocks(failure, call))) return;
      hitCount += 1;
      failure.times += 1;
      return { reason: failure.reason, times: failure.times, untried: untriedOf(failures) };
    },
    hits: () => hitCount,
    record(call) {
      const { result } = call;
      if (result.status === "DONE" && CLEARING.has(call.tool)) failures.clear();
      if (call.tool === "look" || !storable(result)) return;
      const times = failures.get(keyOf(call))?.times ?? 0;
      const failure = { at: clock.now(), digest: call.digest, next: result.next, pose: call.pose, reason: result.reason, times: times + 1 };
      failures.set(keyOf(call), failure);
    },
  };
}

export function repeatRefusal({ hit, tool }: { hit: RepeatHit; tool: ToolName }): Refusal {
  const ask = `ask the human: "My ${tool} call keeps failing (${hit.reason}). What should I do?"`;
  return new Refusal({
    body: hit.untried.length > 0 ? [`Untried: ${hit.untried.join("; ")}`] : [],
    detail: `you already tried this from here and it failed (${hit.reason}).`,
    next: hit.untried[0] ?? ask,
    reason: "repeat",
  });
}
```

The `record` path re-sets `at` to the newest time, so `untriedOf` orders
by the newest failure.

- [ ] **Step 4: Run it and see it pass**

Run: `mise test packages/harness/src/ops/repeat-guard.test.ts`
Expected: PASS, 11 tests. Then `mise lint:fix`, type check, `mise lint`.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/ops/repeat-guard.ts packages/harness/src/ops/repeat-guard.test.ts
mise exec -- git commit -m "feat: Refuse exact repeats of failed calls" -m "A small model repeats a failed call from the same place. The guard refuses it in code and names the steps it has not tried, unless the pose, the progress digest or another action changed the situation."
```

Live gate: none (no protocol or daemon change).

---

## Task A1a: result helpers in `tools/define.ts`

Needs: F2. (The rest of `define.ts` is A1c.)

**Files**

- Create: `packages/harness/src/tools/define.ts`
- Test: `packages/harness/src/tools/format.test.ts`

**Interfaces**

- Consumes: `ResultInit`, `ToolName`, `ToolResult`, `ToolStatus`
  (`#harness/contract/result`); `PlaceView`, `SelfView`, `UnitView`,
  `VitalsView` (`#harness/contract/views`); `JevUnavailableError`,
  `nextStepFor` (`@tuicraft/core`); `messageOf`
  (`@tuicraft/core/lib/errors`).
- Produces:

```ts
export const TURN_BUDGET = 40;
export const READY_WAIT_MS = 10_000;
export const UPDATE_EVERY_MS = 500;
export const MAX_CONTENT_LINES = 12;
export const MAX_CONTENT_BYTES = 700;
export function result<A>(status: ToolStatus, init: ResultInit<A>): ToolResult<A>;
export function formatContent(result: ToolResult<unknown>, init: { danger: string | undefined; maxLines: number }): string;
export function nextCall(tool: ToolName, args?: Record<string, string | number | boolean>): string;
export function askHuman(question: string): string;
export function coreErrorResult<A>(error: unknown, after: A): ToolResult<A>;
export function emptyVitals(): VitalsView;
export function emptyPlace(): PlaceView;
export function emptySelf(): SelfView;
export function emptyUnit(): UnitView;
```

The four `empty*` helpers (contract issue 19) build the `fallback()`
values of the tool stubs (A1d) without a handle.

- [ ] **Step 1: Write the failing test** `packages/harness/src/tools/format.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import { JevUnavailableError } from "@tuicraft/core";
import type { ToolResult } from "#harness/contract/result";
import {
  askHuman,
  coreErrorResult,
  emptySelf,
  formatContent,
  MAX_CONTENT_BYTES,
  MAX_CONTENT_LINES,
  nextCall,
  result,
} from "#harness/tools/define";

const plain = { danger: undefined, maxLines: MAX_CONTENT_LINES };

describe("result", () => {
  test("fills an empty body", () => {
    expect(result("DONE", { after: 1, detail: "ok." })).toEqual({ after: 1, body: [], detail: "ok.", status: "DONE" });
  });
});

describe("formatContent", () => {
  test("puts the status word first, then the body", () => {
    const done = result("DONE", { after: 0, body: ["Target: none. Running: nothing."], detail: "Fgklibhlflc L10 Priest." });
    expect(formatContent(done, plain)).toBe("DONE Fgklibhlflc L10 Priest.\nTarget: none. Running: nothing.");
  });

  test("writes the reason code after the status word", () => {
    const refused = result("REFUSED", { after: 0, detail: "the world is still loading.", next: "call look again in a few seconds.", reason: "not_ready" });
    expect(formatContent(refused, plain)).toBe("REFUSED not_ready: the world is still loading.\nNext: call look again in a few seconds.");
  });

  test("writes the run id for RUNNING", () => {
    const running = result("RUNNING", {
      after: 0,
      detail: "engage 1 of 3 kills, fighting Springpaw Stalker u9 (41%). You: HP 164/217, mana 61%, at 8813, -6691.",
      next: 'end your turn; a [game] message comes when r3 ends. Or stop(run: "r3").',
      reason: "yield",
      runId: "r3",
    });
    expect(formatContent(running, plain).split("\n")[0]).toStartWith("RUNNING r3: engage 1 of 3 kills");
  });

  test("puts the danger line before the Next line", () => {
    const failed = result("FAILED", { after: 0, detail: "the human stopped you. Start nothing new.", next: "end your turn and wait for the human.", reason: "cancelled" });
    const danger = "Danger: Springpaw Stalker u9 is attacking you (hit you 3 s ago). You are at 41% HP.";
    expect(formatContent(failed, { danger, maxLines: MAX_CONTENT_LINES }).split("\n")).toEqual([
      "FAILED cancelled: the human stopped you. Start nothing new.",
      danger,
      "Next: end your turn and wait for the human.",
    ]);
  });

  test("cuts the body to fit and keeps line 1, danger and Next", () => {
    const body = Array.from({ length: 30 }, (_, i) => `row ${i + 1}`);
    const long = result("DONE", { after: 0, body, detail: "many.", next: "look()" });
    const lines = formatContent(long, { danger: "Danger: x.", maxLines: 12 }).split("\n");
    expect(lines).toHaveLength(12);
    expect(lines[0]).toBe("DONE many.");
    expect(lines.at(-3)).toBe("+22 more; narrow the call.");
    expect(lines.at(-2)).toBe("Danger: x.");
    expect(lines.at(-1)).toBe("Next: look()");
  });

  test("the design stop example fits the limits", () => {
    const stop = result("DONE", { after: 0, detail: "stopped r4 (engage, 1 of 3 kills). Not moving, not attacking. HP 190/217." });
    const text = formatContent(stop, { danger: "Danger: Springpaw Stalker u9 is still attacking you. You are at 88% HP.", maxLines: MAX_CONTENT_LINES });
    expect(text.split("\n").length).toBeLessThanOrEqual(MAX_CONTENT_LINES);
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(MAX_CONTENT_BYTES);
  });
});

describe("nextCall and askHuman", () => {
  test("quotes strings and keeps numbers and booleans bare, in the given order", () => {
    expect(nextCall("engage", { target: "u9" })).toBe('engage(target: "u9")');
    expect(nextCall("engage", { count: 3, loot: false, target: "Springpaw Stalker" })).toBe('engage(count: 3, loot: false, target: "Springpaw Stalker")');
    expect(nextCall("recover")).toBe("recover()");
  });

  test("askHuman quotes the question", () => {
    expect(askHuman("Which NPC?")).toBe('ask the human: "Which NPC?"');
  });
});

describe("coreErrorResult", () => {
  const cases: [unknown, Pick<ToolResult<number>, "detail" | "next" | "reason" | "status">][] = [
    [new Error("World socket is not connected"), { detail: "the game connection is down.", next: "ask the human to run /connect.", reason: "offline", status: "REFUSED" }],
    [new Error("self_not_alive"), { detail: "you are dead.", next: "recover()", reason: "dead", status: "REFUSED" }],
    [new Error("missing_jev_key"), { detail: "TYPESAFE_API_KEY is not set.", next: "ask the human to set it.", reason: "no_combat_helper", status: "REFUSED" }],
    [new JevUnavailableError("missing_jev_key"), { detail: "TYPESAFE_API_KEY is not set.", next: "ask the human to set it.", reason: "no_combat_helper", status: "REFUSED" }],
    [
      new JevUnavailableError("HTTP 503 server"),
      { detail: "the fight helper is not answering (HTTP 503 server).", next: 'ask the human: "The fight helper is not answering. What should I do?"', reason: "jev_unavailable", status: "FAILED" },
    ],
    [
      new Error("not_implemented"),
      { detail: "this part of the harness is not built yet.", next: 'ask the human: "This action is not built yet. What should I do instead?"', reason: "not_implemented", status: "FAILED" },
    ],
  ];

  for (const [error, expected] of cases) {
    test(`maps ${String(error)}`, () => {
      expect(coreErrorResult(error, 7)).toMatchObject({ ...expected, after: 7, body: [] });
    });
  }

  test("maps <code>: <raw> to FAILED <code> with the core next step as body", () => {
    const mapped = coreErrorResult(new Error("no_ground: pathfind_find_height failed (UNKNOWN_HEIGHT)\nstack line"), 0);
    expect(mapped.status).toBe("FAILED");
    expect(mapped.reason).toBe("no_ground");
    expect(mapped.detail).toBe("pathfind_find_height failed (UNKNOWN_HEIGHT)");
    expect(mapped.next).toBe("look()");
  });

  test("maps anything else to FAILED error with the first line only", () => {
    const mapped = coreErrorResult(new Error("boom\n    at x (y.ts:1:1)"), 0);
    expect(formatContent(mapped, plain)).toBe("FAILED error: boom\nNext: look()");
  });
});

describe("empty views", () => {
  test("emptySelf has no pose and unknown life", () => {
    expect(emptySelf()).toMatchObject({ life: "unknown", pose: undefined, powerKind: "none" });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/tools/format.test.ts`
Expected: FAIL, `Cannot find module '#harness/tools/define'`.

- [ ] **Step 3: Implement** `packages/harness/src/tools/define.ts`
  (this commit holds only the helpers; A1c adds `defineGameTool`)

```ts
import { JevUnavailableError, nextStepFor } from "@tuicraft/core";
import { messageOf } from "@tuicraft/core/lib/errors";
import type { ResultInit, ToolName, ToolResult, ToolStatus } from "#harness/contract/result";
import type { PlaceView, SelfView, UnitView, VitalsView } from "#harness/contract/views";

export const TURN_BUDGET = 40;
export const READY_WAIT_MS = 10_000;
export const UPDATE_EVERY_MS = 500;
export const MAX_CONTENT_LINES = 12;
export const MAX_CONTENT_BYTES = 700;

type Mapped = Pick<ToolResult<unknown>, "detail" | "next" | "reason" | "status">;

const CODED = /^([a-z][a-z0-9_]*): (.+)$/;
const SOCKET_DOWN = "World socket is not connected";
const OFFLINE: Mapped = { detail: "the game connection is down.", next: "ask the human to run /connect.", reason: "offline", status: "REFUSED" };
const NO_HELPER: Mapped = { detail: "TYPESAFE_API_KEY is not set.", next: "ask the human to set it.", reason: "no_combat_helper", status: "REFUSED" };
const jevDown = (detail: string): Mapped => ({
  detail: `the fight helper is not answering (${detail}).`,
  next: askHuman("The fight helper is not answering. What should I do?"),
  reason: "jev_unavailable",
  status: "FAILED",
});
const KNOWN = new Map<string, Mapped>([
  ["missing_jev_key", NO_HELPER],
  ["not_implemented", { detail: "this part of the harness is not built yet.", next: askHuman("This action is not built yet. What should I do instead?"), reason: "not_implemented", status: "FAILED" }],
  ["self_not_alive", { detail: "you are dead.", next: nextCall("recover"), reason: "dead", status: "REFUSED" }],
]);

export function result<A>(status: ToolStatus, init: ResultInit<A>): ToolResult<A> {
  return { ...init, body: init.body ?? [], status };
}

function headLine({ detail, reason, runId, status }: ToolResult<unknown>): string {
  if (status === "RUNNING" && runId) return `${status} ${runId}: ${detail}`;
  if (reason) return `${status} ${reason}: ${detail}`;
  return `${status} ${detail}`;
}

function fitBody(body: readonly string[], room: number): string[] {
  if (body.length <= room) return [...body];
  if (room <= 0) return [];
  return [...body.slice(0, room - 1), `+${body.length - room + 1} more; narrow the call.`];
}

export function formatContent(outcome: ToolResult<unknown>, init: { danger: string | undefined; maxLines: number }): string {
  const next = outcome.next === undefined ? undefined : `Next: ${outcome.next}`;
  const tail = [init.danger, next].filter((line) => line !== undefined);
  const room = init.maxLines - 1 - tail.length;
  return [headLine(outcome), ...fitBody(outcome.body, room), ...tail].join("\n");
}

export function nextCall(tool: ToolName, args: Record<string, string | number | boolean> = {}): string {
  const parts = Object.entries(args).map(([key, value]) => `${key}: ${typeof value === "string" ? JSON.stringify(value) : String(value)}`);
  return `${tool}(${parts.join(", ")})`;
}

export function askHuman(question: string): string {
  return `ask the human: "${question}"`;
}

function mapped<A>(fields: Mapped, after: A): ToolResult<A> {
  return { ...fields, after, body: [] };
}

function codedResult<A>(message: string, after: A): ToolResult<A> {
  const line = message.split("\n")[0] ?? message;
  const [, code, raw] = CODED.exec(line) ?? [];
  if (!(code && raw)) return result("FAILED", { after, detail: line, next: nextCall("look"), reason: "error" });
  const step = nextStepFor(code);
  return result("FAILED", { after, body: step ? [step] : [], detail: raw, next: nextCall("look"), reason: code });
}

export function coreErrorResult<A>(error: unknown, after: A): ToolResult<A> {
  const message = messageOf(error);
  if (message.startsWith(SOCKET_DOWN)) return mapped(OFFLINE, after);
  if (error instanceof JevUnavailableError) return error.detail === "missing_jev_key" ? mapped(NO_HELPER, after) : mapped(jevDown(error.detail), after);
  const known = KNOWN.get(message);
  return known ? mapped(known, after) : codedResult(message, after);
}

export function emptyVitals(): VitalsView {
  return { hp: 0, maxHp: 0, maxPower: 0, power: 0, powerKind: "none" };
}

export function emptyPlace(): PlaceView {
  return { ageMs: undefined, area: undefined, areaId: undefined, zone: undefined, zoneId: undefined };
}

export function emptySelf(): SelfView {
  return {
    ...emptyVitals(),
    className: "unknown",
    copper: undefined,
    freeSlots: undefined,
    guid: "0",
    inCombat: false,
    level: 0,
    life: "unknown",
    name: "",
    pose: undefined,
    race: "unknown",
    xpPct: undefined,
  };
}

export function emptyUnit(): UnitView {
  return {
    alive: false,
    attackable: false,
    attackingMe: false,
    compass: undefined,
    distance: undefined,
    entry: 0,
    guid: "0",
    hp: 0,
    hpPct: 0,
    inView: false,
    kind: "creature",
    level: 0,
    lootable: false,
    maxHp: 0,
    name: "",
    ref: "",
    relation: "unknown",
    roles: [],
    seenAgoMs: 0,
    tappedByOther: false,
    targetsMe: false,
    x: undefined,
    y: undefined,
    z: undefined,
  };
}
```

Note: `KNOWN` calls `askHuman` and `nextCall` at module load; both are
hoisted function declarations.

- [ ] **Step 4: Run it and see it pass**

Run: `mise test packages/harness/src/tools/format.test.ts`
Expected: PASS, 17 tests. Then `mise lint:fix`, type check, `mise lint`.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/tools/define.ts packages/harness/src/tools/format.test.ts
mise exec -- git commit -m "feat: Add the harness tool result format" -m "Every tool result starts with one status word and ends with one Next line, so a small model can key on them. Core throws map to typed refusals and no stack reaches the model."
```

Live gate: none (no protocol or daemon change).

---

## Task A1b: tool parameter schemas

Needs: F2.

**Files**

- Create: `packages/harness/src/tools/params.ts`
- Test: `packages/harness/src/tools/params.test.ts`

**Interfaces**

- Consumes: `Type`, `StringEnum`, `Static`, `validateToolArguments`,
  `ToolCall` (`@earendil-works/pi-ai`; `StringEnum` and
  `validateToolArguments` are re-exported from `dist/index.d.ts:34-36`,
  measured).
- Produces: the ten schemas and ten `*Args` types of contract 2.7, keys
  sorted (biome `useSortedKeys`; key order in a TypeBox object does not
  change validation).

- [ ] **Step 1: Write the failing test** `packages/harness/src/tools/params.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import { type TSchema, type ToolCall, validateToolArguments } from "@earendil-works/pi-ai";
import {
  engageParams,
  interactParams,
  journalParams,
  lookParams,
  lootParams,
  recoverParams,
  restParams,
  socialParams,
  stopParams,
  travelParams,
} from "#harness/tools/params";

const ALL = { engageParams, interactParams, journalParams, lookParams, lootParams, recoverParams, restParams, socialParams, stopParams, travelParams };

function check(parameters: TSchema, args: ToolCall["arguments"]): unknown {
  return validateToolArguments({ description: "probe", name: "probe", parameters }, { arguments: args, id: "c1", name: "probe", type: "toolCall" });
}

describe("tool parameter schemas", () => {
  test("every parameter has a description", () => {
    for (const schema of Object.values(ALL)) {
      for (const property of Object.values(schema.properties)) {
        expect((property as { description?: string }).description).toBeString();
      }
    }
  });

  test("no call needs more than one required field", () => {
    for (const schema of Object.values(ALL)) expect((schema.required ?? []).length).toBeLessThanOrEqual(1);
  });

  test("look accepts the design calls and rejects bad values", () => {
    expect(check(lookParams, {})).toEqual({});
    expect(check(lookParams, { find: "hostile", within: 30 })).toEqual({ find: "hostile", within: 30 });
    expect(() => check(lookParams, { find: "monster" })).toThrow("Validation failed");
    expect(() => check(lookParams, { within: 3 })).toThrow("Validation failed");
  });

  test("engage coerces a string count", () => {
    expect(check(engageParams, { count: "3", target: "Springpaw Stalker" })).toEqual({ count: 3, target: "Springpaw Stalker" });
    expect(() => check(engageParams, { count: 11 })).toThrow("Validation failed");
  });

  test("journal needs about; travel needs to; interact needs npc", () => {
    expect(() => check(journalParams, {})).toThrow("Validation failed");
    expect(() => check(travelParams, {})).toThrow("Validation failed");
    expect(() => check(interactParams, { do: "buy" })).toThrow("Validation failed");
    expect(check(journalParams, { about: "log", since: "r4" })).toEqual({ about: "log", since: "r4" });
  });

  test("social caps text at 255 characters and allows no do", () => {
    expect(check(socialParams, { text: "I'm level 10.", to: "Kaelyn" })).toEqual({ text: "I'm level 10.", to: "Kaelyn" });
    expect(() => check(socialParams, { text: "x".repeat(256) })).toThrow("Validation failed");
  });

  test("rest, recover, loot and stop accept an empty call", () => {
    for (const schema of [restParams, recoverParams, lootParams, stopParams]) expect(check(schema, {})).toEqual({});
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/tools/params.test.ts`
Expected: FAIL, `Cannot find module '#harness/tools/params'`.

- [ ] **Step 3: Implement** `packages/harness/src/tools/params.ts`

```ts
import { type Static, StringEnum, Type } from "@earendil-works/pi-ai";

export const lookParams = Type.Object({
  find: Type.Optional(
    StringEnum(["any", "hostile", "attackable", "questgiver", "vendor", "trainer", "repair", "lootable", "player", "corpse", "spirit_healer"], {
      description: "What kind of unit to list. Default: any.",
    }),
  ),
  name: Type.Optional(Type.String({ description: 'Part of a unit name, for example "Stalker".' })),
  within: Type.Optional(
    Type.Integer({ description: "List every unit within this many yards (up to 20 rows). Default: the 6 nearest within 60 yd.", maximum: 100, minimum: 5 }),
  ),
});

export const travelParams = Type.Object({
  to: Type.String({
    description:
      'A unit id (u4), a unit name, "corpse", "explore" or "explore north" (any of north, south, east, west, northeast, northwest, southeast, southwest), "unstick", or coordinates "8764, -6683" or "8764, -6683, 72.7".',
  }),
  within: Type.Optional(Type.Number({ description: "Stop this many yards from the goal. Default 3 for a unit, 1 for coordinates.", maximum: 40, minimum: 1 })),
});

export const engageParams = Type.Object({
  count: Type.Optional(
    Type.Integer({ description: "How many kills of this kind of creature. Default 1; with quest, the kills the quest still needs.", maximum: 10, minimum: 1 }),
  ),
  how: Type.Optional(Type.String({ description: 'Short instruction for the fight helper, for example "only Smite".', maxLength: 120 })),
  loot: Type.Optional(Type.Boolean({ description: "Loot each kill. Default true." })),
  quest: Type.Optional(Type.String({ description: 'Quest id like "8325" or the quest title from journal: fight the creatures its objectives need.' })),
  target: Type.Optional(Type.String({ description: 'Unit id (u9) or name ("Springpaw Stalker"). Default: the nearest hostile you can attack.' })),
});

export const lootParams = Type.Object({
  target: Type.Optional(Type.String({ description: "Corpse unit id or name. Default: the nearest lootable corpse within 30 yd." })),
});

export const interactParams = Type.Object({
  count: Type.Optional(
    Type.Integer({ description: "How many times to buy. One buy gives the vendor's stack (water: 5). Default 1.", maximum: 20, minimum: 1 }),
  ),
  do: Type.Optional(
    StringEnum(["talk", "accept", "turn_in", "gossip", "buy", "sell_junk", "train", "repair"], { description: "Default talk: list what this NPC offers." }),
  ),
  npc: Type.String({ description: "NPC unit id (u3) or the NPC's name." }),
  reward: Type.Optional(Type.Integer({ description: "Reward choice number for turn_in.", maximum: 6, minimum: 1 })),
  what: Type.Optional(
    Type.String({ description: 'Line number or title from the talk list, gossip option number, or part of an item name to buy ("water").' }),
  ),
});

export const restParams = Type.Object({
  until: Type.Optional(Type.Integer({ description: "Stop at this percent of health and mana. Default 90.", maximum: 100, minimum: 50 })),
});

export const recoverParams = Type.Object({
  how: Type.Optional(
    StringEnum(["corpse", "spirit_healer", "accept"], { description: "Default corpse: walk back to your body. accept: take a resurrection offer." }),
  ),
});

export const socialParams = Type.Object({
  do: Type.Optional(
    StringEnum(["say", "whisper", "party", "guild", "invite", "accept_invite", "decline_invite", "leave_group"], {
      description: "Default: whisper when to is set, else say.",
    }),
  ),
  text: Type.Optional(Type.String({ description: "What to say.", maxLength: 255 })),
  to: Type.Optional(Type.String({ description: "Exact player name for whisper or invite, as the [game] line shows it." })),
});

export const journalParams = Type.Object({
  about: StringEnum(["quests", "bags", "spells", "log"], {
    description:
      "quests: your own quest log. bags: money, free bag slots, equipped gear (main hand and others) and items. spells: spells you know. log: what happened earlier.",
  }),
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

- [ ] **Step 4: Run it and see it pass**

Run: `mise test packages/harness/src/tools/params.test.ts`
Expected: PASS, 7 tests. If "engage coerces a string count" fails, Pi
0.87.1 does not coerce as LU read it (`pi-ai/dist/utils/validation.js:42-70`);
record that in the commit body and change the test to expect the
validation error, because the model then pays a turn for it.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/tools/params.ts packages/harness/src/tools/params.test.ts
mise exec -- git commit -m "feat: Add harness tool parameter schemas" -m "Each tool takes few required fields and every parameter has a description, because Pi refuses a schema miss before execute and the model pays a turn for it. StringEnum keeps the Codex path off anyOf literals."
```

Live gate: none (no protocol or daemon change).

---

## Task A8: sightings memory (30 min)

Needs: A2, F5ab (the test imports `#test-support/runtime-fixture`).

**Files**

- Create: `packages/harness/src/ops/sightings.ts`
- Test: `packages/harness/src/ops/sightings.test.ts`

**Interfaces**

- Consumes: `Clock`, `Sighting`, `Sightings` (`#harness/contract/services`);
  `NearbyRow`, `Entity`, `UnitEntity`, `Position`, `ObjectType`
  (`@tuicraft/core`); `isUnitEntity` (`#harness/ops/refs`, A2).
- Produces:

```ts
export const SIGHTING_TTL_MS = 1_800_000;
export function createSightings(clock: Clock): Sightings;
```

Decisions: `note(row)` is the main writer (A3's `unitViews` calls it for
every unit row). `attach(handle)` also follows `onEntityEvent` appear and
update events, so a unit that moves between two looks keeps a fresh
position; an entity event keeps the relation, roles and lootable flag of
the earlier sighting (else `unknown`, `[]`, `false`), because entity
events carry no relation. Self, game objects, units without a position
and (for entity events) units without a name are never stored. An
`unknown` relation in a row never overwrites a known one (contract issue
7 for the position rule). `get` and `all` hide sightings older than
`SIGHTING_TTL_MS`; `prune(now)` deletes them.

- [ ] **Step 1: Write the failing test** `packages/harness/src/ops/sightings.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import { createSightings, SIGHTING_TTL_MS } from "#harness/ops/sightings";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { gameObject, MAP_ID, nearbyRow, ORIGIN, SELF_GUID, selfRow, unitEntity } from "#test-support/world-fixtures";

function sightingsAt(now: { t: number }) {
  return createSightings({ now: () => now.t });
}

const stalker = () => unitEntity({ dx: 78, entry: 2957, guid: 0x50n, level: 7, name: "Springpaw Stalker" });

describe("createSightings", () => {
  test("note keeps position, relation, roles, level and time", () => {
    const sightings = sightingsAt({ t: 1000 });
    sightings.note(nearbyRow(stalker(), { relation: "hostile" }));
    expect(sightings.get(0x50n)).toEqual({
      alive: true,
      entry: 2957,
      guid: 0x50n,
      kind: "creature",
      level: 7,
      lootable: false,
      mapId: MAP_ID,
      name: "Springpaw Stalker",
      relation: "hostile",
      roles: [],
      seenAt: 1000,
      x: ORIGIN.x + 78,
      y: ORIGIN.y,
      z: ORIGIN.z,
    });
  });

  test("skips self rows and game objects", () => {
    const sightings = sightingsAt({ t: 0 });
    sightings.note(selfRow());
    sightings.note(nearbyRow(gameObject(0x70n, "Signpost")));
    expect(sightings.all()).toEqual([]);
  });

  test("a row without a position keeps the earlier sighting", () => {
    const now = { t: 1000 };
    const sightings = sightingsAt(now);
    sightings.note(nearbyRow(stalker(), { relation: "hostile" }));
    now.t = 2000;
    sightings.note(nearbyRow({ ...stalker(), position: undefined }));
    expect(sightings.get(0x50n)?.seenAt).toBe(1000);
  });

  test("an unknown relation does not overwrite a known one", () => {
    const sightings = sightingsAt({ t: 0 });
    sightings.note(nearbyRow(stalker(), { relation: "hostile" }));
    sightings.note(nearbyRow(stalker(), { relation: "unknown" }));
    expect(sightings.get(0x50n)?.relation).toBe("hostile");
  });

  test("hides sightings older than 30 minutes, and prune deletes them", () => {
    const now = { t: 1000 };
    const sightings = sightingsAt(now);
    sightings.note(nearbyRow(stalker()));
    now.t = 1000 + SIGHTING_TTL_MS;
    expect(sightings.all()).toHaveLength(1);
    now.t += 1;
    expect(sightings.get(0x50n)).toBeUndefined();
    expect(sightings.all()).toEqual([]);
    sightings.prune(now.t);
    now.t = 1000;
    expect(sightings.get(0x50n)).toBeUndefined();
  });

  test("attach follows entity appear and update events", async () => {
    const { handle } = await createTestRuntime();
    const control = handle.getControlState();
    handle.getControlState = () => ({ ...control, selfGuid: SELF_GUID });
    const sightings = sightingsAt({ t: 5 });
    sightings.note(nearbyRow(unitEntity({ guid: 0x60n, name: "Mana Wyrm" }), { relation: "hostile", roles: [] }));
    const off = sightings.attach(handle);
    handle.triggerEntityEvent({ changed: ["position"], entity: unitEntity({ dx: 20, guid: 0x60n, name: "Mana Wyrm" }), type: "update" });
    expect(sightings.get(0x60n)).toMatchObject({ relation: "hostile", x: ORIGIN.x + 20 });
    handle.triggerEntityEvent({ entity: unitEntity({ dx: 9, guid: 0x61n, name: "Feral Tender" }), type: "appear" });
    expect(sightings.get(0x61n)).toMatchObject({ relation: "unknown", roles: [], x: ORIGIN.x + 9 });
    handle.triggerEntityEvent({ entity: unitEntity({ guid: SELF_GUID, name: "Fgklibhlflc" }), type: "appear" });
    handle.triggerEntityEvent({ entity: unitEntity({ guid: 0x62n, name: undefined }), type: "appear" });
    expect(sightings.get(SELF_GUID)).toBeUndefined();
    expect(sightings.get(0x62n)).toBeUndefined();
    off();
    handle.triggerEntityEvent({ entity: unitEntity({ guid: 0x63n, name: "Lynx" }), type: "appear" });
    expect(sightings.get(0x63n)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/ops/sightings.test.ts`
Expected: FAIL, `Cannot find module '#harness/ops/sightings'`.

- [ ] **Step 3: Implement** `packages/harness/src/ops/sightings.ts`

```ts
import { type Entity, type NearbyRow, ObjectType, type Position, type UnitEntity } from "@tuicraft/core";
import type { Clock, Sighting, Sightings } from "#harness/contract/services";
import { isUnitEntity } from "#harness/ops/refs";

export const SIGHTING_TTL_MS = 1_800_000;

type Known = Pick<Sighting, "lootable" | "name" | "relation" | "roles">;
type Located = { entity: UnitEntity; position: Position; seenAt: number };

function sightingOf({ entity, position, seenAt }: Located, known: Known): Sighting {
  return {
    ...known,
    alive: entity.health > 0,
    entry: entity.entry,
    guid: entity.guid,
    kind: entity.objectType === ObjectType.PLAYER ? "player" : "creature",
    level: entity.level,
    mapId: position.mapId,
    seenAt,
    x: position.x,
    y: position.y,
    z: position.z,
  };
}

function fromRow(row: NearbyRow, previous: Sighting | undefined, seenAt: number): Sighting | undefined {
  const { entity, position } = row;
  if (row.self || !isUnitEntity(entity) || !position) return;
  const relation = row.relation === "unknown" ? (previous?.relation ?? "unknown") : row.relation;
  const name = entity.name ?? previous?.name ?? "unknown";
  return sightingOf({ entity, position, seenAt }, { lootable: row.lootable, name, relation, roles: row.roles });
}

function fromEntity(entity: Entity, previous: Sighting | undefined, seenAt: number): Sighting | undefined {
  const name = entity.name ?? previous?.name;
  const { position } = entity;
  if (!(isUnitEntity(entity) && position && name)) return;
  const known = { lootable: previous?.lootable ?? false, name, relation: previous?.relation ?? "unknown", roles: previous?.roles ?? [] };
  return sightingOf({ entity, position, seenAt }, known);
}

export function createSightings(clock: Clock): Sightings {
  const seen = new Map<bigint, Sighting>();
  const fresh = (sighting: Sighting) => clock.now() - sighting.seenAt <= SIGHTING_TTL_MS;
  const keep = (sighting: Sighting | undefined) => {
    if (sighting) seen.set(sighting.guid, sighting);
  };
  return {
    all: () => [...seen.values()].filter(fresh),
    attach: (handle) =>
      handle.onEntityEvent((event) => {
        if (event.type === "disappear" || event.entity.guid === handle.getControlState().selfGuid) return;
        keep(fromEntity(event.entity, seen.get(event.entity.guid), clock.now()));
      }),
    get(guid) {
      const sighting = seen.get(guid);
      return sighting && fresh(sighting) ? sighting : undefined;
    },
    note: (row) => keep(fromRow(row, seen.get(row.entity.guid), clock.now())),
    prune(now) {
      for (const [guid, sighting] of seen) if (now - sighting.seenAt > SIGHTING_TTL_MS) seen.delete(guid);
    },
  };
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `mise test packages/harness/src/ops/sightings.test.ts`
Expected: PASS, 6 tests. Then `mise lint:fix`, type check, `mise lint`.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/ops/sightings.ts packages/harness/src/ops/sightings.test.ts
mise exec -- git commit -m "feat: Remember units the client has seen" -m "The client sees about 100 yd and forgets a unit that leaves view, so the model could not find a hostile it saw a minute ago. Sightings keep the last position, relation and roles per unit for 30 minutes."
```

Live gate: none (no protocol or daemon change).

---

## Task A7a: attack ledger, danger view and danger line

Needs: A2, F5a.

**Files**

- Create: `packages/harness/src/ops/danger.ts`
- Test: `packages/harness/src/ops/danger.test.ts`

**Interfaces**

- Consumes: `AttackLedger`, `Clock`, `ViewCtx` (`#harness/contract/services`);
  `AttackerView`, `DangerView` (`#harness/contract/views`);
  `CombatState.attackers` and `CombatEvent.attacker` (C0 neutral values,
  C5 fills); `guidHex` (A2); `createTestRuntime` (F5a).
- Produces:

```ts
export function createAttackLedger(clock: Clock): AttackLedger;
export function dangerView(ctx: ViewCtx): DangerView;
export function dangerLine(view: DangerView, opts?: { still?: boolean }): string | undefined;
```

`still: true` (the `stop` tool, design B.11) says `is still attacking you`
and `are still attacking you`, so the model learns that a stop is not an
escape. Until C5 lands, `attacker` is `undefined`, so `lastHitAt` stays
`undefined` and the line drops the brackets; a test covers that path.
An unknown self HP gives `hpPct` 100 (no false alarm).

- [ ] **Step 1: Write the failing test** `packages/harness/src/ops/danger.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import type { Sighting, Sightings } from "#harness/contract/services";
import { createAttackLedger, dangerLine, dangerView } from "#harness/ops/danger";
import { createRefTable } from "#harness/ops/refs";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { nearbyRow, selfCombat, setWorld, unitEntity } from "#test-support/world-fixtures";

async function world(now: { t: number }) {
  const clock = { now: () => now.t };
  const attacks = createAttackLedger(clock);
  const { handle, rt } = await createTestRuntime({ parts: { attacks, clock, refs: createRefTable() } });
  attacks.attach(handle);
  return { attacks, handle, rt };
}

describe("createAttackLedger", () => {
  test("records attacked events that name the attacker", async () => {
    const now = { t: 1000 };
    const { attacks, handle } = await world(now);
    handle.triggerCombatEvent({ attacker: 0x50n, state: handle.getCombatState(), type: "attacked" });
    handle.triggerCombatEvent({ state: handle.getCombatState(), type: "attack_started" });
    expect(attacks.lastHitAt(0x50n)).toBe(1000);
    expect(attacks.lastAttacker()).toBe(0x50n);
  });

  test("ignores attacked events without an attacker (before C5)", async () => {
    const { attacks, handle } = await world({ t: 0 });
    handle.triggerCombatEvent({ state: handle.getCombatState(), type: "attacked" });
    expect(attacks.lastAttacker()).toBeUndefined();
  });

  test("a new attach resets the ledger", async () => {
    const { attacks, handle } = await world({ t: 0 });
    handle.triggerCombatEvent({ attacker: 0x50n, state: handle.getCombatState(), type: "attacked" });
    attacks.attach(handle);
    expect(attacks.lastHitAt(0x50n)).toBeUndefined();
  });
});

describe("dangerView and dangerLine", () => {
  test("the design example", async () => {
    const now = { t: 1000 };
    const { handle, rt } = await world(now);
    const stalker = unitEntity({ guid: 0x50n, name: "Springpaw Stalker" });
    setWorld(handle, { combat: { attackers: [0x50n], self: selfCombat({ health: 89 }) }, rows: [nearbyRow(stalker)] });
    handle.triggerCombatEvent({ attacker: 0x50n, state: handle.getCombatState(), type: "attacked" });
    now.t = 4000;
    const view = dangerView({ handle, rt });
    expect(view).toEqual({ attackers: [{ guid: "50", hitAgoMs: 3000, name: "Springpaw Stalker", ref: "u1" }], hpPct: 41 });
    expect(dangerLine(view)).toBe("Danger: Springpaw Stalker u1 is attacking you (hit you 3 s ago). You are at 41% HP.");
  });

  test("drops the brackets when no hit was seen", () => {
    const view = { attackers: [{ guid: "50", hitAgoMs: undefined, name: "Springpaw Stalker", ref: "u9" }], hpPct: 88 };
    expect(dangerLine(view)).toBe("Danger: Springpaw Stalker u9 is attacking you. You are at 88% HP.");
  });

  test("counts the other attackers", () => {
    const attacker = (ref: string) => ({ guid: ref, hitAgoMs: 1000, name: "Mana Wyrm", ref });
    expect(dangerLine({ attackers: [attacker("u3"), attacker("u4"), attacker("u5")], hpPct: 30 })).toBe(
      "Danger: Mana Wyrm u3 and 2 more are attacking you. You are at 30% HP.",
    );
  });

  test("gives no line without attackers", () => {
    expect(dangerLine({ attackers: [], hpPct: 100 })).toBeUndefined();
  });

  test("says still for a stop", () => {
    const one = { attackers: [{ guid: "50", hitAgoMs: undefined, name: "Springpaw Stalker", ref: "u9" }], hpPct: 88 };
    expect(dangerLine(one, { still: true })).toBe("Danger: Springpaw Stalker u9 is still attacking you. You are at 88% HP.");
    const attacker = (ref: string) => ({ guid: ref, hitAgoMs: 1000, name: "Mana Wyrm", ref });
    expect(dangerLine({ attackers: [attacker("u3"), attacker("u4")], hpPct: 30 }, { still: true })).toBe(
      "Danger: Mana Wyrm u3 and 1 more are still attacking you. You are at 30% HP.",
    );
  });

  test("names an attacker from sightings, else as an unknown unit", async () => {
    const wyrm: Sighting = {
      alive: true,
      entry: 15_274,
      guid: 0x60n,
      kind: "creature",
      level: 5,
      lootable: false,
      mapId: 530,
      name: "Mana Wyrm",
      relation: "hostile",
      roles: [],
      seenAt: 0,
      x: 0,
      y: 0,
      z: 0,
    };
    const sightings: Sightings = { all: () => [wyrm], attach: () => () => {}, get: (guid) => (guid === 0x60n ? wyrm : undefined), note: () => {}, prune: () => {} };
    const { handle, rt } = await createTestRuntime({ parts: { refs: createRefTable(), sightings } });
    setWorld(handle, { combat: { attackers: [0x60n, 0x61n] } });
    expect(dangerView({ handle, rt }).attackers.map((a) => a.name)).toEqual(["Mana Wyrm", "an unknown unit"]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/ops/danger.test.ts`
Expected: FAIL, `Cannot find module '#harness/ops/danger'`.

- [ ] **Step 3: Implement** `packages/harness/src/ops/danger.ts`

```ts
import type { AttackLedger, Clock, ViewCtx } from "#harness/contract/services";
import type { AttackerView, DangerView } from "#harness/contract/views";
import { guidHex } from "#harness/ops/refs";

export function createAttackLedger(clock: Clock): AttackLedger {
  const hits = new Map<bigint, number>();
  let last: bigint | undefined;
  return {
    attach(handle) {
      hits.clear();
      last = undefined;
      return handle.onCombatEvent((event) => {
        if (event.type !== "attacked" || event.attacker === undefined) return;
        hits.set(event.attacker, clock.now());
        last = event.attacker;
      });
    },
    lastAttacker: () => last,
    lastHitAt: (guid) => hits.get(guid),
  };
}

export function nameOf({ handle, rt }: ViewCtx, guid: bigint): string {
  const entity = handle.getNearbyEntities().find((candidate) => candidate.guid === guid);
  return entity?.name ?? rt.sightings.get(guid)?.name ?? "an unknown unit";
}

function attackerView(ctx: ViewCtx, guid: bigint): AttackerView {
  const { rt } = ctx;
  const hitAt = rt.attacks.lastHitAt(guid);
  const hitAgoMs = hitAt === undefined ? undefined : rt.clock.now() - hitAt;
  return { guid: guidHex(guid), hitAgoMs, name: nameOf(ctx, guid), ref: rt.refs.refOf(guid) };
}

export function dangerView(ctx: ViewCtx): DangerView {
  const { attackers, self } = ctx.handle.getCombatState();
  const { health, maxHealth } = self;
  const hpPct = health !== undefined && maxHealth ? Math.round((health / maxHealth) * 100) : 100;
  return { attackers: attackers.map((guid) => attackerView(ctx, guid)), hpPct };
}

export function dangerLine({ attackers, hpPct }: DangerView, opts: { still?: boolean } = {}): string | undefined {
  const [first] = attackers;
  if (!first) return;
  const hp = `You are at ${hpPct}% HP.`;
  const still = opts.still ? "still " : "";
  if (attackers.length > 1) return `Danger: ${first.name} ${first.ref} and ${attackers.length - 1} more are ${still}attacking you. ${hp}`;
  const ago = first.hitAgoMs === undefined ? "" : ` (hit you ${Math.round(first.hitAgoMs / 1000)} s ago)`;
  return `Danger: ${first.name} ${first.ref} is ${still}attacking you${ago}. ${hp}`;
}
```

`nameOf` is exported for A7b and A3 (contract issue 19).

- [ ] **Step 4: Run it and see it pass**

Run: `mise test packages/harness/src/ops/danger.test.ts`
Expected: PASS, 9 tests. Then `mise lint:fix`, type check, `mise lint`.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/ops/danger.ts packages/harness/src/ops/danger.test.ts
mise exec -- git commit -m "feat: Add the harness danger line" -m "Every tool result ends with one Danger line while a unit attacks the character, so the model cannot miss an attack. The ledger records when each attacker last hit, so the line can say how fresh it is."
```

Live gate: none (no protocol or daemon change).

---

## Task A7b: interrupt watch for runs

Needs: A7a.

**Files**

- Modify: `packages/harness/src/ops/danger.ts`
- Test: `packages/harness/src/ops/interrupts.test.ts`

**Interfaces**

- Consumes: `OpsCtx` (`#harness/contract/services`); `CombatEvent`
  (`@tuicraft/core`); `ControlState.blockedReason` (`"rooted"`,
  `control-core.ts:182`, read); `RecoveryEvent` `life_observed`.
- Produces:

```ts
export type InterruptRules = { newAttacker: boolean; rooted: boolean; death: boolean };
export type InterruptCause = { code: "attacked" | "rooted" | "died"; detail: string; attacker: bigint | undefined };
export type InterruptWatch = { signal: AbortSignal; cause: () => InterruptCause | undefined; dispose: () => void };
export function watchInterrupts(ctx: OpsCtx, rules: InterruptRules): InterruptWatch;
```

The watch's `signal` aborts on the first rule that fires (reason
`new Error(<code>)`) or when `ctx.signal` aborts (reason copied,
`cause()` stays `undefined`). Before C5, `attacked` events carry no
`attacker`, so the watch takes the first guid in `state.attackers` that
was not an attacker at the start.

- [ ] **Step 1: Write the failing test** `packages/harness/src/ops/interrupts.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import type { OpsCtx } from "#harness/contract/services";
import { type InterruptRules, watchInterrupts } from "#harness/ops/danger";
import { createRefTable } from "#harness/ops/refs";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { nearbyRow, setWorld, unitEntity } from "#test-support/world-fixtures";

const ALL: InterruptRules = { death: true, newAttacker: true, rooted: true };

async function setup(signal = new AbortController().signal) {
  const { handle, rt } = await createTestRuntime({ parts: { refs: createRefTable() } });
  setWorld(handle, { combat: { attackers: [0x50n] }, rows: [nearbyRow(unitEntity({ guid: 0x60n, name: "Mana Wyrm" }))] });
  const ctx: OpsCtx = { handle, progress: () => {}, rt, signal, toolCallId: "c1" };
  return { ctx, handle };
}

describe("watchInterrupts", () => {
  test("a new attacker aborts; the attacker at the start does not", async () => {
    const { ctx, handle } = await setup();
    const watch = watchInterrupts(ctx, ALL);
    handle.triggerCombatEvent({ attacker: 0x50n, state: handle.getCombatState(), type: "attacked" });
    expect(watch.signal.aborted).toBe(false);
    handle.triggerCombatEvent({ attacker: 0x60n, state: handle.getCombatState(), type: "attacked" });
    expect(watch.signal.aborted).toBe(true);
    expect(watch.cause()).toEqual({ attacker: 0x60n, code: "attacked", detail: "Mana Wyrm u1 attacked you." });
    watch.dispose();
  });

  test("before C5 it finds the new attacker in state.attackers", async () => {
    const { ctx, handle } = await setup();
    const watch = watchInterrupts(ctx, ALL);
    handle.triggerCombatEvent({ state: { ...handle.getCombatState(), attackers: [0x50n, 0x60n] }, type: "attacked" });
    expect(watch.cause()?.attacker).toBe(0x60n);
    watch.dispose();
  });

  test("newAttacker false lets the run go on", async () => {
    const { ctx, handle } = await setup();
    const watch = watchInterrupts(ctx, { ...ALL, newAttacker: false });
    handle.triggerCombatEvent({ attacker: 0x60n, state: handle.getCombatState(), type: "attacked" });
    expect(watch.signal.aborted).toBe(false);
    watch.dispose();
  });

  test("rooted aborts", async () => {
    const { ctx, handle } = await setup();
    const watch = watchInterrupts(ctx, ALL);
    handle.triggerControlEvent({ state: { ...handle.getControlState(), blockedReason: "rooted" }, type: "control_changed" });
    expect(watch.cause()).toEqual({ attacker: undefined, code: "rooted", detail: "you cannot move (rooted)." });
    watch.dispose();
  });

  test("death aborts", async () => {
    const { ctx, handle } = await setup();
    const watch = watchInterrupts(ctx, ALL);
    handle.triggerRecoveryEvent({ at: 0, state: { ...handle.getRecoveryState(), life: "dead" }, type: "life_observed" });
    expect(watch.cause()?.code).toBe("died");
    expect(watch.signal.reason).toEqual(new Error("died"));
    watch.dispose();
  });

  test("a parent abort aborts the watch without a cause", async () => {
    const parent = new AbortController();
    const { ctx } = await setup(parent.signal);
    const watch = watchInterrupts(ctx, ALL);
    parent.abort(new Error("human_stop"));
    expect(watch.signal.aborted).toBe(true);
    expect(watch.signal.reason).toEqual(new Error("human_stop"));
    expect(watch.cause()).toBeUndefined();
    watch.dispose();
  });

  test("dispose unsubscribes", async () => {
    const { ctx, handle } = await setup();
    const watch = watchInterrupts(ctx, ALL);
    watch.dispose();
    handle.triggerCombatEvent({ attacker: 0x60n, state: handle.getCombatState(), type: "attacked" });
    expect(watch.signal.aborted).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/ops/interrupts.test.ts`
Expected: FAIL, `SyntaxError: Export named 'watchInterrupts' not found in module`.

- [ ] **Step 3: Implement**: add to `packages/harness/src/ops/danger.ts`
  (and add `CombatEvent` and `OpsCtx` to its type imports)

```ts
export type InterruptRules = { newAttacker: boolean; rooted: boolean; death: boolean };
export type InterruptCause = { code: "attacked" | "rooted" | "died"; detail: string; attacker: bigint | undefined };
export type InterruptWatch = { signal: AbortSignal; cause: () => InterruptCause | undefined; dispose: () => void };

type Fire = (cause: InterruptCause) => void;
type AttackWatch = { ctx: OpsCtx; event: CombatEvent; fire: Fire; known: Set<bigint>; rules: InterruptRules };

const ROOTED: InterruptCause = { attacker: undefined, code: "rooted", detail: "you cannot move (rooted)." };
const DIED: InterruptCause = { attacker: undefined, code: "died", detail: "you died." };

function onAttacked({ ctx, event, fire, known, rules }: AttackWatch): void {
  if (event.type !== "attacked") return;
  const guid = event.attacker ?? event.state.attackers.find((candidate) => !known.has(candidate));
  if (guid === undefined || known.has(guid)) return;
  known.add(guid);
  if (rules.newAttacker) fire({ attacker: guid, code: "attacked", detail: `${nameOf(ctx, guid)} ${ctx.rt.refs.refOf(guid)} attacked you.` });
}

export function watchInterrupts(ctx: OpsCtx, rules: InterruptRules): InterruptWatch {
  const { handle, signal } = ctx;
  const controller = new AbortController();
  const known = new Set(handle.getCombatState().attackers);
  let cause: InterruptCause | undefined;
  const fire: Fire = (next) => {
    if (controller.signal.aborted) return;
    cause = next;
    controller.abort(new Error(next.code));
  };
  const follow = () => controller.abort(signal.reason);
  const offs = [
    handle.onCombatEvent((event) => onAttacked({ ctx, event, fire, known, rules })),
    handle.onControlEvent((event) => {
      if (rules.rooted && event.state.blockedReason === "rooted") fire(ROOTED);
    }),
    handle.onRecoveryEvent((event) => {
      if (rules.death && event.type === "life_observed" && event.state.life === "dead") fire(DIED);
    }),
  ];
  if (signal.aborted) follow();
  else signal.addEventListener("abort", follow, { once: true });
  return {
    cause: () => cause,
    dispose() {
      for (const off of offs) off();
      signal.removeEventListener("abort", follow);
    },
    signal: controller.signal,
  };
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `mise test packages/harness/src/ops/interrupts.test.ts packages/harness/src/ops/danger.test.ts`
Expected: PASS, 15 tests. Then `mise lint:fix`, type check, `mise lint`.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/ops/danger.ts packages/harness/src/ops/interrupts.test.ts
mise exec -- git commit -m "feat: Stop harness runs on reflex events" -m "Runs must stop in code on death, rooting or a new attacker, before the model reads anything. The watch gives run tools one signal that aborts on the first of these and names the cause."
```

Live gate: none (no protocol or daemon change).

---

## Task A9: no-progress counter

Needs: F2, L1, A2, F5ab (the test imports `#test-support/runtime-fixture` and `#test-support/world-fixtures`).

**Files**

- Create: `packages/harness/src/ops/progress.ts`
- Test: `packages/harness/src/ops/progress.test.ts`

**Interfaces**

- Consumes: `Clock`, `GameLog`, `ProgressTracker`
  (`#harness/contract/services`); `GameLogEntry`, `LogEvent`
  (`#harness/contract/log`); `NoProgress` (`#harness/contract/views`);
  `createGameLog` (L1, test only).
- Produces:

```ts
export const NO_PROGRESS_AT = 3;
export const STUCK_LOG_AT = 6;
export function createProgressTracker(init: { clock: Clock; log: GameLog }): ProgressTracker;
```

Decisions (contract issue 8): the digest is
`<life>|<map:x/2:y/2>|<target guid:hp/10>|<corpse yd/5>|<run>` where
`<run>` is `idle`, `running` or `ended` from the log's run rows. The
counter key is the digest plus the reason code. The first action after a
change gives count 0; each unchanged action adds 1. `look` and `journal`
neither add nor reset. A progress event (a log row `combat/kill_credit`,
`loot/item`, `quest/progress`, `quest/completed`, `life/dead`,
`life/released`, `life/alive`, `chat/out`, or a pose move over 5 yd from
the last anchor) resets the count and sets `lastProgress`.
`NoProgress.actions` is the count; `lastRefusal` is
`<tool> <code> x<times in a row>`.

- [ ] **Step 1: Write the failing test** `packages/harness/src/ops/progress.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import type { ProgressTracker } from "#harness/contract/services";
import { createGameLog } from "#harness/log/store";
import { createProgressTracker, NO_PROGRESS_AT, STUCK_LOG_AT } from "#harness/ops/progress";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { ORIGIN, selfPose, setWorld } from "#test-support/world-fixtures";

type Action = Parameters<ProgressTracker["afterAction"]>[0];

function tracker() {
  const now = { t: 0 };
  const clock = { now: () => now.t };
  const log = createGameLog({ char: () => "Fgklibhlflc", clock, file: undefined });
  return { log, now, progress: createProgressTracker({ clock, log }) };
}

function action(over: Partial<Action> = {}): Action {
  return { digest: "d", reason: "no_ground", status: "REFUSED", tool: "travel", untried: ['travel(to: "unstick")'], ...over };
}

describe("createProgressTracker", () => {
  test("reports no progress after NO_PROGRESS_AT unchanged actions", () => {
    const { now, progress } = tracker();
    for (let i = 0; i < NO_PROGRESS_AT; i++) progress.afterAction(action());
    expect(progress.noProgress()).toBeUndefined();
    now.t = 180_000;
    progress.afterAction(action());
    expect(progress.count()).toBe(NO_PROGRESS_AT);
    expect(progress.noProgress()).toEqual({ actions: 3, lastRefusal: "travel no_ground x4", sinceMs: 180_000, untried: ['travel(to: "unstick")'] });
  });

  test("a changed digest or reason resets the count", () => {
    const { progress } = tracker();
    for (let i = 0; i < 4; i++) progress.afterAction(action());
    progress.afterAction(action({ digest: "e" }));
    expect(progress.count()).toBe(0);
    progress.afterAction(action({ digest: "e", reason: "start_off_mesh" }));
    expect(progress.count()).toBe(0);
  });

  test("look and journal neither add nor reset", () => {
    const { progress } = tracker();
    progress.afterAction(action());
    progress.afterAction(action());
    for (let i = 0; i < 5; i++) progress.afterAction(action({ digest: "x", reason: undefined, status: "DONE", tool: "look" }));
    expect(progress.count()).toBe(1);
  });

  test("logs agent/stuck once at STUCK_LOG_AT", () => {
    const { log, progress } = tracker();
    for (let i = 0; i <= STUCK_LOG_AT + 1; i++) progress.afterAction(action());
    const stuck = log.recent(50).filter((entry) => entry.event === "agent/stuck");
    expect(stuck).toHaveLength(1);
    expect(stuck[0]?.class).toBe("log");
  });

  test("a progress event in the log resets the count and sets lastProgress", () => {
    const { log, now, progress } = tracker();
    for (let i = 0; i < 4; i++) progress.afterAction(action());
    now.t = 500;
    log.append({ class: "passive", data: {}, domain: "combat", event: "combat/kill_credit", text: "kill credit Springpaw Stalker" });
    expect(progress.count()).toBe(0);
    expect(progress.noProgress()).toBeUndefined();
    expect(progress.lastProgress()).toEqual({ at: 500, event: "combat/kill_credit" });
  });

  test("run rows change the digest", async () => {
    const { log, progress } = tracker();
    const { handle } = await createTestRuntime();
    const before = progress.digest(handle);
    log.append({ class: "log", data: {}, domain: "run", event: "run/started", text: "run started" });
    expect(progress.digest(handle)).not.toBe(before);
    expect(progress.digest(handle)).toEndWith("|running");
  });

  test("the digest keeps a 2 yd pose bucket", async () => {
    const { progress } = tracker();
    const { handle } = await createTestRuntime();
    setWorld(handle, { pose: selfPose(0, { x: 8736 }) });
    const a = progress.digest(handle);
    setWorld(handle, { pose: selfPose(0, { x: 8737 }) });
    expect(progress.digest(handle)).toBe(a);
    setWorld(handle, { pose: selfPose(0, { x: 8739 }) });
    expect(progress.digest(handle)).not.toBe(a);
  });

  test("attach counts a move over 5 yd as progress", async () => {
    const { now, progress } = tracker();
    const { handle } = await createTestRuntime();
    setWorld(handle, { pose: selfPose(0) });
    progress.attach(handle);
    const moved = (dx: number) => ({ ...handle.getControlState(), pose: selfPose(0, { x: ORIGIN.x + dx }) });
    handle.triggerControlEvent({ state: moved(4), type: "movement_stopped" });
    expect(progress.lastProgress()).toBeUndefined();
    now.t = 900;
    handle.triggerControlEvent({ state: moved(6), type: "movement_stopped" });
    expect(progress.lastProgress()).toEqual({ at: 900, event: "control/move_stop" });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/ops/progress.test.ts`
Expected: FAIL, `Cannot find module '#harness/ops/progress'`.

- [ ] **Step 3: Implement** `packages/harness/src/ops/progress.ts`

```ts
import type { CombatState, ControlPose, RecoveryState, WorldHandle } from "@tuicraft/core";
import type { GameLogEntry, LogEvent } from "#harness/contract/log";
import type { ToolName } from "#harness/contract/result";
import type { Clock, GameLog, ProgressTracker } from "#harness/contract/services";
import type { NoProgress } from "#harness/contract/views";

export const NO_PROGRESS_AT = 3;
export const STUCK_LOG_AT = 6;

const MOVE_YD = 5;
const READS: ReadonlySet<ToolName> = new Set(["look", "journal"]);
const RUN_ENDS: ReadonlySet<LogEvent> = new Set(["run/ended", "run/cancelled"]);
const PROGRESS_EVENTS: ReadonlySet<LogEvent> = new Set([
  "combat/kill_credit",
  "loot/item",
  "quest/progress",
  "quest/completed",
  "life/dead",
  "life/released",
  "life/alive",
  "chat/out",
]);

type Action = Parameters<ProgressTracker["afterAction"]>[0];
type Refused = { reason: string; times: number; tool: ToolName };
type State = {
  anchor: ControlPose | undefined;
  count: number;
  key: string | undefined;
  last: { at: number; event: LogEvent } | undefined;
  refused: Refused | undefined;
  run: string;
  since: number;
  stuckLogged: boolean;
  untried: string[];
};

function resetTo(state: State, key: string | undefined, now: number): void {
  state.count = 0;
  state.key = key;
  state.since = now;
  state.stuckLogged = false;
}

function progressed(state: State, at: number, event: LogEvent): void {
  state.last = { at, event };
  resetTo(state, undefined, at);
}

function observeEntry(state: State, entry: GameLogEntry): void {
  if (entry.event === "run/started") state.run = "running";
  if (RUN_ENDS.has(entry.event)) state.run = "ended";
  if (PROGRESS_EVENTS.has(entry.event)) progressed(state, entry.ts, entry.event);
}

function farFrom(a: ControlPose, b: ControlPose): boolean {
  return a.mapId !== b.mapId || Math.hypot(a.x - b.x, a.y - b.y) > MOVE_YD;
}

function observePose(state: State, pose: ControlPose | undefined, now: number): void {
  if (!pose) return;
  if (state.anchor && !farFrom(state.anchor, pose)) return;
  const moved = state.anchor !== undefined;
  state.anchor = pose;
  if (moved) progressed(state, now, "control/move_stop");
}

function poseBucket(pose: ControlPose | undefined): string {
  return pose ? `${pose.mapId}:${Math.floor(pose.x / 2)}:${Math.floor(pose.y / 2)}` : "-";
}

function targetBucket({ target }: CombatState): string {
  if (!target) return "-";
  const tenths = target.maxHealth ? Math.floor(((target.health ?? 0) / target.maxHealth) * 10) : 0;
  return `${target.guid.toString(16)}:${tenths}`;
}

function corpseBucket({ corpse }: RecoveryState, pose: ControlPose | undefined): string {
  if (corpse.status !== "found" || !pose) return "-";
  return String(Math.floor(Math.hypot(corpse.position.x - pose.x, corpse.position.y - pose.y) / 5));
}

function digestOf(handle: WorldHandle, run: string): string {
  const { pose } = handle.getControlState();
  const recovery = handle.getRecoveryState();
  return [recovery.life, poseBucket(pose), targetBucket(handle.getCombatState()), corpseBucket(recovery, pose), run].join("|");
}

function refusalText(refused: Refused | undefined): string | undefined {
  return refused ? `${refused.tool} ${refused.reason} x${refused.times}` : undefined;
}

function noteRefusal(state: State, { reason, status, tool }: Action): void {
  if (!(reason && (status === "REFUSED" || status === "FAILED"))) return;
  const same = state.refused?.tool === tool && state.refused.reason === reason;
  state.refused = { reason, times: same ? (state.refused?.times ?? 0) + 1 : 1, tool };
}

function logStuck(state: State, log: GameLog): void {
  state.stuckLogged = true;
  const data = { actions: state.count, lastRefusal: refusalText(state.refused), untried: state.untried };
  log.append({ class: "log", data, domain: "agent", event: "agent/stuck", text: `No progress after ${state.count} actions.` });
}

function afterAction(state: State, action: Action, deps: { clock: Clock; log: GameLog }): void {
  if (READS.has(action.tool)) return;
  const key = `${action.digest}|${action.reason ?? "-"}`;
  noteRefusal(state, action);
  if (action.untried.length > 0) state.untried = action.untried;
  if (key === state.key) state.count += 1;
  else resetTo(state, key, deps.clock.now());
  if (state.count >= STUCK_LOG_AT && !state.stuckLogged) logStuck(state, deps.log);
}

function noProgressOf(state: State, now: number): NoProgress | undefined {
  if (state.count < NO_PROGRESS_AT) return;
  return { actions: state.count, lastRefusal: refusalText(state.refused), sinceMs: now - state.since, untried: state.untried };
}

export function createProgressTracker({ clock, log }: { clock: Clock; log: GameLog }): ProgressTracker {
  const state: State = {
    anchor: undefined,
    count: 0,
    key: undefined,
    last: undefined,
    refused: undefined,
    run: "idle",
    since: clock.now(),
    stuckLogged: false,
    untried: [],
  };
  log.subscribe((entry) => observeEntry(state, entry));
  return {
    afterAction: (action) => afterAction(state, action, { clock, log }),
    attach(handle) {
      state.anchor = handle.getControlState().pose;
      return handle.onControlEvent((event) => observePose(state, event.state.pose, clock.now()));
    },
    count: () => state.count,
    digest: (handle) => digestOf(handle, state.run),
    lastProgress: () => state.last,
    noProgress: () => noProgressOf(state, clock.now()),
  };
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `mise test packages/harness/src/ops/progress.test.ts`
Expected: PASS, 8 tests. Then `mise lint:fix`, type check, `mise lint`.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/ops/progress.ts packages/harness/src/ops/progress.test.ts
mise exec -- git commit -m "feat: Count harness actions without progress" -m "A small model loops on actions that change nothing. The tracker compares a digest of life, pose, target, corpse distance, run and refusal after each action, so [now] and the stuck wake can tell it to change plan."
```

Live gate: none (no protocol or daemon change).

---

## Task A3a: unit, self, pose and place views

Needs: A2, A7a, A8.

**Files**

- Create: `packages/harness/src/ops/views.ts`
- Test: `packages/harness/src/ops/views.test.ts`

**Interfaces**

- Consumes: `ViewCtx`, `Sighting` (`#harness/contract/services`); the view
  types of `#harness/contract/views`; `CLASS_NAMES`, `NearbyRow`,
  `ObjectType`, `PlaceState` (`@tuicraft/core`); `messageOf`
  (`@tuicraft/core/lib/errors`); `guidHex`, `isUnitEntity` (A2);
  `createSightings` (A8, tests).
- Produces:

```ts
export function compassOf(radians: number): Compass;
export function poseView(ctx: ViewCtx): PoseView | undefined;
export function vitalsView(ctx: ViewCtx): VitalsView;
export function selfView(ctx: ViewCtx): SelfView;
export function placeView(ctx: ViewCtx): PlaceView;
export function unitView(ctx: ViewCtx, row: NearbyRow): UnitView;
export function sightingView(ctx: ViewCtx, sighting: Sighting): UnitView;
export function unitViews(ctx: ViewCtx): UnitView[];
export function nearestByKind(ctx: ViewCtx): Partial<Record<NearestKind, UnitView>>;
export function knownUnits(ctx: ViewCtx): UnitView[];
export function unitMatches(unit: UnitView, kind: NearestKind): boolean;
```

Decisions: `compassOf` takes a WoW bearing (`atan2(dy, dx)`, +x north,
+y west) and uses the concept order `N, NW, W, SW, S, SE, E, NE`
(`ui-tool-renderers-nerd/src/draw.ts:32`). Rage and runic power are
divided by 10 (the server sends tenths). `SelfView.race` and
`inCombat` follow contract issues 5 and 6. A getter that throws
`not_implemented` (C0 stubs before C6b) gives `undefined` fields. A
sighting view has `hp` 0, `maxHp` 0, `hpPct` 100 when last seen alive
(0 when dead), `attackable`, `attackingMe`, `targetsMe` and
`tappedByOther` false, and a 2D distance. `unitMatches` holds the
per-kind tests that `nearestByKind` and `look` share: `hostile` and
`attackable` need a living unit; `trainer` covers the three trainer
roles; `vendor` covers every `vendor*` role.

- [ ] **Step 1: Write the failing test** `packages/harness/src/ops/views.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import type { NearbyRow } from "@tuicraft/core";
import { createRefTable } from "#harness/ops/refs";
import { createSightings } from "#harness/ops/sightings";
import {
  compassOf,
  knownUnits,
  nearestByKind,
  placeView,
  poseView,
  selfView,
  unitMatches,
  unitView,
  unitViews,
  vitalsView,
} from "#harness/ops/views";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { gameObject, nearbyRow, ORIGIN, SELF_GUID, selfCombat, selfPose, selfRow, setWorld, unitEntity } from "#test-support/world-fixtures";

async function world(rows: NearbyRow[] = []) {
  const now = { t: 1_000_000 };
  const clock = { now: () => now.t };
  const { handle, rt } = await createTestRuntime({ parts: { clock, refs: createRefTable(), sightings: createSightings(clock) } });
  setWorld(handle, { pose: selfPose(now.t - 400), rows: [selfRow(), ...rows], serverPose: selfPose(now.t - 12_000, { source: "server" }) });
  return { ctx: { handle, rt }, handle, now, rt };
}

const velan = () => nearbyRow(unitEntity({ dy: -11, entry: 16_205, guid: 0x30n, level: 30, name: "Velan Brightoak" }), { relation: "friendly", roles: ["questgiver"] });
const stalker = (dx: number) => nearbyRow(unitEntity({ dx, entry: 2957, guid: 0x50n, level: 7, name: "Springpaw Stalker" }), { relation: "hostile" });

describe("compassOf", () => {
  test("uses WoW axes: +x north, +y west", () => {
    expect(compassOf(0)).toBe("N");
    expect(compassOf(Math.PI / 4)).toBe("NW");
    expect(compassOf(Math.PI / 2)).toBe("W");
    expect(compassOf(Math.PI)).toBe("S");
    expect(compassOf(-Math.PI / 2)).toBe("E");
    expect(compassOf(-Math.PI / 4)).toBe("NE");
    expect(compassOf(Math.PI * 2 - 0.1)).toBe("N");
  });
});

describe("poseView and vitalsView", () => {
  test("pose has a source, an age and the server fix age", async () => {
    const { ctx } = await world();
    expect(poseView(ctx)).toEqual({ ageMs: 400, facing: "N", mapId: 530, serverFixAgeMs: 12_000, source: "predicted", x: ORIGIN.x, y: ORIGIN.y, z: ORIGIN.z });
  });

  test("no pose gives undefined", async () => {
    const { ctx, handle } = await world();
    setWorld(handle, {});
    expect(poseView(ctx)).toBeUndefined();
  });

  test("rage is shown in whole points", async () => {
    const { ctx, handle } = await world();
    setWorld(handle, { combat: { self: selfCombat({ maxPower: 1000, power: 250, powerType: 1 }) } });
    expect(vitalsView(ctx)).toEqual({ hp: 217, maxHp: 217, maxPower: 100, power: 25, powerKind: "rage" });
  });
});

describe("selfView and placeView", () => {
  test("self reads class from the self entity and name from the profile", async () => {
    const { ctx, rt } = await world();
    expect(selfView(ctx)).toMatchObject({
      className: "Priest",
      guid: SELF_GUID.toString(16),
      hp: 217,
      inCombat: false,
      level: 10,
      life: "alive",
      name: rt.profile.character,
      powerKind: "mana",
      race: rt.ready.inWorld()?.race ?? "unknown",
    });
  });

  test("attackers put the character in combat", async () => {
    const { ctx, handle } = await world();
    setWorld(handle, { combat: { attackers: [0x50n] }, rows: [selfRow()] });
    expect(selfView(ctx).inCombat).toBe(true);
  });

  test("place gives zone, area and age", async () => {
    const { ctx, handle, now } = await world();
    setWorld(handle, { place: { area: "Fairbreeze Village", areaId: 3665, at: now.t - 240_000, zone: "Eversong Woods", zoneId: 3430 } });
    expect(placeView(ctx)).toEqual({ ageMs: 240_000, area: "Fairbreeze Village", areaId: 3665, zone: "Eversong Woods", zoneId: 3430 });
  });

  test("a place getter that is not built yet gives undefined fields", async () => {
    const { ctx, handle } = await world();
    handle.getPlaceState = () => {
      throw new Error("not_implemented");
    };
    expect(placeView(ctx)).toEqual({ ageMs: undefined, area: undefined, areaId: undefined, zone: undefined, zoneId: undefined });
  });
});

describe("unit views", () => {
  test("unitView decodes one row", async () => {
    const { ctx } = await world();
    expect(unitView(ctx, velan())).toEqual({
      alive: true,
      attackable: false,
      attackingMe: false,
      compass: "E",
      distance: 11,
      entry: 16_205,
      guid: "30",
      hp: 100,
      hpPct: 100,
      inView: true,
      kind: "creature",
      level: 30,
      lootable: false,
      maxHp: 100,
      name: "Velan Brightoak",
      ref: "u1",
      relation: "friendly",
      roles: ["questgiver"],
      seenAgoMs: 0,
      tappedByOther: false,
      targetsMe: false,
      x: ORIGIN.x,
      y: ORIGIN.y - 11,
      z: ORIGIN.z,
    });
  });

  test("targetsMe reads the unit's target", async () => {
    const { ctx } = await world();
    const row = nearbyRow(unitEntity({ guid: 0x51n, name: "Mana Wyrm", target: SELF_GUID }));
    expect(unitView(ctx, row).targetsMe).toBe(true);
  });

  test("unitViews lists units only and notes each in the sightings", async () => {
    const { ctx, rt } = await world([velan(), nearbyRow(gameObject(0x70n, "Signpost"))]);
    expect(unitViews(ctx).map((unit) => unit.name)).toEqual(["Velan Brightoak"]);
    expect(rt.sightings.get(0x30n)?.name).toBe("Velan Brightoak");
  });

  test("knownUnits adds sightings out of view, nearest first", async () => {
    const { ctx, handle, now, rt } = await world([stalker(150)]);
    unitViews(ctx);
    setWorld(handle, { pose: selfPose(now.t), rows: [selfRow(), velan()] });
    now.t += 60_000;
    const known = knownUnits(ctx);
    expect(known.map((unit) => [unit.name, unit.inView])).toEqual([
      ["Velan Brightoak", true],
      ["Springpaw Stalker", false],
    ]);
    expect(known[1]).toMatchObject({ compass: "N", distance: 150, hpPct: 100, ref: rt.refs.refOf(0x50n), seenAgoMs: 60_000 });
  });

  test("nearestByKind covers units out of view", async () => {
    const { ctx, handle, now } = await world([stalker(150)]);
    unitViews(ctx);
    setWorld(handle, { pose: selfPose(now.t), rows: [selfRow(), velan()] });
    const nearest = nearestByKind(ctx);
    expect(nearest.hostile?.name).toBe("Springpaw Stalker");
    expect(nearest.questgiver?.name).toBe("Velan Brightoak");
    expect(nearest.vendor).toBeUndefined();
  });

  test("unitMatches needs a living unit for hostile", async () => {
    const { ctx } = await world();
    const dead = unitView(ctx, nearbyRow(unitEntity({ guid: 0x52n, health: 0, name: "Springpaw Stalker" }), { lootable: true, relation: "hostile" }));
    expect(unitMatches(dead, "hostile")).toBe(false);
    expect(unitMatches(dead, "lootable")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/ops/views.test.ts`
Expected: FAIL, `Cannot find module '#harness/ops/views'`.

- [ ] **Step 3: Implement** `packages/harness/src/ops/views.ts`

```ts
import { CLASS_NAMES, type NearbyRow, ObjectType, type PlaceState, type WorldHandle } from "@tuicraft/core";
import { messageOf } from "@tuicraft/core/lib/errors";
import type { Sighting, ViewCtx } from "#harness/contract/services";
import type { Compass, NearestKind, PlaceView, PoseView, PowerKind, SelfView, UnitView, VitalsView } from "#harness/contract/views";
import { guidHex, isUnitEntity } from "#harness/ops/refs";

const COMPASS: readonly Compass[] = ["N", "NW", "W", "SW", "S", "SE", "E", "NE"];
const TURN = Math.PI * 2;
const OCTANT = Math.PI / 4;
const FAR = Number.MAX_SAFE_INTEGER;
const POWER_KINDS: Readonly<Record<number, PowerKind>> = { 0: "mana", 1: "rage", 2: "focus", 3: "energy", 6: "runic_power" };
const TENTHS: ReadonlySet<PowerKind> = new Set(["rage", "runic_power"]);
const TRAINERS: ReadonlySet<string> = new Set(["trainer", "class_trainer", "profession_trainer"]);
const NEAREST_KINDS: readonly NearestKind[] = ["hostile", "attackable", "questgiver", "vendor", "trainer", "repair", "lootable", "player", "spirit_healer"];
const KIND_TESTS: Readonly<Record<NearestKind, (unit: UnitView) => boolean>> = {
  attackable: (unit) => unit.attackable && unit.alive,
  hostile: (unit) => unit.relation === "hostile" && unit.alive,
  lootable: (unit) => unit.lootable,
  player: (unit) => unit.kind === "player",
  questgiver: (unit) => unit.roles.includes("questgiver"),
  repair: (unit) => unit.roles.includes("repair"),
  spirit_healer: (unit) => unit.roles.includes("spirit_healer"),
  trainer: (unit) => unit.roles.some((role) => TRAINERS.has(role)),
  vendor: (unit) => unit.roles.some((role) => role.startsWith("vendor")),
};

export function compassOf(radians: number): Compass {
  const turn = ((radians % TURN) + TURN) % TURN;
  return COMPASS[Math.round(turn / OCTANT) % COMPASS.length] ?? "N";
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function percent(value: number, max: number): number {
  return max > 0 ? Math.round((value / max) * 100) : 100;
}

function unbuilt<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch (error) {
    if (messageOf(error) === "not_implemented") return;
    throw error;
  }
}

export function unitMatches(unit: UnitView, kind: NearestKind): boolean {
  return KIND_TESTS[kind](unit);
}

export function poseView({ handle, rt }: ViewCtx): PoseView | undefined {
  const { pose, serverPose } = handle.getControlState();
  if (!pose) return;
  const now = rt.clock.now();
  return {
    ageMs: now - pose.updatedAt,
    facing: compassOf(pose.orientation),
    mapId: pose.mapId,
    serverFixAgeMs: serverPose ? now - serverPose.updatedAt : undefined,
    source: pose.source,
    x: round1(pose.x),
    y: round1(pose.y),
    z: round1(pose.z),
  };
}

export function vitalsView({ handle }: ViewCtx): VitalsView {
  const { self } = handle.getCombatState();
  const powerKind = POWER_KINDS[self.powerType ?? -1] ?? "none";
  const scale = TENTHS.has(powerKind) ? 10 : 1;
  return {
    hp: self.health ?? 0,
    maxHp: self.maxHealth ?? 0,
    maxPower: Math.round((self.maxPower ?? 0) / scale),
    power: Math.round((self.power ?? 0) / scale),
    powerKind,
  };
}

function xpPercent(handle: WorldHandle): number | undefined {
  const { nextLevelXp, xp } = handle.getExperienceState();
  return xp !== undefined && nextLevelXp ? Math.floor((xp / nextLevelXp) * 100) : undefined;
}

export function selfView(ctx: ViewCtx): SelfView {
  const { handle, rt } = ctx;
  const { selfGuid } = handle.getControlState();
  const combat = handle.getCombatState();
  const entity = handle.getNearbyEntities().find((candidate) => candidate.guid === selfGuid);
  const unit = isUnitEntity(entity) ? entity : undefined;
  const world = rt.ready.inWorld();
  const inventory = handle.getInventoryState();
  return {
    ...vitalsView(ctx),
    className: CLASS_NAMES[unit?.class_ ?? 0] ?? world?.className ?? "unknown",
    copper: inventory.coinage,
    freeSlots: inventory.freeSlots,
    guid: guidHex(selfGuid),
    inCombat: combat.attackers.length > 0 || combat.attacking,
    level: combat.self.level ?? unit?.level ?? world?.level ?? 0,
    life: handle.getRecoveryState().life,
    name: rt.profile.character,
    pose: poseView(ctx),
    race: world?.race ?? "unknown",
    xpPct: xpPercent(handle),
  };
}

export function placeView({ handle, rt }: ViewCtx): PlaceView {
  const place: PlaceState | undefined = unbuilt(() => handle.getPlaceState());
  const ageMs = place?.at === undefined ? undefined : rt.clock.now() - place.at;
  return { ageMs, area: place?.area, areaId: place?.areaId, zone: place?.zone, zoneId: place?.zoneId };
}

export function unitView({ handle, rt }: ViewCtx, row: NearbyRow): UnitView {
  const unit = row.entity;
  if (!isUnitEntity(unit)) throw new Error("unit_view_needs_a_unit");
  const { selfGuid } = handle.getControlState();
  const target = row.targetOf ?? unit.target;
  return {
    alive: unit.health > 0,
    attackable: row.attackable,
    attackingMe: row.attackingMe,
    compass: row.bearingRadians === null ? undefined : compassOf(row.bearingRadians),
    distance: row.distance === null ? undefined : round1(row.distance),
    entry: unit.entry,
    guid: guidHex(unit.guid),
    hp: unit.health,
    hpPct: percent(unit.health, unit.maxHealth),
    inView: true,
    kind: unit.objectType === ObjectType.PLAYER ? "player" : "creature",
    level: unit.level,
    lootable: row.lootable,
    maxHp: unit.maxHealth,
    name: unit.name ?? "unknown",
    ref: rt.refs.refOf(unit.guid),
    relation: row.relation,
    roles: row.roles,
    seenAgoMs: 0,
    tappedByOther: row.tappedByOther,
    targetsMe: target !== 0n && target === selfGuid,
    x: row.position?.x,
    y: row.position?.y,
    z: row.position?.z,
  };
}

export function sightingView({ handle, rt }: ViewCtx, sighting: Sighting): UnitView {
  const { pose } = handle.getControlState();
  const near = pose?.mapId === sighting.mapId ? pose : undefined;
  const dx = near ? sighting.x - near.x : 0;
  const dy = near ? sighting.y - near.y : 0;
  return {
    alive: sighting.alive,
    attackable: false,
    attackingMe: false,
    compass: near ? compassOf(Math.atan2(dy, dx)) : undefined,
    distance: near ? round1(Math.hypot(dx, dy)) : undefined,
    entry: sighting.entry,
    guid: guidHex(sighting.guid),
    hp: 0,
    hpPct: sighting.alive ? 100 : 0,
    inView: false,
    kind: sighting.kind,
    level: sighting.level,
    lootable: sighting.lootable,
    maxHp: 0,
    name: sighting.name,
    ref: rt.refs.refOf(sighting.guid),
    relation: sighting.relation,
    roles: sighting.roles,
    seenAgoMs: rt.clock.now() - sighting.seenAt,
    tappedByOther: false,
    targetsMe: false,
    x: sighting.x,
    y: sighting.y,
    z: sighting.z,
  };
}

export function unitViews(ctx: ViewCtx): UnitView[] {
  const rows = ctx.handle.queryNearby().filter((row) => !row.self && isUnitEntity(row.entity));
  for (const row of rows) ctx.rt.sightings.note(row);
  return rows.map((row) => unitView(ctx, row));
}

function byDistance(a: UnitView, b: UnitView): number {
  return (a.distance ?? FAR) - (b.distance ?? FAR);
}

export function knownUnits(ctx: ViewCtx): UnitView[] {
  const inView = unitViews(ctx);
  const shown = new Set(inView.map((unit) => unit.guid));
  const away = ctx.rt.sightings.all().filter((sighting) => !shown.has(guidHex(sighting.guid)));
  return [...inView, ...away.map((sighting) => sightingView(ctx, sighting))].sort(byDistance);
}

export function nearestOf(known: readonly UnitView[]): Partial<Record<NearestKind, UnitView>> {
  const nearest: Partial<Record<NearestKind, UnitView>> = {};
  for (const kind of NEAREST_KINDS) {
    const unit = known.find((candidate) => unitMatches(candidate, kind));
    if (unit) nearest[kind] = unit;
  }
  return nearest;
}

export function nearestByKind(ctx: ViewCtx): Partial<Record<NearestKind, UnitView>> {
  return nearestOf(knownUnits(ctx));
}
```

`nearestOf` is exported for A3b in the same file. `unitViews` uses the
handle's default query (the 100 yd window, `NEARBY_DEFAULT_RANGE`), so a
row list never holds the whole map.

- [ ] **Step 4: Run it and see it pass**

Run: `mise test packages/harness/src/ops/views.test.ts`
Expected: PASS, 14 tests. Then `mise lint:fix`, type check, `mise lint`.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/ops/views.ts packages/harness/src/ops/views.test.ts
mise exec -- git commit -m "feat: Add harness views of self and units" -m "Tools, [now] and the footer need one decoded view of the world: refs, relation, roles, compass and age on every unit, and a pose with its source. Units out of view come from the sightings memory."
```

Live gate: none (no protocol or daemon change).

---

## Task A3b: `[now]` snapshot and world snapshot

Needs: A3a, A7a; tests also L1, L3 (the real registry, so `active()`
behaves as contract 2.9 says).

**Files**

- Modify: `packages/harness/src/ops/views.ts`
- Test: `packages/harness/src/ops/now-snapshot.test.ts`

**Interfaces**

- Consumes: `HarnessRuntime` (`#harness/contract/services`); `NowSnapshot`,
  `SnapshotWorld`, `RunView`, `CastView`, `AuraView`, `RecoveryView`
  (`#harness/contract/views`); `CombatAura`, `CombatState`
  (`@tuicraft/core`); `dangerView` (A7a).
- Produces:

```ts
export function nowSnapshot(rt: HarnessRuntime): NowSnapshot | undefined;
export function snapshotWorld(rt: HarnessRuntime): SnapshotWorld | undefined;
```

Decisions: `hpDelta5s` is `undefined` (contract issue 4). The target is
`combat.selectedGuid`, else `control.target`, looked up among known
units. `RunView.label` is the run kind plus its string and number
arguments (`engage u9`). Aura and cast names are `spell <id>` (contract
issue 16). `recovery` is present only while dead or a ghost.

- [ ] **Step 1: Write the failing test** `packages/harness/src/ops/now-snapshot.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import type { NoProgress } from "#harness/contract/views";
import type { ProgressTracker } from "#harness/contract/services";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { createRefTable } from "#harness/ops/refs";
import { createSightings } from "#harness/ops/sightings";
import { nowSnapshot, snapshotWorld } from "#harness/ops/views";
import { createRunRegistry } from "#harness/runs/registry";
import { createTestRuntime, type TestRuntimeInit } from "#test-support/runtime-fixture";
import { nearbyRow, ORIGIN, SELF_GUID, selfPose, selfRow, setWorld, unitEntity } from "#test-support/world-fixtures";

const NOW = 1_000_000;
const stuck: NoProgress = { actions: 5, lastRefusal: "travel no_ground x3", sinceMs: 180_000, untried: ['travel(to: "unstick")'] };
const progress: ProgressTracker = {
  afterAction: () => {},
  attach: () => () => {},
  count: () => 5,
  digest: () => "d",
  lastProgress: () => undefined,
  noProgress: () => stuck,
};

async function world(init: TestRuntimeInit = {}) {
  const clock = { now: () => NOW };
  const log = createGameLog({ char: () => "Fgklibhlflc", clock, file: undefined });
  const runs = createRunRegistry({ clock, log, sink: createJsonlSink({ file: undefined }) });
  const parts = { clock, log, progress, refs: createRefTable(), runs, sightings: createSightings(clock), ...init.parts };
  const { handle, rt } = await createTestRuntime({ ...init, parts });
  return { handle, rt };
}

const stalker = () => nearbyRow(unitEntity({ dx: 23, guid: 0x50n, health: 35, level: 7, maxHealth: 137, name: "Springpaw Stalker" }), { relation: "hostile" });

describe("nowSnapshot", () => {
  test("is undefined offline or before the world is ready", async () => {
    expect(nowSnapshot((await world({ connect: false })).rt)).toBeUndefined();
    expect(nowSnapshot((await world({ ready: false })).rt)).toBeUndefined();
  });

  test("holds self, target, attackers, cast, auras, run and no-progress", async () => {
    const { handle, rt } = await world();
    const casting = { count: 0, durationMs: 1500, source: "server" as const, spellId: 585, startedAt: NOW - 500, target: 0x50n };
    const aura = { caster: SELF_GUID, duration: 18_000, flags: 0, level: 10, slot: 0, spellId: 589, stacks: 1, timeLeft: 12_000 };
    setWorld(handle, { combat: { attackers: [0x50n], casting, selectedGuid: 0x50n, targetAuras: [aura] }, pose: selfPose(NOW), rows: [selfRow(), stalker()] });
    rt.runs.start({ args: { target: "u1" }, kind: "engage", launch: () => new Promise(() => {}), toolCallId: "c1" });
    const snapshot = nowSnapshot(rt);
    expect(snapshot).toMatchObject({
      at: NOW,
      attackers: [{ name: "Springpaw Stalker", ref: "u1" }],
      hpDelta5s: undefined,
      noProgress: stuck,
      recovery: undefined,
      run: { elapsedMs: 0, id: "r1", kind: "engage", label: "engage u1" },
      selfCast: { elapsedMs: 500, spell: "spell 585", totalMs: 1500 },
      target: { hpPct: 26, name: "Springpaw Stalker", ref: "u1" },
      targetAuras: [{ mine: true, name: "spell 589", remainingMs: 12_000, spellId: 589 }],
      wake: rt.session.wake,
    });
    expect(snapshot?.nearest.hostile?.ref).toBe("u1");
    expect(snapshot?.self.inCombat).toBe(true);
  });

  test("a ghost gets the corpse distance and the reclaim delay", async () => {
    const { handle, rt } = await world();
    setWorld(handle, { life: "ghost", pose: selfPose(NOW), rows: [selfRow()] });
    const recovery = handle.getRecoveryState();
    const corpse = { corpseMapId: 530, mapId: 530, observedAt: NOW, position: { x: ORIGIN.x + 30, y: ORIGIN.y, z: ORIGIN.z }, status: "found" as const, unknown: 0 };
    handle.getRecoveryState = () => ({ ...recovery, corpse, reclaimDelay: { delayMs: 30_000, readyAt: NOW + 12_000, receivedAt: NOW - 18_000 } });
    expect(nowSnapshot(rt)?.recovery).toEqual({ corpseCompass: "N", corpseYd: 30, reclaimInMs: 12_000, spiritHealer: undefined });
  });
});

describe("snapshotWorld", () => {
  test("lists self, place, target, attackers and units in view", async () => {
    const { handle, rt } = await world();
    setWorld(handle, { pose: selfPose(NOW), rows: [selfRow(), stalker()] });
    const snapshot = snapshotWorld(rt);
    expect(snapshot?.units.map((unit) => unit.name)).toEqual(["Springpaw Stalker"]);
    expect(snapshot?.self.name).toBe(rt.profile.character);
    expect(snapshot?.target).toBeUndefined();
  });

  test("is undefined offline", async () => {
    expect(snapshotWorld((await world({ connect: false })).rt)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/ops/now-snapshot.test.ts`
Expected: FAIL, `SyntaxError: Export named 'nowSnapshot' not found in module`.

- [ ] **Step 3: Implement**: add to `packages/harness/src/ops/views.ts`
  (add `CombatAura`, `CombatState` to the core type import;
  `HarnessRuntime` to the services import; `AuraView`, `CastView`,
  `NowSnapshot`, `RecoveryView`, `RunView`, `SnapshotWorld` to the views
  import; and `import { dangerView } from "#harness/ops/danger";`)

```ts
function runView(rt: HarnessRuntime): RunView | undefined {
  const record = rt.runs.active();
  if (!record) return;
  const words = Object.values(record.args).filter((value) => typeof value === "string" || typeof value === "number");
  const label = [record.kind, ...words].join(" ");
  return { elapsedMs: rt.clock.now() - record.startedAt, id: record.id, kind: record.kind, label, progress: record.progress };
}

function castView(cast: CombatState["casting"], now: number): CastView | undefined {
  return cast ? { elapsedMs: now - cast.startedAt, spell: `spell ${cast.spellId}`, totalMs: cast.durationMs } : undefined;
}

function auraView(aura: CombatAura, selfGuid: bigint): AuraView {
  return { mine: aura.caster === selfGuid, name: `spell ${aura.spellId}`, remainingMs: aura.timeLeft, spellId: aura.spellId };
}

function targetView({ handle }: ViewCtx, known: readonly UnitView[]): UnitView | undefined {
  const guid = handle.getCombatState().selectedGuid ?? handle.getControlState().target;
  if (!guid) return;
  const hex = guidHex(guid);
  return known.find((unit) => unit.guid === hex);
}

function recoveryView({ handle, rt }: ViewCtx, known: readonly UnitView[]): RecoveryView | undefined {
  const state = handle.getRecoveryState();
  if (state.life !== "dead" && state.life !== "ghost") return;
  const { pose } = handle.getControlState();
  const corpse = state.corpse.status === "found" && state.corpse.mapId === pose?.mapId ? state.corpse.position : undefined;
  const dx = corpse && pose ? corpse.x - pose.x : undefined;
  const dy = corpse && pose ? corpse.y - pose.y : 0;
  return {
    corpseCompass: dx === undefined ? undefined : compassOf(Math.atan2(dy, dx)),
    corpseYd: dx === undefined ? undefined : Math.round(Math.hypot(dx, dy)),
    reclaimInMs: state.reclaimDelay ? Math.max(0, state.reclaimDelay.readyAt - rt.clock.now()) : undefined,
    spiritHealer: known.find((unit) => unitMatches(unit, "spirit_healer")),
  };
}

export function nowSnapshot(rt: HarnessRuntime): NowSnapshot | undefined {
  const handle = rt.handle();
  if (!(handle && rt.ready.isReady())) return;
  const ctx = { handle, rt };
  const known = knownUnits(ctx);
  const combat = handle.getCombatState();
  const now = rt.clock.now();
  const { selfGuid } = handle.getControlState();
  return {
    at: now,
    attackers: dangerView(ctx).attackers,
    hpDelta5s: undefined,
    nearest: nearestOf(known),
    noProgress: rt.progress.noProgress(),
    place: placeView(ctx),
    recovery: recoveryView(ctx, known),
    run: runView(rt),
    self: selfView(ctx),
    selfCast: castView(combat.casting, now),
    target: targetView(ctx, known),
    targetAuras: combat.targetAuras.map((aura) => auraView(aura, selfGuid)),
    wake: rt.session.wake,
  };
}

export function snapshotWorld(rt: HarnessRuntime): SnapshotWorld | undefined {
  const handle = rt.handle();
  if (!(handle && rt.ready.isReady())) return;
  const ctx = { handle, rt };
  const units = unitViews(ctx);
  return { attackers: dangerView(ctx).attackers, place: placeView(ctx), self: selfView(ctx), target: targetView(ctx, units), units };
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `mise test packages/harness/src/ops/now-snapshot.test.ts packages/harness/src/ops/views.test.ts`
Expected: PASS, 19 tests. `views.ts` stays under 500 non-blank lines
(about 300). Then `mise lint:fix`, type check, `mise lint`.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/ops/views.ts packages/harness/src/ops/now-snapshot.test.ts
mise exec -- git commit -m "feat: Build the harness now snapshot" -m "[now], the footer and look share one snapshot of self, place, target, attackers, run and the nearest unit of each kind. One builder keeps what the model sees and what the human sees the same."
```

Live gate: none (no protocol or daemon change).

---

## Task A3c: unit resolution and its refusals

Needs: A3a, A1a.

**Files**

- Create: `packages/harness/src/ops/resolve.ts`
- Test: `packages/harness/src/ops/resolve.test.ts`

**Interfaces**

- Consumes: `ViewCtx` (`#harness/contract/services`); `ToolName`
  (`#harness/contract/result`); `UnitView` (`#harness/contract/views`);
  `FactionRelation` (`@tuicraft/core`); `Refusal`; `parseRef` (A2);
  `knownUnits` (A3a); `nextCall` (A1a).
- Produces:

```ts
export type UnitQuery = { text: string; alive?: boolean; lootable?: boolean; relation?: readonly FactionRelation[] };
export type Resolved =
  | { kind: "unit"; unit: UnitView; guid: bigint }
  | { kind: "ambiguous"; candidates: UnitView[] }
  | { kind: "not_seen"; text: string };
export function resolveUnit(ctx: ViewCtx, query: UnitQuery): Resolved;
export function unitRefusal(init: { resolved: Exclude<Resolved, { kind: "unit" }>; tool: ToolName; param: string }): Refusal;
```

Decisions: a ref (`u<n>`) resolves regardless of the query filters (the
tool then checks the unit); a ref no known unit has gives `not_seen`.
Name matching is case-insensitive. The ambiguous detail names the
distinct candidate names (contract issue 3). At most 5 candidate lines.

- [ ] **Step 1: Write the failing test** `packages/harness/src/ops/resolve.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import type { NearbyRow } from "@tuicraft/core";
import { createRefTable } from "#harness/ops/refs";
import { resolveUnit, unitRefusal } from "#harness/ops/resolve";
import { createSightings } from "#harness/ops/sightings";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { nearbyRow, selfPose, selfRow, setWorld, unitEntity } from "#test-support/world-fixtures";

async function world(rows: NearbyRow[]) {
  const clock = { now: () => 1000 };
  const { handle, rt } = await createTestRuntime({ parts: { clock, refs: createRefTable(), sightings: createSightings(clock) } });
  setWorld(handle, { pose: selfPose(1000), rows: [selfRow(), ...rows] });
  return { ctx: { handle, rt }, handle, rt };
}

const named = (name: string, guid: bigint, dx: number, health = 100) => nearbyRow(unitEntity({ dx, guid, health, name }), { relation: "hostile" });

describe("resolveUnit", () => {
  test("a ref gives that unit", async () => {
    const { ctx } = await world([named("Springpaw Stalker", 0x50n, 20)]);
    expect(resolveUnit(ctx, { text: "u1" })).toMatchObject({ guid: 0x50n, kind: "unit", unit: { ref: "u1" } });
  });

  test("an unknown ref is not seen", async () => {
    const { ctx } = await world([]);
    expect(resolveUnit(ctx, { text: "u42" })).toEqual({ kind: "not_seen", text: "u42" });
  });

  test("an exact name gives the nearest living match", async () => {
    const { ctx } = await world([named("Springpaw Stalker", 0x50n, 10, 0), named("Springpaw Stalker", 0x51n, 40)]);
    expect(resolveUnit(ctx, { text: "springpaw stalker" })).toMatchObject({ guid: 0x51n, kind: "unit" });
  });

  test("part of a name with one name among the matches gives the nearest living one", async () => {
    const { ctx } = await world([named("Springpaw Stalker", 0x50n, 30), named("Springpaw Stalker", 0x51n, 20)]);
    expect(resolveUnit(ctx, { text: "stalker" })).toMatchObject({ guid: 0x51n, kind: "unit" });
  });

  test("part of a name with different names is ambiguous, nearest first", async () => {
    const { ctx } = await world([named("Springpaw Stalker", 0x50n, 20), named("Springpaw Cub", 0x51n, 10)]);
    const resolved = resolveUnit(ctx, { text: "springpaw" });
    expect(resolved.kind).toBe("ambiguous");
    expect(resolved.kind === "ambiguous" && resolved.candidates.map((unit) => unit.name)).toEqual(["Springpaw Cub", "Springpaw Stalker"]);
  });

  test("a name nobody has is not seen", async () => {
    const { ctx } = await world([named("Springpaw Stalker", 0x50n, 20)]);
    expect(resolveUnit(ctx, { text: "Kobold" })).toEqual({ kind: "not_seen", text: "Kobold" });
  });

  test("finds a unit out of view in the sightings", async () => {
    const { ctx, handle, rt } = await world([named("Mana Wyrm", 0x60n, 150)]);
    resolveUnit(ctx, { text: "u1" });
    setWorld(handle, { pose: selfPose(1000), rows: [selfRow()] });
    expect(resolveUnit(ctx, { text: "Mana Wyrm" })).toMatchObject({ guid: 0x60n, kind: "unit", unit: { inView: false } });
    expect(rt.refs.refOf(0x60n)).toBe("u1");
  });

  test("applies the alive, lootable and relation filters to names", async () => {
    const corpse = nearbyRow(unitEntity({ dx: 5, guid: 0x52n, health: 0, name: "Springpaw Stalker" }), { lootable: true, relation: "hostile" });
    const { ctx } = await world([corpse, named("Springpaw Stalker", 0x53n, 15)]);
    expect(resolveUnit(ctx, { lootable: true, text: "stalker" })).toMatchObject({ guid: 0x52n });
    expect(resolveUnit(ctx, { alive: true, text: "stalker" })).toMatchObject({ guid: 0x53n });
    expect(resolveUnit(ctx, { relation: ["friendly"], text: "stalker" }).kind).toBe("not_seen");
  });
});

describe("unitRefusal", () => {
  test("ambiguous lists ready calls, nearest first", async () => {
    const { ctx } = await world([named("Springpaw Cub", 0x51n, 10), named("Springpaw Stalker", 0x50n, 20)]);
    const resolved = resolveUnit(ctx, { text: "springpaw" });
    if (resolved.kind !== "ambiguous") throw new Error("expected ambiguous");
    const refusal = unitRefusal({ param: "target", resolved, tool: "engage" });
    expect(refusal.reason).toBe("ambiguous_unit");
    expect(refusal.detail).toBe("the name matches 2 units (Springpaw Cub, Springpaw Stalker).");
    expect(refusal.body).toEqual(['Springpaw Cub u1, 10 yd N: engage(target: "u1")', 'Springpaw Stalker u2, 20 yd N: engage(target: "u2")']);
    expect(refusal.next).toBe('engage(target: "u1")');
    expect(refusal.options).toEqual(["u1", "u2"]);
  });

  test("not seen points at explore", () => {
    const refusal = unitRefusal({ param: "npc", resolved: { kind: "not_seen", text: "Kobold" }, tool: "interact" });
    expect(refusal.reason).toBe("not_seen");
    expect(refusal.detail).toBe('no unit named "Kobold" was seen.');
    expect(refusal.next).toBe('travel(to: "explore")');
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/ops/resolve.test.ts`
Expected: FAIL, `Cannot find module '#harness/ops/resolve'`.

- [ ] **Step 3: Implement** `packages/harness/src/ops/resolve.ts`

```ts
import type { FactionRelation } from "@tuicraft/core";
import type { ToolName } from "#harness/contract/result";
import type { ViewCtx } from "#harness/contract/services";
import type { UnitView } from "#harness/contract/views";
import { Refusal } from "#harness/ops/refusal";
import { parseRef } from "#harness/ops/refs";
import { knownUnits } from "#harness/ops/views";
import { nextCall } from "#harness/tools/define";

export type UnitQuery = { text: string; alive?: boolean; lootable?: boolean; relation?: readonly FactionRelation[] };
export type Resolved =
  | { kind: "unit"; unit: UnitView; guid: bigint }
  | { kind: "ambiguous"; candidates: UnitView[] }
  | { kind: "not_seen"; text: string };

type Unresolved = Exclude<Resolved, { kind: "unit" }>;

const CANDIDATE_LINES = 5;

function fits(unit: UnitView, { alive, lootable, relation }: UnitQuery): boolean {
  if (alive !== undefined && unit.alive !== alive) return false;
  if (lootable !== undefined && unit.lootable !== lootable) return false;
  return !relation || relation.includes(unit.relation);
}

function pick(units: readonly UnitView[], text: string): Resolved {
  const unit = units.find((candidate) => candidate.alive) ?? units.at(0);
  return unit ? { guid: BigInt(`0x${unit.guid}`), kind: "unit", unit } : { kind: "not_seen", text };
}

export function resolveUnit(ctx: ViewCtx, query: UnitQuery): Resolved {
  const text = query.text.trim();
  const known = knownUnits(ctx);
  if (parseRef(text) !== undefined) return pick(known.filter((unit) => unit.ref === text), text);
  const wanted = text.toLowerCase();
  const fitting = known.filter((unit) => fits(unit, query));
  const exact = fitting.filter((unit) => unit.name.toLowerCase() === wanted);
  if (exact.length > 0) return pick(exact, text);
  const partial = fitting.filter((unit) => unit.name.toLowerCase().includes(wanted));
  if (new Set(partial.map((unit) => unit.name)).size > 1) return { candidates: partial, kind: "ambiguous" };
  return pick(partial, text);
}

function where(unit: UnitView): string {
  if (unit.distance === undefined) return "distance unknown";
  return unit.compass ? `${Math.round(unit.distance)} yd ${unit.compass}` : `${Math.round(unit.distance)} yd`;
}

export function unitRefusal({ param, resolved, tool }: { resolved: Unresolved; tool: ToolName; param: string }): Refusal {
  if (resolved.kind === "not_seen") {
    return new Refusal({ detail: `no unit named "${resolved.text}" was seen.`, next: nextCall("travel", { to: "explore" }), reason: "not_seen" });
  }
  const { candidates } = resolved;
  const names = [...new Set(candidates.map((unit) => unit.name))].join(", ");
  const call = (unit: UnitView) => nextCall(tool, { [param]: unit.ref });
  const nearest = candidates.at(0);
  return new Refusal({
    body: candidates.slice(0, CANDIDATE_LINES).map((unit) => `${unit.name} ${unit.ref}, ${where(unit)}: ${call(unit)}`),
    detail: `the name matches ${candidates.length} units (${names}).`,
    next: nearest ? call(nearest) : nextCall("look"),
    options: candidates.map((unit) => unit.ref),
    reason: "ambiguous_unit",
  });
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `mise test packages/harness/src/ops/resolve.test.ts`
Expected: PASS, 10 tests. Then `mise lint:fix`, type check, `mise lint`.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/ops/resolve.ts packages/harness/src/ops/resolve.test.ts
mise exec -- git commit -m "feat: Resolve unit refs and names in the harness" -m "Every unit parameter takes a ref, an exact name or part of a name, so the model does not have to copy guids. Different names refuse with ready calls, nearest first, and a name nobody has seen points at explore."
```

Live gate: none (no protocol or daemon change).

---

## Task A5: range helpers

Needs: A3a.

**Files**

- Create: `packages/harness/src/ops/range.ts`
- Test: `packages/harness/src/ops/range.test.ts`

**Interfaces**

- Consumes: `ViewCtx` (`#harness/contract/services`); `Compass`
  (`#harness/contract/views`); `compassOf` (A3a).
- Produces:

```ts
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
```

`distanceTo` reads the row distance for a unit in view (the whole
known list, `queryNearby({ all: true })`), else the 2D distance to its
sighting on the same map, else `undefined`.

- [ ] **Step 1: Write the failing test** `packages/harness/src/ops/range.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import { compassTo, distanceTo, LOOK_DEFAULT_ROWS, LOOK_DEFAULT_YD, LOOK_MAX_ROWS, TALK_RANGE_YD } from "#harness/ops/range";
import { createRefTable } from "#harness/ops/refs";
import { createSightings } from "#harness/ops/sightings";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { nearbyRow, ORIGIN, selfPose, selfRow, setWorld, unitEntity } from "#test-support/world-fixtures";

async function world() {
  const clock = { now: () => 0 };
  const { handle, rt } = await createTestRuntime({ parts: { clock, refs: createRefTable(), sightings: createSightings(clock) } });
  return { ctx: { handle, rt }, handle, rt };
}

describe("range helpers", () => {
  test("constants match the design", () => {
    expect([TALK_RANGE_YD, LOOK_DEFAULT_YD, LOOK_DEFAULT_ROWS, LOOK_MAX_ROWS]).toEqual([5, 60, 6, 20]);
  });

  test("distanceTo reads a unit in view", async () => {
    const { ctx, handle } = await world();
    setWorld(handle, { pose: selfPose(0), rows: [selfRow(), nearbyRow(unitEntity({ dx: 12, guid: 0x50n }))] });
    expect(distanceTo(ctx, 0x50n)).toBe(12);
  });

  test("distanceTo falls back to the sighting on the same map", async () => {
    const { ctx, handle, rt } = await world();
    rt.sightings.note(nearbyRow(unitEntity({ dx: 90, dy: 0, guid: 0x60n, name: "Mana Wyrm" })));
    setWorld(handle, { pose: selfPose(0, { x: ORIGIN.x + 30 }), rows: [selfRow()] });
    expect(distanceTo(ctx, 0x60n)).toBe(60);
    setWorld(handle, { pose: selfPose(0, { mapId: 1 }), rows: [selfRow()] });
    expect(distanceTo(ctx, 0x60n)).toBeUndefined();
  });

  test("compassTo uses WoW axes", () => {
    expect(compassTo({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe("N");
    expect(compassTo({ x: 0, y: 0 }, { x: 0, y: -10 })).toBe("E");
    expect(compassTo({ x: 0, y: 0 }, { x: -10, y: 10 })).toBe("SW");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/ops/range.test.ts`
Expected: FAIL, `Cannot find module '#harness/ops/range'`.

- [ ] **Step 3: Implement** `packages/harness/src/ops/range.ts`

```ts
import type { ViewCtx } from "#harness/contract/services";
import type { Compass } from "#harness/contract/views";
import { compassOf } from "#harness/ops/views";

export const TALK_RANGE_YD = 5;
export const INTERACT_APPROACH_YD = 4;
export const LOOT_APPROACH_YD = 3;
export const LOOT_WALK_MAX_YD = 30;
export const ENGAGE_APPROACH_YD = 30;
export const LOOK_DEFAULT_YD = 60;
export const LOOK_DEFAULT_ROWS = 6;
export const LOOK_MAX_ROWS = 20;

export function distanceTo({ handle, rt }: ViewCtx, guid: bigint): number | undefined {
  const distance = handle.queryNearby({ all: true }).find((row) => row.entity.guid === guid)?.distance;
  if (typeof distance === "number") return distance;
  const sighting = rt.sightings.get(guid);
  const { pose } = handle.getControlState();
  if (!(sighting && pose) || sighting.mapId !== pose.mapId) return;
  return Math.hypot(sighting.x - pose.x, sighting.y - pose.y);
}

export function compassTo(from: { x: number; y: number }, to: { x: number; y: number }): Compass {
  return compassOf(Math.atan2(to.y - from.y, to.x - from.x));
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `mise test packages/harness/src/ops/range.test.ts`
Expected: PASS, 4 tests. Then `mise lint:fix`, type check, `mise lint`.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/ops/range.ts packages/harness/src/ops/range.test.ts
mise exec -- git commit -m "feat: Add harness range helpers" -m "Tools check range before they send any packet and walk into range themselves. One module holds the ranges and measures to a unit in view or to its last sighting."
```

Live gate: none (no protocol or daemon change).

---

## Task A1c: `defineGameTool` and the execute order

Needs: A1a, A3a, A6, A7a, P2, F5a.

**Files**

- Modify: `packages/harness/src/tools/define.ts`
- Create: `packages/harness/test-support/tool-harness.ts`
- Test: `packages/harness/src/tools/define.test.ts`

**Interfaces**

- Consumes: `Static`, `TSchema` (`@earendil-works/pi-ai`);
  `AgentToolResult`, `AgentToolUpdateCallback`
  (`@earendil-works/pi-agent-core`); `ToolDefinition`, `ExtensionContext`
  (`@earendil-works/pi-coding-agent`); `WorldHandle` (`@tuicraft/core`);
  `ignoreFailure` (`@tuicraft/core/lib/ignore-failure`); `AfterMap`,
  `ToolDetails` (`#harness/contract/details`); `HarnessRuntime`,
  `RepeatCall`, `ToolCtx` (`#harness/contract/services`); `Refusal`;
  `repeatRefusal` (A6); `dangerLine`, `dangerView` (A7a); `poseView`
  (A3a); `TOOL_TEXT` (P2).
- Produces:

```ts
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
export function defineGameTool<P extends TSchema, K extends ToolName>(spec: GameToolSpec<P, K>): (rt: HarnessRuntime) => GameTool;
```

and, in `test-support/tool-harness.ts`:

```ts
export type ToolRun = { details: ToolDetails; text: string; updates: ToolDetails[] };
export type RunInit = { id?: string; signal?: AbortSignal };
export function runTool(tool: GameTool, args: Record<string, unknown>, init?: RunInit): Promise<ToolRun>;
```

The execute order is contract 2.6 steps 1–11. Decisions: a `Refusal`
thrown by `run` takes the latest `after` a partial update gave, else
`fallback()`; `OpsCtx.progress` is a no-op (`ignoreFailure`) for tools
that do not start a run (B run tools pass their own); the password is
replaced by `[secret]` in the logged args (contract issue 15); a result
with reason `human_stop` becomes `FAILED cancelled` with the human-stop
next line (contract 2.6 "Human stop").

- [ ] **Step 1: Write the failing test** `packages/harness/src/tools/define.test.ts`

```ts
import { describe, expect, jest, test } from "bun:test";
import { Type } from "@earendil-works/pi-ai";
import type { LookAfter, SocialAfter } from "#harness/contract/details";
import type { HarnessRuntime, ProgressTracker, ReadyGate } from "#harness/contract/services";
import { createAttackLedger } from "#harness/ops/danger";
import { Refusal } from "#harness/ops/refusal";
import { createRefTable } from "#harness/ops/refs";
import { createRepeatGuard } from "#harness/ops/repeat-guard";
import { TOOL_TEXT } from "#harness/prompt/guidelines";
import { defineGameTool, type GameToolSpec, result, type ToolKind, TURN_BUDGET, UPDATE_EVERY_MS } from "#harness/tools/define";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { runTool } from "#test-support/tool-harness";
import { nearbyRow, setWorld, unitEntity } from "#test-support/world-fixtures";

const params = Type.Object({ text: Type.Optional(Type.String()) });
type Run = GameToolSpec<typeof params, "social">["run"];

function emptySocial(): SocialAfter {
  return { action: "say", confirmed: false, systemLine: undefined, text: undefined, to: undefined };
}

function probe(run: Run, kind: ToolKind = "action") {
  return defineGameTool({ fallback: emptySocial, kind, name: "social", parameters: params, run });
}

const said: Run = () => Promise.resolve(result("DONE", { after: emptySocial(), detail: "said hi." }));
const tooFar = () =>
  jest.fn((): never => {
    throw new Refusal({ detail: "the NPC is 40 yd away.", next: 'travel(to: "u3")', reason: "too_far" });
  });

function fixedProgress(): ProgressTracker {
  return { afterAction: () => {}, attach: () => () => {}, count: () => 0, digest: () => "same", lastProgress: () => undefined, noProgress: () => undefined };
}

const notReady: ReadyGate = { attach: () => () => {}, inWorld: () => undefined, isReady: () => false, onReady: () => () => {}, whenReady: () => Promise.resolve(false) };

function toolRows(rt: HarnessRuntime) {
  return rt.log.recent(50).filter((entry) => entry.domain === "tool");
}

describe("defineGameTool", () => {
  test("a DONE result starts with the status word and logs the call and the result", async () => {
    const { rt } = await createTestRuntime();
    const out = await runTool(probe(said)(rt), {});
    expect(out.text).toBe("DONE said hi.");
    expect(out.details).toEqual({ result: { after: emptySocial(), body: [], detail: "said hi.", status: "DONE" }, tool: "social" });
    expect(toolRows(rt).map((entry) => entry.event)).toEqual(["tool/call", "tool/result"]);
    expect(rt.session.turnToolCalls).toBe(1);
  });

  test("the definition carries TOOL_TEXT and the execution mode", async () => {
    const { rt } = await createTestRuntime();
    const tool = probe(said, "read")(rt);
    expect(tool).toMatchObject({ description: TOOL_TEXT.social.description, executionMode: "parallel", label: TOOL_TEXT.social.label, name: "social" });
    expect(tool.promptGuidelines).toEqual(TOOL_TEXT.social.guidelines);
    expect(probe(said)(rt).executionMode).toBe("sequential");
  });

  test("refuses over the turn budget without running", async () => {
    const { rt } = await createTestRuntime();
    rt.session.turnToolCalls = TURN_BUDGET;
    const run = jest.fn(said);
    expect((await runTool(probe(run)(rt), {})).text).toBe("REFUSED turn_budget: report to the human now.\nNext: end your turn and report to the human.");
    expect(run).not.toHaveBeenCalled();
  });

  test("refuses offline", async () => {
    const { rt } = await createTestRuntime({ connect: false });
    expect((await runTool(probe(said)(rt), {})).text).toBe("REFUSED offline: the game connection is down.\nNext: ask the human to run /connect.");
  });

  test("refuses an action while a human message waits; a read still runs", async () => {
    const { rt } = await createTestRuntime();
    rt.session.humanWaiting = true;
    expect((await runTool(probe(said)(rt), {})).text).toBe(
      "REFUSED human_waiting: the human wrote a message. Read it before you act.\nNext: end your turn and read the human's message.",
    );
    expect((await runTool(probe(said, "read")(rt), {})).text).toBe("DONE said hi.");
    expect((await runTool(probe(said, "control")(rt), {})).text).toBe("DONE said hi.");
  });

  test("refuses before the world is ready", async () => {
    const { rt } = await createTestRuntime({ parts: { ready: notReady }, ready: false });
    expect((await runTool(probe(said)(rt), {})).text).toBe("REFUSED not_ready: the world is still loading.\nNext: call look again in a few seconds.");
  });

  test("refuses an exact repeat of a failed call without running it", async () => {
    const { rt } = await createTestRuntime({ parts: { progress: fixedProgress(), repeats: createRepeatGuard({ now: () => 0 }) } });
    const run = tooFar();
    const tool = probe(run)(rt);
    expect((await runTool(tool, { text: "a" })).text).toBe('REFUSED too_far: the NPC is 40 yd away.\nNext: travel(to: "u3")');
    expect((await runTool(tool, { text: "a" })).text).toBe(
      'REFUSED repeat: you already tried this from here and it failed (too_far).\nUntried: travel(to: "u3")\nNext: travel(to: "u3")',
    );
    expect(run).toHaveBeenCalledTimes(1);
  });

  test("look is never blocked by the repeat guard", async () => {
    const { rt } = await createTestRuntime({ parts: { progress: fixedProgress(), repeats: createRepeatGuard({ now: () => 0 }) } });
    const run = jest.fn((): never => {
      throw new Refusal({ detail: "odd.", next: "look()", reason: "odd" });
    });
    const look = defineGameTool({ fallback: () => ({}) as LookAfter, kind: "read", name: "look", parameters: params, run })(rt);
    await runTool(look, {});
    expect((await runTool(look, {})).text).toStartWith("REFUSED odd:");
    expect(run).toHaveBeenCalledTimes(2);
  });

  test("maps a core throw to a typed refusal", async () => {
    const { rt } = await createTestRuntime();
    const run: Run = () => Promise.reject(new Error("self_not_alive"));
    expect((await runTool(probe(run)(rt), {})).text).toBe("REFUSED dead: you are dead.\nNext: recover()");
  });

  test("Esc on the Pi signal halts everything", async () => {
    const { handle, rt } = await createTestRuntime();
    const controller = new AbortController();
    const run: Run = () => {
      controller.abort();
      return Promise.resolve(result("FAILED", { after: emptySocial(), detail: "stopped.", next: "look()", reason: "esc" }));
    };
    await runTool(probe(run, "run")(rt), {}, { signal: controller.signal });
    expect(handle.halt).toHaveBeenCalled();
  });

  test("a human stop becomes FAILED cancelled", async () => {
    const { rt } = await createTestRuntime();
    const run: Run = () => Promise.resolve(result("FAILED", { after: emptySocial(), detail: "run stopped.", reason: "human_stop" }));
    expect((await runTool(probe(run, "run")(rt), {})).text).toBe(
      "FAILED cancelled: the human stopped you. Start nothing new.\nNext: end your turn and wait for the human.",
    );
  });

  test("streams RUNNING partials at most once per UPDATE_EVERY_MS", async () => {
    const { clock, rt } = await createTestRuntime();
    const run: Run = (_args, ctx) => {
      const partial = result("DONE", { after: emptySocial(), detail: "walking.", runId: "r1" });
      ctx.update(partial);
      ctx.update(partial);
      clock.advance(UPDATE_EVERY_MS);
      ctx.update({ ...partial, detail: "still walking." });
      return Promise.resolve(result("DONE", { after: emptySocial(), detail: "arrived." }));
    };
    const out = await runTool(probe(run, "run")(rt), {});
    expect(out.updates.map((details) => [details.result.status, details.result.detail])).toEqual([
      ["RUNNING", "walking."],
      ["RUNNING", "still walking."],
    ]);
  });

  test("a refusal after a partial keeps the partial's after", async () => {
    const { rt } = await createTestRuntime();
    const run: Run = (_args, ctx) => {
      ctx.update(result("RUNNING", { after: { ...emptySocial(), text: "half" }, detail: "x.", runId: "r1" }));
      throw new Refusal({ detail: "lost the target.", next: "look()", reason: "lost" });
    };
    const out = await runTool(probe(run, "run")(rt), {});
    expect(out.details.result.after).toMatchObject({ text: "half" });
  });

  test("marks evidence rows as consumed by the call", async () => {
    const { rt } = await createTestRuntime();
    const row = rt.log.append({ class: "passive", data: {}, domain: "loot", event: "loot/item", text: "item Lynx Meat x1" });
    const run: Run = () => Promise.resolve(result("DONE", { after: emptySocial(), detail: "looted.", evidence: [{ domain: "loot", event: "loot/item", seq: row.seq }] }));
    await runTool(probe(run)(rt), {}, { id: "call-9" });
    expect(rt.log.get(row.seq)?.consumedBy).toBe("call-9");
  });

  test("never logs the password", async () => {
    const { rt } = await createTestRuntime();
    rt.profile.client.password = "pw1";
    await runTool(probe(said)(rt), { text: "my password is pw1" });
    const call = toolRows(rt).find((entry) => entry.event === "tool/call");
    expect(call?.data["args"]).toEqual({ text: "my password is [secret]" });
  });

  test("appends the danger line while a unit attacks", async () => {
    const { handle, rt } = await createTestRuntime({ parts: { attacks: createAttackLedger({ now: () => 0 }), refs: createRefTable() } });
    setWorld(handle, { combat: { attackers: [0x50n] }, rows: [nearbyRow(unitEntity({ guid: 0x50n, name: "Springpaw Stalker" }))] });
    expect((await runTool(probe(said)(rt), {})).text).toBe("DONE said hi.\nDanger: Springpaw Stalker u1 is attacking you. You are at 100% HP.");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/tools/define.test.ts`
Expected: FAIL, `Cannot find module '#test-support/tool-harness'` (and
`Export named 'defineGameTool' not found`).

- [ ] **Step 3: Implement**

`packages/harness/test-support/tool-harness.ts`:

```ts
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ToolDetails } from "#harness/contract/details";
import type { GameTool } from "#harness/tools/define";

export type ToolRun = { details: ToolDetails; text: string; updates: ToolDetails[] };
export type RunInit = { id?: string; signal?: AbortSignal };

export async function runTool(tool: GameTool, args: Record<string, unknown>, init: RunInit = {}): Promise<ToolRun> {
  const updates: ToolDetails[] = [];
  const onUpdate = (partial: { details: ToolDetails }) => {
    updates.push(partial.details);
  };
  const out = await tool.execute(init.id ?? "call-1", args, init.signal, onUpdate, {} as ExtensionContext);
  const text = out.content.map((part) => (part.type === "text" ? part.text : "")).join("\n");
  return { details: out.details, text, updates };
}
```

Add to `packages/harness/src/tools/define.ts` (new imports at the top,
merged with the A1a ones):

```ts
import type { Static, TSchema } from "@earendil-works/pi-ai";
import type { AgentToolResult, AgentToolUpdateCallback } from "@earendil-works/pi-agent-core";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { WorldHandle } from "@tuicraft/core";
import { ignoreFailure } from "@tuicraft/core/lib/ignore-failure";
import type { AfterMap, ToolDetails } from "#harness/contract/details";
import type { HarnessRuntime, RepeatCall, ToolCtx } from "#harness/contract/services";
import { dangerLine, dangerView } from "#harness/ops/danger";
import { Refusal } from "#harness/ops/refusal";
import { repeatRefusal } from "#harness/ops/repeat-guard";
import { poseView } from "#harness/ops/views";
import { TOOL_TEXT } from "#harness/prompt/guidelines";

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

type Call<P extends TSchema, K extends ToolName> = {
  args: Static<P>;
  onUpdate: AgentToolUpdateCallback<ToolDetails> | undefined;
  rt: HarnessRuntime;
  signal: AbortSignal | undefined;
  spec: GameToolSpec<P, K>;
  state: { current: AfterMap[K]; updatedAt: number | undefined };
  toolCallId: string;
};

type Closing<A> = { handle: WorldHandle | undefined; ms: number; outcome: ToolResult<A> };

const ACTING: ReadonlySet<ToolKind> = new Set(["action", "run"]);
const SECRET = "[secret]";
const HUMAN_STOP: Mapped = { detail: "the human stopped you. Start nothing new.", next: "end your turn and wait for the human.", reason: "cancelled", status: "FAILED" };

function detailsOf<K extends ToolName>(tool: K, outcome: ToolResult<AfterMap[K]>): ToolDetails {
  return { result: outcome, tool } as ToolDetails;
}

function scrub(value: unknown, secret: string): unknown {
  if (secret.length === 0) return value;
  if (typeof value === "string") return value.replaceAll(secret, SECRET);
  if (Array.isArray(value)) return value.map((item) => scrub(item, secret));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrub(item, secret)]));
  return value;
}

function openCall<P extends TSchema, K extends ToolName>({ args, rt, spec, toolCallId }: Call<P, K>): void {
  rt.session.turnToolCalls += 1;
  const data = { args: scrub(args, rt.profile.client.password), name: spec.name, toolCallId };
  rt.log.append({ class: "log", data, domain: "tool", event: "tool/call", text: `${spec.name} called`, tool: spec.name });
  rt.stats.call(spec.name);
}

function repeatCall<P extends TSchema, K extends ToolName>({ args, rt, spec }: Call<P, K>, handle: WorldHandle): RepeatCall {
  return { args, digest: rt.progress.digest(handle), pose: poseView({ handle, rt }), tool: spec.name };
}

async function admit<P extends TSchema, K extends ToolName>(call: Call<P, K>): Promise<WorldHandle> {
  const { rt, spec } = call;
  if (rt.session.turnToolCalls > TURN_BUDGET) throw new Refusal({ detail: "report to the human now.", next: "end your turn and report to the human.", reason: "turn_budget" });
  const handle = rt.requireHandle();
  if (ACTING.has(spec.kind) && rt.session.humanWaiting) {
    throw new Refusal({ detail: "the human wrote a message. Read it before you act.", next: "end your turn and read the human's message.", reason: "human_waiting" });
  }
  if (!(await rt.ready.whenReady(READY_WAIT_MS))) {
    throw new Refusal({ detail: "the world is still loading.", next: "call look again in a few seconds.", reason: "not_ready" });
  }
  const hit = spec.name === "look" ? undefined : rt.repeats.check(repeatCall(call, handle));
  if (!hit) return handle;
  rt.stats.repeatHit(spec.name);
  throw repeatRefusal({ hit, tool: spec.name });
}

function pushUpdate<P extends TSchema, K extends ToolName>(call: Call<P, K>, partial: ToolResult<AfterMap[K]>): void {
  const { rt, spec, state } = call;
  const running: ToolResult<AfterMap[K]> = { ...partial, status: "RUNNING" };
  const now = rt.clock.now();
  state.current = running.after;
  if (state.updatedAt !== undefined && now - state.updatedAt < UPDATE_EVERY_MS) return;
  state.updatedAt = now;
  const text = formatContent(running, { danger: undefined, maxLines: spec.maxLines ?? MAX_CONTENT_LINES });
  call.onUpdate?.({ content: [{ text, type: "text" }], details: detailsOf(spec.name, running) });
}

function toolCtx<P extends TSchema, K extends ToolName>(call: Call<P, K>, handle: WorldHandle): ToolCtx<AfterMap[K]> {
  const signal = call.signal ?? new AbortController().signal;
  return { handle, progress: ignoreFailure, rt: call.rt, signal, toolCallId: call.toolCallId, update: (partial) => pushUpdate(call, partial) };
}

async function invoke<P extends TSchema, K extends ToolName>(call: Call<P, K>, handle: WorldHandle): Promise<ToolResult<AfterMap[K]>> {
  const { rt, signal, spec } = call;
  const esc = () => {
    rt.stopAll("esc");
  };
  signal?.addEventListener("abort", esc, { once: true });
  try {
    return await spec.run(call.args, toolCtx(call, handle));
  } finally {
    signal?.removeEventListener("abort", esc);
  }
}

function fromRefusal<A>(refusal: Refusal, after: A): ToolResult<A> {
  const { body, detail, next, options, reason, status } = refusal;
  return { after, body, detail, next, options, reason, status };
}

async function outcomeOf<P extends TSchema, K extends ToolName>(call: Call<P, K>): Promise<ToolResult<AfterMap[K]>> {
  try {
    return await invoke(call, await admit(call));
  } catch (error) {
    return error instanceof Refusal ? fromRefusal(error, call.state.current) : coreErrorResult(error, call.state.current);
  }
}

function withHumanStop<A>(outcome: ToolResult<A>): ToolResult<A> {
  return outcome.reason === "human_stop" ? { ...outcome, ...HUMAN_STOP } : outcome;
}

function remember<P extends TSchema, K extends ToolName>(call: Call<P, K>, handle: WorldHandle, outcome: ToolResult<AfterMap[K]>): void {
  const { args, rt, spec } = call;
  const digest = rt.progress.digest(handle);
  const untried = outcome.next ? [outcome.next] : [];
  rt.repeats.record({ args, digest, pose: poseView({ handle, rt }), result: outcome, tool: spec.name });
  rt.progress.afterAction({ digest, reason: outcome.reason, status: outcome.status, tool: spec.name, untried });
}

function closeCall<P extends TSchema, K extends ToolName>(call: Call<P, K>, { handle, ms, outcome }: Closing<AfterMap[K]>): void {
  const { rt, spec, toolCallId } = call;
  const { reason, status } = outcome;
  if (handle) remember(call, handle, outcome);
  rt.stats.result({ ms, reason, status, tool: spec.name });
  const text = reason ? `${spec.name} ${status} ${reason}` : `${spec.name} ${status}`;
  rt.log.append({ class: "log", data: { ms, reason, status, toolCallId }, domain: "tool", event: "tool/result", text, tool: spec.name });
  for (const row of outcome.evidence ?? []) rt.log.mark(row.seq, { consumedBy: toolCallId });
}

async function runCall<P extends TSchema, K extends ToolName>(call: Call<P, K>): Promise<AgentToolResult<ToolDetails>> {
  const { rt, spec } = call;
  const startedAt = rt.clock.now();
  openCall(call);
  const outcome = withHumanStop(await outcomeOf(call));
  const handle = rt.handle();
  closeCall(call, { handle, ms: rt.clock.now() - startedAt, outcome });
  const danger = handle ? dangerLine(dangerView({ handle, rt }), { still: spec.kind === "control" }) : undefined;
  const text = formatContent(outcome, { danger, maxLines: spec.maxLines ?? MAX_CONTENT_LINES });
  return { content: [{ text, type: "text" }], details: detailsOf(spec.name, outcome) };
}

export function defineGameTool<P extends TSchema, K extends ToolName>(spec: GameToolSpec<P, K>): (rt: HarnessRuntime) => GameTool {
  const text = TOOL_TEXT[spec.name];
  const executionMode = spec.kind === "read" ? "parallel" : "sequential";
  return (rt) => ({
    description: text.description,
    execute: (toolCallId, args, signal, onUpdate) =>
      runCall({ args: args as Static<P>, onUpdate, rt, signal, spec, state: { current: spec.fallback(), updatedAt: undefined }, toolCallId }),
    executionMode,
    label: text.label,
    name: spec.name,
    parameters: spec.parameters,
    promptGuidelines: text.guidelines,
  });
}
```

`define.ts` stays under 500 non-blank lines (about 330). If `tsc`
rejects the `as ToolDetails` assertion in `detailsOf` (a generic `K`
can make the union not comparable), write `as unknown as ToolDetails`;
it is the one place a generic tool name meets the details union.

- [ ] **Step 4: Run it and see it pass**

Run: `mise test packages/harness/src/tools/define.test.ts packages/harness/src/tools/format.test.ts`
Expected: PASS, 33 tests. Then `mise lint:fix`, type check, `mise lint`.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/tools/define.ts packages/harness/src/tools/define.test.ts packages/harness/test-support/tool-harness.ts
mise exec -- git commit -m "feat: Add the harness game tool wrapper" -m "Every tool must pass the same guards in the same order: turn budget, connection, a waiting human, world readiness and the repeat guard. One wrapper does that, logs the call and the result, and appends the danger line."
```

Live gate: none (no protocol or daemon change).

---

## Task A1d: tool stubs, registry, `installTools` and its extension line

Needs: A1b, A1c, U5, F7a.

**Files**

- Modify: `packages/harness/src/tools/define.ts` (adds `notBuilt`)
- Create: `packages/harness/src/tools/look.ts`, `travel.ts`, `engage.ts`,
  `loot.ts`, `interact.ts`, `rest.ts`, `recover.ts`, `social.ts`,
  `journal.ts`, `stop.ts` (all under `packages/harness/src/tools/`)
- Create: `packages/harness/src/tools/registry.ts`
- Create: `packages/harness/src/tools/install.ts`
- Modify: `packages/harness/src/extension/extension.ts` (insertion
  point: one import and the line `installTools(pi, rt);` after
  `installGuards(pi, rt);`)
- Test: `packages/harness/src/tools/install.test.ts`

**Interfaces**

- Consumes: `ExtensionAPI`, `ToolExecutionEndEvent`,
  `MessageEndEventResult` (`@earendil-works/pi-coding-agent`);
  `AgentMessage` (`@earendil-works/pi-agent-core`); `rendererFor` (U5);
  the ten schemas (A1b); `defineGameTool`, `askHuman`, `nextCall`,
  `emptyPlace`, `emptySelf`, `emptyUnit`, `emptyVitals` (A1a, A1c).
- Produces:

```ts
export function notBuilt(): never;
export const lookTool: (rt: HarnessRuntime) => GameTool;
export const travelTool: (rt: HarnessRuntime) => GameTool;
export const engageTool: (rt: HarnessRuntime) => GameTool;
export const lootTool: (rt: HarnessRuntime) => GameTool;
export const interactTool: (rt: HarnessRuntime) => GameTool;
export const restTool: (rt: HarnessRuntime) => GameTool;
export const recoverTool: (rt: HarnessRuntime) => GameTool;
export const socialTool: (rt: HarnessRuntime) => GameTool;
export const journalTool: (rt: HarnessRuntime) => GameTool;
export const stopTool: (rt: HarnessRuntime) => GameTool;
export function gameTools(rt: HarnessRuntime): GameTool[];
export function installTools(pi: ExtensionAPI, rt: HarnessRuntime): void;
```

Decisions: `installTools` counts schema misses on `tool_execution_end`
and appends `Minimal valid call: <call>` to the second and later miss in
a row of one tool through a `message_end` replacement (contract issue 1).
Any non-validation end of that tool resets its count. The stubs' refusal
is checked by each later tool task's failing-test step (it fails with the
stub text), so no committed test pins the stub text.

- [ ] **Step 1: Write the failing test** `packages/harness/src/tools/install.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ToolName } from "#harness/contract/result";
import type { GameTool } from "#harness/tools/define";
import { installTools } from "#harness/tools/install";
import { gameTools } from "#harness/tools/registry";
import { rendererFor } from "#harness/ui/renderers/registry";
import { createTestRuntime } from "#test-support/runtime-fixture";

type Handler = (event: unknown) => unknown;

const ORDER: ToolName[] = ["look", "travel", "engage", "loot", "interact", "rest", "recover", "social", "journal", "stop"];

function fakePi() {
  const tools: GameTool[] = [];
  const handlers = new Map<string, Handler[]>();
  const api = {
    on(name: string, handler: Handler) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
    registerTool(tool: GameTool) {
      tools.push(tool);
    },
  };
  const emit = (name: string, event: unknown) => (handlers.get(name) ?? []).map((handler) => handler(event));
  return { emit, pi: api as unknown as ExtensionAPI, tools };
}

function ended(toolName: string, isError: boolean, text: string) {
  return { isError, result: { content: [{ text, type: "text" }], details: {} }, toolCallId: "c1", toolName, type: "tool_execution_end" };
}

function toolMessage(toolName: string) {
  const message = { content: [{ text: `Validation failed for tool "${toolName}"`, type: "text" }], isError: true, role: "toolResult", timestamp: 0, toolCallId: "c1", toolName };
  return { message, type: "message_end" };
}

const miss = (toolName: string) => ended(toolName, true, `Validation failed for tool "${toolName}":\n  - to: must be string`);

describe("gameTools", () => {
  test("returns the ten tools in design order; look and journal run in parallel", async () => {
    const { rt } = await createTestRuntime();
    const tools = gameTools(rt);
    expect(tools.map((tool) => tool.name)).toEqual(ORDER);
    const parallel = tools.filter((tool) => tool.executionMode === "parallel").map((tool) => tool.name);
    expect(parallel).toEqual(["look", "journal"]);
  });
});

describe("installTools", () => {
  test("registers every tool with its renderer family", async () => {
    const { rt } = await createTestRuntime();
    const { pi, tools } = fakePi();
    installTools(pi, rt);
    expect(tools.map((tool) => tool.name)).toEqual(ORDER);
    for (const tool of tools) {
      const renderers = rendererFor(tool.name as ToolName);
      expect(tool.renderCall).toBe(renderers.renderCall);
      expect(tool.renderResult).toBe(renderers.renderResult);
    }
  });

  test("appends the minimal valid call from the second miss in a row", async () => {
    const { rt } = await createTestRuntime();
    const { emit, pi } = fakePi();
    installTools(pi, rt);
    emit("tool_execution_end", miss("travel"));
    expect(emit("message_end", toolMessage("travel"))).toEqual([undefined]);
    emit("tool_execution_end", miss("travel"));
    const [hinted] = emit("message_end", toolMessage("travel"));
    expect(hinted).toMatchObject({ message: { content: [{ type: "text" }, { text: 'Minimal valid call: travel(to: "explore")', type: "text" }], role: "toolResult" } });
    expect(rt.log.recent(20).filter((entry) => entry.event === "tool/validation_error")).toHaveLength(2);
  });

  test("a good result resets the count", async () => {
    const { rt } = await createTestRuntime();
    const { emit, pi } = fakePi();
    installTools(pi, rt);
    emit("tool_execution_end", miss("journal"));
    emit("tool_execution_end", ended("journal", false, "DONE 2 quests."));
    emit("tool_execution_end", miss("journal"));
    expect(emit("message_end", toolMessage("journal"))).toEqual([undefined]);
  });

  test("leaves other tools and assistant messages alone", async () => {
    const { rt } = await createTestRuntime();
    const { emit, pi } = fakePi();
    installTools(pi, rt);
    emit("tool_execution_end", miss("bash"));
    emit("tool_execution_end", miss("bash"));
    expect(emit("message_end", toolMessage("bash"))).toEqual([undefined]);
    expect(emit("message_end", { message: { content: [], role: "assistant" }, type: "message_end" })).toEqual([undefined]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/tools/install.test.ts`
Expected: FAIL, `Cannot find module '#harness/tools/install'`.

- [ ] **Step 3: Implement**

Add to `packages/harness/src/tools/define.ts`:

```ts
export function notBuilt(): never {
  throw new Refusal({ detail: "this tool is not built yet.", next: askHuman("This tool is not built yet. What should I do instead?"), reason: "not_implemented" });
}
```

The ten stubs. Each file has the final schema, kind and fallback; its
tool task replaces only `run` (and adds its helpers).

`packages/harness/src/tools/look.ts`:

```ts
import type { LookAfter } from "#harness/contract/details";
import { defineGameTool, emptyPlace, emptySelf, notBuilt } from "#harness/tools/define";
import { lookParams } from "#harness/tools/params";

function emptyLook(): LookAfter {
  return {
    danger: { attackers: [], hpPct: 100 },
    filter: "any",
    matched: 0,
    name: undefined,
    nearest: {},
    place: emptyPlace(),
    rows: [],
    run: undefined,
    seen: 0,
    self: emptySelf(),
    target: undefined,
    unchanged: 0,
    within: undefined,
  };
}

export const lookTool = defineGameTool({ fallback: emptyLook, kind: "read", maxLines: 24, name: "look", parameters: lookParams, run: notBuilt });
```

`packages/harness/src/tools/travel.ts`:

```ts
import type { TravelAfter } from "#harness/contract/details";
import { defineGameTool, notBuilt } from "#harness/tools/define";
import { travelParams } from "#harness/tools/params";

function emptyTravel(): TravelAfter {
  return {
    elapsedMs: 0,
    floorRetried: false,
    floors: undefined,
    goal: { direction: undefined, kind: "explore" },
    legs: [],
    newInView: [],
    pose: undefined,
    remainingYd: undefined,
    totalYd: undefined,
    traveledYd: 0,
  };
}

export const travelTool = defineGameTool({ fallback: emptyTravel, kind: "run", name: "travel", parameters: travelParams, run: notBuilt });
```

`packages/harness/src/tools/engage.ts`:

```ts
import type { EngageAfter } from "#harness/contract/details";
import { defineGameTool, emptyVitals, notBuilt } from "#harness/tools/define";
import { engageParams } from "#harness/tools/params";

function emptyEngage(): EngageAfter {
  return {
    cast: undefined,
    castErrors: [],
    copper: 0,
    current: undefined,
    decisions: [],
    how: "",
    kills: 0,
    loot: [],
    mode: "single",
    questId: undefined,
    self: emptyVitals(),
    swingErrors: [],
    targets: [],
    timeouts: 0,
    wanted: 1,
    xp: 0,
  };
}

export const engageTool = defineGameTool({ fallback: emptyEngage, kind: "run", name: "engage", parameters: engageParams, run: notBuilt });
```

`packages/harness/src/tools/loot.ts`:

```ts
import type { LootAfter } from "#harness/contract/details";
import { defineGameTool, notBuilt } from "#harness/tools/define";
import { lootParams } from "#harness/tools/params";

function emptyLoot(): LootAfter {
  return { copper: 0, corpse: undefined, freeSlots: undefined, items: [], windowClosed: false };
}

export const lootTool = defineGameTool({ fallback: emptyLoot, kind: "action", name: "loot", parameters: lootParams, run: notBuilt });
```

`packages/harness/src/tools/interact.ts`:

```ts
import type { InteractAfter } from "#harness/contract/details";
import { defineGameTool, emptyUnit, notBuilt } from "#harness/tools/define";
import { interactParams } from "#harness/tools/params";

function emptyInteract(): InteractAfter {
  return {
    action: "talk",
    bought: undefined,
    dialogOpened: false,
    freeSlots: undefined,
    gossip: [],
    learned: [],
    money: undefined,
    npc: emptyUnit(),
    offers: [],
    repairCost: undefined,
    rewardChoices: [],
    roles: [],
    sold: [],
    spells: [],
    stock: [],
  };
}

export const interactTool = defineGameTool({ fallback: emptyInteract, kind: "action", name: "interact", parameters: interactParams, run: notBuilt });
```

`packages/harness/src/tools/rest.ts`:

```ts
import type { RestAfter } from "#harness/contract/details";
import { defineGameTool, notBuilt } from "#harness/tools/define";
import { restParams } from "#harness/tools/params";

function emptyRest(): RestAfter {
  return { auraConfirmed: false, durationMs: 0, hpPct: 0, idle: false, itemsLeft: 0, manaPct: undefined, used: [] };
}

export const restTool = defineGameTool({ fallback: emptyRest, kind: "run", name: "rest", parameters: restParams, run: notBuilt });
```

`packages/harness/src/tools/recover.ts`:

```ts
import type { RecoverAfter } from "#harness/contract/details";
import { defineGameTool, notBuilt } from "#harness/tools/define";
import { recoverParams } from "#harness/tools/params";

function emptyRecover(): RecoverAfter {
  return { alive: false, alternatives: [], corpseYd: undefined, durationMs: 0, hp: undefined, legs: 0, maxHp: undefined, pose: undefined, via: "corpse" };
}

export const recoverTool = defineGameTool({ fallback: emptyRecover, kind: "run", name: "recover", parameters: recoverParams, run: notBuilt });
```

`packages/harness/src/tools/social.ts`:

```ts
import type { SocialAfter } from "#harness/contract/details";
import { defineGameTool, notBuilt } from "#harness/tools/define";
import { socialParams } from "#harness/tools/params";

function emptySocial(): SocialAfter {
  return { action: "say", confirmed: false, systemLine: undefined, text: undefined, to: undefined };
}

export const socialTool = defineGameTool({ fallback: emptySocial, kind: "action", name: "social", parameters: socialParams, run: notBuilt });
```

`packages/harness/src/tools/journal.ts`:

```ts
import type { JournalAfter } from "#harness/contract/details";
import { defineGameTool, notBuilt } from "#harness/tools/define";
import { journalParams } from "#harness/tools/params";

function emptyJournal(): JournalAfter {
  return { about: "log", label: "", more: 0, rows: [] };
}

export const journalTool = defineGameTool({ fallback: emptyJournal, kind: "read", maxLines: 24, name: "journal", parameters: journalParams, run: notBuilt });
```

`packages/harness/src/tools/stop.ts`:

```ts
import type { StopAfter } from "#harness/contract/details";
import { defineGameTool, emptyVitals, notBuilt } from "#harness/tools/define";
import { stopParams } from "#harness/tools/params";

function emptyStop(): StopAfter {
  return { attackers: [], self: emptyVitals(), stopped: [] };
}

export const stopTool = defineGameTool({ fallback: emptyStop, kind: "control", name: "stop", parameters: stopParams, run: notBuilt });
```

`packages/harness/src/tools/registry.ts`:

```ts
import type { HarnessRuntime } from "#harness/contract/services";
import type { GameTool } from "#harness/tools/define";
import { engageTool } from "#harness/tools/engage";
import { interactTool } from "#harness/tools/interact";
import { journalTool } from "#harness/tools/journal";
import { lookTool } from "#harness/tools/look";
import { lootTool } from "#harness/tools/loot";
import { recoverTool } from "#harness/tools/recover";
import { restTool } from "#harness/tools/rest";
import { socialTool } from "#harness/tools/social";
import { stopTool } from "#harness/tools/stop";
import { travelTool } from "#harness/tools/travel";

const TOOLS = [lookTool, travelTool, engageTool, lootTool, interactTool, restTool, recoverTool, socialTool, journalTool, stopTool];

export function gameTools(rt: HarnessRuntime): GameTool[] {
  return TOOLS.map((make) => make(rt));
}
```

`packages/harness/src/tools/install.ts`:

```ts
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI, MessageEndEventResult, ToolExecutionEndEvent } from "@earendil-works/pi-coding-agent";
import type { ToolName } from "#harness/contract/result";
import type { HarnessRuntime } from "#harness/contract/services";
import { nextCall } from "#harness/tools/define";
import { gameTools } from "#harness/tools/registry";
import { rendererFor } from "#harness/ui/renderers/registry";

const VALIDATION = 'Validation failed for tool "';
const HINT_AFTER = 2;
const MINIMAL_CALLS: Readonly<Record<ToolName, string>> = {
  engage: nextCall("engage"),
  interact: nextCall("interact", { npc: "u3" }),
  journal: nextCall("journal", { about: "quests" }),
  look: nextCall("look"),
  loot: nextCall("loot"),
  recover: nextCall("recover"),
  rest: nextCall("rest"),
  social: nextCall("social", { text: "hello" }),
  stop: nextCall("stop"),
  travel: nextCall("travel", { to: "explore" }),
};

type Misses = Map<ToolName, number>;

function isToolName(name: string): name is ToolName {
  return Object.hasOwn(MINIMAL_CALLS, name);
}

function firstText(value: unknown): string {
  if (!(value && typeof value === "object" && "content" in value && Array.isArray(value.content))) return "";
  const [first]: unknown[] = value.content;
  return first && typeof first === "object" && "text" in first && typeof first.text === "string" ? first.text : "";
}

function countMiss(event: ToolExecutionEndEvent, misses: Misses, rt: HarnessRuntime): void {
  const tool = event.toolName;
  if (!isToolName(tool)) return;
  if (!(event.isError && firstText(event.result).startsWith(VALIDATION))) {
    misses.set(tool, 0);
    return;
  }
  const count = (misses.get(tool) ?? 0) + 1;
  misses.set(tool, count);
  rt.stats.validationError(tool);
  const text = `${tool} arguments failed the schema (${count} in a row)`;
  rt.log.append({ class: "log", data: { count, toolCallId: event.toolCallId }, domain: "tool", event: "tool/validation_error", text, tool });
}

function hintMiss(message: AgentMessage, misses: Misses): MessageEndEventResult | undefined {
  if (message.role !== "toolResult" || !message.isError || !isToolName(message.toolName)) return;
  if ((misses.get(message.toolName) ?? 0) < HINT_AFTER) return;
  const hint = { text: `Minimal valid call: ${MINIMAL_CALLS[message.toolName]}`, type: "text" as const };
  return { message: { ...message, content: [...message.content, hint] } };
}

export function installTools(pi: ExtensionAPI, rt: HarnessRuntime): void {
  const misses: Misses = new Map();
  for (const tool of gameTools(rt)) pi.registerTool({ ...tool, ...(isToolName(tool.name) ? rendererFor(tool.name) : {}) });
  pi.on("tool_execution_end", (event) => countMiss(event, misses, rt));
  pi.on("message_end", (event) => hintMiss(event.message, misses));
}
```

`packages/harness/src/extension/extension.ts`, the insertion point only:

```ts
import { installTools } from "#harness/tools/install";
```

and, inside the returned factory, directly after `installGuards(pi, rt);`:

```ts
  installTools(pi, rt);
```

- [ ] **Step 4: Run it and see it pass**

Run: `mise test packages/harness/src/tools/install.test.ts packages/harness/src/extension`
Expected: PASS (the install tests, 5, and F7's extension tests still
green). Then `mise lint:fix`, type check, `mise lint`. `mise ci` must be
green after this commit (the harness now registers ten tools).

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/tools/define.ts packages/harness/src/tools/look.ts packages/harness/src/tools/travel.ts packages/harness/src/tools/engage.ts packages/harness/src/tools/loot.ts packages/harness/src/tools/interact.ts packages/harness/src/tools/rest.ts packages/harness/src/tools/recover.ts packages/harness/src/tools/social.ts packages/harness/src/tools/journal.ts packages/harness/src/tools/stop.ts packages/harness/src/tools/registry.ts packages/harness/src/tools/install.ts packages/harness/src/tools/install.test.ts packages/harness/src/extension/extension.ts
mise exec -- git commit -m "feat: Register the ten harness tools" -m "Parallel tool builders each own one tool file, so A1 creates all ten with their final schemas and a not-built refusal. installTools merges each tool with its renderer family and hints the minimal call after two schema misses."
```

Live gate: none (no protocol or daemon change). The validation hint
path is proven live by F8b (smoke V4).

---

## Task A12: `social`

Needs: A1d, A4.

**Files**

- Modify: `packages/harness/src/tools/social.ts` (replace `run: notBuilt`)
- Test: `packages/harness/src/tools/social.test.ts`

**Interfaces**

- Consumes: `socialParams`, `SocialArgs` (A1b); `defineGameTool`,
  `result`, `nextCall`, `askHuman` (A1); `settle` (A4); `Refusal`;
  `SocialAction`, `SocialAfter` (`#harness/contract/details`);
  `ChatMessage`, `ChatType`, `GroupEvent`, `PartyOperation`,
  `PartyResult`, `Unsubscribe`, `WorldHandle` (`@tuicraft/core`);
  `rt.mutex`, `rt.profile`.
- Produces: `socialTool` (unchanged export).

Settlement (read in core): `sendWhisper` echoes as `WHISPER_INFORM` with
the target as sender; `say`, `party`, `guild` echo with the character as
sender; an unknown whisper target gives the SYSTEM line `No player named
"<name>" is currently playing.` (`world-handlers-chat.ts:161-167`);
`acceptInvite`/`declineInvite` with nothing pending give the fake SYSTEM
lines `Nothing to accept.` / `Nothing to decline.`
(`client-social.ts:46-72`); `invite` answers with a `command_result`
group event. Windows: 2 s, and 3 s for `invite` (design B.9). Every send
goes through `rt.mutex`. Refusals: `missing_text`, `missing_name`,
`secret` (text holds the account name or the password,
case-insensitive), `not_in_group`. Failures: `player_not_found`, the
lower-case `PartyResult` word (for example `already_in_group`),
`nothing_to_accept`, `nothing_to_decline`.

- [ ] **Step 1: Write the failing test** `packages/harness/src/tools/social.test.ts`

```ts
import { describe, expect, jest, test } from "bun:test";
import { ChatType, PartyOperation, PartyResult } from "@tuicraft/core";
import { socialTool } from "#harness/tools/social";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { runTool } from "#test-support/tool-harness";

async function world() {
  const { handle, rt } = await createTestRuntime();
  return { handle, rt, tool: socialTool(rt) };
}

async function withFakeTimers<T>(body: () => Promise<T>): Promise<T> {
  jest.useFakeTimers();
  try {
    return await body();
  } finally {
    jest.useRealTimers();
  }
}

describe("social", () => {
  test("whispers when to is set, confirmed by the echo", async () => {
    const { handle, tool } = await world();
    handle.sendWhisper = jest.fn((to: string, text: string) => handle.triggerMessage({ message: text, sender: to, type: ChatType.WHISPER_INFORM }));
    const out = await runTool(tool, { text: "I'm level 10.", to: "Kaelyn" });
    expect(out.text).toBe(`DONE whispered Kaelyn: "I'm level 10." (echo confirmed)`);
    expect(out.details.result.after).toEqual({ action: "whisper", confirmed: true, systemLine: undefined, text: "I'm level 10.", to: "Kaelyn" });
    expect(handle.sendWhisper).toHaveBeenCalledWith("Kaelyn", "I'm level 10.");
  });

  test("says when to is not set, confirmed by the echo from the character", async () => {
    const { handle, rt, tool } = await world();
    handle.sendSay = jest.fn((text: string) => handle.triggerMessage({ message: text, sender: rt.profile.character, type: ChatType.SAY }));
    expect((await runTool(tool, { text: "hello" })).text).toBe('DONE said: "hello" (echo confirmed)');
  });

  test("gives UNCONFIRMED when no echo comes in 2 s", async () => {
    const { handle, tool } = await world();
    handle.sendParty = jest.fn(() => jest.advanceTimersByTime(2000));
    const out = await withFakeTimers(() => runTool(tool, { do: "party", text: "pull now" }));
    expect(out.text).toBe('UNCONFIRMED said to your party: "pull now"; no echo in 2 s.\nNext: journal(about: "log", since: "1m")');
  });

  test("fails when the whisper target is not online", async () => {
    const { handle, tool } = await world();
    handle.sendWhisper = jest.fn((to: string) => handle.triggerMessage({ message: `No player named "${to}" is currently playing.`, sender: "", type: ChatType.SYSTEM }));
    const out = await runTool(tool, { text: "hi", to: "Kaelyn" });
    expect(out.text).toBe('FAILED player_not_found: no player named "Kaelyn" is online.\nNext: ask the human: "Is Kaelyn the right name?"');
    expect(out.details.result.after).toMatchObject({ confirmed: false, systemLine: 'No player named "Kaelyn" is currently playing.' });
  });

  test("refuses text that holds the account name or the password", async () => {
    const { handle, rt, tool } = await world();
    rt.profile.client.password = "pw1";
    for (const secret of [rt.profile.account.toLowerCase(), "pw1"]) {
      const out = await runTool(tool, { text: `my login is ${secret}` });
      expect(out.text).toBe("REFUSED secret: the text holds the account name or password.\nNext: write the message again without them.");
    }
    expect(handle.sendSay).not.toHaveBeenCalled();
  });

  test("refuses chat without text and a whisper or invite without a name", async () => {
    const { tool } = await world();
    expect((await runTool(tool, { do: "whisper", to: "Kaelyn" })).text).toBe(
      'REFUSED missing_text: whisper needs text.\nNext: social(do: "whisper", text: "…", to: "Kaelyn")',
    );
    expect((await runTool(tool, { do: "invite" })).text).toBe(
      'REFUSED missing_name: invite needs the exact player name in to.\nNext: ask the human: "Which player do you mean?"',
    );
  });

  test("invite is DONE when the server sends the invite", async () => {
    const { handle, tool } = await world();
    handle.invite = jest.fn((name: string) =>
      handle.triggerGroupEvent({ operation: PartyOperation.INVITE, result: PartyResult.SUCCESS, target: name, type: "command_result" }),
    );
    expect((await runTool(tool, { do: "invite", to: "Kaelyn" })).text).toBe(
      "DONE invited Kaelyn; the server sent the invite.\nNext: end your turn; a [game] message comes if Kaelyn answers.",
    );
  });

  test("invite fails with the party result word", async () => {
    const { handle, tool } = await world();
    handle.invite = jest.fn((name: string) =>
      handle.triggerGroupEvent({ operation: PartyOperation.INVITE, result: PartyResult.ALREADY_IN_GROUP, target: name, type: "command_result" }),
    );
    expect((await runTool(tool, { do: "invite", to: "Kaelyn" })).text).toBe(
      'FAILED already_in_group: the server refused the invite to Kaelyn.\nNext: ask the human: "The invite to Kaelyn failed (already_in_group). What should I do?"',
    );
  });

  test("invite is UNCONFIRMED after 3 s without an answer (design B.9)", async () => {
    const { handle, tool } = await world();
    handle.invite = jest.fn(() => jest.advanceTimersByTime(3000));
    const out = await withFakeTimers(() => runTool(tool, { do: "invite", to: "Kaelyn" }));
    expect(out.text).toBe("UNCONFIRMED invited Kaelyn; no answer in 3 s.\nNext: end your turn; a [game] message comes if Kaelyn answers.");
  });

  test("accept_invite reads the fake SYSTEM line when nothing waits", async () => {
    const { handle, tool } = await world();
    handle.acceptInvite = jest.fn(() => handle.triggerMessage({ message: "Nothing to accept.", sender: "", type: ChatType.SYSTEM }));
    expect((await runTool(tool, { do: "accept_invite" })).text).toBe(
      "FAILED nothing_to_accept: there is no invite to accept.\nNext: end your turn and wait for an invite.",
    );
  });

  test("accept_invite is DONE on the group list", async () => {
    const { handle, tool } = await world();
    const members = [{ guidHigh: 0, guidLow: 7, name: "Kaelyn", online: true }];
    handle.acceptInvite = jest.fn(() =>
      handle.triggerGroupEvent({ change: { added: ["Kaelyn"], formed: true, removed: [] }, leader: "Kaelyn", loot: null, members, type: "group_list" }),
    );
    expect((await runTool(tool, { do: "accept_invite" })).text).toBe("DONE joined the group of Kaelyn.");
  });

  test("leave_group refuses outside a group", async () => {
    const { handle, tool } = await world();
    expect((await runTool(tool, { do: "leave_group" })).text).toBe(
      'REFUSED not_in_group: you are not in a group.\nNext: ask the human: "I am not in a group. What should I do?"',
    );
    expect(handle.leaveGroup).not.toHaveBeenCalled();
  });

  test("the design whisper example fits the limits", async () => {
    const { handle, tool } = await world();
    handle.sendWhisper = jest.fn((to: string, text: string) => handle.triggerMessage({ message: text, sender: to, type: ChatType.WHISPER_INFORM }));
    const { text } = await runTool(tool, { text: "x".repeat(255), to: "Kaelyn" });
    expect(text.split("\n").length).toBeLessThanOrEqual(12);
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(700);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/tools/social.test.ts`
Expected: FAIL, first test: expected `DONE whispered Kaelyn: …`, received
`REFUSED not_implemented: this tool is not built yet.` followed by its
`Next:` line.

- [ ] **Step 3: Implement**: replace the body of
  `packages/harness/src/tools/social.ts`

```ts
import { type ChatMessage, ChatType, type GroupEvent, PartyOperation, PartyResult, type Unsubscribe, type WorldHandle } from "@tuicraft/core";
import type { SocialAction, SocialAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { HarnessRuntime, ToolCtx } from "#harness/contract/services";
import { Refusal } from "#harness/ops/refusal";
import { settle } from "#harness/ops/settle";
import { askHuman, defineGameTool, nextCall, result } from "#harness/tools/define";
import { type SocialArgs, socialParams } from "#harness/tools/params";

type ChatAction = "say" | "whisper" | "party" | "guild";
type GroupAction = Exclude<SocialAction, ChatAction>;
type Request = { action: SocialAction; text: string | undefined; to: string | undefined };
type ChatRequest = { action: ChatAction; text: string; to: string | undefined };
type GroupRequest = { action: GroupAction; to: string | undefined };
type GroupAnswer = { event: GroupEvent; kind: "group" } | { kind: "system"; text: string };
type Outcome = Pick<ToolResult<SocialAfter>, "detail" | "next" | "reason" | "status"> & { confirmed: boolean };
type Matcher = (answer: GroupAnswer, to: string | undefined) => boolean;
type Judge = (to: string | undefined, answer: GroupAnswer | undefined) => Outcome;

const SETTLE_MS = 2000;
const INVITE_SETTLE_MS = 3000;
const NOTHING_TO_ACCEPT = "Nothing to accept.";
const NOTHING_TO_DECLINE = "Nothing to decline.";
const ECHO_TYPES: Readonly<Record<ChatAction, readonly number[]>> = {
  guild: [ChatType.GUILD],
  party: [ChatType.PARTY, ChatType.PARTY_LEADER],
  say: [ChatType.SAY],
  whisper: [ChatType.WHISPER_INFORM],
};
const SAID: Readonly<Record<ChatAction, (to: string | undefined) => string>> = {
  guild: () => "said to your guild",
  party: () => "said to your party",
  say: () => "said",
  whisper: (to) => `whispered ${to}`,
};
const PARTY_WORDS = new Map<number, string>(Object.entries(PartyResult).map(([word, code]) => [code, word.toLowerCase()]));

function emptySocial(): SocialAfter {
  return { action: "say", confirmed: false, systemLine: undefined, text: undefined, to: undefined };
}

function isChat(action: SocialAction): action is ChatAction {
  return action === "say" || action === "whisper" || action === "party" || action === "guild";
}

function sameName(a: string, b: string | undefined): boolean {
  return b !== undefined && a.toLowerCase() === b.toLowerCase();
}

function holdsSecret(text: string, rt: HarnessRuntime): boolean {
  const lower = text.toLowerCase();
  return [rt.profile.account, rt.profile.client.password].some((secret) => secret.length > 0 && lower.includes(secret.toLowerCase()));
}

function checkRequest({ action, text, to }: Request, rt: HarnessRuntime): void {
  if (isChat(action) && !text) {
    const retry = to ? { do: action, text: "…", to } : { do: action, text: "…" };
    throw new Refusal({ detail: `${action} needs text.`, next: nextCall("social", retry), reason: "missing_text" });
  }
  if ((action === "whisper" || action === "invite") && !to) {
    throw new Refusal({ detail: `${action} needs the exact player name in to.`, next: askHuman("Which player do you mean?"), reason: "missing_name" });
  }
  if (text && holdsSecret(text, rt)) {
    throw new Refusal({ detail: "the text holds the account name or password.", next: "write the message again without them.", reason: "secret" });
  }
}

function sendChat(handle: WorldHandle, { action, text, to }: ChatRequest): void {
  if (action === "whisper") handle.sendWhisper(to ?? "", text);
  else if (action === "party") handle.sendParty(text);
  else if (action === "guild") handle.sendGuild(text);
  else handle.sendSay(text);
}

function isEcho(message: ChatMessage, { action, text, to }: ChatRequest, self: string): boolean {
  if (!ECHO_TYPES[action].includes(message.type) || message.message !== text) return false;
  return sameName(message.sender, action === "whisper" ? to : self);
}

function isNotFound(message: ChatMessage, to: string | undefined): boolean {
  if (message.type !== ChatType.SYSTEM || to === undefined) return false;
  return message.message.toLowerCase() === `no player named "${to.toLowerCase()}" is currently playing.`;
}

function chatResult({ action, text, to }: ChatRequest, answer: ChatMessage | undefined): ToolResult<SocialAfter> {
  const after = (confirmed: boolean, systemLine?: string): SocialAfter => ({ action, confirmed, systemLine, text, to });
  const said = `${SAID[action](to)}: "${text}"`;
  if (!answer) return result("UNCONFIRMED", { after: after(false), detail: `${said}; no echo in 2 s.`, next: nextCall("journal", { about: "log", since: "1m" }) });
  if (answer.type === ChatType.SYSTEM) {
    const next = askHuman(`Is ${to} the right name?`);
    return result("FAILED", { after: after(false, answer.message), detail: `no player named "${to}" is online.`, next, reason: "player_not_found" });
  }
  return result("DONE", { after: after(true), detail: `${said} (echo confirmed)` });
}

async function chat(request: ChatRequest, ctx: ToolCtx<SocialAfter>): Promise<ToolResult<SocialAfter>> {
  const { handle, rt } = ctx;
  const answer = await settle<ChatMessage>({
    match: (message) => isEcho(message, request, rt.profile.character) || isNotFound(message, request.to),
    send: () => rt.mutex.run(() => sendChat(handle, request)),
    signal: ctx.signal,
    subscribe: (cb) => handle.onMessage(cb),
    timeoutMs: SETTLE_MS,
  });
  return chatResult(request, answer);
}

const MATCHERS: Readonly<Record<GroupAction, Matcher>> = {
  accept_invite: (answer) => (answer.kind === "system" ? answer.text === NOTHING_TO_ACCEPT : answer.event.type === "group_list"),
  decline_invite: (answer) => answer.kind === "system" && answer.text === NOTHING_TO_DECLINE,
  invite: (answer, to) =>
    answer.kind === "group" && answer.event.type === "command_result" && answer.event.operation === PartyOperation.INVITE && sameName(answer.event.target, to),
  leave_group: (answer) =>
    answer.kind === "group" && (answer.event.type === "group_destroyed" || (answer.event.type === "group_list" && answer.event.members.length === 0)),
};

const waitFor = (to: string | undefined) => `end your turn; a [game] message comes if ${to} answers.`;

function inviteOutcome(to: string | undefined, answer: GroupAnswer | undefined): Outcome {
  if (answer?.kind !== "group" || answer.event.type !== "command_result") {
    return { confirmed: false, detail: `invited ${to}; no answer in 3 s.`, next: waitFor(to), status: "UNCONFIRMED" };
  }
  const code = answer.event.result;
  if (code === PartyResult.SUCCESS) return { confirmed: true, detail: `invited ${to}; the server sent the invite.`, next: waitFor(to), status: "DONE" };
  const word = PARTY_WORDS.get(code) ?? `party_result_${code}`;
  const next = askHuman(`The invite to ${to} failed (${word}). What should I do?`);
  return { confirmed: false, detail: `the server refused the invite to ${to}.`, next, reason: word, status: "FAILED" };
}

function acceptOutcome(_to: string | undefined, answer: GroupAnswer | undefined): Outcome {
  if (!answer) return { confirmed: false, detail: "accepted the invite; no group list came in 2 s.", next: nextCall("look"), status: "UNCONFIRMED" };
  if (answer.kind === "system") {
    return { confirmed: false, detail: "there is no invite to accept.", next: "end your turn and wait for an invite.", reason: "nothing_to_accept", status: "FAILED" };
  }
  const leader = answer.event.type === "group_list" ? answer.event.leader : "the leader";
  return { confirmed: true, detail: `joined the group of ${leader}.`, status: "DONE" };
}

function declineOutcome(_to: string | undefined, answer: GroupAnswer | undefined): Outcome {
  if (answer) return { confirmed: false, detail: "there is no invite to decline.", next: "end your turn.", reason: "nothing_to_decline", status: "FAILED" };
  return { confirmed: false, detail: "declined the invite; the server does not answer a decline.", next: "end your turn.", status: "UNCONFIRMED" };
}

function leaveOutcome(_to: string | undefined, answer: GroupAnswer | undefined): Outcome {
  if (answer) return { confirmed: true, detail: "left the group.", status: "DONE" };
  return { confirmed: false, detail: "asked to leave the group; no answer in 2 s.", next: nextCall("look"), status: "UNCONFIRMED" };
}

const JUDGES: Readonly<Record<GroupAction, Judge>> = {
  accept_invite: acceptOutcome,
  decline_invite: declineOutcome,
  invite: inviteOutcome,
  leave_group: leaveOutcome,
};

function sendGroup(handle: WorldHandle, { action, to }: GroupRequest): void {
  if (action === "invite") handle.invite(to ?? "");
  else if (action === "accept_invite") handle.acceptInvite();
  else if (action === "decline_invite") handle.declineInvite();
  else handle.leaveGroup();
}

function subscribeGroup(handle: WorldHandle, cb: (answer: GroupAnswer) => void): Unsubscribe {
  const offGroup = handle.onGroupEvent((event) => cb({ event, kind: "group" }));
  const offChat = handle.onMessage((message) => {
    if (message.type === ChatType.SYSTEM) cb({ kind: "system", text: message.message });
  });
  return () => {
    offGroup();
    offChat();
  };
}

async function group(request: GroupRequest, ctx: ToolCtx<SocialAfter>): Promise<ToolResult<SocialAfter>> {
  const { handle, rt } = ctx;
  const { action, to } = request;
  if (action === "leave_group" && !handle.getPartyState().inGroup) {
    throw new Refusal({ detail: "you are not in a group.", next: askHuman("I am not in a group. What should I do?"), reason: "not_in_group" });
  }
  const answer = await settle<GroupAnswer>({
    match: (candidate) => MATCHERS[action](candidate, to),
    send: () => rt.mutex.run(() => sendGroup(handle, request)),
    signal: ctx.signal,
    subscribe: (cb) => subscribeGroup(handle, cb),
    timeoutMs: action === "invite" ? INVITE_SETTLE_MS : SETTLE_MS,
  });
  const { confirmed, ...fields } = JUDGES[action](to, answer);
  const systemLine = answer?.kind === "system" ? answer.text : undefined;
  return { ...fields, after: { action, confirmed, systemLine, text: undefined, to }, body: [] };
}

function social(args: SocialArgs, ctx: ToolCtx<SocialAfter>): Promise<ToolResult<SocialAfter>> {
  const text = args.text?.trim() || undefined;
  const to = args.to?.trim() || undefined;
  const request: Request = { action: args.do ?? (to ? "whisper" : "say"), text, to };
  checkRequest(request, ctx.rt);
  const { action } = request;
  return isChat(action) ? chat({ action, text: text ?? "", to }, ctx) : group({ action, to }, ctx);
}

export const socialTool = defineGameTool({ fallback: emptySocial, kind: "action", name: "social", parameters: socialParams, run: social });
```

- [ ] **Step 4: Run it and see it pass**

Run: `mise test packages/harness/src/tools/social.test.ts`
Expected: PASS, 13 tests. Then `mise lint:fix`, type check, `mise lint`.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/tools/social.ts packages/harness/src/tools/social.test.ts
mise exec -- git commit -m "feat: Add the harness social tool" -m "The model must know whether a chat line or group action reached the server. social settles each action against its echo, group event or core SYSTEM line, and refuses text that holds the account name or password."
```

Live gate: none (no protocol or daemon change). Live evidence comes
from the round-1 scenario `t2-whisper-reply` after BOOT (E-area).

---

## Task A13: `stop`

Needs: A1d, A3a, A7a, L3.

**Files**

- Modify: `packages/harness/src/tools/stop.ts` (replace `run: notBuilt`)
- Test: `packages/harness/src/tools/stop.test.ts`

**Interfaces**

- Consumes: `stopParams`, `StopArgs` (A1b); `defineGameTool`, `result`,
  `nextCall`, `emptyVitals` (A1); `vitalsView` (A3a); `dangerView` (A7a);
  `rt.runs.get`, `rt.runs.cancel`, `rt.stopAll` (contract 2.9, L3);
  `createRunRegistry` (L3), `createGameLog`, `createJsonlSink` (L1)
  (tests); `RunRecord` (`#harness/contract/runs`).
- Produces: `stopTool` (unchanged export).

Decisions: `stop()` calls `rt.stopAll("tool")` (it cancels every run and
halts, contract 2.3). `stop(run: "r3")` cancels that run with cause
`tool` and then halts under `rt.mutex` (`halt`, `stopCycle`,
`stopAttack`). An unknown run id refuses `no_such_run`. The danger line
comes from `define.ts` (contract issue 14). `stop` is a `control` tool,
so it works while a human message waits.

- [ ] **Step 1: Write the failing test** `packages/harness/src/tools/stop.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import type { HarnessRuntime } from "#harness/contract/services";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { createAttackLedger } from "#harness/ops/danger";
import { createRefTable } from "#harness/ops/refs";
import { createRunRegistry } from "#harness/runs/registry";
import { stopTool } from "#harness/tools/stop";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { runTool } from "#test-support/tool-harness";
import { nearbyRow, selfCombat, setWorld, unitEntity } from "#test-support/world-fixtures";

async function world() {
  const clock = { now: () => 1000 };
  const log = createGameLog({ char: () => "Fgklibhlflc", clock, file: undefined });
  const runs = createRunRegistry({ clock, log, sink: createJsonlSink({ file: undefined }) });
  const parts = { attacks: createAttackLedger(clock), clock, log, refs: createRefTable(), runs };
  const { handle, rt } = await createTestRuntime({ parts });
  setWorld(handle, { combat: { self: selfCombat({ health: 190 }) } });
  return { handle, rt, tool: stopTool(rt) };
}

function startEngage(rt: HarnessRuntime) {
  return rt.runs.start({
    args: { target: "u9" },
    kind: "engage",
    launch: ({ progress, signal }) => {
      progress("1 of 3 kills");
      return new Promise((resolve) => {
        signal.addEventListener("abort", () => resolve({ reason: "stopped_by_tool", status: "cancelled", summary: "stopped", value: undefined }));
      });
    },
    toolCallId: "c0",
  });
}

describe("stop", () => {
  test("stops one run by id and halts", async () => {
    const { handle, rt, tool } = await world();
    const run = startEngage(rt);
    const out = await runTool(tool, { run: "r1" });
    expect(out.text).toBe("DONE stopped r1 (engage, 1 of 3 kills). Not moving, not attacking. HP 190/217.");
    expect(run.signal.aborted).toBe(true);
    expect((await run.done).status).toBe("cancelled");
    expect(handle.halt).toHaveBeenCalled();
    expect(handle.stopCycle).toHaveBeenCalled();
    expect(handle.stopAttack).toHaveBeenCalled();
  });

  test("stops everything by default", async () => {
    const { handle, rt, tool } = await world();
    startEngage(rt);
    expect((await runTool(tool, {})).text).toBe("DONE stopped r1 (engage, 1 of 3 kills). Not moving, not attacking. HP 190/217.");
    expect(handle.halt).toHaveBeenCalled();
  });

  test("says when nothing was running", async () => {
    const { tool } = await world();
    expect((await runTool(tool, {})).text).toBe("DONE nothing was running. Not moving, not attacking. HP 190/217.");
  });

  test("refuses an unknown run id", async () => {
    const { tool } = await world();
    expect((await runTool(tool, { run: "r7" })).text).toBe('REFUSED no_such_run: there is no run "r7".\nNext: stop()');
  });

  test("keeps the danger line: stopping is not escaping", async () => {
    const { handle, tool } = await world();
    const stalker = nearbyRow(unitEntity({ guid: 0x50n, name: "Springpaw Stalker" }));
    setWorld(handle, { combat: { attackers: [0x50n], self: selfCombat({ health: 190 }) }, rows: [stalker] });
    const out = await runTool(tool, {});
    expect(out.text.split("\n")).toEqual([
      "DONE nothing was running. Not moving, not attacking. HP 190/217.",
      "Danger: Springpaw Stalker u1 is still attacking you. You are at 88% HP.",
    ]);
    expect(out.details.result.after).toMatchObject({ attackers: [{ ref: "u1" }], self: { hp: 190, maxHp: 217 } });
  });

  test("works while a human message waits", async () => {
    const { rt, tool } = await world();
    rt.session.humanWaiting = true;
    expect((await runTool(tool, {})).text).toStartWith("DONE ");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/tools/stop.test.ts`
Expected: FAIL, received `REFUSED not_implemented: this tool is not
built yet.` and its `Next:` line.

- [ ] **Step 3: Implement**: replace the body of
  `packages/harness/src/tools/stop.ts`

```ts
import type { WorldHandle } from "@tuicraft/core";
import type { StopAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { RunRecord } from "#harness/contract/runs";
import type { HarnessRuntime, ToolCtx } from "#harness/contract/services";
import { dangerView } from "#harness/ops/danger";
import { Refusal } from "#harness/ops/refusal";
import { vitalsView } from "#harness/ops/views";
import { defineGameTool, emptyVitals, nextCall, result } from "#harness/tools/define";
import { type StopArgs, stopParams } from "#harness/tools/params";

function emptyStop(): StopAfter {
  return { attackers: [], self: emptyVitals(), stopped: [] };
}

function haltAll(handle: WorldHandle): void {
  handle.halt();
  handle.stopCycle();
  handle.stopAttack();
}

function stopOne(rt: HarnessRuntime, id: string): RunRecord {
  const record = rt.runs.get(id);
  if (!record) throw new Refusal({ detail: `there is no run "${id}".`, next: nextCall("stop"), reason: "no_such_run" });
  return rt.runs.cancel(id, "tool") ?? record;
}

function runText({ id, kind, progress }: RunRecord): string {
  return progress ? `${id} (${kind}, ${progress})` : `${id} (${kind})`;
}

function stopText({ self, stopped }: StopAfter): string {
  const what = stopped.length > 0 ? `stopped ${stopped.map(runText).join(", ")}.` : "nothing was running.";
  return `${what} Not moving, not attacking. HP ${self.hp}/${self.maxHp}.`;
}

async function stop(args: StopArgs, ctx: ToolCtx<StopAfter>): Promise<ToolResult<StopAfter>> {
  const { handle, rt } = ctx;
  const id = args.run?.trim();
  const stopped = id ? [stopOne(rt, id)] : rt.stopAll("tool");
  if (id) await rt.mutex.run(() => haltAll(handle));
  const after: StopAfter = { attackers: dangerView(ctx).attackers, self: vitalsView(ctx), stopped };
  return result("DONE", { after, detail: stopText(after) });
}

export const stopTool = defineGameTool({ fallback: emptyStop, kind: "control", name: "stop", parameters: stopParams, run: stop });
```

- [ ] **Step 4: Run it and see it pass**

Run: `mise test packages/harness/src/tools/stop.test.ts`
Expected: PASS, 6 tests. If the first test shows `stopped r1 (engage)`
without the progress text, L3's registry does not keep
`RunRecord.progress` from `RunControl.progress`; that is an L3 defect
against contract 2.3 (`progress` field) and goes to the coordinator,
not a change here. Then `mise lint:fix`, type check, `mise lint`.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/tools/stop.ts packages/harness/src/tools/stop.test.ts
mise exec -- git commit -m "feat: Add the harness stop tool" -m "The model needs one call that cancels a run and halts movement, attacks and the cycle. The result keeps the danger line, so the model learns that stopping is not escaping."
```

Live gate: none (no protocol or daemon change). Live evidence comes
from the round-1 scenario `t7-halt-resume` after BOOT.

---

## Task A10: `look`

Needs: A1d, A3b, A5, A7a, L11; tests also L1, L3.

**Files**

- Modify: `packages/harness/src/tools/look.ts` (replace `run: notBuilt`)
- Test: `packages/harness/src/tools/look.test.ts`

**Interfaces**

- Consumes: `lookParams`, `LookArgs` (A1b); `defineGameTool`, `result`,
  `nextCall`, `emptyPlace`, `emptySelf` (A1); `nowSnapshot`,
  `unitViews`, `unitMatches` (A3); `LOOK_DEFAULT_YD`,
  `LOOK_DEFAULT_ROWS`, `LOOK_MAX_ROWS` (A5); `dangerView` (A7a);
  `rt.snapshots.capture("look")` (L11); `LookAfter`, `LookFilter`
  (`#harness/contract/details`).
- Produces: `lookTool` (unchanged export).

Decisions: rows are creatures and players only (A3 `unitViews`), within
`within` (default `LOOK_DEFAULT_YD`), at most `LOOK_DEFAULT_ROWS` rows,
or `LOOK_MAX_ROWS` when `within` is set. The `Nearest` line always shows
`hostile`, `lootable` and `trainer` (design B.2), plus the filter's own
kind. No lootable unit gives `none` (a corpse is a current fact); no unit
of another kind gives `none seen` (a sighting). With a filter that
matches nothing in view and no unit of that kind seen in 30 min, the
result is the design's two-line "0 … seen" answer with a conditional
explore hint and no `Next:` (LU V-L2). The unchanged note uses a
`WeakMap<HarnessRuntime, …>` in `look.ts` (no `SessionFlags` field
exists): three looks with the same rows, HP and pose bucket within 60 s
and no run add `Nothing changed in 3 looks. Act, or end your turn to
wait for events.` `No unit is attacking you.` is a body line only when
nobody attacks; otherwise `define.ts` adds the danger line. `look`
never sends a packet.

- [ ] **Step 1: Write the failing test** `packages/harness/src/tools/look.test.ts`

```ts
import { describe, expect, jest, test } from "bun:test";
import type { CombatState, NearbyRow, NpcRole } from "@tuicraft/core";
import type { WorldSnapshots } from "#harness/contract/services";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { createAttackLedger } from "#harness/ops/danger";
import { createRefTable } from "#harness/ops/refs";
import { createSightings } from "#harness/ops/sightings";
import { createRunRegistry } from "#harness/runs/registry";
import { MAX_CONTENT_BYTES } from "#harness/tools/define";
import { lookTool } from "#harness/tools/look";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { runTool } from "#test-support/tool-harness";
import { nearbyRow, selfPose, selfRow, setWorld, type UnitInit, unitEntity } from "#test-support/world-fixtures";

const NOW = 1_000_000;

async function world() {
  const clock = { now: () => NOW };
  const snapshots: WorldSnapshots = { attach: () => () => {}, capture: jest.fn(), write: jest.fn(() => Promise.resolve("")) };
  const log = createGameLog({ char: () => "Fgklibhlflc", clock, file: undefined });
  const runs = createRunRegistry({ clock, log, sink: createJsonlSink({ file: undefined }) });
  const parts = { attacks: createAttackLedger(clock), clock, log, refs: createRefTable(), runs, sightings: createSightings(clock), snapshots };
  const { handle, rt } = await createTestRuntime({ parts });
  return { handle, rt, snapshots, tool: lookTool(rt) };
}

const friendly = (init: UnitInit, roles: NpcRole[] = []) => nearbyRow(unitEntity(init), { relation: "friendly", roles });
const stalker = () => nearbyRow(unitEntity({ dx: 78, guid: 0x25n, level: 7, name: "Springpaw Stalker" }), { relation: "hostile" });

function eversong(extra: NearbyRow[] = []): NearbyRow[] {
  return [
    selfRow(),
    friendly({ guid: 0x21n, level: 10, name: "Fgklibiancf", player: true }),
    friendly({ dy: -11, guid: 0x22n, level: 30, name: "Velan Brightoak" }, ["questgiver"]),
    friendly({ dy: 38, guid: 0x23n, level: 15, name: "Marniel Amberlight" }, ["vendor", "repair"]),
    friendly({ dx: -58, guid: 0x24n, level: 22, name: "Silvermoon Guardian" }),
    ...extra,
  ];
}

function place(handle: Parameters<typeof setWorld>[0], rows: NearbyRow[], combat: Partial<CombatState> = {}) {
  setWorld(handle, {
    combat,
    place: { area: "Fairbreeze Village", areaId: 3665, at: NOW - 240_000, zone: "Eversong Woods", zoneId: 3430 },
    pose: selfPose(NOW),
    rows,
    serverPose: selfPose(NOW - 12_000, { source: "server" }),
  });
}

describe("look", () => {
  test("the design example", async () => {
    const { handle, rt, tool } = await world();
    place(handle, eversong([stalker()]));
    const { text } = await runTool(tool, {});
    expect(text).toBe(
      [
        `DONE ${rt.profile.character} L10 Priest, HP 217/217, mana 100%, alive, not in combat. Eversong Woods, Fairbreeze Village (area 4 min old). 8735, -6685, facing N. Pose predicted, server fix 12 s ago.`,
        "Target: none. Running: nothing.",
        "4 of 4 units within 60 yd, nearest first:",
        "- u1 Fgklibiancf L10 player, friendly, 0 yd",
        "- u2 Velan Brightoak L30 friendly, questgiver, 11 yd E",
        "- u3 Marniel Amberlight L15 friendly, vendor repair, 38 yd W",
        "- u4 Silvermoon Guardian L22 friendly, 58 yd S",
        "Nearest hostile: u5 Springpaw Stalker L7 alive, 78 yd N (seen now). Nearest lootable: none. Nearest trainer: none seen.",
        "No unit is attacking you.",
      ].join("\n"),
    );
    expect(text.split("\n").length).toBeLessThanOrEqual(24);
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(MAX_CONTENT_BYTES);
  });

  test("details carry rows, counts, nearest and danger; the look is captured", async () => {
    const { handle, snapshots, tool } = await world();
    place(handle, eversong([stalker()]));
    const { details } = await runTool(tool, {});
    expect(details.tool).toBe("look");
    expect(details.result.after).toMatchObject({ danger: { attackers: [] }, filter: "any", matched: 4, seen: 5, unchanged: 1 });
    expect(details.tool === "look" && details.result.after.nearest.hostile?.ref).toBe("u5");
    expect(snapshots.capture).toHaveBeenCalledWith("look");
  });

  test("a filter with nothing seen at any distance answers without a Next line", async () => {
    const { handle, tool } = await world();
    place(handle, eversong());
    expect((await runTool(tool, { find: "hostile" })).text).toBe(
      'DONE 0 hostile units seen at any distance in the last 30 min. The client sees about 100 yd around you.\nIf your task needs one: travel(to: "explore north"), or another direction.',
    );
  });

  test("a filter with a match out of range names the nearest one", async () => {
    const { handle, tool } = await world();
    place(handle, eversong([stalker()]));
    const lines = (await runTool(tool, { find: "hostile" })).text.split("\n");
    expect(lines[2]).toBe("No hostile units within 60 yd.");
    expect(lines[3]).toBe("Nearest hostile: u5 Springpaw Stalker L7 alive, 78 yd N (seen now). Nearest lootable: none. Nearest trainer: none seen.");
  });

  test("within lists up to 20 rows and cuts the text at 24 lines", async () => {
    const { handle, tool } = await world();
    const lynxes = Array.from({ length: 25 }, (_, i) => nearbyRow(unitEntity({ dx: i + 1, guid: BigInt(0x100 + i), name: `Lynx ${i + 1}` }), { relation: "neutral" }));
    place(handle, [selfRow(), ...lynxes]);
    const { details, text } = await runTool(tool, { within: 30 });
    const lines = text.split("\n");
    expect(lines[2]).toBe("20 of 25 units within 30 yd, nearest first:");
    expect(lines).toHaveLength(24);
    expect(lines.at(-1)).toBe("+2 more; narrow the call.");
    expect(details.tool === "look" && details.result.after.rows).toHaveLength(20);
  });

  test("name filters by part of a name", async () => {
    const { handle, tool } = await world();
    place(handle, eversong([stalker()]));
    const lines = (await runTool(tool, { name: "stalker", within: 100 })).text.split("\n");
    expect(lines.slice(2, 4)).toEqual(["1 of 1 units within 100 yd, nearest first:", "- u5 Springpaw Stalker L7 hostile, 78 yd N"]);
  });

  test("three unchanged looks add the loop note", async () => {
    const { handle, tool } = await world();
    place(handle, eversong());
    await runTool(tool, {});
    await runTool(tool, {});
    const { text } = await runTool(tool, {});
    expect(text.split("\n").at(-1)).toBe("Nothing changed in 3 looks. Act, or end your turn to wait for events.");
  });

  test("line 2 names the target and a running run", async () => {
    const { handle, rt, tool } = await world();
    place(handle, eversong(), { selectedGuid: 0x22n });
    rt.runs.start({ args: { target: "u9" }, kind: "engage", launch: () => new Promise(() => {}), toolCallId: "c0" });
    const line = (await runTool(tool, {})).text.split("\n")[1];
    expect(line).toBe("Target: u2 Velan Brightoak 100%. Running: r1 engage u9 (0 s). It is still running. End your turn to wait.");
  });

  test("an attacker replaces the calm line with the danger line", async () => {
    const { handle, tool } = await world();
    place(handle, eversong([stalker()]), { attackers: [0x25n] });
    const { text } = await runTool(tool, {});
    expect(text).not.toContain("No unit is attacking you.");
    expect(text.split("\n").at(-1)).toBe("Danger: Springpaw Stalker u5 is attacking you. You are at 100% HP.");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/tools/look.test.ts`
Expected: FAIL, received `REFUSED not_implemented: this tool is not
built yet.` and its `Next:` line.

- [ ] **Step 3: Implement**: replace the body of
  `packages/harness/src/tools/look.ts`

```ts
import type { LookAfter, LookFilter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { HarnessRuntime, ToolCtx } from "#harness/contract/services";
import type { NearestKind, NowSnapshot, PlaceView, PoseView, UnitView, VitalsView } from "#harness/contract/views";
import { dangerView } from "#harness/ops/danger";
import { LOOK_DEFAULT_ROWS, LOOK_DEFAULT_YD, LOOK_MAX_ROWS } from "#harness/ops/range";
import { Refusal } from "#harness/ops/refusal";
import { nowSnapshot, unitMatches, unitViews } from "#harness/ops/views";
import { defineGameTool, emptyPlace, emptySelf, nextCall, result } from "#harness/tools/define";
import { type LookArgs, lookParams } from "#harness/tools/params";

type Unchanged = { at: number; count: number; digest: string };
type LookFit = { filter: LookFilter; name: string | undefined; unit: UnitView; within: number };

const UNCHANGED_AFTER = 3;
const UNCHANGED_WINDOW_MS = 60_000;
const ALWAYS_NEAREST: readonly NearestKind[] = ["hostile", "lootable", "trainer"];
const unchangedLooks = new WeakMap<HarnessRuntime, Unchanged>();

function emptyLook(): LookAfter {
  return {
    danger: { attackers: [], hpPct: 100 },
    filter: "any",
    matched: 0,
    name: undefined,
    nearest: {},
    place: emptyPlace(),
    rows: [],
    run: undefined,
    seen: 0,
    self: emptySelf(),
    target: undefined,
    unchanged: 0,
    within: undefined,
  };
}

function kindOf(filter: LookFilter): NearestKind | undefined {
  return filter === "any" || filter === "corpse" ? undefined : filter;
}

function filterMatches(unit: UnitView, filter: LookFilter): boolean {
  if (filter === "any") return true;
  if (filter === "corpse") return !unit.alive;
  return unitMatches(unit, filter);
}

function fitsLook({ filter, name, unit, within }: LookFit): boolean {
  if (unit.distance === undefined || unit.distance > within) return false;
  if (name && !unit.name.toLowerCase().includes(name.toLowerCase())) return false;
  return filterMatches(unit, filter);
}

function ageText(ms: number): string {
  return ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`;
}

function distanceText({ compass, distance }: UnitView): string {
  if (distance === undefined) return "distance unknown";
  const yards = Math.round(distance);
  return yards > 0 && compass ? `${yards} yd ${compass}` : `${yards} yd`;
}

function powerText({ maxPower, power, powerKind }: VitalsView): string {
  if (powerKind === "none" || maxPower === 0) return "";
  if (powerKind === "mana") return `mana ${Math.round((power / maxPower) * 100)}%, `;
  return `${powerKind.replace("_", " ")} ${power}, `;
}

function placeText({ ageMs, area, zone }: PlaceView): string {
  const where = [zone, area].filter((part) => part !== undefined).join(", ") || "Zone unknown";
  return ageMs === undefined ? `${where}.` : `${where} (area ${ageText(ageMs)} old).`;
}

function poseText(pose: PoseView | undefined): string {
  if (!pose) return "Position unknown.";
  const fix = pose.serverFixAgeMs === undefined ? "no server fix yet" : `server fix ${ageText(pose.serverFixAgeMs)} ago`;
  return `${Math.round(pose.x)}, ${Math.round(pose.y)}, facing ${pose.facing}. Pose ${pose.source}, ${fix}.`;
}

function selfLine({ place, self }: LookAfter): string {
  const combat = self.inCombat ? "in combat" : "not in combat";
  const vitals = `HP ${self.hp}/${self.maxHp}, ${powerText(self)}${self.life}, ${combat}`;
  return `${self.name} L${self.level} ${self.className}, ${vitals}. ${placeText(place)} ${poseText(self.pose)}`;
}

function statusLine({ run, target }: LookAfter): string {
  const aimed = target ? `${target.ref} ${target.name} ${target.hpPct}%` : "none";
  if (!run) return `Target: ${aimed}. Running: nothing.`;
  return `Target: ${aimed}. Running: ${run.id} ${run.label} (${ageText(run.elapsedMs)}). It is still running. End your turn to wait.`;
}

function nounOf(filter: LookFilter): string {
  return filter === "any" ? "units" : `${filter.replace("_", " ")} units`;
}

function headerLine({ filter, matched, rows, within }: LookAfter): string {
  const range = within ?? LOOK_DEFAULT_YD;
  if (rows.length === 0) return `No ${nounOf(filter)} within ${range} yd.`;
  return `${rows.length} of ${matched} ${nounOf(filter)} within ${range} yd, nearest first:`;
}

function rowLine(unit: UnitView): string {
  const traits = [
    unit.kind === "player" ? "player" : undefined,
    unit.relation,
    unit.roles.length > 0 ? unit.roles.join(" ") : undefined,
    unit.alive ? undefined : "dead",
    unit.lootable ? "lootable" : undefined,
    unit.attackingMe ? "attacking you" : undefined,
    unit.targetsMe && !unit.attackingMe ? "targets you" : undefined,
    unit.tappedByOther ? "tapped by another player" : undefined,
    distanceText(unit),
  ];
  return `- ${unit.ref} ${unit.name} L${unit.level} ${traits.filter((trait) => trait !== undefined).join(", ")}`;
}

function nearestText(kind: NearestKind, unit: UnitView | undefined): string {
  const label = `Nearest ${kind.replace("_", " ")}:`;
  if (!unit) return `${label} ${kind === "lootable" ? "none" : "none seen"}.`;
  const seen = unit.inView ? "seen now" : `seen ${ageText(unit.seenAgoMs)} ago`;
  return `${label} ${unit.ref} ${unit.name} L${unit.level} ${unit.alive ? "alive" : "dead"}, ${distanceText(unit)} (${seen}).`;
}

function nearestLine({ filter, nearest }: LookAfter): string {
  const own = kindOf(filter);
  const kinds = own && !ALWAYS_NEAREST.includes(own) ? [...ALWAYS_NEAREST, own] : ALWAYS_NEAREST;
  return kinds.map((kind) => nearestText(kind, nearest[kind])).join(" ");
}

function lookBody(after: LookAfter): string[] {
  const calm = after.danger.attackers.length === 0 ? ["No unit is attacking you."] : [];
  const stale = after.unchanged >= UNCHANGED_AFTER && !after.run ? [`Nothing changed in ${after.unchanged} looks. Act, or end your turn to wait for events.`] : [];
  return [statusLine(after), headerLine(after), ...after.rows.map(rowLine), nearestLine(after), ...calm, ...stale];
}

function lookDigest(rows: readonly UnitView[], snapshot: NowSnapshot): string {
  const pose = snapshot.self.pose;
  const where = pose ? `${Math.floor(pose.x / 2)}:${Math.floor(pose.y / 2)}` : "-";
  const units = rows.map((unit) => `${unit.ref}:${unit.hpPct}:${Math.round(unit.distance ?? -1)}`).join(",");
  return `${snapshot.self.hp}|${where}|${units}`;
}

function countUnchanged(rt: HarnessRuntime, digest: string): number {
  const now = rt.clock.now();
  const last = unchangedLooks.get(rt);
  const next = last && last.digest === digest && now - last.at <= UNCHANGED_WINDOW_MS ? { ...last, count: last.count + 1 } : { at: now, count: 1, digest };
  unchangedLooks.set(rt, next);
  return next.count;
}

function lookAfter(args: LookArgs, ctx: ToolCtx<LookAfter>, snapshot: NowSnapshot): LookAfter {
  const filter = args.find ?? "any";
  const units = unitViews(ctx);
  const within = args.within ?? LOOK_DEFAULT_YD;
  const matching = units.filter((unit) => fitsLook({ filter, name: args.name, unit, within }));
  const rows = matching.slice(0, args.within === undefined ? LOOK_DEFAULT_ROWS : LOOK_MAX_ROWS);
  return {
    danger: dangerView(ctx),
    filter,
    matched: matching.length,
    name: args.name,
    nearest: snapshot.nearest,
    place: snapshot.place,
    rows,
    run: snapshot.run,
    seen: units.length,
    self: snapshot.self,
    target: snapshot.target,
    unchanged: countUnchanged(ctx.rt, lookDigest(rows, snapshot)),
    within: args.within,
  };
}

function noneSeen(after: LookAfter): ToolResult<LookAfter> {
  const hint = `If your task needs one: ${nextCall("travel", { to: "explore north" })}, or another direction.`;
  const detail = `0 ${nounOf(after.filter)} seen at any distance in the last 30 min. The client sees about 100 yd around you.`;
  return result("DONE", { after, body: [hint], detail });
}

function look(args: LookArgs, ctx: ToolCtx<LookAfter>): ToolResult<LookAfter> {
  const snapshot = nowSnapshot(ctx.rt);
  if (!snapshot) throw new Refusal({ detail: "the world is still loading.", next: "call look again in a few seconds.", reason: "not_ready" });
  const after = lookAfter(args, ctx, snapshot);
  ctx.rt.snapshots.capture("look");
  const own = kindOf(after.filter);
  if (after.matched === 0 && own && !after.nearest[own]) return noneSeen(after);
  return result("DONE", { after, body: lookBody(after), detail: selfLine(after) });
}

export const lookTool = defineGameTool({
  fallback: emptyLook,
  kind: "read",
  maxLines: 24,
  name: "look",
  parameters: lookParams,
  run: (args, ctx) => Promise.resolve(look(args, ctx)),
});
```

Note: `rowLine` with `find: "hostile"` and a name shows `hostile` as
the relation word (see the "name filters" test). `look.ts` is about 230
non-blank lines.

- [ ] **Step 4: Run it and see it pass**

Run: `mise test packages/harness/src/tools/look.test.ts`
Expected: PASS, 9 tests. Then `mise lint:fix`, type check, `mise lint`.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/tools/look.ts packages/harness/src/tools/look.test.ts
mise exec -- git commit -m "feat: Add the harness look tool" -m "One look must answer who is near, what is hostile and where the character is, including units that left view. Rows are units only, and a question with no match gets an answer instead of a walk order."
```

Live gate: none (no protocol or daemon change). Live evidence comes
from `t0-hostiles`, `t0-who-is-near` and the canary `t0-self-state`
after BOOT.

---

## Task A11: `journal`

Needs: A1d, L2, C11.

**Files**

- Modify: `packages/harness/src/tools/journal.ts` (replace `run: notBuilt`)
- Test: `packages/harness/src/tools/journal.test.ts`

**Interfaces**

- Consumes: `journalParams`, `JournalArgs` (A1b); `defineGameTool`,
  `result` (A1); `queryLog`, `formatLogRows` (L2); `getQuestState`,
  `getInventoryState`, `getSpellbook`, `questSlotStatus`, `itemKind`
  (C11), `QuestState`, `QuestQuery`, `QuestLogSlot`, `NamedInventoryState`,
  `NamedInventorySlot`, `SpellDefinition` (`@tuicraft/core`);
  `JournalAfter`, `QuestLine`, `BagsView`, `SpellLine`, `EquipSlotName`
  (`#harness/contract/details`).
- Produces: `journalTool` (unchanged export).

Decisions: `quests` lists every logged quest with its id (`#8325`),
title (from the known quest query, else `quest <id>`), level, creature
objectives with counters (`targets[i].count > 0`) and item objectives
(`item <id>`; core has no item names here), and the slot status
(`in progress` → `incomplete`). `turnIn` is `undefined` (contract issue
17). `bags` gives money, free slots, equipped items by slot name (the
`equipment` region, slots 0–18) and bag items by name with counts,
six per line. `spells` sorts by name and awaits `getSpellbook()`.
`log` passes `find` and `since` to `queryLog` with the turn start from
`rt.session.turnStartSeq`; `more` gives one extra line.

- [ ] **Step 1: Write the failing test** `packages/harness/src/tools/journal.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import type { NamedInventorySlot, QuestLogSlot, QuestQuery, SpellDefinition } from "@tuicraft/core";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { formatLogRows, JOURNAL_LOG_LIMIT } from "#harness/log/query";
import { createRunRegistry } from "#harness/runs/registry";
import { journalTool } from "#harness/tools/journal";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { runTool } from "#test-support/tool-harness";

type KnownQuest = Extract<QuestQuery, { status: "known" }>["data"];

const NOW = 1_000_000;

async function world() {
  const clock = { now: () => NOW };
  const log = createGameLog({ char: () => "Fgklibhlflc", clock, file: undefined });
  const runs = createRunRegistry({ clock, log, sink: createJsonlSink({ file: undefined }) });
  const { handle, rt } = await createTestRuntime({ parts: { clock, log, runs } });
  return { handle, rt, tool: journalTool(rt) };
}

function slot(questId: number | undefined, index: number, flags: number, counters: QuestLogSlot["counters"]): QuestLogSlot {
  return { counters, expiresAtSeconds: undefined, flags, questId, slot: index };
}

const target = (count: number) => ({ count, encodedNpcOrGoId: 15_274, itemDropId: 0, npcOrGoId: 15_274, unknownSourceCount: 0 });
const reclaiming = {
  level: 4,
  objectiveTexts: ["Mana Wyrm slain", "", "", ""],
  targets: [target(8), target(0), target(0), target(0)],
  title: "Reclaiming Sunstrider Isle",
} as unknown as KnownQuest;

function bagItem(guid: bigint, entry: number, name: string, count: number) {
  return {
    contained: undefined,
    count,
    durability: undefined,
    entry,
    flags: undefined,
    guid,
    maxDurability: undefined,
    name,
    owner: undefined,
    quality: 1,
    randomPropertyId: undefined,
  };
}

describe("journal", () => {
  test("quests lists the log with ids, objectives and status", async () => {
    const { handle, tool } = await world();
    const state = handle.getQuestState();
    const slots = [slot(8325, 0, 0, [3, undefined, undefined, undefined]), slot(8326, 1, 1, [0, 0, 0, 0]), slot(undefined, 2, 0, [0, 0, 0, 0])];
    const queries: QuestQuery[] = [{ data: reclaiming, questId: 8325, receivedAt: 0, status: "known" }];
    handle.getQuestState = () => ({ ...state, items: [], log: { complete: true, slots }, queries });
    const out = await runTool(tool, { about: "quests" });
    expect(out.text).toBe(
      [
        "DONE 2 quests. This is your quest log. To see what an NPC offers, use interact.",
        "#8325 Reclaiming Sunstrider Isle (L4): Mana Wyrm slain 3/8; incomplete.",
        "#8326 quest 8326: no counted objectives; complete.",
      ].join("\n"),
    );
    expect(out.details.result.after).toMatchObject({ about: "quests", quests: [{ id: 8325, turnIn: undefined }, { id: 8326 }] });
  });

  test("bags gives money, free slots, equipped items and bag items", async () => {
    const { handle, tool } = await world();
    const inventory = handle.getInventoryState();
    const slots: NamedInventorySlot[] = [
      { bag: 255, guid: 1n, item: bagItem(1n, 25, "Worn Shortsword", 1), region: "equipment", slot: 15, status: "occupied" },
      { bag: 255, guid: 2n, item: bagItem(2n, 117, "Tough Jerky", 4), region: "backpack", slot: 23, status: "occupied" },
      { bag: 255, guid: 3n, item: bagItem(3n, 159, "Refreshing Spring Water", 2), region: "backpack", slot: 24, status: "occupied" },
      { bag: 255, region: "backpack", slot: 25, status: "empty" },
    ];
    handle.getInventoryState = () => ({ ...inventory, coinage: 12_345, freeSlots: 12, slots });
    const out = await runTool(tool, { about: "bags" });
    expect(out.text).toBe(
      ["DONE Money: 1g 23s 45c. 12 free bag slots.", "Equipped: main hand Worn Shortsword.", "Bags: Tough Jerky x4, Refreshing Spring Water x2."].join("\n"),
    );
    expect(out.details.result.after).toMatchObject({ about: "bags", bags: { equipped: [{ name: "Worn Shortsword", slot: "main_hand" }] } });
  });

  test("spells lists known spells by name with cost and cooldown", async () => {
    const { handle, tool } = await world();
    const spell = (id: number, name: string, cost: number, cooldownMs: number) =>
      ({ cooldown: { recoveryTimeMs: cooldownMs }, id, name, power: { costRaw: cost }, rank: "Rank 1" }) as unknown as SpellDefinition;
    handle.getSpellbook = () => Promise.resolve([spell(585, "Smite", 6, 0), spell(2050, "Lesser Heal", 30, 0), spell(17, "Power Word: Shield", 45, 4000)]);
    expect((await runTool(tool, { about: "spells" })).text).toBe(
      [
        "DONE 3 spells known.",
        "Lesser Heal (Rank 1): costs 30.",
        "Power Word: Shield (Rank 1): costs 45, cooldown 4 s.",
        "Smite (Rank 1): costs 6.",
      ].join("\n"),
    );
  });

  test("log shows rows since the turn started, oldest first", async () => {
    const { rt, tool } = await world();
    rt.session.turnStartSeq = rt.log.lastSeq();
    const kill = rt.log.append({ class: "passive", data: {}, domain: "combat", event: "combat/kill_credit", text: "kill credit Springpaw Stalker, +108 XP" });
    const item = rt.log.append({ class: "passive", data: {}, domain: "loot", event: "loot/item", text: "item Lynx Meat x1 (now 1)" });
    const out = await runTool(tool, { about: "log" });
    expect(out.text).toStartWith("DONE ");
    for (const line of formatLogRows([kill, item], NOW)) expect(out.text).toContain(line);
    expect(out.details.result.after).toMatchObject({ about: "log" });
  });

  test("log says how many older rows it left out", async () => {
    const { rt, tool } = await world();
    rt.session.turnStartSeq = rt.log.lastSeq();
    for (let i = 0; i < 20; i++) rt.log.append({ class: "log", data: {}, domain: "chat", event: "chat/in", text: `line ${i}` });
    const out = await runTool(tool, { about: "log" });
    expect(out.text.split("\n").at(-1)).toMatch(/^\+\d+ more; narrow with find or since\.$/);
    expect(out.text.split("\n")).toHaveLength(1 + JOURNAL_LOG_LIMIT + 1);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `mise test packages/harness/src/tools/journal.test.ts`
Expected: FAIL, received `REFUSED not_implemented: this tool is not
built yet.` and its `Next:` line.

- [ ] **Step 3: Implement**: replace the body of
  `packages/harness/src/tools/journal.ts`

```ts
import {
  itemKind,
  type NamedInventorySlot,
  type NamedInventoryState,
  type QuestLogSlot,
  type QuestQuery,
  type QuestState,
  questSlotStatus,
  type SpellDefinition,
} from "@tuicraft/core";
import type { BagsView, EquipSlotName, JournalAfter, QuestLine, SpellLine } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import { formatLogRows, queryLog } from "#harness/log/query";
import { defineGameTool, result } from "#harness/tools/define";
import { type JournalArgs, journalParams } from "#harness/tools/params";

type KnownQuest = Extract<QuestQuery, { status: "known" }>["data"];
type LoggedSlot = QuestLogSlot & { questId: number };
type Occupied = Extract<NamedInventorySlot, { status: "occupied" }>;
type Ctx = ToolCtx<JournalAfter>;

const ITEMS_PER_LINE = 6;
const QUEST_STATUS = { complete: "complete", failed: "failed", "in progress": "incomplete" } as const;
const BAG_REGIONS: ReadonlySet<string> = new Set(["backpack", "bag_item"]);
const EQUIP_SLOTS: readonly EquipSlotName[] = [
  "head",
  "neck",
  "shoulders",
  "shirt",
  "chest",
  "waist",
  "legs",
  "feet",
  "wrists",
  "hands",
  "finger1",
  "finger2",
  "trinket1",
  "trinket2",
  "back",
  "main_hand",
  "off_hand",
  "ranged",
  "tabard",
];

function emptyJournal(): JournalAfter {
  return { about: "log", label: "", more: 0, rows: [] };
}

function knownQuest(state: QuestState, questId: number): KnownQuest | undefined {
  const query = state.queries.find((candidate) => candidate.questId === questId);
  return query?.status === "known" ? query.data : undefined;
}

function killObjectives(slot: LoggedSlot, quest: KnownQuest | undefined): QuestLine["objectives"] {
  if (!quest) return [];
  return quest.targets.flatMap((target, index) => {
    if (target.count === 0) return [];
    const text = quest.objectiveTexts[index] || `objective ${index + 1}`;
    return [{ count: slot.counters[index] ?? 0, required: target.count, text }];
  });
}

function itemObjectives(state: QuestState, questId: number): QuestLine["objectives"] {
  const items = state.items.filter((item) => item.questId === questId);
  return items.map((item) => ({ count: item.carried ?? 0, required: item.required, text: `item ${item.itemId}` }));
}

function questLine(state: QuestState, slot: LoggedSlot): QuestLine {
  const quest = knownQuest(state, slot.questId);
  return {
    id: slot.questId,
    level: quest?.level,
    objectives: [...killObjectives(slot, quest), ...itemObjectives(state, slot.questId)],
    status: QUEST_STATUS[questSlotStatus(slot)],
    title: quest?.title ?? `quest ${slot.questId}`,
    turnIn: undefined,
  };
}

function questText({ id, level, objectives, status, title }: QuestLine): string {
  const levelText = level ? ` (L${level})` : "";
  const goals = objectives.map((goal) => `${goal.text} ${goal.count}/${goal.required}`).join(", ") || "no counted objectives";
  return `#${id} ${title}${levelText}: ${goals}; ${status}.`;
}

function questsResult({ handle }: Ctx): ToolResult<JournalAfter> {
  const state = handle.getQuestState();
  const logged = state.log.slots.filter((slot): slot is LoggedSlot => slot.questId !== undefined && slot.questId > 0);
  const quests = logged.map((slot) => questLine(state, slot));
  const detail = `${quests.length} quests. This is your quest log. To see what an NPC offers, use interact.`;
  return result("DONE", { after: { about: "quests", quests }, body: quests.map(questText), detail });
}

function itemName(slot: Occupied): string {
  return slot.item.name ?? `item ${slot.item.entry ?? 0}`;
}

function bagsView(inventory: NamedInventoryState): BagsView {
  const occupied = inventory.slots.filter((slot): slot is Occupied => slot.status === "occupied");
  const equipped = occupied.flatMap((slot) => {
    const name = EQUIP_SLOTS[slot.slot];
    return slot.region === "equipment" && name ? [{ name: itemName(slot), quality: slot.item.quality, slot: name }] : [];
  });
  const items = occupied
    .filter((slot) => BAG_REGIONS.has(slot.region))
    .map((slot) => ({ bag: slot.bag, count: slot.item.count ?? 1, kind: itemKind(slot.item), name: itemName(slot), quality: slot.item.quality, slot: slot.slot }));
  return { copper: inventory.coinage, equipped, freeSlots: inventory.freeSlots, items };
}

function moneyText(copper: number | undefined): string {
  if (copper === undefined) return "unknown";
  const parts = [
    [Math.floor(copper / 10_000), "g"],
    [Math.floor((copper % 10_000) / 100), "s"],
    [copper % 100, "c"],
  ] as const;
  const shown = parts.filter(([amount]) => amount > 0).map(([amount, unit]) => `${amount}${unit}`);
  return shown.length > 0 ? shown.join(" ") : "0c";
}

function equippedLine({ equipped }: BagsView): string {
  const worn = equipped.map((item) => `${item.slot.replace("_", " ")} ${item.name}`).join(", ");
  return `Equipped: ${worn || "nothing"}.`;
}

function itemLines({ items }: BagsView): string[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.name, (counts.get(item.name) ?? 0) + item.count);
  const words = [...counts].map(([name, count]) => `${name} x${count}`);
  if (words.length === 0) return ["Bags: no items."];
  const lines: string[] = [];
  for (let start = 0; start < words.length; start += ITEMS_PER_LINE) lines.push(words.slice(start, start + ITEMS_PER_LINE).join(", "));
  return lines.map((line, index) => (index === 0 ? `Bags: ${line}.` : `${line}.`));
}

function bagsResult({ handle }: Ctx): ToolResult<JournalAfter> {
  const bags = bagsView(handle.getInventoryState());
  const detail = `Money: ${moneyText(bags.copper)}. ${bags.freeSlots ?? "unknown"} free bag slots.`;
  return result("DONE", { after: { about: "bags", bags }, body: [equippedLine(bags), ...itemLines(bags)], detail });
}

function spellLine(spell: SpellDefinition): SpellLine {
  return { cooldownMs: spell.cooldown.recoveryTimeMs || undefined, cost: spell.power.costRaw || undefined, id: spell.id, name: spell.name, rank: spell.rank || undefined };
}

function spellText({ cooldownMs, cost, name, rank }: SpellLine): string {
  const rankText = rank ? ` (${rank})` : "";
  const costText = cost ? `costs ${cost}` : "no cost";
  const cooldownText = cooldownMs ? `, cooldown ${Math.round(cooldownMs / 1000)} s` : "";
  return `${name}${rankText}: ${costText}${cooldownText}.`;
}

async function spellsResult({ handle }: Ctx): Promise<ToolResult<JournalAfter>> {
  const spells = (await handle.getSpellbook()).map(spellLine).sort((a, b) => a.name.localeCompare(b.name));
  return result("DONE", { after: { about: "spells", spells }, body: spells.map(spellText), detail: `${spells.length} spells known.` });
}

function logResult(args: JournalArgs, { rt }: Ctx): ToolResult<JournalAfter> {
  const now = rt.clock.now();
  const query = { find: args.find, since: args.since };
  const page = queryLog({ log: rt.log, now, query, runs: rt.runs, turnStartSeq: rt.session.turnStartSeq });
  const older = page.more > 0 ? [`+${page.more} more; narrow with find or since.`] : [];
  const detail = `${page.rows.length + page.more} events ${page.label}${page.rows.length > 0 ? ":" : "."}`;
  const after: JournalAfter = { about: "log", label: page.label, more: page.more, rows: page.rows };
  return result("DONE", { after, body: [...formatLogRows(page.rows, now), ...older], detail });
}

function journal(args: JournalArgs, ctx: Ctx): Promise<ToolResult<JournalAfter>> {
  if (args.about === "spells") return spellsResult(ctx);
  if (args.about === "quests") return Promise.resolve(questsResult(ctx));
  if (args.about === "bags") return Promise.resolve(bagsResult(ctx));
  return Promise.resolve(logResult(args, ctx));
}

export const journalTool = defineGameTool({ fallback: emptyJournal, kind: "read", maxLines: 24, name: "journal", parameters: journalParams, run: journal });
```

`journal.ts` is about 190 non-blank lines.

- [ ] **Step 4: Run it and see it pass**

Run: `mise test packages/harness/src/tools/journal.test.ts`
Expected: PASS, 5 tests. Then `mise lint:fix`, type check, `mise lint`,
and `mise ci` (the area's last task; the whole harness package must be
green).

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/tools/journal.ts packages/harness/src/tools/journal.test.ts
mise exec -- git commit -m "feat: Add the harness journal tool" -m "The model needs its quest log, bags with equipped gear, spells and earlier events without a draining cursor. journal reads each from core or the game log and keeps quest ids in the text so engage and interact can name them."
```

Live gate: none (no protocol or daemon change). Live evidence comes
from `t0-self-state` (`journal(about: "bags")`) and `t4-quest-first`
after BOOT.

---

## Files owned by this area

| Task | Files |
|---|---|
| A2 | `packages/harness/src/ops/refs.ts` (+ test), `packages/harness/test-support/world-fixtures.ts` |
| A4 | `packages/harness/src/ops/settle.ts` (+ test) |
| A6 | `packages/harness/src/ops/repeat-guard.ts` (+ test) |
| A1a–A1d | `packages/harness/src/tools/define.ts`, `params.ts`, `registry.ts`, `install.ts` (+ `format.test.ts`, `params.test.ts`, `define.test.ts`, `install.test.ts`), the ten tool stubs, `packages/harness/test-support/tool-harness.ts`, the `installTools` line in `packages/harness/src/extension/extension.ts` |
| A8 | `packages/harness/src/ops/sightings.ts` (+ test) |
| A7a–A7b | `packages/harness/src/ops/danger.ts` (+ `danger.test.ts`, `interrupts.test.ts`) |
| A9 | `packages/harness/src/ops/progress.ts` (+ test) |
| A3a–A3c | `packages/harness/src/ops/views.ts`, `packages/harness/src/ops/resolve.ts` (+ `views.test.ts`, `now-snapshot.test.ts`, `resolve.test.ts`) |
| A5 | `packages/harness/src/ops/range.ts` (+ test) |
| A10 | `packages/harness/src/tools/look.ts` (+ test) |
| A11 | `packages/harness/src/tools/journal.ts` (+ test) |
| A12 | `packages/harness/src/tools/social.ts` (+ test) |
| A13 | `packages/harness/src/tools/stop.ts` (+ test) |
