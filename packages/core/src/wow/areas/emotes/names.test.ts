import { describe, expect, test } from "bun:test";
import {
  closestEmotes,
  TEXT_EMOTE_IDS,
  TEXT_EMOTES,
} from "#wow/areas/emotes/names";

describe("text emote names", () => {
  test("carry the AzerothCore ids", () => {
    expect(TEXT_EMOTES.get("dance")).toBe(34);
    expect(TEXT_EMOTES.get("salute")).toBe(78);
    expect(TEXT_EMOTES.get("wave")).toBe(101);
    expect(TEXT_EMOTES.get("ready")).toBe(126);
    expect(TEXT_EMOTES.size).toBe(252);
    expect(TEXT_EMOTE_IDS.size).toBe(252);
  });

  test("closestEmotes ranks a misspelling's target first", () => {
    expect(closestEmotes("dnace", 5)[0]).toBe("dance");
    expect(closestEmotes("dnace", 5)).toHaveLength(5);
    expect(closestEmotes("SALUTE ", 1)).toEqual(["salute"]);
  });
});
