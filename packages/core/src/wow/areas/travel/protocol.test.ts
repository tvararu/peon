import { describe, expect, test } from "bun:test";
import {
  travelBinderConfirmBody,
  travelBindPointUpdateBody,
  travelPlayerBoundBody,
} from "#test-support/areas/travel";
import {
  buildBinderActivate,
  parseBinderConfirm,
  parseBindPointUpdate,
  parsePlayerBound,
} from "#wow/areas/travel/protocol";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";

const INNKEEPER = 0xf1_30_00_3e_4a_00_12_34n;
const HOME = {
  x: Math.fround(9477.5),
  y: Math.fround(-6857.25),
  z: Math.fround(16.5),
  mapId: 530,
  areaId: 3665,
};

describe("travel parsers", () => {
  test("SMSG_BINDPOINTUPDATE reads x, y, z, map and area (Player.cpp:11775-11779, SpellEffects.cpp:6652-6658)", () => {
    const r = new PacketReader(travelBindPointUpdateBody(HOME));
    expect(parseBindPointUpdate(r)).toEqual(HOME);
    expect(r.remaining).toBe(0);
  });

  test("SMSG_PLAYERBOUND reads the full binder guid and the area (SpellEffects.cpp:6663-6666)", () => {
    const r = new PacketReader(
      travelPlayerBoundBody({ binder: INNKEEPER, areaId: 3665 }),
    );
    expect(parsePlayerBound(r)).toEqual({ binder: INNKEEPER, areaId: 3665 });
    expect(r.remaining).toBe(0);
  });

  test("SMSG_BINDER_CONFIRM is the npc guid only (Player.cpp:9118-9122); wowm item/smsg_binder_confirm.wowm:7-13 adds an Area that AzerothCore does not write", () => {
    const r = new PacketReader(travelBinderConfirmBody(INNKEEPER));
    expect(parseBinderConfirm(r)).toEqual({ npc: INNKEEPER });
    expect(r.remaining).toBe(0);
  });

  test("a short body throws", () => {
    const home = travelBindPointUpdateBody(HOME);
    const bound = travelPlayerBoundBody({ binder: INNKEEPER, areaId: 1 });
    expect(() =>
      parseBindPointUpdate(new PacketReader(home.subarray(0, 16))),
    ).toThrow();
    expect(() =>
      parsePlayerBound(new PacketReader(bound.subarray(0, 8))),
    ).toThrow();
    expect(() =>
      parseBinderConfirm(new PacketReader(new Uint8Array(4))),
    ).toThrow();
  });
});

describe("travel builders", () => {
  test("CMSG_BINDER_ACTIVATE is the 8-byte npc guid (NPCHandler.cpp:293-296)", () => {
    const w = new PacketWriter();
    w.uint64LE(INNKEEPER);
    expect(buildBinderActivate(INNKEEPER)).toEqual(w.finish());
    expect(buildBinderActivate(INNKEEPER)).toHaveLength(8);
  });
});
