import { describe, expect, jest, test } from "bun:test";
import { decodeMove, info, LOGIN, setup } from "#test-support/control-fixtures";
import { GameOpcode } from "#wow/protocol/opcodes";

const MOVES = new Set<number>([
  GameOpcode.MSG_MOVE_START_FORWARD,
  GameOpcode.MSG_MOVE_HEARTBEAT,
  GameOpcode.MSG_MOVE_STOP,
  GameOpcode.MSG_MOVE_SET_FACING,
  GameOpcode.MSG_MOVE_JUMP,
  GameOpcode.MSG_MOVE_FALL_LAND,
]);

describe("ControlRuntime pose_sent", () => {
  test("each movement packet sent emits one pose_sent with the sent pose", () => {
    jest.useFakeTimers();
    try {
      const { runtime, sent, events, advance } = setup();
      sent.length = 0;
      events.length = 0;
      runtime.drive({ move: "forward" }, 1200);
      advance(1300);
      runtime.face(1.5);
      const moves = sent.filter((packet) => MOVES.has(packet.opcode));
      const poses = events.filter((event) => event.type === "pose_sent");
      expect(moves.length).toBeGreaterThanOrEqual(3);
      expect(poses).toHaveLength(moves.length);
      moves.forEach((packet, i) => {
        const move = decodeMove(packet);
        const pose = poses[i]?.state.pose;
        expect(pose?.mapId).toBe(LOGIN.mapId);
        expect(
          [pose?.x, pose?.y, pose?.z, pose?.orientation].map((n) =>
            Math.fround(n ?? Number.NaN),
          ),
        ).toEqual([move.x, move.y, move.z, move.orientation]);
      });
    } finally {
      jest.useRealTimers();
    }
  });

  test("an ack that is not a movement packet emits no pose_sent", () => {
    jest.useFakeTimers();
    try {
      const { runtime, sent, events } = setup();
      sent.length = 0;
      events.length = 0;
      runtime.teleportAck({ guid: 0x0764n, counter: 2, info: info() });
      expect(sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.MSG_MOVE_TELEPORT_ACK,
      ]);
      expect(events.map((event) => event.type)).not.toContain("pose_sent");
    } finally {
      jest.useRealTimers();
    }
  });
});
