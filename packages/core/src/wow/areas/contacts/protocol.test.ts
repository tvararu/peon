import { describe, expect, test } from "bun:test";
import {
  buildChatIgnored,
  buildContactListRequest,
  buildSetContactNote,
  parseChatIgnored,
  parseContactListRequest,
  parseSetContactNote,
} from "#wow/areas/contacts/protocol";
import { PacketReader } from "#wow/protocol/packet";

const GUID = 0x99n;

describe("contacts packets", () => {
  test("CMSG_CONTACT_LIST writes the flags (Socialhandler.cpp:30-35)", () => {
    expect([...buildContactListRequest(1)]).toEqual([1, 0, 0, 0]);
    expect(
      parseContactListRequest(new PacketReader(buildContactListRequest(1))),
    ).toEqual({ flags: 1 });
  });

  test("CMSG_SET_CONTACT_NOTES writes the guid before the note (Socialhandler.cpp:148-154)", () => {
    const body = buildSetContactNote(GUID, "tank");
    expect([...body.subarray(0, 8)]).toEqual([0x99, 0, 0, 0, 0, 0, 0, 0]);
    expect(parseSetContactNote(new PacketReader(body))).toEqual({
      guid: GUID,
      note: "tank",
    });
  });

  test("CMSG_CHAT_IGNORED writes the guid before a zero byte (ChatHandler.cpp:792-807)", () => {
    const body = buildChatIgnored(GUID);
    expect([...body]).toEqual([0x99, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(parseChatIgnored(new PacketReader(body))).toEqual({ guid: GUID });
  });

  test("short bodies throw", () => {
    expect(() =>
      parseContactListRequest(new PacketReader(new Uint8Array(2))),
    ).toThrow();
    const body = buildSetContactNote(GUID, "tank");
    expect(body.length).toBe(13);
    expect(() =>
      parseSetContactNote(new PacketReader(body.subarray(0, 7))),
    ).toThrow();
    expect(() =>
      parseChatIgnored(new PacketReader(buildChatIgnored(GUID).subarray(0, 8))),
    ).toThrow();
    expect(() =>
      parseChatIgnored(new PacketReader(new Uint8Array(8))),
    ).toThrow();
  });
});
