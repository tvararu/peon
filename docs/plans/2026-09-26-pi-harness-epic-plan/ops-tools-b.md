# Area plan: ops-tools-b (B1–B13)

Plan index: [2026-09-26-pi-harness-epic-plan.md](../2026-09-26-pi-harness-epic-plan.md).

**Goal.** Build the part-B ops (`travelLeg`, `explore`, `unstick`, `lootCorpseOp`, `recoverOp`) and the six run and action tools (`travel`, `loot`, `interact`, `rest`, `recover`, `engage`) of the Pi harness, as the approved design B.3–B.8 and the contract section 2.8 say.
**Architecture.** Each tool is a thin composition over the A-area views and the B ops. The four run tools (`travel`, `engage`, `rest`, `recover`) start a tracked run with `rt.runs.start`, block in `awaitRun`, and yield `RUNNING` on human input or after 120 s. The two action tools settle each send against the server event that answers it (`settle`).
**Test shape (all tasks).** Each tool file exports `<name>Spec` next to `<name>Tool = defineGameTool(<name>Spec)`, so tests call `spec.run(args, ctx)` with no Pi session. Tests use `createTestRuntime` (F5a) and the B fixture `packages/harness/test-support/ops-fixtures.ts` (B1): row builders, `setSelf`, `driveGoto`, `attackBy`, `setLife`, `toolCtx`, `contentOf`, `limitProblem`. Each tool test runs its design B examples through `contentOf` (the `formatContent` text) and asserts `limitProblem(text)` is `undefined` (line and byte limits). The fixture holds no `expect` call, because biome's `noMisplacedAssertion` refuses assertions outside `test()`.
**Tech stack.** Bun, `bun:test`, strict TypeScript, TypeBox params from A1, core only through `@tuicraft/core` and its five lib helpers.
**Live gate.** No B task changes protocol or daemon code, so `mise test:live` is not a per-task gate (AGENTS.md "Testing"; FINAL runs it). The harness check is an Orca pane smoke, which needs BOOT (F6b). See "Pane smoke" at the end.

## Contract issues

1. **`within` cannot reach core.** `GotoTarget` has no stop distance, and a guid goal routes to the unit's own position (`client-control.ts:147-184`, `control-drive.ts:125-128`, read). B1 applies `within` in the harness: it does not call `goTo` when the goal is already in range, and it aborts the leg (so `awaitGoto` calls `halt`) as soon as the distance is at most `within`. An abort for this reason is status `arrived`.
2. **`refusalCode` input.** `goTo` throws `<class>: <raw>` (`client-control.ts:182`, read), for example `pick_destination: ambiguous ground column at destination`. B1 matches the four known texts with `includes` and strips the class prefix before it makes the snake_case fallback (first three `[a-z0-9_]+` words).
3. **`lastGoodPose` value.** The contract says "on `arrived` it sets `rt.travel.lastGoodPose`" but not which pose. Design B.3 step 4 says "the last pose from which a plan succeeded", so B1 stores the **start** pose of the arrived leg.
4. **`CodeWord.code` is a number, but `CombatEvent.reason` is a string word** (`combat.ts:133-138`, read). B13 keys `castErrors` and `swingErrors` by word, and sets `code` to the number the reason parses to, or `-1` when it is not numeric. The coordinator may want a core change that carries the numeric code.
5. **`ItemKind` has one value for food and drink** (`food_drink`, contract 1.11). `rest` cannot tell food from drink by kind. B10 uses each distinct `food_drink` item entry once, in bag order, confirms each by an aura whose `spellId` is in the item's `useSpellIds`, and stops when both thresholds hold.
6. **Spirit healer range.** `activateSpiritHealer` is silently ignored out of interaction range (SKILL.md "spirit-healer"), `goTo` is forbidden from a ghost (SKILL.md recovery step 3), and the contract gives B4 no movement. B4 returns cause `too_far` with the distance when the nearest healer is farther than `TALK_RANGE_YD`, and B11 maps it to `REFUSED too_far` with `Next: recover()` (the corpse path). This is a gap for round 2.
7. **Loot item names.** `RewardsEvent.state` is the unlabeled `RewardsState` (`rewards.ts:97-122`, read). B3 captures names from `handle.getRewardsState()` (named) at `loot_opened`, and counts from `item_push`. The B3 fallback also handles `loot_open_failed` (the lootable flag can lag the kill).
8. **No owned file for a shared B test fixture.** This plan assigns the new file `packages/harness/test-support/ops-fixtures.ts` to **B1** (test-only, never imported by `src/`). B2–B13 import it and do not edit it. So B3 and B4 also need B1 (same builder, same wave). If the coordinator refuses the file, each test file inlines the helpers it uses.
9. **Tool spec export.** Each B tool file exports `<name>Spec` (the `GameToolSpec`) beside `<name>Tool`. The tool task owns the file after A1, so the change is inside its files. No other module imports the spec.
10. **`interact` talk extras.** Design B.6 says `talk` on a vendor lists stock and on a trainer lists spells. Those parts live in B8 and B9 files, but `talk` is in `interact.ts` (B7). B7 adds a `TALK_EXTRAS` list to `interact.ts`; B8 and B9 each add one entry to it, beside their `do` branches (the contract lets them edit the dispatch; this plan treats the list as part of it).
11. **B7 split.** `interact.ts` holds the dispatch, the approach and `talk`; `interact-quest.ts` holds the shared types and helpers (`InteractStep`, `NpcTarget`, `baseAfter`, `formatMoney`, `openDialog`, `offersOf`) and the `accept`, `turn_in`, `gossip` steps, so `interact-vendor.ts` and `interact-trainer.ts` import from it without an import cycle.
12. **Pane smoke has no task and no file.** The pane smoke of the six tools needs BOOT (F6b, wave 7), which comes after every B task (wave 6). This plan does not add a task id. It proposes that the coordinator adds the "Pane smoke" checklist at the end of this file to F8e (`smoke-live.md`), or runs it at FINAL.
13. **Not a B defect, recorded for C0.** `Looted` (`loot-run.ts:26`) and `Recovered` (`corpse-run.ts:25`) are not exported (read). C0 must export them or redeclare the shapes for `LootOutcome` and `RecoveryOutcome` (contract 1.4).
14. **Assumptions about A-area code, fixed in one place.** B tests drive A3 views and A7 interrupts through the mock handle: vitals from `getCombatState().self`, life from `getRecoveryState().life`, pose from `getControlState().pose`, units from `queryNearby()` (and `getNearbyEntities()`, which A7 `nameOf` reads), a new attacker as `triggerCombatEvent({ type: "attacked", attacker, state })` with `attackers` set, death as a `life_observed` recovery event. If A3 or A7 read other members, only `ops-fixtures.ts` changes. The run tests rely on the F5ab runs double (found.md): `start` runs `launch` and refuses `busy`, `cancel` aborts with the cancel code, `release`.
15. **`nextCall` key order.** Biome's `useSortedKeys` assist is on for all harness code (`biome.json` turns it off only for `packages/core/src/wow/**` and two CLI tests, read), so every object literal passed to `nextCall` is sorted: the model sees `interact(do: "accept", npc: "u3", what: "1")`, not the design's `npc, do, what` order. The call is still valid. B tests expect the sorted order. Keeping the design order needs an ordered input to `nextCall` (A1's signature); that is the coordinator's call.
16. **`StringEnum` gives `string`.** `StringEnum<T extends readonly string[]>` (`pi-ai/dist/utils/typebox-helpers.d.ts:13`, read) infers `string[]` from the array literals in contract 2.7, so `Static` of `do`, `how`, `find` and `about` is `string`, not the union. B7 dispatches through `Map<string, InteractStep>` and B11 maps `how` through `Map<string, RecoverHow>`, with no casts. Adding `as const` to the A1 enum arrays makes the unions real; B code works either way.
17. **Two sibling files under the split rule** (contract 3.2): `tools/travel-report.ts` (owner B5; `travel.ts` passes 500 lines after `biome format` otherwise) and `tools/engage-tally.ts` (owner B13; per-run counters).
18. **The C0 mock says `jev: false`** (contract 1.13). Engage tests that fight set `handle.capabilities = () => ({ …, jev: true })`; `checkHelper` treats a throwing `capabilities()` (before C2) as "try the fight".
19. **Verified in scratch, not in the worktree.** Every B code block in this file type-checks with `tsc` against the contract types and the C0/C1 shapes, passes `biome check` with the repository `biome.json` (sorted keys, no nested ternaries, at most 4 parameters, functions at most 50 lines, cognitive complexity at most 15), and the 104 B tests pass under `bun test` against the A2–A7, A1a, F5, L3 and L4 code of `ops-tools-a.md`, `found.md` and `log-events.md` as written at 22:10 (measured). A later change to those plans can break a B test; the builder reruns the file and adapts `ops-fixtures.ts` first.

## Task order and needs

| Id | Files | Needs |
|---|---|---|
| B1 | `ops/travel-leg.ts`, `test-support/ops-fixtures.ts` | A1, A3, A5, L4 |
| B2 | `ops/explore.ts` | B1, A7 |
| B3 | `ops/loot.ts` | B1, A3, A4 (C7a for the core path) |
| B4 | `ops/recover.ts` | B1, A3, A4, A5 (C7b for the core path) |
| B5 | `tools/travel.ts`, `tools/travel-report.ts` | B1, B2, B4, L3, A7, V3 |
| B6 | `tools/loot.ts` | B1, B3, A5 |
| B7 | `tools/interact.ts`, `tools/interact-quest.ts` | B1, A4, A5 |
| B8 | `tools/interact-vendor.ts` (+ dispatch lines in `interact.ts`) | B7 |
| B9 | `tools/interact-trainer.ts` (+ dispatch lines in `interact.ts`) | B7, B8 (B9's `interact.ts` imports `interact-vendor`, and both edit `interact.ts`) |
| B10 | `tools/rest.ts` | A1, A3, A4 (`settle`), A7, L3, C11, V3, B1 |
| B11 | `tools/recover.ts` | B4, L3, V3 |
| B12 | `tools/engage.ts`, `tools/engage-choose.ts` | B1, B2, A3, A5, A7, L3 (`awaitRun`) |
| B13 | `tools/engage-fight.ts`, `tools/engage-tally.ts` (+ the fight wiring in `engage.ts`) | B12, B3, L3, L4, V3 |


All paths below are relative to `/home/deity/orca/workspaces/tuicraft/pi-epic`. Before each commit the builder runs `bun run tsc --noEmit -p packages/harness`, `mise format` and `mise lint` (all exit 0). Commit bodies are wrapped at 72 characters because the `hk` commit hook checks the wrap, so each commit uses `git commit -F -` with a here-document.

---

## Task B1: `travelLeg`, `refusalCode` and the B test fixture

One planned leg to a unit or a point, with the harness `within`, the refusal code map, and the ND F5 floor retry. The retry is kept after G8: core now resolves the floor for a unit goal itself, so the test covers both the "core resolved" path and the "core refused with one matching floor" path.

**Files**
- Create: `packages/harness/test-support/ops-fixtures.ts`
- Create: `packages/harness/src/ops/travel-leg.ts`
- Test: `packages/harness/src/ops/travel-leg.test.ts`

**Interfaces**
- Consumes:
  - `awaitGoto(handle: WorldHandle, init: { target: GotoTarget; signal: AbortSignal; pollMs?: number }): Promise<GotoEnd>` and `type GotoEnd` from `#harness/runs/adapters` (L4)
  - `poseView(ctx: ViewCtx): PoseView | undefined`, `unitViews(ctx: ViewCtx): UnitView[]` from `#harness/ops/views` (A3)
  - `distanceTo(ctx: ViewCtx, guid: bigint): number | undefined` from `#harness/ops/range` (A5)
  - `guidHex(guid: bigint): string` from `#harness/ops/refs` (A2)
  - `formatContent`, `MAX_CONTENT_LINES`, `MAX_CONTENT_BYTES` from `#harness/tools/define` (A1, fixture only)
  - `createTestRuntime(init?: TestRuntimeInit): Promise<TestRuntime>`, `type MockHandle`, `type TestRuntime` from `#test-support/runtime-fixture` (F5a)
  - `OpsCtx`, `ToolCtx<A>` from `#harness/contract/services`; `LegStatus` from `#harness/contract/details`; `PoseView` from `#harness/contract/views`; `ToolResult` from `#harness/contract/result` (F2)
- Produces:
  - `export type LegGoal = { kind: "unit"; guid: bigint; name: string } | { kind: "point"; x: number; y: number; z?: number };`
  - `export type LegResult = { status: LegStatus; reason: string | undefined; detail: string; floors: number[] | undefined; nextStep: string | undefined; traveledYd: number; floorRetried: boolean; pose: PoseView | undefined };`
  - `export const FLOOR_MATCH_YD = 0.25;`
  - `export function refusalCode(refusal: string): string;`
  - `export function travelLeg(ctx: OpsCtx, init: { goal: LegGoal; within: number }): Promise<LegResult>;`
  - Fixture (tests only): `MAP_ID`, `UnitInit`, `unitRow`, `objectRow`, `setUnits`, `SelfInit`, `setSelf`, `moveTo`, `GotoPlan`, `driveGoto`, `attackBy`, `setLife`, `die`, `TestToolCtx`, `toolCtx`, `contentOf`, `limitProblem`

- [ ] **Step 1: Write the fixture file (test support, no test of its own)**

```ts
// packages/harness/test-support/ops-fixtures.ts
import { jest } from "bun:test";
import {
  type FactionRelation,
  type GameObjectEntity,
  type GotoTarget,
  type NearbyRow,
  type NpcRole,
  ObjectType,
  type PlayerLife,
  type UnitEntity,
} from "@tuicraft/core";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import {
  formatContent,
  MAX_CONTENT_BYTES,
  MAX_CONTENT_LINES,
} from "#harness/tools/define";
import type { MockHandle, TestRuntime } from "#test-support/runtime-fixture";

export const MAP_ID = 530;

export type UnitInit = {
  guid: bigint;
  name: string;
  x: number;
  y: number;
  z?: number;
  distance: number;
  entry?: number;
  level?: number;
  hp?: number;
  maxHp?: number;
  relation?: FactionRelation;
  attackable?: boolean;
  attackingMe?: boolean;
  roles?: NpcRole[];
  lootable?: boolean;
  tappedByOther?: boolean;
  player?: boolean;
};

function rowOf(
  entity: UnitEntity | GameObjectEntity,
  distance: number,
): NearbyRow {
  return {
    attackable: false,
    attackingMe: false,
    bearingRadians: 0,
    distance,
    entity,
    horizontalDistance: distance,
    lootable: false,
    originSource: "server",
    originUpdatedAt: 0,
    position: entity.position,
    positionKind: "observed",
    positionObservedAt: 0,
    positionSource: "control",
    preparedAt: 0,
    relation: "unknown",
    remotePose: undefined,
    roles: [],
    self: false,
    tapped: false,
    tappedByOther: false,
    targetOf: undefined,
    turnRadians: 0,
  };
}

export function unitRow(init: UnitInit): NearbyRow {
  const relation = init.relation ?? "hostile";
  const entity: UnitEntity = {
    class_: 0,
    createComplete: true,
    displayId: 0,
    entry: init.entry ?? 1,
    factionTemplate: 0,
    gender: 0,
    guid: init.guid,
    health: init.hp ?? 100,
    level: init.level ?? 1,
    maxHealth: init.maxHp ?? 100,
    maxPower: [],
    name: init.name,
    npcFlags: 0,
    objectType: init.player ? ObjectType.PLAYER : ObjectType.UNIT,
    position: {
      mapId: MAP_ID,
      orientation: 0,
      x: init.x,
      y: init.y,
      z: init.z ?? 0,
    },
    power: [],
    race: 0,
    rawFields: new Map(),
    scale: 1,
    target: 0n,
    unitFlags: 0,
  };
  return {
    ...rowOf(entity, init.distance),
    attackable: init.attackable ?? relation !== "friendly",
    attackingMe: init.attackingMe ?? false,
    lootable: init.lootable ?? false,
    relation,
    roles: init.roles ?? [],
    tapped: init.tappedByOther ?? false,
    tappedByOther: init.tappedByOther ?? false,
  };
}

export function objectRow(init: {
  guid: bigint;
  name: string;
  x: number;
  y: number;
  distance: number;
}): NearbyRow {
  const entity: GameObjectEntity = {
    bytes1: 0,
    createComplete: true,
    displayId: 0,
    entry: 1,
    flags: 0,
    gameObjectType: 0,
    guid: init.guid,
    name: init.name,
    objectType: ObjectType.GAMEOBJECT,
    position: { mapId: MAP_ID, orientation: 0, x: init.x, y: init.y, z: 0 },
    rawFields: new Map(),
    scale: 1,
  };
  return rowOf(entity, init.distance);
}

export function setUnits(handle: MockHandle, rows: readonly NearbyRow[]): void {
  handle.queryNearby = () => [...rows];
  handle.getNearbyEntities = () => rows.map((row) => row.entity);
}

export type SelfInit = {
  hp?: number;
  maxHp?: number;
  power?: number;
  maxPower?: number;
  powerType?: number;
  level?: number;
  life?: PlayerLife;
  x?: number;
  y?: number;
  z?: number;
};

export function moveTo(
  handle: MockHandle,
  at: { x: number; y: number; z?: number },
): void {
  const control = handle.getControlState();
  const pose = {
    mapId: MAP_ID,
    orientation: 0,
    source: "server" as const,
    updatedAt: 0,
    x: at.x,
    y: at.y,
    z: at.z ?? 0,
  };
  handle.getControlState = () => ({ ...control, pose, serverPose: pose });
}

export function setSelf(handle: MockHandle, init: SelfInit = {}): void {
  const combat = handle.getCombatState();
  const recovery = handle.getRecoveryState();
  const self = {
    ...combat.self,
    health: init.hp ?? 200,
    level: init.level ?? 10,
    maxHealth: init.maxHp ?? 200,
    maxPower: init.maxPower ?? 300,
    power: init.power ?? 300,
    powerType: init.powerType ?? 0,
  };
  handle.getCombatState = () => ({ ...combat, self });
  handle.getRecoveryState = () => ({ ...recovery, life: init.life ?? "alive" });
  moveTo(handle, { x: init.x ?? 0, y: init.y ?? 0, z: init.z ?? 0 });
}

export type GotoPlan = {
  arrive?: { x: number; y: number; z?: number };
  refuse?: string;
  floors?: number[];
  hold?: boolean;
  onArrive?: () => void;
};

export function driveGoto(handle: MockHandle, plans: readonly GotoPlan[]) {
  const idle = handle.getNavigationState();
  let calls = 0;
  const goTo = jest.fn((_target: GotoTarget) => {
    const plan = plans[Math.min(calls, plans.length - 1)] ?? {};
    calls += 1;
    if (plan.refuse !== undefined) {
      handle.getNavigationState = () => ({
        ...idle,
        blockedReason: plan.refuse,
        floors: plan.floors,
      });
      throw new Error(plan.refuse);
    }
    handle.getNavigationState = () => ({ ...idle, active: true });
    if (plan.hold) return;
    queueMicrotask(() => {
      if (plan.arrive) moveTo(handle, plan.arrive);
      plan.onArrive?.();
      handle.getNavigationState = () => ({ ...idle, active: false });
      handle.triggerControlEvent({
        reason: "arrived",
        state: handle.getControlState(),
        type: "movement_stopped",
      });
    });
  });
  handle.goTo = goTo;
  return goTo;
}

export function attackBy(handle: MockHandle, guid: bigint): void {
  const state = handle.getCombatState();
  const next = { ...state, attackers: [...state.attackers, guid] };
  handle.getCombatState = () => next;
  handle.triggerCombatEvent({ attacker: guid, state: next, type: "attacked" });
}

export function setLife(handle: MockHandle, life: PlayerLife): void {
  const state = { ...handle.getRecoveryState(), life };
  handle.getRecoveryState = () => state;
  handle.triggerRecoveryEvent({ at: 0, state, type: "life_observed" });
}

export function die(handle: MockHandle): void {
  setLife(handle, "dead");
}

export type TestToolCtx<A> = ToolCtx<A> & {
  updates: ToolResult<A>[];
  progressed: string[];
};

export function toolCtx<A>(
  t: TestRuntime,
  signal: AbortSignal = new AbortController().signal,
): TestToolCtx<A> {
  const updates: ToolResult<A>[] = [];
  const progressed: string[] = [];
  return {
    handle: t.handle,
    progress: (text) => {
      progressed.push(text);
    },
    progressed,
    rt: t.rt,
    signal,
    toolCallId: "call-1",
    update: (partial) => {
      updates.push(partial);
    },
    updates,
  };
}

export function contentOf(
  res: ToolResult<unknown>,
  maxLines = MAX_CONTENT_LINES,
): string {
  return formatContent(res, { danger: undefined, maxLines });
}

export function limitProblem(
  text: string,
  maxLines = MAX_CONTENT_LINES,
): string | undefined {
  const lines = text.split("\n").length;
  const bytes = new TextEncoder().encode(text).length;
  if (lines > maxLines) return `${lines} lines, limit ${maxLines}`;
  if (bytes > MAX_CONTENT_BYTES)
    return `${bytes} bytes, limit ${MAX_CONTENT_BYTES}`;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// packages/harness/src/ops/travel-leg.test.ts
import { describe, expect, test } from "bun:test";
import { refusalCode, travelLeg } from "#harness/ops/travel-leg";
import {
  driveGoto,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

describe("refusalCode", () => {
  test.each([
    ["unreachable: pathfind_find_height failed (UNKNOWN_HEIGHT)", "no_ground"],
    [
      "pick_destination: ambiguous ground column at destination",
      "ambiguous_floor",
    ],
    [
      "pick_destination: destination is not on a ground floor",
      "ambiguous_floor",
    ],
    ["stop: start snapped off the requested ground position", "start_off_mesh"],
    ["stop: ground corridor changes surface", "surface_change"],
    ["stop: no_pose", "no_pose"],
    [
      "unreachable: pathfind_find_path failed (UNKNOWN_PATH)",
      "pathfind_find_path_failed_unknown_path",
    ],
    ["", "refused"],
  ])("%s -> %s", (text, code) => {
    expect(refusalCode(text)).toBe(code);
  });
});

describe("travelLeg", () => {
  test("arrives at a point and remembers the start pose", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    const goTo = driveGoto(t.handle, [{ arrive: { x: 10, y: 0 } }]);
    const leg = await travelLeg(toolCtx(t), {
      goal: { kind: "point", x: 10, y: 0 },
      within: 1,
    });
    expect(leg.status).toBe("arrived");
    expect(goTo).toHaveBeenCalledWith({ kind: "point", x: 10, y: 0 });
    expect(t.rt.travel.lastGoodPose?.x).toBe(0);
  });

  test("does not move when the unit is already within range", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    setUnits(t.handle, [
      unitRow({
        distance: 2,
        guid: 0x10n,
        name: "Marniel Amberlight",
        relation: "friendly",
        x: 2,
        y: 0,
      }),
    ]);
    const goTo = driveGoto(t.handle, [{ arrive: { x: 2, y: 0 } }]);
    const leg = await travelLeg(toolCtx(t), {
      goal: { guid: 0x10n, kind: "unit", name: "Marniel Amberlight" },
      within: 3,
    });
    expect(leg.status).toBe("arrived");
    expect(goTo).not.toHaveBeenCalled();
  });

  test("maps a planner refusal to its code and keeps no good pose", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    driveGoto(t.handle, [
      { refuse: "unreachable: pathfind_find_height failed (UNKNOWN_HEIGHT)" },
    ]);
    const leg = await travelLeg(toolCtx(t), {
      goal: { kind: "point", x: 50, y: 0 },
      within: 1,
    });
    expect(leg).toMatchObject({
      floorRetried: false,
      reason: "no_ground",
      status: "refused",
    });
    expect(t.rt.travel.lastGoodPose).toBeUndefined();
  });

  test("core resolved the floor: a unit goal arrives on the first plan", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    setUnits(t.handle, [
      unitRow({
        distance: 30,
        guid: 0x10n,
        name: "Marniel Amberlight",
        relation: "friendly",
        x: 30,
        y: 0,
        z: 72.7,
      }),
    ]);
    const goTo = driveGoto(t.handle, [{ arrive: { x: 29, y: 0, z: 72.7 } }]);
    const leg = await travelLeg(toolCtx(t), {
      goal: { guid: 0x10n, kind: "unit", name: "Marniel Amberlight" },
      within: 3,
    });
    expect(leg).toMatchObject({ floorRetried: false, status: "arrived" });
    expect(goTo).toHaveBeenCalledTimes(1);
    expect(goTo).toHaveBeenCalledWith({ guid: 0x10n, kind: "guid" });
  });

  test("core refused with one matching floor: retries once on that floor", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    setUnits(t.handle, [
      unitRow({
        distance: 30,
        guid: 0x10n,
        name: "Marniel Amberlight",
        relation: "friendly",
        x: 30,
        y: 0,
        z: 72.7,
      }),
    ]);
    const goTo = driveGoto(t.handle, [
      {
        floors: [72.6, 80.1],
        refuse: "pick_destination: ambiguous ground column at destination",
      },
      { arrive: { x: 30, y: 0, z: 72.6 } },
    ]);
    const leg = await travelLeg(toolCtx(t), {
      goal: { guid: 0x10n, kind: "unit", name: "Marniel Amberlight" },
      within: 3,
    });
    expect(leg).toMatchObject({ floorRetried: true, status: "arrived" });
    expect(goTo).toHaveBeenNthCalledWith(2, {
      kind: "point",
      x: 30,
      y: 0,
      z: 72.6,
    });
  });

  test("two floors near the unit: no retry, the refusal stands", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    setUnits(t.handle, [
      unitRow({
        distance: 30,
        guid: 0x10n,
        name: "Marniel Amberlight",
        relation: "friendly",
        x: 30,
        y: 0,
        z: 72.7,
      }),
    ]);
    const goTo = driveGoto(t.handle, [
      {
        floors: [72.6, 72.8],
        refuse: "pick_destination: ambiguous ground column at destination",
      },
    ]);
    const leg = await travelLeg(toolCtx(t), {
      goal: { guid: 0x10n, kind: "unit", name: "Marniel Amberlight" },
      within: 3,
    });
    expect(leg).toMatchObject({
      floorRetried: false,
      floors: [72.6, 72.8],
      reason: "ambiguous_floor",
      status: "refused",
    });
    expect(goTo).toHaveBeenCalledTimes(1);
  });

  test("a human stop cancels the leg with the cancel code", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    driveGoto(t.handle, [{ hold: true }]);
    const stop = new AbortController();
    const pending = travelLeg(toolCtx(t, stop.signal), {
      goal: { kind: "point", x: 50, y: 0 },
      within: 1,
    });
    stop.abort(new Error("human_stop"));
    expect(await pending).toMatchObject({
      reason: "human_stop",
      status: "cancelled",
    });
    expect(t.handle.halt).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test and see it fail**

Run: `mise test packages/harness/src/ops/travel-leg.test.ts`
Expected: FAIL with `Cannot find module '#harness/ops/travel-leg'`.

- [ ] **Step 4: Implement**

```ts
// packages/harness/src/ops/travel-leg.ts
import type { GotoTarget } from "@tuicraft/core";
import { messageOf } from "@tuicraft/core/lib/errors";
import type { LegStatus } from "#harness/contract/details";
import type { OpsCtx } from "#harness/contract/services";
import type { PoseView } from "#harness/contract/views";
import { distanceTo } from "#harness/ops/range";
import { guidHex } from "#harness/ops/refs";
import { poseView, unitViews } from "#harness/ops/views";
import { awaitGoto, type GotoEnd } from "#harness/runs/adapters";

export type LegGoal =
  | { kind: "unit"; guid: bigint; name: string }
  | { kind: "point"; x: number; y: number; z?: number };

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
const WITHIN_POLL_MS = 250;
const CODE_WORDS = 3;
const CANCEL_CODES = new Set(["human_stop", "esc", "quit", "stopped_by_tool"]);
const CLASS_PREFIX = /^(?:wait|pick_destination|unreachable|stop): /;
const KNOWN: readonly (readonly [string, string])[] = [
  ["UNKNOWN_HEIGHT", "no_ground"],
  ["ambiguous ground column at destination", "ambiguous_floor"],
  ["not on a ground floor", "ambiguous_floor"],
  ["start snapped off the requested ground position", "start_off_mesh"],
  ["ground corridor changes surface", "surface_change"],
];

export function refusalCode(refusal: string): string {
  const known = KNOWN.find(([text]) => refusal.includes(text));
  if (known) return known[1];
  const words =
    refusal
      .replace(CLASS_PREFIX, "")
      .toLowerCase()
      .match(/[a-z0-9_]+/g) ?? [];
  return words.slice(0, CODE_WORDS).join("_") || "refused";
}

function remainingTo(ctx: OpsCtx, goal: LegGoal): number | undefined {
  if (goal.kind === "unit") return distanceTo(ctx, goal.guid);
  const pose = poseView(ctx);
  return pose ? Math.hypot(pose.x - goal.x, pose.y - goal.y) : undefined;
}

function targetOf(goal: LegGoal): GotoTarget {
  if (goal.kind === "unit") return { guid: goal.guid, kind: "guid" };
  return goal.z === undefined
    ? { kind: "point", x: goal.x, y: goal.y }
    : { kind: "point", x: goal.x, y: goal.y, z: goal.z };
}

function stopOf(signal: AbortSignal): { status: LegStatus; reason: string } {
  const reason = messageOf(signal.reason, "aborted");
  return {
    reason,
    status: CANCEL_CODES.has(reason) ? "cancelled" : "interrupted",
  };
}

function fromEnd(ctx: OpsCtx, end: GotoEnd, near: boolean): LegResult {
  const base = {
    floorRetried: false,
    floors: end.floors,
    nextStep: end.nextStep,
    pose: poseView(ctx),
    traveledYd: end.traveledYd,
  };
  if (end.status === "stopped" && near)
    return { ...base, detail: "arrived", reason: undefined, status: "arrived" };
  if (end.status === "stopped") {
    const stop = stopOf(ctx.signal);
    return { ...base, ...stop, detail: stop.reason };
  }
  const refusal = end.refusal ?? "refused";
  if (end.status === "refused")
    return {
      ...base,
      detail: refusal,
      reason: refusalCode(refusal),
      status: "refused",
    };
  if (end.refusal !== undefined)
    return {
      ...base,
      detail: refusal,
      reason: refusalCode(refusal),
      status: "failed",
    };
  return { ...base, detail: "arrived", reason: undefined, status: "arrived" };
}

async function legOnce(
  ctx: OpsCtx,
  goal: LegGoal,
  within: number,
): Promise<LegResult> {
  const start = poseView(ctx);
  const before = remainingTo(ctx, goal);
  if (before !== undefined && before <= within)
    return {
      detail: "already in range",
      floorRetried: false,
      floors: undefined,
      nextStep: undefined,
      pose: start,
      reason: undefined,
      status: "arrived",
      traveledYd: 0,
    };
  const near = new AbortController();
  const check = () => {
    const left = remainingTo(ctx, goal);
    if (left !== undefined && left <= within) near.abort(new Error("within"));
  };
  const off = ctx.handle.onControlEvent(check);
  const timer = setInterval(check, WITHIN_POLL_MS);
  try {
    const end = await awaitGoto(ctx.handle, {
      signal: AbortSignal.any([ctx.signal, near.signal]),
      target: targetOf(goal),
    });
    const leg = fromEnd(ctx, end, near.signal.aborted && !ctx.signal.aborted);
    if (leg.status === "arrived" && start) ctx.rt.travel.lastGoodPose = start;
    return leg;
  } finally {
    off();
    clearInterval(timer);
  }
}

function matchFloor(
  ctx: OpsCtx,
  guid: bigint,
  floors: readonly number[] | undefined,
) {
  const unit = unitViews(ctx).find((view) => view.guid === guidHex(guid));
  const z = unit?.z;
  if (unit?.x === undefined || unit.y === undefined || z === undefined) return;
  const matches = (floors ?? []).filter(
    (height) => Math.abs(height - z) <= FLOOR_MATCH_YD,
  );
  const [floor] = matches;
  return matches.length === 1 && floor !== undefined
    ? { x: unit.x, y: unit.y, z: floor }
    : undefined;
}

export async function travelLeg(
  ctx: OpsCtx,
  init: { goal: LegGoal; within: number },
): Promise<LegResult> {
  const first = await legOnce(ctx, init.goal, init.within);
  if (
    init.goal.kind !== "unit" ||
    first.status !== "refused" ||
    first.reason !== "ambiguous_floor"
  )
    return first;
  const point = matchFloor(ctx, init.goal.guid, first.floors);
  if (!point) return first;
  const second = await legOnce(ctx, { kind: "point", ...point }, init.within);
  return {
    ...second,
    floorRetried: true,
    traveledYd: first.traveledYd + second.traveledYd,
  };
}
```

- [ ] **Step 5: Run the test and see it pass**

Run: `mise test packages/harness/src/ops/travel-leg.test.ts`
Expected: PASS, 15 tests (8 `refusalCode` rows, 7 `travelLeg`).

- [ ] **Step 6: Commit**

```bash
git add packages/harness/test-support/ops-fixtures.ts packages/harness/src/ops/travel-leg.ts packages/harness/src/ops/travel-leg.test.ts
mise exec -- git commit -F - <<'MSG'
feat: Add the harness travel leg

Every harness move goes through one bounded leg. It maps the planner's
refusal text to a code, keeps the ND F5 floor retry after G8, and stops
at the model's within distance, which core cannot take.
MSG
```

---

## Task B2: `explore`, `unstick`, `parseDirection`

`explore` walks up to 40 yd in planned `goTo` point legs with no `z` (ND §3c: never a straight walk), stops on a new unit of interest, on danger, or after 3 obstructed legs, and marks the 20 yd cells it visits. `unstick` is the only user of `walkToward`: one walk of at most 5 yd toward the last good pose, or away from the nearest game object (ND R3b).

**Files**
- Create: `packages/harness/src/ops/explore.ts`
- Test: `packages/harness/src/ops/explore.test.ts`

**Interfaces**
- Consumes: `travelLeg`, `LegResult` (B1); `poseView`, `unitViews` (A3); `dangerView(ctx: ViewCtx): DangerView` (A7); `Refusal` (F2); `ObjectType` from `@tuicraft/core`; `OpsCtx`, `LegView`, `Compass`, `PoseView`, `UnitView` (F2); `rt.travel: TravelMemory` (F5a)
- Produces:
  - `export type UnstickResult = { movedYd: number; toward: "last_good_pose" | "away_from_object"; refusedGoal: string | undefined };`
  - `export type ExploreStop = "new_unit" | "danger" | "obstructed" | "distance";`
  - `export type ExploreResult = { direction: Compass; walkedYd: number; legs: LegView[]; obstructed: number; newInView: UnitView[]; stoppedBy: ExploreStop };`
  - `export const UNSTICK_MAX_YD = 5;`, `export const EXPLORE_MAX_YD = 40;`, `export const EXPLORE_MAX_OBSTRUCTED = 3;`
  - `export function parseDirection(text: string): Compass | undefined;`
  - `export function unstick(ctx: OpsCtx): Promise<UnstickResult>;`
  - `export function explore(ctx: OpsCtx, init: { direction: Compass | undefined; wanted?: (unit: UnitView) => boolean }): Promise<ExploreResult>;`

- [ ] **Step 1: Write the failing test**

```ts
// packages/harness/src/ops/explore.test.ts
import { describe, expect, jest, test } from "bun:test";
import type { Compass, PoseView } from "#harness/contract/views";
import {
  explore,
  parseDirection,
  UNSTICK_MAX_YD,
  unstick,
} from "#harness/ops/explore";
import {
  driveGoto,
  MAP_ID,
  objectRow,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";

const stalker = unitRow({
  distance: 22,
  guid: 0x20n,
  level: 7,
  name: "Springpaw Stalker",
  x: 40,
  y: 0,
});

function walked(handle: MockHandle, traveled: number) {
  const walk = jest.fn(async () => ({
    pose: {
      mapId: MAP_ID,
      orientation: 0,
      source: "server" as const,
      updatedAt: 0,
      x: 0,
      y: 0,
      z: 0,
    },
    status: "completed" as const,
    traveled,
  }));
  handle.walkToward = walk;
  return walk;
}

const directions: [string, Compass | undefined][] = [
  ["explore north", "N"],
  ["northeast", "NE"],
  ["explore  South", "S"],
  ["NW", "NW"],
  ["explore", undefined],
  ["up", undefined],
];

describe("parseDirection", () => {
  test.each(directions)("%s -> %s", (text, want) => {
    expect(parseDirection(text)).toBe(want);
  });
});

describe("explore", () => {
  test("walks planned point legs with no z and stops on a new hostile", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    const goTo = driveGoto(t.handle, [
      {
        arrive: { x: 20, y: 0 },
        onArrive: () => setUnits(t.handle, [stalker]),
      },
    ]);
    const result = await explore(toolCtx(t), { direction: "N" });
    expect(goTo).toHaveBeenCalledWith({ kind: "point", x: 20, y: 0 });
    expect(result).toMatchObject({
      direction: "N",
      obstructed: 0,
      stoppedBy: "new_unit",
      walkedYd: 20,
    });
    expect(result.newInView.map((unit) => unit.name)).toEqual([
      "Springpaw Stalker",
    ]);
    expect(t.rt.travel.visitedCells.has(`${MAP_ID}:1:0`)).toBe(true);
  });

  test("stops after 40 yd when nothing new comes into view", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    driveGoto(t.handle, [
      { arrive: { x: 20, y: 0 } },
      { arrive: { x: 40, y: 0 } },
    ]);
    const result = await explore(toolCtx(t), { direction: "N" });
    expect(result).toMatchObject({ stoppedBy: "distance", walkedYd: 40 });
    expect(result.legs).toHaveLength(2);
  });

  test("halves the leg after each refusal and stops after 3 obstructed legs", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    const goTo = driveGoto(t.handle, [
      { refuse: "unreachable: pathfind_find_path failed (UNKNOWN_PATH)" },
    ]);
    const result = await explore(toolCtx(t), { direction: "N" });
    expect(result).toMatchObject({
      obstructed: 3,
      stoppedBy: "obstructed",
      walkedYd: 0,
    });
    expect(goTo.mock.calls.map((call) => call[0])).toEqual([
      { kind: "point", x: 20, y: 0 },
      { kind: "point", x: 10, y: 0 },
      { kind: "point", x: 5, y: 0 },
    ]);
  });

  test("without a direction it turns to the nearest unvisited cell", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    t.rt.travel.visitedCells.add(`${MAP_ID}:1:0`);
    driveGoto(t.handle, [
      {
        arrive: { x: 14, y: -14 },
        onArrive: () => setUnits(t.handle, [stalker]),
      },
    ]);
    const result = await explore(toolCtx(t), { direction: undefined });
    expect(result.direction).toBe("NE");
  });
});

describe("unstick", () => {
  const good: PoseView = {
    ageMs: 0,
    facing: "N",
    mapId: MAP_ID,
    serverFixAgeMs: 0,
    source: "server",
    x: 3,
    y: 4,
    z: 0,
  };

  test("walks at most 5 yd toward the last good pose and names the refused goal", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    t.rt.travel.lastGoodPose = good;
    t.rt.travel.lastRefusedGoal = "u4";
    const walk = walked(t.handle, 4.8);
    const ctx = toolCtx(t);
    const result = await unstick(ctx);
    expect(walk).toHaveBeenCalledWith(
      { kind: "point", x: 3, y: 4, z: 0 },
      UNSTICK_MAX_YD,
      ctx.signal,
    );
    expect(result).toEqual({
      movedYd: 4.8,
      refusedGoal: "u4",
      toward: "last_good_pose",
    });
  });

  test("with no good pose it walks away from the nearest object", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    setUnits(t.handle, [
      objectRow({ distance: 2, guid: 0x30n, name: "Signpost", x: 2, y: 0 }),
    ]);
    const walk = walked(t.handle, 5);
    const ctx = toolCtx(t);
    const result = await unstick(ctx);
    expect(walk).toHaveBeenCalledWith(
      { kind: "point", x: -5, y: 0, z: 0 },
      UNSTICK_MAX_YD,
      ctx.signal,
    );
    expect(result.toward).toBe("away_from_object");
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/ops/explore.test.ts`
Expected: FAIL with `Cannot find module '#harness/ops/explore'`.

- [ ] **Step 3: Implement**

```ts
// packages/harness/src/ops/explore.ts
import { ObjectType } from "@tuicraft/core";
import type { LegView } from "#harness/contract/details";
import type { OpsCtx } from "#harness/contract/services";
import type { Compass, PoseView, UnitView } from "#harness/contract/views";
import { dangerView } from "#harness/ops/danger";
import { Refusal } from "#harness/ops/refusal";
import { type LegResult, travelLeg } from "#harness/ops/travel-leg";
import { poseView, unitViews } from "#harness/ops/views";

export type UnstickResult = {
  movedYd: number;
  toward: "last_good_pose" | "away_from_object";
  refusedGoal: string | undefined;
};
export type ExploreStop = "new_unit" | "danger" | "obstructed" | "distance";
export type ExploreResult = {
  direction: Compass;
  walkedYd: number;
  legs: LegView[];
  obstructed: number;
  newInView: UnitView[];
  stoppedBy: ExploreStop;
};

export const UNSTICK_MAX_YD = 5;
export const EXPLORE_MAX_YD = 40;
export const EXPLORE_MAX_OBSTRUCTED = 3;
const CELL_YD = 20;
const LEG_YD = 20;
const MAX_LEGS = 6;
const MIN_UNSTICK_YD = 0.5;
const RING: readonly Compass[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const SEARCH = [0, 1, -1, 2, -2, 3, -3, 4];
const WORDS: Record<string, Compass> = {
  east: "E",
  north: "N",
  northeast: "NE",
  northwest: "NW",
  south: "S",
  southeast: "SE",
  southwest: "SW",
  west: "W",
};
const DIAGONAL = Math.SQRT1_2;
const EXPLORE_PREFIX = /^explore\s*/;
const STEP: Record<Compass, { dx: number; dy: number }> = {
  E: { dx: 0, dy: -1 },
  N: { dx: 1, dy: 0 },
  NE: { dx: DIAGONAL, dy: -DIAGONAL },
  NW: { dx: DIAGONAL, dy: DIAGONAL },
  S: { dx: -1, dy: 0 },
  SE: { dx: -DIAGONAL, dy: -DIAGONAL },
  SW: { dx: -DIAGONAL, dy: DIAGONAL },
  W: { dx: 0, dy: 1 },
};

export function parseDirection(text: string): Compass | undefined {
  const word = text.trim().toLowerCase().replace(EXPLORE_PREFIX, "");
  if (word === "") return undefined;
  return WORDS[word] ?? RING.find((compass) => compass.toLowerCase() === word);
}

function cellKey(at: { mapId: number; x: number; y: number }): string {
  return `${at.mapId}:${Math.floor(at.x / CELL_YD)}:${Math.floor(at.y / CELL_YD)}`;
}

function ahead(
  pose: PoseView,
  direction: Compass,
  yards: number,
): { x: number; y: number } {
  const step = STEP[direction];
  return { x: pose.x + step.dx * yards, y: pose.y + step.dy * yards };
}

function needPose(ctx: OpsCtx): PoseView {
  const pose = poseView(ctx);
  if (!pose)
    throw new Refusal({
      detail: "your position is not known yet.",
      next: "look()",
      reason: "no_pose",
    });
  return pose;
}

function pickDirection(ctx: OpsCtx, pose: PoseView): Compass {
  const start = RING.indexOf(pose.facing);
  for (const offset of SEARCH) {
    const direction = RING[(start + offset + RING.length) % RING.length];
    if (
      direction &&
      !ctx.rt.travel.visitedCells.has(
        cellKey({ mapId: pose.mapId, ...ahead(pose, direction, CELL_YD) }),
      )
    )
      return direction;
  }
  return pose.facing;
}

function interesting(unit: UnitView): boolean {
  return unit.attackable || unit.roles.length > 0;
}

type Walk = {
  ctx: OpsCtx;
  direction: Compass;
  wanted: (unit: UnitView) => boolean;
  seen: Set<string>;
  legs: LegView[];
  newInView: UnitView[];
  walkedYd: number;
  obstructed: number;
  stepYd: number;
};

function freshUnits(walk: Walk): UnitView[] {
  const fresh = unitViews(walk.ctx).filter((unit) => !walk.seen.has(unit.guid));
  for (const unit of fresh) {
    walk.seen.add(unit.guid);
    walk.newInView.push(unit);
  }
  return fresh;
}

function stopAfter(
  walk: Walk,
  leg: LegResult,
  fresh: readonly UnitView[],
): ExploreStop | undefined {
  if (
    leg.status === "cancelled" ||
    leg.status === "interrupted" ||
    dangerView(walk.ctx).attackers.length > 0
  )
    return "danger";
  if (fresh.some(walk.wanted)) return "new_unit";
  if (leg.status === "arrived") {
    walk.stepYd = LEG_YD;
    return;
  }
  walk.obstructed += 1;
  walk.stepYd /= 2;
  return walk.obstructed >= EXPLORE_MAX_OBSTRUCTED ? "obstructed" : undefined;
}

async function walkLeg(
  walk: Walk,
  start: PoseView,
): Promise<ExploreStop | undefined> {
  const { ctx } = walk;
  const from = poseView(ctx) ?? start;
  const point = ahead(
    from,
    walk.direction,
    Math.min(walk.stepYd, EXPLORE_MAX_YD - walk.walkedYd),
  );
  const leg = await travelLeg(ctx, {
    goal: { kind: "point", ...point },
    within: 1,
  });
  const to = poseView(ctx) ?? from;
  walk.walkedYd += Math.hypot(to.x - from.x, to.y - from.y);
  ctx.rt.travel.visitedCells.add(cellKey(to));
  walk.legs.push({
    index: walk.legs.length,
    reason: leg.reason,
    status: leg.status,
    traveledYd: leg.traveledYd,
  });
  return stopAfter(walk, leg, freshUnits(walk));
}

export async function explore(
  ctx: OpsCtx,
  init: {
    direction: Compass | undefined;
    wanted?: (unit: UnitView) => boolean;
  },
): Promise<ExploreResult> {
  const start = needPose(ctx);
  const walk: Walk = {
    ctx,
    direction: init.direction ?? pickDirection(ctx, start),
    legs: [],
    newInView: [],
    obstructed: 0,
    seen: new Set(unitViews(ctx).map((unit) => unit.guid)),
    stepYd: LEG_YD,
    walkedYd: 0,
    wanted: init.wanted ?? interesting,
  };
  ctx.rt.travel.visitedCells.add(cellKey(start));
  let stoppedBy: ExploreStop | undefined;
  while (
    !stoppedBy &&
    walk.walkedYd < EXPLORE_MAX_YD &&
    walk.legs.length < MAX_LEGS
  )
    stoppedBy = await walkLeg(walk, start);
  const { direction, legs, newInView, obstructed, walkedYd } = walk;
  return {
    direction,
    legs,
    newInView,
    obstructed,
    stoppedBy: stoppedBy ?? "distance",
    walkedYd,
  };
}

function awayPoint(
  ctx: OpsCtx,
  pose: PoseView,
): { x: number; y: number; z: number } {
  const [nearest] = ctx.handle
    .queryNearby()
    .filter(
      (row) =>
        row.entity.objectType === ObjectType.GAMEOBJECT &&
        row.position &&
        row.distance !== null,
    )
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  const from = nearest?.position;
  const back = STEP[pose.facing];
  const dx = from ? pose.x - from.x : -back.dx;
  const dy = from ? pose.y - from.y : -back.dy;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: pose.x + (dx / length) * UNSTICK_MAX_YD,
    y: pose.y + (dy / length) * UNSTICK_MAX_YD,
    z: pose.z,
  };
}

export async function unstick(ctx: OpsCtx): Promise<UnstickResult> {
  const pose = needPose(ctx);
  const good = ctx.rt.travel.lastGoodPose;
  const refusedGoal = ctx.rt.travel.lastRefusedGoal;
  const back =
    good && good.mapId === pose.mapId
      ? Math.hypot(good.x - pose.x, good.y - pose.y)
      : 0;
  if (good && back >= MIN_UNSTICK_YD) {
    const outcome = await ctx.handle.walkToward(
      { kind: "point", x: good.x, y: good.y, z: good.z },
      Math.min(UNSTICK_MAX_YD, back),
      ctx.signal,
    );
    return { movedYd: outcome.traveled, refusedGoal, toward: "last_good_pose" };
  }
  const outcome = await ctx.handle.walkToward(
    { kind: "point", ...awayPoint(ctx, pose) },
    UNSTICK_MAX_YD,
    ctx.signal,
  );
  return { movedYd: outcome.traveled, refusedGoal, toward: "away_from_object" };
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `mise test packages/harness/src/ops/explore.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/ops/explore.ts packages/harness/src/ops/explore.test.ts
mise exec -- git commit -F - <<'MSG'
feat: Add harness explore and unstick

Tasks say "north of town", so the model needs an honest way to walk a
direction. Explore uses planned point legs only, and unstick is the one
bounded straight walk that clears a snapped start (ND R3b).
MSG
```

---

## Task B3: `lootCorpseOp`

Loot one corpse through core `lootCorpse` (C7a), and collect item names, counts and money while it runs. Until C7a lands, `lootCorpse` throws `not_implemented`, and the op runs the harness sequence of design B.5: release a leftover window, open, take each slot only after the previous push arrived (the spike's jam came from two slot requests at once), take money, release, await the release.

**Files**
- Create: `packages/harness/src/ops/loot.ts`
- Test: `packages/harness/src/ops/loot.test.ts`

**Interfaces**
- Consumes: `handle.lootCorpse(guid: bigint, signal: AbortSignal): Promise<LootOutcome>` (C0, body C7a); `handle.onRewardsEvent`, `getRewardsState(): NamedRewardsState`, `getInventoryState(): NamedInventoryState`, `openLoot`, `takeLoot`, `takeLootMoney`, `releaseLoot` (core); `settle<E>(init: SettleInit<E>): Promise<E | undefined>` (A4); `guidHex` (A2); `rt.mutex: WorldMutex` (F5a); `LootLine` (F2); `messageOf` from `@tuicraft/core/lib/errors`
- Produces:
  - `export type LootOpResult = { outcome: LootOutcome; items: LootLine[]; copper: number; freeSlots: number | undefined };`
  - `export function lootCorpseOp(ctx: OpsCtx, guid: bigint): Promise<LootOpResult>;`

- [ ] **Step 1: Write the failing test**

```ts
// packages/harness/src/ops/loot.test.ts
import { describe, expect, test } from "bun:test";
import type { NamedRewardsState } from "@tuicraft/core";
import { lootCorpseOp } from "#harness/ops/loot";
import { toolCtx } from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";

const CORPSE = 0x20n;

function push(itemId: number, count: number) {
  return {
    bagSlot: 255,
    count,
    created: 0,
    guid: 0n,
    itemId,
    observedAt: 0,
    randomPropertyId: 0,
    randomSuffix: 0,
    received: 1,
    showInChat: 1,
    slot: 0,
    totalCount: count,
  };
}

function openWindow(handle: MockHandle): NamedRewardsState {
  const base = handle.getRewardsState();
  return {
    ...base,
    loot: {
      guid: CORPSE,
      invalidatedReason: undefined,
      items: [
        {
          count: 1,
          displayId: 0,
          itemId: 7073,
          name: "Broken Fang",
          quality: 0,
          randomPropertyId: 0,
          randomSuffix: 0,
          slot: 0,
          slotType: 0,
        },
      ],
      lootType: 1,
      money: 12,
      openedAt: 0,
      phase: "open",
    },
  };
}

describe("lootCorpseOp", () => {
  test("core path: names from the window, counts from pushes, money from notices", async () => {
    const t = await createTestRuntime();
    const open = openWindow(t.handle);
    t.handle.lootCorpse = async () => {
      t.handle.getRewardsState = () => open;
      t.handle.triggerRewardsEvent({ at: 0, state: open, type: "loot_opened" });
      t.handle.triggerRewardsEvent({
        at: 0,
        state: { ...open, lastItemPush: push(7073, 1) },
        type: "item_push",
      });
      t.handle.triggerRewardsEvent({
        at: 0,
        state: {
          ...open,
          lastMoneyNotice: { alone: true, money: 12, observedAt: 0 },
        },
        type: "money_notice",
      });
      return {
        ok: true,
        record: {
          coinageAfter: 12,
          coinageBefore: 0,
          guid: "20",
          moneyTaken: 12,
          slotsLeft: [],
          slotsTaken: [0],
        },
      };
    };
    const result = await lootCorpseOp(toolCtx(t), CORPSE);
    expect(result.outcome.ok).toBe(true);
    expect(result.items).toEqual([
      { count: 1, itemId: 7073, name: "Broken Fang", quality: 0 },
    ]);
    expect(result.copper).toBe(12);
  });

  test("fallback before C7a: open, take after each push, money, release", async () => {
    const t = await createTestRuntime();
    const closed = t.handle.getRewardsState();
    const open = openWindow(t.handle);
    const sent: string[] = [];
    t.handle.lootCorpse = () => {
      throw new Error("not_implemented");
    };
    t.handle.openLoot = (guid) => {
      sent.push(`open ${guid.toString(16)}`);
      t.handle.getRewardsState = () => open;
      t.handle.triggerRewardsEvent({ at: 0, state: open, type: "loot_opened" });
    };
    t.handle.takeLoot = (slot) => {
      sent.push(`take ${slot}`);
      t.handle.triggerRewardsEvent({
        at: 0,
        state: { ...open, lastItemPush: push(7073, 1) },
        type: "item_push",
      });
    };
    t.handle.takeLootMoney = () => {
      sent.push("money");
      t.handle.triggerRewardsEvent({
        at: 0,
        state: {
          ...open,
          lastMoneyNotice: { alone: true, money: 12, observedAt: 0 },
        },
        type: "money_notice",
      });
    };
    t.handle.releaseLoot = () => {
      sent.push("release");
      t.handle.getRewardsState = () => closed;
      t.handle.triggerRewardsEvent({
        at: 0,
        state: closed,
        type: "loot_release_observed",
      });
    };
    const result = await lootCorpseOp(toolCtx(t), CORPSE);
    expect(sent).toEqual(["open 20", "take 0", "money", "release"]);
    expect(result.outcome).toMatchObject({
      ok: true,
      record: { moneyTaken: 12, slotsLeft: [], slotsTaken: [0] },
    });
    expect(result.items).toEqual([
      { count: 1, itemId: 7073, name: "Broken Fang", quality: 0 },
    ]);
    expect(result.copper).toBe(12);
  });

  test("fallback: a failed open stops with its cause and sends nothing else", async () => {
    const t = await createTestRuntime();
    const closed = t.handle.getRewardsState();
    t.handle.lootCorpse = () => {
      throw new Error("not_implemented");
    };
    t.handle.openLoot = () => {
      t.handle.triggerRewardsEvent({
        at: 0,
        state: closed,
        type: "loot_open_failed",
      });
    };
    let released = false;
    t.handle.releaseLoot = () => {
      released = true;
    };
    const result = await lootCorpseOp(toolCtx(t), CORPSE);
    expect(result.outcome).toEqual({ cause: "loot_open_failed", ok: false });
    expect(released).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/ops/loot.test.ts`
Expected: FAIL with `Cannot find module '#harness/ops/loot'`.

- [ ] **Step 3: Implement**

```ts
// packages/harness/src/ops/loot.ts
import type {
  LootOutcome,
  NamedLootItem,
  NamedRewardsState,
  RewardsEvent,
} from "@tuicraft/core";
import { messageOf } from "@tuicraft/core/lib/errors";
import type { LootLine } from "#harness/contract/details";
import type { OpsCtx } from "#harness/contract/services";
import { guidHex } from "#harness/ops/refs";
import { settle } from "#harness/ops/settle";

export type LootOpResult = {
  outcome: LootOutcome;
  items: LootLine[];
  copper: number;
  freeSlots: number | undefined;
};

type Label = { name: string; quality: number | null };

const LOOT_STEP_MS = 3000;

function readLabels(state: NamedRewardsState, into: Map<number, Label>): void {
  if (state.loot.phase !== "open" && state.loot.phase !== "closing") return;
  for (const item of state.loot.items)
    into.set(item.itemId, {
      name: item.name ?? `item ${item.itemId}`,
      quality: item.quality,
    });
}

function addLine(lines: LootLine[], line: LootLine): void {
  const same = lines.find((known) => known.itemId === line.itemId);
  if (same) same.count += line.count;
  else lines.push(line);
}

function step(
  ctx: OpsCtx,
  match: (event: RewardsEvent) => boolean,
  send: () => void,
) {
  return settle<RewardsEvent>({
    match,
    send: () => ctx.rt.mutex.run(send),
    signal: ctx.signal,
    subscribe: (cb) => ctx.handle.onRewardsEvent(cb),
    timeoutMs: LOOT_STEP_MS,
  });
}

function isRelease(event: RewardsEvent): boolean {
  return event.type === "loot_release_observed";
}

function isOpenAnswer(event: RewardsEvent): boolean {
  return (
    event.type === "loot_opened" ||
    event.type === "loot_open_failed" ||
    event.type === "loot_error"
  );
}

function isMoneyAnswer(event: RewardsEvent): boolean {
  return event.type === "money_notice" || event.type === "loot_money_cleared";
}

async function takeItems(
  ctx: OpsCtx,
  items: readonly NamedLootItem[],
): Promise<{ slotsTaken: number[]; slotsLeft: number[] }> {
  const slotsTaken: number[] = [];
  const slotsLeft: number[] = [];
  for (const item of items) {
    const answer = await step(
      ctx,
      (event) =>
        (event.type === "item_push" &&
          event.state.lastItemPush?.itemId === item.itemId) ||
        event.type === "inventory_error" ||
        event.type === "loot_error",
      () => ctx.handle.takeLoot(item.slot),
    );
    if (answer?.type === "item_push") slotsTaken.push(item.slot);
    else slotsLeft.push(item.slot);
  }
  return { slotsLeft, slotsTaken };
}

async function harnessLoot(ctx: OpsCtx, guid: bigint): Promise<LootOutcome> {
  const { handle } = ctx;
  if (handle.getRewardsState().loot.phase !== "closed")
    await step(ctx, isRelease, () => handle.releaseLoot());
  const coinageBefore = handle.getInventoryState().coinage;
  const opened = await step(ctx, isOpenAnswer, () => handle.openLoot(guid));
  if (!opened) return { cause: "loot_open_unanswered", ok: false };
  if (opened.type !== "loot_opened") return { cause: opened.type, ok: false };
  const { loot } = handle.getRewardsState();
  if (loot.phase !== "open") return { cause: "loot_not_open", ok: false };
  const taken = await takeItems(ctx, loot.items);
  if (loot.money > 0)
    await step(ctx, isMoneyAnswer, () => handle.takeLootMoney());
  await step(ctx, isRelease, () => handle.releaseLoot());
  if (loot.items.length === 0 && loot.money === 0)
    return { ok: true, record: undefined };
  return {
    ok: true,
    record: {
      ...taken,
      coinageAfter: handle.getInventoryState().coinage,
      coinageBefore,
      guid: guidHex(guid),
      moneyTaken: loot.money,
    },
  };
}

async function lootWith(ctx: OpsCtx, guid: bigint): Promise<LootOutcome> {
  try {
    return await ctx.handle.lootCorpse(guid, ctx.signal);
  } catch (error) {
    if (messageOf(error) !== "not_implemented") throw error;
    return harnessLoot(ctx, guid);
  }
}

export async function lootCorpseOp(
  ctx: OpsCtx,
  guid: bigint,
): Promise<LootOpResult> {
  const labels = new Map<number, Label>();
  readLabels(ctx.handle.getRewardsState(), labels);
  const items: LootLine[] = [];
  let copper = 0;
  const off = ctx.handle.onRewardsEvent((event) => {
    if (event.type === "loot_opened")
      readLabels(ctx.handle.getRewardsState(), labels);
    const pushed = event.state.lastItemPush;
    if (event.type === "item_push" && pushed) {
      const label = labels.get(pushed.itemId);
      addLine(items, {
        count: pushed.count,
        itemId: pushed.itemId,
        name: label?.name ?? `item ${pushed.itemId}`,
        quality: label?.quality ?? null,
      });
    }
    const notice = event.state.lastMoneyNotice;
    if (event.type === "money_notice" && notice) copper += notice.money;
  });
  try {
    const outcome = await lootWith(ctx, guid);
    return {
      copper,
      freeSlots: ctx.handle.getInventoryState().freeSlots,
      items,
      outcome,
    };
  } finally {
    off();
  }
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `mise test packages/harness/src/ops/loot.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/ops/loot.ts packages/harness/src/ops/loot.test.ts
mise exec -- git commit -F - <<'MSG'
feat: Add the harness loot op

Loot results must name what the server pushed, not what the tool asked
for. The op wraps core lootCorpse and keeps a one-slot-at-a-time
fallback, so loot works before C7a lands.
MSG
```

---

## Task B4: `recoverOp`

One recovery attempt by one way: release first when dead; then the core corpse run (C7b), the nearest spirit healer, or an accepted resurrection offer. The result always names the ways it did not use (design B.8).

**Files**
- Create: `packages/harness/src/ops/recover.ts`
- Test: `packages/harness/src/ops/recover.test.ts`

**Interfaces**
- Consumes: `handle.recoverCorpse(signal: AbortSignal): Promise<RecoveryOutcome>` (C0, body C7b); `getRecoveryState(): RecoveryState`, `onRecoveryEvent`, `releaseSpirit`, `activateSpiritHealer(guid)`, `respondResurrection(accept)` (core); `settle` (A4); `unitViews` (A3); `TALK_RANGE_YD` (A5); `rt.refs.guidOf` (A2); `rt.mutex` (F5a); `messageOf`
- Produces:
  - `export type RecoverHow = "corpse" | "spirit_healer" | "accept";`
  - `export type RecoverOpResult = { outcome: RecoveryOutcome; via: RecoverHow; legs: number; corpseYd: number | undefined; alternatives: string[] };`
  - `export function recoverOp(ctx: OpsCtx, how: RecoverHow): Promise<RecoverOpResult>;`
  - Cause codes it adds: `release_unanswered`, `no_resurrection_offer`, `resurrection_unanswered`, `no_spirit_healer`, `too_far`, `spirit_healer_unanswered`, `not_implemented`

- [ ] **Step 1: Write the failing test**

```ts
// packages/harness/src/ops/recover.test.ts
import { describe, expect, test } from "bun:test";
import { recoverOp } from "#harness/ops/recover";
import {
  setLife,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

const HEALER = 0x40n;

function healerAt(distance: number) {
  return unitRow({
    distance,
    guid: HEALER,
    name: "Spirit Healer",
    relation: "friendly",
    roles: ["spirit_healer"],
    x: distance,
    y: 0,
  });
}

describe("recoverOp", () => {
  test("dead: releases once, then runs the core corpse path", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "dead" });
    let releases = 0;
    t.handle.releaseSpirit = () => {
      releases += 1;
      setLife(t.handle, "ghost");
    };
    t.handle.recoverCorpse = async () => ({
      detail: { legs: 4 },
      ok: true,
      outcome: "reclaimed",
    });
    const result = await recoverOp(toolCtx(t), "corpse");
    expect(releases).toBe(1);
    expect(result).toMatchObject({
      legs: 4,
      outcome: { ok: true, outcome: "reclaimed" },
      via: "corpse",
    });
    expect(result.alternatives).toEqual([
      "no spirit healer in view",
      "no resurrection offer",
    ]);
  });

  test("ghost before C7b: no release, cause not_implemented", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "ghost" });
    let releases = 0;
    t.handle.releaseSpirit = () => {
      releases += 1;
    };
    t.handle.recoverCorpse = () => {
      throw new Error("not_implemented");
    };
    const result = await recoverOp(toolCtx(t), "corpse");
    expect(releases).toBe(0);
    expect(result.outcome).toEqual({ cause: "not_implemented", ok: false });
  });

  test("spirit healer within talk range: activates it and waits for life", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "ghost" });
    setUnits(t.handle, [healerAt(4)]);
    const activated: bigint[] = [];
    t.handle.activateSpiritHealer = (guid) => {
      activated.push(guid);
      setLife(t.handle, "alive");
    };
    const result = await recoverOp(toolCtx(t), "spirit_healer");
    expect(activated).toEqual([HEALER]);
    expect(result.outcome).toMatchObject({ ok: true, outcome: "resurrected" });
    expect(result.alternatives).toEqual([
      "no resurrection offer",
      "walk back to your corpse",
    ]);
  });

  test("spirit healer out of range: too_far and no packet", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "ghost" });
    setUnits(t.handle, [healerAt(20)]);
    let activated = false;
    t.handle.activateSpiritHealer = () => {
      activated = true;
    };
    const result = await recoverOp(toolCtx(t), "spirit_healer");
    expect(result.outcome).toMatchObject({ cause: "too_far", ok: false });
    expect(activated).toBe(false);
  });

  test("accept: takes the offer and names the other ways", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "dead" });
    setUnits(t.handle, [healerAt(34)]);
    const dead = t.handle.getRecoveryState();
    t.handle.getRecoveryState = () => ({
      ...dead,
      resurrection: {
        delayMs: undefined,
        guid: 0x50n,
        name: "Kaelyn",
        readyAt: undefined,
        receivedAt: 0,
        reserved: 0,
        response: "unanswered",
        sickness: 0,
      },
    });
    let answer: boolean | undefined;
    t.handle.respondResurrection = (accept) => {
      answer = accept;
      setLife(t.handle, "alive");
    };
    const result = await recoverOp(toolCtx(t), "accept");
    expect(answer).toBe(true);
    expect(result.outcome).toMatchObject({ ok: true, outcome: "resurrected" });
    expect(result.alternatives[0]).toStartWith("spirit healer u");
    expect(result.alternatives[1]).toBe("walk back to your corpse");
  });

  test("accept without an offer refuses in the outcome", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "dead" });
    const result = await recoverOp(toolCtx(t), "accept");
    expect(result.outcome).toEqual({
      cause: "no_resurrection_offer",
      ok: false,
    });
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/ops/recover.test.ts`
Expected: FAIL with `Cannot find module '#harness/ops/recover'`.

- [ ] **Step 3: Implement**

```ts
// packages/harness/src/ops/recover.ts
import type {
  PlayerLife,
  RecoveryEvent,
  RecoveryOutcome,
  RecoveryState,
} from "@tuicraft/core";
import { messageOf } from "@tuicraft/core/lib/errors";
import type { OpsCtx } from "#harness/contract/services";
import type { UnitView } from "#harness/contract/views";
import { TALK_RANGE_YD } from "#harness/ops/range";
import { settle } from "#harness/ops/settle";
import { unitViews } from "#harness/ops/views";

export type RecoverHow = "corpse" | "spirit_healer" | "accept";
export type RecoverOpResult = {
  outcome: RecoveryOutcome;
  via: RecoverHow;
  legs: number;
  corpseYd: number | undefined;
  alternatives: string[];
};

const RELEASE_MS = 5000;
const ACCEPT_MS = 10_000;
const HEALER_MS = 12_000;

function waitLife(
  ctx: OpsCtx,
  life: PlayerLife,
  timeoutMs: number,
  send: () => void,
) {
  return settle<RecoveryEvent>({
    match: (event) =>
      event.type === "life_observed" && event.state.life === life,
    send: () => ctx.rt.mutex.run(send),
    signal: ctx.signal,
    subscribe: (cb) => ctx.handle.onRecoveryEvent(cb),
    timeoutMs,
  });
}

function nearestHealer(ctx: OpsCtx): UnitView | undefined {
  return unitViews(ctx).find((unit) => unit.roles.includes("spirit_healer"));
}

function healerText(unit: UnitView): string {
  const where = [`${Math.round(unit.distance ?? 0)} yd`, unit.compass]
    .filter(Boolean)
    .join(" ");
  return `spirit healer ${unit.ref} ${where} (resurrection sickness)`;
}

function alternativesFor(
  ctx: OpsCtx,
  how: RecoverHow,
  state: RecoveryState,
): string[] {
  const healer = nearestHealer(ctx);
  const offer =
    state.resurrection?.response === "unanswered"
      ? state.resurrection
      : undefined;
  return [
    ...(how === "spirit_healer"
      ? []
      : [healer ? healerText(healer) : "no spirit healer in view"]),
    ...(how === "accept"
      ? []
      : [
          offer
            ? `a resurrection offer from ${offer.name}`
            : "no resurrection offer",
        ]),
    ...(how === "corpse" ? [] : ["walk back to your corpse"]),
  ];
}

async function acceptOffer(
  ctx: OpsCtx,
  state: RecoveryState,
): Promise<RecoveryOutcome> {
  if (state.resurrection?.response !== "unanswered")
    return { cause: "no_resurrection_offer", ok: false };
  const alive = await waitLife(ctx, "alive", ACCEPT_MS, () =>
    ctx.handle.respondResurrection(true),
  );
  return alive
    ? { ok: true, outcome: "resurrected" }
    : { cause: "resurrection_unanswered", ok: false };
}

async function useHealer(ctx: OpsCtx): Promise<RecoveryOutcome> {
  const healer = nearestHealer(ctx);
  const guid = healer ? ctx.rt.refs.guidOf(healer.ref) : undefined;
  if (!healer || guid === undefined)
    return { cause: "no_spirit_healer", ok: false };
  const distance = healer.distance ?? Number.POSITIVE_INFINITY;
  if (distance > TALK_RANGE_YD)
    return {
      cause: "too_far",
      detail: { distance, ref: healer.ref },
      ok: false,
    };
  const alive = await waitLife(ctx, "alive", HEALER_MS, () =>
    ctx.handle.activateSpiritHealer(guid),
  );
  return alive
    ? { ok: true, outcome: "resurrected" }
    : { cause: "spirit_healer_unanswered", ok: false };
}

async function corpseRun(ctx: OpsCtx): Promise<RecoveryOutcome> {
  try {
    return await ctx.handle.recoverCorpse(ctx.signal);
  } catch (error) {
    if (messageOf(error) !== "not_implemented") throw error;
    return { cause: "not_implemented", ok: false };
  }
}

function legsOf(outcome: RecoveryOutcome): number {
  const legs = outcome.detail?.["legs"];
  return typeof legs === "number" ? legs : 0;
}

export async function recoverOp(
  ctx: OpsCtx,
  how: RecoverHow,
): Promise<RecoverOpResult> {
  const state = ctx.handle.getRecoveryState();
  const alternatives = alternativesFor(ctx, how, state);
  const done = (outcome: RecoveryOutcome): RecoverOpResult => ({
    alternatives,
    corpseYd: ctx.handle.getRecoveryState().reclaim.distance,
    legs: legsOf(outcome),
    outcome,
    via: how,
  });
  if (how === "accept") return done(await acceptOffer(ctx, state));
  if (state.life === "dead") {
    const released = await waitLife(ctx, "ghost", RELEASE_MS, () =>
      ctx.handle.releaseSpirit(),
    );
    if (!released) return done({ cause: "release_unanswered", ok: false });
  }
  return done(
    how === "spirit_healer" ? await useHealer(ctx) : await corpseRun(ctx),
  );
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `mise test packages/harness/src/ops/recover.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/ops/recover.ts packages/harness/src/ops/recover.test.ts
mise exec -- git commit -F - <<'MSG'
feat: Add the harness recovery op

Death recovery must use the cycle's tested corpse path, not a hand-made
corpse walk, and must say which other ways exist. The op releases,
recovers one way, and names the alternatives it did not use.
MSG
```

---

## Task B5: `travel` tool

A tracked run of kind `travel` (design B.3): a unit, a point, `corpse` (as a ghost it hands over to `recoverOp`), `explore [direction]`, or `unstick`. It blocks until the run ends, streams partials, yields `RUNNING` on human input or after 120 s, and stops on a new attacker, `rooted` or death (`watchInterrupts` with all three rules, contract 2.16).

**Files**
- Modify: `packages/harness/src/tools/travel.ts` (A1 stub → full tool)
- Create: `packages/harness/src/tools/travel-report.ts` (the result texts; split off so `travel.ts` stays under the 500-line cap after `biome format`, contract section 3.2 split rule, owner B5)
- Test: `packages/harness/src/tools/travel.test.ts`

**Interfaces**
- Consumes: `travelLeg`, `LegResult` (B1); `explore`, `unstick`, `parseDirection`, `ExploreResult` (B2); `recoverOp` (B4); `resolveUnit`, `unitRefusal` (A3); `poseView`, `selfView`, `unitViews`, `vitalsView` (A3); `distanceTo` (A5); `watchInterrupts`, `InterruptCause` (A7); `awaitRun` (L3); `defineGameTool`, `GameToolSpec`, `result`, `nextCall`, `askHuman`, `UPDATE_EVERY_MS` (A1); `travelParams`, `TravelArgs` (A1); `Refusal` (F2); `messageOf`
- Produces:
  - `export const travelSpec: GameToolSpec<typeof travelParams, "travel">;`
  - `export const travelTool: (rt: HarnessRuntime) => GameTool;`
  - `travel-report.ts` (used only by `travel.ts`): `export type Goal`, `export type Report = ToolResult<TravelAfter>`, `yd(n: number): string`, `secs(ms: number): string`, `goalView(goal: Goal): TravelGoalView`, `goalName(goal: Goal): string`, `youLine(ctx: ViewCtx): string`, `newInViewText(units: readonly UnitView[]): string`, `legReport(init: { ctx: OpsCtx; to: string; goal: Goal; leg: LegResult; after: TravelAfter }): Report`, `exploreReport(found: ExploreResult, after: TravelAfter): Report`, `stopReport(signal: AbortSignal, after: TravelAfter): Report`, `interruptReport(ctx: ViewCtx, cause: InterruptCause, after: TravelAfter): Report`
  - Reason codes it adds: `bad_direction`, `alive`, `obstructed`, `unstick_failed`

- [ ] **Step 1: Write the failing test**

```ts
// packages/harness/src/tools/travel.test.ts
import { describe, expect, jest, test } from "bun:test";
import type { TravelAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import { travelSpec } from "#harness/tools/travel";
import {
  attackBy,
  contentOf,
  driveGoto,
  limitProblem,
  MAP_ID,
  setLife,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

const MARNIEL = unitRow({
  distance: 36,
  guid: 0x10n,
  name: "Marniel Amberlight",
  relation: "friendly",
  roles: ["vendor"],
  x: 36,
  y: 0,
});
const STALKER = unitRow({
  distance: 22,
  guid: 0x20n,
  level: 7,
  name: "Springpaw Stalker",
  x: 40,
  y: 0,
});

function fit(res: ToolResult<TravelAfter>): string {
  const text = contentOf(res);
  return limitProblem(text) ?? text;
}

async function world() {
  const t = await createTestRuntime();
  setSelf(t.handle, { x: 0, y: 0 });
  setUnits(t.handle, [MARNIEL]);
  return t;
}

describe("travel", () => {
  test("arrives at a unit", async () => {
    const t = await world();
    driveGoto(t.handle, [{ arrive: { x: 34, y: 0 } }]);
    const res = await travelSpec.run(
      { to: "Marniel Amberlight" },
      toolCtx<TravelAfter>(t),
    );
    expect(res.status).toBe("DONE");
    expect(fit(res)).toMatch(/^DONE arrived at Marniel Amberlight \(u\d+\): /);
    expect(res.runId).toBe(t.rt.runs.list()[0]?.id);
  });

  test("a snapped start fails with the unstick step and remembers the goal", async () => {
    const t = await world();
    driveGoto(t.handle, [
      { refuse: "stop: start snapped off the requested ground position" },
    ]);
    const res = await travelSpec.run(
      { to: "Marniel Amberlight" },
      toolCtx<TravelAfter>(t),
    );
    expect(res).toMatchObject({
      next: 'travel(to: "unstick")',
      reason: "start_off_mesh",
      status: "FAILED",
    });
    expect(t.rt.travel.lastRefusedGoal).toBe("Marniel Amberlight");
    expect(limitProblem(contentOf(res))).toBeUndefined();
  });

  test("no ground: fails with an ask-the-human step", async () => {
    const t = await world();
    driveGoto(t.handle, [
      { refuse: "unreachable: pathfind_find_height failed (UNKNOWN_HEIGHT)" },
    ]);
    const res = await travelSpec.run(
      { to: "Marniel Amberlight" },
      toolCtx<TravelAfter>(t),
    );
    expect(res).toMatchObject({ reason: "no_ground", status: "FAILED" });
    expect(res.next).toStartWith(
      'ask the human: "I cannot reach Marniel Amberlight',
    );
    expect(limitProblem(contentOf(res))).toBeUndefined();
  });

  test("coordinates on two floors refuse with the floors and a ready call", async () => {
    const t = await world();
    driveGoto(t.handle, [
      {
        floors: [72.6, 80.1],
        refuse: "pick_destination: ambiguous ground column at destination",
      },
    ]);
    const res = await travelSpec.run(
      { to: "8764, -6683" },
      toolCtx<TravelAfter>(t),
    );
    expect(res).toMatchObject({
      options: [72.6, 80.1],
      reason: "ambiguous_floor",
      status: "REFUSED",
    });
    expect(res.next).toBe('travel(to: "8764, -6683, 72.6")');
    expect(limitProblem(contentOf(res))).toBeUndefined();
  });

  test("unstick names the refused goal as the next call", async () => {
    const t = await world();
    t.rt.travel.lastRefusedGoal = "u4";
    t.handle.walkToward = jest.fn(async () => ({
      pose: {
        mapId: MAP_ID,
        orientation: 0,
        source: "server" as const,
        updatedAt: 0,
        x: 0,
        y: 0,
        z: 0,
      },
      status: "completed" as const,
      traveled: 4.8,
    }));
    const res = await travelSpec.run(
      { to: "unstick" },
      toolCtx<TravelAfter>(t),
    );
    expect(res).toMatchObject({ next: 'travel(to: "u4")', status: "DONE" });
    expect(fit(res)).toStartWith("DONE moved 4.8 yd");
  });

  test("explore north reports what came into view", async () => {
    const t = await world();
    driveGoto(t.handle, [
      {
        arrive: { x: 20, y: 0 },
        onArrive: () => setUnits(t.handle, [MARNIEL, STALKER]),
      },
    ]);
    const res = await travelSpec.run(
      { to: "explore north" },
      toolCtx<TravelAfter>(t),
    );
    expect(res.status).toBe("DONE");
    expect(fit(res)).toMatch(
      /^DONE explored 20 yd north\. New in view: 1 hostile \(u\d+ Springpaw Stalker L7 22 yd/,
    );
  });

  test("an unknown direction refuses before any run", async () => {
    const t = await world();
    await expect(
      travelSpec.run({ to: "explore up" }, toolCtx<TravelAfter>(t)),
    ).rejects.toMatchObject({ reason: "bad_direction" });
    expect(t.rt.runs.list()).toHaveLength(0);
  });

  test("corpse while alive refuses", async () => {
    const t = await world();
    await expect(
      travelSpec.run({ to: "corpse" }, toolCtx<TravelAfter>(t)),
    ).rejects.toMatchObject({ reason: "alive" });
  });

  test("corpse as a ghost hands over to the recovery op", async () => {
    const t = await world();
    setLife(t.handle, "ghost");
    t.handle.recoverCorpse = async () => {
      setLife(t.handle, "alive");
      return { detail: { legs: 3 }, ok: true, outcome: "reclaimed" };
    };
    const res = await travelSpec.run({ to: "corpse" }, toolCtx<TravelAfter>(t));
    expect(res.status).toBe("DONE");
    expect(fit(res)).toStartWith("DONE alive again at your corpse");
  });

  test("human text yields RUNNING with vitals and pose; the run goes on", async () => {
    const t = await world();
    driveGoto(t.handle, [{ hold: true }]);
    const pending = travelSpec.run(
      { to: "Marniel Amberlight" },
      toolCtx<TravelAfter>(t),
    );
    t.rt.yields.trigger();
    const res = await pending;
    const id = res.runId ?? "";
    expect(res.status).toBe("RUNNING");
    expect(res.detail).toContain("You: HP 200/200, mana 100%, at 0, 0.");
    expect(res.body).toEqual([
      "The human wrote a message. Read it before you act.",
    ]);
    expect(res.next).toBe(
      `end your turn; a [game] message comes when ${id} ends. Or stop(run: "${id}").`,
    );
    expect(t.rt.runs.active()?.id).toBe(id);
    expect(limitProblem(contentOf(res))).toBeUndefined();
    t.rt.runs.cancel(id, "tool");
  });

  test("a new attacker interrupts the run", async () => {
    const t = await world();
    driveGoto(t.handle, [{ hold: true }]);
    const pending = travelSpec.run(
      { to: "Marniel Amberlight" },
      toolCtx<TravelAfter>(t),
    );
    await Bun.sleep(0);
    attackBy(t.handle, 0x20n);
    const res = await pending;
    expect(res).toMatchObject({ reason: "interrupted", status: "FAILED" });
    expect(res.next).toMatch(/^engage\(target: "u\d+"\)$/);
    expect(limitProblem(contentOf(res))).toBeUndefined();
  });

  test("a human stop ends the run as cancelled", async () => {
    const t = await world();
    driveGoto(t.handle, [{ hold: true }]);
    const pending = travelSpec.run(
      { to: "Marniel Amberlight" },
      toolCtx<TravelAfter>(t),
    );
    await Bun.sleep(0);
    t.rt.runs.cancel(t.rt.runs.active()?.id ?? "", "human");
    const res = await pending;
    expect(res).toMatchObject({
      detail: "the human stopped you. Start nothing new.",
      next: "end your turn and wait for the human.",
      reason: "cancelled",
      status: "FAILED",
    });
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/tools/travel.test.ts`
Expected: FAIL with `SyntaxError: Export named 'travelSpec' not found in module 'packages/harness/src/tools/travel.ts'` (the A1 stub exports only `travelTool`).

- [ ] **Step 3: Implement**

```ts
// packages/harness/src/tools/travel-report.ts
import { messageOf } from "@tuicraft/core/lib/errors";
import type { TravelAfter, TravelGoalView } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { OpsCtx, ViewCtx } from "#harness/contract/services";
import type { Compass, UnitView } from "#harness/contract/views";
import type { InterruptCause } from "#harness/ops/danger";
import type { ExploreResult } from "#harness/ops/explore";
import type { LegResult } from "#harness/ops/travel-leg";
import { poseView, vitalsView } from "#harness/ops/views";
import { askHuman, nextCall, result } from "#harness/tools/define";

export type Goal =
  | { kind: "unit"; guid: bigint; unit: UnitView }
  | { kind: "point"; x: number; y: number; z: number | undefined }
  | { kind: "corpse" }
  | { kind: "explore"; direction: Compass | undefined }
  | { kind: "unstick" };

export type Report = ToolResult<TravelAfter>;

const WORD: Record<Compass, string> = {
  E: "east",
  N: "north",
  NE: "northeast",
  NW: "northwest",
  S: "south",
  SE: "southeast",
  SW: "southwest",
  W: "west",
};
const GROUPS: readonly (readonly [string, (unit: UnitView) => boolean])[] = [
  ["hostile", (unit) => unit.attackable && unit.relation === "hostile"],
  ["neutral", (unit) => unit.attackable && unit.relation === "neutral"],
  ["questgiver", (unit) => unit.roles.includes("questgiver")],
  ["vendor", (unit) => unit.roles.some((role) => role.startsWith("vendor"))],
  ["player", (unit) => unit.kind === "player"],
];

export function yd(n: number): string {
  return n < 10 ? n.toFixed(1) : Math.round(n).toString();
}

export function secs(ms: number): string {
  return (ms / 1000).toFixed(1);
}

export function goalView(goal: Goal): TravelGoalView {
  if (goal.kind === "unit")
    return { kind: "unit", name: goal.unit.name, ref: goal.unit.ref };
  if (goal.kind === "point")
    return { kind: "point", x: goal.x, y: goal.y, z: goal.z };
  if (goal.kind === "explore")
    return { direction: goal.direction, kind: "explore" };
  if (goal.kind === "unstick")
    return { kind: "unstick", refusedGoal: undefined };
  return { kind: "corpse" };
}

export function goalName(goal: Goal): string {
  if (goal.kind === "unit") return `${goal.unit.name} (${goal.unit.ref})`;
  if (goal.kind === "point") return `${goal.x}, ${goal.y}`;
  return goal.kind;
}

export function youLine(ctx: ViewCtx): string {
  const vitals = vitalsView(ctx);
  const pose = poseView(ctx);
  const mana =
    vitals.powerKind === "mana" && vitals.maxPower > 0
      ? `, mana ${Math.round((vitals.power / vitals.maxPower) * 100)}%`
      : "";
  const at = pose ? `, at ${Math.round(pose.x)}, ${Math.round(pose.y)}` : "";
  return `You: HP ${vitals.hp}/${vitals.maxHp}${mana}${at}.`;
}

function unitBrief(unit: UnitView): string {
  return `${unit.ref} ${unit.name} L${unit.level} ${yd(unit.distance ?? 0)} yd ${unit.compass ?? ""}`.trim();
}

export function newInViewText(units: readonly UnitView[]): string {
  const sorted = [...units].sort(
    (a, b) => (a.distance ?? 0) - (b.distance ?? 0),
  );
  const parts = GROUPS.flatMap(([label, test]) => {
    const hits = sorted.filter(test);
    const [first] = hits;
    if (!first) return [];
    const one = `1 ${label} (${unitBrief(first)})`;
    return [
      hits.length === 1
        ? one
        : `${hits.length} ${label} (nearest ${unitBrief(first)})`,
    ];
  });
  return parts.length === 0
    ? "Nothing new in view."
    : `New in view: ${parts.join(", ")}.`;
}

function refusedReport(init: {
  goal: Goal;
  leg: LegResult;
  after: TravelAfter;
}): Report {
  const { goal, leg, after } = init;
  const name = goalName(goal);
  const walked = `Walked ${yd(leg.traveledYd)} yd.`;
  const ask = askHuman(
    `I cannot reach ${goal.kind === "unit" ? goal.unit.name : name} from here. Is there another way?`,
  );
  if (leg.reason === "ambiguous_floor" && goal.kind === "point") {
    const floors = leg.floors ?? [];
    return result("REFUSED", {
      after,
      detail: `the ground at ${name} has ${floors.length} floors: ${floors.map((floor) => floor.toFixed(1)).join(", ")}.`,
      next: nextCall("travel", {
        to: `${goal.x}, ${goal.y}, ${floors[0]?.toFixed(1) ?? ""}`,
      }),
      options: floors,
      reason: "ambiguous_floor",
    });
  }
  if (leg.reason === "start_off_mesh")
    return result("FAILED", {
      after,
      detail: `your own position is not on ground the planner knows (start snapped off). ${walked}`,
      next: nextCall("travel", { to: "unstick" }),
      reason: "start_off_mesh",
    });
  if (leg.reason === "no_ground")
    return result("FAILED", {
      after,
      detail: `the path finder found no ground on the way (UNKNOWN_HEIGHT). ${walked} Tried: planner once.`,
      next: ask,
      reason: "no_ground",
    });
  return result("FAILED", {
    after,
    body: leg.nextStep ? [leg.nextStep] : [],
    detail: `${leg.detail}. ${walked}`,
    next: ask,
    reason: leg.reason ?? "failed",
  });
}

export function legReport(init: {
  ctx: OpsCtx;
  to: string;
  goal: Goal;
  leg: LegResult;
  after: TravelAfter;
}): Report {
  const { ctx, to, goal, leg, after } = init;
  if (leg.status === "arrived") {
    const away =
      after.remainingYd === undefined
        ? ""
        : `${yd(after.remainingYd)} yd away `;
    return result("DONE", {
      after,
      detail: `arrived at ${goalName(goal)}: ${away}after ${yd(leg.traveledYd)} yd in ${secs(after.elapsedMs)} s.`,
    });
  }
  if (leg.status === "cancelled" || leg.status === "interrupted")
    return result("FAILED", {
      after,
      detail: `${leg.detail}. Walked ${yd(leg.traveledYd)} yd.`,
      next: nextCall("look"),
      reason: "interrupted",
    });
  ctx.rt.travel.lastRefusedGoal = to;
  return refusedReport({ after, goal, leg });
}

export function exploreReport(
  found: ExploreResult,
  after: TravelAfter,
): Report {
  const where = `${yd(found.walkedYd)} yd ${WORD[found.direction]}`;
  const seen = newInViewText(found.newInView);
  if (found.stoppedBy === "obstructed")
    return result("PARTLY", {
      after,
      detail: `explored ${where}; ${found.obstructed} legs were blocked. ${seen}`,
      next: nextCall("travel", { to: "explore" }),
      reason: "obstructed",
    });
  return result("DONE", { after, detail: `explored ${where}. ${seen}` });
}

export function stopReport(signal: AbortSignal, after: TravelAfter): Report {
  const code = messageOf(signal.reason, "cancelled");
  if (code === "human_stop" || code === "esc")
    return result("FAILED", {
      after,
      detail: "the human stopped you. Start nothing new.",
      next: "end your turn and wait for the human.",
      reason: "cancelled",
    });
  if (code === "connection_lost")
    return result("FAILED", {
      after,
      detail: "the game connection was lost.",
      next: "ask the human to run /connect.",
      reason: "interrupted",
    });
  return result("FAILED", {
    after,
    detail: `the run was stopped (${code}).`,
    next: nextCall("look"),
    reason: "cancelled",
  });
}

export function interruptReport(
  ctx: ViewCtx,
  cause: InterruptCause,
  after: TravelAfter,
): Report {
  if (cause.code === "died")
    return result("FAILED", {
      after,
      detail: `you died on the way. ${cause.detail}`,
      next: nextCall("recover"),
      reason: "died",
    });
  const ref =
    cause.attacker === undefined
      ? undefined
      : ctx.rt.refs.refOf(cause.attacker);
  return result("FAILED", {
    after,
    detail: `${cause.detail} Walked ${yd(after.traveledYd)} yd.`,
    next: ref ? nextCall("engage", { target: ref }) : nextCall("look"),
    reason: "interrupted",
  });
}
```

```ts
// packages/harness/src/tools/travel.ts
import { messageOf } from "@tuicraft/core/lib/errors";
import type { TravelAfter } from "#harness/contract/details";
import type { ToolStatus } from "#harness/contract/result";
import type { RunControl, RunEnd, RunStatus } from "#harness/contract/runs";
import type { OpsCtx, ToolCtx } from "#harness/contract/services";
import { watchInterrupts } from "#harness/ops/danger";
import { explore, parseDirection, unstick } from "#harness/ops/explore";
import { distanceTo } from "#harness/ops/range";
import { recoverOp } from "#harness/ops/recover";
import { Refusal } from "#harness/ops/refusal";
import { resolveUnit, unitRefusal } from "#harness/ops/resolve";
import { travelLeg } from "#harness/ops/travel-leg";
import { poseView, selfView, unitViews } from "#harness/ops/views";
import { awaitRun } from "#harness/runs/wait";
import {
  askHuman,
  defineGameTool,
  type GameToolSpec,
  nextCall,
  result,
  UPDATE_EVERY_MS,
} from "#harness/tools/define";
import { type TravelArgs, travelParams } from "#harness/tools/params";
import {
  exploreReport,
  type Goal,
  goalName,
  goalView,
  interruptReport,
  legReport,
  type Report,
  secs,
  stopReport,
  yd,
  youLine,
} from "#harness/tools/travel-report";

type After = (patch: Partial<TravelAfter>) => TravelAfter;
type Work = { ops: OpsCtx; args: TravelArgs; goal: Goal; after: After };

const COORDS =
  /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*(?:,\s*(-?\d+(?:\.\d+)?)\s*)?$/;
const RUN_STATUS: Record<ToolStatus, Exclude<RunStatus, "running">> = {
  DONE: "succeeded",
  FAILED: "failed",
  PARTLY: "partly",
  REFUSED: "failed",
  RUNNING: "succeeded",
  UNCONFIRMED: "failed",
};
const HUMAN_WROTE = "The human wrote a message. Read it before you act.";

function parseExplore(text: string, lower: string): Goal {
  const direction = parseDirection(lower);
  if (lower !== "explore" && !direction)
    throw new Refusal({
      detail: `"${text}" is not a direction.`,
      next: nextCall("travel", { to: "explore north" }),
      reason: "bad_direction",
    });
  return { direction, kind: "explore" };
}

function parseGoal(ctx: ToolCtx<TravelAfter>, to: string): Goal {
  const text = to.trim();
  const lower = text.toLowerCase();
  if (lower === "corpse") return { kind: "corpse" };
  if (lower === "unstick") return { kind: "unstick" };
  if (lower === "explore" || lower.startsWith("explore "))
    return parseExplore(text, lower);
  const coords = COORDS.exec(text);
  if (coords)
    return {
      kind: "point",
      x: Number(coords[1]),
      y: Number(coords[2]),
      z: coords[3] === undefined ? undefined : Number(coords[3]),
    };
  const resolved = resolveUnit(ctx, { text });
  if (resolved.kind !== "unit")
    throw unitRefusal({ param: "to", resolved, tool: "travel" });
  return { guid: resolved.guid, kind: "unit", unit: resolved.unit };
}

function remainingOf(ctx: OpsCtx, goal: Goal): number | undefined {
  if (goal.kind === "unit") return distanceTo(ctx, goal.guid);
  const pose = poseView(ctx);
  return goal.kind === "point" && pose
    ? Math.hypot(pose.x - goal.x, pose.y - goal.y)
    : undefined;
}

async function legWork(
  work: Work & { goal: Extract<Goal, { kind: "unit" | "point" }> },
): Promise<Report> {
  const { ops, args, goal, after } = work;
  const leg = await travelLeg(ops, {
    goal:
      goal.kind === "unit"
        ? { guid: goal.guid, kind: "unit", name: goal.unit.name }
        : {
            kind: "point",
            x: goal.x,
            y: goal.y,
            ...(goal.z === undefined ? {} : { z: goal.z }),
          },
    within: args.within ?? (goal.kind === "unit" ? 3 : 1),
  });
  const view = after({
    floorRetried: leg.floorRetried,
    floors: leg.floors,
    legs: [
      {
        index: 0,
        reason: leg.reason,
        status: leg.status,
        traveledYd: leg.traveledYd,
      },
    ],
    remainingYd: remainingOf(ops, goal),
    traveledYd: leg.traveledYd,
  });
  return legReport({ after: view, ctx: ops, goal, leg, to: args.to });
}

async function unstickWork(work: Work): Promise<Report> {
  try {
    const moved = await unstick(work.ops);
    const toward =
      moved.toward === "last_good_pose"
        ? "back toward the last place that planned"
        : "away from the nearest object";
    return result("DONE", {
      after: work.after({
        goal: { kind: "unstick", refusedGoal: moved.refusedGoal },
        traveledYd: moved.movedYd,
      }),
      detail: `moved ${yd(moved.movedYd)} yd ${toward}.`,
      next: moved.refusedGoal
        ? nextCall("travel", { to: moved.refusedGoal })
        : nextCall("look"),
    });
  } catch (error) {
    return result("FAILED", {
      after: work.after({}),
      detail: messageOf(error),
      next: askHuman("I am stuck. Can you move me?"),
      reason: "unstick_failed",
    });
  }
}

async function corpseWork(work: Work): Promise<Report> {
  const recovered = await recoverOp(work.ops, "corpse");
  const view = work.after({ legs: [], remainingYd: recovered.corpseYd });
  if (recovered.outcome.ok)
    return result("DONE", {
      after: view,
      detail: `alive again at your corpse after ${secs(view.elapsedMs)} s. ${youLine(work.ops)}`,
    });
  const healer = recovered.alternatives.some((text) =>
    text.startsWith("spirit healer"),
  );
  return result("FAILED", {
    after: view,
    body: [`Other ways: ${recovered.alternatives.join(". ")}.`],
    detail: `could not get back to your corpse (${recovered.outcome.cause}).`,
    next: healer
      ? nextCall("recover", { how: "spirit_healer" })
      : askHuman("I cannot reach my corpse. What should I do?"),
    reason: recovered.outcome.cause,
  });
}

async function doWork(work: Work): Promise<Report> {
  const { goal } = work;
  if (goal.kind === "unit" || goal.kind === "point")
    return legWork({ ...work, goal });
  if (goal.kind === "unstick") return unstickWork(work);
  if (goal.kind === "corpse") return corpseWork(work);
  const found = await explore(work.ops, { direction: goal.direction });
  return exploreReport(
    found,
    work.after({
      legs: found.legs,
      newInView: found.newInView,
      traveledYd: found.walkedYd,
    }),
  );
}

function runStatus(
  value: Report,
  stop: string | undefined,
): Exclude<RunStatus, "running"> {
  if (stop === "connection_lost") return "interrupted";
  if (stop !== undefined) return "cancelled";
  if (value.reason === "interrupted" || value.reason === "died")
    return "interrupted";
  return RUN_STATUS[value.status];
}

function runEnd(value: Report, stop?: string): RunEnd<Report> {
  return {
    reason: stop ?? value.reason,
    status: runStatus(value, stop),
    summary: `${value.status} ${value.detail}`,
    value,
  };
}

function afterOf(ops: OpsCtx, goal: Goal): After {
  const startedAt = ops.rt.clock.now();
  const start = poseView(ops);
  const seen = new Set(unitViews(ops).map((unit) => unit.guid));
  const totalYd = remainingOf(ops, goal);
  return (patch) => {
    const pose = poseView(ops);
    return {
      elapsedMs: ops.rt.clock.now() - startedAt,
      floorRetried: false,
      floors: undefined,
      goal: goalView(goal),
      legs: [],
      newInView: unitViews(ops).filter((unit) => !seen.has(unit.guid)),
      pose,
      remainingYd: remainingOf(ops, goal),
      totalYd,
      traveledYd:
        start && pose ? Math.hypot(pose.x - start.x, pose.y - start.y) : 0,
      ...patch,
    };
  };
}

async function launch(init: {
  ctx: ToolCtx<TravelAfter>;
  args: TravelArgs;
  goal: Goal;
  control: RunControl;
  partial: (after: TravelAfter) => void;
}): Promise<RunEnd<Report>> {
  const { ctx, args, goal, control, partial } = init;
  const rules = { death: true, newAttacker: true, rooted: true };
  const watch = watchInterrupts(
    { ...ctx, progress: control.progress, signal: control.signal },
    rules,
  );
  const ops: OpsCtx = {
    ...ctx,
    progress: control.progress,
    signal: AbortSignal.any([control.signal, watch.signal]),
  };
  const after = afterOf(ops, goal);
  const tick = setInterval(() => {
    const now = after({});
    control.progress(`${yd(now.traveledYd)} yd walked`);
    partial(now);
  }, UPDATE_EVERY_MS);
  try {
    const report = await doWork({ after, args, goal, ops });
    if (control.signal.aborted)
      return runEnd(
        stopReport(control.signal, report.after),
        messageOf(control.signal.reason),
      );
    const cause = watch.cause();
    return runEnd(cause ? interruptReport(ctx, cause, report.after) : report);
  } finally {
    clearInterval(tick);
    watch.dispose();
  }
}

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

async function runTravel(
  args: TravelArgs,
  ctx: ToolCtx<TravelAfter>,
): Promise<Report> {
  const goal = parseGoal(ctx, args.to);
  if (goal.kind === "corpse" && selfView(ctx).life === "alive")
    throw new Refusal({
      detail: "you are alive; there is no corpse to reach.",
      next: nextCall("look"),
      reason: "alive",
    });
  let runId = "";
  let latest = emptyTravel();
  const partial = (after: TravelAfter) => {
    latest = after;
    const detail = `travel to ${goalName(goal)}, ${yd(after.traveledYd)} yd walked.`;
    ctx.update(result("RUNNING", { after, detail, runId }));
  };
  const run = ctx.rt.runs.start<Report>({
    args,
    kind: "travel",
    launch: (control) => launch({ args, control, ctx, goal, partial }),
    toolCallId: ctx.toolCallId,
  });
  runId = run.id;
  const waited = await awaitRun({ rt: ctx.rt, run });
  if (waited.kind === "ended") return { ...waited.end.value, runId };
  const togo =
    latest.remainingYd === undefined
      ? ""
      : `, ${yd(latest.remainingYd)} yd to go`;
  return result("RUNNING", {
    after: latest,
    body: waited.why === "human" ? [HUMAN_WROTE] : [],
    detail: `travel to ${goalName(goal)}, ${yd(latest.traveledYd)} yd walked${togo}. ${youLine(ctx)}`,
    next: `end your turn; a [game] message comes when ${runId} ends. Or ${nextCall("stop", { run: runId })}.`,
    runId,
  });
}

export const travelSpec: GameToolSpec<typeof travelParams, "travel"> = {
  fallback: emptyTravel,
  kind: "run",
  name: "travel",
  parameters: travelParams,
  run: runTravel,
};

export const travelTool = defineGameTool(travelSpec);
```


- [ ] **Step 4: Run the test and see it pass**

Run: `mise test packages/harness/src/tools/travel.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/tools/travel.ts packages/harness/src/tools/travel-report.ts packages/harness/src/tools/travel.test.ts
mise exec -- git commit -F - <<'MSG'
feat: Add the harness travel tool

One call now walks to a unit, a point or a corpse, explores a compass
direction or clears a snapped start. It blocks until the run ends, and
it yields to the human or after 120 s with vitals and pose.
MSG
```

---

## Task B6: `loot` tool

An action tool (design B.5): pick the corpse (a ref, a name, or the nearest lootable corpse within 30 yd), walk into range through `travelLeg`, loot it with `lootCorpseOp`, and report item names, counts, money, the window state and free bag slots.

**Files**
- Modify: `packages/harness/src/tools/loot.ts` (A1 stub → full tool)
- Test: `packages/harness/src/tools/loot.test.ts`

**Interfaces**
- Consumes: `lootCorpseOp`, `LootOpResult` (B3); `travelLeg` (B1); `resolveUnit`, `unitRefusal`, `unitViews` (A3); `LOOT_APPROACH_YD`, `LOOT_WALK_MAX_YD` (A5); `defineGameTool`, `GameToolSpec`, `nextCall`, `result` (A1); `lootParams`, `LootArgs` (A1); `Refusal` (F2)
- Produces:
  - `export const lootSpec: GameToolSpec<typeof lootParams, "loot">;`
  - `export const lootTool: (rt: HarnessRuntime) => GameTool;`
  - Reason codes: `not_lootable`, `too_far`, `bags_full`, and the loot stop causes of B3 (`loot_open_failed`, `loot_open_unanswered`, …)

- [ ] **Step 1: Write the failing test**

```ts
// packages/harness/src/tools/loot.test.ts
import { describe, expect, test } from "bun:test";
import type { LootAfter } from "#harness/contract/details";
import { lootSpec } from "#harness/tools/loot";
import {
  contentOf,
  driveGoto,
  limitProblem,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";

const CORPSE = 0x20n;

function corpseRow(distance: number, lootable: boolean) {
  return unitRow({
    distance,
    guid: CORPSE,
    hp: 0,
    level: 7,
    lootable,
    name: "Springpaw Stalker",
    x: distance,
    y: 0,
  });
}

function lootsFang(handle: MockHandle, slotsLeft: number[]): void {
  const base = handle.getRewardsState();
  const open = {
    ...base,
    loot: {
      guid: CORPSE,
      invalidatedReason: undefined,
      items: [
        {
          count: 1,
          displayId: 0,
          itemId: 7073,
          name: "Broken Fang",
          quality: 0,
          randomPropertyId: 0,
          randomSuffix: 0,
          slot: 0,
          slotType: 0,
        },
      ],
      lootType: 1,
      money: 12,
      openedAt: 0,
      phase: "open" as const,
    },
  };
  const pushed = {
    bagSlot: 255,
    count: 1,
    created: 0,
    guid: 0n,
    itemId: 7073,
    observedAt: 0,
    randomPropertyId: 0,
    randomSuffix: 0,
    received: 1,
    showInChat: 1,
    slot: 0,
    totalCount: 1,
  };
  const inventory = handle.getInventoryState();
  handle.getInventoryState = () => ({ ...inventory, freeSlots: 14 });
  handle.lootCorpse = async () => {
    handle.getRewardsState = () => open;
    handle.triggerRewardsEvent({ at: 0, state: open, type: "loot_opened" });
    handle.triggerRewardsEvent({
      at: 0,
      state: { ...open, lastItemPush: pushed },
      type: "item_push",
    });
    handle.triggerRewardsEvent({
      at: 0,
      state: {
        ...open,
        lastMoneyNotice: { alone: true, money: 12, observedAt: 0 },
      },
      type: "money_notice",
    });
    handle.getRewardsState = () => base;
    return {
      ok: true,
      record: {
        coinageAfter: 12,
        coinageBefore: 0,
        guid: "20",
        moneyTaken: 12,
        slotsLeft,
        slotsTaken: [0],
      },
    };
  };
}

describe("loot", () => {
  test("loots the nearest lootable corpse and names what the server pushed", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    setUnits(t.handle, [corpseRow(2, true)]);
    lootsFang(t.handle, []);
    const res = await lootSpec.run({}, toolCtx<LootAfter>(t));
    const text = contentOf(res);
    expect(limitProblem(text)).toBeUndefined();
    expect(text).toMatch(
      /^DONE looted Springpaw Stalker \(u\d+\): Broken Fang x1, 12 copper\. Window closed\. Bags: 14 free\.$/,
    );
    expect(res.after.items).toEqual([
      { count: 1, itemId: 7073, name: "Broken Fang", quality: 0 },
    ]);
  });

  test("walks into range first when the corpse is farther than 3 yd", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    setUnits(t.handle, [corpseRow(12, true)]);
    const goTo = driveGoto(t.handle, [{ arrive: { x: 10, y: 0 } }]);
    lootsFang(t.handle, []);
    const res = await lootSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<LootAfter>(t),
    );
    expect(goTo).toHaveBeenCalledWith({ guid: CORPSE, kind: "guid" });
    expect(res.status).toBe("DONE");
  });

  test("a named corpse without the lootable flag refuses", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    setUnits(t.handle, [corpseRow(2, false)]);
    await expect(
      lootSpec.run({ target: "Springpaw Stalker" }, toolCtx<LootAfter>(t)),
    ).rejects.toMatchObject({
      next: 'look(find: "lootable")',
      reason: "not_lootable",
    });
  });

  test("no lootable corpse within 30 yd refuses", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    setUnits(t.handle, [corpseRow(42, true)]);
    await expect(lootSpec.run({}, toolCtx<LootAfter>(t))).rejects.toMatchObject(
      {
        detail: "no lootable corpse within 30 yd.",
        reason: "not_lootable",
      },
    );
  });

  test("a named corpse over 30 yd away refuses with a travel step", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    setUnits(t.handle, [corpseRow(42, true)]);
    const refusal = lootSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<LootAfter>(t),
    );
    await expect(refusal).rejects.toMatchObject({ reason: "too_far" });
    await expect(refusal).rejects.toHaveProperty(
      "next",
      expect.stringMatching(/^travel\(to: "u\d+"\)$/),
    );
  });

  test("items left behind give PARTLY with a bags step", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    setUnits(t.handle, [corpseRow(2, true)]);
    lootsFang(t.handle, [1]);
    const res = await lootSpec.run({}, toolCtx<LootAfter>(t));
    expect(res).toMatchObject({
      next: 'journal(about: "bags")',
      reason: "bags_full",
      status: "PARTLY",
    });
    expect(limitProblem(contentOf(res))).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/tools/loot.test.ts`
Expected: FAIL with `SyntaxError: Export named 'lootSpec' not found in module` (the A1 stub exports only `lootTool`).

- [ ] **Step 3: Implement**

```ts
// packages/harness/src/tools/loot.ts
import type { LootAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import type { UnitView } from "#harness/contract/views";
import { type LootOpResult, lootCorpseOp } from "#harness/ops/loot";
import { LOOT_APPROACH_YD, LOOT_WALK_MAX_YD } from "#harness/ops/range";
import { Refusal } from "#harness/ops/refusal";
import { resolveUnit, unitRefusal } from "#harness/ops/resolve";
import { travelLeg } from "#harness/ops/travel-leg";
import { unitViews } from "#harness/ops/views";
import {
  defineGameTool,
  type GameToolSpec,
  nextCall,
  result,
} from "#harness/tools/define";
import { type LootArgs, lootParams } from "#harness/tools/params";

type Corpse = { unit: UnitView; guid: bigint };

const LOOK_LOOTABLE = nextCall("look", { find: "lootable" });

function emptyLoot(): LootAfter {
  return {
    copper: 0,
    corpse: undefined,
    freeSlots: undefined,
    items: [],
    windowClosed: true,
  };
}

function label(unit: UnitView): string {
  return `${unit.name} (${unit.ref})`;
}

function nearestCorpse(ctx: ToolCtx<LootAfter>): Corpse {
  const unit = unitViews(ctx).find(
    (view) =>
      view.lootable &&
      !view.alive &&
      (view.distance ?? Number.POSITIVE_INFINITY) <= LOOT_WALK_MAX_YD,
  );
  const guid = unit ? ctx.rt.refs.guidOf(unit.ref) : undefined;
  if (!unit || guid === undefined)
    throw new Refusal({
      detail: `no lootable corpse within ${LOOT_WALK_MAX_YD} yd.`,
      next: LOOK_LOOTABLE,
      reason: "not_lootable",
    });
  return { guid, unit };
}

function namedCorpse(ctx: ToolCtx<LootAfter>, text: string): Corpse {
  const resolved = resolveUnit(ctx, { alive: false, text });
  if (resolved.kind !== "unit")
    throw unitRefusal({ param: "target", resolved, tool: "loot" });
  if (!resolved.unit.lootable)
    throw new Refusal({
      detail: `${label(resolved.unit)} has nothing for you (no lootable flag).`,
      next: LOOK_LOOTABLE,
      reason: "not_lootable",
    });
  return { guid: resolved.guid, unit: resolved.unit };
}

async function approach(
  ctx: ToolCtx<LootAfter>,
  corpse: Corpse,
): Promise<void> {
  const distance = corpse.unit.distance ?? 0;
  const walkTo = nextCall("travel", { to: corpse.unit.ref });
  if (distance > LOOT_WALK_MAX_YD)
    throw new Refusal({
      detail: `${label(corpse.unit)} is ${Math.round(distance)} yd away; loot walks at most ${LOOT_WALK_MAX_YD} yd.`,
      next: walkTo,
      reason: "too_far",
    });
  if (distance <= LOOT_APPROACH_YD) return;
  const leg = await travelLeg(ctx, {
    goal: { guid: corpse.guid, kind: "unit", name: corpse.unit.name },
    within: LOOT_APPROACH_YD,
  });
  if (leg.status !== "arrived")
    throw new Refusal({
      detail: `could not reach ${label(corpse.unit)}: ${leg.detail}.`,
      next: walkTo,
      reason: leg.reason ?? leg.status,
      status: "FAILED",
    });
}

function lootText(op: LootOpResult): string {
  const parts = op.items.map((item) => `${item.name} x${item.count}`);
  if (op.copper > 0) parts.push(`${op.copper} copper`);
  return parts.join(", ");
}

function report(
  ctx: ToolCtx<LootAfter>,
  corpse: Corpse,
  op: LootOpResult,
): ToolResult<LootAfter> {
  const windowClosed = ctx.handle.getRewardsState().loot.phase === "closed";
  const after: LootAfter = {
    copper: op.copper,
    corpse: corpse.unit,
    freeSlots: op.freeSlots,
    items: op.items,
    windowClosed,
  };
  const name = label(corpse.unit);
  const bags = `${windowClosed ? "Window closed." : "Window still open."} Bags: ${op.freeSlots ?? "?"} free.`;
  const { outcome } = op;
  if (!outcome.ok)
    return result("FAILED", {
      after,
      detail: `looting ${name} stopped (${outcome.cause}).`,
      next: LOOK_LOOTABLE,
      reason: outcome.cause,
    });
  if (!outcome.record)
    return result("DONE", {
      after,
      detail: `${name} had nothing left to loot. ${bags}`,
    });
  const left = outcome.record.slotsLeft.length;
  if (left > 0)
    return result("PARTLY", {
      after,
      detail: `looted ${name}: ${lootText(op) || "nothing"}; ${left} item(s) left behind. ${bags}`,
      next: nextCall("journal", { about: "bags" }),
      reason: "bags_full",
    });
  return result("DONE", {
    after,
    detail: `looted ${name}: ${lootText(op)}. ${bags}`,
  });
}

async function runLoot(
  args: LootArgs,
  ctx: ToolCtx<LootAfter>,
): Promise<ToolResult<LootAfter>> {
  const corpse =
    args.target === undefined
      ? nearestCorpse(ctx)
      : namedCorpse(ctx, args.target);
  await approach(ctx, corpse);
  return report(ctx, corpse, await lootCorpseOp(ctx, corpse.guid));
}

export const lootSpec: GameToolSpec<typeof lootParams, "loot"> = {
  fallback: emptyLoot,
  kind: "action",
  name: "loot",
  parameters: lootParams,
  run: runLoot,
};

export const lootTool = defineGameTool(lootSpec);
```

- [ ] **Step 4: Run the test and see it pass**

Run: `mise test packages/harness/src/tools/loot.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/tools/loot.ts packages/harness/src/tools/loot.test.ts
mise exec -- git commit -F - <<'MSG'
feat: Add the harness loot tool

One loot call now walks to the corpse, takes every slot and the money,
and names what the server pushed. A corpse with no lootable flag or out
of reach refuses with a ready next call.
MSG
```

---

## Task B7: `interact` talk, accept, turn_in, gossip

The `interact` dispatch (design B.6): resolve the NPC, walk within 4 yd when it is farther than talk range (5 yd), run one step, and always send `cancelInteraction` at the end. This task builds `talk` (offers with quest ids, gossip, ready turn-ins, roles), `accept` (settled by `accepted`), `turn_in` (refuses with numbered reward choices when `reward` is missing) and `gossip`. `talk` closes the dialog at its end, so `accept` and `turn_in` open it again first. Menu icons (AzerothCore `PlayerQuest.cpp:71-98`, read): 2 and 0 are available quests, 4 is a quest in the log (ready when the log slot is complete, else incomplete).

**Files**
- Modify: `packages/harness/src/tools/interact.ts` (A1 stub → dispatch, approach, `talk`)
- Create: `packages/harness/src/tools/interact-quest.ts` (shared step types and helpers, `accept`, `turn_in`, `gossip`)
- Test: `packages/harness/src/tools/interact.test.ts`

**Interfaces**
- Consumes: `travelLeg` (B1); `resolveUnit`, `unitRefusal` (A3); `settle` (A4); `TALK_RANGE_YD`, `INTERACT_APPROACH_YD` (A5); `defineGameTool`, `GameToolSpec`, `nextCall`, `result` (A1); `interactParams`, `InteractArgs` (A1); `questSlotStatus`, `QuestDialog`, `QuestEvent`, `QuestState` from `@tuicraft/core`; handle `talk`, `selectQuest`, `acceptQuest`, `completeQuest`, `requestQuestReward`, `chooseQuestReward`, `selectGossipOption`, `cancelInteraction`, `onQuestEvent`, `getQuestState`
- Produces (`interact-quest.ts`, used by B8 and B9):
  - `export type NpcTarget = { unit: UnitView; guid: bigint };`
  - `export type StepInit = { args: InteractArgs; ctx: ToolCtx<InteractAfter>; npc: NpcTarget };`
  - `export type InteractStep = (init: StepInit) => Promise<ToolResult<InteractAfter>>;`
  - `export type TalkPart = { after: Partial<InteractAfter>; lines: string[] };`
  - `export type TalkExtra = (init: { ctx: ToolCtx<InteractAfter>; npc: NpcTarget }) => Promise<TalkPart>;`
  - `export const DIALOG_MS = 3000;`, `export const ANSWER_MS = 5000;`
  - `export function formatMoney(copper: number): string;` (`4g 99s 75c`)
  - `export function shortMoney(copper: number): string;` (`25 copper` under 1 silver, else `1s 20c`)
  - `export function moneyChange(ctx: ToolCtx<InteractAfter>, before: number | undefined): MoneyChange | undefined;`
  - `export function moneyText(change: MoneyChange | undefined): string;`
  - `export function npcLabel(npc: NpcTarget): string;`
  - `export function baseAfter(ctx: ToolCtx<InteractAfter>, npc: NpcTarget, action: InteractAction): InteractAfter;`
  - `export function send(ctx: ToolCtx<InteractAfter>, packet: () => void): () => Promise<void>;`
  - `export function questStep(ctx: ToolCtx<InteractAfter>, init: { match: (event: QuestEvent) => boolean; packet: () => void; timeoutMs?: number }): Promise<QuestEvent | undefined>;`
  - `export function openDialog(ctx: ToolCtx<InteractAfter>, npc: NpcTarget): Promise<QuestDialog | undefined>;`
  - `export function offersOf(dialog: QuestDialog | undefined, state: QuestState): QuestOffer[];`
  - `export function gossipOf(dialog: QuestDialog | undefined): GossipLine[];`
  - `export function offerLine(offer: QuestOffer): string;`
  - `export function findOffer(offers: readonly QuestOffer[], what: string | undefined): QuestOffer | undefined;`
  - `export const acceptStep: InteractStep;`, `export const turnInStep: InteractStep;`, `export const gossipStep: InteractStep;`
- Produces (`interact.ts`): `export const interactSpec: GameToolSpec<typeof interactParams, "interact">;`, `export const interactTool`. The dispatch is `const STEPS = new Map<string, InteractStep>([...])` (a `Map`, because `StringEnum` without `as const` gives `args.do` the type `string`, see issue 16) and `const TALK_EXTRAS: TalkExtra[] = []`; B8 and B9 add entries to both.
- Reason codes: `which_quest`, `no_offer`, `no_answer` (status `UNCONFIRMED`), `not_complete`, `reward_needed`, `which_option`, `no_gossip`

- [ ] **Step 1: Write the failing test**

```ts
// packages/harness/src/tools/interact.test.ts
import { describe, expect, test } from "bun:test";
import type { QuestDialog, QuestEvent, QuestState } from "@tuicraft/core";
import type { InteractAfter } from "#harness/contract/details";
import { interactSpec } from "#harness/tools/interact";
import {
  contentOf,
  driveGoto,
  limitProblem,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";

const VELAN = 0x30n;
const NO_REWARDS = {
  arenaPoints: 0,
  choices: [],
  experience: 0,
  factions: [],
  honor: 0,
  honorMultiplier: 0,
  items: [],
  money: 0,
  reputationMask: 0,
  spellCastId: 0,
  spellId: 0,
  talents: 0,
  titleId: 0,
};
const OFFERED = [
  { icon: 2, level: 9, questId: 9254, title: "The Wayward Apprentice" },
  {
    icon: 2,
    level: 10,
    questId: 8892,
    title: "Situation at Sunsail Anchorage",
  },
];

function listDialog(
  quests: readonly {
    icon: number;
    level: number;
    questId: number;
    title: string;
  }[],
): QuestDialog {
  return {
    data: {
      emote: 0,
      emoteDelay: 0,
      guid: VELAN,
      quests: quests.map((quest) => ({ ...quest, flags: 0, repeatable: 0 })),
      title: "Greetings",
    },
    kind: "list",
  };
}

function detailsDialog(questId: number, title: string): QuestDialog {
  return {
    data: {
      activateAccept: 1,
      autoAccept: false,
      details: "",
      dividerGuid: 0n,
      emotes: [],
      flags: 0,
      guid: VELAN,
      objectives: "",
      questId,
      rewards: NO_REWARDS,
      suggestedPlayers: 0,
      title,
      unknown: 0,
    },
    kind: "details",
  };
}

function offerDialog(questId: number, title: string): QuestDialog {
  return {
    data: {
      emotes: [],
      enableNext: 0,
      flags: 0,
      guid: VELAN,
      questId,
      rewards: {
        ...NO_REWARDS,
        choices: [
          { count: 1, displayId: 0, itemId: 2046 },
          { count: 1, displayId: 0, itemId: 2047 },
        ],
      },
      rewardText: "",
      suggestedPlayers: 0,
      title,
      unknownAfterHonorMultiplier: 0,
    },
    kind: "offer",
  };
}

function answer(
  handle: MockHandle,
  type: QuestEvent["type"],
  patch: Partial<QuestState>,
  questId?: number,
): void {
  const state = { ...handle.getQuestState(), ...patch };
  handle.getQuestState = () => state;
  handle.triggerQuestEvent({ questId, source: "packet", state, type });
}

async function velan(distance = 3) {
  const t = await createTestRuntime();
  setSelf(t.handle);
  setUnits(t.handle, [
    unitRow({
      distance,
      guid: VELAN,
      name: "Velan Brightoak",
      relation: "friendly",
      roles: ["questgiver", "gossip"],
      x: distance,
      y: 0,
    }),
  ]);
  let cancelled = 0;
  t.handle.cancelInteraction = () => {
    cancelled += 1;
  };
  return { cancels: () => cancelled, t };
}

describe("interact", () => {
  test("talk lists the offers as the design example does, then closes the window", async () => {
    const { t, cancels } = await velan();
    t.handle.talk = () =>
      answer(t.handle, "dialog", { dialog: listDialog(OFFERED) });
    const res = await interactSpec.run(
      { npc: "Velan Brightoak" },
      toolCtx<InteractAfter>(t),
    );
    const ref = res.after.npc.ref;
    const text = contentOf(res);
    expect(limitProblem(text)).toBeUndefined();
    expect(text).toBe(
      [
        `DONE Velan Brightoak (${ref}) offers:`,
        "1. The Wayward Apprentice #9254 (level 9), available",
        "2. Situation at Sunsail Anchorage #8892 (level 10), available",
        "Ready to turn in: none. Not a vendor or trainer.",
        `Next: interact(do: "accept", npc: "${ref}", what: "1")`,
      ].join("\n"),
    );
    expect(cancels()).toBe(1);
  });

  test("talk that opens no quest dialog says so", async () => {
    const { t } = await velan();
    t.handle.talk = () => answer(t.handle, "window", {});
    const res = await interactSpec.run(
      { npc: "Velan Brightoak" },
      toolCtx<InteractAfter>(t),
    );
    expect(res.detail).toBe(
      `Velan Brightoak (${res.after.npc.ref}) opened no dialog in 3 s.`,
    );
  });

  test("accept selects the quest, accepts it and points at engage", async () => {
    const { t } = await velan();
    const selected: number[] = [];
    t.handle.talk = () =>
      answer(t.handle, "dialog", { dialog: listDialog(OFFERED) });
    t.handle.selectQuest = (questId) => {
      selected.push(questId);
      answer(t.handle, "dialog", {
        dialog: detailsDialog(questId, "The Wayward Apprentice"),
      });
    };
    t.handle.acceptQuest = () => answer(t.handle, "accepted", {}, 9254);
    const res = await interactSpec.run(
      { do: "accept", npc: "Velan Brightoak", what: "1" },
      toolCtx<InteractAfter>(t),
    );
    expect(selected).toEqual([9254]);
    expect(res).toMatchObject({
      detail: "accepted The Wayward Apprentice #9254.",
      next: 'engage(quest: "9254")',
      status: "DONE",
    });
  });

  test("accept without what refuses with the numbered offers", async () => {
    const { t } = await velan();
    t.handle.talk = () =>
      answer(t.handle, "dialog", { dialog: listDialog(OFFERED) });
    await expect(
      interactSpec.run(
        { do: "accept", npc: "Velan Brightoak" },
        toolCtx<InteractAfter>(t),
      ),
    ).rejects.toMatchObject({
      body: [
        "1. The Wayward Apprentice #9254 (level 9), available",
        "2. Situation at Sunsail Anchorage #8892 (level 10), available",
      ],
      reason: "which_quest",
    });
  });

  test("turn_in refuses with the reward choices, then takes the chosen one", async () => {
    const { t } = await velan();
    const log = {
      complete: true,
      slots: [
        {
          counters: [0, 0, 0, 0] as [number, number, number, number],
          expiresAtSeconds: 0,
          flags: 1,
          questId: 8325,
          slot: 0,
        },
      ],
    };
    const chosen: number[] = [];
    t.handle.talk = () =>
      answer(t.handle, "dialog", {
        dialog: listDialog([
          { icon: 4, level: 5, questId: 8325, title: "Thinning the Ranks" },
        ]),
        log,
      });
    t.handle.completeQuest = (questId) =>
      answer(t.handle, "dialog", {
        dialog: offerDialog(questId, "Thinning the Ranks"),
      });
    t.handle.chooseQuestReward = (index) => {
      chosen.push(index);
      answer(t.handle, "rewarded", {}, 8325);
    };
    await expect(
      interactSpec.run(
        { do: "turn_in", npc: "Velan Brightoak" },
        toolCtx<InteractAfter>(t),
      ),
    ).rejects.toMatchObject({
      body: ["1. item 2046 x1", "2. item 2047 x1"],
      reason: "reward_needed",
    });
    const res = await interactSpec.run(
      { do: "turn_in", npc: "Velan Brightoak", reward: 2 },
      toolCtx<InteractAfter>(t),
    );
    expect(chosen).toEqual([1]);
    expect(res).toMatchObject({
      detail: "turned in Thinning the Ranks #8325.",
      status: "DONE",
    });
  });

  test("an NPC out of talk range is walked to first", async () => {
    const { t } = await velan(12);
    const goTo = driveGoto(t.handle, [{ arrive: { x: 9, y: 0 } }]);
    t.handle.talk = () =>
      answer(t.handle, "dialog", { dialog: listDialog(OFFERED) });
    await interactSpec.run(
      { npc: "Velan Brightoak" },
      toolCtx<InteractAfter>(t),
    );
    expect(goTo).toHaveBeenCalledWith({ guid: VELAN, kind: "guid" });
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/tools/interact.test.ts`
Expected: FAIL with `SyntaxError: Export named 'interactSpec' not found in module` (the A1 stub exports only `interactTool`).

- [ ] **Step 3: Implement**

```ts
// packages/harness/src/tools/interact-quest.ts
import {
  type QuestDialog,
  type QuestEvent,
  type QuestState,
  questSlotStatus,
} from "@tuicraft/core";
import type {
  GossipLine,
  InteractAction,
  InteractAfter,
  MoneyChange,
  QuestOffer,
  RewardChoice,
} from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import type { UnitView } from "#harness/contract/views";
import { Refusal } from "#harness/ops/refusal";
import { settle } from "#harness/ops/settle";
import { nextCall, result } from "#harness/tools/define";
import type { InteractArgs } from "#harness/tools/params";

export type NpcTarget = { unit: UnitView; guid: bigint };
export type StepInit = {
  args: InteractArgs;
  ctx: ToolCtx<InteractAfter>;
  npc: NpcTarget;
};
export type InteractStep = (
  init: StepInit,
) => Promise<ToolResult<InteractAfter>>;
export type TalkPart = { after: Partial<InteractAfter>; lines: string[] };
export type TalkExtra = (init: {
  ctx: ToolCtx<InteractAfter>;
  npc: NpcTarget;
}) => Promise<TalkPart>;

export const DIALOG_MS = 3000;
export const ANSWER_MS = 5000;
const READY_ICON = 4;
const HASH = /^#/;

export function formatMoney(copper: number): string {
  return `${Math.floor(copper / 10_000)}g ${Math.floor((copper % 10_000) / 100)}s ${copper % 100}c`;
}

export function shortMoney(copper: number): string {
  if (copper < 100) return `${copper} copper`;
  const parts = [
    [Math.floor(copper / 10_000), "g"],
    [Math.floor((copper % 10_000) / 100), "s"],
    [copper % 100, "c"],
  ] as const;
  return parts
    .filter(([amount]) => amount > 0)
    .map(([amount, unit]) => `${amount}${unit}`)
    .join(" ");
}

export function moneyChange(
  ctx: ToolCtx<InteractAfter>,
  before: number | undefined,
): MoneyChange | undefined {
  const after = ctx.handle.getInventoryState().coinage;
  return before === undefined || after === undefined
    ? undefined
    : { after, before };
}

export function moneyText(change: MoneyChange | undefined): string {
  return change
    ? ` (money ${formatMoney(change.before)} -> ${formatMoney(change.after)})`
    : "";
}

export function npcLabel(npc: NpcTarget): string {
  return `${npc.unit.name} (${npc.unit.ref})`;
}

export function baseAfter(
  ctx: ToolCtx<InteractAfter>,
  npc: NpcTarget,
  action: InteractAction,
): InteractAfter {
  return {
    action,
    bought: undefined,
    dialogOpened: false,
    freeSlots: ctx.handle.getInventoryState().freeSlots,
    gossip: [],
    learned: [],
    money: undefined,
    npc: npc.unit,
    offers: [],
    repairCost: undefined,
    rewardChoices: [],
    roles: npc.unit.roles,
    sold: [],
    spells: [],
    stock: [],
  };
}

export function send(
  ctx: ToolCtx<InteractAfter>,
  packet: () => void,
): () => Promise<void> {
  return () => ctx.rt.mutex.run(packet);
}

export function questStep(
  ctx: ToolCtx<InteractAfter>,
  init: {
    match: (event: QuestEvent) => boolean;
    packet: () => void;
    timeoutMs?: number;
  },
): Promise<QuestEvent | undefined> {
  return settle<QuestEvent>({
    match: init.match,
    send: send(ctx, init.packet),
    signal: ctx.signal,
    subscribe: (cb) => ctx.handle.onQuestEvent(cb),
    timeoutMs: init.timeoutMs ?? DIALOG_MS,
  });
}

export async function openDialog(
  ctx: ToolCtx<InteractAfter>,
  npc: NpcTarget,
): Promise<QuestDialog | undefined> {
  const opened = await questStep(ctx, {
    match: (event) => event.type === "dialog" || event.type === "window",
    packet: () => ctx.handle.talk(npc.guid),
  });
  return opened?.type === "dialog"
    ? ctx.handle.getQuestState().dialog
    : undefined;
}

function menuState(
  entry: { questId: number; icon: number },
  state: QuestState,
): QuestOffer["state"] {
  if (entry.icon !== READY_ICON) return "available";
  const slot = state.log.slots.find((known) => known.questId === entry.questId);
  return slot && questSlotStatus(slot) === "complete" ? "ready" : "incomplete";
}

function singleState(kind: QuestDialog["kind"]): QuestOffer["state"] {
  if (kind === "details") return "available";
  if (kind === "offer") return "ready";
  return "incomplete";
}

export function offersOf(
  dialog: QuestDialog | undefined,
  state: QuestState,
): QuestOffer[] {
  if (!dialog) return [];
  if (dialog.kind === "gossip" || dialog.kind === "list")
    return dialog.data.quests.map((entry, index) => ({
      id: entry.questId,
      level: entry.level > 0 ? entry.level : undefined,
      line: index + 1,
      state: menuState(entry, state),
      title: entry.title,
    }));
  return [
    {
      id: dialog.data.questId,
      level: undefined,
      line: 1,
      state: singleState(dialog.kind),
      title: dialog.data.title,
    },
  ];
}

export function gossipOf(dialog: QuestDialog | undefined): GossipLine[] {
  if (dialog?.kind !== "gossip") return [];
  return dialog.data.options.map((option, index) => ({
    icon: option.icon,
    line: index + 1,
    text: option.text,
  }));
}

export function offerLine(offer: QuestOffer): string {
  const level = offer.level === undefined ? "" : ` (level ${offer.level})`;
  const state = offer.state === "ready" ? "ready to turn in" : offer.state;
  return `${offer.line}. ${offer.title} #${offer.id}${level}, ${state}`;
}

export function findOffer(
  offers: readonly QuestOffer[],
  what: string | undefined,
): QuestOffer | undefined {
  if (what === undefined) return offers.length === 1 ? offers[0] : undefined;
  const text = what.trim().replace(HASH, "").toLowerCase();
  const number = Number(text);
  if (text !== "" && Number.isInteger(number))
    return (
      offers.find((offer) => offer.line === number) ??
      offers.find((offer) => offer.id === number)
    );
  return offers.find((offer) => offer.title.toLowerCase().includes(text));
}

function pickRefusal(
  npc: NpcTarget,
  offers: readonly QuestOffer[],
  action: "accept" | "turn_in",
): Refusal {
  const verb = action === "accept" ? "accept" : "turn in";
  const [first] = offers;
  if (!first)
    return new Refusal({
      detail: `${npcLabel(npc)} has no quest you can ${verb} now.`,
      next: nextCall("interact", { npc: npc.unit.ref }),
      reason: "no_offer",
    });
  return new Refusal({
    body: offers.map(offerLine),
    detail: `say which quest to ${verb}; ${npcLabel(npc)} has ${offers.length}.`,
    next: nextCall("interact", {
      do: action,
      npc: npc.unit.ref,
      what: String(first.line),
    }),
    reason: "which_quest",
  });
}

function unanswered(npc: NpcTarget, what: string, retry: string): Refusal {
  return new Refusal({
    detail: `${npcLabel(npc)} did not answer ${what} in time.`,
    next: retry,
    reason: "no_answer",
    status: "UNCONFIRMED",
  });
}

export const acceptStep: InteractStep = async ({ args, ctx, npc }) => {
  const dialog = await openDialog(ctx, npc);
  const offers = offersOf(dialog, ctx.handle.getQuestState());
  const available = offers.filter((known) => known.state === "available");
  const offer = findOffer(available, args.what);
  if (!offer) throw pickRefusal(npc, available, "accept");
  const retry = nextCall("interact", {
    do: "accept",
    npc: npc.unit.ref,
    what: String(offer.line),
  });
  if (dialog?.kind !== "details") {
    const details = await questStep(ctx, {
      match: (event) =>
        event.type === "dialog" && event.state.dialog?.kind === "details",
      packet: () => ctx.handle.selectQuest(offer.id),
    });
    if (!details)
      throw unanswered(npc, `with the text of ${offer.title}`, retry);
  }
  const accepted = await questStep(ctx, {
    match: (event) => event.type === "accepted" && event.questId === offer.id,
    packet: () => ctx.handle.acceptQuest(),
    timeoutMs: ANSWER_MS,
  });
  if (!accepted) throw unanswered(npc, `the accept of ${offer.title}`, retry);
  return result("DONE", {
    after: { ...baseAfter(ctx, npc, "accept"), dialogOpened: true, offers },
    detail: `accepted ${offer.title} #${offer.id}.`,
    next: nextCall("engage", { quest: String(offer.id) }),
  });
};

async function rewardOffer(
  ctx: ToolCtx<InteractAfter>,
  questId: number,
): Promise<QuestDialog | undefined> {
  const shown = await questStep(ctx, {
    match: (event) =>
      event.type === "dialog" &&
      ["offer", "requestItems"].includes(event.state.dialog?.kind ?? ""),
    packet: () => ctx.handle.completeQuest(questId),
  });
  if (!shown) return;
  if (ctx.handle.getQuestState().dialog?.kind === "requestItems")
    await questStep(ctx, {
      match: (event) =>
        event.type === "dialog" && event.state.dialog?.kind === "offer",
      packet: () => ctx.handle.requestQuestReward(),
    });
  return ctx.handle.getQuestState().dialog;
}

function choicesOf(
  dialog: Extract<QuestDialog, { kind: "offer" }>,
): RewardChoice[] {
  return dialog.data.rewards.choices.map((choice, index) => ({
    count: choice.count,
    index: index + 1,
    name: `item ${choice.itemId}`,
  }));
}

function turnInOffer(
  init: StepInit,
  dialog: QuestDialog | undefined,
): QuestOffer {
  const { args, ctx, npc } = init;
  const offers = offersOf(dialog, ctx.handle.getQuestState()).filter(
    (known) => known.state !== "available",
  );
  const offer = findOffer(offers, args.what);
  if (!offer) throw pickRefusal(npc, offers, "turn_in");
  if (offer.state === "incomplete")
    throw new Refusal({
      detail: `${offer.title} #${offer.id} is not complete yet.`,
      next: nextCall("journal", { about: "quests" }),
      reason: "not_complete",
    });
  return offer;
}

function rewardRefusal(
  npc: NpcTarget,
  offer: QuestOffer,
  choices: readonly RewardChoice[],
): Refusal {
  return new Refusal({
    body: choices.map(
      (choice) => `${choice.index}. ${choice.name} x${choice.count}`,
    ),
    detail: `pick a reward for ${offer.title}.`,
    next: nextCall("interact", {
      do: "turn_in",
      npc: npc.unit.ref,
      reward: 1,
      what: String(offer.line),
    }),
    options: choices,
    reason: "reward_needed",
  });
}

export const turnInStep: InteractStep = async (init) => {
  const { args, ctx, npc } = init;
  const offer = turnInOffer(init, await openDialog(ctx, npc));
  const retry = nextCall("interact", {
    do: "turn_in",
    npc: npc.unit.ref,
    what: String(offer.line),
  });
  const reward = await rewardOffer(ctx, offer.id);
  if (reward?.kind !== "offer")
    throw unanswered(npc, `with the reward of ${offer.title}`, retry);
  const rewardChoices = choicesOf(reward);
  if (rewardChoices.length > 1 && args.reward === undefined)
    throw rewardRefusal(npc, offer, rewardChoices);
  const before = ctx.handle.getInventoryState().coinage;
  const rewarded = await questStep(ctx, {
    match: (event) => event.type === "rewarded" && event.questId === offer.id,
    packet: () => ctx.handle.chooseQuestReward((args.reward ?? 1) - 1),
    timeoutMs: ANSWER_MS,
  });
  if (!rewarded) throw unanswered(npc, `the turn-in of ${offer.title}`, retry);
  const money = moneyChange(ctx, before);
  const gain =
    money && money.after > money.before
      ? ` Money +${shortMoney(money.after - money.before)}.`
      : "";
  return result("DONE", {
    after: {
      ...baseAfter(ctx, npc, "turn_in"),
      dialogOpened: true,
      money,
      offers: [offer],
      rewardChoices,
    },
    detail: `turned in ${offer.title} #${offer.id}.${gain}`,
  });
};

export const gossipStep: InteractStep = async ({ args, ctx, npc }) => {
  const dialog = await openDialog(ctx, npc);
  const lines = gossipOf(dialog);
  const line = lines.find((known) => known.line === Number(args.what));
  const option =
    dialog?.kind === "gossip" && line
      ? dialog.data.options[line.line - 1]
      : undefined;
  if (!(line && option))
    throw new Refusal({
      body: lines.map((known) => `${known.line}. ${known.text}`),
      detail: `${npcLabel(npc)} has no gossip option "${args.what ?? ""}".`,
      next: nextCall("interact", {
        do: "gossip",
        npc: npc.unit.ref,
        what: "1",
      }),
      reason: lines.length === 0 ? "no_gossip" : "which_option",
    });
  const answer = await questStep(ctx, {
    match: (event) =>
      event.type === "dialog" ||
      event.type === "window" ||
      event.type === "closed",
    packet: () => ctx.handle.selectGossipOption(option.optionIndex),
  });
  if (!answer)
    throw unanswered(
      npc,
      `option ${line.line}`,
      nextCall("interact", { npc: npc.unit.ref }),
    );
  const next = ctx.handle.getQuestState().dialog;
  const offers = offersOf(next, ctx.handle.getQuestState());
  return result("DONE", {
    after: {
      ...baseAfter(ctx, npc, "gossip"),
      dialogOpened: true,
      gossip: gossipOf(next),
      offers,
    },
    body: [
      ...offers.map(offerLine),
      ...gossipOf(next).map((known) => `Gossip ${known.line}: ${known.text}`),
    ],
    detail: `chose "${line.text}"; the NPC answered (${answer.type}).`,
  });
};
```

```ts
// packages/harness/src/tools/interact.ts
import type { InteractAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import { INTERACT_APPROACH_YD, TALK_RANGE_YD } from "#harness/ops/range";
import { Refusal } from "#harness/ops/refusal";
import { resolveUnit, unitRefusal } from "#harness/ops/resolve";
import { travelLeg } from "#harness/ops/travel-leg";
import {
  defineGameTool,
  type GameToolSpec,
  nextCall,
  result,
} from "#harness/tools/define";
import {
  acceptStep,
  baseAfter,
  gossipOf,
  gossipStep,
  type InteractStep,
  type NpcTarget,
  npcLabel,
  offerLine,
  offersOf,
  openDialog,
  type StepInit,
  type TalkExtra,
  turnInStep,
} from "#harness/tools/interact-quest";
import { type InteractArgs, interactParams } from "#harness/tools/params";

const SHOP_ROLES = new Set([
  "vendor",
  "trainer",
  "class_trainer",
  "profession_trainer",
  "repair",
]);

function emptyInteract(): InteractAfter {
  return {
    action: "talk",
    bought: undefined,
    dialogOpened: false,
    freeSlots: undefined,
    gossip: [],
    learned: [],
    money: undefined,
    npc: {
      alive: true,
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
    },
    offers: [],
    repairCost: undefined,
    rewardChoices: [],
    roles: [],
    sold: [],
    spells: [],
    stock: [],
  };
}

const TALK_EXTRAS: TalkExtra[] = [];

function talkNext(npc: NpcTarget, after: InteractAfter): string | undefined {
  const available = after.offers.find((offer) => offer.state === "available");
  if (available)
    return nextCall("interact", {
      do: "accept",
      npc: npc.unit.ref,
      what: String(available.line),
    });
  const ready = after.offers.find((offer) => offer.state === "ready");
  if (ready)
    return nextCall("interact", {
      do: "turn_in",
      npc: npc.unit.ref,
      what: String(ready.line),
    });
}

async function talkStep({
  ctx,
  npc,
}: StepInit): Promise<ToolResult<InteractAfter>> {
  const dialog = await openDialog(ctx, npc);
  const gossip = gossipOf(dialog);
  const offers = offersOf(dialog, ctx.handle.getQuestState());
  let after: InteractAfter = {
    ...baseAfter(ctx, npc, "talk"),
    dialogOpened: dialog !== undefined,
    gossip,
    offers,
  };
  const extra: string[] = [];
  for (const part of TALK_EXTRAS) {
    const added = await part({ ctx, npc });
    after = { ...after, ...added.after };
    extra.push(...added.lines);
  }
  const ready = offers
    .filter((offer) => offer.state === "ready")
    .map((offer) => `${offer.line}. ${offer.title} #${offer.id}`);
  const shop = npc.unit.roles.some((role) => SHOP_ROLES.has(role))
    ? ""
    : " Not a vendor or trainer.";
  const body = [
    ...offers.filter((offer) => offer.state !== "ready").map(offerLine),
    ...gossip.map((line) => `Gossip ${line.line}: ${line.text}`),
    ...extra,
    `Ready to turn in: ${ready.length === 0 ? "none" : ready.join(", ")}.${shop}`,
  ];
  const opened = dialog !== undefined || extra.length > 0;
  const detail = opened
    ? `${npcLabel(npc)} offers:`
    : `${npcLabel(npc)} opened no dialog in 3 s.`;
  return result("DONE", { after, body, detail, next: talkNext(npc, after) });
}

const STEPS = new Map<string, InteractStep>([
  ["talk", talkStep],
  ["accept", acceptStep],
  ["turn_in", turnInStep],
  ["gossip", gossipStep],
]);

function findNpc(ctx: ToolCtx<InteractAfter>, text: string): NpcTarget {
  const resolved = resolveUnit(ctx, { alive: true, text });
  if (resolved.kind !== "unit")
    throw unitRefusal({ param: "npc", resolved, tool: "interact" });
  return { guid: resolved.guid, unit: resolved.unit };
}

async function approach(
  ctx: ToolCtx<InteractAfter>,
  npc: NpcTarget,
): Promise<void> {
  if ((npc.unit.distance ?? 0) <= TALK_RANGE_YD) return;
  const leg = await travelLeg(ctx, {
    goal: { guid: npc.guid, kind: "unit", name: npc.unit.name },
    within: INTERACT_APPROACH_YD,
  });
  if (leg.status !== "arrived")
    throw new Refusal({
      detail: `could not reach ${npcLabel(npc)}: ${leg.detail}.`,
      next: nextCall("travel", { to: npc.unit.ref }),
      reason: leg.reason ?? leg.status,
      status: "FAILED",
    });
}

async function runInteract(
  args: InteractArgs,
  ctx: ToolCtx<InteractAfter>,
): Promise<ToolResult<InteractAfter>> {
  const npc = findNpc(ctx, args.npc);
  const step = STEPS.get(args.do ?? "talk");
  if (!step) throw new Error("not_implemented");
  await approach(ctx, npc);
  try {
    return await step({ args, ctx, npc });
  } finally {
    await ctx.rt.mutex.run(() => ctx.handle.cancelInteraction());
  }
}

export const interactSpec: GameToolSpec<typeof interactParams, "interact"> = {
  fallback: emptyInteract,
  kind: "action",
  name: "interact",
  parameters: interactParams,
  run: runInteract,
};

export const interactTool = defineGameTool(interactSpec);
```

- [ ] **Step 4: Run the test and see it pass**

Run: `mise test packages/harness/src/tools/interact.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/tools/interact.ts packages/harness/src/tools/interact-quest.ts packages/harness/src/tools/interact.test.ts
mise exec -- git commit -F - <<'MSG'
feat: Add harness interact talk and quests

The model must see what an NPC offers, with quest ids, and accept or
turn in a quest in one call each. Every step walks into range first,
settles on the server's answer and closes the window at the end.
MSG
```

---

## Task B8: `interact` buy and sell_junk

`buy` opens the vendor window, matches `what` as a case-insensitive part of an item name ("water" → Refreshing Spring Water, design V-L6), refuses with the stock or with ready calls when there is no match or two different items match, and buys `count` times, each settled by a `bought` vendor event. `sell_junk` sells each grey (quality 0) item in the backpack and bags, each settled by `sold`. `talk` on a vendor lists the stock (the `vendorExtra` talk part).

**Files**
- Create: `packages/harness/src/tools/interact-vendor.ts`
- Modify: `packages/harness/src/tools/interact.ts` (one import, two `STEPS` entries, one `TALK_EXTRAS` entry)
- Test: `packages/harness/src/tools/interact-vendor.test.ts`

**Interfaces**
- Consumes: B7 names from `#harness/tools/interact-quest` (`ANSWER_MS`, `baseAfter`, `InteractStep`, `moneyChange`, `moneyText`, `NpcTarget`, `npcLabel`, `send`, `shortMoney`, `TalkExtra`); `settle` (A4); `NamedVendorGood`, `VendorEvent` from `@tuicraft/core`; handle `openVendor`, `getVendorState`, `buyItem`, `sellItem`, `onVendorEvent`, `getInventoryState`
- Produces:
  - `export function openVendorWindow(ctx: ToolCtx<InteractAfter>, npc: NpcTarget): Promise<NamedVendorGood[] | undefined>;`
  - `export function stockLines(goods: readonly NamedVendorGood[]): StockLine[];`
  - `export const vendorExtra: TalkExtra;`, `export const buyStep: InteractStep;`, `export const sellJunkStep: InteractStep;`
  - Reason codes: `what_needed`, `no_match`, `ambiguous_item`, `no_vendor_window` (status `UNCONFIRMED`), `sell_refused`, and the vendor refusal reasons from core (`not_enough_money`, …)

- [ ] **Step 1: Write the failing test**

```ts
// packages/harness/src/tools/interact-vendor.test.ts
import { describe, expect, test } from "bun:test";
import type { NamedVendorGood, VendorEvent } from "@tuicraft/core";
import type { InteractAfter } from "#harness/contract/details";
import { interactSpec } from "#harness/tools/interact";
import {
  contentOf,
  limitProblem,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";

const MARNIEL = 0x10n;

function good(slot: number, itemId: number, name: string): NamedVendorGood {
  return {
    buyCount: 5,
    displayId: 0,
    extendedCost: 0,
    itemId,
    maxDurability: 0,
    name,
    price: 25,
    quality: 1,
    slot,
    stock: null,
  };
}

function coinage(handle: MockHandle, copper: number): void {
  const inventory = handle.getInventoryState();
  handle.getInventoryState = () => ({
    ...inventory,
    coinage: copper,
    freeSlots: 10,
  });
}

function vendorEvent(
  handle: MockHandle,
  type: VendorEvent["type"],
  reason?: string,
): void {
  const state = handle.getVendorState();
  const lastOutcome = reason
    ? {
        action: "buy" as const,
        coinageAfter: undefined,
        moneyDelta: undefined,
        observedAt: 0,
        reason,
        request: {
          action: "buy" as const,
          answer: undefined,
          coinageBefore: undefined,
          count: 1,
          guid: MARNIEL,
          itemId: 159,
          maxPrice: 25,
          minPrice: 25,
          requestedAt: 0,
          slot: 1,
        },
        status: "refused" as const,
      }
    : state.lastOutcome;
  handle.triggerVendorEvent({ at: 0, state: { ...state, lastOutcome }, type });
}

async function marniel(goods: readonly NamedVendorGood[]) {
  const t = await createTestRuntime();
  setSelf(t.handle);
  setUnits(t.handle, [
    unitRow({
      distance: 3,
      guid: MARNIEL,
      name: "Marniel Amberlight",
      relation: "friendly",
      roles: ["vendor"],
      x: 3,
      y: 0,
    }),
  ]);
  coinage(t.handle, 50_000);
  t.handle.talk = () =>
    t.handle.triggerQuestEvent({
      source: "packet",
      state: t.handle.getQuestState(),
      type: "window",
    });
  t.handle.openVendor = (guid) => {
    const state = t.handle.getVendorState();
    const window = {
      emptyReason: undefined,
      guid,
      invalidatedReason: undefined,
      items: [...goods],
      openedAt: 0,
    };
    t.handle.getVendorState = () => ({ ...state, window });
    vendorEvent(t.handle, "listed");
  };
  return t;
}

describe("interact vendor", () => {
  test("buy matches part of a name and settles on the purchase", async () => {
    const t = await marniel([
      good(1, 159, "Refreshing Spring Water"),
      good(2, 4540, "Tough Hunk of Bread"),
    ]);
    const slots: number[] = [];
    t.handle.buyItem = (slot) => {
      slots.push(slot);
      coinage(t.handle, 49_975);
      vendorEvent(t.handle, "bought");
    };
    const res = await interactSpec.run(
      { do: "buy", npc: "Marniel Amberlight", what: "water" },
      toolCtx<InteractAfter>(t),
    );
    const text = contentOf(res);
    expect(limitProblem(text)).toBeUndefined();
    expect(text).toBe(
      "DONE bought Refreshing Spring Water x5 for 25 copper (money 5g 0s 0c -> 4g 99s 75c). Bags: 10 free.",
    );
    expect(slots).toEqual([1]);
  });

  test("two different matches refuse with ready calls", async () => {
    const t = await marniel([
      good(1, 159, "Refreshing Spring Water"),
      good(2, 1179, "Ice Cold Water"),
    ]);
    await expect(
      interactSpec.run(
        { do: "buy", npc: "Marniel Amberlight", what: "water" },
        toolCtx<InteractAfter>(t),
      ),
    ).rejects.toMatchObject({
      body: [
        expect.stringContaining('what: "Refreshing Spring Water"'),
        expect.stringContaining('what: "Ice Cold Water"'),
      ],
      reason: "ambiguous_item",
    });
  });

  test("a refused purchase fails with the vendor's reason", async () => {
    const t = await marniel([good(1, 159, "Refreshing Spring Water")]);
    t.handle.buyItem = () =>
      vendorEvent(t.handle, "refused", "not_enough_money");
    const res = await interactSpec.run(
      { do: "buy", npc: "Marniel Amberlight", what: "water" },
      toolCtx<InteractAfter>(t),
    );
    expect(res).toMatchObject({ reason: "not_enough_money", status: "FAILED" });
  });

  test("talk on a vendor lists the stock", async () => {
    const t = await marniel([
      good(1, 159, "Refreshing Spring Water"),
      good(2, 4540, "Tough Hunk of Bread"),
    ]);
    const res = await interactSpec.run(
      { npc: "Marniel Amberlight" },
      toolCtx<InteractAfter>(t),
    );
    expect(res.body).toContain(
      "Sells: Refreshing Spring Water 25 copper, Tough Hunk of Bread 25 copper.",
    );
    expect(res.after.stock).toHaveLength(2);
  });

  test("sell_junk sells every grey item in the bags", async () => {
    const t = await marniel([]);
    const inventory = t.handle.getInventoryState();
    const fang = {
      bag: 255,
      guid: 0x99n,
      item: {
        contained: undefined,
        count: 2,
        durability: undefined,
        entry: 7073,
        flags: 0,
        guid: 0x99n,
        maxDurability: undefined,
        name: "Broken Fang",
        owner: undefined,
        quality: 0,
        randomPropertyId: 0,
      },
      region: "backpack" as const,
      slot: 23,
      status: "occupied" as const,
    };
    t.handle.getInventoryState = () => ({ ...inventory, slots: [fang] });
    const sold: number[] = [];
    t.handle.sellItem = (_bag, slot) => {
      sold.push(slot);
      const after = t.handle.getInventoryState();
      t.handle.getInventoryState = () => ({ ...after, coinage: 50_004 });
      vendorEvent(t.handle, "sold");
    };
    const res = await interactSpec.run(
      { do: "sell_junk", npc: "Marniel Amberlight" },
      toolCtx<InteractAfter>(t),
    );
    expect(sold).toEqual([23]);
    expect(res).toMatchObject({
      detail:
        "sold 1 of 1 junk items for 4 copper (money 5g 0s 0c -> 5g 0s 4c).",
      status: "DONE",
    });
    expect(res.after.sold).toEqual([
      { count: 2, itemId: 7073, name: "Broken Fang", quality: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/tools/interact-vendor.test.ts`
Expected: FAIL; the `buy` and `sell_junk` tests reject with `error: not_implemented` (no `STEPS` entry yet), and the talk test fails on the missing `Sells:` line.

- [ ] **Step 3: Implement**

```ts
// packages/harness/src/tools/interact-vendor.ts
import type { NamedVendorGood, VendorEvent } from "@tuicraft/core";
import type {
  InteractAfter,
  LootLine,
  StockLine,
} from "#harness/contract/details";
import type { ToolCtx } from "#harness/contract/services";
import { Refusal } from "#harness/ops/refusal";
import { settle } from "#harness/ops/settle";
import { nextCall, result } from "#harness/tools/define";
import {
  ANSWER_MS,
  baseAfter,
  type InteractStep,
  moneyChange,
  moneyText,
  type NpcTarget,
  npcLabel,
  send,
  shortMoney,
  type TalkExtra,
} from "#harness/tools/interact-quest";

const STOCK_SHOWN = 8;
const VENDOR_ROLES = new Set([
  "vendor",
  "vendor_ammo",
  "vendor_food",
  "vendor_poison",
  "vendor_reagent",
]);
const JUNK_QUALITY = 0;
const BAG_REGIONS = new Set(["backpack", "bag_item"]);

function vendorStep(
  ctx: ToolCtx<InteractAfter>,
  init: { settled: readonly VendorEvent["type"][]; packet: () => void },
): Promise<VendorEvent | undefined> {
  return settle<VendorEvent>({
    match: (event) => init.settled.includes(event.type),
    send: send(ctx, init.packet),
    signal: ctx.signal,
    subscribe: (cb) => ctx.handle.onVendorEvent(cb),
    timeoutMs: ANSWER_MS,
  });
}

export async function openVendorWindow(
  ctx: ToolCtx<InteractAfter>,
  npc: NpcTarget,
): Promise<NamedVendorGood[] | undefined> {
  const listed = await vendorStep(ctx, {
    packet: () => ctx.handle.openVendor(npc.guid),
    settled: ["listed", "refused", "unanswered"],
  });
  return listed?.type === "listed"
    ? ctx.handle.getVendorState().window?.items
    : undefined;
}

function nameOf(good: NamedVendorGood): string {
  return good.name ?? `item ${good.itemId}`;
}

export function stockLines(goods: readonly NamedVendorGood[]): StockLine[] {
  return goods.map((good, index) => ({
    available: good.stock ?? undefined,
    itemId: good.itemId,
    line: index + 1,
    name: nameOf(good),
    price: good.price,
    stack: good.buyCount,
  }));
}

function stockText(stock: readonly StockLine[]): string {
  const shown = stock
    .slice(0, STOCK_SHOWN)
    .map((line) => `${line.name} ${shortMoney(line.price)}`);
  const more =
    stock.length > STOCK_SHOWN ? `, +${stock.length - STOCK_SHOWN} more` : "";
  return `Sells: ${shown.join(", ")}${more}.`;
}

export const vendorExtra: TalkExtra = async ({ ctx, npc }) => {
  if (!npc.unit.roles.some((role) => VENDOR_ROLES.has(role)))
    return { after: {}, lines: [] };
  const goods = await openVendorWindow(ctx, npc);
  if (!goods)
    return { after: {}, lines: ["The vendor window did not open in 5 s."] };
  const stock = stockLines(goods);
  return { after: { stock }, lines: [stockText(stock)] };
};

function pickGood(
  npc: NpcTarget,
  goods: readonly NamedVendorGood[],
  what: string | undefined,
): NamedVendorGood {
  const stock = stockLines(goods);
  const body = stock
    .slice(0, STOCK_SHOWN)
    .map((line) => `${line.line}. ${line.name} ${shortMoney(line.price)}`);
  const [first] = stock;
  const buy = (name: string) =>
    nextCall("interact", { do: "buy", npc: npc.unit.ref, what: name });
  if (what === undefined)
    throw new Refusal({
      body,
      detail: `say what to buy from ${npcLabel(npc)}.`,
      next: first ? buy(first.name) : undefined,
      reason: "what_needed",
    });
  const text = what.trim().toLowerCase();
  const matches = goods.filter((good) =>
    nameOf(good).toLowerCase().includes(text),
  );
  const names = [...new Set(matches.map(nameOf))];
  const [match] = matches;
  if (match && names.length === 1) return match;
  if (names.length === 0)
    throw new Refusal({
      body,
      detail: `${npcLabel(npc)} sells nothing called "${what}".`,
      next: first ? buy(first.name) : undefined,
      reason: "no_match",
    });
  throw new Refusal({
    body: names.map(buy),
    detail: `"${what}" matches ${names.length} items.`,
    next: buy(names[0] ?? what),
    reason: "ambiguous_item",
  });
}

function noWindow(npc: NpcTarget): Refusal {
  return new Refusal({
    detail: `${npcLabel(npc)} did not open a vendor window in 5 s.`,
    next: nextCall("interact", { npc: npc.unit.ref }),
    reason: "no_vendor_window",
    status: "UNCONFIRMED",
  });
}

export const buyStep: InteractStep = async ({ args, ctx, npc }) => {
  const goods = await openVendorWindow(ctx, npc);
  if (!goods) throw noWindow(npc);
  const good = pickGood(npc, goods, args.what);
  const before = ctx.handle.getInventoryState().coinage;
  const wanted = args.count ?? 1;
  let bought = 0;
  let refusal: string | undefined;
  while (bought < wanted && refusal === undefined) {
    const answer = await vendorStep(ctx, {
      packet: () => ctx.handle.buyItem(good.slot),
      settled: ["bought", "refused", "partial", "unanswered"],
    });
    if (answer?.type === "bought") bought += 1;
    else
      refusal =
        answer?.state.lastOutcome?.reason ?? answer?.type ?? "no_answer";
  }
  const change = moneyChange(ctx, before);
  const spent = change ? change.before - change.after : good.price * bought;
  const line: LootLine = {
    count: bought * good.buyCount,
    itemId: good.itemId,
    name: nameOf(good),
    quality: good.quality,
  };
  const after = {
    ...baseAfter(ctx, npc, "buy"),
    bought: line,
    money: change,
    stock: stockLines(goods),
  };
  const detail = `bought ${line.name} x${line.count} for ${shortMoney(spent)}${moneyText(change)}. Bags: ${after.freeSlots ?? "?"} free.`;
  if (refusal === undefined) return result("DONE", { after, detail });
  if (bought > 0)
    return result("PARTLY", {
      after,
      detail: `${detail} Then: ${refusal}.`,
      next: nextCall("journal", { about: "bags" }),
      reason: refusal,
    });
  return result("FAILED", {
    after,
    detail: `${npcLabel(npc)} refused the sale (${refusal}).`,
    next: nextCall("journal", { about: "bags" }),
    reason: refusal,
  });
};

export const sellJunkStep: InteractStep = async ({ ctx, npc }) => {
  const junk = ctx.handle
    .getInventoryState()
    .slots.flatMap((slot) =>
      slot.status === "occupied" &&
      slot.item.quality === JUNK_QUALITY &&
      BAG_REGIONS.has(slot.region)
        ? [slot]
        : [],
    );
  const after = baseAfter(ctx, npc, "sell_junk");
  if (junk.length === 0)
    return result("DONE", {
      after,
      detail: "you have no junk (grey items) to sell.",
    });
  if (!(await openVendorWindow(ctx, npc))) throw noWindow(npc);
  const before = ctx.handle.getInventoryState().coinage;
  const sold: LootLine[] = [];
  for (const slot of junk) {
    const answer = await vendorStep(ctx, {
      packet: () => ctx.handle.sellItem(slot.bag, slot.slot),
      settled: ["sold", "refused", "partial", "unanswered"],
    });
    if (answer?.type === "sold")
      sold.push({
        count: slot.item.count ?? 1,
        itemId: slot.item.entry ?? 0,
        name: slot.item.name ?? "item",
        quality: slot.item.quality,
      });
  }
  const change = moneyChange(ctx, before);
  const gain = change ? change.after - change.before : 0;
  const status = sold.length === junk.length ? "DONE" : "PARTLY";
  return result(status, {
    after: { ...after, money: change, sold },
    detail: `sold ${sold.length} of ${junk.length} junk items for ${shortMoney(gain)}${moneyText(change)}.`,
    reason: status === "DONE" ? undefined : "sell_refused",
  });
};
```

Then edit `packages/harness/src/tools/interact.ts`. Add this import after the `interact-quest` import:

```ts
import {
  buyStep,
  sellJunkStep,
  vendorExtra,
} from "#harness/tools/interact-vendor";
```

Replace `const TALK_EXTRAS: TalkExtra[] = [];` with:

```ts
const TALK_EXTRAS: TalkExtra[] = [vendorExtra];
```

Add these two entries at the end of the `STEPS` map, after `["gossip", gossipStep],`:

```ts
  ["buy", buyStep],
  ["sell_junk", sellJunkStep],
```

- [ ] **Step 4: Run the test and see it pass**

Run: `mise test packages/harness/src/tools/interact-vendor.test.ts packages/harness/src/tools/interact.test.ts`
Expected: PASS, 11 tests (5 new, the 6 of B7 still pass).

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/tools/interact-vendor.ts packages/harness/src/tools/interact-vendor.test.ts packages/harness/src/tools/interact.ts
mise exec -- git commit -F - <<'MSG'
feat: Add harness interact buy and sell_junk

Tasks say "some water", never an item name, so buy matches part of a
name and refuses with ready calls when the match is not clear. Each buy
and sale settles on the vendor's answer and reports the money change.
MSG
```

---

## Task B9: `interact` train and repair

`train` opens the trainer window, learns every spell that is available now and costs no more than the money on hand (or only the ones whose name contains `what`), each settled by `trained`, and names the next level with new spells when there is nothing to learn. `repair` needs the `repair` role, opens the vendor window and settles `repairAll` on `repaired`. `talk` on a trainer lists what it teaches now (the `trainerExtra` talk part). This task does not import `interact-vendor.ts`, so B9 does not need B8.

**Files**
- Create: `packages/harness/src/tools/interact-trainer.ts`
- Modify: `packages/harness/src/tools/interact.ts` (one import, two `STEPS` entries, one `TALK_EXTRAS` entry)
- Test: `packages/harness/src/tools/interact-trainer.test.ts`

**Interfaces**
- Consumes: B7 names from `#harness/tools/interact-quest`; `settle` (A4); `NamedTrainerSpell`, `TrainerEvent`, `VendorEvent` from `@tuicraft/core` (C1 exports `TrainerEvent` and `VendorEvent`); handle `openTrainer`, `getTrainerState`, `trainSpell`, `onTrainerEvent`, `openVendor`, `repairAll`, `onVendorEvent`
- Produces:
  - `export function openTrainerWindow(ctx: ToolCtx<InteractAfter>, npc: NpcTarget): Promise<NamedTrainerSpell[] | undefined>;`
  - `export function trainerLines(spells: readonly NamedTrainerSpell[]): TrainerLine[];`
  - `export const trainerExtra: TalkExtra;`, `export const trainStep: InteractStep;`, `export const repairStep: InteractStep;`
  - Reason codes: `no_trainer_window` (status `UNCONFIRMED`), `not_repairer`, `no_vendor_window`, and the trainer and vendor refusal reasons from core

- [ ] **Step 1: Write the failing test**

```ts
// packages/harness/src/tools/interact-trainer.test.ts
import { describe, expect, test } from "bun:test";
import type {
  NamedTrainerSpell,
  TrainerEvent,
  VendorEvent,
} from "@tuicraft/core";
import type { InteractAfter } from "#harness/contract/details";
import { interactSpec } from "#harness/tools/interact";
import {
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";

const ARENA = 0x40n;

function spell(
  spellId: number,
  name: string,
  state: NamedTrainerSpell["state"],
  requiredLevel: number,
): NamedTrainerSpell {
  return {
    cost: 100,
    firstRank: spellId,
    name,
    rank: "Rank 2",
    requiredLevel,
    requiredSkill: 0,
    requiredSkillValue: 0,
    requiredSpells: [],
    spellId,
    state,
    talentPointCost: 0,
    usable: 0,
  };
}

function coinage(handle: MockHandle, copper: number): void {
  const inventory = handle.getInventoryState();
  handle.getInventoryState = () => ({ ...inventory, coinage: copper });
}

function trainerEvent(handle: MockHandle, type: TrainerEvent["type"]): void {
  handle.triggerTrainerEvent({
    at: 0,
    state: {
      coinage: undefined,
      lastOutcome: undefined,
      level: 10,
      offer: undefined,
      pending: undefined,
    },
    type,
  });
}

function vendorEvent(handle: MockHandle, type: VendorEvent["type"]): void {
  handle.triggerVendorEvent({ at: 0, state: handle.getVendorState(), type });
}

async function arena(
  roles: ("trainer" | "class_trainer" | "repair" | "vendor")[],
  spells: NamedTrainerSpell[],
) {
  const t = await createTestRuntime();
  setSelf(t.handle);
  setUnits(t.handle, [
    unitRow({
      distance: 3,
      guid: ARENA,
      name: "Matron Arena",
      relation: "friendly",
      roles,
      x: 3,
      y: 0,
    }),
  ]);
  coinage(t.handle, 1000);
  t.handle.talk = () =>
    t.handle.triggerQuestEvent({
      source: "packet",
      state: t.handle.getQuestState(),
      type: "window",
    });
  t.handle.openTrainer = () => trainerEvent(t.handle, "listed");
  t.handle.getTrainerState = async () => ({
    coinage: 1000,
    lastOutcome: undefined,
    level: 10,
    offer: { greeting: "", guid: ARENA, receivedAt: 0, spells, trainerType: 0 },
    pending: undefined,
  });
  return t;
}

describe("interact trainer", () => {
  test("train learns every affordable spell and reports the cost", async () => {
    const t = await arena(
      ["trainer", "class_trainer"],
      [
        spell(1244, "Power Word: Fortitude", "available", 10),
        spell(591, "Smite", "too_low", 12),
      ],
    );
    const trained: number[] = [];
    t.handle.trainSpell = (spellId) => {
      trained.push(spellId);
      coinage(t.handle, 900);
      trainerEvent(t.handle, "trained");
    };
    const res = await interactSpec.run(
      { do: "train", npc: "Matron Arena" },
      toolCtx<InteractAfter>(t),
    );
    expect(trained).toEqual([1244]);
    expect(res).toMatchObject({
      detail:
        "learned Power Word: Fortitude (Rank 2) for 1s (money 0g 10s 0c -> 0g 9s 0c).",
      status: "DONE",
    });
  });

  test("nothing to learn names the next level", async () => {
    const t = await arena(["trainer"], [spell(591, "Smite", "too_low", 12)]);
    const res = await interactSpec.run(
      { do: "train", npc: "Matron Arena" },
      toolCtx<InteractAfter>(t),
    );
    expect(res.detail).toBe(
      `nothing to learn from Matron Arena (${res.after.npc.ref}) now. Next new spells at level 12.`,
    );
  });

  test("talk on a trainer lists what it teaches now", async () => {
    const t = await arena(
      ["trainer"],
      [spell(1244, "Power Word: Fortitude", "available", 10)],
    );
    const res = await interactSpec.run(
      { npc: "Matron Arena" },
      toolCtx<InteractAfter>(t),
    );
    expect(res.body).toContain(
      "Teaches now: Power Word: Fortitude (Rank 2) 1s.",
    );
  });

  test("repair opens the vendor window and settles on the repair", async () => {
    const t = await arena(["vendor", "repair"], []);
    t.handle.openVendor = () => vendorEvent(t.handle, "listed");
    t.handle.repairAll = () => {
      coinage(t.handle, 955);
      vendorEvent(t.handle, "repaired");
    };
    const res = await interactSpec.run(
      { do: "repair", npc: "Matron Arena" },
      toolCtx<InteractAfter>(t),
    );
    expect(res).toMatchObject({ after: { repairCost: 45 }, status: "DONE" });
    expect(res.detail).toBe(
      "repaired all gear for 45 copper (money 0g 10s 0c -> 0g 9s 55c).",
    );
  });

  test("repair at an NPC without the repair role refuses", async () => {
    const t = await arena(["trainer"], []);
    await expect(
      interactSpec.run(
        { do: "repair", npc: "Matron Arena" },
        toolCtx<InteractAfter>(t),
      ),
    ).rejects.toMatchObject({
      reason: "not_repairer",
    });
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/tools/interact-trainer.test.ts`
Expected: FAIL; `train` and `repair` reject with `error: not_implemented`, and the talk test fails on the missing `Teaches now:` line.

- [ ] **Step 3: Implement**

```ts
// packages/harness/src/tools/interact-trainer.ts
import type {
  NamedTrainerSpell,
  TrainerEvent,
  VendorEvent,
} from "@tuicraft/core";
import type { InteractAfter, TrainerLine } from "#harness/contract/details";
import type { ToolCtx } from "#harness/contract/services";
import { Refusal } from "#harness/ops/refusal";
import { settle } from "#harness/ops/settle";
import { nextCall, result } from "#harness/tools/define";
import {
  ANSWER_MS,
  baseAfter,
  type InteractStep,
  moneyChange,
  moneyText,
  type NpcTarget,
  npcLabel,
  send,
  shortMoney,
  type TalkExtra,
} from "#harness/tools/interact-quest";

const SPELLS_SHOWN = 6;
const TRAINER_ROLES = new Set([
  "trainer",
  "class_trainer",
  "profession_trainer",
]);

function trainerStep(
  ctx: ToolCtx<InteractAfter>,
  init: { settled: readonly TrainerEvent["type"][]; packet: () => void },
): Promise<TrainerEvent | undefined> {
  return settle<TrainerEvent>({
    match: (event) => init.settled.includes(event.type),
    send: send(ctx, init.packet),
    signal: ctx.signal,
    subscribe: (cb) => ctx.handle.onTrainerEvent(cb),
    timeoutMs: ANSWER_MS,
  });
}

function vendorStep(
  ctx: ToolCtx<InteractAfter>,
  init: { settled: readonly VendorEvent["type"][]; packet: () => void },
): Promise<VendorEvent | undefined> {
  return settle<VendorEvent>({
    match: (event) => init.settled.includes(event.type),
    send: send(ctx, init.packet),
    signal: ctx.signal,
    subscribe: (cb) => ctx.handle.onVendorEvent(cb),
    timeoutMs: ANSWER_MS,
  });
}

export async function openTrainerWindow(
  ctx: ToolCtx<InteractAfter>,
  npc: NpcTarget,
): Promise<NamedTrainerSpell[] | undefined> {
  const listed = await trainerStep(ctx, {
    packet: () => ctx.handle.openTrainer(npc.guid),
    settled: ["listed", "refused", "unanswered"],
  });
  if (listed?.type !== "listed") return;
  return (await ctx.handle.getTrainerState()).offer?.spells;
}

function lineState(state: NamedTrainerSpell["state"]): TrainerLine["state"] {
  if (state === "known") return "known";
  if (state === "available") return "available";
  return "unavailable";
}

export function trainerLines(
  spells: readonly NamedTrainerSpell[],
): TrainerLine[] {
  return spells.map((spell) => ({
    cost: spell.cost,
    level: spell.requiredLevel,
    name: spell.name ?? `spell ${spell.spellId}`,
    rank: spell.rank ?? undefined,
    spellId: spell.spellId,
    state: lineState(spell.state),
  }));
}

function spellName(line: TrainerLine): string {
  return line.rank ? `${line.name} (${line.rank})` : line.name;
}

function nextLevelText(spells: readonly NamedTrainerSpell[]): string {
  const levels = spells
    .filter((spell) => spell.state === "too_low")
    .map((spell) => spell.requiredLevel);
  return levels.length === 0
    ? ""
    : ` Next new spells at level ${Math.min(...levels)}.`;
}

export const trainerExtra: TalkExtra = async ({ ctx, npc }) => {
  if (!npc.unit.roles.some((role) => TRAINER_ROLES.has(role)))
    return { after: {}, lines: [] };
  const spells = await openTrainerWindow(ctx, npc);
  if (!spells)
    return { after: {}, lines: ["The trainer window did not open in 5 s."] };
  const lines = trainerLines(spells);
  const now = lines
    .filter((line) => line.state === "available")
    .slice(0, SPELLS_SHOWN);
  const teaches =
    now.length === 0
      ? "Nothing to learn now."
      : `Teaches now: ${now.map((line) => `${spellName(line)} ${shortMoney(line.cost)}`).join(", ")}.`;
  return {
    after: { spells: lines },
    lines: [`${teaches}${nextLevelText(spells)}`],
  };
};

export const trainStep: InteractStep = async ({ args, ctx, npc }) => {
  const spells = await openTrainerWindow(ctx, npc);
  if (!spells)
    throw new Refusal({
      detail: `${npcLabel(npc)} did not open a trainer window in 5 s.`,
      next: nextCall("interact", { npc: npc.unit.ref }),
      reason: "no_trainer_window",
      status: "UNCONFIRMED",
    });
  const lines = trainerLines(spells);
  const before = ctx.handle.getInventoryState().coinage ?? 0;
  const what = args.what?.trim().toLowerCase();
  const wanted = lines.filter(
    (line) =>
      line.state === "available" &&
      line.cost <= before &&
      (what === undefined || line.name.toLowerCase().includes(what)),
  );
  const learned: string[] = [];
  const refused: string[] = [];
  for (const line of wanted) {
    const answer = await trainerStep(ctx, {
      packet: () => ctx.handle.trainSpell(line.spellId),
      settled: ["trained", "refused", "unanswered"],
    });
    if (answer?.type === "trained") learned.push(spellName(line));
    else
      refused.push(
        answer?.state.lastOutcome?.reason ?? answer?.type ?? "no_answer",
      );
  }
  const change = moneyChange(ctx, before);
  const after = {
    ...baseAfter(ctx, npc, "train"),
    learned,
    money: change,
    spells: lines,
  };
  if (wanted.length === 0)
    return result("DONE", {
      after,
      detail: `nothing to learn from ${npcLabel(npc)} now.${nextLevelText(spells)}`,
    });
  const cost = change ? change.before - change.after : 0;
  const detail = `learned ${learned.length === 0 ? "nothing" : learned.join(", ")} for ${shortMoney(cost)}${moneyText(change)}.`;
  if (refused.length === 0) return result("DONE", { after, detail });
  return result(learned.length === 0 ? "FAILED" : "PARTLY", {
    after,
    detail: `${detail} Refused: ${refused.join(", ")}.`,
    reason: refused[0] ?? "refused",
  });
};

export const repairStep: InteractStep = async ({ ctx, npc }) => {
  if (!npc.unit.roles.includes("repair"))
    throw new Refusal({
      detail: `${npcLabel(npc)} does not repair.`,
      next: nextCall("look", { find: "repair" }),
      reason: "not_repairer",
    });
  const listed = await vendorStep(ctx, {
    packet: () => ctx.handle.openVendor(npc.guid),
    settled: ["listed", "refused", "unanswered"],
  });
  if (listed?.type !== "listed")
    throw new Refusal({
      detail: `${npcLabel(npc)} did not open a vendor window in 5 s.`,
      next: nextCall("interact", { do: "repair", npc: npc.unit.ref }),
      reason: "no_vendor_window",
      status: "UNCONFIRMED",
    });
  const before = ctx.handle.getInventoryState().coinage;
  const answer = await vendorStep(ctx, {
    packet: () => ctx.handle.repairAll(),
    settled: ["repaired", "refused", "unanswered"],
  });
  const change = moneyChange(ctx, before);
  const repairCost = change ? change.before - change.after : undefined;
  const after = { ...baseAfter(ctx, npc, "repair"), money: change, repairCost };
  if (answer?.type === "repaired")
    return result("DONE", {
      after,
      detail: `repaired all gear for ${shortMoney(repairCost ?? 0)}${moneyText(change)}.`,
    });
  const reason =
    answer?.state.lastOutcome?.reason ?? answer?.type ?? "no_answer";
  return result("FAILED", {
    after,
    detail: `${npcLabel(npc)} did not repair (${reason}).`,
    next: nextCall("journal", { about: "bags" }),
    reason,
  });
};
```

Then edit `packages/harness/src/tools/interact.ts`. Add this import after the `interact-quest` import:

```ts
import {
  repairStep,
  trainerExtra,
  trainStep,
} from "#harness/tools/interact-trainer";
```

Add `trainerExtra` as the last entry of `TALK_EXTRAS` (after B8 the line reads `const TALK_EXTRAS: TalkExtra[] = [vendorExtra, trainerExtra];`; without B8 it reads `[trainerExtra]`), and add these two entries at the end of the `STEPS` map:

```ts
  ["train", trainStep],
  ["repair", repairStep],
```

After B7, B8 and B9 the file is:

```ts
// packages/harness/src/tools/interact.ts
import type { InteractAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import { INTERACT_APPROACH_YD, TALK_RANGE_YD } from "#harness/ops/range";
import { Refusal } from "#harness/ops/refusal";
import { resolveUnit, unitRefusal } from "#harness/ops/resolve";
import { travelLeg } from "#harness/ops/travel-leg";
import {
  defineGameTool,
  type GameToolSpec,
  nextCall,
  result,
} from "#harness/tools/define";
import {
  acceptStep,
  baseAfter,
  gossipOf,
  gossipStep,
  type InteractStep,
  type NpcTarget,
  npcLabel,
  offerLine,
  offersOf,
  openDialog,
  type StepInit,
  type TalkExtra,
  turnInStep,
} from "#harness/tools/interact-quest";
import {
  repairStep,
  trainerExtra,
  trainStep,
} from "#harness/tools/interact-trainer";
import {
  buyStep,
  sellJunkStep,
  vendorExtra,
} from "#harness/tools/interact-vendor";
import { type InteractArgs, interactParams } from "#harness/tools/params";

const SHOP_ROLES = new Set([
  "vendor",
  "trainer",
  "class_trainer",
  "profession_trainer",
  "repair",
]);

function emptyInteract(): InteractAfter {
  return {
    action: "talk",
    bought: undefined,
    dialogOpened: false,
    freeSlots: undefined,
    gossip: [],
    learned: [],
    money: undefined,
    npc: {
      alive: true,
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
    },
    offers: [],
    repairCost: undefined,
    rewardChoices: [],
    roles: [],
    sold: [],
    spells: [],
    stock: [],
  };
}

const TALK_EXTRAS: TalkExtra[] = [vendorExtra, trainerExtra];

function talkNext(npc: NpcTarget, after: InteractAfter): string | undefined {
  const available = after.offers.find((offer) => offer.state === "available");
  if (available)
    return nextCall("interact", {
      do: "accept",
      npc: npc.unit.ref,
      what: String(available.line),
    });
  const ready = after.offers.find((offer) => offer.state === "ready");
  if (ready)
    return nextCall("interact", {
      do: "turn_in",
      npc: npc.unit.ref,
      what: String(ready.line),
    });
}

async function talkStep({
  ctx,
  npc,
}: StepInit): Promise<ToolResult<InteractAfter>> {
  const dialog = await openDialog(ctx, npc);
  const gossip = gossipOf(dialog);
  const offers = offersOf(dialog, ctx.handle.getQuestState());
  let after: InteractAfter = {
    ...baseAfter(ctx, npc, "talk"),
    dialogOpened: dialog !== undefined,
    gossip,
    offers,
  };
  const extra: string[] = [];
  for (const part of TALK_EXTRAS) {
    const added = await part({ ctx, npc });
    after = { ...after, ...added.after };
    extra.push(...added.lines);
  }
  const ready = offers
    .filter((offer) => offer.state === "ready")
    .map((offer) => `${offer.line}. ${offer.title} #${offer.id}`);
  const shop = npc.unit.roles.some((role) => SHOP_ROLES.has(role))
    ? ""
    : " Not a vendor or trainer.";
  const body = [
    ...offers.filter((offer) => offer.state !== "ready").map(offerLine),
    ...gossip.map((line) => `Gossip ${line.line}: ${line.text}`),
    ...extra,
    `Ready to turn in: ${ready.length === 0 ? "none" : ready.join(", ")}.${shop}`,
  ];
  const opened = dialog !== undefined || extra.length > 0;
  const detail = opened
    ? `${npcLabel(npc)} offers:`
    : `${npcLabel(npc)} opened no dialog in 3 s.`;
  return result("DONE", { after, body, detail, next: talkNext(npc, after) });
}

const STEPS = new Map<string, InteractStep>([
  ["talk", talkStep],
  ["accept", acceptStep],
  ["turn_in", turnInStep],
  ["gossip", gossipStep],
  ["buy", buyStep],
  ["sell_junk", sellJunkStep],
  ["train", trainStep],
  ["repair", repairStep],
]);

function findNpc(ctx: ToolCtx<InteractAfter>, text: string): NpcTarget {
  const resolved = resolveUnit(ctx, { alive: true, text });
  if (resolved.kind !== "unit")
    throw unitRefusal({ param: "npc", resolved, tool: "interact" });
  return { guid: resolved.guid, unit: resolved.unit };
}

async function approach(
  ctx: ToolCtx<InteractAfter>,
  npc: NpcTarget,
): Promise<void> {
  if ((npc.unit.distance ?? 0) <= TALK_RANGE_YD) return;
  const leg = await travelLeg(ctx, {
    goal: { guid: npc.guid, kind: "unit", name: npc.unit.name },
    within: INTERACT_APPROACH_YD,
  });
  if (leg.status !== "arrived")
    throw new Refusal({
      detail: `could not reach ${npcLabel(npc)}: ${leg.detail}.`,
      next: nextCall("travel", { to: npc.unit.ref }),
      reason: leg.reason ?? leg.status,
      status: "FAILED",
    });
}

async function runInteract(
  args: InteractArgs,
  ctx: ToolCtx<InteractAfter>,
): Promise<ToolResult<InteractAfter>> {
  const npc = findNpc(ctx, args.npc);
  const step = STEPS.get(args.do ?? "talk");
  if (!step) throw new Error("not_implemented");
  await approach(ctx, npc);
  try {
    return await step({ args, ctx, npc });
  } finally {
    await ctx.rt.mutex.run(() => ctx.handle.cancelInteraction());
  }
}

export const interactSpec: GameToolSpec<typeof interactParams, "interact"> = {
  fallback: emptyInteract,
  kind: "action",
  name: "interact",
  parameters: interactParams,
  run: runInteract,
};

export const interactTool = defineGameTool(interactSpec);
```

- [ ] **Step 4: Run the test and see it pass**

Run: `mise test packages/harness/src/tools/interact-trainer.test.ts packages/harness/src/tools/interact.test.ts`
Expected: PASS, 11 tests (5 new, the 6 of B7 still pass).

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/tools/interact-trainer.ts packages/harness/src/tools/interact-trainer.test.ts packages/harness/src/tools/interact.ts
mise exec -- git commit -F - <<'MSG'
feat: Add harness interact train and repair

Training and repair were hand work over window events before. One call
now learns every affordable spell or repairs all gear, settles on the
server's answer and reports what it cost.
MSG
```

---

## Task B10: `rest` tool

A tracked run of kind `rest` (design B.7): refuse when dead or when a unit attacks you; otherwise use each distinct `food_drink` item once (G11 `itemKind`), confirm it by an aura whose `spellId` is in the item's `useSpellIds` (settled on a combat `aura` event), and wait in 1 s steps until HP and mana reach `until` (default 90) or 30 s pass. With no food or drink it idles up to 30 s and says whether another `rest()` reaches the threshold (luna-usability LU.3 #3). A new attacker or death stops it (`watchInterrupts` with `newAttacker` and `death`). The wait counts its own 1 s steps, not the clock, so the fake-timer test is deterministic.

**Files**
- Modify: `packages/harness/src/tools/rest.ts` (A1 stub → full tool)
- Test: `packages/harness/src/tools/rest.test.ts`

**Interfaces**
- Consumes: `itemKind(label: ItemLabel): ItemKind` and `ItemLabel.useSpellIds` (C11); `CombatEvent` from `@tuicraft/core`; `pause(ms, signal)` from `@tuicraft/core/lib/abort`; `dangerView`, `watchInterrupts`, `InterruptCause` (A7); `settle` (A4); `poseView`, `selfView`, `unitViews`, `vitalsView` (A3); `guidHex` (A2); `awaitRun` (L3); `rt.runs` (F5a/L3); `defineGameTool`, `GameToolSpec`, `nextCall`, `result` (A1); `restParams`, `RestArgs` (A1)
- Produces:
  - `export const restSpec: GameToolSpec<typeof restParams, "rest">;`
  - `export const restTool: (rt: HarnessRuntime) => GameTool;`
  - Reason codes: `dead`, `in_combat`, `time_limit`, `interrupted`, `died`, `cancelled`

- [ ] **Step 1: Write the failing test**

```ts
// packages/harness/src/tools/rest.test.ts
import { describe, expect, jest, test } from "bun:test";
import type { RestAfter } from "#harness/contract/details";
import { restSpec } from "#harness/tools/rest";
import {
  attackBy,
  contentOf,
  limitProblem,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";

const STALKER = 0x20n;
const DRINK_SPELL = 430;

function water(handle: MockHandle, count: number): void {
  const inventory = handle.getInventoryState();
  const slot = {
    bag: 255,
    guid: 0x77n,
    item: {
      contained: undefined,
      count,
      durability: undefined,
      entry: 159,
      flags: 0,
      guid: 0x77n,
      itemClass: 0,
      maxDurability: undefined,
      name: "Refreshing Spring Water",
      owner: undefined,
      quality: 1,
      randomPropertyId: 0,
      subclass: 5,
      useSpellIds: [DRINK_SPELL],
    },
    region: "backpack" as const,
    slot: 23,
    status: "occupied" as const,
  };
  handle.getInventoryState = () => ({ ...inventory, slots: [slot] });
}

function drinkAura(handle: MockHandle): void {
  const state = handle.getCombatState();
  const aura = {
    caster: 0n,
    duration: 18_000,
    flags: 0,
    level: 1,
    slot: 0,
    spellId: DRINK_SPELL,
    stacks: 1,
    timeLeft: 18_000,
  };
  handle.triggerCombatEvent({
    state: { ...state, auras: [aura] },
    type: "aura",
  });
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

describe("rest", () => {
  test("drinks, confirms the aura and stops at the threshold", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { hp: 200, maxHp: 200, maxPower: 300, power: 60 });
    water(t.handle, 5);
    const used: number[] = [];
    t.handle.useItem = async (_bag, slot) => {
      used.push(slot);
      setSelf(t.handle, { hp: 200, maxHp: 200, maxPower: 300, power: 285 });
      water(t.handle, 4);
      drinkAura(t.handle);
    };
    const res = await restSpec.run({}, toolCtx<RestAfter>(t));
    const text = contentOf(res);
    expect(limitProblem(text)).toBeUndefined();
    expect(used).toEqual([23]);
    expect(text).toBe(
      "DONE rested 0 s with Refreshing Spring Water: HP 200/200, mana 95%. 4 food and drink left.",
    );
    expect(res.after).toMatchObject({ auraConfirmed: true, idle: false });
  });

  test("with no food it idles 30 s and says how far another rest gets", async () => {
    jest.useFakeTimers();
    try {
      const t = await createTestRuntime();
      setSelf(t.handle, { hp: 100, maxHp: 200, maxPower: 300, power: 150 });
      let done = false;
      const pending = restSpec.run({}, toolCtx<RestAfter>(t)).finally(() => {
        done = true;
      });
      for (let tick = 0; tick < 40 && !done; tick += 1) {
        jest.advanceTimersByTime(1000);
        await flush();
      }
      const res = await pending;
      expect(res).toMatchObject({
        after: { durationMs: 30_000, idle: true },
        reason: "time_limit",
        status: "PARTLY",
      });
      expect(res.detail).toBe(
        "rested 30 s without food or drink: HP 100/200, mana 50%. Another rest() will not reach 90% without food or drink.",
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test("an attacker stops the rest with an engage step", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { hp: 100, maxHp: 200 });
    setUnits(t.handle, [
      unitRow({
        distance: 5,
        guid: STALKER,
        level: 7,
        name: "Springpaw Stalker",
        x: 5,
        y: 0,
      }),
    ]);
    const pending = restSpec.run({}, toolCtx<RestAfter>(t));
    await Bun.sleep(5);
    attackBy(t.handle, STALKER);
    const res = await pending;
    expect(res).toMatchObject({ reason: "interrupted", status: "FAILED" });
    expect(res.detail).toMatch(
      /^Springpaw Stalker \(u\d+\) hit you while resting \(HP 100\/200, mana 100%\)\.$/,
    );
    expect(res.next).toMatch(/^engage\(target: "u\d+"\)$/);
  });

  test("refuses while an attacker is on you", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { hp: 100, maxHp: 200 });
    setUnits(t.handle, [
      unitRow({
        distance: 5,
        guid: STALKER,
        level: 7,
        name: "Springpaw Stalker",
        x: 5,
        y: 0,
      }),
    ]);
    attackBy(t.handle, STALKER);
    await expect(restSpec.run({}, toolCtx<RestAfter>(t))).rejects.toMatchObject(
      { reason: "in_combat" },
    );
  });

  test("refuses when dead", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "dead" });
    await expect(restSpec.run({}, toolCtx<RestAfter>(t))).rejects.toMatchObject(
      { next: "recover()", reason: "dead" },
    );
  });

  test("human text yields RUNNING with vitals", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { hp: 100, maxHp: 200 });
    const pending = restSpec.run({}, toolCtx<RestAfter>(t));
    t.rt.yields.trigger();
    const res = await pending;
    expect(res.status).toBe("RUNNING");
    expect(res.detail).toStartWith(
      "resting, 0 s so far. You: HP 100/200, mana 100%, at 0, 0.",
    );
    t.rt.runs.cancel(res.runId ?? "", "tool");
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/tools/rest.test.ts`
Expected: FAIL with `SyntaxError: Export named 'restSpec' not found in module`.

- [ ] **Step 3: Implement**

```ts
// packages/harness/src/tools/rest.ts
import { type CombatEvent, itemKind } from "@tuicraft/core";
import { pause } from "@tuicraft/core/lib/abort";
import { messageOf } from "@tuicraft/core/lib/errors";
import type { LootLine, RestAfter } from "#harness/contract/details";
import type { ToolResult, ToolStatus } from "#harness/contract/result";
import type { RunControl, RunEnd, RunStatus } from "#harness/contract/runs";
import type { OpsCtx, ToolCtx, ViewCtx } from "#harness/contract/services";
import {
  dangerView,
  type InterruptCause,
  watchInterrupts,
} from "#harness/ops/danger";
import { guidHex } from "#harness/ops/refs";
import { Refusal } from "#harness/ops/refusal";
import { settle } from "#harness/ops/settle";
import { poseView, selfView, unitViews, vitalsView } from "#harness/ops/views";
import { awaitRun } from "#harness/runs/wait";
import {
  defineGameTool,
  type GameToolSpec,
  nextCall,
  result,
} from "#harness/tools/define";
import { type RestArgs, restParams } from "#harness/tools/params";

type Report = ToolResult<RestAfter>;
type Consumable = {
  bag: number;
  slot: number;
  entry: number;
  name: string;
  quality: number | null;
  spellIds: number[];
};
type Levels = { hp: number; mana: number | undefined };
type Rested = {
  used: LootLine[];
  waitedMs: number;
  auraConfirmed: boolean;
  startLevels: Levels;
};

const DEFAULT_UNTIL = 90;
const REST_MAX_MS = 30_000;
const POLL_MS = 1000;
const AURA_MS = 3000;
const BAG_REGIONS = new Set(["backpack", "bag_item"]);
const HUMAN_WROTE = "The human wrote a message. Read it before you act.";
const RUN_STATUS: Record<ToolStatus, Exclude<RunStatus, "running">> = {
  DONE: "succeeded",
  FAILED: "failed",
  PARTLY: "partly",
  REFUSED: "failed",
  RUNNING: "succeeded",
  UNCONFIRMED: "failed",
};

function pct(value: number, max: number): number {
  return max > 0 ? Math.round((value / max) * 100) : 100;
}

function levelsOf(ctx: ViewCtx): Levels {
  const vitals = vitalsView(ctx);
  return {
    hp: pct(vitals.hp, vitals.maxHp),
    mana:
      vitals.powerKind === "mana"
        ? pct(vitals.power, vitals.maxPower)
        : undefined,
  };
}

function reached(levels: Levels, until: number): boolean {
  return (
    levels.hp >= until && (levels.mana === undefined || levels.mana >= until)
  );
}

function vitalsText(ctx: ViewCtx): string {
  const vitals = vitalsView(ctx);
  const { mana } = levelsOf(ctx);
  return `HP ${vitals.hp}/${vitals.maxHp}${mana === undefined ? "" : `, mana ${mana}%`}`;
}

function youLine(ctx: ViewCtx): string {
  const pose = poseView(ctx);
  return `You: ${vitalsText(ctx)}${pose ? `, at ${Math.round(pose.x)}, ${Math.round(pose.y)}` : ""}.`;
}

function consumables(ctx: ViewCtx): Consumable[] {
  const found = new Map<number, Consumable>();
  for (const slot of ctx.handle.getInventoryState().slots) {
    if (slot.status !== "occupied" || !BAG_REGIONS.has(slot.region)) continue;
    const { item } = slot;
    if (
      item.entry === undefined ||
      found.has(item.entry) ||
      itemKind(item) !== "food_drink"
    )
      continue;
    found.set(item.entry, {
      bag: slot.bag,
      entry: item.entry,
      name: item.name ?? `item ${item.entry}`,
      quality: item.quality,
      slot: slot.slot,
      spellIds: item.useSpellIds ?? [],
    });
  }
  return [...found.values()];
}

function itemsLeft(ctx: ViewCtx): number {
  return ctx.handle
    .getInventoryState()
    .slots.reduce(
      (sum, slot) =>
        slot.status === "occupied" &&
        BAG_REGIONS.has(slot.region) &&
        itemKind(slot.item) === "food_drink"
          ? sum + (slot.item.count ?? 1)
          : sum,
      0,
    );
}

async function useOne(ops: OpsCtx, item: Consumable): Promise<boolean> {
  try {
    const aura = await settle<CombatEvent>({
      match: (event) =>
        event.type === "aura" &&
        event.state.auras.some((known) =>
          item.spellIds.includes(known.spellId),
        ),
      send: async () => {
        await ops.rt.mutex.run(() => ops.handle.useItem(item.bag, item.slot));
      },
      signal: ops.signal,
      subscribe: (cb) => ops.handle.onCombatEvent(cb),
      timeoutMs: AURA_MS,
    });
    return aura !== undefined;
  } catch (error) {
    if (ops.signal.aborted) throw error;
    return false;
  }
}

async function rest(ops: OpsCtx, until: number, rested: Rested): Promise<void> {
  for (const item of consumables(ops)) {
    if (reached(levelsOf(ops), until)) break;
    const confirmed = await useOne(ops, item);
    rested.used.push({
      count: 1,
      itemId: item.entry,
      name: item.name,
      quality: item.quality,
    });
    rested.auraConfirmed ||= confirmed;
  }
  while (!reached(levelsOf(ops), until) && rested.waitedMs < REST_MAX_MS) {
    await pause(POLL_MS, ops.signal);
    rested.waitedMs += POLL_MS;
  }
}

function afterOf(ctx: ViewCtx, rested: Rested): RestAfter {
  const levels = levelsOf(ctx);
  return {
    auraConfirmed: rested.auraConfirmed,
    durationMs: rested.waitedMs,
    hpPct: levels.hp,
    idle: rested.used.length === 0,
    itemsLeft: itemsLeft(ctx),
    manaPct: levels.mana,
    used: rested.used,
  };
}

function projection(rested: Rested, now: Levels, until: number): string {
  const gainHp = now.hp - rested.startLevels.hp;
  const gainMana =
    now.mana === undefined || rested.startLevels.mana === undefined
      ? gainHp
      : now.mana - rested.startLevels.mana;
  const low = Math.min(
    now.hp + gainHp,
    now.mana === undefined ? 100 : now.mana + gainMana,
  );
  if (Math.min(gainHp, gainMana) <= 0)
    return ` Another rest() will not reach ${until}% without food or drink.`;
  return ` Another rest() reaches about ${Math.min(100, low)}%.`;
}

function doneReport(ctx: ViewCtx, rested: Rested, until: number): Report {
  const after = afterOf(ctx, rested);
  const secs = Math.round(rested.waitedMs / 1000);
  const how = after.idle
    ? "without food or drink"
    : `with ${rested.used.map((item) => item.name).join(" and ")}`;
  const left = after.idle ? "" : ` ${after.itemsLeft} food and drink left.`;
  const detail = `rested ${secs} s ${how}: ${vitalsText(ctx)}.${left}`;
  if (reached(levelsOf(ctx), until)) return result("DONE", { after, detail });
  const hint = after.idle ? projection(rested, levelsOf(ctx), until) : "";
  return result("PARTLY", {
    after,
    detail: `${detail}${hint}`,
    next: nextCall("rest"),
    reason: "time_limit",
  });
}

function attackerName(ctx: ViewCtx, guid: bigint): string {
  const ref = ctx.rt.refs.refOf(guid);
  const unit = unitViews(ctx).find((view) => view.guid === guidHex(guid));
  return `${unit?.name ?? ctx.rt.sightings.get(guid)?.name ?? "something"} (${ref})`;
}

function stoppedReport(init: {
  ctx: ViewCtx;
  signal: AbortSignal;
  cause: InterruptCause | undefined;
  after: RestAfter;
}): Report {
  const { ctx, signal, cause, after } = init;
  if (cause?.code === "died")
    return result("FAILED", {
      after,
      detail: "you died while resting.",
      next: nextCall("recover"),
      reason: "died",
    });
  if (cause?.attacker !== undefined)
    return result("FAILED", {
      after,
      detail: `${attackerName(ctx, cause.attacker)} hit you while resting (${vitalsText(ctx)}).`,
      next: nextCall("engage", { target: ctx.rt.refs.refOf(cause.attacker) }),
      reason: "interrupted",
    });
  const code = messageOf(signal.reason, "cancelled");
  if (code === "human_stop" || code === "esc")
    return result("FAILED", {
      after,
      detail: "the human stopped you. Start nothing new.",
      next: "end your turn and wait for the human.",
      reason: "cancelled",
    });
  return result("FAILED", {
    after,
    detail: `the rest was stopped (${code}).`,
    next: nextCall("look"),
    reason: "cancelled",
  });
}

function runEnd(value: Report, stop?: string): RunEnd<Report> {
  const status = stop === undefined ? RUN_STATUS[value.status] : "cancelled";
  return {
    reason: stop ?? value.reason,
    status:
      value.reason === "interrupted" || value.reason === "died"
        ? "interrupted"
        : status,
    summary: `${value.status} ${value.detail}`,
    value,
  };
}

async function launch(init: {
  ctx: ToolCtx<RestAfter>;
  until: number;
  control: RunControl;
  rested: Rested;
}): Promise<RunEnd<Report>> {
  const { ctx, until, control, rested } = init;
  const watch = watchInterrupts(
    { ...ctx, progress: control.progress, signal: control.signal },
    { death: true, newAttacker: true, rooted: false },
  );
  const ops: OpsCtx = {
    ...ctx,
    progress: control.progress,
    signal: AbortSignal.any([control.signal, watch.signal]),
  };
  try {
    await rest(ops, until, rested);
    return runEnd(doneReport(ops, rested, until));
  } catch (error) {
    if (!ops.signal.aborted) throw error;
    const stop = control.signal.aborted
      ? messageOf(control.signal.reason)
      : undefined;
    return runEnd(
      stoppedReport({
        after: afterOf(ops, rested),
        cause: watch.cause(),
        ctx: ops,
        signal: ops.signal,
      }),
      stop,
    );
  } finally {
    watch.dispose();
  }
}

function precheck(ctx: ToolCtx<RestAfter>, until: number): Report | undefined {
  const self = selfView(ctx);
  if (self.life !== "alive")
    throw new Refusal({
      detail: "you are dead; rest after you recover.",
      next: nextCall("recover"),
      reason: "dead",
    });
  const [attacker] = dangerView(ctx).attackers;
  if (attacker)
    throw new Refusal({
      detail: `${attacker.name} (${attacker.ref}) is attacking you; you cannot rest in combat.`,
      next: nextCall("engage", { target: attacker.ref }),
      reason: "in_combat",
    });
  const levels = levelsOf(ctx);
  if (!reached(levels, until)) return;
  const rested: Rested = {
    auraConfirmed: false,
    startLevels: levels,
    used: [],
    waitedMs: 0,
  };
  return result("DONE", {
    after: afterOf(ctx, rested),
    detail: `no rest needed: ${vitalsText(ctx)}.`,
  });
}

function emptyRest(): RestAfter {
  return {
    auraConfirmed: false,
    durationMs: 0,
    hpPct: 0,
    idle: true,
    itemsLeft: 0,
    manaPct: undefined,
    used: [],
  };
}

async function runRest(
  args: RestArgs,
  ctx: ToolCtx<RestAfter>,
): Promise<Report> {
  const until = args.until ?? DEFAULT_UNTIL;
  const ready = precheck(ctx, until);
  if (ready) return ready;
  const rested: Rested = {
    auraConfirmed: false,
    startLevels: levelsOf(ctx),
    used: [],
    waitedMs: 0,
  };
  const run = ctx.rt.runs.start<Report>({
    args,
    kind: "rest",
    launch: (control) => launch({ control, ctx, rested, until }),
    toolCallId: ctx.toolCallId,
  });
  const waited = await awaitRun({ rt: ctx.rt, run });
  if (waited.kind === "ended") return { ...waited.end.value, runId: run.id };
  return result("RUNNING", {
    after: afterOf(ctx, rested),
    body: waited.why === "human" ? [HUMAN_WROTE] : [],
    detail: `resting, ${Math.round(rested.waitedMs / 1000)} s so far. ${youLine(ctx)}`,
    next: `end your turn; a [game] message comes when ${run.id} ends. Or ${nextCall("stop", { run: run.id })}.`,
    runId: run.id,
  });
}

export const restSpec: GameToolSpec<typeof restParams, "rest"> = {
  fallback: emptyRest,
  kind: "run",
  name: "rest",
  parameters: restParams,
  run: runRest,
};

export const restTool = defineGameTool(restSpec);
```

- [ ] **Step 4: Run the test and see it pass**

Run: `mise test packages/harness/src/tools/rest.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/tools/rest.ts packages/harness/src/tools/rest.test.ts
mise exec -- git commit -F - <<'MSG'
feat: Add the harness rest tool

Resting was a loop of item uses and waits that the model had to run by
hand. One call now eats and drinks, confirms the aura, waits to the
threshold and stops at once when a unit attacks.
MSG
```

---

## Task B11: `recover` tool

A tracked run of kind `recover` (design B.8) over `recoverOp`: the corpse run (default), the nearest spirit healer, or an accepted resurrection offer. It refuses while alive or while the life state is unknown, always names the ways it did not use, and maps the B4 cause `too_far` to `REFUSED too_far` with `Next: recover()` (issue 6).

**Files**
- Modify: `packages/harness/src/tools/recover.ts` (A1 stub → full tool)
- Test: `packages/harness/src/tools/recover.test.ts`

**Interfaces**
- Consumes: `recoverOp`, `RecoverHow`, `RecoverOpResult` (B4); `watchInterrupts` (A7); `poseView`, `selfView`, `vitalsView` (A3); `awaitRun` (L3); `defineGameTool`, `GameToolSpec`, `askHuman`, `nextCall`, `result` (A1); `recoverParams`, `RecoverArgs` (A1)
- Produces:
  - `export const recoverSpec: GameToolSpec<typeof recoverParams, "recover">;`
  - `export const recoverTool: (rt: HarnessRuntime) => GameTool;`
  - Reason codes: `alive`, `life_unknown`, `too_far`, `cancelled`, and the B4 causes (`corpse_unreachable`, `release_unanswered`, `not_implemented`, …)

- [ ] **Step 1: Write the failing test**

```ts
// packages/harness/src/tools/recover.test.ts
import { describe, expect, test } from "bun:test";
import type { RecoverAfter } from "#harness/contract/details";
import { recoverSpec } from "#harness/tools/recover";
import {
  attackBy,
  contentOf,
  limitProblem,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

const HEALER = 0x40n;
const LYNX = 0x21n;

function healerAt(distance: number) {
  return unitRow({
    distance,
    guid: HEALER,
    name: "Spirit Healer",
    relation: "friendly",
    roles: ["spirit_healer"],
    x: 0,
    y: distance,
  });
}

describe("recover", () => {
  test("corpse run: alive again at the corpse", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { hp: 0, life: "ghost", maxHp: 217 });
    t.handle.recoverCorpse = async () => {
      setSelf(t.handle, {
        hp: 108,
        life: "alive",
        maxHp: 217,
        x: 8766,
        y: -6560,
      });
      return { detail: { legs: 3 }, ok: true, outcome: "reclaimed" };
    };
    const res = await recoverSpec.run({}, toolCtx<RecoverAfter>(t));
    const text = contentOf(res);
    expect(limitProblem(text)).toBeUndefined();
    expect(text).toBe(
      "DONE alive again at your corpse (8766, -6560) after 0 s. HP 108/217.",
    );
  });

  test("unreachable corpse names the other ways and steps to the healer", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "ghost" });
    setUnits(t.handle, [healerAt(34)]);
    t.handle.recoverCorpse = async () => ({
      cause: "corpse_unreachable",
      detail: { legs: 3 },
      ok: false,
    });
    const res = await recoverSpec.run({}, toolCtx<RecoverAfter>(t));
    const text = contentOf(res);
    expect(limitProblem(text)).toBeUndefined();
    expect(res).toMatchObject({
      next: 'recover(how: "spirit_healer")',
      reason: "corpse_unreachable",
      status: "FAILED",
    });
    expect(res.body[0]).toMatch(
      /^Other ways: Spirit healer u\d+ 34 yd.* \(resurrection sickness\)\. No resurrection offer\.$/,
    );
  });

  test("spirit healer out of range refuses with the corpse path", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "ghost" });
    setUnits(t.handle, [healerAt(20)]);
    const res = await recoverSpec.run(
      { how: "spirit_healer" },
      toolCtx<RecoverAfter>(t),
    );
    expect(res).toMatchObject({
      next: "recover()",
      reason: "too_far",
      status: "REFUSED",
    });
  });

  test("refuses while alive", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    await expect(
      recoverSpec.run({}, toolCtx<RecoverAfter>(t)),
    ).rejects.toMatchObject({ reason: "alive" });
  });

  test("a new attacker stops the recovery with FAILED interrupted", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "ghost" });
    setUnits(t.handle, [
      unitRow({
        distance: 8,
        guid: LYNX,
        level: 6,
        name: "Springpaw Lynx",
        x: 8,
        y: 0,
      }),
    ]);
    t.handle.recoverCorpse = (signal) =>
      new Promise((resolve) => {
        signal.addEventListener(
          "abort",
          () => resolve({ cause: "stopped", ok: false }),
          { once: true },
        );
      });
    const pending = recoverSpec.run({}, toolCtx<RecoverAfter>(t));
    await Bun.sleep(0);
    attackBy(t.handle, LYNX);
    const res = await pending;
    expect(res).toMatchObject({ reason: "interrupted", status: "FAILED" });
    expect(res.next).toMatch(/^engage\(target: "u\d+"\)$/);
    expect(limitProblem(contentOf(res))).toBeUndefined();
  });

  test("human text yields RUNNING and the recovery goes on", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "ghost" });
    t.handle.recoverCorpse = (signal) =>
      new Promise((resolve) => {
        signal.addEventListener(
          "abort",
          () => resolve({ cause: "stopped", ok: false }),
          { once: true },
        );
      });
    const pending = recoverSpec.run({}, toolCtx<RecoverAfter>(t));
    t.rt.yields.trigger();
    const res = await pending;
    expect(res.status).toBe("RUNNING");
    expect(res.body).toEqual([
      "The human wrote a message. Read it before you act.",
    ]);
    expect(t.rt.runs.active()?.id).toBe(res.runId);
    t.rt.runs.cancel(res.runId ?? "", "tool");
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/tools/recover.test.ts`
Expected: FAIL with `SyntaxError: Export named 'recoverSpec' not found in module`.

- [ ] **Step 3: Implement**

```ts
// packages/harness/src/tools/recover.ts
import { messageOf } from "@tuicraft/core/lib/errors";
import type { RecoverAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { RunControl, RunEnd } from "#harness/contract/runs";
import type { OpsCtx, ToolCtx, ViewCtx } from "#harness/contract/services";
import { type InterruptCause, watchInterrupts } from "#harness/ops/danger";
import {
  type RecoverHow,
  type RecoverOpResult,
  recoverOp,
} from "#harness/ops/recover";
import { Refusal } from "#harness/ops/refusal";
import { poseView, selfView, vitalsView } from "#harness/ops/views";
import { awaitRun } from "#harness/runs/wait";
import {
  askHuman,
  defineGameTool,
  type GameToolSpec,
  nextCall,
  result,
} from "#harness/tools/define";
import { type RecoverArgs, recoverParams } from "#harness/tools/params";

type Report = ToolResult<RecoverAfter>;

const HOWS = new Map<string, RecoverHow>([
  ["corpse", "corpse"],
  ["spirit_healer", "spirit_healer"],
  ["accept", "accept"],
]);
const HUMAN_WROTE = "The human wrote a message. Read it before you act.";

function sentence(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function whereText(ctx: ViewCtx): string {
  const pose = poseView(ctx);
  return pose ? ` (${Math.round(pose.x)}, ${Math.round(pose.y)})` : "";
}

function afterOf(
  ctx: ViewCtx,
  op: RecoverOpResult | undefined,
  durationMs: number,
): RecoverAfter {
  const vitals = vitalsView(ctx);
  return {
    alive: selfView(ctx).life === "alive",
    alternatives: op?.alternatives ?? [],
    corpseYd: op?.corpseYd,
    durationMs,
    hp: vitals.hp,
    legs: op?.legs ?? 0,
    maxHp: vitals.maxHp,
    pose: poseView(ctx),
    via: op?.via ?? "corpse",
  };
}

function viaText(via: RecoverHow, ctx: ViewCtx): string {
  if (via === "corpse") return `at your corpse${whereText(ctx)}`;
  if (via === "spirit_healer") return `at the spirit healer${whereText(ctx)}`;
  return `where you died${whereText(ctx)}`;
}

function failedReport(op: RecoverOpResult, after: RecoverAfter): Report {
  const cause = op.outcome.ok ? "failed" : op.outcome.cause;
  const others = `Other ways: ${op.alternatives.map(sentence).join(". ")}.`;
  if (cause === "too_far")
    return result("REFUSED", {
      after,
      body: [others],
      detail:
        "the spirit healer is too far; it must be within 5 yd, and a ghost cannot use the path planner.",
      next: nextCall("recover"),
      reason: "too_far",
    });
  const healer = op.alternatives.some((text) =>
    text.startsWith("spirit healer"),
  );
  const where =
    op.corpseYd === undefined
      ? ""
      : `, still ${Math.round(op.corpseYd)} yd from your corpse`;
  return result("FAILED", {
    after,
    body: [others],
    detail: `${op.legs} legs${where} (${cause}).`,
    next: healer
      ? nextCall("recover", { how: "spirit_healer" })
      : askHuman("I cannot get back to life. What should I do?"),
    reason: cause,
  });
}

function report(ctx: ViewCtx, op: RecoverOpResult, durationMs: number): Report {
  const after = afterOf(ctx, op, durationMs);
  if (!op.outcome.ok) return failedReport(op, after);
  return result("DONE", {
    after,
    detail: `alive again ${viaText(op.via, ctx)} after ${Math.round(durationMs / 1000)} s. HP ${after.hp}/${after.maxHp}.`,
  });
}

function stopReport(
  ctx: ViewCtx,
  signal: AbortSignal,
  durationMs: number,
): Report {
  const code = messageOf(signal.reason, "cancelled");
  const after = afterOf(ctx, undefined, durationMs);
  if (code === "human_stop" || code === "esc")
    return result("FAILED", {
      after,
      detail: "the human stopped you. Start nothing new.",
      next: "end your turn and wait for the human.",
      reason: "cancelled",
    });
  return result("FAILED", {
    after,
    detail: `the recovery was stopped (${code}).`,
    next: nextCall("recover"),
    reason: "cancelled",
  });
}

function interruptEnd(
  ctx: ViewCtx,
  cause: InterruptCause,
  durationMs: number,
): RunEnd<Report> {
  const ref =
    cause.attacker === undefined
      ? undefined
      : ctx.rt.refs.refOf(cause.attacker);
  const value = result("FAILED", {
    after: afterOf(ctx, undefined, durationMs),
    detail: `${cause.detail} The recovery stopped.`,
    next: ref ? nextCall("engage", { target: ref }) : nextCall("look"),
    reason: "interrupted",
  });
  return {
    reason: "interrupted",
    status: "interrupted",
    summary: `${value.status} ${value.detail}`,
    value,
  };
}

async function launch(init: {
  ctx: ToolCtx<RecoverAfter>;
  how: RecoverHow;
  control: RunControl;
}): Promise<RunEnd<Report>> {
  const { ctx, how, control } = init;
  const startedAt = ctx.rt.clock.now();
  const rules = { death: false, newAttacker: true, rooted: false };
  const watch = watchInterrupts(
    { ...ctx, progress: control.progress, signal: control.signal },
    rules,
  );
  const ops: OpsCtx = {
    ...ctx,
    progress: control.progress,
    signal: AbortSignal.any([control.signal, watch.signal]),
  };
  try {
    const op = await recoverOp(ops, how);
    const cause = watch.cause();
    if (cause) return interruptEnd(ops, cause, ctx.rt.clock.now() - startedAt);
    const value = report(ops, op, ctx.rt.clock.now() - startedAt);
    const status = op.outcome.ok ? "succeeded" : "failed";
    return {
      reason: value.reason,
      status,
      summary: `${value.status} ${value.detail}`,
      value,
    };
  } catch (error) {
    const cause = watch.cause();
    if (!control.signal.aborted && cause)
      return interruptEnd(ops, cause, ctx.rt.clock.now() - startedAt);
    if (!control.signal.aborted) throw error;
    const value = stopReport(
      ops,
      control.signal,
      ctx.rt.clock.now() - startedAt,
    );
    return {
      reason: messageOf(control.signal.reason),
      status: "cancelled",
      summary: `${value.status} ${value.detail}`,
      value,
    };
  } finally {
    watch.dispose();
  }
}

function emptyRecover(): RecoverAfter {
  return {
    alive: false,
    alternatives: [],
    corpseYd: undefined,
    durationMs: 0,
    hp: undefined,
    legs: 0,
    maxHp: undefined,
    pose: undefined,
    via: "corpse",
  };
}

async function runRecover(
  args: RecoverArgs,
  ctx: ToolCtx<RecoverAfter>,
): Promise<Report> {
  const { life } = selfView(ctx);
  if (life === "alive")
    throw new Refusal({
      detail: "you are alive; there is nothing to recover.",
      next: nextCall("look"),
      reason: "alive",
    });
  if (life === "unknown")
    throw new Refusal({
      detail: "your life state is not known yet.",
      next: askHuman("Am I dead? The game has not told me yet."),
      reason: "life_unknown",
    });
  const how = HOWS.get(args.how ?? "corpse") ?? "corpse";
  const run = ctx.rt.runs.start<Report>({
    args,
    kind: "recover",
    launch: (control) => launch({ control, ctx, how }),
    toolCallId: ctx.toolCallId,
  });
  const waited = await awaitRun({ rt: ctx.rt, run });
  if (waited.kind === "ended") return { ...waited.end.value, runId: run.id };
  const vitals = vitalsView(ctx);
  return result("RUNNING", {
    after: afterOf(ctx, undefined, 0),
    body: waited.why === "human" ? [HUMAN_WROTE] : [],
    detail: `recover by ${how.replace("_", " ")}. You: ${selfView(ctx).life}, HP ${vitals.hp}/${vitals.maxHp}${whereText(ctx)}.`,
    next: `end your turn; a [game] message comes when ${run.id} ends. Or ${nextCall("stop", { run: run.id })}.`,
    runId: run.id,
  });
}

export const recoverSpec: GameToolSpec<typeof recoverParams, "recover"> = {
  fallback: emptyRecover,
  kind: "run",
  name: "recover",
  parameters: recoverParams,
  run: runRecover,
};

export const recoverTool = defineGameTool(recoverSpec);
```

- [ ] **Step 4: Run the test and see it pass**

Run: `mise test packages/harness/src/tools/recover.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/tools/recover.ts packages/harness/src/tools/recover.test.ts
mise exec -- git commit -F - <<'MSG'
feat: Add the harness recover tool

After a death the model needs one call that brings the character back
by the cycle's tested corpse path. When that fails, the result names the
spirit healer and any resurrection offer as the other ways.
MSG
```

---

## Task B12: `engage` target choice and guards

The first half of `engage` (design B.4 steps 1–2, K5, D11): the guards before any run (dead; another attacker when the target is not that attacker; under 50 % HP or 30 % mana before a pull, mana only for a mana class; no Jev key when `capabilities()` says so; an unknown quest), and, inside the run, the target choice: a named target (explores up to 3 times when not seen, skips the level cap), the attacker when one is on you, else the nearest hostile unit at most 3 levels above you that no other player tapped (explores up to 3 times; `too_strong` with conditional text and no `Next:` when only stronger units are in view). A pull while a unit attacks you is a defence, so it skips the HP and mana guard (otherwise `engage` refuses `low_health` and `rest` refuses `in_combat`, and the model has no way out). The fight itself is B13; until B13 lands, the run returns `FAILED not_implemented`.

**Files**
- Create: `packages/harness/src/tools/engage-choose.ts`
- Modify: `packages/harness/src/tools/engage.ts` (A1 stub → run plumbing with a `notBuilt` fight)
- Test: `packages/harness/src/tools/engage-choose.test.ts`, `packages/harness/src/tools/engage.test.ts`

**Interfaces**
- Consumes: `explore` (B2); `resolveUnit`, `unitRefusal`, `selfView`, `unitViews`, `vitalsView`, `poseView` (A3); `dangerView`, `watchInterrupts`, `InterruptCause` (A7); `awaitRun` (L3); `defineGameTool`, `GameToolSpec`, `askHuman`, `nextCall`, `result` (A1); `engageParams`, `EngageArgs` (A1); `capabilities()` (C0, body C2); `getQuestState()` (core)
- Produces (`engage-choose.ts`):
  - `export type EngageMode = EngageAfter["mode"];`
  - `export type Choice = { mode: EngageMode; unit: UnitView | undefined; guid: bigint | undefined; named: boolean; questId: number | undefined; sources: number[]; wanted: number };`
  - `export type FightInit = { ops: OpsCtx; choice: Choice; args: EngageArgs; control: RunControl; cause: () => InterruptCause | undefined; progress: (after: EngageAfter) => void };`
  - `export type FightRun = (init: FightInit) => Promise<ToolResult<EngageAfter>>;`
  - `export const LEVEL_CAP_ABOVE = 3;`, `export const MIN_HP_PCT = 50;`, `export const MIN_MANA_PCT = 30;`, `export const EXPLORE_TRIES = 3;`
  - `export function sameArgs(args: EngageArgs): string;`
  - `export function parseQuest(ctx: ViewCtx, text: string): number;`
  - `export function chooseTarget(ops: OpsCtx, args: EngageArgs): Promise<Choice>;`
  - `export function guardPull(ctx: ToolCtx<EngageAfter>, args: EngageArgs): void;`
  - `export function checkHelper(ctx: ToolCtx<EngageAfter>): void;`
- Produces (`engage.ts`): `export function emptyEngage(): EngageAfter;`, `export const engageSpec: GameToolSpec<typeof engageParams, "engage">;`, `export const engageTool`
- Reason codes: `dead`, `other_attacker`, `low_health`, `low_mana`, `no_combat_helper`, `unknown_quest`, `too_strong`, `friendly`, `not_seen`, `ambiguous_unit` (A3), `not_implemented` (until B13)

- [ ] **Step 1: Write the failing tests**

```ts
// packages/harness/src/tools/engage-choose.test.ts
import { describe, expect, test } from "bun:test";
import type { EngageAfter } from "#harness/contract/details";
import {
  checkHelper,
  chooseTarget,
  guardPull,
  parseQuest,
} from "#harness/tools/engage-choose";
import {
  attackBy,
  driveGoto,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";

const STALKER = 0x20n;
const LYNX = 0x21n;

function stalker(distance = 22) {
  return unitRow({
    distance,
    entry: 15_366,
    guid: STALKER,
    level: 7,
    name: "Springpaw Stalker",
    x: distance,
    y: 0,
  });
}

const lynx = unitRow({
  distance: 30,
  guid: LYNX,
  level: 5,
  name: "Springpaw Lynx",
  x: 30,
  y: 0,
});

function questLog(handle: MockHandle, questId: number): void {
  const state = handle.getQuestState();
  const counters: [number, number, number, number] = [0, 0, 0, 0];
  handle.getQuestState = () => ({
    ...state,
    log: {
      complete: true,
      slots: [{ counters, expiresAtSeconds: 0, flags: 0, questId, slot: 0 }],
    },
  });
}

async function field(level: number) {
  const t = await createTestRuntime();
  setSelf(t.handle, { level });
  setUnits(t.handle, [stalker(), lynx]);
  return t;
}

describe("chooseTarget", () => {
  test("unnamed: the nearest hostile at most 3 levels above you", async () => {
    const t = await field(5);
    const choice = await chooseTarget(toolCtx<EngageAfter>(t), {});
    expect(choice).toMatchObject({
      guid: STALKER,
      mode: "single",
      named: false,
      wanted: 1,
    });
  });

  test("unnamed: a unit another player tapped is never chosen", async () => {
    const t = await field(5);
    setUnits(t.handle, [
      unitRow({
        distance: 10,
        entry: 15_366,
        guid: STALKER,
        level: 7,
        name: "Springpaw Stalker",
        tappedByOther: true,
        x: 10,
        y: 0,
      }),
      lynx,
    ]);
    const choice = await chooseTarget(toolCtx<EngageAfter>(t), {});
    expect(choice).toMatchObject({ guid: LYNX, named: false });
  });

  test("unnamed: only stronger units refuses too_strong with conditional text", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { level: 1 });
    setUnits(t.handle, [stalker()]);
    const refused = chooseTarget(toolCtx<EngageAfter>(t), {});
    await expect(refused).rejects.toMatchObject({
      next: undefined,
      reason: "too_strong",
    });
    await expect(refused).rejects.toHaveProperty(
      "detail",
      expect.stringMatching(
        /^Springpaw Stalker u\d+ is L7, 6 levels above you\. If the human asked for this fight: engage\(target: "u\d+"\)\.$/,
      ),
    );
  });

  test("a named target skips the level cap", async () => {
    const t = await field(1);
    const choice = await chooseTarget(toolCtx<EngageAfter>(t), {
      target: "Springpaw Stalker",
    });
    expect(choice).toMatchObject({ guid: STALKER, named: true });
  });

  test("a named target not seen yet explores until it comes into view", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { level: 10 });
    setUnits(t.handle, []);
    const goTo = driveGoto(t.handle, [
      {
        arrive: { x: 20, y: 0 },
        onArrive: () => setUnits(t.handle, [stalker()]),
      },
    ]);
    const choice = await chooseTarget(toolCtx<EngageAfter>(t), {
      target: "Springpaw Stalker",
    });
    expect(choice.guid).toBe(STALKER);
    expect(goTo).toHaveBeenCalledTimes(1);
  });

  test("count above 1 is a cycle over that kind of creature", async () => {
    const t = await field(10);
    const choice = await chooseTarget(toolCtx<EngageAfter>(t), {
      count: 3,
      target: "Springpaw Stalker",
    });
    expect(choice).toMatchObject({ mode: "cycle", wanted: 3 });
  });

  test("quest by id: the named creature is the one item source", async () => {
    const t = await field(10);
    questLog(t.handle, 8325);
    const bare = await chooseTarget(toolCtx<EngageAfter>(t), { quest: "8325" });
    expect(bare).toMatchObject({
      mode: "quest",
      questId: 8325,
      sources: [],
      unit: undefined,
    });
    const named = await chooseTarget(toolCtx<EngageAfter>(t), {
      quest: "#8325",
      target: "Springpaw Stalker",
    });
    expect(named).toMatchObject({
      mode: "quest",
      questId: 8325,
      sources: [15_366],
    });
  });

  test("an unknown quest refuses with the quest log", async () => {
    const t = await field(10);
    questLog(t.handle, 8325);
    expect(() => parseQuest(toolCtx<EngageAfter>(t), "9999")).toThrow(
      expect.objectContaining({
        body: ["#8325 (title not loaded)"],
        reason: "unknown_quest",
      }),
    );
  });
});

describe("guardPull", () => {
  test("under 50% HP refuses with rest, then the same call", async () => {
    const t = await field(10);
    setSelf(t.handle, { hp: 80, level: 10, maxHp: 200 });
    expect(() =>
      guardPull(toolCtx<EngageAfter>(t), { target: "Springpaw Stalker" }),
    ).toThrow(
      expect.objectContaining({
        next: 'rest(), then engage(target: "Springpaw Stalker")',
        reason: "low_health",
      }),
    );
  });

  test("a rage class is never refused for low power", async () => {
    const t = await field(10);
    setSelf(t.handle, { level: 10, maxPower: 100, power: 0, powerType: 1 });
    expect(() => guardPull(toolCtx<EngageAfter>(t), {})).not.toThrow();
  });

  test("another attacker must be fought first", async () => {
    const t = await field(10);
    attackBy(t.handle, LYNX);
    expect(() =>
      guardPull(toolCtx<EngageAfter>(t), { target: "Springpaw Stalker" }),
    ).toThrow(
      expect.objectContaining({
        next: expect.stringMatching(/^engage\(target: "u\d+"\)$/),
        reason: "other_attacker",
      }),
    );
  });

  test("defending against the attacker skips the HP guard", async () => {
    const t = await field(10);
    setSelf(t.handle, { hp: 60, level: 10, maxHp: 200 });
    attackBy(t.handle, STALKER);
    expect(() => guardPull(toolCtx<EngageAfter>(t), {})).not.toThrow();
  });
});

describe("checkHelper", () => {
  test("no Jev key refuses no_combat_helper", async () => {
    const t = await field(10);
    t.handle.capabilities = () => ({
      factions: true,
      jev: false,
      navigation: true,
      spells: true,
    });
    expect(() => checkHelper(toolCtx<EngageAfter>(t))).toThrow(
      expect.objectContaining({ reason: "no_combat_helper" }),
    );
  });

  test("capabilities not built yet lets the fight try", async () => {
    const t = await field(10);
    t.handle.capabilities = () => {
      throw new Error("not_implemented");
    };
    expect(() => checkHelper(toolCtx<EngageAfter>(t))).not.toThrow();
  });
});
```

```ts
// packages/harness/src/tools/engage.test.ts
import { describe, expect, test } from "bun:test";
import type { EngageAfter } from "#harness/contract/details";
import { engageSpec } from "#harness/tools/engage";
import {
  contentOf,
  limitProblem,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

const stalker = unitRow({
  distance: 22,
  guid: 0x20n,
  level: 7,
  name: "Springpaw Stalker",
  x: 22,
  y: 0,
});

describe("engage", () => {
  test("refuses when dead", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "dead" });
    await expect(
      engageSpec.run({}, toolCtx<EngageAfter>(t)),
    ).rejects.toMatchObject({ next: "recover()", reason: "dead" });
  });

  test("refuses a pull under 30% mana before any run starts", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { maxPower: 300, power: 60 });
    setUnits(t.handle, [stalker]);
    await expect(
      engageSpec.run({}, toolCtx<EngageAfter>(t)),
    ).rejects.toMatchObject({ reason: "low_mana" });
    expect(t.rt.runs.list()).toHaveLength(0);
  });

  test("a choice refusal inside the run comes back as a REFUSED result", async () => {
    const t = await createTestRuntime();
    t.handle.capabilities = () => ({ factions: true, jev: true, navigation: true, spells: true });
    setSelf(t.handle, { level: 1 });
    setUnits(t.handle, [stalker]);
    const res = await engageSpec.run({}, toolCtx<EngageAfter>(t));
    const text = contentOf(res);
    expect(limitProblem(text)).toBeUndefined();
    expect(res).toMatchObject({
      next: undefined,
      reason: "too_strong",
      status: "REFUSED",
    });
    expect(res.runId).toBe(t.rt.runs.list()[0]?.id);
  });
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `mise test packages/harness/src/tools/engage-choose.test.ts packages/harness/src/tools/engage.test.ts`
Expected: FAIL with `Cannot find module '#harness/tools/engage-choose'` and `SyntaxError: Export named 'engageSpec' not found in module`.

- [ ] **Step 3: Implement**

```ts
// packages/harness/src/tools/engage-choose.ts
import type { EngageAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { RunControl } from "#harness/contract/runs";
import type { OpsCtx, ToolCtx, ViewCtx } from "#harness/contract/services";
import type { UnitView } from "#harness/contract/views";
import { dangerView, type InterruptCause } from "#harness/ops/danger";
import { explore } from "#harness/ops/explore";
import { Refusal } from "#harness/ops/refusal";
import { resolveUnit, unitRefusal } from "#harness/ops/resolve";
import { selfView, unitViews, vitalsView } from "#harness/ops/views";
import { askHuman, nextCall } from "#harness/tools/define";
import type { EngageArgs } from "#harness/tools/params";

export type EngageMode = EngageAfter["mode"];
export type Choice = {
  mode: EngageMode;
  unit: UnitView | undefined;
  guid: bigint | undefined;
  named: boolean;
  questId: number | undefined;
  sources: number[];
  wanted: number;
};

export type FightInit = {
  ops: OpsCtx;
  choice: Choice;
  args: EngageArgs;
  control: RunControl;
  cause: () => InterruptCause | undefined;
  progress: (after: EngageAfter) => void;
};
export type FightRun = (init: FightInit) => Promise<ToolResult<EngageAfter>>;

export const LEVEL_CAP_ABOVE = 3;
export const MIN_HP_PCT = 50;
export const MIN_MANA_PCT = 30;
export const EXPLORE_TRIES = 3;
const QUEST_ID = /^#?(\d+)$/;

function unitGuid(ctx: ViewCtx, unit: UnitView): bigint {
  const guid = ctx.rt.refs.guidOf(unit.ref);
  if (guid === undefined) throw new Error(`unknown ref ${unit.ref}`);
  return guid;
}

export function sameArgs(args: EngageArgs): string {
  const init: Record<string, string | number | boolean> = {};
  if (args.target !== undefined) init["target"] = args.target;
  if (args.count !== undefined) init["count"] = args.count;
  if (args.quest !== undefined) init["quest"] = args.quest;
  if (args.how !== undefined) init["how"] = args.how;
  if (args.loot !== undefined) init["loot"] = args.loot;
  return nextCall("engage", init);
}

function questTitles(ctx: ViewCtx): Map<number, string> {
  const titles = new Map<number, string>();
  for (const query of ctx.handle.getQuestState().queries)
    if (query.status === "known") titles.set(query.questId, query.data.title);
  return titles;
}

export function parseQuest(ctx: ViewCtx, text: string): number {
  const inLog = ctx.handle
    .getQuestState()
    .log.slots.flatMap((slot) =>
      slot.questId === undefined || slot.questId === 0 ? [] : [slot.questId],
    );
  const titles = questTitles(ctx);
  const id = QUEST_ID.exec(text.trim())?.[1];
  const wanted = text.trim().toLowerCase();
  const found =
    id === undefined
      ? inLog.find((questId) =>
          titles.get(questId)?.toLowerCase().includes(wanted),
        )
      : inLog.find((questId) => questId === Number(id));
  if (found !== undefined) return found;
  throw new Refusal({
    body: inLog.map(
      (questId) => `#${questId} ${titles.get(questId) ?? "(title not loaded)"}`,
    ),
    detail: `no quest "${text}" in your quest log.`,
    next: nextCall("journal", { about: "quests" }),
    reason: "unknown_quest",
  });
}

function tooStrong(unit: UnitView, level: number): Refusal {
  return new Refusal({
    detail: `${unit.name} ${unit.ref} is L${unit.level}, ${unit.level - level} levels above you. If the human asked for this fight: ${nextCall("engage", { target: unit.ref })}.`,
    reason: "too_strong",
  });
}

function hostiles(ctx: ViewCtx): UnitView[] {
  return unitViews(ctx).filter(
    (unit) =>
      unit.inView &&
      unit.alive &&
      unit.attackable &&
      unit.relation === "hostile" &&
      !unit.tappedByOther,
  );
}

function wantsHostile(unit: UnitView): boolean {
  return unit.attackable && unit.relation === "hostile";
}

async function findUnnamed(ops: OpsCtx): Promise<UnitView> {
  for (
    let tries = 0;
    tries < EXPLORE_TRIES && hostiles(ops).length === 0;
    tries += 1
  )
    await explore(ops, { direction: undefined, wanted: wantsHostile });
  const { level } = selfView(ops);
  const all = hostiles(ops);
  const fit = all.find((unit) => unit.level <= level + LEVEL_CAP_ABOVE);
  if (fit) return fit;
  const [strong] = all;
  if (strong) throw tooStrong(strong, level);
  throw new Refusal({
    detail: `no hostile unit you can attack came into view after ${EXPLORE_TRIES} explore walks.`,
    next: askHuman("Where should I look for enemies?"),
    reason: "not_seen",
  });
}

async function findNamed(ops: OpsCtx, text: string): Promise<UnitView> {
  const lower = text.toLowerCase();
  let resolved = resolveUnit(ops, { alive: true, text });
  for (
    let tries = 0;
    resolved.kind === "not_seen" && tries < EXPLORE_TRIES;
    tries += 1
  ) {
    await explore(ops, {
      direction: undefined,
      wanted: (unit) => unit.name.toLowerCase().includes(lower),
    });
    resolved = resolveUnit(ops, { alive: true, text });
  }
  if (resolved.kind !== "unit")
    throw unitRefusal({ param: "target", resolved, tool: "engage" });
  return resolved.unit;
}

function checkRelation(unit: UnitView): void {
  if (unit.relation === "friendly")
    throw new Refusal({
      detail: `${unit.name} ${unit.ref} is friendly.`,
      next: nextCall("look", { find: "hostile" }),
      reason: "friendly",
    });
}

function modeOf(questId: number | undefined, count: number): EngageMode {
  if (questId !== undefined) return "quest";
  return count > 1 ? "cycle" : "single";
}

export async function chooseTarget(
  ops: OpsCtx,
  args: EngageArgs,
): Promise<Choice> {
  const questId =
    args.quest === undefined ? undefined : parseQuest(ops, args.quest);
  if (questId !== undefined && args.target === undefined)
    return {
      guid: undefined,
      mode: "quest",
      named: false,
      questId,
      sources: [],
      unit: undefined,
      wanted: args.count ?? 0,
    };
  const [attacker] = dangerView(ops).attackers;
  const attacking = attacker
    ? unitViews(ops).find((view) => view.ref === attacker.ref)
    : undefined;
  const unit =
    args.target === undefined
      ? (attacking ?? (await findUnnamed(ops)))
      : await findNamed(ops, args.target);
  checkRelation(unit);
  const count = args.count ?? 1;
  return {
    guid: unitGuid(ops, unit),
    mode: modeOf(questId, count),
    named: args.target !== undefined,
    questId,
    sources: questId === undefined ? [] : [unit.entry],
    unit,
    wanted: questId === undefined ? count : (args.count ?? 0),
  };
}

export function guardPull(ctx: ToolCtx<EngageAfter>, args: EngageArgs): void {
  const self = selfView(ctx);
  if (self.life !== "alive")
    throw new Refusal({
      detail: "you are dead.",
      next: nextCall("recover"),
      reason: "dead",
    });
  const [attacker] = dangerView(ctx).attackers;
  const target = args.target?.toLowerCase();
  const defending =
    attacker !== undefined &&
    (target === undefined ||
      attacker.ref === target ||
      attacker.name.toLowerCase().includes(target));
  if (attacker && !defending)
    throw new Refusal({
      detail: `${attacker.name} ${attacker.ref} is attacking you; fight it first.`,
      next: nextCall("engage", { target: attacker.ref }),
      reason: "other_attacker",
    });
  if (defending) return;
  const vitals = vitalsView(ctx);
  const rest = `${nextCall("rest")}, then ${sameArgs(args)}`;
  if (vitals.maxHp > 0 && (vitals.hp / vitals.maxHp) * 100 < MIN_HP_PCT)
    throw new Refusal({
      detail: `you are at ${Math.round((vitals.hp / vitals.maxHp) * 100)}% HP; pull at ${MIN_HP_PCT}% or more.`,
      next: rest,
      reason: "low_health",
    });
  if (
    vitals.powerKind === "mana" &&
    vitals.maxPower > 0 &&
    (vitals.power / vitals.maxPower) * 100 < MIN_MANA_PCT
  )
    throw new Refusal({
      detail: `you are at ${Math.round((vitals.power / vitals.maxPower) * 100)}% mana; pull at ${MIN_MANA_PCT}% or more.`,
      next: rest,
      reason: "low_mana",
    });
}

export function checkHelper(ctx: ToolCtx<EngageAfter>): void {
  const jev = (() => {
    try {
      return ctx.handle.capabilities().jev;
    } catch {
      return true;
    }
  })();
  if (!jev)
    throw new Refusal({
      detail: "TYPESAFE_API_KEY is not set.",
      next: "ask the human to set it.",
      reason: "no_combat_helper",
    });
}
```

```ts
// packages/harness/src/tools/engage.ts
import { messageOf } from "@tuicraft/core/lib/errors";
import type { EngageAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { RunControl, RunEnd, RunStatus } from "#harness/contract/runs";
import type { OpsCtx, ToolCtx, ViewCtx } from "#harness/contract/services";
import { watchInterrupts } from "#harness/ops/danger";
import { Refusal } from "#harness/ops/refusal";
import { poseView, vitalsView } from "#harness/ops/views";
import { awaitRun } from "#harness/runs/wait";
import {
  askHuman,
  defineGameTool,
  type GameToolSpec,
  nextCall,
  result,
} from "#harness/tools/define";
import {
  checkHelper,
  chooseTarget,
  type FightRun,
  guardPull,
  parseQuest,
} from "#harness/tools/engage-choose";
import { type EngageArgs, engageParams } from "#harness/tools/params";

type Report = ToolResult<EngageAfter>;
type Latest = { after: EngageAfter };

function notBuilt(): Promise<Report> {
  return Promise.reject(
    new Refusal({
      detail: "this part of the harness is not built yet.",
      next: askHuman("This action is not built yet. What should I do instead?"),
      reason: "not_implemented",
      status: "FAILED",
    }),
  );
}

const FIGHT: FightRun = notBuilt;
const HUMAN_WROTE = "The human wrote a message. Read it before you act.";

export function emptyEngage(): EngageAfter {
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
    self: { hp: 0, maxHp: 0, maxPower: 0, power: 0, powerKind: "none" },
    swingErrors: [],
    targets: [],
    timeouts: 0,
    wanted: 1,
    xp: 0,
  };
}

function youLine(ctx: ViewCtx): string {
  const vitals = vitalsView(ctx);
  const pose = poseView(ctx);
  const mana =
    vitals.powerKind === "mana" && vitals.maxPower > 0
      ? `, mana ${Math.round((vitals.power / vitals.maxPower) * 100)}%`
      : "";
  return `You: HP ${vitals.hp}/${vitals.maxHp}${mana}${pose ? `, at ${Math.round(pose.x)}, ${Math.round(pose.y)}` : ""}.`;
}

function refusalReport(refusal: Refusal, after: EngageAfter): Report {
  return result(refusal.status, {
    after,
    body: refusal.body,
    detail: refusal.detail,
    next: refusal.next,
    options: refusal.options,
    reason: refusal.reason,
  });
}

function stopReport(signal: AbortSignal, after: EngageAfter): Report {
  const code = messageOf(signal.reason, "cancelled");
  if (code === "human_stop" || code === "esc")
    return result("FAILED", {
      after,
      detail: "the human stopped you. Start nothing new.",
      next: "end your turn and wait for the human.",
      reason: "cancelled",
    });
  return result("FAILED", {
    after,
    detail: `the fight was stopped (${code}).`,
    next: nextCall("look"),
    reason: "cancelled",
  });
}

function runStatus(
  report: Report,
  stopped: boolean,
): Exclude<RunStatus, "running"> {
  if (stopped) return "cancelled";
  if (report.reason === "died") return "interrupted";
  if (report.status === "DONE") return "succeeded";
  return report.status === "PARTLY" ? "partly" : "failed";
}

function runEnd(report: Report, stop?: string): RunEnd<Report> {
  return {
    reason: stop ?? report.reason,
    status: runStatus(report, stop !== undefined),
    summary: `${report.status} ${report.detail}`,
    value: report,
  };
}

async function launch(init: {
  ctx: ToolCtx<EngageAfter>;
  args: EngageArgs;
  control: RunControl;
  latest: Latest;
  runId: () => string;
}): Promise<RunEnd<Report>> {
  const { ctx, args, control, latest } = init;
  const rules = { death: true, newAttacker: false, rooted: true };
  const watch = watchInterrupts(
    { ...ctx, progress: control.progress, signal: control.signal },
    rules,
  );
  const ops: OpsCtx = {
    ...ctx,
    progress: control.progress,
    signal: AbortSignal.any([control.signal, watch.signal]),
  };
  const progress = (after: EngageAfter) => {
    latest.after = after;
    control.progress(`${after.kills} of ${after.wanted} kills`);
    ctx.update(
      result("RUNNING", {
        after,
        detail: `engage ${after.kills} of ${after.wanted} kills.`,
        runId: init.runId(),
      }),
    );
  };
  try {
    const choice = await chooseTarget(ops, args);
    const report = await FIGHT({
      args,
      cause: watch.cause,
      choice,
      control,
      ops,
      progress,
    });
    if (control.signal.aborted)
      return runEnd(
        stopReport(control.signal, report.after),
        messageOf(control.signal.reason),
      );
    return runEnd(report);
  } catch (error) {
    if (error instanceof Refusal)
      return runEnd(refusalReport(error, latest.after));
    if (!control.signal.aborted) throw error;
    return runEnd(
      stopReport(control.signal, latest.after),
      messageOf(control.signal.reason),
    );
  } finally {
    watch.dispose();
  }
}

function runningDetail(ctx: ViewCtx, after: EngageAfter): string {
  const current = after.current;
  const fighting = current
    ? `, fighting ${current.name} ${current.ref} (${current.hpPct}%)`
    : "";
  return `engage ${after.kills} of ${after.wanted} kills${fighting}. ${youLine(ctx)}`;
}

async function runEngage(
  args: EngageArgs,
  ctx: ToolCtx<EngageAfter>,
): Promise<Report> {
  guardPull(ctx, args);
  checkHelper(ctx);
  if (args.quest !== undefined) parseQuest(ctx, args.quest);
  const latest: Latest = { after: emptyEngage() };
  let runId = "";
  const run = ctx.rt.runs.start<Report>({
    args,
    kind: "engage",
    launch: (control) =>
      launch({ args, control, ctx, latest, runId: () => runId }),
    toolCallId: ctx.toolCallId,
  });
  runId = run.id;
  const waited = await awaitRun({ rt: ctx.rt, run });
  if (waited.kind === "ended") return { ...waited.end.value, runId };
  return result("RUNNING", {
    after: latest.after,
    body: waited.why === "human" ? [HUMAN_WROTE] : [],
    detail: runningDetail(ctx, latest.after),
    next: `end your turn; a [game] message comes when ${runId} ends. Or ${nextCall("stop", { run: runId })}.`,
    runId,
  });
}

export const engageSpec: GameToolSpec<typeof engageParams, "engage"> = {
  fallback: emptyEngage,
  kind: "run",
  name: "engage",
  parameters: engageParams,
  run: runEngage,
};

export const engageTool = defineGameTool(engageSpec);
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `mise test packages/harness/src/tools/engage-choose.test.ts packages/harness/src/tools/engage.test.ts`
Expected: PASS, 17 tests (14 and 3).

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/tools/engage-choose.ts packages/harness/src/tools/engage-choose.test.ts packages/harness/src/tools/engage.ts packages/harness/src/tools/engage.test.ts
mise exec -- git commit -F - <<'MSG'
feat: Add harness engage target choice

A small model picks fights it cannot win and pulls at low health. The
engage run now chooses a target within the level cap, explores for one
when none is in view, and refuses unsafe pulls with a rest step.
MSG
```

---

## Task B13: `engage` fight, loot and report

The second half of `engage` (design B.4 steps 3–6): walk to 25 yd when the target is over 30 yd away; `count: 1` → `awaitTactics` (Jev fight), then loot the kill with `lootCorpseOp` unless `loot: false`; `count > 1` → `awaitCycle` over the living units of that name (attackers first), topped up with a new cycle up to 3 times when the queue empties; `quest` → `awaitQuestCycle` with the named target's entry as the one source. Kills come from server kill credit (`server_kill_credit`), XP from `xp` combat events of kind `kill`, loot from `item_push` and `money_notice`. It stops on death (`FAILED died`, `Next: recover()`), maps `jev_timeout` to `jev_unavailable` (L4 `jevCode`), maps `objective_item_sources_unknown` to `REFUSED item_sources_unknown`, and names any other attacker with a ready `engage` call (D11: a new attacker does not stop the run; `watchInterrupts` gets `newAttacker: false`). With `quest` and no `count`, `wanted` is 0 and means "until the objective completes" (success is the cycle stop cause `objective_complete`), so a yield then reads `engage 0 of 0 kills`. The per-run counters live in `engage-tally.ts`, a sibling file (contract section 3.2 split rule, owner B13), so `engage-fight.ts` stays small.

**Files**
- Create: `packages/harness/src/tools/engage-fight.ts`
- Create: `packages/harness/src/tools/engage-tally.ts`
- Modify: `packages/harness/src/tools/engage.ts` (wire the fight: one import, one line)
- Test: `packages/harness/src/tools/engage-fight.test.ts`

**Interfaces**
- Consumes: `FightInit`, `Choice`, `MIN_HP_PCT` (B12); `lootCorpseOp` (B3); `travelLeg` (B1); `awaitTactics`, `awaitCycle`, `awaitQuestCycle`, `jevCode`, `CycleEnd` (L4); `dangerView` (A7); `poseView`, `unitViews`, `vitalsView` (A3); `guidHex` (A2); `rt.attacks.lastAttacker()` (A7); `DEFAULT_FIGHT_INSTRUCTION`, `CombatEvent`, `CycleState`, `RewardsEvent`, `TacticsEvent` from `@tuicraft/core`
- Produces (`engage-tally.ts`):
  - `export type Tally = { startedAt: number; xp: number; loot: LootLine[]; copper: number; decisions: JevDecisionView[]; castErrors: Map<string, number>; swingErrors: Map<string, number>; targets: EngageTarget[]; labels: Map<number, { name: string; quality: number | null }> };`
  - `export const DECISIONS_KEPT = 200;`
  - `export function newTally(ctx: ViewCtx): Tally;`, `export function watchTally(ctx: ViewCtx, tally: Tally): () => void;`
  - `export function nameOf(ctx: ViewCtx, guid: bigint): string;`, `export function isKill(reason: string | undefined): boolean;`, `export function kills(tally: Tally): number;`
  - `export function noteCycle(ctx: ViewCtx, tally: Tally, state: CycleState): void;`
  - `export function afterOf(ops: OpsCtx, init: { choice: Choice; how: string; tally: Tally }): EngageAfter;`
- Produces (`engage-fight.ts`): `export function fight(init: FightInit): Promise<ToolResult<EngageAfter>>;`
- Reason codes: `died`, `jev_unavailable`, `no_combat_helper`, `item_sources_unknown`, `unknown_quest`, `lost`, and the cycle stop causes as the `PARTLY` reason (`queue_exhausted`, `max_starts_reached`, …)

- [ ] **Step 1: Write the failing test**

```ts
// packages/harness/src/tools/engage-fight.test.ts
import { describe, expect, test } from "bun:test";
import type { CycleTargetRecord, TacticsOutcome } from "@tuicraft/core";
import type { EngageAfter } from "#harness/contract/details";
import { engageSpec } from "#harness/tools/engage";
import {
  attackBy,
  contentOf,
  die,
  limitProblem,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";

const STALKER = 0x20n;
const STALKER_2 = 0x22n;
const LYNX = 0x21n;
const KILL: TacticsOutcome = {
  reason: "server_kill_credit",
  status: "completed",
};

function stalker(guid: bigint, distance: number) {
  return unitRow({
    distance,
    entry: 15_366,
    guid,
    level: 7,
    name: "Springpaw Stalker",
    x: distance,
    y: 0,
  });
}

function xp(handle: MockHandle, victim: bigint, total: number): void {
  const state = handle.getCombatState();
  handle.triggerCombatEvent({
    state: { ...state, lastXp: { at: 0, kind: "kill", total, victim } },
    type: "xp",
  });
}

function tactics(handle: MockHandle, finish: ((runId: string) => void) | undefined): void {
  const idle = handle.getTacticsState();
  handle.startTactics = (guid, instruction, signal) => {
    const runId = "t1";
    handle.getTacticsState = () => ({ ...idle, runId, status: "active", targetGuid: guid });
    handle.triggerTacticsEvent({
      framing: "minimal",
      instruction,
      runId,
      targetGuid: `0x${guid.toString(16)}`,
      type: "started",
    });
    return new Promise<void>((resolve) => {
      signal?.addEventListener("abort", () => resolve(), { once: true });
      if (finish)
        queueMicrotask(() => {
          finish(runId);
          resolve();
        });
    });
  };
}

function outcome(
  handle: MockHandle,
  runId: string,
  result: TacticsOutcome,
): void {
  handle.triggerTacticsEvent({ ...result, runId, type: "outcome" });
}

function lootsFang(handle: MockHandle): void {
  const base = handle.getRewardsState();
  const open = {
    ...base,
    loot: {
      guid: STALKER,
      invalidatedReason: undefined,
      items: [
        {
          count: 1,
          displayId: 0,
          itemId: 7073,
          name: "Broken Fang",
          quality: 0,
          randomPropertyId: 0,
          randomSuffix: 0,
          slot: 0,
          slotType: 0,
        },
      ],
      lootType: 1,
      money: 12,
      openedAt: 0,
      phase: "open" as const,
    },
  };
  const pushed = {
    bagSlot: 255,
    count: 1,
    created: 0,
    guid: 0n,
    itemId: 7073,
    observedAt: 0,
    randomPropertyId: 0,
    randomSuffix: 0,
    received: 1,
    showInChat: 1,
    slot: 0,
    totalCount: 1,
  };
  handle.lootCorpse = async () => {
    handle.getRewardsState = () => open;
    handle.triggerRewardsEvent({ at: 0, state: open, type: "loot_opened" });
    handle.triggerRewardsEvent({
      at: 0,
      state: { ...open, lastItemPush: pushed },
      type: "item_push",
    });
    handle.triggerRewardsEvent({
      at: 0,
      state: {
        ...open,
        lastMoneyNotice: { alone: true, money: 12, observedAt: 0 },
      },
      type: "money_notice",
    });
    handle.getRewardsState = () => base;
    return { ok: true, record: undefined };
  };
}

function cycleEnds(
  handle: MockHandle,
  records: CycleTargetRecord[],
  stopCause: string,
): void {
  const base = handle.getCycleState();
  const stopped = {
    ...base,
    active: false,
    phase: "stopped" as const,
    queue: records,
    stopCause,
  };
  const finish = () => {
    handle.getCycleState = () => stopped;
    handle.triggerCycleEvent({ at: 0, state: stopped, type: "stopped" });
  };
  const start = async () => {
    handle.getCycleState = () => ({ ...base, active: true, phase: "fighting" });
    queueMicrotask(finish);
  };
  handle.startCycle = start;
  handle.startQuestCycle = start;
}

async function field() {
  const t = await createTestRuntime();
  t.handle.capabilities = () => ({ factions: true, jev: true, navigation: true, spells: true });
  setSelf(t.handle, { level: 10 });
  setUnits(t.handle, [stalker(STALKER, 22), stalker(STALKER_2, 28)]);
  return t;
}

describe("engage fight", () => {
  test("one kill: kill credit, XP and loot in one DONE line", async () => {
    const t = await field();
    tactics(t.handle, (runId) => {
      xp(t.handle, STALKER, 108);
      outcome(t.handle, runId, KILL);
    });
    lootsFang(t.handle);
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    const text = contentOf(res);
    expect(limitProblem(text)).toBeUndefined();
    expect(text).toMatch(
      /^DONE killed Springpaw Stalker \(u\d+\) in 0 s, server kill credit\. \+108 XP\. Looted Broken Fang x1, 12 copper\. You: HP 200\/200, mana 100%\.$/,
    );
    expect(res.after).toMatchObject({ kills: 1, mode: "single", xp: 108 });
  });

  test("death during the fight fails with the recover step", async () => {
    const t = await field();
    tactics(t.handle, () => {
      attackBy(t.handle, STALKER);
      die(t.handle);
    });
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(res).toMatchObject({
      next: "recover()",
      reason: "died",
      status: "FAILED",
    });
    expect(res.detail).toMatch(
      /^Springpaw Stalker \(u\d+\) killed you after 0 s\. You are dead at 0, 0\.$/,
    );
  });

  test("Jev timing out 3 times maps to jev_unavailable", async () => {
    const t = await field();
    tactics(t.handle, (runId) =>
      outcome(t.handle, runId, { reason: "jev_timeout", status: "failed" }),
    );
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(res).toMatchObject({ reason: "jev_unavailable", status: "FAILED" });
  });

  test("count 3 runs a cycle and reports PARTLY with the kills it got", async () => {
    const t = await field();
    cycleEnds(
      t.handle,
      [
        { guid: STALKER, loot: "looted", outcome: KILL, status: "done" },
        { guid: STALKER_2, loot: "looted", outcome: KILL, status: "done" },
      ],
      "queue_exhausted",
    );
    const res = await engageSpec.run(
      { count: 3, target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(limitProblem(contentOf(res))).toBeUndefined();
    expect(res).toMatchObject({
      next: 'engage(count: 1, target: "Springpaw Stalker")',
      reason: "queue_exhausted",
      status: "PARTLY",
    });
    expect(res.detail).toMatch(
      /^2 of 3 kills \(u\d+, u\d+\)\. Stopped: queue_exhausted\./,
    );
  });

  test("an item quest with no known source refuses with the ask for a creature", async () => {
    const t = await field();
    const state = t.handle.getQuestState();
    const counters: [number, number, number, number] = [0, 0, 0, 0];
    t.handle.getQuestState = () => ({
      ...state,
      log: {
        complete: true,
        slots: [
          { counters, expiresAtSeconds: 0, flags: 0, questId: 8325, slot: 0 },
        ],
      },
    });
    cycleEnds(t.handle, [], "objective_item_sources_unknown");
    const res = await engageSpec.run(
      { quest: "8325" },
      toolCtx<EngageAfter>(t),
    );
    expect(res).toMatchObject({
      next: 'engage(quest: "8325", target: "<creature name>")',
      reason: "item_sources_unknown",
      status: "REFUSED",
    });
  });

  test("a second attacker after a single kill is named with an engage step", async () => {
    const t = await field();
    setUnits(t.handle, [
      stalker(STALKER, 22),
      unitRow({
        distance: 8,
        guid: LYNX,
        level: 6,
        name: "Springpaw Lynx",
        x: 8,
        y: 0,
      }),
    ]);
    tactics(t.handle, (runId) => {
      attackBy(t.handle, LYNX);
      outcome(t.handle, runId, KILL);
    });
    t.handle.lootCorpse = async () => ({ ok: true, record: undefined });
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(res.status).toBe("DONE");
    expect(res.body).toEqual([
      expect.stringMatching(/^Also attacking you: .+ u\d+\.$/),
    ]);
    expect(res.next).toMatch(/^engage\(target: "u\d+"\)$/);
  });

  test("a new attacker mid-cycle leads the next cycle while kills remain", async () => {
    const t = await field();
    setUnits(t.handle, [
      stalker(STALKER, 22),
      stalker(STALKER_2, 28),
      unitRow({
        distance: 8,
        guid: LYNX,
        level: 6,
        name: "Springpaw Lynx",
        x: 8,
        y: 0,
      }),
    ]);
    const calls: bigint[][] = [];
    const base = t.handle.getCycleState();
    t.handle.startCycle = (guids) => {
      calls.push([...guids]);
      const first = calls.length === 1;
      if (first) attackBy(t.handle, LYNX);
      const records: CycleTargetRecord[] = [
        {
          guid: first ? STALKER : LYNX,
          loot: "looted",
          outcome: KILL,
          status: "done",
        },
      ];
      const stopped = {
        ...base,
        active: false,
        phase: "stopped" as const,
        queue: records,
        stopCause: "queue_exhausted",
      };
      queueMicrotask(() => {
        t.handle.getCycleState = () => stopped;
        t.handle.triggerCycleEvent({ at: 0, state: stopped, type: "stopped" });
      });
      return Promise.resolve();
    };
    const res = await engageSpec.run(
      { count: 2, target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(calls[0]).toEqual([STALKER, STALKER_2]);
    expect(calls[1]?.[0]).toBe(LYNX);
    expect(res.status).not.toBe("FAILED");
  });

  test("human text yields RUNNING with vitals while the fight goes on", async () => {
    const t = await field();
    tactics(t.handle, undefined);
    const pending = engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    t.rt.yields.trigger();
    const res = await pending;
    expect(res.status).toBe("RUNNING");
    expect(res.detail).toBe(
      "engage 0 of 1 kills. You: HP 200/200, mana 100%, at 0, 0.",
    );
    t.rt.runs.cancel(res.runId ?? "", "tool");
  });
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `mise test packages/harness/src/tools/engage-fight.test.ts`
Expected: FAIL; every fight test gets `FAILED not_implemented: this part of the harness is not built yet.` from the B12 `notBuilt` fight.

- [ ] **Step 3: Implement**

```ts
// packages/harness/src/tools/engage-tally.ts
import type {
  CombatEvent,
  CycleState,
  RewardsEvent,
  TacticsEvent,
} from "@tuicraft/core";
import type {
  CodeWord,
  EngageAfter,
  EngageTarget,
  JevDecisionView,
  LootLine,
} from "#harness/contract/details";
import type { OpsCtx, ViewCtx } from "#harness/contract/services";
import { guidHex } from "#harness/ops/refs";
import { unitViews, vitalsView } from "#harness/ops/views";
import type { Choice } from "#harness/tools/engage-choose";

export type Tally = {
  startedAt: number;
  xp: number;
  loot: LootLine[];
  copper: number;
  decisions: JevDecisionView[];
  castErrors: Map<string, number>;
  swingErrors: Map<string, number>;
  targets: EngageTarget[];
  labels: Map<number, { name: string; quality: number | null }>;
};

export const DECISIONS_KEPT = 200;
const KILL_CREDIT = "server_kill_credit";
const ACTION_HEAD = /^[a-z]+/;
const KINDS: Record<string, JevDecisionView["kind"]> = {
  attack: "attack",
  cast: "spell",
  face: "face",
  item: "item",
  move: "move",
  spell: "spell",
  use: "item",
};

export function newTally(ctx: ViewCtx): Tally {
  return {
    castErrors: new Map(),
    copper: 0,
    decisions: [],
    labels: new Map(),
    loot: [],
    startedAt: ctx.rt.clock.now(),
    swingErrors: new Map(),
    targets: [],
    xp: 0,
  };
}

function bump(counts: Map<string, number>, word: string): void {
  counts.set(word, (counts.get(word) ?? 0) + 1);
}

function noteCombat(tally: Tally, event: CombatEvent): void {
  const xp = event.state.lastXp;
  if (event.type === "xp" && xp?.kind === "kill") tally.xp += xp.total;
  if (event.type === "cast_failed")
    bump(tally.castErrors, event.reason ?? "unknown");
  if (event.type === "attack_stopped" && event.reason)
    bump(tally.swingErrors, event.reason);
}

function decisionKind(actionId: string): JevDecisionView["kind"] {
  const head = ACTION_HEAD.exec(actionId.toLowerCase())?.[0] ?? "";
  return KINDS[head] ?? "wait";
}

function noteTactics(ctx: ViewCtx, tally: Tally, event: TacticsEvent): void {
  if (event.type !== "applied" && event.type !== "discarded") return;
  const label =
    event.actionId ?? (event.type === "discarded" ? event.reason : "");
  tally.decisions.push({
    at: ctx.rt.clock.now(),
    disposition: event.type,
    kind: decisionKind(label),
    label,
  });
  if (tally.decisions.length > DECISIONS_KEPT) tally.decisions.shift();
}

function noteLabels(ctx: ViewCtx, tally: Tally): void {
  const { loot } = ctx.handle.getRewardsState();
  if (loot.phase !== "open") return;
  for (const item of loot.items)
    tally.labels.set(item.itemId, {
      name: item.name ?? `item ${item.itemId}`,
      quality: item.quality,
    });
}

function notePush(
  tally: Tally,
  pushed: { itemId: number; count: number },
): void {
  const same = tally.loot.find((line) => line.itemId === pushed.itemId);
  if (same) {
    same.count += pushed.count;
    return;
  }
  const label = tally.labels.get(pushed.itemId);
  tally.loot.push({
    count: pushed.count,
    itemId: pushed.itemId,
    name: label?.name ?? `item ${pushed.itemId}`,
    quality: label?.quality ?? null,
  });
}

function noteRewards(ctx: ViewCtx, tally: Tally, event: RewardsEvent): void {
  if (event.type === "loot_opened") noteLabels(ctx, tally);
  const pushed = event.state.lastItemPush;
  if (event.type === "item_push" && pushed) notePush(tally, pushed);
  const notice = event.state.lastMoneyNotice;
  if (event.type === "money_notice" && notice) tally.copper += notice.money;
}

export function watchTally(ctx: ViewCtx, tally: Tally): () => void {
  const offs = [
    ctx.handle.onCombatEvent((event) => noteCombat(tally, event)),
    ctx.handle.onTacticsEvent((event) => noteTactics(ctx, tally, event)),
    ctx.handle.onRewardsEvent((event) => noteRewards(ctx, tally, event)),
  ];
  return () => {
    for (const off of offs) off();
  };
}

export function nameOf(ctx: ViewCtx, guid: bigint): string {
  const hex = guidHex(guid);
  return (
    unitViews(ctx).find((unit) => unit.guid === hex)?.name ??
    ctx.rt.sightings.get(guid)?.name ??
    "a unit"
  );
}

export function isKill(reason: string | undefined): boolean {
  return reason === KILL_CREDIT;
}

export function kills(tally: Tally): number {
  return tally.targets.filter((target) => target.outcome === "killed").length;
}

export function noteCycle(ctx: ViewCtx, tally: Tally, state: CycleState): void {
  for (const record of state.queue) {
    if (record.status === "queued") continue;
    const ref = ctx.rt.refs.refOf(record.guid);
    if (tally.targets.some((target) => target.ref === ref)) continue;
    const killed = isKill(record.outcome?.reason);
    tally.targets.push({
      durationMs: undefined,
      name: nameOf(ctx, record.guid),
      outcome: killed ? "killed" : "skipped",
      reason: killed
        ? record.outcome?.reason
        : (record.cause ?? record.outcome?.reason),
      ref,
      xp: undefined,
    });
  }
}

function words(counts: Map<string, number>): CodeWord[] {
  return [...counts].map(([word, count]) => {
    const code = Number(word);
    return { code: Number.isInteger(code) ? code : -1, count, word };
  });
}

export function afterOf(
  ops: OpsCtx,
  init: { choice: Choice; how: string; tally: Tally },
): EngageAfter {
  const { choice, how, tally } = init;
  const target = ops.handle.getCombatState().target?.guid;
  const hex = target === undefined ? undefined : guidHex(target);
  return {
    cast: undefined,
    castErrors: words(tally.castErrors),
    copper: tally.copper,
    current: unitViews(ops).find((unit) => unit.guid === hex && unit.alive),
    decisions: tally.decisions,
    how,
    kills: kills(tally),
    loot: tally.loot,
    mode: choice.mode,
    questId: choice.questId,
    self: vitalsView(ops),
    swingErrors: words(tally.swingErrors),
    targets: tally.targets,
    timeouts: ops.handle.getTacticsState().timeouts.total,
    wanted: choice.wanted,
    xp: tally.xp,
  };
}
```

```ts
// packages/harness/src/tools/engage-fight.ts
import { DEFAULT_FIGHT_INSTRUCTION } from "@tuicraft/core";
import type { EngageAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { ViewCtx } from "#harness/contract/services";
import { dangerView } from "#harness/ops/danger";
import { lootCorpseOp } from "#harness/ops/loot";
import { ENGAGE_APPROACH_YD } from "#harness/ops/range";
import { travelLeg } from "#harness/ops/travel-leg";
import { poseView, unitViews, vitalsView } from "#harness/ops/views";
import {
  awaitCycle,
  awaitQuestCycle,
  awaitTactics,
  type CycleEnd,
  jevCode,
} from "#harness/runs/adapters";
import { askHuman, nextCall, result } from "#harness/tools/define";
import { type FightInit, MIN_HP_PCT } from "#harness/tools/engage-choose";
import {
  afterOf,
  isKill,
  kills,
  nameOf,
  newTally,
  noteCycle,
  type Tally,
  watchTally,
} from "#harness/tools/engage-tally";

type Report = ToolResult<EngageAfter>;
type ModeEnd = {
  error: string | undefined;
  jev: string | undefined;
  stopCause: string | undefined;
};
type Scene = FightInit & { tally: Tally; how: string };

const APPROACH_WITHIN_YD = 25;
const TOP_UPS = 3;
const MISSING_KEY = "missing_jev_key";
const JEV_UNAVAILABLE = "jev_unavailable";

function instruction(scene: Scene): string {
  return scene.args.how ?? DEFAULT_FIGHT_INSTRUCTION;
}

async function approach(scene: Scene): Promise<Report | undefined> {
  const { choice, ops } = scene;
  if (
    !choice.unit ||
    choice.guid === undefined ||
    (choice.unit.distance ?? 0) <= ENGAGE_APPROACH_YD
  )
    return;
  const leg = await travelLeg(ops, {
    goal: { guid: choice.guid, kind: "unit", name: choice.unit.name },
    within: APPROACH_WITHIN_YD,
  });
  if (leg.status === "arrived") return;
  return result("FAILED", {
    after: afterOf(ops, scene),
    detail: `could not reach ${choice.unit.name} ${choice.unit.ref}: ${leg.detail}.`,
    next: nextCall("travel", { to: choice.unit.ref }),
    reason: leg.reason ?? leg.status,
  });
}

async function single(scene: Scene): Promise<ModeEnd> {
  const { choice, ops, tally } = scene;
  const guid = choice.guid;
  if (guid === undefined)
    return { error: "no_target", jev: undefined, stopCause: undefined };
  const startedAt = ops.rt.clock.now();
  const end = await awaitTactics(ops.handle, {
    guid,
    instruction: instruction(scene),
    signal: ops.signal,
  });
  const killed = isKill(end.outcome?.reason);
  tally.targets.push({
    durationMs: ops.rt.clock.now() - startedAt,
    name: nameOf(ops, guid),
    outcome: killed ? "killed" : "lost",
    reason: end.outcome?.reason ?? end.error,
    ref: ops.rt.refs.refOf(guid),
    xp: undefined,
  });
  if (killed && scene.args.loot !== false) await lootCorpseOp(ops, guid);
  return { error: end.error, jev: jevCode(end), stopCause: undefined };
}

function nextTargets(scene: Scene, tried: ReadonlySet<bigint>): bigint[] {
  const { choice, ops } = scene;
  const attackers = dangerView(ops).attackers.map((attacker) =>
    ops.rt.refs.guidOf(attacker.ref),
  );
  const same = unitViews(ops)
    .filter(
      (unit) =>
        unit.alive && !unit.tappedByOther && unit.name === choice.unit?.name,
    )
    .map((unit) => ops.rt.refs.guidOf(unit.ref));
  const ordered = [...attackers, choice.guid, ...same].flatMap((guid) =>
    guid === undefined ? [] : [guid],
  );
  return [...new Set(ordered)].filter((guid) => !tried.has(guid));
}

async function cycle(scene: Scene): Promise<ModeEnd> {
  const { choice, ops, tally } = scene;
  const tried = new Set<bigint>();
  let end: CycleEnd | undefined;
  for (
    let round = 0;
    round <= TOP_UPS && kills(tally) < choice.wanted && !ops.signal.aborted;
    round += 1
  ) {
    const guids = nextTargets(scene, tried);
    if (guids.length === 0) break;
    for (const guid of guids) tried.add(guid);
    end = await awaitCycle(ops.handle, {
      guids,
      instruction: instruction(scene),
      maxStarts: choice.wanted - kills(tally),
      signal: ops.signal,
    });
    noteCycle(ops, tally, end.state);
    if (end.error !== undefined || end.state.stopCause !== "queue_exhausted")
      break;
  }
  const stopCause = end?.state.stopCause;
  return {
    error: end?.error,
    jev: stopCause === JEV_UNAVAILABLE ? JEV_UNAVAILABLE : undefined,
    stopCause,
  };
}

async function quest(scene: Scene): Promise<ModeEnd> {
  const { choice, ops, tally } = scene;
  const end = await awaitQuestCycle(ops.handle, {
    instruction: instruction(scene),
    maxStarts: scene.args.count,
    questId: choice.questId ?? 0,
    signal: ops.signal,
    sources: choice.sources,
  });
  noteCycle(ops, tally, end.state);
  const stopCause = end.state.stopCause;
  return {
    error: end.error,
    jev: stopCause === JEV_UNAVAILABLE ? JEV_UNAVAILABLE : undefined,
    stopCause,
  };
}

function vitalsLine(ctx: ViewCtx): string {
  const vitals = vitalsView(ctx);
  const mana =
    vitals.powerKind === "mana" && vitals.maxPower > 0
      ? `, mana ${Math.round((vitals.power / vitals.maxPower) * 100)}%`
      : "";
  return `You: HP ${vitals.hp}/${vitals.maxHp}${mana}.`;
}

function lootText(tally: Tally): string {
  const parts = tally.loot.map((line) => `${line.name} x${line.count}`);
  if (tally.copper > 0) parts.push(`${tally.copper} copper`);
  return parts.length === 0 ? "" : ` Looted ${parts.join(", ")}.`;
}

function gains(scene: Scene): string {
  const { tally } = scene;
  return `${tally.xp > 0 ? ` +${tally.xp} XP.` : ""}${lootText(tally)} ${vitalsLine(scene.ops)}`;
}

function killedRefs(tally: Tally): string {
  return tally.targets
    .filter((target) => target.outcome === "killed")
    .map((target) => target.ref)
    .join(", ");
}

function diedReport(scene: Scene, secs: number): Report {
  const { ops, choice } = scene;
  const killer = ops.rt.attacks.lastAttacker() ?? choice.guid;
  const who =
    killer === undefined
      ? "something"
      : `${nameOf(ops, killer)} (${ops.rt.refs.refOf(killer)})`;
  const pose = poseView(ops);
  const at = pose ? ` at ${Math.round(pose.x)}, ${Math.round(pose.y)}` : "";
  return result("FAILED", {
    after: afterOf(ops, scene),
    detail: `${who} killed you after ${secs} s. You are dead${at}.`,
    next: nextCall("recover"),
    reason: "died",
  });
}

function stopped(scene: Scene, end: ModeEnd): Report | undefined {
  const after = afterOf(scene.ops, scene);
  if (end.error?.includes(MISSING_KEY))
    return result("REFUSED", {
      after,
      detail: "TYPESAFE_API_KEY is not set.",
      next: "ask the human to set it.",
      reason: "no_combat_helper",
    });
  if (end.jev === JEV_UNAVAILABLE)
    return result("FAILED", {
      after,
      detail: `the fight helper did not answer 3 times in a row. ${killedRefs(scene.tally) || "No kills."}`,
      next: askHuman("The fight helper stopped answering. What should I do?"),
      reason: JEV_UNAVAILABLE,
    });
  if (end.stopCause === "objective_item_sources_unknown")
    return result("REFUSED", {
      after,
      detail:
        "this quest needs items and I do not know which creature drops them.",
      next: nextCall("engage", {
        quest: String(scene.choice.questId),
        target: "<creature name>",
      }),
      reason: "item_sources_unknown",
    });
  if (end.stopCause === "quest_not_in_log" || end.error === "quest_not_in_log")
    return result("REFUSED", {
      after,
      detail: "that quest is not in your quest log.",
      next: nextCall("journal", { about: "quests" }),
      reason: "unknown_quest",
    });
}

function alsoAttacking(scene: Scene): {
  body: string[];
  next: string | undefined;
} {
  const fought = new Set(scene.tally.targets.map((target) => target.ref));
  const others = dangerView(scene.ops).attackers.filter(
    (attacker) => !fought.has(attacker.ref),
  );
  const [first] = others;
  if (!first) return { body: [], next: undefined };
  return {
    body: [
      `Also attacking you: ${others.map((attacker) => `${attacker.name} ${attacker.ref}`).join(", ")}.`,
    ],
    next: nextCall("engage", { target: first.ref }),
  };
}

function againCall(scene: Scene, left: number): string {
  const name = scene.choice.unit?.name;
  const again = nextCall(
    "engage",
    name === undefined ? { count: left } : { count: left, target: name },
  );
  const vitals = vitalsView(scene.ops);
  const low = vitals.maxHp > 0 && (vitals.hp / vitals.maxHp) * 100 < MIN_HP_PCT;
  return low ? `${nextCall("rest")}, then ${again}` : again;
}

function outcomeReport(scene: Scene, end: ModeEnd, secs: number): Report {
  const { choice, tally } = scene;
  const after = afterOf(scene.ops, scene);
  const killed = kills(tally);
  const refs = killedRefs(tally);
  const also = alsoAttacking(scene);
  const complete =
    choice.mode === "quest"
      ? end.stopCause === "objective_complete"
      : killed >= choice.wanted;
  const name = choice.unit?.name ?? "the quest targets";
  if (complete) {
    const what =
      killed === 1 ? `${name} (${refs})` : `${killed} ${name} (${refs})`;
    return result("DONE", {
      after,
      body: also.body,
      detail: `killed ${what} in ${secs} s, server kill credit.${gains(scene)}`,
      next: also.next,
    });
  }
  const why =
    end.stopCause ?? end.error ?? tally.targets.at(-1)?.reason ?? "stopped";
  if (killed > 0)
    return result("PARTLY", {
      after,
      body: also.body,
      detail: `${killed} of ${choice.wanted} kills (${refs}). Stopped: ${why}.${gains(scene)}`,
      next: also.next ?? againCall(scene, Math.max(1, choice.wanted - killed)),
      reason: why,
    });
  return result("FAILED", {
    after,
    body: also.body,
    detail: `${name} was not killed (${why}). ${vitalsLine(scene.ops)}`,
    next: also.next ?? nextCall("look", { find: "hostile" }),
    reason: "lost",
  });
}

export async function fight(init: FightInit): Promise<Report> {
  const tally = newTally(init.ops);
  const scene: Scene = {
    ...init,
    how: init.args.how ?? DEFAULT_FIGHT_INSTRUCTION,
    tally,
  };
  const off = watchTally(init.ops, tally);
  const tick = init.ops.handle.onTacticsEvent(() =>
    init.progress(afterOf(init.ops, scene)),
  );
  try {
    const blocked = await approach(scene);
    if (blocked) return blocked;
    const modes = { cycle, quest, single };
    const end = await modes[init.choice.mode](scene);
    const secs = Math.round((init.ops.rt.clock.now() - tally.startedAt) / 1000);
    if (init.cause()?.code === "died") return diedReport(scene, secs);
    return stopped(scene, end) ?? outcomeReport(scene, end, secs);
  } finally {
    tick();
    off();
  }
}
```

Then wire the fight into `packages/harness/src/tools/engage.ts`. Add this import after the `engage-choose` import:

```ts
import { fight } from "#harness/tools/engage-fight";
```

Delete the `notBuilt` function and replace `const FIGHT: FightRun = notBuilt;` with:

```ts
const FIGHT: FightRun = fight;
```

Remove `askHuman,` from the `#harness/tools/define` import (it has no other user in `engage.ts`). The file is then:

```ts
// packages/harness/src/tools/engage.ts
import { messageOf } from "@tuicraft/core/lib/errors";
import type { EngageAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import type { RunControl, RunEnd, RunStatus } from "#harness/contract/runs";
import type { OpsCtx, ToolCtx, ViewCtx } from "#harness/contract/services";
import { watchInterrupts } from "#harness/ops/danger";
import { Refusal } from "#harness/ops/refusal";
import { poseView, vitalsView } from "#harness/ops/views";
import { awaitRun } from "#harness/runs/wait";
import {
  defineGameTool,
  type GameToolSpec,
  nextCall,
  result,
} from "#harness/tools/define";
import {
  checkHelper,
  chooseTarget,
  type FightRun,
  guardPull,
  parseQuest,
} from "#harness/tools/engage-choose";
import { fight } from "#harness/tools/engage-fight";
import { type EngageArgs, engageParams } from "#harness/tools/params";

type Report = ToolResult<EngageAfter>;
type Latest = { after: EngageAfter };

const FIGHT: FightRun = fight;
const HUMAN_WROTE = "The human wrote a message. Read it before you act.";

export function emptyEngage(): EngageAfter {
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
    self: { hp: 0, maxHp: 0, maxPower: 0, power: 0, powerKind: "none" },
    swingErrors: [],
    targets: [],
    timeouts: 0,
    wanted: 1,
    xp: 0,
  };
}

function youLine(ctx: ViewCtx): string {
  const vitals = vitalsView(ctx);
  const pose = poseView(ctx);
  const mana =
    vitals.powerKind === "mana" && vitals.maxPower > 0
      ? `, mana ${Math.round((vitals.power / vitals.maxPower) * 100)}%`
      : "";
  return `You: HP ${vitals.hp}/${vitals.maxHp}${mana}${pose ? `, at ${Math.round(pose.x)}, ${Math.round(pose.y)}` : ""}.`;
}

function refusalReport(refusal: Refusal, after: EngageAfter): Report {
  return result(refusal.status, {
    after,
    body: refusal.body,
    detail: refusal.detail,
    next: refusal.next,
    options: refusal.options,
    reason: refusal.reason,
  });
}

function stopReport(signal: AbortSignal, after: EngageAfter): Report {
  const code = messageOf(signal.reason, "cancelled");
  if (code === "human_stop" || code === "esc")
    return result("FAILED", {
      after,
      detail: "the human stopped you. Start nothing new.",
      next: "end your turn and wait for the human.",
      reason: "cancelled",
    });
  return result("FAILED", {
    after,
    detail: `the fight was stopped (${code}).`,
    next: nextCall("look"),
    reason: "cancelled",
  });
}

function runStatus(
  report: Report,
  stopped: boolean,
): Exclude<RunStatus, "running"> {
  if (stopped) return "cancelled";
  if (report.reason === "died") return "interrupted";
  if (report.status === "DONE") return "succeeded";
  return report.status === "PARTLY" ? "partly" : "failed";
}

function runEnd(report: Report, stop?: string): RunEnd<Report> {
  return {
    reason: stop ?? report.reason,
    status: runStatus(report, stop !== undefined),
    summary: `${report.status} ${report.detail}`,
    value: report,
  };
}

async function launch(init: {
  ctx: ToolCtx<EngageAfter>;
  args: EngageArgs;
  control: RunControl;
  latest: Latest;
  runId: () => string;
}): Promise<RunEnd<Report>> {
  const { ctx, args, control, latest } = init;
  const rules = { death: true, newAttacker: false, rooted: true };
  const watch = watchInterrupts(
    { ...ctx, progress: control.progress, signal: control.signal },
    rules,
  );
  const ops: OpsCtx = {
    ...ctx,
    progress: control.progress,
    signal: AbortSignal.any([control.signal, watch.signal]),
  };
  const progress = (after: EngageAfter) => {
    latest.after = after;
    control.progress(`${after.kills} of ${after.wanted} kills`);
    ctx.update(
      result("RUNNING", {
        after,
        detail: `engage ${after.kills} of ${after.wanted} kills.`,
        runId: init.runId(),
      }),
    );
  };
  try {
    const choice = await chooseTarget(ops, args);
    const report = await FIGHT({
      args,
      cause: watch.cause,
      choice,
      control,
      ops,
      progress,
    });
    if (control.signal.aborted)
      return runEnd(
        stopReport(control.signal, report.after),
        messageOf(control.signal.reason),
      );
    return runEnd(report);
  } catch (error) {
    if (error instanceof Refusal)
      return runEnd(refusalReport(error, latest.after));
    if (!control.signal.aborted) throw error;
    return runEnd(
      stopReport(control.signal, latest.after),
      messageOf(control.signal.reason),
    );
  } finally {
    watch.dispose();
  }
}

function runningDetail(ctx: ViewCtx, after: EngageAfter): string {
  const current = after.current;
  const fighting = current
    ? `, fighting ${current.name} ${current.ref} (${current.hpPct}%)`
    : "";
  return `engage ${after.kills} of ${after.wanted} kills${fighting}. ${youLine(ctx)}`;
}

async function runEngage(
  args: EngageArgs,
  ctx: ToolCtx<EngageAfter>,
): Promise<Report> {
  guardPull(ctx, args);
  checkHelper(ctx);
  if (args.quest !== undefined) parseQuest(ctx, args.quest);
  const latest: Latest = { after: emptyEngage() };
  let runId = "";
  const run = ctx.rt.runs.start<Report>({
    args,
    kind: "engage",
    launch: (control) =>
      launch({ args, control, ctx, latest, runId: () => runId }),
    toolCallId: ctx.toolCallId,
  });
  runId = run.id;
  const waited = await awaitRun({ rt: ctx.rt, run });
  if (waited.kind === "ended") return { ...waited.end.value, runId };
  return result("RUNNING", {
    after: latest.after,
    body: waited.why === "human" ? [HUMAN_WROTE] : [],
    detail: runningDetail(ctx, latest.after),
    next: `end your turn; a [game] message comes when ${runId} ends. Or ${nextCall("stop", { run: runId })}.`,
    runId,
  });
}

export const engageSpec: GameToolSpec<typeof engageParams, "engage"> = {
  fallback: emptyEngage,
  kind: "run",
  name: "engage",
  parameters: engageParams,
  run: runEngage,
};

export const engageTool = defineGameTool(engageSpec);
```

- [ ] **Step 4: Run the test and see it pass**

Run: `mise test packages/harness/src/tools/engage-fight.test.ts packages/harness/src/tools/engage.test.ts packages/harness/src/tools/engage-choose.test.ts`
Expected: PASS, 25 tests (8 new, the 17 of B12 still pass).

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/tools/engage-fight.ts packages/harness/src/tools/engage-tally.ts packages/harness/src/tools/engage-fight.test.ts packages/harness/src/tools/engage.ts
mise exec -- git commit -F - <<'MSG'
feat: Add the harness engage fight

One engage call now fights through Jev, loots each kill and reports
server kill credit, XP and loot. It stops on death or when Jev stops
answering, and it names every other attacker with a ready call.
MSG
```


---

## Pane smoke (after BOOT; proposed for F8e, issue 12)

No B task changes protocol or daemon code, so the per-task gate is `mise test` plus type check and lint. The tools meet the real server only once the harness boots (F6b). Then one builder runs this checklist in an Orca pane on a throwaway account and records the result, with the run directory, in `docs/plans/2026-09-26-pi-harness-epic/smoke-live.md` (F8e's file) or in the FINAL notes. The session JSON that `soap create` prints holds the password: write it to a file and never print it.

1. Create the account: `bun packages/factory/src/main.ts soap create eversong10 > tmp/b-smoke.json` (a level 10 priest near Marniel Amberlight and the Springpaw Stalker field).
2. Open the pane: `orca-ide terminal create --worktree path:/home/deity/orca/workspaces/tuicraft/pi-epic --title b-smoke --command "bun packages/harness/src/entry.ts --profile tmp/b-smoke.json --run-dir tmp/b-smoke-run" --json`, keep the handle `H`, and wait with `orca-ide terminal wait --terminal H --for tui-idle --timeout-ms 60000`.
3. Send each prompt with `orca-ide terminal send --terminal H --text "<prompt>" --enter --wait-submit 10 --json`, wait for `tui-idle`, read with `orca-ide terminal read --terminal H --screen --json`, and check `tmp/b-smoke-run/gamelog.jsonl`:

| Prompt | Pass when |
|---|---|
| `Walk to Marniel Amberlight.` | a `tool/result` row for `travel` with status `DONE`, and a `nav/route_end` row |
| `Buy some water from her.` | `interact` `DONE` with `bought Refreshing Spring Water`, and a `vendor/buy` row |
| `Head north and kill one Springpaw Stalker.` | `travel` explore and `engage` results; a `combat/kill_credit` row, then `loot/item` rows |
| `Loot anything left near you.` | `loot` `DONE`, or `REFUSED not_lootable` with `Next: look(find: "lootable")` |
| `Rest until you are full.` | `rest` `DONE` or `PARTLY time_limit`; an `aura/gain` row when food or drink was used |
| `Kill three Springpaw Stalkers.`, then `Stop!` after the first `combat/attack_start` row | the reflex stops the run: `run/cancelled` with `human_stop`, and no `combat/cast` or `control/move_start` row later than 5 s after the `human/input` row |
| `What does the nearest quest giver offer?` (talk only) | `look` then `interact` `DONE` with the offers list and `#<id>` on each quest |

4. Close: send Ctrl-C twice (`--text $'\x03'` two times), `orca-ide terminal close --terminal H --tab --json`, then `bun packages/factory/src/main.ts soap delete <ACCOUNT>` with the account from the JSON's `.account`, and delete `tmp/b-smoke.json`.
5. A failure caused by movement (planner refusals) is graded as area `core` until NAV is on the pane's commit (contract 0.5, design I.4). Death and `recover` are covered by the eval scenario `t6-die-and-recover`, not by this smoke.
