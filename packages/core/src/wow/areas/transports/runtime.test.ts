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
import { ControlRuntime } from "#wow/control";
import { feedControl } from "#wow/control-feed";
import { GameOpcode } from "#wow/protocol/opcodes";

const SELF = 0xf1_30_00_00_00_00_00_01n;

function dockedRig(now: () => number) {
  return areaRig("transports", {
    now,
    selfGuid: SELF,
    dbc: transportsDbc({ nodes: TRANSPORTS_STRAIGHT_NODES }),
  });
}

async function seedMotion(rig: ReturnType<typeof dockedRig>, guid: bigint) {
  rig.inject(
    GameOpcode.SMSG_UPDATE_OBJECT,
    transportsCreateBody({
      guid,
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
  await flushMicrotasks();
}

describe("transports board and leave", () => {
  test("board refuses without transport data", async () => {
    const rig = dockedRig(() => 0);
    try {
      await flushMicrotasks();
      const outcome = await rig.handle.act.board(0xf1_20_00_00_00_00_00_01n);
      expect(outcome).toEqual({
        status: "refused",
        reason: "transport_data_missing",
      });
    } finally {
      rig.dispose();
    }
  });

  test("board refuses while the transport is moving", async () => {
    const now = { at: 1000 };
    const guid = transportsGuid(MO_TRANSPORT_HIGH, 0x14);
    const rig = dockedRig(() => now.at);
    try {
      await seedMotion(rig, guid);
      let mid: ReturnType<typeof rig.handle.act.poseAt>;
      for (const at of [2000, 5000, 10_000, 30_000, 60_000, 120_000]) {
        now.at = at;
        mid = rig.handle.act.poseAt(guid);
        if (mid?.moving) break;
      }
      expect(mid?.moving).toBe(true);
      const outcome = await rig.handle.act.board(guid);
      expect(outcome).toEqual({ status: "refused", reason: "not_docked" });
    } finally {
      rig.dispose();
    }
  });

  test("map_change fires from the transfer pending transport fields", async () => {
    const rig = dockedRig(() => 0);
    try {
      await flushMicrotasks();
      const seen: unknown[] = [];
      rig.handle.onEvent((event) => {
        if (event.type === "map_change") seen.push(event);
      });
      rig.stores.self.receive({
        type: "transfer_pending",
        mapId: 530,
        transport: { entry: 20_808, fromMap: 1 },
      });
      expect(seen).toEqual([
        { type: "map_change", entry: 20_808, fromMap: 1, toMap: 530 },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("board and leave run through control and write boarded and left", async () => {
    const guid = transportsGuid(MO_TRANSPORT_HIGH, 0x14);
    const rig = dockedRig(() => 1000);
    const sent: number[] = [];
    const control = new ControlRuntime({
      ground: { height: () => 5, pathClear: () => false },
      now: () => 1000,
      selfGuid: () => SELF,
      send: (opcode) => sent.push(opcode),
      ticks: () => 1000,
    });
    rig.stores.self.onEvent((event) => feedControl(control, event));
    try {
      await seedMotion(rig, guid);
      control.loginVerified({ mapId: 1, orientation: 0, x: 103, y: 2, z: 1 });
      const events: string[] = [];
      rig.handle.onEvent((event) => events.push(event.type));
      expect(await rig.handle.act.board(guid)).toEqual({ status: "ok" });
      expect(await rig.handle.act.leave()).toEqual({ status: "ok" });
      expect(events).toEqual(["boarded", "left"]);
      expect(
        sent.filter((op) => op === GameOpcode.CMSG_MOVE_CHNG_TRANSPORT),
      ).toHaveLength(2);
      expect(await rig.handle.act.leave()).toEqual({
        status: "refused",
        reason: "not_boarded",
      });
    } finally {
      rig.dispose();
    }
  });
});
