import { describe, expect, test } from "bun:test";
import {
  objectsAreaTriggerBody,
  objectsAreaTriggerMessageBody,
} from "#test-support/areas/objects";
import {
  buildAreaTrigger,
  parseAreaTriggerMessage,
} from "#wow/areas/objects/protocol";
import { PacketReader } from "#wow/protocol/packet";

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
