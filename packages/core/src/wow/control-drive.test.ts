import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import {
  decodeMove as decode,
  LOGIN,
  type Sent,
  setup,
} from "#test-support/control-fixtures";
import { must } from "#test-support/must";
import { MovementFlag } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";

const { FORWARD, BACKWARD, STRAFE_RIGHT, LEFT, RIGHT } = MovementFlag;

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
