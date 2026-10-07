import { describe, expect, test } from "bun:test";
import {
  GUILDADMIN_INFO,
  guildadminEventLogBody,
  guildadminGuildInfoBody,
  guildadminPermissionsBody,
  guildadminSaveEmblemResultBody,
} from "#test-support/areas/guildadmin";
import {
  buildGuildAddRank,
  buildGuildInfoText,
  buildGuildNote,
  buildGuildRank,
  buildSaveGuildEmblem,
  buildTabardVendor,
  parseGuildEventLog,
  parseGuildInfo,
  parseGuildPermissions,
  parseSaveEmblemResult,
  parseTabardVendor,
} from "#wow/areas/guildadmin/protocol";
import { parsePackedTime } from "#wow/protocol/packed-time";
import { PacketReader } from "#wow/protocol/packet";

describe("guildadmin protocol (Server/Packets/GuildPackets.cpp:45-58)", () => {
  test("parseGuildInfo reads the name, packed creation time and counts", () => {
    expect(
      parseGuildInfo(
        new PacketReader(
          guildadminGuildInfoBody({
            ...GUILDADMIN_INFO,
            created: parsePackedTime(0x1a_90_6b_d0),
          }),
        ),
      ),
    ).toEqual({
      name: "FacSeedAlpha",
      created: parsePackedTime(0x1a_90_6b_d0),
      members: 1,
      accounts: 1,
    });
  });
});

describe("guildadmin admin packets (Server/Packets/GuildPackets.cpp:144-222, 443-458)", () => {
  test("buildGuildRank writes id, rights, name, gold and six tab pairs (GuildPackets.cpp:180-192)", () => {
    const bytes = buildGuildRank(5, {
      name: "Vet",
      rights: 0x40,
      goldPerDay: 100,
      tabs: [{ flags: 3, slots: 7 }],
    });
    const r = new PacketReader(bytes);
    expect(r.uint32LE()).toBe(5);
    expect(r.uint32LE()).toBe(0x40);
    expect(r.cString()).toBe("Vet");
    expect(r.uint32LE()).toBe(100);
    expect([r.uint32LE(), r.uint32LE()]).toEqual([3, 7]);
    for (let i = 0; i < 10; i++) expect(r.uint32LE()).toBe(0);
    expect(r.remaining).toBe(0);
  });

  test("buildGuildAddRank, buildGuildInfoText and buildGuildNote write CStrings (GuildPackets.cpp:208-222)", () => {
    expect([...buildGuildAddRank("A")]).toEqual([0x41, 0]);
    expect([...buildGuildInfoText("B")]).toEqual([0x42, 0]);
    expect([...buildGuildNote("C", "D")]).toEqual([0x43, 0, 0x44, 0]);
  });

  test("buildSaveGuildEmblem writes the guid and five u32 (GuildPackets.cpp:443-451)", () => {
    const r = new PacketReader(
      buildSaveGuildEmblem(0x1122n, {
        style: 1,
        color: 2,
        borderStyle: 3,
        borderColor: 4,
        backgroundColor: 5,
      }),
    );
    expect(r.uint64LE()).toBe(0x1122n);
    expect([1, 2, 3, 4, 5].map(() => r.uint32LE())).toEqual([1, 2, 3, 4, 5]);
    expect(r.remaining).toBe(0);
  });

  test("buildTabardVendor and parseTabardVendor carry the guid (NPCHandler.cpp:48-72)", () => {
    expect(parseTabardVendor(new PacketReader(buildTabardVendor(0x99n)))).toBe(
      0x99n,
    );
  });

  test("parseGuildPermissions reads rank, rights, gold, tab count and six tabs (GuildPackets.cpp:164-178)", () => {
    const parsed = parseGuildPermissions(
      new PacketReader(
        guildadminPermissionsBody({
          rank: 0,
          rights: 0xf_ff_ff,
          goldPerDay: -1,
          tabCount: 2,
          tabs: [{ flags: 0xff, slots: -1 }],
        }),
      ),
    );
    expect(parsed.rank).toBe(0);
    expect(parsed.rights).toBe(0xf_ff_ff);
    expect(parsed.goldPerDay).toBe(-1);
    expect(parsed.tabCount).toBe(2);
    expect(parsed.tabs).toHaveLength(6);
    expect(parsed.tabs[0]).toEqual({ flags: 0xff, slots: -1 });
  });

  test("parseGuildEventLog handles all six entry types (GuildPackets.cpp:144-162)", () => {
    const entries = parseGuildEventLog(
      new PacketReader(
        guildadminEventLogBody([
          { type: 1, player: 1n, other: 2n, secondsAgo: 10 },
          { type: 2, player: 2n, secondsAgo: 9 },
          { type: 3, player: 1n, other: 2n, rank: 3, secondsAgo: 8 },
          { type: 4, player: 1n, other: 2n, rank: 4, secondsAgo: 7 },
          { type: 5, player: 1n, other: 2n, secondsAgo: 6 },
          { type: 6, player: 2n, secondsAgo: 5 },
        ]),
      ),
    );
    expect(entries).toEqual([
      { type: 1, player: 1n, other: 2n, rank: undefined, secondsAgo: 10 },
      { type: 2, player: 2n, other: undefined, rank: undefined, secondsAgo: 9 },
      { type: 3, player: 1n, other: 2n, rank: 3, secondsAgo: 8 },
      { type: 4, player: 1n, other: 2n, rank: 4, secondsAgo: 7 },
      { type: 5, player: 1n, other: 2n, rank: undefined, secondsAgo: 6 },
      { type: 6, player: 2n, other: undefined, rank: undefined, secondsAgo: 5 },
    ]);
  });

  test("parseSaveEmblemResult reads the i32 code (GuildPackets.cpp:453-458)", () => {
    expect(
      parseSaveEmblemResult(
        new PacketReader(guildadminSaveEmblemResultBody(4)),
      ),
    ).toBe(4);
  });
});
