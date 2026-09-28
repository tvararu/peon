import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { GameOpcode } from "#wow/protocol/opcodes";

describe("login runtime", () => {
  test("keepAlive sends one empty CMSG_KEEP_ALIVE (WorldSocket.cpp:452-462)", () => {
    const rig = areaRig("login");
    try {
      rig.handle.act.keepAlive();
      expect(rig.sent).toEqual([
        { body: new Uint8Array(0), opcode: GameOpcode.CMSG_KEEP_ALIVE },
      ]);
    } finally {
      rig.dispose();
    }
  });
});
