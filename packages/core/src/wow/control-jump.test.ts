import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import {
  decodeMove as decode,
  LOGIN,
  oracle,
  setup,
} from "#test-support/control-fixtures";
import { must } from "#test-support/must";
import { GRAVITY, JUMP_AIRTIME_MS, JUMP_VELOCITY } from "#wow/control-air";
import type { GroundOracle } from "#wow/control-motion";
import { MovementFlag } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";

const { FORWARD, FALLING } = MovementFlag;

function along(point: { x: number; y: number }): number {
  const { orientation } = LOGIN;
  const dx = point.x - LOGIN.x;
  const dy = point.y - LOGIN.y;
  return dx * Math.cos(orientation) + dy * Math.sin(orientation);
}

function terrain(height: (d: number) => number): GroundOracle {
  return oracle({
    height: (_mapId, x, y) => height(along({ x, y })),
    pathClear: () => true,
  });
}

function touchdown(drop: number): number {
  const root = Math.sqrt(JUMP_VELOCITY ** 2 + 2 * GRAVITY * drop);
  return ((JUMP_VELOCITY + root) / GRAVITY) * 1000;
}

const open = terrain(() => LOGIN.z);

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

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
    const { runtime, sent, advance } = setup({ ground: open });
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
    const { runtime, sent, advance } = setup({ ground: open });
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

  test("a jump off a ledge falls until it meets the lower ground", () => {
    const { runtime, sent, advance } = setup({
      ground: terrain((d) => (d < 1 ? LOGIN.z : LOGIN.z - 6)),
    });
    runtime.drive({ move: "forward" }, 5000);
    runtime.jump();
    advance(900);
    const falling = decode(sent.at(-1));
    expect(falling).toMatchObject({ flags: FORWARD | FALLING });
    expect(falling.z).toBeLessThan(LOGIN.z);
    expect(sent.map((packet) => packet.opcode)).not.toContain(
      GameOpcode.MSG_MOVE_FALL_LAND,
    );
    advance(450);
    const landAt = touchdown(6);
    const land = must(
      sent.find((packet) => packet.opcode === GameOpcode.MSG_MOVE_FALL_LAND),
    );
    expect(decode(land)).toMatchObject({
      flags: FORWARD,
      fallTime: Math.round(landAt),
    });
    expect(decode(land).z).toBeCloseTo(LOGIN.z - 6, 4);
    expect(along(decode(land))).toBeCloseTo((7 * landAt) / 1000, 1);
    expect(runtime.snapshot()).toMatchObject({ airborne: false, moving: true });
  });

  test("a jump keeps its speed over a gap with no walkable ground", () => {
    const ravine = (d: number) => (d > 1 && d < 3 ? LOGIN.z - 30 : LOGIN.z);
    const { runtime, sent, advance } = setup({
      ground: terrain((d) => (d >= 3 && d < 3.5 ? Number.NaN : ravine(d))),
    });
    runtime.drive({ move: "forward" }, 5000);
    runtime.jump();
    advance(900);
    const land = decode(
      sent.find((packet) => packet.opcode === GameOpcode.MSG_MOVE_FALL_LAND),
    );
    expect(land.fallTime).toBe(825);
    expect(land.z).toBeCloseTo(LOGIN.z, 4);
    expect(along(land)).toBeCloseTo((7 * JUMP_AIRTIME_MS) / 1000, 1);
  });

  test("a running jump into a wall drops straight down", () => {
    let wall = false;
    const { runtime, sent, advance } = setup({
      ground: oracle({ pathClear: () => !wall }),
    });
    runtime.drive({ move: "forward" }, 5000);
    wall = true;
    runtime.jump();
    advance(900);
    const land = decode(
      sent.find((packet) => packet.opcode === GameOpcode.MSG_MOVE_FALL_LAND),
    );
    expect(land.x).toBeCloseTo(LOGIN.x, 2);
    expect(land.y).toBeCloseTo(LOGIN.y, 2);
  });
});
