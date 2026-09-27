import { describe, expect, test } from "bun:test";
import type { ProgressTracker } from "#harness/contract/services";
import type { NoProgress } from "#harness/contract/views";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { createRefTable } from "#harness/ops/refs";
import { createSightings } from "#harness/ops/sightings";
import { nowSnapshot, snapshotWorld } from "#harness/ops/views";
import { createRunRegistry } from "#harness/runs/registry";
import {
  createTestRuntime,
  type TestRuntimeInit,
} from "#test-support/runtime-fixture";
import {
  nearbyRow,
  ORIGIN,
  SELF_GUID,
  selfPose,
  selfRow,
  setWorld,
  unitEntity,
} from "#test-support/world-fixtures";

const NOW = 1_000_000;
const stuck: NoProgress = {
  actions: 5,
  lastRefusal: "travel no_ground x3",
  sinceMs: 180_000,
  untried: ['travel(to: "unstick")'],
};
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
  const log = createGameLog({
    char: () => "Fgklibhlflc",
    clock,
    file: undefined,
  });
  const runs = createRunRegistry({
    clock,
    log,
    sink: createJsonlSink({ file: undefined }),
  });
  const parts = {
    clock,
    log,
    progress,
    refs: createRefTable(),
    runs,
    sightings: createSightings(clock),
    ...init.parts,
  };
  const { handle, rt } = await createTestRuntime({ ...init, parts });
  return { handle, rt };
}

const stalker = () =>
  nearbyRow(
    unitEntity({
      dx: 23,
      guid: 0x50n,
      health: 35,
      level: 7,
      maxHealth: 137,
      name: "Springpaw Stalker",
    }),
    { relation: "hostile" },
  );

describe("nowSnapshot", () => {
  test("is undefined offline or before the world is ready", async () => {
    expect(nowSnapshot((await world({ connect: false })).rt)).toBeUndefined();
    expect(nowSnapshot((await world({ ready: false })).rt)).toBeUndefined();
  });

  test("holds self, target, attackers, cast, auras, run and no-progress", async () => {
    const { handle, rt } = await world();
    const casting = {
      count: 0,
      durationMs: 1500,
      source: "server" as const,
      spellId: 585,
      startedAt: NOW - 500,
      target: 0x50n,
    };
    const aura = {
      caster: SELF_GUID,
      duration: 18_000,
      flags: 0,
      level: 10,
      slot: 0,
      spellId: 589,
      stacks: 1,
      timeLeft: 12_000,
    };
    setWorld(handle, {
      combat: {
        attackers: [0x50n],
        casting,
        selectedGuid: 0x50n,
        targetAuras: [aura],
      },
      pose: selfPose(NOW),
      rows: [selfRow(), stalker()],
    });
    rt.runs.start({
      args: { target: "u1" },
      kind: "engage",
      launch: () => new Promise<never>(() => {}),
      toolCallId: "c1",
    });
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
      targetAuras: [
        { mine: true, name: "spell 589", remainingMs: 12_000, spellId: 589 },
      ],
      wake: rt.session.wake,
    });
    expect(snapshot?.nearest.hostile?.ref).toBe("u1");
    expect(snapshot?.self.inCombat).toBe(true);
  });

  test("a ghost gets the corpse distance and the reclaim delay", async () => {
    const { handle, rt } = await world();
    setWorld(handle, { life: "ghost", pose: selfPose(NOW), rows: [selfRow()] });
    const recovery = handle.getRecoveryState();
    const corpse = {
      corpseMapId: 530,
      mapId: 530,
      observedAt: NOW,
      position: { x: ORIGIN.x + 30, y: ORIGIN.y, z: ORIGIN.z },
      status: "found" as const,
      unknown: 0,
    };
    handle.getRecoveryState = () => ({
      ...recovery,
      corpse,
      reclaimDelay: {
        delayMs: 30_000,
        readyAt: NOW + 12_000,
        receivedAt: NOW - 18_000,
      },
    });
    expect(nowSnapshot(rt)?.recovery).toEqual({
      corpseCompass: "N",
      corpseYd: 30,
      reclaimInMs: 12_000,
      spiritHealer: undefined,
    });
  });
});

describe("snapshotWorld", () => {
  test("lists self, place, target, attackers and units in view", async () => {
    const { handle, rt } = await world();
    setWorld(handle, { pose: selfPose(NOW), rows: [selfRow(), stalker()] });
    const snapshot = snapshotWorld(rt);
    expect(snapshot?.units.map((unit) => unit.name)).toEqual([
      "Springpaw Stalker",
    ]);
    expect(snapshot?.self.name).toBe(rt.profile.character);
    expect(snapshot?.target).toBeUndefined();
  });

  test("is undefined offline", async () => {
    expect(snapshotWorld((await world({ connect: false })).rt)).toBeUndefined();
  });
});
