import { describe, expect, test } from "bun:test";
import {
  buildGroupAssistantLeader,
  buildGroupChangeSubGroup,
  buildGroupRaidConvert,
  buildGroupSwapSubGroup,
  buildGroupUninviteGuid,
  buildPartyAssignment,
  PARTY_ASSIGN_MAIN_ASSIST,
  PARTY_ASSIGN_MAIN_TANK,
} from "#wow/areas/raid/protocol-structure";
import { PacketReader } from "#wow/protocol/packet";

const GUID = 0x0102_0304_0506_0708n;

describe("raid structure builders", () => {
  test("convert has an empty body", () => {
    expect(buildGroupRaidConvert()).toEqual(new Uint8Array(0));
  });

  test("change subgroup is name then group byte", () => {
    const r = new PacketReader(buildGroupChangeSubGroup("Tom", 5));
    expect(r.cString()).toBe("Tom");
    expect(r.uint8()).toBe(5);
    expect(r.remaining).toBe(0);
  });

  test("swap subgroup is two names", () => {
    const r = new PacketReader(buildGroupSwapSubGroup("Tom", "Ann"));
    expect(r.cString()).toBe("Tom");
    expect(r.cString()).toBe("Ann");
    expect(r.remaining).toBe(0);
  });

  test("assistant is a full guid then a flag byte", () => {
    const r = new PacketReader(buildGroupAssistantLeader(GUID, true));
    expect(r.uint64LE()).toBe(GUID);
    expect(r.uint8()).toBe(1);
    expect(r.remaining).toBe(0);
    const off = new PacketReader(buildGroupAssistantLeader(GUID, false));
    off.uint64LE();
    expect(off.uint8()).toBe(0);
  });

  test("assignment is role, apply, then guid", () => {
    const r = new PacketReader(
      buildPartyAssignment(PARTY_ASSIGN_MAIN_ASSIST, true, GUID),
    );
    expect(r.uint8()).toBe(1);
    expect(r.uint8()).toBe(1);
    expect(r.uint64LE()).toBe(GUID);
    expect(r.remaining).toBe(0);
    const tank = new PacketReader(
      buildPartyAssignment(PARTY_ASSIGN_MAIN_TANK, false, GUID),
    );
    expect(tank.uint8()).toBe(0);
    expect(tank.uint8()).toBe(0);
    expect(tank.uint64LE()).toBe(GUID);
    expect(tank.remaining).toBe(0);
  });

  test("uninvite by guid is guid then reason", () => {
    const r = new PacketReader(buildGroupUninviteGuid(GUID, "test"));
    expect(r.uint64LE()).toBe(GUID);
    expect(r.cString()).toBe("test");
    expect(r.remaining).toBe(0);
  });
});
