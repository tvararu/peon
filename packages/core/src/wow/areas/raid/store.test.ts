import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  raidGroupInviteBody,
  raidGroupLeftBody,
  raidGroupListBody,
} from "#test-support/areas/raid";
import type { RaidEvent } from "#wow/areas/raid/store-roster";
import { GameOpcode } from "#wow/protocol/opcodes";

const TOM = 0x10n;
const ANN = 0x20n;

function partyList(counter = 0, leader = TOM) {
  return raidGroupListBody({
    counter,
    leader,
    loot: { method: 1, threshold: 2 },
    members: [
      { guid: ANN, name: "Ann" },
      { guid: TOM, name: "Tom" },
    ],
    type: 0,
  });
}

describe("raid store", () => {
  test("emits converted, roster and loot changes between lists", () => {
    const rig = areaRig("raid");
    const events: RaidEvent[] = [];
    rig.handle.onEvent((event) => {
      events.push(event);
    });
    try {
      rig.inject(GameOpcode.SMSG_GROUP_LIST, partyList());
      rig.inject(
        GameOpcode.SMSG_GROUP_LIST,
        raidGroupListBody({
          counter: 1,
          flags: 1,
          leader: ANN,
          loot: { method: 3, threshold: 2 },
          members: [
            { flags: 1, guid: TOM, name: "Tom", subgroup: 1 },
            { flags: 0, guid: ANN, name: "Ann", subgroup: 0 },
          ],
          type: 2,
        }),
      );
      const second = events[1];
      if (second?.type !== "group_list") throw new Error("no second list");
      expect(second.changes).toContainEqual({ kind: "converted" });
      expect(second.changes).toContainEqual({
        from: 0,
        kind: "subgroup",
        name: "Tom",
        to: 1,
      });
      expect(second.changes).toContainEqual({
        flag: "assistant",
        kind: "flag",
        name: "Tom",
        on: true,
      });
      expect(second.changes).toContainEqual({ kind: "loot" });
      expect(second.changes).toContainEqual({ kind: "leader", name: "Ann" });
      expect(second.changes).not.toContainEqual({ kind: "difficulty" });
    } finally {
      rig.dispose();
    }
  });

  test("emits joined, left and difficulty changes", () => {
    const rig = areaRig("raid");
    const events: RaidEvent[] = [];
    rig.handle.onEvent((event) => {
      events.push(event);
    });
    try {
      rig.inject(GameOpcode.SMSG_GROUP_LIST, partyList());
      rig.inject(
        GameOpcode.SMSG_GROUP_LIST,
        raidGroupListBody({
          counter: 1,
          leader: 0x30n,
          loot: {
            dungeonDifficulty: 1,
            method: 1,
            raidDifficulty: 1,
            threshold: 3,
          },
          members: [
            { guid: ANN, name: "Ann" },
            { guid: 0x30n, name: "Cid" },
          ],
          type: 0,
        }),
      );
      const second = events[1];
      if (second?.type !== "group_list") throw new Error("no second list");
      expect(second.changes).toContainEqual({ kind: "joined", name: "Cid" });
      expect(second.changes).toContainEqual({ kind: "left", name: "Tom" });
      expect(second.changes).toContainEqual({ kind: "difficulty" });
    } finally {
      rig.dispose();
    }
  });

  test("ignores a list whose counter is not newer", () => {
    const rig = areaRig("raid");
    const events: RaidEvent[] = [];
    rig.handle.onEvent((event) => {
      events.push(event);
    });
    try {
      rig.inject(GameOpcode.SMSG_GROUP_LIST, partyList(5));
      rig.inject(GameOpcode.SMSG_GROUP_LIST, partyList(5));
      rig.inject(GameOpcode.SMSG_GROUP_LIST, partyList(4));
      expect(events).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });

  test("scopes the counter to the group guid", () => {
    const rig = areaRig("raid");
    const events: RaidEvent[] = [];
    rig.handle.onEvent((event) => {
      events.push(event);
    });
    try {
      rig.inject(GameOpcode.SMSG_GROUP_LIST, partyList(9));
      rig.inject(
        GameOpcode.SMSG_GROUP_LIST,
        raidGroupListBody({
          counter: 1,
          groupGuid: 0x2f4n,
          leader: TOM,
          members: [{ guid: TOM, name: "Tom" }],
          type: 3,
        }),
      );
      expect(events).toHaveLength(2);
      expect(rig.handle.state().group?.groupGuid).toBe(0x2f4n);
      expect(rig.handle.state().group?.kind).toBe("raid");
      expect(rig.handle.state().group?.battleground).toBe(true);
    } finally {
      rig.dispose();
    }
  });

  test("ignores a disband list of another group", () => {
    const rig = areaRig("raid");
    try {
      rig.inject(GameOpcode.SMSG_GROUP_LIST, partyList(1));
      rig.inject(
        GameOpcode.SMSG_GROUP_LIST,
        raidGroupListBody({
          counter: 1,
          groupGuid: 0x2f4n,
          leader: TOM,
          members: [{ guid: TOM, name: "Tom" }],
          type: 3,
        }),
      );
      rig.inject(GameOpcode.SMSG_GROUP_LIST, raidGroupLeftBody(2));
      expect(rig.handle.state().group?.groupGuid).toBe(0x2f4n);
    } finally {
      rig.dispose();
    }
  });

  test("reports changes that affect the receiving character", () => {
    const rig = areaRig("raid");
    const events: RaidEvent[] = [];
    rig.handle.onEvent((event) => {
      events.push(event);
    });
    try {
      rig.inject(GameOpcode.SMSG_GROUP_LIST, partyList());
      const self = 0x99n;
      rig.inject(
        GameOpcode.SMSG_GROUP_LIST,
        raidGroupListBody({
          counter: 1,
          flags: 5,
          leader: self,
          loot: { method: 1, threshold: 2 },
          members: [
            { guid: ANN, name: "Ann" },
            { guid: TOM, name: "Tom" },
          ],
          subgroup: 2,
          type: 0,
        }),
      );
      const second = events[1];
      if (second?.type !== "group_list") throw new Error("no second list");
      expect(second.changes).toContainEqual({
        from: 0,
        kind: "subgroup",
        self: true,
        to: 2,
      });
      expect(second.changes).toContainEqual({
        flag: "assistant",
        kind: "flag",
        on: true,
        self: true,
      });
      expect(second.changes).toContainEqual({
        flag: "main_assist",
        kind: "flag",
        on: true,
        self: true,
      });
      expect(second.changes).toContainEqual({ kind: "leader", self: true });
    } finally {
      rig.dispose();
    }
  });

  test("the you-left form clears the group and emits disbanded", () => {
    const rig = areaRig("raid");
    const events: RaidEvent[] = [];
    rig.handle.onEvent((event) => {
      events.push(event);
    });
    try {
      rig.inject(GameOpcode.SMSG_GROUP_LIST, partyList());
      rig.inject(GameOpcode.SMSG_GROUP_LIST, raidGroupLeftBody(9));
      expect(rig.handle.state().group).toBeUndefined();
      expect(events[1]).toEqual({ type: "disbanded" });
    } finally {
      rig.dispose();
    }
  });

  test("a blocked invite emits invite_blocked", () => {
    const rig = areaRig("raid");
    const events: RaidEvent[] = [];
    rig.handle.onEvent((event) => {
      events.push(event);
    });
    try {
      rig.inject(
        GameOpcode.SMSG_GROUP_INVITE,
        raidGroupInviteBody({ name: "Tom", status: 0 }),
      );
      expect(events).toEqual([{ name: "Tom", type: "invite_blocked" }]);
    } finally {
      rig.dispose();
    }
  });

  test("a live invite emits nothing on the raid stream", () => {
    const rig = areaRig("raid");
    const events: RaidEvent[] = [];
    rig.handle.onEvent((event) => {
      events.push(event);
    });
    try {
      rig.inject(
        GameOpcode.SMSG_GROUP_INVITE,
        raidGroupInviteBody({ name: "Tom", status: 1 }),
      );
      expect(events).toEqual([]);
    } finally {
      rig.dispose();
    }
  });
});
