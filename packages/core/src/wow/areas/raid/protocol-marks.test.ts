import { describe, expect, test } from "bun:test";
import {
  raidMinimapPingBody,
  raidTargetListBody,
  raidTargetSetBody,
} from "#test-support/areas/raid";
import {
  buildMinimapPing,
  buildRaidTargetRequest,
  buildRaidTargetUpdate,
  parseMinimapPing,
  parseRaidTargetUpdate,
} from "#wow/areas/raid/protocol-marks";
import { PacketReader } from "#wow/protocol/packet";

const TOM = 0x10n;
const LYNX = 0xf130000123000045n;

function read(body: Uint8Array) {
  return parseRaidTargetUpdate(new PacketReader(body));
}

describe("raid target server forms", () => {
  test("kind 0 carries who, one icon and its target", () => {
    expect(read(raidTargetSetBody(TOM, 7, LYNX))).toEqual({
      icon: 7,
      kind: "set",
      target: LYNX,
      who: TOM,
    });
  });

  test("kind 1 with no pairs is an empty list", () => {
    expect(read(raidTargetListBody([]))).toEqual({ entries: [], kind: "list" });
  });

  test("kind 1 reads all eight pairs", () => {
    const entries = Array.from({ length: 8 }, (_, icon) => ({
      icon,
      target: BigInt(icon + 1),
    }));
    expect(read(raidTargetListBody(entries))).toEqual({
      entries,
      kind: "list",
    });
  });
});

describe("minimap ping server form", () => {
  test("it is a guid and two floats", () => {
    expect(
      parseMinimapPing(
        new PacketReader(raidMinimapPingBody(TOM, -9464.5, 62.25)),
      ),
    ).toEqual({ guid: TOM, x: -9464.5, y: 62.25 });
  });
});

describe("marks client forms", () => {
  test("an update is the icon byte and the guid", () => {
    const body = buildRaidTargetUpdate(7, LYNX);
    expect(body).toHaveLength(9);
    expect(body[0]).toBe(7);
    expect(new DataView(body.buffer).getBigUint64(1, true)).toBe(LYNX);
  });

  test("a request is 0xFF with no guid", () => {
    expect([...buildRaidTargetRequest()]).toEqual([0xff]);
  });

  test("a ping is two floats", () => {
    const body = buildMinimapPing(1.5, -2.5);
    const view = new DataView(body.buffer);
    expect(body).toHaveLength(8);
    expect(view.getFloat32(0, true)).toBe(1.5);
    expect(view.getFloat32(4, true)).toBe(-2.5);
  });
});
