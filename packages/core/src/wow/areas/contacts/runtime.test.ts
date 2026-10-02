import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { contactsContactListBody } from "#test-support/areas/contacts";
import { GameOpcode } from "#wow/protocol/opcodes";

const TOM = 0x99n;
const PARTNER = 0xdd;

function friendList(note: string): Uint8Array {
  return contactsContactListBody({
    entries: [
      {
        area: 10,
        flags: 0x01,
        guid: TOM,
        level: 80,
        note,
        playerClass: 1,
        status: 1,
      },
    ],
    listMask: 1,
  });
}

function whisperFrom(low: number, message: string): Uint8Array {
  const text = new TextEncoder().encode(message);
  const body = new Uint8Array(4 + 4 + 4 + 4 + 8 + 4 + text.length + 1);
  const view = new DataView(body.buffer);
  view.setUint8(0, 0x07);
  view.setUint32(1, 0, true);
  view.setUint32(5, low, true);
  view.setUint32(9, 0, true);
  view.setUint32(13, 0, true);
  view.setBigUint64(17, 0n, true);
  view.setUint32(25, text.length, true);
  body.set(text, 29);
  body[29 + text.length] = 0;
  return body;
}

describe("contacts runtime", () => {
  test("requestContacts sends the flags and resolves on the reply mask", async () => {
    const rig = areaRig("contacts", {
      legacy: {
        channels: () => [],
        friends: () => [],
        guild: () => undefined,
        ignored: () => [],
        party: () => ({
          counter: 0,
          difficulty: undefined,
          dungeonFinder: undefined,
          inGroup: false,
          kind: "party",
          leader: null,
          loot: null,
          members: [],
          ownFlags: 0,
          ownRoles: 0,
          ownSubgroup: 0,
        }),
      },
    });
    try {
      const pending = rig.handle.act.requestContacts(1);
      expect(rig.sent).toEqual([
        {
          body: new Uint8Array([1, 0, 0, 0]),
          opcode: GameOpcode.CMSG_CONTACT_LIST,
        },
      ]);
      rig.inject(GameOpcode.SMSG_CONTACT_LIST, friendList("peon"));
      expect(await pending).toEqual({ ok: true });
    } finally {
      rig.dispose();
    }
  });

  test("requestContacts rejects after 3 s with no reply", async () => {
    jest.useFakeTimers();
    const rig = areaRig("contacts");
    try {
      const settled = rig.handle.act.requestContacts(1).then(
        () => "resolved",
        (error: Error) => error.message,
      );
      await Promise.resolve();
      jest.advanceTimersByTime(3000);
      expect(await settled).toBe("timeout");
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("setFriendNote sends the guid and note, then refreshes the list", async () => {
    const rig = areaRig("contacts", {
      legacy: {
        channels: () => [],
        friends: () => [
          {
            area: 10,
            guid: TOM,
            level: 80,
            name: "Tom",
            note: "tank",
            playerClass: 1,
            status: 1,
          },
        ],
        guild: () => undefined,
        ignored: () => [],
        party: () => ({
          counter: 0,
          difficulty: undefined,
          dungeonFinder: undefined,
          inGroup: false,
          kind: "party",
          leader: null,
          loot: null,
          members: [],
          ownFlags: 0,
          ownRoles: 0,
          ownSubgroup: 0,
        }),
      },
    });
    try {
      const pending = rig.handle.act.setFriendNote("Tom", "peon");
      const sent = rig.sent.filter(
        (p) => p.opcode === GameOpcode.CMSG_SET_CONTACT_NOTES,
      );
      expect(sent).toHaveLength(1);
      expect(new DataView(sent[0]!.body.buffer).getBigUint64(0, true)).toBe(
        TOM,
      );
      const lists = rig.sent.filter(
        (p) => p.opcode === GameOpcode.CMSG_CONTACT_LIST,
      );
      expect(lists).toHaveLength(1);
      rig.inject(GameOpcode.SMSG_CONTACT_LIST, friendList("peon"));
      expect(await pending).toEqual({ ok: true });
      expect(rig.handle.state().notes).toEqual([{ guid: TOM, note: "peon" }]);
    } finally {
      rig.dispose();
    }
  });

  test("setFriendNote refuses a name outside the friend list", async () => {
    const rig = areaRig("contacts");
    try {
      expect(await rig.handle.act.setFriendNote("Nobody", "peon")).toEqual({
        ok: false,
        reason: "not_friend",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a whisper from an ignored guid sends one CMSG_CHAT_IGNORED", async () => {
    const rig = areaRig("contacts", {
      legacy: {
        channels: () => [],
        friends: () => [],
        guild: () => undefined,
        ignored: () => [{ guid: BigInt(PARTNER), name: "Partner" }],
        party: () => ({
          counter: 0,
          difficulty: undefined,
          dungeonFinder: undefined,
          inGroup: false,
          kind: "party",
          leader: null,
          loot: null,
          members: [],
          ownFlags: 0,
          ownRoles: 0,
          ownSubgroup: 0,
        }),
      },
    });
    try {
      rig.inject(GameOpcode.SMSG_MESSAGE_CHAT, whisperFrom(PARTNER, "hello"));
      rig.inject(GameOpcode.SMSG_MESSAGE_CHAT, whisperFrom(PARTNER, "again"));
      expect(
        rig.sent.filter((p) => p.opcode === GameOpcode.CMSG_CHAT_IGNORED),
      ).toHaveLength(1);
      rig.inject(GameOpcode.SMSG_MESSAGE_CHAT, whisperFrom(0xee, "hi"));
      expect(
        rig.sent.filter((p) => p.opcode === GameOpcode.CMSG_CHAT_IGNORED),
      ).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });

  test("a whisper with no guid sends nothing", () => {
    const rig = areaRig("contacts", {
      legacy: {
        channels: () => [],
        friends: () => [],
        guild: () => undefined,
        ignored: () => [{ guid: BigInt(PARTNER), name: "Partner" }],
        party: () => ({
          counter: 0,
          difficulty: undefined,
          dungeonFinder: undefined,
          inGroup: false,
          kind: "party",
          leader: null,
          loot: null,
          members: [],
          ownFlags: 0,
          ownRoles: 0,
          ownSubgroup: 0,
        }),
      },
    });
    try {
      rig.inject(GameOpcode.SMSG_MESSAGE_CHAT, whisperFrom(0, "hello"));
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("dispose rejects a pending requestContacts", async () => {
    const rig = areaRig("contacts");
    const pending = rig.handle.act.requestContacts(1);
    rig.dispose();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
