import { describe, expect, test } from "bun:test";
import {
  objectsAreaTriggerBody,
  objectsAreaTriggerMessageBody,
  objectsGameObjectPageTextBody,
  objectsGameObjUseBody,
  objectsPageTextQueryResponseBody,
} from "#test-support/areas/objects";
import {
  buildAreaTrigger,
  buildGameObjReportUse,
  buildGameObjUse,
  buildPageTextQuery,
  parseAreaTriggerMessage,
  parseGameObjectPageText,
  parsePageText,
} from "#wow/areas/objects/protocol";
import { PacketReader } from "#wow/protocol/packet";

const SHRINE = 0xf1_10_2c_14_00_00_52_80n;

describe("objects use packets", () => {
  test("CMSG_GAMEOBJ_USE writes the object guid as one u64 (SpellHandler.cpp:328-347)", () => {
    expect(buildGameObjUse(SHRINE)).toEqual(objectsGameObjUseBody(SHRINE));
    expect(new PacketReader(buildGameObjUse(SHRINE)).uint64LE()).toBe(SHRINE);
    expect(buildGameObjUse(SHRINE).length).toBe(8);
  });

  test("CMSG_GAMEOBJ_REPORT_USE writes the object guid as one u64 (SpellHandler.cpp:349-376)", () => {
    expect(buildGameObjReportUse(SHRINE)).toEqual(
      objectsGameObjUseBody(SHRINE),
    );
    expect(buildGameObjReportUse(SHRINE).length).toBe(8);
  });
});

const LEVEL = "You must be at least level 10 to enter.";

describe("objects area trigger packets", () => {
  test("CMSG_AREATRIGGER writes the trigger id as one u32 (MiscHandler.cpp:691-697)", () => {
    expect(buildAreaTrigger(88)).toEqual(objectsAreaTriggerBody(88));
    expect([...buildAreaTrigger(88)]).toEqual([88, 0, 0, 0]);
  });

  test("SMSG_AREA_TRIGGER_MESSAGE reads a single-line message (WorldSession.cpp:288-298)", () => {
    const body = objectsAreaTriggerMessageBody(LEVEL);
    expect(parseAreaTriggerMessage(new PacketReader(body))).toEqual({
      text: LEVEL,
    });
  });

  test("SMSG_AREA_TRIGGER_MESSAGE reads to the NUL when the length covers only the first line", () => {
    const message = "First line\nsecond line";
    const first = objectsAreaTriggerMessageBody(message, 0);
    const second = objectsAreaTriggerMessageBody(message, 1);
    expect(new PacketReader(first).uint32LE()).toBe(11);
    expect(parseAreaTriggerMessage(new PacketReader(first))).toEqual({
      text: message,
    });
    expect(parseAreaTriggerMessage(new PacketReader(second))).toEqual({
      text: "second line",
    });
  });
});

const SHRINE_PAGE =
  "You have discovered the location of the shrine!  Upon further examination";

describe("objects page text packets", () => {
  test("CMSG_PAGE_TEXT_QUERY writes the page id then the object guid (QueryHandler.cpp:361-366)", () => {
    const r = new PacketReader(buildPageTextQuery(2936, SHRINE));
    expect(r.uint32LE()).toBe(2936);
    expect(r.uint64LE()).toBe(SHRINE);
    expect(buildPageTextQuery(2936, SHRINE).length).toBe(12);
  });

  test("SMSG_PAGE_TEXT_QUERY_RESPONSE reads the page id, text and next page (QueryHandler.cpp:371-392)", () => {
    const body = objectsPageTextQueryResponseBody(2936, SHRINE_PAGE, 2937);
    expect(parsePageText(new PacketReader(body))).toEqual({
      pageId: 2936,
      text: SHRINE_PAGE,
      nextPageId: 2937,
    });
  });

  test("SMSG_PAGE_TEXT_QUERY_RESPONSE reads the missing page reply with next page 0 (QueryHandler.cpp:374-379)", () => {
    const body = objectsPageTextQueryResponseBody(
      2_147_483_647,
      "Item page missing.",
      0,
    );
    expect(parsePageText(new PacketReader(body))).toEqual({
      pageId: 2_147_483_647,
      text: "Item page missing.",
      nextPageId: 0,
    });
  });

  test("SMSG_GAMEOBJECT_PAGETEXT reads one object guid (GameObject.cpp:1632-1633)", () => {
    const body = objectsGameObjectPageTextBody(SHRINE);
    expect(body.length).toBe(8);
    expect(parseGameObjectPageText(new PacketReader(body))).toEqual({
      guid: SHRINE,
    });
  });
});
