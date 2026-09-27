import { describe, expect, test } from "bun:test";
import { bytes } from "#test-support/hex";
import { PacketReader } from "#wow/protocol/packet";
import { parseInitWorldStates } from "#wow/protocol/world-states";

const sunstrider = bytes(
  "12 02 00 00 66 0d 00 00 67 0d 00 00 02 00 77 0c 00 00 01 00 00 00 d8 08 00 00 00 00 00 00",
);
const goldshire = bytes("00 00 00 00 0c 00 00 00 57 00 00 00 00 00");
const truncated = bytes(
  "12 02 00 00 66 0d 00 00 67 0d 00 00 01 00 77 0c 00 00",
);

describe("parseInitWorldStates", () => {
  test("reads map, zone, area and every state", () => {
    expect(parseInitWorldStates(new PacketReader(sunstrider))).toEqual({
      mapId: 530,
      zoneId: 3430,
      areaId: 3431,
      states: [
        { state: 3191, value: 1 },
        { state: 2264, value: 0 },
      ],
    });
  });

  test("reads a packet with no states", () => {
    expect(parseInitWorldStates(new PacketReader(goldshire))).toEqual({
      mapId: 0,
      zoneId: 12,
      areaId: 87,
      states: [],
    });
  });

  test("throws on a truncated state list", () => {
    expect(() => parseInitWorldStates(new PacketReader(truncated))).toThrow(
      RangeError,
    );
  });
});
