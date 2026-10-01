import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  LIFT_HIGH,
  transportsCreateBody,
  transportsDbc,
  transportsGameObjectQueryBody,
  transportsGuid,
  transportsStateBody,
} from "#test-support/areas/transports";
import { flushMicrotasks } from "#test-support/microtasks";
import { must } from "#test-support/must";
import { GameOpcode } from "#wow/protocol/opcodes";

const SELF = 0xf1_30_00_00_00_00_00_01n;
const LIFT = transportsGuid(LIFT_HIGH, 0x50);
const ENTRY = 50;
const ACTIVE = 0;
const READY = 1;
const PAUSE = 10_000;

const ANIMATIONS = [
  { entry: ENTRY, timeSeg: 0, x: 0, y: 0, z: 0 },
  { entry: ENTRY, timeSeg: PAUSE, x: 0, y: 0, z: 10 },
  { entry: ENTRY, timeSeg: 20_000, x: 0, y: 0, z: 0 },
];

async function liftRig(init: {
  state: number;
  progress: number;
  pause?: number;
  withTemplate?: boolean;
}) {
  const clock = { now: 1_000_000 };
  const rig = areaRig("transports", {
    dbc: transportsDbc({ animations: ANIMATIONS }),
    now: () => clock.now,
    selfGuid: SELF,
  });
  await flushMicrotasks();
  rig.stores.self.receive({
    position: { mapId: 1, orientation: 0, x: 0, y: 0, z: 0 },
    type: "login_verified",
  });
  rig.inject(
    GameOpcode.SMSG_UPDATE_OBJECT,
    transportsCreateBody({
      entry: ENTRY,
      guid: LIFT,
      pathProgress: init.progress,
      pose: { orientation: 0, x: 10, y: 20, z: 100 },
      state: init.state,
    }),
  );
  if (init.withTemplate !== false)
    rig.inject(
      GameOpcode.SMSG_GAMEOBJECT_QUERY_RESPONSE,
      transportsGameObjectQueryBody({
        data: { 0: init.pause ?? PAUSE },
        entry: ENTRY,
        type: 11,
      }),
    );
  return { clock, rig };
}

describe("transports lift progress", () => {
  test("a READY lift with a pause time waits at progress 0", async () => {
    const { clock, rig } = await liftRig({ progress: 0, state: READY });
    try {
      clock.now += 5000;
      expect(must(rig.handle.act.poseAt(LIFT))).toMatchObject({
        mapId: 1,
        moving: false,
        z: 100,
      });
    } finally {
      rig.dispose();
    }
  });

  test("an ACTIVE lift rises to the pause point and holds there", async () => {
    const { clock, rig } = await liftRig({ progress: 0, state: ACTIVE });
    try {
      clock.now += 5000;
      const rising = must(rig.handle.act.poseAt(LIFT));
      expect(rising.moving).toBe(true);
      expect(rising.z).toBeCloseTo(105, 3);
      clock.now += 20_000;
      const held = must(rig.handle.act.poseAt(LIFT));
      expect(held.moving).toBe(false);
      expect(held.z).toBeCloseTo(110, 3);
    } finally {
      rig.dispose();
    }
  });

  test("a state change at the pause point resumes the lift", async () => {
    const { clock, rig } = await liftRig({ progress: PAUSE, state: ACTIVE });
    try {
      clock.now += 3000;
      expect(must(rig.handle.act.poseAt(LIFT)).moving).toBe(false);
      rig.inject(
        GameOpcode.SMSG_UPDATE_OBJECT,
        transportsStateBody(LIFT, READY),
      );
      clock.now += 2000;
      const resumed = must(rig.handle.act.poseAt(LIFT));
      expect(resumed.moving).toBe(true);
      expect(resumed.z).toBeCloseTo(108, 3);
    } finally {
      rig.dispose();
    }
  });

  test("a state change before the pause point sends the lift back at once", async () => {
    const { clock, rig } = await liftRig({ progress: 0, state: ACTIVE });
    try {
      clock.now += 4000;
      rig.inject(
        GameOpcode.SMSG_UPDATE_OBJECT,
        transportsStateBody(LIFT, READY),
      );
      clock.now += 1000;
      expect(must(rig.handle.act.poseAt(LIFT))).toMatchObject({
        moving: false,
        z: 100,
      });
    } finally {
      rig.dispose();
    }
  });

  test("a lift without a pause time keeps cycling", async () => {
    const { clock, rig } = await liftRig({
      pause: 0,
      progress: 0,
      state: READY,
    });
    try {
      clock.now += 5000;
      const at = must(rig.handle.act.poseAt(LIFT));
      expect(at.moving).toBe(true);
      expect(at.z).toBeCloseTo(105, 3);
    } finally {
      rig.dispose();
    }
  });

  test("a lift without its template has no pose", async () => {
    const { rig } = await liftRig({
      progress: 0,
      state: ACTIVE,
      withTemplate: false,
    });
    try {
      expect(rig.handle.act.poseAt(LIFT)).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });
});
