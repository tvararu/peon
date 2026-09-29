import { describe, expect, test } from "bun:test";
import { raidGroupLeftBody, raidGroupListBody } from "#test-support/areas/raid";
import { must } from "#test-support/must";
import { flagNames, readRaidGroup } from "#wow/areas/raid/protocol";
import { parseGroupList } from "#wow/protocol/group-list";
import { PacketReader } from "#wow/protocol/packet";

const TOM = 0x10n;
const ANN = 0x20n;

describe("readRaidGroup", () => {
  test("maps the party form with loot and difficulty", () => {
    const group = readRaidGroup(
      parseGroupList(
        new PacketReader(
          raidGroupListBody({
            counter: 4,
            leader: TOM,
            loot: { method: 1, threshold: 2 },
            members: [
              { guid: ANN, name: "Ann" },
              { guid: TOM, name: "Tom" },
            ],
            type: 0,
          }),
        ),
      ),
    );
    expect(group.kind).toBe("party");
    expect(group.battleground).toBe(false);
    expect(group.counter).toBe(4);
    expect(group.members).toHaveLength(2);
    expect(must(group.members[0]).guid).toBe(ANN);
    expect(group.leader).toBe(TOM);
    expect(group.loot).toEqual({ master: 0n, method: 1, threshold: 2 });
    expect(group.difficulty).toEqual({ dungeon: 0, heroic: false, raid: 0 });
  });

  test("reads the raid bit of a battleground raid group", () => {
    const group = readRaidGroup(
      parseGroupList(
        new PacketReader(
          raidGroupListBody({
            leader: TOM,
            members: [{ guid: TOM, name: "Tom" }],
            type: 3,
          }),
        ),
      ),
    );
    expect(group.kind).toBe("raid");
    expect(group.battleground).toBe(true);
  });

  test("maps the raid form with member flags and roles", () => {
    const group = readRaidGroup(
      parseGroupList(
        new PacketReader(
          raidGroupListBody({
            flags: 1,
            leader: TOM,
            members: [
              { flags: 1, guid: TOM, name: "Tom", roles: 2, subgroup: 0 },
              { flags: 6, guid: ANN, name: "Ann", roles: 4, subgroup: 1 },
            ],
            type: 2,
          }),
        ),
      ),
    );
    expect(group.kind).toBe("raid");
    expect(group.self).toEqual({ flags: 1, roles: 0, subgroup: 0 });
    expect(must(group.members[1]).subgroup).toBe(1);
    expect(flagNames(must(group.members[1]).flags)).toEqual([
      "main_tank",
      "main_assist",
    ]);
  });

  test("maps the dungeon-finder form", () => {
    const group = readRaidGroup(
      parseGroupList(
        new PacketReader(
          raidGroupListBody({
            dungeonFinder: { dungeonId: 33, status: 0 },
            leader: TOM,
            members: [{ guid: TOM, name: "Tom" }],
            type: 8,
          }),
        ),
      ),
    );
    expect(group.dungeonFinder).toEqual({ dungeonId: 33, status: 0 });
  });

  test("maps the you-left form to an empty list", () => {
    const group = readRaidGroup(
      parseGroupList(new PacketReader(raidGroupLeftBody())),
    );
    expect(group.members).toHaveLength(0);
    expect(group.loot).toBeUndefined();
    expect(group.difficulty).toBeUndefined();
  });
});
