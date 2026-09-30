import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { raidGroupListBody } from "#test-support/areas/raid";
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

describe("raid awaitGroupChange", () => {
  test("resolves with the first group_list whose changes match", async () => {
    const rig = areaRig("raid");
    try {
      const pending = rig.handle.act.awaitGroupChange(
        { kinds: ["converted"] },
        1000,
      );
      rig.inject(GameOpcode.SMSG_GROUP_LIST, partyList());
      rig.inject(
        GameOpcode.SMSG_GROUP_LIST,
        raidGroupListBody({
          counter: 1,
          leader: TOM,
          loot: { method: 1, threshold: 2 },
          members: [
            { guid: ANN, name: "Ann" },
            { guid: TOM, name: "Tom" },
          ],
          type: 2,
        }),
      );
      const event = await pending;
      expect(event.type).toBe("group_list");
    } finally {
      rig.dispose();
    }
  });

  test("resolves a disbanded wait when the group empties", async () => {
    const rig = areaRig("raid");
    try {
      rig.inject(GameOpcode.SMSG_GROUP_LIST, partyList());
      const pending = rig.handle.act.awaitGroupChange(
        { kinds: ["disbanded"] },
        1000,
      );
      rig.inject(
        GameOpcode.SMSG_GROUP_LIST,
        raidGroupListBody({
          counter: 1,
          leader: 0n,
          loot: { method: 1, threshold: 2 },
          members: [],
          type: 0,
        }),
      );
      const event = await pending;
      expect(event.type).toBe("disbanded");
    } finally {
      rig.dispose();
    }
  });

  test("rejects with timeout after timeoutMs", async () => {
    jest.useFakeTimers();
    const rig = areaRig("raid");
    try {
      const pending = rig.handle.act.awaitGroupChange(
        { kinds: ["converted"] },
        500,
      );
      const settled = pending.then(
        () => "resolved",
        (error: unknown) =>
          error instanceof Error ? error.message : String(error),
      );
      jest.advanceTimersByTime(500);
      expect(await settled).toBe("timeout");
    } finally {
      jest.useRealTimers();
      rig.dispose();
    }
  });
});
