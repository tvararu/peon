import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { info, oracle, setup } from "#test-support/control-fixtures";
import { must } from "#test-support/must";
import { seatWorldPose } from "#wow/control-ride";
import type { DeckPose } from "#wow/control-transport";
import { MovementFlag } from "#wow/protocol/entity-fields";
import { parseMovementInfo } from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";
import type { SelfEvent } from "#wow/self-store";

const TRANSPORT = 0xf1_20_00_3e_ad_de_00_01n;

type Board = Extract<SelfEvent, { type: "transport_board" }>;

function board(over: Partial<Board> = {}): Board {
  const pose = {
    mapId: 530,
    moving: false,
    orientation: 0,
    x: 8709.46,
    y: -6671.76,
    z: 70.34,
  };
  return {
    guid: TRANSPORT,
    poseAt: () => ({ ...pose }),
    type: "transport_board",
    ...over,
  };
}

function rootBlock(sent: { body: Uint8Array }[]) {
  const r = new PacketReader(must(sent.at(-1)).body);
  r.packedGuidBig();
  r.uint32LE();
  return parseMovementInfo(r);
}

function transportOf(body: Uint8Array) {
  const r = new PacketReader(body);
  r.packedGuidBig();
  return parseMovementInfo(r);
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});
describe("transport ride in control", () => {
  test("the leave event carries the ground pose and allows movement", () => {
    const { runtime, events } = setup({
      ground: oracle({ height: () => 50 }),
    });
    runtime.transportBoard(board());
    events.length = 0;
    runtime.transportLeave();
    const left = events.find((event) => event.type === "control_changed");
    expect(left?.state.movementAllowed).toBe(true);
    expect(left?.state.blockedReason).toBeUndefined();
    expect(left?.state.pose?.z).toBeCloseTo(50, 4);
  });
  test("boarding sends one CMSG_MOVE_CHNG_TRANSPORT with ON_TRANSPORT (MovementHandler.cpp:362-408)", () => {
    const { runtime, sent } = setup();
    sent.length = 0;
    runtime.transportBoard(board());
    expect(sent).toHaveLength(1);
    expect(must(sent[0]).opcode).toBe(GameOpcode.CMSG_MOVE_CHNG_TRANSPORT);
    const parsed = transportOf(must(sent[0]).body);
    expect(parsed.flags & MovementFlag.ON_TRANSPORT).toBe(
      MovementFlag.ON_TRANSPORT,
    );
    expect(parsed.transport?.guid).toBe(TRANSPORT);
    expect(parsed.transport?.x).toBeCloseTo(0, 4);
    expect(parsed.transport?.seat).toBe(0);
    expect(parsed.x).toBeCloseTo(8709.46, 2);
    expect(parsed.y).toBeCloseTo(-6671.76, 2);
  });

  test("the world position without ON_TRANSPORT stays on the ground after the ride", () => {
    const { runtime, sent } = setup();
    sent.length = 0;
    runtime.transportBoard(board());
    runtime.transportLeave();
    expect(sent).toHaveLength(2);
    const parsed = transportOf(must(sent[1]).body);
    expect(parsed.flags & MovementFlag.ON_TRANSPORT).toBe(0);
    expect(parsed.transport).toBeUndefined();
    expect(parsed.x).toBeCloseTo(8709.46, 2);
    expect(parsed.y).toBeCloseTo(-6671.76, 2);
  });

  test("boarding at the current place keeps the rotated offset (SR3-vehicles-46)", () => {
    const { runtime, sent } = setup();
    sent.length = 0;
    runtime.transportBoard(
      board({
        poseAt: () => ({
          mapId: 530,
          moving: false,
          orientation: Math.PI / 2,
          x: 8709.46 + 10,
          y: -6671.76,
          z: 70.34,
        }),
      }),
    );
    const parsed = transportOf(must(sent[0]).body);
    expect(parsed.transport?.x).toBeCloseTo(0, 4);
    expect(parsed.transport?.y).toBeCloseTo(10, 4);
    expect(parsed.transport?.z).toBeCloseTo(0, 4);
  });

  test("a missing pose refuses without sending", () => {
    const { runtime, sent } = setup();
    sent.length = 0;
    expect(() =>
      runtime.transportBoard(board({ poseAt: () => undefined })),
    ).toThrow("transport_data_missing");
    expect(sent).toHaveLength(0);
  });

  test("a moving transport refuses without sending", () => {
    const { runtime, sent } = setup();
    sent.length = 0;
    expect(() =>
      runtime.transportBoard(
        board({
          poseAt: () => ({
            mapId: 530,
            moving: true,
            orientation: 0,
            x: 8709.46,
            y: -6671.76,
            z: 70.34,
          }),
        }),
      ),
    ).toThrow("not_docked");
    expect(sent).toHaveLength(0);
  });

  test("leaving from a moving transport refuses", () => {
    const { runtime, sent } = setup();
    sent.length = 0;
    let moving = false;
    runtime.transportBoard(
      board({
        poseAt: () => ({
          mapId: 530,
          moving,
          orientation: 0,
          x: 8709.46,
          y: -6671.76,
          z: 70.34,
        }),
      }),
    );
    moving = true;
    expect(() => runtime.transportLeave()).toThrow("not_docked");
    expect(sent).toHaveLength(1);
  });

  test("the pose follows the transport while the ride lasts", () => {
    const { runtime } = setup();
    let x = 8709.46;
    runtime.transportBoard(
      board({
        poseAt: () => ({
          mapId: 530,
          moving: false,
          orientation: 0,
          x,
          y: -6671.76,
          z: 70.34,
        }),
      }),
    );
    x += 40;
    expect(runtime.snapshot().pose?.x).toBeCloseTo(8749.46, 2);
  });

  test("a same-map world change keeps the transport ride", () => {
    const { runtime, sent } = setup();
    sent.length = 0;
    runtime.transportBoard(board());
    runtime.newWorld({
      mapId: 530,
      orientation: 0,
      x: 8709.46,
      y: -6671.76,
      z: 70.34,
    });
    sent.length = 0;
    runtime.forceRoot(6);
    const r = new PacketReader(must(sent.at(-1)).body);
    r.packedGuidBig();
    r.uint32LE();
    expect(parseMovementInfo(r).transport?.guid).toBe(TRANSPORT);
    expect(runtime.snapshot().movementAllowed).toBe(false);
    expect(() => runtime.move("forward", 10)).toThrow();
  });
  test("a same-transport teleport keeps the ride and adopts the offset (Transport.cpp:623-635)", () => {
    const { runtime, sent } = setup();
    sent.length = 0;
    runtime.transportBoard(board());
    runtime.nearTeleport(
      info({
        flags: MovementFlag.ON_TRANSPORT,
        orientation: 0,
        transport: {
          guid: TRANSPORT,
          orientation: 0,
          seat: 0,
          time: 44,
          x: 1,
          y: 2,
          z: 3,
        },
        x: 8709.46,
        y: -6671.76,
        z: 73.34,
      }),
    );
    expect(runtime.snapshot().pose?.x).toBeCloseTo(8709.46 + 1, 2);
    expect(runtime.snapshot().pose?.y).toBeCloseTo(-6671.76 + 2, 2);
    sent.length = 0;
    runtime.forceRoot(6);
    const r = new PacketReader(must(sent.at(-1)).body);
    r.packedGuidBig();
    r.uint32LE();
    const parsed = parseMovementInfo(r);
    expect(parsed.transport?.x).toBeCloseTo(1, 4);
    expect(parsed.transport?.z).toBeCloseTo(3, 4);
  });

  test("boarding another transport after a same-transport teleport names the new transport", () => {
    const other = 0xf1_20_00_3e_ad_de_00_02n;
    const { runtime, sent } = setup();
    runtime.transportBoard(board());
    runtime.nearTeleport(
      info({
        flags: MovementFlag.ON_TRANSPORT,
        orientation: 0,
        transport: {
          guid: TRANSPORT,
          orientation: 0,
          seat: 0,
          time: 44,
          x: 1,
          y: 2,
          z: 3,
        },
        x: 8709.46,
        y: -6671.76,
        z: 73.34,
      }),
    );
    sent.length = 0;
    runtime.transportBoard(
      board({
        guid: other,
        poseAt: () => ({
          mapId: 530,
          moving: false,
          orientation: 0,
          x: 8715.46,
          y: -6671.76,
          z: 70.34,
        }),
      }),
    );
    expect(sent).toHaveLength(1);
    const parsed = transportOf(must(sent[0]).body);
    expect(parsed.transport?.guid).toBe(other);
    expect(parsed.transport?.x).toBeCloseTo(-5, 4);
    expect(parsed.transport?.y).toBeCloseTo(2, 4);
    expect(parsed.transport?.z).toBeCloseTo(3, 4);
    sent.length = 0;
    runtime.forceRoot(7);
    const r = new PacketReader(must(sent.at(-1)).body);
    r.packedGuidBig();
    r.uint32LE();
    expect(parseMovementInfo(r).transport?.guid).toBe(other);
  });

  test("a teleport without the transport block ends the ride", () => {
    const { runtime, sent } = setup();
    sent.length = 0;
    runtime.transportBoard(board());
    runtime.nearTeleport(info({ x: 1, y: 2, z: 3 }));
    sent.length = 0;
    runtime.forceRoot(6);
    const r = new PacketReader(must(sent.at(-1)).body);
    r.packedGuidBig();
    r.uint32LE();
    expect(parseMovementInfo(r).transport).toBeUndefined();
  });

  test("an unrelated cross-map world change ends the transport ride", () => {
    const { runtime, sent } = setup();
    sent.length = 0;
    runtime.transportBoard(board());
    runtime.handleTransferPending();
    runtime.newWorld({ mapId: 571, orientation: 0, x: 1, y: 2, z: 3 });
    sent.length = 0;
    runtime.forceRoot(6);
    const r = new PacketReader(must(sent.at(-1)).body);
    r.packedGuidBig();
    r.uint32LE();
    expect(parseMovementInfo(r).transport).toBeUndefined();
  });

  test("a transport-driven cross-map change keeps the deck-local numbers out of the world pose (Player.cpp:1634-1640)", () => {
    const { runtime, sent, events } = setup();
    let at: DeckPose = {
      mapId: 530,
      moving: false,
      orientation: 0,
      x: 8709.46,
      y: -6671.76,
      z: 70.34,
    };
    runtime.transportBoard(board({ poseAt: () => ({ ...at }) }));
    events.length = 0;
    runtime.handleTransferPending({ entry: 176_495, fromMap: 530 });
    runtime.newWorld({ mapId: 571, orientation: 0, x: 4, y: 5, z: 6 });
    const crossed = events.find(
      (event) =>
        event.type === "server_correction" && event.reason === "new_world",
    );
    expect(runtime.currentMapId()).toBe(571);
    for (const pose of [crossed?.state.pose, runtime.snapshot().pose]) {
      expect(pose?.x).toBeCloseTo(8709.46, 2);
      expect(pose?.y).toBeCloseTo(-6671.76, 2);
      expect(pose?.stale).toBe(true);
    }
    expect(runtime.snapshot().movementAllowed).toBe(false);
    sent.length = 0;
    runtime.forceRoot(6);
    const local = rootBlock(sent);
    expect(local.flags & MovementFlag.ON_TRANSPORT).not.toBe(0);
    expect(local.transport?.guid).toBe(TRANSPORT);
    expect(local.transport?.x).toBeCloseTo(4, 4);
    expect(local.transport?.y).toBeCloseTo(5, 4);
    expect(local.transport?.z).toBeCloseTo(6, 4);
    expect(local.x).toBeCloseTo(8709.46, 2);
    expect(local.y).toBeCloseTo(-6671.76, 2);
    expect(() => runtime.transportLeave()).toThrow("not_docked");
    at = { ...at, mapId: 530, x: 1, y: 2 };
    expect(runtime.snapshot().pose?.stale).toBe(true);
    at = {
      mapId: 571,
      moving: false,
      orientation: Math.PI / 2,
      x: 100,
      y: 200,
      z: 30,
    };
    const world = seatWorldPose(at, { x: 4, y: 5, z: 6 });
    const pose = runtime.snapshot().pose;
    expect(pose?.mapId).toBe(571);
    expect(pose?.x).toBeCloseTo(world.x, 4);
    expect(pose?.y).toBeCloseTo(world.y, 4);
    expect(pose?.z).toBeCloseTo(world.z, 4);
    expect(pose?.stale).toBeUndefined();
    sent.length = 0;
    runtime.forceRoot(7);
    const arrived = rootBlock(sent);
    expect(arrived.transport?.x).toBeCloseTo(4, 4);
    expect(arrived.x).toBeCloseTo(world.x, 4);
    expect(arrived.y).toBeCloseTo(world.y, 4);
  });

  test("the teleport ack after a cross-map transfer restores the world pose until the transport pose arrives", () => {
    const { runtime } = setup();
    runtime.transportBoard(board());
    runtime.handleTransferPending({ entry: 176_495, fromMap: 530 });
    runtime.newWorld({ mapId: 571, orientation: 0, x: 4, y: 5, z: 6 });
    runtime.teleportAck({
      counter: 3,
      guid: 0x0764n,
      info: info({
        flags: MovementFlag.ON_TRANSPORT,
        transport: {
          guid: TRANSPORT,
          orientation: 0,
          seat: 0,
          time: 1,
          x: 4,
          y: 5,
          z: 6,
        },
        x: 1800,
        y: 300,
        z: 40,
      }),
    });
    const pose = runtime.snapshot().pose;
    expect(pose?.x).toBeCloseTo(1800, 2);
    expect(pose?.y).toBeCloseTo(300, 2);
    expect(pose?.stale).toBeUndefined();
  });

  test("a refused leave keeps the ride so a later leave succeeds", () => {
    const { runtime, sent } = setup();
    let moving = false;
    runtime.transportBoard(
      board({
        poseAt: () => ({
          mapId: 530,
          moving,
          orientation: 0,
          x: 8709.46,
          y: -6671.76,
          z: 70.34,
        }),
      }),
    );
    moving = true;
    expect(() => runtime.transportLeave()).toThrow("not_docked");
    expect(runtime.snapshot().movementAllowed).toBe(false);
    moving = false;
    sent.length = 0;
    runtime.transportLeave();
    expect(sent).toHaveLength(1);
  });

  test("a leave without a ground oracle keeps the ride", () => {
    const { runtime, sent } = setup({ ground: undefined });
    runtime.transportBoard(board());
    expect(() => runtime.transportLeave()).toThrow("ground_height_unavailable");
    expect(runtime.snapshot().movementAllowed).toBe(false);
    expect(
      sent.filter((s) => s.opcode === GameOpcode.CMSG_MOVE_CHNG_TRANSPORT),
    ).toHaveLength(1);
  });

  test("leaving after a same-transport teleport sends no transport block", () => {
    const { runtime, sent } = setup();
    runtime.transportBoard(board());
    runtime.nearTeleport(
      info({
        flags: MovementFlag.ON_TRANSPORT,
        orientation: 0,
        transport: {
          guid: TRANSPORT,
          orientation: 0,
          seat: 0,
          time: 44,
          x: 1,
          y: 2,
          z: 3,
        },
        x: 8709.46,
        y: -6671.76,
        z: 73.34,
      }),
    );
    sent.length = 0;
    runtime.transportLeave();
    const parsed = transportOf(must(sent[0]).body);
    expect(parsed.flags & MovementFlag.ON_TRANSPORT).toBe(0);
    expect(parsed.transport).toBeUndefined();
  });
});
