import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import type { UnitEntity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";

const ME = 0x2an;
const IMAGE = 0xf1_30_00_79_d8_00_00_11n;
const OTHER = 0xf1_30_00_79_d8_00_00_12n;

function unit(guid: bigint): UnitEntity {
  return {
    class_: 8,
    displayId: 15_476,
    entry: 31_216,
    factionTemplate: 1,
    gender: 1,
    guid,
    health: 100,
    level: 80,
    maxHealth: 100,
    maxPower: [0, 0, 0, 0, 0, 0, 0],
    name: "image",
    npcFlags: 0,
    objectType: ObjectType.UNIT,
    position: undefined,
    power: [0, 0, 0, 0, 0, 0, 0],
    race: 10,
    rawFields: new Map(),
    scale: 1,
    target: 0n,
    unitFlags: 0,
  };
}

describe("sight acts", () => {
  test("requestMirrorImage refuses an unseen guid without sending", () => {
    const rig = areaRig("spells", {
      getEntity: (guid: bigint) => (guid === IMAGE ? unit(IMAGE) : undefined),
      selfGuid: ME,
    });
    try {
      expect(rig.handle.act.requestMirrorImage(OTHER)).toEqual({
        ok: false,
        reason: "not_visible",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("requestMirrorImage sends the full guid once per sighting", () => {
    const rig = areaRig("spells", {
      getEntity: (guid: bigint) => (guid === IMAGE ? unit(IMAGE) : undefined),
      selfGuid: ME,
    });
    try {
      expect(rig.handle.act.requestMirrorImage(IMAGE)).toEqual({ ok: true });
      expect(rig.sent.map((p) => p.opcode)).toEqual([
        GameOpcode.CMSG_GET_MIRRORIMAGE_DATA,
      ]);
      expect(rig.handle.act.requestMirrorImage(IMAGE)).toEqual({
        ok: false,
        reason: "already_requested",
      });
      const bytes = rig.sent.filter(
        (p) => p.opcode === GameOpcode.CMSG_GET_MIRRORIMAGE_DATA,
      );
      expect(bytes.length).toBe(1);
      expect(bytes[0]?.body.length).toBe(8);
    } finally {
      rig.dispose();
    }
  });

  test("setFarSight sends a one-byte toggle with no refusal", () => {
    const rig = areaRig("spells", { selfGuid: ME });
    try {
      expect(rig.handle.act.setFarSight(true)).toEqual({ ok: true });
      expect(rig.handle.act.setFarSight(false)).toEqual({ ok: true });
      const sent = rig.sent.filter(
        (p) => p.opcode === GameOpcode.CMSG_FAR_SIGHT,
      );
      expect(sent.map((p) => [...p.body])).toEqual([[1], [0]]);
    } finally {
      rig.dispose();
    }
  });
});
