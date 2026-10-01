import { describe, expect, jest, test } from "bun:test";
import { ObjectType } from "@peon/core";
import { partyMember } from "@peon/core/test-support/party-fixtures";
import { useMeetingStone } from "#harness/puppet/meeting-stone";
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
      ] as unknown as ReturnType<typeof t.handle.queryNearby>;
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
      ] as unknown as ReturnType<typeof t.handle.queryNearby>;
    jest
      .spyOn(t.handle.objects.act, "use")
      .mockReturnValue({ ok: false, reason: "unknown" } as never);
    expect(() => useMeetingStone(t.handle, "Tom")).toThrow("refused");
  });
});
