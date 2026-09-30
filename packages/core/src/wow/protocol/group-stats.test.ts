import { describe, expect, test } from "bun:test";
import {
  raidPartyMemberOfflineBody,
  raidPartyMemberStatsBody,
  raidPartyMemberStatsFullBody,
} from "#test-support/areas/raid";
import { GroupUpdateFlag } from "#wow/protocol/enums";
import {
  buildRequestPartyMemberStats,
  memberStatusFlags,
  parsePartyMemberStats,
} from "#wow/protocol/group-stats";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";

const TOM = 0x10n;
const PET = 0xf1_30_00_00_00_00_00_42n;

const ONLINE = 0x01;
const PVP = 0x02;
const DEAD = 0x04;
const GHOST = 0x08;
const PVP_FFA = 0x10;
const AFK = 0x40;
const DND = 0x80;

describe("parsePartyMemberStats", () => {
  test("reads a warrior's rage and auras", () => {
    const body = raidPartyMemberStatsBody({
      auras: [
        { flags: 1, slot: 0, spellId: 2457 },
        { flags: 1, slot: 33, spellId: 6673 },
      ],
      guid: TOM,
      hp: 4200,
      level: 80,
      maxHp: 9000,
      maxPower: 1000,
      power: 450,
      powerType: 1,
      status: ONLINE | PVP,
      zone: 3430,
    });
    const stats = parsePartyMemberStats(new PacketReader(body));
    expect(stats).toEqual({
      auras: [
        { flags: 1, slot: 0, spellId: 2457 },
        { flags: 1, slot: 33, spellId: 6673 },
      ],
      guidHigh: 0,
      guidLow: 0x10,
      hp: 4200,
      level: 80,
      maxHp: 9000,
      maxPower: 1000,
      online: true,
      power: 450,
      powerType: 1,
      status: ONLINE | PVP,
      zone: 3430,
    });
  });

  test("reads a hunter's pet fields and vehicle seat", () => {
    const body = raidPartyMemberStatsBody({
      guid: TOM,
      pet: {
        auras: [{ flags: 9, slot: 2, spellId: 136 }],
        displayId: 5556,
        guid: PET,
        hp: 800,
        maxHp: 1200,
        maxPower: 100,
        name: "Rex",
        power: 60,
        powerType: 2,
      },
      vehicleSeat: 3153,
    });
    const stats = parsePartyMemberStats(new PacketReader(body));
    expect(stats.pet).toEqual({
      auras: [{ flags: 9, slot: 2, spellId: 136 }],
      displayId: 5556,
      guid: PET,
      hp: 800,
      maxHp: 1200,
      maxPower: 100,
      name: "Rex",
      power: 60,
      powerType: 2,
    });
    expect(stats.vehicleSeat).toBe(3153);
  });

  test("reads a zero pet guid as an explicit no-pet signal", () => {
    const body = raidPartyMemberStatsBody({ guid: TOM, pet: { guid: 0n } });
    expect(parsePartyMemberStats(new PacketReader(body)).pet).toBeNull();
  });

  test("leaves the pet undefined when no pet field is in the mask", () => {
    const body = raidPartyMemberStatsBody({ guid: TOM, hp: 1 });
    expect(parsePartyMemberStats(new PacketReader(body)).pet).toBeUndefined();
  });

  test("reads a mage full reply with the power type defaulting to mana", () => {
    const body = raidPartyMemberStatsFullBody({
      auras: [{ flags: 0, slot: 5, spellId: 1459 }],
      guid: TOM,
      hp: 3000,
      level: 70,
      maxHp: 3000,
      maxPower: 4000,
      position: { x: -1234, y: 567 },
      power: 3900,
      status: ONLINE,
      zone: 3430,
    });
    const stats = parsePartyMemberStats(new PacketReader(body), true);
    expect(stats).toMatchObject({
      auras: [{ flags: 0, slot: 5, spellId: 1459 }],
      hp: 3000,
      level: 70,
      maxPower: 4000,
      pet: null,
      position: { x: -1234, y: 567 },
      power: 3900,
      powerType: 0,
      zone: 3430,
    });
  });

  test("reads the offline full reply without inventing a power type", () => {
    const stats = parsePartyMemberStats(
      new PacketReader(raidPartyMemberOfflineBody(TOM)),
      true,
    );
    expect(stats).toEqual({
      guidHigh: 0,
      guidLow: 0x10,
      online: false,
      status: 0,
    });
  });

  test("keeps a negative y position negative", () => {
    const body = raidPartyMemberStatsBody({
      guid: TOM,
      position: { x: 9040, y: -6250 },
    });
    expect(parsePartyMemberStats(new PacketReader(body)).position).toEqual({
      x: 9040,
      y: -6250,
    });
  });

  test("keeps the fields after a partial mask aligned", () => {
    const w = new PacketWriter();
    w.packedGuidBig(TOM);
    w.uint32LE(
      GroupUpdateFlag.CUR_HP | GroupUpdateFlag.PET_NAME | GroupUpdateFlag.LEVEL,
    );
    w.uint32LE(77);
    w.uint16LE(61);
    w.cString("Rex");
    const stats = parsePartyMemberStats(new PacketReader(w.finish()));
    expect(stats).toMatchObject({ hp: 77, level: 61, pet: { name: "Rex" } });
    expect(stats.status).toBeUndefined();
    expect(stats.online).toBeUndefined();
  });

  test("keeps a full guid with a high part", () => {
    const body = raidPartyMemberStatsBody({ guid: 0x1_0000_0010n, hp: 1 });
    const stats = parsePartyMemberStats(new PacketReader(body));
    expect(stats.guidLow).toBe(0x10);
    expect(stats.guidHigh).toBe(1);
  });
});

describe("memberStatusFlags", () => {
  test("names every status bit", () => {
    expect(
      memberStatusFlags(ONLINE | PVP | DEAD | GHOST | PVP_FFA | AFK | DND),
    ).toEqual({
      afk: true,
      dead: true,
      dnd: true,
      ghost: true,
      online: true,
      pvp: true,
      pvpFfa: true,
    });
    expect(memberStatusFlags(0)).toEqual({
      afk: false,
      dead: false,
      dnd: false,
      ghost: false,
      online: false,
      pvp: false,
      pvpFfa: false,
    });
  });
});

describe("buildRequestPartyMemberStats", () => {
  test("writes the full guid as a u64", () => {
    const body = buildRequestPartyMemberStats(0x1_0000_0010n);
    expect(body).toEqual(new Uint8Array([0x10, 0, 0, 0, 1, 0, 0, 0]));
  });
});
