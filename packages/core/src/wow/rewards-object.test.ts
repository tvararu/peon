import { describe, expect, test } from "bun:test";
import { bytes } from "#test-support/hex";
import { rewardsParts } from "#test-support/session-fixtures";
import type { Entity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { parseLootResponse } from "#wow/protocol/loot";
import { PacketReader } from "#wow/protocol/packet";

const chest = 0xf1_10_00_00_00_00_00_70n;
const stranger = 0xf1_10_00_00_00_00_00_71n;

const offer = `
  70000000000010f1 01 00000000 01
  00 1c520000 01000000 00000000 00000000 00000000 00
`;

function entity(guid: bigint, objectType: ObjectType): Entity {
  return {
    createComplete: true,
    entry: 0,
    guid,
    name: undefined,
    objectType,
    position: undefined,
    rawFields: new Map(guid === 1n ? [[0x18, 100]] : []),
    scale: 1,
  };
}

function world() {
  const entities = new Map([
    [1n, entity(1n, ObjectType.PLAYER)],
    [chest, entity(chest, ObjectType.GAMEOBJECT)],
  ]);
  const sent: number[] = [];
  const { runtime, store } = rewardsParts({
    getEntity: (guid) => entities.get(guid),
    now: () => 1000,
    selfGuid: () => 1n,
    send: (opcode) => {
      sent.push(opcode);
    },
  });
  return { runtime, sent, store };
}

describe("game object loot windows", () => {
  test("opening a chest waits for its offer without sending CMSG_LOOT", () => {
    const { runtime, sent, store } = world();
    expect(runtime.open(chest).loot).toMatchObject({
      guid: chest,
      phase: "opening",
    });
    expect(sent).toEqual([]);
    store.receiveLootResponse(
      parseLootResponse(new PacketReader(bytes(offer))),
    );
    expect(runtime.snapshot().loot).toMatchObject({
      guid: chest,
      items: [{ itemId: 21_020, slot: 0 }],
      phase: "open",
    });
    runtime.take(0);
    expect(sent).toEqual([0x1_08]);
  });

  test("an unseen object is not a loot source", () => {
    const { runtime } = world();
    expect(() => runtime.open(stranger)).toThrow(/not an observed entity/);
    expect(runtime.snapshot().loot.phase).toBe("closed");
  });
});
