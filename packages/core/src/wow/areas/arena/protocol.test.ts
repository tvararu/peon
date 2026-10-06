import { describe, expect, test } from "bun:test";
import {
  buildInspectArenaTeams,
  buildJoinArena,
  buildTeamId,
  buildTeamName,
  parseArenaError,
  parseInspectArenaTeams,
  parseQueueStatus,
  parseTeamCommandResult,
  parseTeamEvent,
  parseTeamInvite,
  parseTeamQuery,
  parseTeamRoster,
  parseTeamStats,
} from "#wow/areas/arena/protocol";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";

function queryBody(): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(7);
  w.cString("Faceless");
  w.uint32LE(2);
  w.uint32LE(0xff_ff_ff_ff);
  w.uint32LE(3);
  w.uint32LE(0x00_11_22_33);
  w.uint32LE(5);
  w.uint32LE(0x44_55_66_77);
  return w.finish();
}

function statsBody(): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(7);
  w.uint32LE(1500);
  w.uint32LE(10);
  w.uint32LE(6);
  w.uint32LE(40);
  w.uint32LE(25);
  w.uint32LE(1234);
  return w.finish();
}

function rosterBody(extra: boolean): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(7);
  w.uint8(extra ? 1 : 0);
  w.uint32LE(1);
  w.uint32LE(2);
  w.uint64LE(0x0b_00n);
  w.uint8(1);
  w.cString("Facone");
  w.uint32LE(0);
  w.uint8(80);
  w.uint8(7);
  w.uint32LE(10);
  w.uint32LE(6);
  w.uint32LE(40);
  w.uint32LE(25);
  w.uint32LE(1490);
  if (extra) {
    w.floatLE(0);
    w.floatLE(0);
  }
  return w.finish();
}

function eventBody(
  event: number,
  strings: string[],
  guid?: bigint,
): Uint8Array {
  const w = new PacketWriter();
  w.uint8(event);
  w.uint8(strings.length);
  for (const text of strings) w.cString(text);
  if (guid !== undefined) w.uint64LE(guid);
  return w.finish();
}

describe("arena protocol", () => {
  test("query response reads id, name, type and emblem", () => {
    const parsed = parseTeamQuery(new PacketReader(queryBody()));
    expect(parsed).toEqual({
      backgroundColor: 0xff_ff_ff_ff,
      borderColor: 0x44_55_66_77,
      borderStyle: 5,
      emblemColor: 0x00_11_22_33,
      emblemStyle: 3,
      id: 7,
      name: "Faceless",
      type: 2,
    });
  });

  test("stats reads rating, games and rank", () => {
    expect(parseTeamStats(new PacketReader(statsBody()))).toEqual({
      id: 7,
      rank: 1234,
      rating: 1500,
      seasonGames: 40,
      seasonWins: 25,
      weekGames: 10,
      weekWins: 6,
    });
  });

  test("roster reads members with the captain flag", () => {
    const parsed = parseTeamRoster(new PacketReader(rosterBody(false)));
    expect(parsed.id).toBe(7);
    expect(parsed.type).toBe(2);
    expect(parsed.members).toEqual([
      {
        captain: true,
        class: 7,
        guid: 0x0b_00n,
        level: 80,
        name: "Facone",
        online: true,
        personalRating: 1490,
        seasonGames: 40,
        seasonWins: 25,
        weekGames: 10,
        weekWins: 6,
      },
    ]);
  });

  test("roster skips the extra floats when the flag is set", () => {
    const parsed = parseTeamRoster(new PacketReader(rosterBody(true)));
    expect(parsed.members).toHaveLength(1);
    expect(parsed.members[0]?.name).toBe("Facone");
  });

  test("invite reads inviter and team names", () => {
    const w = new PacketWriter();
    w.cString("Facone");
    w.cString("Faceless");
    expect(parseTeamInvite(new PacketReader(w.finish()))).toEqual({
      inviter: "Facone",
      team: "Faceless",
    });
  });

  test("team event reads join strings and the joiner guid", () => {
    const parsed = parseTeamEvent(
      new PacketReader(eventBody(3, ["Facone", "Faceless"], 0x0b_00n)),
    );
    expect(parsed).toEqual({
      event: 3,
      guid: 0x0b_00n,
      name: "join",
      strings: ["Facone", "Faceless"],
    });
  });

  test("team event without a guid leaves it undefined", () => {
    const parsed = parseTeamEvent(
      new PacketReader(eventBody(8, ["Facone", "Faceless"])),
    );
    expect(parsed.guid).toBeUndefined();
    expect(parsed.name).toBe("disbanded");
  });

  test("command result reads action, names and error", () => {
    const w = new PacketWriter();
    w.uint32LE(3);
    w.cString("Faceless");
    w.cString("");
    w.uint32LE(0);
    const parsed = parseTeamCommandResult(new PacketReader(w.finish()));
    expect(parsed).toEqual({
      action: 3,
      error: 0,
      player: "",
      team: "Faceless",
    });
  });

  test("arena error reads the team type when the word is zero", () => {
    const w = new PacketWriter();
    w.uint32LE(0);
    w.uint8(2);
    expect(parseArenaError(new PacketReader(w.finish()))).toEqual({
      arenaType: 2,
    });
  });

  test("arena error leaves the type undefined otherwise", () => {
    const w = new PacketWriter();
    w.uint32LE(886);
    expect(parseArenaError(new PacketReader(w.finish()))).toEqual({
      arenaType: undefined,
    });
  });

  test("inspect reads slot, team and ratings", () => {
    const w = new PacketWriter();
    w.uint64LE(0x0c_00n);
    w.uint8(0);
    w.uint32LE(7);
    w.uint32LE(1500);
    w.uint32LE(40);
    w.uint32LE(25);
    w.uint32LE(30);
    w.uint32LE(1490);
    expect(parseInspectArenaTeams(new PacketReader(w.finish()))).toEqual({
      guid: 0x0c_00n,
      memberGames: 30,
      personalRating: 1490,
      rating: 1500,
      seasonGames: 40,
      seasonWins: 25,
      slot: 0,
      teamId: 7,
    });
  });

  test("queue status reads a queued packet", () => {
    const w = new PacketWriter();
    w.uint32LE(0);
    w.uint8(2);
    w.uint8(0x0e);
    w.uint32LE(1);
    w.uint16LE(0x1f_90);
    w.uint8(71);
    w.uint8(80);
    w.uint32LE(0);
    w.uint8(0);
    w.uint32LE(1);
    w.uint32LE(0);
    w.uint32LE(0);
    expect(parseQueueStatus(new PacketReader(w.finish()))).toEqual({
      arenaType: 2,
      kind: "queued",
      rated: false,
      slot: 0,
    });
  });

  test("queue status reads an empty slot as none", () => {
    const w = new PacketWriter();
    w.uint32LE(1);
    w.uint64LE(0n);
    expect(parseQueueStatus(new PacketReader(w.finish()))).toEqual({
      arenaType: 0,
      kind: "none",
      rated: false,
      slot: 1,
    });
  });

  test("builders write the query, invite and join bodies", () => {
    const reader = new PacketReader(buildTeamId(7));
    expect(reader.uint32LE()).toBe(7);
    const named = new PacketReader(buildTeamName(7, "Facone"));
    expect(named.uint32LE()).toBe(7);
    expect(named.cString()).toBe("Facone");
    const inspect = new PacketReader(buildInspectArenaTeams(0x0c_00n));
    expect(inspect.uint64LE()).toBe(0x0c_00n);
    const join = new PacketReader(buildJoinArena(0x0d_00n, 0, false, false));
    expect(join.uint64LE()).toBe(0x0d_00n);
    expect(join.uint8()).toBe(0);
    expect(join.uint8()).toBe(0);
    expect(join.uint8()).toBe(0);
  });
});
