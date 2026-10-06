import { describe, expect, test } from "bun:test";
import {
  guildadminEventBody,
  guildadminQueryResponseBody,
  guildadminRosterBody,
} from "#test-support/areas/guildadmin";
import { must } from "#test-support/must";
import {
  buildGuildQuery,
  GuildEventCode,
  GuildMemberStatus,
  parseGuildEvent,
  parseGuildQueryResponse,
  parseGuildRoster,
} from "#wow/protocol/guild";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";

describe("GuildMemberStatus", () => {
  test("OFFLINE is 0", () => {
    expect(GuildMemberStatus.OFFLINE).toBe(0);
  });

  test("ONLINE is 1", () => {
    expect(GuildMemberStatus.ONLINE).toBe(1);
  });
});

function writeRankData(w: PacketWriter) {
  w.uint32LE(0);
  w.uint32LE(0);
  for (let j = 0; j < 6; j++) {
    w.uint32LE(0);
    w.uint32LE(0);
  }
}

describe("parseGuildRoster", () => {
  test("parses empty roster with 0 members and 0 ranks", () => {
    const w = new PacketWriter();
    w.uint32LE(0);
    w.cString("");
    w.cString("");
    w.uint32LE(0);

    const result = parseGuildRoster(new PacketReader(w.finish()));
    expect(result.memberCount).toBe(0);
    expect(result.motd).toBe("");
    expect(result.guildInfo).toBe("");
    expect(result.rankCount).toBe(0);
    expect(result.members).toHaveLength(0);
  });

  test("parses roster with motd and guild info strings", () => {
    const w = new PacketWriter();
    w.uint32LE(0);
    w.cString("Welcome to the guild!");
    w.cString("We raid on Tuesdays.");
    w.uint32LE(0);

    const result = parseGuildRoster(new PacketReader(w.finish()));
    expect(result.motd).toBe("Welcome to the guild!");
    expect(result.guildInfo).toBe("We raid on Tuesdays.");
    expect(result.members).toHaveLength(0);
  });

  test("skips rank data correctly (56 bytes per rank)", () => {
    const w = new PacketWriter();
    w.uint32LE(0);
    w.cString("");
    w.cString("");
    w.uint32LE(3);
    for (let i = 0; i < 3; i++) {
      writeRankData(w);
    }

    const result = parseGuildRoster(new PacketReader(w.finish()));
    expect(result.rankCount).toBe(3);
    expect(result.members).toHaveLength(0);
  });

  test("parses 2 members: 1 online, 1 offline", () => {
    const w = new PacketWriter();
    w.uint32LE(2);
    w.cString("Hello guild");
    w.cString("");
    w.uint32LE(1);
    writeRankData(w);

    w.uint64LE(10n);
    w.uint8(GuildMemberStatus.ONLINE);
    w.cString("Thrall");
    w.uint32LE(0);
    w.uint8(80);
    w.uint8(1);
    w.uint8(0);
    w.uint32LE(1519);
    w.cString("GM");
    w.cString("leader");

    w.uint64LE(20n);
    w.uint8(GuildMemberStatus.OFFLINE);
    w.cString("Jaina");
    w.uint32LE(1);
    w.uint8(78);
    w.uint8(8);
    w.uint8(1);
    w.uint32LE(1637);
    w.floatLE(1.5);
    w.cString("");
    w.cString("on vacation");

    const result = parseGuildRoster(new PacketReader(w.finish()));
    expect(result.memberCount).toBe(2);
    expect(result.motd).toBe("Hello guild");
    expect(result.rankCount).toBe(1);
    expect(result.members).toHaveLength(2);

    const m0 = must(result.members[0]);
    expect(m0.guid).toBe(10n);
    expect(m0.status).toBe(GuildMemberStatus.ONLINE);
    expect(m0.name).toBe("Thrall");
    expect(m0.rankIndex).toBe(0);
    expect(m0.level).toBe(80);
    expect(m0.playerClass).toBe(1);
    expect(m0.gender).toBe(0);
    expect(m0.area).toBe(1519);
    expect(m0.timeOffline).toBe(0);
    expect(m0.publicNote).toBe("GM");
    expect(m0.officerNote).toBe("leader");

    const m1 = must(result.members[1]);
    expect(m1.guid).toBe(20n);
    expect(m1.status).toBe(GuildMemberStatus.OFFLINE);
    expect(m1.name).toBe("Jaina");
    expect(m1.rankIndex).toBe(1);
    expect(m1.level).toBe(78);
    expect(m1.playerClass).toBe(8);
    expect(m1.gender).toBe(1);
    expect(m1.area).toBe(1637);
    expect(m1.timeOffline).toBeCloseTo(1.5, 1);
    expect(m1.publicNote).toBe("");
    expect(m1.officerNote).toBe("on vacation");
  });

  test("online member has timeOffline defaulted to 0", () => {
    const w = new PacketWriter();
    w.uint32LE(1);
    w.cString("");
    w.cString("");
    w.uint32LE(0);

    w.uint64LE(5n);
    w.uint8(GuildMemberStatus.ONLINE);
    w.cString("Arthas");
    w.uint32LE(0);
    w.uint8(80);
    w.uint8(6);
    w.uint8(0);
    w.uint32LE(4395);
    w.cString("");
    w.cString("");

    const result = parseGuildRoster(new PacketReader(w.finish()));
    const m = must(result.members[0]);
    expect(m.timeOffline).toBe(0);
  });

  test("offline member reads float for timeOffline", () => {
    const w = new PacketWriter();
    w.uint32LE(1);
    w.cString("");
    w.cString("");
    w.uint32LE(0);

    w.uint64LE(7n);
    w.uint8(GuildMemberStatus.OFFLINE);
    w.cString("Sylvanas");
    w.uint32LE(2);
    w.uint8(70);
    w.uint8(3);
    w.uint8(1);
    w.uint32LE(85);
    w.floatLE(0);
    w.cString("note");
    w.cString("");

    const result = parseGuildRoster(new PacketReader(w.finish()));
    const m = must(result.members[0]);
    expect(m.timeOffline).toBe(0);
    expect(m.publicNote).toBe("note");
  });

  test("consumes all bytes with multiple ranks and members", () => {
    const w = new PacketWriter();
    w.uint32LE(1);
    w.cString("motd");
    w.cString("info");
    w.uint32LE(2);
    writeRankData(w);
    writeRankData(w);

    w.uint64LE(99n);
    w.uint8(GuildMemberStatus.ONLINE);
    w.cString("X");
    w.uint32LE(0);
    w.uint8(1);
    w.uint8(1);
    w.uint8(0);
    w.uint32LE(0);
    w.cString("");
    w.cString("");

    const buf = w.finish();
    const r = new PacketReader(buf);
    parseGuildRoster(r);
    expect(r.remaining).toBe(0);
  });
});

describe("parseGuildQueryResponse", () => {
  const emblem = {
    style: 3,
    color: 4,
    borderStyle: 5,
    borderColor: 6,
    backgroundColor: 7,
  };

  test("parses guild id, name, emblem and rank count", () => {
    const r = new PacketReader(
      guildadminQueryResponseBody({
        id: 42,
        name: "Dark Iron Dwarves",
        rankNames: ["Guild Master", "Officer"],
        emblem,
        rankCount: 5,
      }),
    );
    const result = parseGuildQueryResponse(r);
    expect(result.guildId).toBe(42);
    expect(result.name).toBe("Dark Iron Dwarves");
    expect(result.emblem).toEqual(emblem);
    expect(result.rankCount).toBe(5);
    expect(r.remaining).toBe(0);
  });

  test("keeps all ten rank names, unused ones empty", () => {
    const result = parseGuildQueryResponse(
      new PacketReader(
        guildadminQueryResponseBody({
          id: 1,
          name: "TestGuild",
          rankNames: [
            "Guild Master",
            "Officer",
            "Veteran",
            "Member",
            "Initiate",
          ],
          emblem,
          rankCount: 5,
        }),
      ),
    );
    expect(result.rankNames).toHaveLength(10);
    expect(result.rankNames.slice(0, 5)).toEqual([
      "Guild Master",
      "Officer",
      "Veteran",
      "Member",
      "Initiate",
    ]);
    expect(result.rankNames.slice(5)).toEqual(["", "", "", "", ""]);
  });

  test("reads the live 91-byte shape of an unconfigured emblem", () => {
    const body = guildadminQueryResponseBody({
      id: 22,
      name: "FacSeedAlpha",
      rankNames: ["Guild Master", "Officer", "Veteran", "Member", "Initiate"],
      emblem: {
        style: 0,
        color: 0,
        borderStyle: 0,
        borderColor: 0,
        backgroundColor: 0,
      },
      rankCount: 5,
    });
    expect(body.byteLength).toBe(91);
    expect(parseGuildQueryResponse(new PacketReader(body)).rankCount).toBe(5);
  });

  test("rejects a response cut before the emblem", () => {
    const w = new PacketWriter();
    w.uint32LE(7);
    w.cString("G");
    for (let i = 0; i < 10; i++) {
      w.cString("");
    }
    expect(() => parseGuildQueryResponse(new PacketReader(w.finish()))).toThrow(
      RangeError,
    );
  });
});

describe("parseGuildRoster with rank rights", () => {
  const tabs = (base: number) =>
    [0, 1, 2, 3, 4, 5].map((i) => ({ flags: base + i, slots: base * 2 + i }));
  const ranks = [
    { rights: 0x00_f1_1d_00, goldPerDay: 0xff_ff_ff_ff, tabs: tabs(10) },
    { rights: 0x00_00_00_c0, goldPerDay: 5000, tabs: tabs(20) },
  ];
  const member = {
    guid: 0x10n,
    status: GuildMemberStatus.ONLINE,
    name: "Thrall",
    rankIndex: 0,
    level: 80,
    playerClass: 7,
    gender: 0,
    area: 4395,
    timeOffline: 0,
    publicNote: "",
    officerNote: "",
  };

  test("returns each rank's rights, gold per day and six tab pairs", () => {
    const r = new PacketReader(
      guildadminRosterBody({
        motd: "No message set.",
        info: "",
        ranks,
        members: [member],
      }),
    );
    const roster = parseGuildRoster(r);
    expect(roster.ranks).toEqual(ranks);
    expect(roster.rankCount).toBe(2);
    expect(must(roster.members[0]).name).toBe("Thrall");
    expect(r.remaining).toBe(0);
  });

  test("reads an offline member's time offline after its area", () => {
    const roster = parseGuildRoster(
      new PacketReader(
        guildadminRosterBody({
          motd: "",
          info: "",
          ranks,
          members: [
            { ...member, status: GuildMemberStatus.OFFLINE, timeOffline: 2.5 },
            { ...member, guid: 0x11n, name: "Jaina" },
          ],
        }),
      ),
    );
    expect(must(roster.members[0]).timeOffline).toBe(2.5);
    expect(must(roster.members[1]).name).toBe("Jaina");
  });
});

describe("buildGuildQuery", () => {
  test("produces a 4-byte u32 LE packet", () => {
    const body = buildGuildQuery(123);
    expect(body.byteLength).toBe(4);
    const r = new PacketReader(body);
    expect(r.uint32LE()).toBe(123);
    expect(r.remaining).toBe(0);
  });

  test("encodes large guild id", () => {
    const body = buildGuildQuery(0xde_ad_be_ef);
    const r = new PacketReader(body);
    expect(r.uint32LE()).toBe(0xde_ad_be_ef);
  });
});

describe("GuildEventCode", () => {
  test("matches AzerothCore's GuildEvents (Guild.h:145-165)", () => {
    expect(GuildEventCode).toMatchObject({
      PROMOTION: 0,
      DISBANDED: 8,
      RANK_UPDATED: 10,
      RANK_DELETED: 11,
      SIGNED_OFF: 13,
      BANK_TAB_PURCHASED: 15,
      BANK_TAB_UPDATED: 16,
      BANK_MONEY_SET: 17,
      BANK_TAB_AND_MONEY_UPDATED: 18,
    });
  });
});

describe("parseGuildEvent", () => {
  test("reads the bank money parameter and no trailing guid", () => {
    const r = new PacketReader(
      guildadminEventBody({
        code: GuildEventCode.BANK_MONEY_SET,
        params: ["0000000000000C80"],
      }),
    );
    expect(parseGuildEvent(r)).toEqual({
      eventType: 17,
      params: ["0000000000000C80"],
    });
    expect(r.remaining).toBe(0);
  });
});
