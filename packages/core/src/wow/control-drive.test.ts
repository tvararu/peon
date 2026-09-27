import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { LOGIN, type Sent, setup } from "#test-support/control-fixtures";
import { must } from "#test-support/must";
import { GRAVITY, JUMP_AIRTIME_MS, JUMP_VELOCITY } from "#wow/control-air";
import { MovementFlag } from "#wow/protocol/entity-fields";
import { parseMovementInfo } from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";

const { FORWARD, BACKWARD, STRAFE_RIGHT, LEFT, RIGHT, FALLING } = MovementFlag;

function decode(packet: Sent | undefined) {
  const { opcode, body } = must(packet);
  const r = new PacketReader(body);
  const guid = r.packedGuidBig();
  return { opcode, guid, ...parseMovementInfo(r) };
}

function sentSince(sent: Sent[], from: number) {
  return sent.slice(from).map((packet) => {
    const { opcode, flags } = decode(packet);
    return { opcode, flags };
  });
}

function arc(speed: number, turnRate: number, seconds: number) {
  const radius = speed / turnRate;
  const start = LOGIN.orientation;
  const end = start + turnRate * seconds;
  return {
    x: LOGIN.x + radius * (Math.sin(end) - Math.sin(start)),
    y: LOGIN.y - radius * (Math.cos(end) - Math.cos(start)),
    orientation: end,
  };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("ControlRuntime.drive", () => {
  test("forward plus turn left sends both starts and reports the arc", () => {
    const { runtime, sent, advance } = setup();
    sent.length = 0;
    runtime.drive({ move: "forward", turn: "left" }, 2000);
    expect(sentSince(sent, 0)).toEqual([
      { opcode: GameOpcode.MSG_MOVE_START_FORWARD, flags: FORWARD },
      { opcode: GameOpcode.MSG_MOVE_START_TURN_LEFT, flags: FORWARD | LEFT },
    ]);
    advance(500);
    const beat = decode(sent.at(-1));
    const expected = arc(7, Math.PI, 0.5);
    expect(beat.opcode).toBe(GameOpcode.MSG_MOVE_HEARTBEAT);
    expect(beat.flags).toBe(FORWARD | LEFT);
    expect(beat.orientation).toBeCloseTo(expected.orientation, 4);
    expect(beat.x).toBeCloseTo(expected.x, 2);
    expect(beat.y).toBeCloseTo(expected.y, 2);
    const mark = sent.length;
    runtime.drive({ move: "forward" }, 2000);
    expect(sentSince(sent, mark)).toEqual([
      { opcode: GameOpcode.MSG_MOVE_STOP_TURN, flags: FORWARD },
    ]);
    expect(decode(sent.at(-1)).orientation).toBeCloseTo(
      expected.orientation,
      4,
    );
    runtime.drive({}, 1);
    expect(decode(sent.at(-1))).toMatchObject({
      opcode: GameOpcode.MSG_MOVE_STOP,
      flags: 0,
    });
    expect(runtime.snapshot()).toMatchObject({ moving: false, input: {} });
  });

  test("each released axis sends its own stop, in order", () => {
    const { runtime, sent, advance } = setup();
    sent.length = 0;
    runtime.drive({ move: "backward", strafe: "right", turn: "right" }, 300);
    expect(sentSince(sent, 0)).toEqual([
      { opcode: GameOpcode.MSG_MOVE_START_BACKWARD, flags: BACKWARD },
      {
        opcode: GameOpcode.MSG_MOVE_START_STRAFE_RIGHT,
        flags: BACKWARD | STRAFE_RIGHT,
      },
      {
        opcode: GameOpcode.MSG_MOVE_START_TURN_RIGHT,
        flags: BACKWARD | STRAFE_RIGHT | RIGHT,
      },
    ]);
    const mark = sent.length;
    advance(300);
    expect(sentSince(sent, mark)).toEqual([
      { opcode: GameOpcode.MSG_MOVE_STOP, flags: STRAFE_RIGHT | RIGHT },
      { opcode: GameOpcode.MSG_MOVE_STOP_STRAFE, flags: RIGHT },
      { opcode: GameOpcode.MSG_MOVE_STOP_TURN, flags: 0 },
    ]);
    expect(runtime.snapshot().moving).toBe(false);
  });

  test("repeating the same input re-arms the lease without new starts", () => {
    const { runtime, sent, advance } = setup();
    sent.length = 0;
    runtime.drive({ strafe: "left" }, 400);
    advance(300);
    runtime.drive({ strafe: "left" }, 400);
    advance(300);
    expect(runtime.snapshot().moving).toBe(true);
    advance(100);
    expect(sent.map((packet) => packet.opcode)).toEqual([
      GameOpcode.MSG_MOVE_START_STRAFE_LEFT,
      GameOpcode.MSG_MOVE_HEARTBEAT,
      GameOpcode.MSG_MOVE_STOP_STRAFE,
    ]);
    expect(() => runtime.drive({ strafe: "up" as "left" }, 400)).toThrow(
      "invalid_direction",
    );
    expect(() => runtime.drive({ turn: "left" }, 10_001)).toThrow(
      "invalid_duration",
    );
  });

  test("diagonals move at the axis speed, not faster", () => {
    const forward = setup();
    forward.runtime.drive({ move: "forward", strafe: "left" }, 1000);
    forward.advance(1000);
    const ahead = must(forward.runtime.snapshot().pose);
    const aheadHeading = LOGIN.orientation + Math.PI / 4;
    expect(ahead.x).toBeCloseTo(LOGIN.x + 7 * Math.cos(aheadHeading), 4);
    expect(ahead.y).toBeCloseTo(LOGIN.y + 7 * Math.sin(aheadHeading), 4);
    const back = setup();
    back.runtime.drive({ move: "backward", strafe: "left" }, 1000);
    back.advance(1000);
    const behind = must(back.runtime.snapshot().pose);
    const behindHeading = LOGIN.orientation + (3 * Math.PI) / 4;
    expect(behind.x).toBeCloseTo(LOGIN.x + 4.5 * Math.cos(behindHeading), 4);
    expect(behind.y).toBeCloseTo(LOGIN.y + 4.5 * Math.sin(behindHeading), 4);
    expect(behind.orientation).toBeCloseTo(LOGIN.orientation, 6);
  });

  test("turning in place follows the server turn rate", () => {
    const { runtime, sent, advance } = setup();
    runtime.observeSelf({ turnRate: 2 });
    sent.length = 0;
    runtime.drive({ turn: "right" }, 500);
    advance(500);
    const stop = decode(sent.at(-1));
    expect(stop.opcode).toBe(GameOpcode.MSG_MOVE_STOP_TURN);
    expect(stop.orientation).toBeCloseTo(
      LOGIN.orientation - 1 + 2 * Math.PI,
      4,
    );
    expect(stop.x).toBeCloseTo(LOGIN.x, 2);
    expect(stop.y).toBeCloseTo(LOGIN.y, 2);
  });
});

describe("ControlRuntime.jump", () => {
  test("a standing jump sends the jump, falling heartbeats and a landing", () => {
    const { runtime, sent, advance } = setup();
    sent.length = 0;
    runtime.jump();
    const jump = decode(sent.at(-1));
    expect(jump).toMatchObject({
      opcode: GameOpcode.MSG_MOVE_JUMP,
      guid: 0x0764n,
      flags: FALLING,
      fallTime: 0,
    });
    expect(jump.z).toBeCloseTo(LOGIN.z, 4);
    const fall = must(jump.fall);
    expect(fall.zSpeed).toBeCloseTo(-JUMP_VELOCITY, 5);
    expect(fall.cosAngle).toBeCloseTo(Math.cos(LOGIN.orientation), 5);
    expect(fall.sinAngle).toBeCloseTo(Math.sin(LOGIN.orientation), 5);
    expect(fall.xySpeed).toBe(0);
    expect(runtime.snapshot()).toMatchObject({ airborne: true, moving: false });
    expect(() => runtime.jump()).toThrow("airborne");
    advance(500);
    const beat = decode(sent.at(-1));
    expect(beat).toMatchObject({
      opcode: GameOpcode.MSG_MOVE_HEARTBEAT,
      flags: FALLING,
      fallTime: 500,
    });
    const rise = JUMP_VELOCITY * 0.5 - (GRAVITY * 0.25) / 2;
    expect(beat.z).toBeCloseTo(LOGIN.z + rise, 3);
    advance(400);
    const land = decode(sent.at(-1));
    expect(land).toMatchObject({
      opcode: GameOpcode.MSG_MOVE_FALL_LAND,
      flags: 0,
      fallTime: 825,
    });
    expect(land.z).toBeCloseTo(LOGIN.z, 4);
    expect(land.fall).toBeUndefined();
    expect(runtime.snapshot().airborne).toBe(false);
    const count = sent.length;
    advance(2000);
    expect(sent).toHaveLength(count);
  });

  test("a running jump carries its speed and keeps running after landing", () => {
    const { runtime, sent, advance } = setup();
    runtime.drive({ move: "forward" }, 3000);
    sent.length = 0;
    runtime.jump();
    const jump = decode(sent.at(-1));
    expect(jump.flags).toBe(FORWARD | FALLING);
    expect(must(jump.fall).xySpeed).toBeCloseTo(7, 5);
    advance(1000);
    const opcodes = sent.map((packet) => packet.opcode);
    expect(opcodes).toContain(GameOpcode.MSG_MOVE_FALL_LAND);
    const pose = must(runtime.snapshot().pose);
    expect(pose.x).toBeCloseTo(LOGIN.x + 7 * Math.cos(LOGIN.orientation), 4);
    expect(pose.z).toBeCloseTo(LOGIN.z, 4);
    expect(runtime.snapshot()).toMatchObject({ moving: true, airborne: false });
    advance(500);
    expect(decode(sent.at(-1))).toMatchObject({
      opcode: GameOpcode.MSG_MOVE_HEARTBEAT,
      flags: FORWARD,
      fallTime: 0,
    });
  });

  test("releasing keys mid-air keeps falling until the landing", () => {
    const { runtime, sent, advance } = setup();
    runtime.drive({ strafe: "right" }, 3000);
    runtime.jump();
    runtime.drive({}, 1);
    expect(decode(sent.at(-1))).toMatchObject({
      opcode: GameOpcode.MSG_MOVE_STOP_STRAFE,
      flags: FALLING,
    });
    advance(900);
    expect(decode(sent.at(-1)).opcode).toBe(GameOpcode.MSG_MOVE_FALL_LAND);
    const pose = must(runtime.snapshot().pose);
    const heading = LOGIN.orientation - Math.PI / 2;
    const flight = (7 * JUMP_AIRTIME_MS) / 1000;
    expect(pose.x).toBeCloseTo(LOGIN.x + flight * Math.cos(heading), 4);
    expect(pose.y).toBeCloseTo(LOGIN.y + flight * Math.sin(heading), 4);
  });

  test("a server position mid-air cancels the jump", () => {
    const { runtime, sent, advance, events } = setup();
    runtime.jump();
    runtime.observeSelf({ position: { ...LOGIN, z: 80 } });
    expect(runtime.snapshot()).toMatchObject({
      airborne: false,
      pose: { z: 80, source: "server" },
    });
    expect(events.at(-1)?.type).toBe("server_correction");
    const count = sent.length;
    advance(2000);
    expect(sent).toHaveLength(count);
    runtime.jump();
    const again = decode(sent.at(-1));
    expect(again.opcode).toBe(GameOpcode.MSG_MOVE_JUMP);
    expect(again.z).toBeCloseTo(80, 4);
  });
});
