import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { buildAlterAppearance } from "#wow/areas/character/protocol";
import { buildCharDelete } from "#wow/areas/character/select";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketWriter } from "#wow/protocol/packet";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function playedBody(): Uint8Array {
  const w = new PacketWriter(9);
  w.uint32LE(100);
  w.uint32LE(20);
  w.uint8(0);
  return w.finish();
}

describe("character runtime", () => {
  test("playedTime sends the request and returns both counters", async () => {
    const rig = areaRig("character");
    try {
      const pending = rig.handle.act.playedTime();
      await flush();
      expect(rig.sent).toEqual([
        { body: new Uint8Array([0]), opcode: GameOpcode.CMSG_PLAYED_TIME },
      ]);
      rig.inject(GameOpcode.SMSG_PLAYED_TIME, playedBody());
      expect(await pending).toEqual({
        levelSeconds: 20,
        totalSeconds: 100,
        trigger: false,
      });
    } finally {
      rig.dispose();
    }
  });

  test("setSheathed and visibility sends fire without waiting", async () => {
    const rig = areaRig("character");
    try {
      rig.handle.act.setSheathed("melee");
      rig.handle.act.setHelmShown(false);
      rig.handle.act.setCloakShown(true);
      await flush();
      expect(rig.sent.map((s) => s.opcode)).toEqual([
        GameOpcode.CMSG_SET_SHEATHED,
        GameOpcode.CMSG_TOGGLE_HELM,
        GameOpcode.CMSG_TOGGLE_CLOAK,
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("styleAtBarber refuses without a seat and sends when seated", async () => {
    const rig = areaRig("character");
    try {
      const style = { color: 1, facialHair: 2, hair: 3, skinColor: 4 };
      const refused = rig.handle.act.styleAtBarber(style);
      await expect(refused).rejects.toThrow("not_seated");
      rig.inject(GameOpcode.SMSG_ENABLE_BARBER_SHOP, new Uint8Array(0));
      const pending = rig.handle.act.styleAtBarber(style);
      await flush();
      expect(rig.sent).toEqual([
        {
          body: buildAlterAppearance(style),
          opcode: GameOpcode.CMSG_ALTER_APPEARANCE,
        },
      ]);
      const w = new PacketWriter(4);
      w.uint32LE(0);
      rig.inject(GameOpcode.SMSG_BARBER_SHOP_RESULT, w.finish());
      expect(await pending).toEqual({ code: 0, result: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("deleteCharacter sends the guid and reports the reply", async () => {
    const rig = areaRig("character");
    try {
      const pending =
        rig.handle.act.deleteCharacter(0x00_00_00_01_00_00_00_42n);
      await flush();
      expect(rig.sent).toEqual([
        {
          body: buildCharDelete(0x00_00_00_01_00_00_00_42n),
          opcode: GameOpcode.CMSG_CHAR_DELETE,
        },
      ]);
      rig.inject(GameOpcode.SMSG_CHAR_DELETE, new Uint8Array([0x47]));
      expect(await pending).toEqual("success");
    } finally {
      rig.dispose();
    }
  });
});
