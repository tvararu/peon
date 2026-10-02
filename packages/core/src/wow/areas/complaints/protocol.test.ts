import { describe, expect, test } from "bun:test";
import {
  complaintsResultBody,
  readComplain,
} from "#test-support/areas/complaints";
import {
  buildComplainChat,
  buildComplainMail,
  parseComplainResult,
} from "#wow/areas/complaints/protocol";
import { PacketReader } from "#wow/protocol/packet";

const SPAMMER = 0x1234_5678_9abcn;

describe("complaint builders", () => {
  test("chat form carries four u32 and the description, no byte left", () => {
    const read = readComplain(
      buildComplainChat(SPAMMER, {
        language: 7,
        chatType: 1,
        channelId: 0,
        secondsAgo: 42,
        text: "buy gold at example",
      }),
    );
    expect(read).toEqual({
      type: 1,
      guid: SPAMMER,
      unk1: 7,
      messageType: 1,
      channelId: 0,
      secondsAgo: 42,
      description: "buy gold at example",
      remaining: 0,
    });
  });

  test("chat form writes the guid as a full u64, not a packed guid", () => {
    const body = buildComplainChat(SPAMMER, {
      language: 0,
      chatType: 0,
      channelId: 0,
      secondsAgo: 0,
      text: "",
    });
    expect(body.length).toBe(1 + 8 + 16 + 1);
    expect([...body.slice(1, 9)]).toEqual([
      0xbc, 0x9a, 0x78, 0x56, 0x34, 0x12, 0, 0,
    ]);
  });

  test("mail form carries type 0 and three u32 with the mail id second", () => {
    const read = readComplain(buildComplainMail(SPAMMER, 991));
    expect(read).toEqual({
      type: 0,
      guid: SPAMMER,
      unk1: 0,
      messageType: 991,
      channelId: 0,
      secondsAgo: undefined,
      description: undefined,
      remaining: 0,
    });
  });
});

describe("parseComplainResult", () => {
  test("reads the one byte AzerothCore writes", () => {
    expect(
      parseComplainResult(new PacketReader(complaintsResultBody(0))),
    ).toEqual({ code: 0 });
  });

  test("reads the first byte of the two the wire notes list and ignores the second", () => {
    expect(
      parseComplainResult(new PacketReader(complaintsResultBody(1, 0))),
    ).toEqual({ code: 1 });
  });
});
