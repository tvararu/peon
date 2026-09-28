import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { GameOpcode } from "#wow/protocol/opcodes";

describe("pets runtime", () => {
  test("requestPetInfo sends one empty CMSG_REQUEST_PET_INFO", () => {
    const rig = areaRig("pets");
    try {
      expect(rig.handle.act.requestPetInfo()).toEqual({ ok: true });
      expect(rig.sent).toEqual([
        { opcode: GameOpcode.CMSG_REQUEST_PET_INFO, body: new Uint8Array() },
      ]);
    } finally {
      rig.dispose();
    }
  });
});
