import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  MO_TRANSPORT_HIGH,
  TRANSPORTS_STRAIGHT_ENTRY,
  TRANSPORTS_STRAIGHT_NODES,
  TRANSPORTS_STRAIGHT_PATH,
  transportsCreateBody,
  transportsDbc,
  transportsGameObjectQueryBody,
  transportsGuid,
} from "#test-support/areas/transports";
import { flushMicrotasks } from "#test-support/microtasks";
import { must } from "#test-support/must";
import { GameOpcode } from "#wow/protocol/opcodes";

const SELF = 0xf1_30_00_00_00_00_00_01n;
const MOTION = transportsGuid(MO_TRANSPORT_HIGH, 0x14);

describe("transports pose", () => {
  test("poseAt advances the stored progress by the elapsed time", async () => {
    let now = 1_000_000;
    const rig = areaRig("transports", {
      now: () => now,
      selfGuid: SELF,
      dbc: transportsDbc({ nodes: TRANSPORTS_STRAIGHT_NODES }),
    });
    try {
      await flushMicrotasks();
      rig.inject(
        GameOpcode.SMSG_UPDATE_OBJECT,
        transportsCreateBody({
          guid: MOTION,
          entry: TRANSPORTS_STRAIGHT_ENTRY,
          pathProgress: 5000,
          pose: { x: 100, y: 0, z: 0, orientation: 3.14 },
        }),
      );
      rig.inject(
        GameOpcode.SMSG_GAMEOBJECT_QUERY_RESPONSE,
        transportsGameObjectQueryBody({
          entry: TRANSPORTS_STRAIGHT_ENTRY,
          type: 15,
          data: { 0: TRANSPORTS_STRAIGHT_PATH, 1: 10, 2: 5, 6: 1 },
        }),
      );
      now += 5500;
      const at = rig.handle.act.poseAt(MOTION);
      expect(must(at).moving).toBe(true);
      expect(must(at).x).toBeCloseTo(138.262, 2);
    } finally {
      rig.dispose();
    }
  });

  test("poseAt at the stop window waits at the node", async () => {
    let now = 0;
    const rig = areaRig("transports", {
      now: () => now,
      selfGuid: SELF,
      dbc: transportsDbc({ nodes: TRANSPORTS_STRAIGHT_NODES }),
    });
    try {
      await flushMicrotasks();
      rig.inject(
        GameOpcode.SMSG_UPDATE_OBJECT,
        transportsCreateBody({
          guid: MOTION,
          entry: TRANSPORTS_STRAIGHT_ENTRY,
          pathProgress: 0,
          pose: { x: 100, y: 0, z: 0, orientation: 0 },
        }),
      );
      rig.inject(
        GameOpcode.SMSG_GAMEOBJECT_QUERY_RESPONSE,
        transportsGameObjectQueryBody({
          entry: TRANSPORTS_STRAIGHT_ENTRY,
          type: 15,
          data: { 0: TRANSPORTS_STRAIGHT_PATH, 1: 10, 2: 5, 6: 1 },
        }),
      );
      now += 1000;
      const at = rig.handle.act.poseAt(MOTION);
      expect(must(at)).toMatchObject({ moving: false, x: 100, y: 0, z: 0 });
    } finally {
      rig.dispose();
    }
  });

  test("poseAt wraps the server progress at the uint32 boundary", async () => {
    let now = 0;
    const rig = areaRig("transports", {
      now: () => now,
      selfGuid: SELF,
      dbc: transportsDbc({ nodes: TRANSPORTS_STRAIGHT_NODES }),
    });
    try {
      await flushMicrotasks();
      rig.inject(
        GameOpcode.SMSG_UPDATE_OBJECT,
        transportsCreateBody({
          guid: MOTION,
          entry: TRANSPORTS_STRAIGHT_ENTRY,
          pathProgress: 4_294_967_290,
          pose: { x: 100, y: 0, z: 0, orientation: 0 },
        }),
      );
      rig.inject(
        GameOpcode.SMSG_GAMEOBJECT_QUERY_RESPONSE,
        transportsGameObjectQueryBody({
          entry: TRANSPORTS_STRAIGHT_ENTRY,
          type: 15,
          data: { 0: TRANSPORTS_STRAIGHT_PATH, 1: 10, 2: 5, 6: 1 },
        }),
      );
      now += 10;
      expect(must(rig.handle.act.poseAt(MOTION))).toMatchObject({
        moving: false,
        x: 100,
        y: 0,
        z: 0,
      });
    } finally {
      rig.dispose();
    }
  });

  test("poseAt without a template is undefined", async () => {
    const rig = areaRig("transports", {
      now: () => 0,
      selfGuid: SELF,
      dbc: transportsDbc({ nodes: TRANSPORTS_STRAIGHT_NODES }),
    });
    try {
      await flushMicrotasks();
      rig.inject(
        GameOpcode.SMSG_UPDATE_OBJECT,
        transportsCreateBody({
          guid: MOTION,
          entry: 123_456,
          pathProgress: 0,
          pose: { x: 0, y: 0, z: 0, orientation: 0 },
        }),
      );
      expect(rig.handle.act.poseAt(MOTION)).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("poseAt without data is undefined", () => {
    const rig = areaRig("transports", { now: () => 0, selfGuid: SELF });
    try {
      rig.inject(
        GameOpcode.SMSG_UPDATE_OBJECT,
        transportsCreateBody({
          guid: MOTION,
          entry: TRANSPORTS_STRAIGHT_ENTRY,
          pathProgress: 0,
          pose: { x: 0, y: 0, z: 0, orientation: 0 },
        }),
      );
      expect(rig.handle.act.poseAt(MOTION)).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("poseAt for an unknown guid is undefined", async () => {
    const rig = areaRig("transports", {
      now: () => 0,
      selfGuid: SELF,
      dbc: transportsDbc({ nodes: TRANSPORTS_STRAIGHT_NODES }),
    });
    try {
      await flushMicrotasks();
      expect(rig.handle.act.poseAt(MOTION)).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });
});
