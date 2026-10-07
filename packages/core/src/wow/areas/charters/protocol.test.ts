import { describe, expect, test } from "bun:test";
import {
  ARENA_ENTRIES,
  CHARTERS_GUILD_MASTER,
  chartersQueryResponseBody,
  chartersRenameBody,
  chartersShowlistBody,
  chartersSignaturesBody,
  GUILD_ENTRY,
} from "#test-support/areas/charters";
import {
  buildOfferPetition,
  buildPetitionBuy,
  buildPetitionDecline,
  buildPetitionQuery,
  buildPetitionRename,
  buildPetitionSign,
  buildShowlist,
  buildShowSignatures,
  buildTurnInPetition,
  parseDecline,
  parseQueryResponse,
  parseRename,
  parseShowlist,
  parseSignatures,
  parseSignResult,
  parseTurnInResult,
} from "#wow/areas/charters/protocol";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";

const NAME = "FacAbCdeFghIjKlMn";

describe("charters protocol", () => {
  test("showlist parses the guild entry from a tabard designer", () => {
    const parsed = parseShowlist(
      new PacketReader(
        chartersShowlistBody(CHARTERS_GUILD_MASTER, [GUILD_ENTRY]),
      ),
    );
    expect(parsed.npc).toBe(CHARTERS_GUILD_MASTER);
    expect(parsed.entries).toEqual([GUILD_ENTRY]);
  });

  test("showlist parses the three arena entries", () => {
    const parsed = parseShowlist(
      new PacketReader(
        chartersShowlistBody(CHARTERS_GUILD_MASTER, ARENA_ENTRIES),
      ),
    );
    expect(parsed.entries.map((entry) => entry.entry)).toEqual([
      23_560, 23_561, 23_562,
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

  test("sign is the item guid plus a zero byte", () => {
    const body = buildPetitionSign(0x40_00_00_00_00_00_00_31n);
    const reader = new PacketReader(body);
    expect(reader.uint64LE()).toBe(0x40_00_00_00_00_00_00_31n);
    expect(reader.uint8()).toBe(0);
    expect(reader.remaining).toBe(0);
  });

  test("sign results carry the item, the signer and a u32 verdict", () => {
    const w = new PacketWriter();
    w.uint64LE(0x40_00_00_00_00_00_00_31n);
    w.uint64LE(0x0c_00n);
    w.uint32LE(0);
    const parsed = parseSignResult(new PacketReader(w.finish()));
    expect(parsed).toEqual({
      item: 0x40_00_00_00_00_00_00_31n,
      result: 0,
      signer: 0x0c_00n,
    });
  });

  test("decline bodies are a bare item guid on both sides", () => {
    const out = buildPetitionDecline(0x40_00_00_00_00_00_00_31n);
    expect(new PacketReader(out).uint64LE()).toBe(0x40_00_00_00_00_00_00_31n);
    expect(parseDecline(new PacketReader(out))).toBe(
      0x40_00_00_00_00_00_00_31n,
    );
  });

  test("offer is junk zero then the charter and the target", () => {
    const body = buildOfferPetition(0x40_00_00_00_00_00_00_31n, 0x0c_00n);
    const reader = new PacketReader(body);
    expect(reader.uint32LE()).toBe(0);
    expect(reader.uint64LE()).toBe(0x40_00_00_00_00_00_00_31n);
    expect(reader.uint64LE()).toBe(0x0c_00n);
    expect(reader.remaining).toBe(0);
  });

  test("turn-in is a bare guid for a guild charter", () => {
    const body = buildTurnInPetition(0x40_00_00_00_00_00_00_31n, undefined);
    const reader = new PacketReader(body);
    expect(reader.uint64LE()).toBe(0x40_00_00_00_00_00_00_31n);
    expect(reader.remaining).toBe(0);
  });

  test("turn-in appends five emblem values for an arena charter", () => {
    const body = buildTurnInPetition(0x40_00_00_00_00_00_00_31n, {
      background: 1,
      border: 4,
      borderColor: 5,
      icon: 2,
      iconColor: 3,
    });
    const reader = new PacketReader(body);
    expect(reader.uint64LE()).toBe(0x40_00_00_00_00_00_00_31n);
    expect([
      reader.uint32LE(),
      reader.uint32LE(),
      reader.uint32LE(),
      reader.uint32LE(),
      reader.uint32LE(),
    ]).toEqual([1, 2, 3, 4, 5]);
    expect(reader.remaining).toBe(0);
  });

  test("turn-in results are a bare u32 verdict", () => {
    const w = new PacketWriter();
    w.uint32LE(4);
    expect(parseTurnInResult(new PacketReader(w.finish()))).toBe(4);
  });
});
