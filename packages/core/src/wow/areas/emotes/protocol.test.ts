import { describe, expect, test } from "bun:test";
import {
  emotesEmoteBody,
  emotesTextEmoteBody,
} from "#test-support/areas/emotes";
import { parseEmote, parseTextEmote } from "#wow/areas/emotes/protocol";
import { PacketReader } from "#wow/protocol/packet";

const ME = 0xde1n;
const CREATURE = 0xf1_30_00_3d_28_01_48_d2n;
const DANCE = 34;
const WAVE = 101;

describe("emote packets", () => {
  test("SMSG_EMOTE reads the emote before the full guid", () => {
    const reader = new PacketReader(
      emotesEmoteBody({ emote: 34, guid: CREATURE }),
    );
    expect(parseEmote(reader)).toEqual({ emote: 34, guid: CREATURE });
    expect(reader.remaining).toBe(0);
  });

  test("SMSG_EMOTE reads the AzerothCore byte layout", () => {
    const body = new Uint8Array([
      0x0a, 0, 0, 0, 0xd2, 0x48, 0x01, 0x28, 0x3d, 0x00, 0x30, 0xf1,
    ]);
    expect(parseEmote(new PacketReader(body))).toEqual({
      emote: 10,
      guid: CREATURE,
    });
  });

  test("SMSG_TEXT_EMOTE with no target reads an empty name", () => {
    const reader = new PacketReader(
      emotesTextEmoteBody({
        emoteNum: 0xff_ff_ff_ff,
        guid: ME,
        name: "",
        textEmote: DANCE,
      }),
    );
    expect(parseTextEmote(reader)).toEqual({
      emoteNum: 0xff_ff_ff_ff,
      guid: ME,
      target: "",
      textEmote: DANCE,
    });
    expect(reader.remaining).toBe(0);
  });

  test("SMSG_TEXT_EMOTE reads a target name after a length without the null", () => {
    const body = emotesTextEmoteBody({
      emoteNum: 7,
      guid: ME,
      name: "Tom",
      textEmote: WAVE,
    });
    expect([...body.subarray(16, 24)]).toEqual([3, 0, 0, 0, 84, 111, 109, 0]);
    const reader = new PacketReader(body);
    expect(parseTextEmote(reader)).toEqual({
      emoteNum: 7,
      guid: ME,
      target: "Tom",
      textEmote: WAVE,
    });
    expect(reader.remaining).toBe(0);
  });

  test("SMSG_TEXT_EMOTE loses a one-letter target name", () => {
    const reader = new PacketReader(
      emotesTextEmoteBody({
        emoteNum: 0,
        guid: ME,
        name: "A",
        textEmote: WAVE,
      }),
    );
    expect(parseTextEmote(reader)).toEqual({
      emoteNum: 0,
      guid: ME,
      target: "",
      textEmote: WAVE,
    });
    expect(reader.remaining).toBe(0);
  });
});
