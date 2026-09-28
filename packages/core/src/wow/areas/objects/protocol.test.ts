import { describe, expect, test } from "bun:test";
import {
  objectsAreaTriggerBody,
  objectsAreaTriggerMessageBody,
  objectsGameObjUseBody,
} from "#test-support/areas/objects";
import {
  buildAreaTrigger,
  buildGameObjReportUse,
  buildGameObjUse,
  parseAreaTriggerMessage,
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
