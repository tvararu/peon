import { describe, expect, test } from "bun:test";
import { PacketReader } from "#wow/protocol/packet";
import {
  ARENA_ENTRIES,
  CHARTERS_GUILD_MASTER,
  GUILD_ENTRY,
  chartersQueryResponseBody,
  chartersRenameBody,
  chartersShowlistBody,
  chartersSignaturesBody,
} from "#test-support/areas/charters";
import {
  buildPetitionBuy,
  buildPetitionQuery,
  buildPetitionRename,
  buildShowSignatures,
  buildShowlist,
  parseQueryResponse,
  parseRename,
  parseShowlist,
  parseSignatures,
} from "#wow/areas/charters/protocol";

const NAME = "FacAbCdeFghIjKlMn";

describe("charters protocol", () => {
  test("showlist parses the guild entry from a tabard designer", () => {
    const parsed = parseShowlist(
      new PacketReader(chartersShowlistBody(CHARTERS_GUILD_MASTER, [GUILD_ENTRY])),
    );
    expect(parsed.npc).toBe(CHARTERS_GUILD_MASTER);
    expect(parsed.entries).toEqual([GUILD_ENTRY]);
  });

  test("showlist parses the three arena entries", () => {
    const parsed = parseShowlist(
      new PacketReader(chartersShowlistBody(CHARTERS_GUILD_MASTER, ARENA_ENTRIES)),
    );
    expect(parsed.entries.map((entry) => entry.entry)).toEqual([
      23560, 23561, 23562,
    ]);
    expect(parsed.entries.map((entry) => entry.required)).toEqual([2, 3, 5]);
  });

  test("buy builds the full 3.3.5 body around the name and index", () => {
    const body = buildPetitionBuy(CHARTERS_GUILD_MASTER, 1, NAME);
    const reader = new PacketReader(body);
    expect(reader.uint64LE()).toBe(CHARTERS_GUILD_MASTER);
    expect(reader.uint32LE()).toBe(0);
    expect(reader.uint64LE()).toBe(0n);
    expect(reader.cString()).toBe(NAME);
    expect(reader.cString()).toBe("");
    for (let i = 0; i < 7; i++) expect(reader.uint32LE()).toBe(0);
    expect(reader.uint16LE()).toBe(0);
    for (let i = 0; i < 3; i++) expect(reader.uint32LE()).toBe(0);
    for (let i = 0; i < 10; i++) expect(reader.cString()).toBe("");
    expect(reader.uint32LE()).toBe(1);
    expect(reader.uint32LE()).toBe(0);
    expect(reader.remaining).toBe(0);
  });

  test("query request carries the petition id and the item guid", () => {
    const body = buildPetitionQuery(7, 0x40_00_00_00_00_00_00_31n);
    const reader = new PacketReader(body);
    expect(reader.uint32LE()).toBe(7);
    expect(reader.uint64LE()).toBe(0x40_00_00_00_00_00_00_31n);
    expect(reader.remaining).toBe(0);
  });

  test("query response parses a guild charter", () => {
    const parsed = parseQueryResponse(
      new PacketReader(
        chartersQueryResponseBody({
          id: 7,
          name: NAME,
          needed: 9,
          owner: 0x0b_00n,
          type: 0,
        }),
      ),
    );
    expect(parsed).toEqual({
      id: 7,
      kind: "guild",
      maxSigns: 9,
      minSigns: 9,
      name: NAME,
      owner: 0x0b_00n,
    });
  });

  test("query response parses an arena charter with the slot type", () => {
    const parsed = parseQueryResponse(
      new PacketReader(
        chartersQueryResponseBody({
          id: 9,
          name: NAME,
          needed: 0,
          owner: 0x0b_00n,
          type: 3,
        }),
      ),
    );
    expect(parsed.kind).toBe("arena");
    expect(parsed.minSigns).toBe(2);
    expect(parsed.maxSigns).toBe(2);
  });

  test("signatures parse an empty roster and a roster of two", () => {
    const empty = parseSignatures(
      new PacketReader(
        chartersSignaturesBody({
          item: 0x40_00_00_00_00_00_00_31n,
          petition: 7,
          requester: 0x0b_00n,
          signers: [],
        }),
      ),
    );
    expect(empty.signers).toEqual([]);
    expect(empty.petition).toBe(7);
    const full = parseSignatures(
      new PacketReader(
        chartersSignaturesBody({
          item: 0x40_00_00_00_00_00_00_31n,
          petition: 7,
          requester: 0x0b_00n,
          signers: [0x0c_00n, 0x0d_00n],
        }),
      ),
    );
    expect(full.signers).toEqual([0x0c_00n, 0x0d_00n]);
    expect(full.owner).toBe(0x0b_00n);
  });

  test("rename builds and parses back the item guid and name", () => {
    const body = buildPetitionRename(0x40_00_00_00_00_00_00_31n, NAME);
    const reader = new PacketReader(body);
    expect(reader.uint64LE()).toBe(0x40_00_00_00_00_00_00_31n);
    expect(reader.cString()).toBe(NAME);
    const parsed = parseRename(
      new PacketReader(chartersRenameBody(0x40_00_00_00_00_00_00_31n, NAME)),
    );
    expect(parsed).toEqual({ item: 0x40_00_00_00_00_00_00_31n, name: NAME });
  });

  test("show signatures and showlist requests are bare guids", () => {
    const signatures = buildShowSignatures(0x40_00_00_00_00_00_00_31n);
    expect(new PacketReader(signatures).uint64LE()).toBe(
      0x40_00_00_00_00_00_00_31n,
    );
    const showlist = buildShowlist(CHARTERS_GUILD_MASTER);
    expect(new PacketReader(showlist).uint64LE()).toBe(CHARTERS_GUILD_MASTER);
  });
});
