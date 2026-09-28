import { describe, expect, test } from "bun:test";
import {
  BASE_CREATE_SPEEDS,
  unitmotionLivingBlock,
} from "#test-support/areas/unitmotion";
import {
  CREATE_SPEED_ORDER,
  parseMovementBlock,
} from "#wow/protocol/movement-block";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";

describe("parseMovementBlock speeds", () => {
  test("a living block keeps all nine speeds in the write order of Object.cpp:358-366", () => {
    const w = unitmotionLivingBlock(new PacketWriter());
    const r = new PacketReader(w.finish());
    const block = parseMovementBlock(r);
    expect(CREATE_SPEED_ORDER).toEqual([
      "walk",
      "run",
      "run_back",
      "swim",
      "swim_back",
      "flight",
      "flight_back",
      "turn",
      "pitch",
    ]);
    const speeds = CREATE_SPEED_ORDER.map((kind) => block.speeds?.[kind]);
    expect(speeds).toEqual(BASE_CREATE_SPEEDS.map((v) => Math.fround(v)));
    expect(block.runSpeed).toBe(7);
    expect(block.runBackSpeed).toBe(4.5);
    expect(block.turnRate).toBe(Math.fround(3.141_594));
    expect(r.remaining).toBe(0);
  });

  test("distinct speeds land on their own kinds", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const w = unitmotionLivingBlock(new PacketWriter(), { speeds: values });
    const block = parseMovementBlock(new PacketReader(w.finish()));
    expect(block.speeds).toEqual({
      walk: 1,
      run: 2,
      run_back: 3,
      swim: 4,
      swim_back: 5,
      flight: 6,
      flight_back: 7,
      turn: 8,
      pitch: 9,
    });
  });

  test("a block without LIVING has no speeds", () => {
    const w = new PacketWriter();
    w.uint16LE(0);
    expect(parseMovementBlock(new PacketReader(w.finish())).speeds).toBe(
      undefined,
    );
  });
});
