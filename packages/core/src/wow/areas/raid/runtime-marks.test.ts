import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { GameOpcode } from "#wow/protocol/opcodes";

const LYNX = 0xf130000123000045n;

function guidAt(body: Uint8Array | undefined, at: number): bigint {
  const bytes = body ?? new Uint8Array(0);
  return new DataView(bytes.buffer, bytes.byteOffset).getBigUint64(at, true);
}

describe("raid mark acts", () => {
  test("setRaidMark sends the icon and the target guid", () => {
    const rig = areaRig("raid");
    try {
      rig.handle.act.setRaidMark(7, LYNX);
      expect(rig.sent).toHaveLength(1);
      expect(rig.sent[0]?.opcode).toBe(GameOpcode.MSG_RAID_TARGET_UPDATE);
      expect(rig.sent[0]?.body[0]).toBe(7);
      expect(guidAt(rig.sent[0]?.body, 1)).toBe(LYNX);
    } finally {
      rig.dispose();
    }
  });

  test("clearRaidMark sends the icon with a zero guid", () => {
    const rig = areaRig("raid");
    try {
      rig.handle.act.clearRaidMark(2);
      expect(rig.sent).toHaveLength(1);
      expect(rig.sent[0]?.opcode).toBe(GameOpcode.MSG_RAID_TARGET_UPDATE);
      expect(rig.sent[0]?.body[0]).toBe(2);
      expect(guidAt(rig.sent[0]?.body, 1)).toBe(0n);
    } finally {
      rig.dispose();
    }
  });

  test("requestRaidMarks sends the one byte request", () => {
    const rig = areaRig("raid");
    try {
      rig.handle.act.requestRaidMarks();
      expect(rig.sent).toHaveLength(1);
      expect(rig.sent[0]?.opcode).toBe(GameOpcode.MSG_RAID_TARGET_UPDATE);
      expect([...(rig.sent[0]?.body ?? [])]).toEqual([0xff]);
    } finally {
      rig.dispose();
    }
  });

  test("pingMinimap sends the two floats", () => {
    const rig = areaRig("raid");
    try {
      rig.handle.act.pingMinimap(-9464.5, 62.25);
      expect(rig.sent).toHaveLength(1);
      expect(rig.sent[0]?.opcode).toBe(GameOpcode.MSG_MINIMAP_PING);
      const body = rig.sent[0]?.body ?? new Uint8Array(0);
      const view = new DataView(body.buffer, body.byteOffset);
      expect(body).toHaveLength(8);
      expect(view.getFloat32(0, true)).toBe(-9464.5);
      expect(view.getFloat32(4, true)).toBe(62.25);
    } finally {
      rig.dispose();
    }
  });

  test.each([-1, 8, 1.5, 255])("icon %p is refused before any send", (icon) => {
    const rig = areaRig("raid");
    try {
      expect(() => rig.handle.act.setRaidMark(icon, LYNX)).toThrow();
      expect(() => rig.handle.act.clearRaidMark(icon)).toThrow();
      expect(rig.sent).toHaveLength(0);
    } finally {
      rig.dispose();
    }
  });
});
