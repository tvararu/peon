import { describe, expect, test } from "bun:test";
import {
  raidGroupInviteBody,
  raidGroupLeftBody,
  raidGroupListBody,
} from "#test-support/areas/raid";
import { must } from "#test-support/must";
import { parseGroupInvite, parseGroupList } from "#wow/protocol/group-list";
import { PacketReader } from "#wow/protocol/packet";

const TOM = 0x10n;
const ANN = 0x20n;

describe("parseGroupList", () => {
  test("reads a party of two with the counter and full loot block", () => {
    const body = raidGroupListBody({
      counter: 7,
      leader: TOM,
      loot: { method: 1, threshold: 2 },
      members: [
        { guid: ANN, name: "Ann" },
        { guid: TOM, name: "Tom" },
      ],
      type: 0,
    });
    const list = parseGroupList(new PacketReader(body));
    expect(list.type).toBe(0);
    expect(list.ownSubgroup).toBe(0);
    expect(list.counter).toBe(7);
    expect(list.members).toHaveLength(2);
    expect(must(list.members[0]).name).toBe("Ann");
    expect(must(list.members[1]).name).toBe("Tom");
    expect(must(list.members[1]).online).toBe(true);
    expect(list.leaderGuidLow).toBe(Number(TOM & 0xffff_ffffn));
    expect(list.loot).toMatchObject({ method: 1, threshold: 2 });
  });

  test("reads a raid with subgroups, flags and difficulties", () => {
    const body = raidGroupListBody({
      flags: 1,
      leader: TOM,
      loot: {
        dungeonDifficulty: 1,
        method: 3,
        raidDifficulty: 1,
        threshold: 2,
      },
      members: [
        { flags: 1, guid: TOM, name: "Tom", roles: 2, subgroup: 0 },
        { flags: 6, guid: ANN, name: "Ann", roles: 4, subgroup: 1 },
      ],
      roles: 2,
      subgroup: 1,
      type: 2,
    });
    const list = parseGroupList(new PacketReader(body));
    expect(list.type).toBe(2);
    expect(list.ownSubgroup).toBe(1);
    expect(list.ownFlags).toBe(1);
    expect(list.ownRoles).toBe(2);
    expect(must(list.members[0]).subgroup).toBe(0);
    expect(must(list.members[0]).flags).toBe(1);
    expect(must(list.members[0]).roles).toBe(2);
    expect(must(list.members[1]).subgroup).toBe(1);
    expect(must(list.members[1]).flags).toBe(6);
    expect(list.loot).toMatchObject({
      dungeonDifficulty: 1,
      method: 3,
      raidDifficulty: 1,
    });
  });

  test("reads the dungeon-finder insert after the own roles", () => {
    const body = raidGroupListBody({
      dungeonFinder: { dungeonId: 33, status: 0 },
      leader: TOM,
      members: [{ guid: TOM, name: "Tom" }],
      type: 8,
    });
    const list = parseGroupList(new PacketReader(body));
    expect(list.type).toBe(8);
    expect(list.dungeonStatus).toBe(0);
    expect(list.dungeonId).toBe(33);
    expect(must(list.members[0]).name).toBe("Tom");
  });

  test("reads an offline battleground member as offline", () => {
    const body = raidGroupListBody({
      leader: TOM,
      members: [{ guid: TOM, name: "Tom", status: 2 }],
      type: 1,
    });
    const list = parseGroupList(new PacketReader(body));
    expect(must(list.members[0]).online).toBe(false);
    expect(must(list.members[0]).status).toBe(2);
  });

  test("reads the you-left form with no members and no loot block", () => {
    const list = parseGroupList(new PacketReader(raidGroupLeftBody()));
    expect(list.type).toBe(16);
    expect(list.members).toHaveLength(0);
    expect(list.loot).toBeUndefined();
  });
});

describe("parseGroupInvite", () => {
  test("reads the blocked status as a field", () => {
    const invite = parseGroupInvite(
      new PacketReader(raidGroupInviteBody({ name: "Tom", status: 0 })),
    );
    expect(invite.status).toBe(0);
    expect(invite.name).toBe("Tom");
  });
});
