import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  LIFT_HIGH,
  MO_TRANSPORT_HIGH,
  TRANSPORTS_STRAIGHT_ENTRY,
  TRANSPORTS_STRAIGHT_NODES,
  TRANSPORTS_STRAIGHT_PATH,
  transportsCreateBody,
  transportsDbc,
  transportsDestroyBody,
  transportsGameObjectQueryBody,
  transportsGuid,
  transportsMissingQueryBody,
  transportsOutOfRangeBody,
} from "#test-support/areas/transports";
import { flushMicrotasks } from "#test-support/microtasks";
import { must } from "#test-support/must";
import type { TransportsEvent } from "#wow/areas/transports/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const SELF = 0xf1_30_00_00_00_00_00_01n;
const MOTION = transportsGuid(MO_TRANSPORT_HIGH, 0x14);
const LIFT = transportsGuid(LIFT_HIGH, 0x50);

const NODES = { nodes: TRANSPORTS_STRAIGHT_NODES };

function rigWithEvents(now: number) {
  const rig = areaRig("transports", { now: () => now, selfGuid: SELF });
  const seen: TransportsEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  return { rig, seen };
}

function createMotion(init?: { pathProgress?: number }) {
  return transportsCreateBody({
    guid: MOTION,
    entry: TRANSPORTS_STRAIGHT_ENTRY,
    pathProgress: init?.pathProgress ?? 42,
    pose: { x: 100, y: 0, z: 0, orientation: 3.14 },
  });
}

describe("transports area wiring", () => {
  test("a transport create records the path progress from the block", () => {
    const { rig, seen } = rigWithEvents(1_000_000);
    try {
      rig.inject(GameOpcode.SMSG_UPDATE_OBJECT, createMotion());
      const entry = must(rig.handle.state().transports.get(MOTION));
      expect(entry).toMatchObject({
        entry: TRANSPORTS_STRAIGHT_ENTRY,
        kind: "motion",
        pathProgress: 42,
        receivedAt: 1_000_000,
      });
      expect(entry.pose).toMatchObject({ x: 100, y: 0, z: 0 });
      expect(seen).toEqual([{ guid: MOTION, type: "transport_seen" }]);
    } finally {
      rig.dispose();
    }
  });

  test("a transport create uses the self map, not the peek placeholder", () => {
    const { rig } = rigWithEvents(0);
    try {
      rig.stores.self.receive({
        type: "login_verified",
        position: { mapId: 1, x: 0, y: 0, z: 0, orientation: 0 },
      });
      rig.inject(GameOpcode.SMSG_UPDATE_OBJECT, createMotion());
      const entry = must(rig.handle.state().transports.get(MOTION));
      expect(entry.mapId).toBe(1);
    } finally {
      rig.dispose();
    }
  });

  test("a second create replaces the progress and resets the clock", () => {
    const { rig, seen } = rigWithEvents(7000);
    try {
      rig.inject(
        GameOpcode.SMSG_UPDATE_OBJECT,
        createMotion({ pathProgress: 10 }),
      );
      rig.inject(
        GameOpcode.SMSG_UPDATE_OBJECT,
        createMotion({ pathProgress: 9000 }),
      );
      const entry = must(rig.handle.state().transports.get(MOTION));
      expect(entry.pathProgress).toBe(9000);
      expect(entry.receivedAt).toBe(7000);
      expect(seen).toEqual([
        { guid: MOTION, type: "transport_seen" },
        { guid: MOTION, type: "transport_seen" },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a lift create records the lift kind and parent rotation", () => {
    const { rig } = rigWithEvents(0);
    try {
      rig.inject(
        GameOpcode.SMSG_UPDATE_OBJECT,
        transportsCreateBody({
          guid: LIFT,
          entry: 50,
          pathProgress: 3000,
          pose: { x: 1, y: 2, z: 3, orientation: 0.5 },
          parentRotationZ: 0,
          parentRotationW: 1,
        }),
      );
      const entry = must(rig.handle.state().transports.get(LIFT));
      expect(entry).toMatchObject({ kind: "lift", entry: 50 });
      expect(entry.pathRotation).toBeCloseTo(0, 5);
    } finally {
      rig.dispose();
    }
  });

  test("a non-transport create is ignored", () => {
    const { rig, seen } = rigWithEvents(0);
    try {
      rig.inject(
        GameOpcode.SMSG_UPDATE_OBJECT,
        transportsCreateBody({
          guid: transportsGuid(0xf1_30n, 0x99),
          entry: 9,
          pathProgress: 0,
          pose: { x: 0, y: 0, z: 0, orientation: 0 },
        }),
      );
      expect(rig.handle.state().transports.size).toBe(0);
      expect(seen).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("destroy and out-of-range remove the transport", () => {
    const { rig, seen } = rigWithEvents(0);
    try {
      for (const guid of [MOTION, LIFT]) {
        rig.inject(
          GameOpcode.SMSG_UPDATE_OBJECT,
          transportsCreateBody({
            guid,
            entry: 1,
            pathProgress: 0,
            pose: { x: 0, y: 0, z: 0, orientation: 0 },
          }),
        );
      }
      rig.inject(GameOpcode.SMSG_DESTROY_OBJECT, transportsDestroyBody(MOTION));
      expect(rig.handle.state().transports.has(MOTION)).toBe(false);
      rig.inject(
        GameOpcode.SMSG_UPDATE_OBJECT,
        transportsOutOfRangeBody([LIFT]),
      );
      expect(rig.handle.state().transports.has(LIFT)).toBe(false);
      expect(seen.map((event) => event.type)).toEqual([
        "transport_seen",
        "transport_seen",
        "transport_gone",
        "transport_gone",
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a type 15 template query row stores the path and speed", () => {
    const { rig } = rigWithEvents(0);
    try {
      rig.inject(
        GameOpcode.SMSG_GAMEOBJECT_QUERY_RESPONSE,
        transportsGameObjectQueryBody({
          entry: TRANSPORTS_STRAIGHT_ENTRY,
          type: 15,
          data: { 0: TRANSPORTS_STRAIGHT_PATH, 1: 30, 2: 5, 6: 1 },
        }),
      );
      expect(
        rig.handle.state().templates.get(TRANSPORTS_STRAIGHT_ENTRY),
      ).toMatchObject({ taxiPathId: TRANSPORTS_STRAIGHT_PATH, mapId: 1 });
      void NODES;
    } finally {
      rig.dispose();
    }
  });

  test("a missing template row is not a transport", () => {
    const { rig } = rigWithEvents(0);
    try {
      rig.inject(
        GameOpcode.SMSG_GAMEOBJECT_QUERY_RESPONSE,
        transportsMissingQueryBody(999),
      );
      expect(rig.handle.state().templates.has(999)).toBe(false);
    } finally {
      rig.dispose();
    }
  });

  test("data loads from the DBC source at runtime", async () => {
    const rig = areaRig("transports", {
      now: () => 0,
      selfGuid: SELF,
      dbc: transportsDbc(NODES),
    });
    await flushMicrotasks();
    try {
      expect(rig.handle.state().data.status).toBe("ready");
    } finally {
      rig.dispose();
    }
  });

  test("without a DBC source the data is unavailable", () => {
    const { rig } = rigWithEvents(0);
    try {
      expect(rig.handle.state().data.status).toBe("missing");
    } finally {
      rig.dispose();
    }
  });
});
