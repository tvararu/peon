import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { partyMember, partyState } from "#test-support/party-fixtures";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";

const TOM = 0x10n;
const ANN = 0x20n;

function inParty() {
  const rig = areaRig("raid", {
    legacy: {
      channels: () => [],
      friends: () => [],
      guild: () => undefined,
      ignored: () => [],
      party: () =>
        partyState({
          inGroup: true,
          members: [partyMember({ guid: TOM, name: "Tom" })],
        }),
    },
  });
  return rig;
}

function bodies(rig: {
  sent: readonly { opcode: number; body: Uint8Array }[];
}) {
  return [...rig.sent];
}

function read(body: Uint8Array) {
  return new PacketReader(body);
}

describe("raid structure acts", () => {
  test("convertToRaid sends an empty convert", () => {
    const rig = inParty();
    try {
      rig.handle.act.convertToRaid();
      const sent = bodies(rig);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.opcode).toBe(GameOpcode.CMSG_GROUP_RAID_CONVERT);
      expect(sent[0]?.body.length).toBe(0);
    } finally {
      rig.dispose();
    }
  });

  test("moveToSubgroup sends the tool group minus one", () => {
    const rig = inParty();
    try {
      rig.handle.act.moveToSubgroup("Tom", 2);
      const sent = bodies(rig);
      expect(sent[0]?.opcode).toBe(GameOpcode.CMSG_GROUP_CHANGE_SUB_GROUP);
      const r = read(sent[0]?.body ?? new Uint8Array(0));
      expect(r.cString()).toBe("Tom");
      expect(r.uint8()).toBe(1);
    } finally {
      rig.dispose();
    }
  });

  test("a tool group outside 1-8 throws", () => {
    const rig = inParty();
    try {
      expect(() => rig.handle.act.moveToSubgroup("Tom", 0)).toThrow(
        "group 1-8",
      );
      expect(() => rig.handle.act.moveToSubgroup("Tom", 9)).toThrow(
        "group 1-8",
      );
      expect(bodies(rig)).toHaveLength(0);
    } finally {
      rig.dispose();
    }
  });

  test("swap sends both names", () => {
    const rig = areaRig("raid", {
      legacy: {
        channels: () => [],
        friends: () => [],
        guild: () => undefined,
        ignored: () => [],
        party: () =>
          partyState({
            inGroup: true,
            members: [
              partyMember({ guid: TOM, name: "Tom" }),
              partyMember({ guid: ANN, name: "Ann" }),
            ],
          }),
      },
    });
    try {
      rig.handle.act.swapSubgroups("Tom", "Ann");
      const sent = bodies(rig);
      expect(sent[0]?.opcode).toBe(GameOpcode.CMSG_GROUP_SWAP_SUB_GROUP);
      const r = read(sent[0]?.body ?? new Uint8Array(0));
      expect(r.cString()).toBe("Tom");
      expect(r.cString()).toBe("Ann");
    } finally {
      rig.dispose();
    }
  });

  test("assistant, tank and assist send guid and flag", () => {
    const rig = inParty();
    try {
      rig.handle.act.setAssistant("Tom", true);
      rig.handle.act.setMainTank("Tom", false);
      rig.handle.act.setMainAssist("Tom", true);
      const sent = bodies(rig);
      expect(sent.map((p) => p.opcode)).toEqual([
        GameOpcode.CMSG_GROUP_ASSISTANT_LEADER,
        GameOpcode.MSG_PARTY_ASSIGNMENT,
        GameOpcode.MSG_PARTY_ASSIGNMENT,
      ]);
      expect(read(sent[0]?.body ?? new Uint8Array(0)).uint64LE()).toBe(TOM);
      const tank = read(sent[1]?.body ?? new Uint8Array(0));
      expect(tank.uint8()).toBe(0);
      expect(tank.uint8()).toBe(0);
      expect(tank.uint64LE()).toBe(TOM);
      const assist = read(sent[2]?.body ?? new Uint8Array(0));
      expect(assist.uint8()).toBe(1);
      expect(assist.uint8()).toBe(1);
    } finally {
      rig.dispose();
    }
  });

  test("uninvite by guid sends guid and reason", () => {
    const rig = inParty();
    try {
      rig.handle.act.uninviteGuid("Tom", "test");
      const sent = bodies(rig);
      expect(sent[0]?.opcode).toBe(GameOpcode.CMSG_GROUP_UNINVITE_GUID);
      const r = read(sent[0]?.body ?? new Uint8Array(0));
      expect(r.uint64LE()).toBe(TOM);
      expect(r.cString()).toBe("test");
    } finally {
      rig.dispose();
    }
  });

  test("a name outside the party throws", () => {
    const rig = inParty();
    try {
      expect(() => rig.handle.act.moveToSubgroup("Nobody", 1)).toThrow(
        "not in your party",
      );
      expect(bodies(rig)).toHaveLength(0);
    } finally {
      rig.dispose();
    }
  });
});
