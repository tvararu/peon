import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { lootingLootListBody } from "#test-support/areas/looting";
import { GameOpcode } from "#wow/protocol/opcodes";

const ME = 0xdcen;
const CREATURE = 0xf1_30_00_3d_28_01_28_c6n;
const OTHER = 0xf1_30_00_3d_2a_01_2a_can;

function killed() {
  const rig = areaRig("looting", { selfGuid: ME });
  for (const creature of [CREATURE, OTHER])
    rig.inject(GameOpcode.SMSG_LOOT_LIST, lootingLootListBody({ creature }));
  const owners = () => [...rig.handle.state().owners.keys()];
  return { owners, rig };
}

describe("looting runtime", () => {
  test("a creature that leaves view loses its owner", () => {
    const { owners, rig } = killed();
    try {
      rig.events.entity.emit({ guid: CREATURE, type: "disappear" });
      expect(owners()).toEqual([OTHER]);
    } finally {
      rig.dispose();
    }
  });

  test("an unheld disappear changes nothing", () => {
    const { owners, rig } = killed();
    try {
      rig.events.entity.emit({
        guid: 0xf1_30_00_00_00_00_00_01n,
        type: "disappear",
      });
      expect(owners()).toEqual([CREATURE, OTHER]);
    } finally {
      rig.dispose();
    }
  });

  test("setPassOnLoot sends one CMSG_OPT_OUT_OF_LOOT and records the request", () => {
    const rig = areaRig("looting", { selfGuid: ME });
    try {
      expect(rig.handle.state().passOnLoot).toBe(false);
      rig.handle.act.setPassOnLoot(true);
      expect(rig.sent).toEqual([
        {
          opcode: GameOpcode.CMSG_OPT_OUT_OF_LOOT,
          body: new Uint8Array([1, 0, 0, 0]),
        },
      ]);
      expect(rig.handle.state().passOnLoot).toBe(true);
      rig.handle.act.setPassOnLoot(false);
      expect(rig.sent[1]?.body).toEqual(new Uint8Array([0, 0, 0, 0]));
      expect(rig.handle.state().passOnLoot).toBe(false);
    } finally {
      rig.dispose();
    }
  });

  test("a new session starts with the pass flag off (Player.cpp:215)", () => {
    const first = areaRig("looting", { selfGuid: ME });
    first.handle.act.setPassOnLoot(true);
    first.dispose();
    const next = areaRig("looting", { selfGuid: ME });
    try {
      expect(next.handle.state().passOnLoot).toBe(false);
      expect(next.sent).toEqual([]);
    } finally {
      next.dispose();
    }
  });
});
