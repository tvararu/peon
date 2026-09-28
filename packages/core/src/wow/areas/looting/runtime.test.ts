import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { lootingLootListBody } from "#test-support/areas/looting";
import { testStores } from "#test-support/session-fixtures";
import { createModuleRuntimes, looseModule } from "#wow/areas/compose";
import type { LootingActs } from "#wow/areas/looting/runtime";
import { testPort } from "#wow/areas/port";
import { AREAS } from "#wow/areas/registry";
import type { PartyMember } from "#wow/party-store";
import { GameOpcode } from "#wow/protocol/opcodes";

const ME = 0xdcen;
const CREATURE = 0xf1_30_00_3d_28_01_28_c6n;
const OTHER = 0xf1_30_00_3d_2a_01_2a_can;

const PARTNER = 0x0_0000_0de6n;

function member(name: string, guid: bigint): PartyMember {
  return {
    name,
    guid,
    online: true,
    health: null,
    maxHealth: null,
    level: null,
    statsAt: null,
    source: null,
  };
}

function inParty() {
  const port = testPort({
    legacy: {
      party: () => ({
        inGroup: true,
        leader: null,
        loot: null,
        members: [member("Partner", PARTNER)],
      }),
      friends: () => [],
      ignored: () => [],
      guild: () => undefined,
      channels: () => [],
    },
  });
  const stores = testStores({ send: port.send });
  const own = { looting: stores.areas.looting };
  const lifetime = createModuleRuntimes(
    port,
    [looseModule(AREAS.looting)],
    own,
    stores,
  );
  const act = lifetime.runtimes["looting"]?.act as LootingActs;
  return { act, dispose: lifetime.dispose, sent: port.sent };
}

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

  test("setLootMethod sends the method, the party member's guid and the threshold (GroupHandler.cpp:518-521)", () => {
    const party = inParty();
    try {
      party.act.setLootMethod({
        method: "master_loot",
        threshold: "rare",
        master: "Partner",
      });
      expect(party.sent).toEqual([
        {
          opcode: GameOpcode.CMSG_LOOT_METHOD,
          body: new Uint8Array([
            2, 0, 0, 0, 0xe6, 0x0d, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0,
          ]),
        },
      ]);
    } finally {
      party.dispose();
    }
  });

  test("setLootMethod with no master sends guid 0", () => {
    const rig = areaRig("looting", { selfGuid: ME });
    try {
      rig.handle.act.setLootMethod({
        method: "group_loot",
        threshold: "uncommon",
        master: "",
      });
      expect(rig.sent).toEqual([
        {
          opcode: GameOpcode.CMSG_LOOT_METHOD,
          body: new Uint8Array([
            3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0,
          ]),
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("setLootMethod throws for a master outside the party and sends nothing", () => {
    const rig = areaRig("looting", { selfGuid: ME });
    try {
      expect(() =>
        rig.handle.act.setLootMethod({
          method: "master_loot",
          threshold: "uncommon",
          master: "Stranger",
        }),
      ).toThrow("not in your party");
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("setLootMethod refuses a threshold below uncommon before any send (GroupHandler.cpp:535-536)", () => {
    const party = inParty();
    try {
      for (const threshold of ["poor", "normal"])
        expect(() =>
          party.act.setLootMethod({
            method: "group_loot",
            threshold: threshold as never,
            master: "Partner",
          }),
        ).toThrow(`unknown loot threshold: ${threshold}`);
      expect(() =>
        party.act.setLootMethod({
          method: "personal" as never,
          threshold: "uncommon",
          master: "",
        }),
      ).toThrow("unknown loot method: personal");
      expect(party.sent).toEqual([]);
    } finally {
      party.dispose();
    }
  });
});
