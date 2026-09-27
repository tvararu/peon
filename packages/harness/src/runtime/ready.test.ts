import { describe, expect, jest, test } from "bun:test";
import { type Entity, ObjectType, type UnitEntity } from "@peon/core";
import { createMockHandle } from "@peon/core/test-support/mock-handle";
import { createReadyGate, READY_STABLE_MS } from "#harness/runtime/ready";
import {
  createTestRuntime,
  type MockHandle,
  type TestClock,
} from "#test-support/runtime-fixture";

const SELF = 0x42n;

function selfUnit(): UnitEntity {
  return {
    baseMana: 0,
    class_: 5,
    displayId: 0,
    entry: 0,
    factionTemplate: 0,
    gender: 0,
    guid: SELF,
    health: 100,
    level: 10,
    maxHealth: 100,
    maxPower: [],
    name: "Testchar",
    npcFlags: 0,
    objectType: ObjectType.PLAYER,
    position: undefined,
    power: [],
    race: 10,
    rawFields: new Map(),
    scale: 1,
    target: 0n,
    unitFlags: 0,
  };
}

function placeSelf(handle: MockHandle, entities: Entity[]): void {
  const state = handle.getControlState();
  state.selfGuid = SELF;
  state.pose = {
    mapId: 530,
    orientation: 0,
    source: "server",
    updatedAt: 0,
    x: 8813,
    y: -6691,
    z: 30,
  };
  handle.getNearbyEntities = jest.fn(() => entities);
}

function step(clock: TestClock, ms: number): void {
  clock.advance(ms);
  jest.advanceTimersByTime(ms);
}

async function setup() {
  const { rt, handle, clock } = await createTestRuntime({ connect: false });
  const gate = createReadyGate({ clock, log: rt.log, profile: rt.profile });
  return { clock, gate, handle, rt };
}

describe("createReadyGate", () => {
  test("becomes ready when the pose is known and the entity count is stable for 1 s", async () => {
    jest.useFakeTimers();
    try {
      const { clock, gate, handle, rt } = await setup();
      const seen = jest.fn();
      gate.onReady(seen);
      gate.attach(handle);
      placeSelf(handle, [selfUnit()]);
      step(clock, READY_STABLE_MS - 200);
      expect(gate.isReady()).toBe(false);
      step(clock, 400);
      expect(gate.isReady()).toBe(true);
      expect(gate.inWorld()).toMatchObject({
        account: "TESTACC",
        char: "Testchar",
        className: "Priest",
        guid: "42",
        level: 10,
        mapId: 530,
        pose: { mapId: 530, x: 8813, y: -6691, z: 30 },
        race: "Blood Elf",
      });
      expect(seen).toHaveBeenCalledTimes(1);
      expect(rt.log.recent(1)[0]).toMatchObject({
        class: "log",
        domain: "session",
        event: "session/in_world",
      });
    } finally {
      jest.useRealTimers();
    }
  });

  test("waits while entities keep arriving", async () => {
    jest.useFakeTimers();
    try {
      const { clock, gate, handle } = await setup();
      gate.attach(handle);
      const entities: Entity[] = [selfUnit()];
      placeSelf(handle, entities);
      for (let i = 0; i < 5; i++) {
        entities.push({ ...selfUnit(), guid: BigInt(100 + i) });
        step(clock, 500);
      }
      expect(gate.isReady()).toBe(false);
      step(clock, READY_STABLE_MS + 100);
      expect(gate.isReady()).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  test("whenReady resolves false after the timeout and true once ready", async () => {
    jest.useFakeTimers();
    try {
      const { clock, gate, handle } = await setup();
      gate.attach(handle);
      const early = gate.whenReady(500);
      step(clock, 500);
      expect(await early).toBe(false);
      placeSelf(handle, [selfUnit()]);
      const later = gate.whenReady(10_000);
      step(clock, READY_STABLE_MS + 200);
      expect(await later).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  test("gives unknown names and no capabilities when core data is missing", async () => {
    jest.useFakeTimers();
    try {
      const { clock, gate, handle } = await setup();
      handle.capabilities = () => {
        throw new Error("not_implemented");
      };
      gate.attach(handle);
      placeSelf(handle, []);
      step(clock, READY_STABLE_MS + 200);
      expect(gate.inWorld()).toMatchObject({
        capabilities: {
          factions: false,
          jev: false,
          navigation: false,
          spells: false,
        },
        className: "unknown",
        level: 0,
        race: "unknown",
      });
    } finally {
      jest.useRealTimers();
    }
  });

  test("a new handle resets readiness", async () => {
    jest.useFakeTimers();
    try {
      const { clock, gate, handle } = await setup();
      const detach = gate.attach(handle);
      placeSelf(handle, [selfUnit()]);
      step(clock, READY_STABLE_MS + 200);
      detach();
      expect(gate.isReady()).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  test("stays not ready while the self pose is unknown", async () => {
    jest.useFakeTimers();
    try {
      const { clock, gate, handle } = await setup();
      gate.attach(handle);
      placeSelf(handle, [selfUnit()]);
      const state = handle.getControlState();
      const pose = state.pose;
      state.pose = undefined;
      step(clock, READY_STABLE_MS * 3);
      expect(gate.isReady()).toBe(false);
      state.pose = pose;
      step(clock, 200);
      expect(gate.isReady()).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  test("attaching a second handle resets readiness", async () => {
    jest.useFakeTimers();
    try {
      const { clock, gate, handle } = await setup();
      gate.attach(handle);
      placeSelf(handle, [selfUnit()]);
      step(clock, READY_STABLE_MS + 200);
      expect(gate.isReady()).toBe(true);
      gate.attach(createMockHandle());
      expect(gate.isReady()).toBe(false);
      expect(gate.inWorld()).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });
});
