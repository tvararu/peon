import { describe, expect, test } from "bun:test";
import { testStores } from "#test-support/session-fixtures";
import { ControlRuntime } from "#wow/control";
import { feedControl } from "#wow/control-feed";
import { EntityStore } from "#wow/entity-store";
import { registerMovementHandlers } from "#wow/movement-handlers";
import { ObjectType } from "#wow/protocol/entity-fields";
import { writeMovementInfo } from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";
import { OpcodeDispatch } from "#wow/protocol/world";
import { RemoteMotion } from "#wow/remote-motion";
import type { WorldConn } from "#wow/world-conn";

describe("handleNearTeleport", () => {
  function nearTeleportBody(guidLow: number): Uint8Array {
    const w = new PacketWriter();
    w.packedGuid(guidLow, 0);
    writeMovementInfo(w, {
      flags: 0,
      extraFlags: 0,
      time: 1,
      x: 100,
      y: 200,
      z: 50,
      orientation: 1,
      fallTime: 0,
    });
    return w.finish();
  }

  function loginBody(): Uint8Array {
    const w = new PacketWriter();
    w.uint32LE(530);
    for (const value of [8709.46, -6671.76, 70.34, 0.5]) w.floatLE(value);
    return w.finish();
  }

  function fakeConn(store: EntityStore): WorldConn {
    return {
      dispatch: new OpcodeDispatch(),
      selfGuidLow: 0x07_64,
      selfGuidHigh: 0,
      entityStore: store,
      remoteMotion: new RemoteMotion({
        now: () => 0,
        eligible: () => false,
        dead: () => false,
        emit: () => {},
      }),
    } as unknown as WorldConn;
  }

  test("0x0C5 routes self teleport to control with exact pose", () => {
    const store = new EntityStore();
    const sent: { opcode: number; body: Uint8Array }[] = [];
    const runtime = new ControlRuntime({
      send: (opcode, body) => {
        sent.push({ opcode, body: body ?? new Uint8Array() });
      },
      ticks: () => 0,
      now: () => 10_000,
      selfGuid: () => 0x0764n,
      ground: {
        height: (_mapId, _x, _y, from) => from?.z ?? 70.34,
        pathClear: () => false,
      },
    });
    const stores = testStores();
    stores.self.onEvent((event) => feedControl(runtime, event));
    const conn = fakeConn(store);
    registerMovementHandlers(conn, stores);
    conn.dispatch.handle(
      GameOpcode.SMSG_LOGIN_VERIFY_WORLD,
      new PacketReader(loginBody()),
    );
    expect(runtime.snapshot().pose?.mapId).toBe(530);
    sent.length = 0;
    expect(conn.dispatch.has(GameOpcode.MSG_MOVE_TELEPORT)).toBe(true);
    conn.dispatch.handle(
      GameOpcode.MSG_MOVE_TELEPORT,
      new PacketReader(nearTeleportBody(0x07_64)),
    );
    expect(runtime.snapshot().moving).toBe(false);
    expect(runtime.snapshot().pose?.source).toBe("server");
    expect(runtime.snapshot().serverPose).toMatchObject({
      x: 100,
      y: 200,
      z: 50,
      orientation: 1,
    });
    expect(sent.length).toBe(0);
  });

  test("0x0C5 from another unit updates the entity store", () => {
    const store = new EntityStore();
    store.create(0x99n, ObjectType.UNIT, {
      position: { mapId: 530, x: 1, y: 2, z: 3, orientation: 0 },
    });
    let handled = 0;
    const stores = testStores();
    const conn = fakeConn(store);
    registerMovementHandlers(conn, stores);
    conn.dispatch.handle(
      GameOpcode.SMSG_LOGIN_VERIFY_WORLD,
      new PacketReader(loginBody()),
    );
    stores.self.onEvent(() => {
      handled++;
    });
    conn.dispatch.handle(
      GameOpcode.MSG_MOVE_TELEPORT,
      new PacketReader(nearTeleportBody(0x99)),
    );
    expect(handled).toBe(0);
    expect(store.get(0x99n)?.position).toEqual({
      mapId: 530,
      x: 100,
      y: 200,
      z: 50,
      orientation: 1,
    });
  });
});
