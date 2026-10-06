import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { GameOpcode } from "#wow/protocol/opcodes";

describe("ambience runtime", () => {
  test("sendZoneUpdate sends one CMSG_ZONEUPDATE with the zone id (MiscHandler.cpp:521-532)", () => {
    const rig = areaRig("ambience");
    try {
      rig.handle.act.sendZoneUpdate(3430);
      expect(rig.sent).toEqual([
        {
          body: new Uint8Array([0x66, 0x0d, 0x00, 0x00]),
          opcode: GameOpcode.CMSG_ZONEUPDATE,
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("act.completeCinematic and act.nextCinematicCamera send 0x0FC and 0x0FB (MiscHandler.cpp:940-950)", () => {
    const rig = areaRig("ambience");
    try {
      rig.handle.act.completeCinematic();
      rig.handle.act.nextCinematicCamera();
      expect(rig.sent).toEqual([
        { body: new Uint8Array(0), opcode: GameOpcode.CMSG_COMPLETE_CINEMATIC },
        {
          body: new Uint8Array(0),
          opcode: GameOpcode.CMSG_NEXT_CINEMATIC_CAMERA,
        },
      ]);
    } finally {
      rig.dispose();
    }
  });
});
