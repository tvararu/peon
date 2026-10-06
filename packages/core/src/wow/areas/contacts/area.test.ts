import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { contactsContactListBody } from "#test-support/areas/contacts";
import { GameOpcode } from "#wow/protocol/opcodes";

function friendList(note: string): Uint8Array {
  return contactsContactListBody({
    entries: [
      {
        area: 10,
        flags: 0x01,
        guid: 0x99n,
        level: 80,
        note,
        playerClass: 1,
        status: 1,
      },
    ],
    listMask: 1,
  });
}

describe("contacts area wiring", () => {
  test("SMSG_CONTACT_LIST emits contact_list with the mask", () => {
    const rig = areaRig("contacts");
    try {
      const seen: string[] = [];
      rig.handle.onEvent((event) => seen.push(event.type));
      rig.inject(GameOpcode.SMSG_CONTACT_LIST, friendList("peon"));
      expect(seen).toEqual(["contact_list"]);
      expect(rig.handle.state()).toMatchObject({
        lastMask: 1,
        notes: [{ guid: 0x99n, note: "peon" }],
      });
    } finally {
      rig.dispose();
    }
  });

  test("a whisper from an unknown guid emits ignored_whisper without sending", () => {
    const rig = areaRig("contacts");
    try {
      const seen: unknown[] = [];
      rig.handle.onEvent((event) => seen.push(event));
      const text = new TextEncoder().encode("hi");
      const body = new Uint8Array(4 + 4 + 4 + 4 + 8 + 4 + text.length + 1);
      const view = new DataView(body.buffer);
      view.setUint8(0, 0x07);
      view.setUint32(5, 0xee, true);
      view.setUint32(25, text.length, true);
      body.set(text, 29);
      rig.inject(GameOpcode.SMSG_MESSAGE_CHAT, body);
      expect(seen).toEqual([{ guid: 0xeen, type: "ignored_whisper" }]);
      expect(
        rig.sent.filter((p) => p.opcode === GameOpcode.CMSG_CHAT_IGNORED),
      ).toEqual([]);
    } finally {
      rig.dispose();
    }
  });
});
