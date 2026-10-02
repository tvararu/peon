import { describe, expect, jest, test } from "bun:test";
import { type NearbyRow, ObjectType } from "@peon/core";
import { partyMember } from "@peon/core/test-support/party-fixtures";
import {
  useMeetingStone,
  useSummoningPortal,
} from "#harness/puppet/meeting-stone";
import { createTestRuntime } from "#test-support/runtime-fixture";

const TOM = 0x100n;
const STONE = 0x200n;

async function world() {
  const t = await createTestRuntime();
  return t;
}

describe("useMeetingStone", () => {
  test("selects the agent and uses the nearest meeting stone", async () => {
    const t = await world();
    const party = t.handle.getPartyState();
    party.members = [
      partyMember({ guid: TOM, name: "Tom" }),
      partyMember({ guid: 0x300n, name: "Ann" }),
    ];
    t.handle.getPartyState = () => party;
    t.handle.queryNearby = () =>
      [
        {
          distance: 12,
          entity: {
            entry: 123,
            gameObjectType: 10,
            guid: 0x400n,
            objectType: ObjectType.GAMEOBJECT,
          },
          position: { x: 1, y: 2, z: 3 },
          self: false,
        },
        {
          distance: 4,
          entity: {
            entry: 179_596,
            gameObjectType: 23,
            guid: STONE,
            objectType: ObjectType.GAMEOBJECT,
          },
          position: { x: 1, y: 2, z: 3 },
          self: false,
        },
      ] as unknown as NearbyRow[];
    const use = jest
      .spyOn(t.handle.objects.act, "use")
      .mockReturnValue({ ok: true } as never);
    useMeetingStone(t.handle, "tom");
    expect(t.handle.selectTarget).toHaveBeenCalledWith(TOM);
    expect(use).toHaveBeenCalledWith(STONE);
  });

  test("throws when the member or the stone is missing", async () => {
    const t = await world();
    const empty = t.handle.getPartyState();
    empty.members = [];
    t.handle.getPartyState = () => empty;
    t.handle.queryNearby = () => [];
    expect(() => useMeetingStone(t.handle, "Nobody")).toThrow(
      "not in the group",
    );
    const party = t.handle.getPartyState();
    party.members = [partyMember({ guid: TOM, name: "Tom" })];
    expect(() => useMeetingStone(t.handle, "Tom")).toThrow("no meeting stone");
  });

  test("reports a refused use", async () => {
    const t = await world();
    const party = t.handle.getPartyState();
    party.members = [partyMember({ guid: TOM, name: "Tom" })];
    t.handle.getPartyState = () => party;
    t.handle.queryNearby = () =>
      [
        {
          distance: 4,
          entity: {
            entry: 179_596,
            gameObjectType: 23,
            guid: STONE,
            objectType: ObjectType.GAMEOBJECT,
          },
          position: { x: 1, y: 2, z: 3 },
          self: false,
        },
      ] as unknown as NearbyRow[];
    jest
      .spyOn(t.handle.objects.act, "use")
      .mockReturnValue({ ok: false, reason: "unknown" } as never);
    expect(() => useMeetingStone(t.handle, "Tom")).toThrow("refused");
  });
});

describe("useSummoningPortal", () => {
  test("uses the nearest summoning portal", async () => {
    const t = await world();
    const portal = 0x500n;
    t.handle.queryNearby = () =>
      [
        {
          distance: 12,
          entity: {
            entry: 11,
            gameObjectType: 10,
            guid: 0x400n,
            objectType: ObjectType.GAMEOBJECT,
          },
          position: { x: 1, y: 2, z: 3 },
          self: false,
        },
        {
          distance: 2,
          entity: {
            entry: 179_944,
            gameObjectType: 18,
            guid: portal,
            objectType: ObjectType.GAMEOBJECT,
          },
          position: { x: 4, y: 5, z: 6 },
          self: false,
        },
      ] as unknown as NearbyRow[];
    const use = jest
      .spyOn(t.handle.objects.act, "use")
      .mockReturnValue({ ok: true } as never);
    useSummoningPortal(t.handle);
    expect(use).toHaveBeenCalledWith(portal);
  });

  test("throws when no portal is nearby", async () => {
    const t = await world();
    t.handle.queryNearby = () => [];
    expect(() => useSummoningPortal(t.handle)).toThrow("no summoning portal");
  });
});
