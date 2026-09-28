import { describe, expect, test } from "bun:test";
import {
  objectsGameObjectQueryMissingBody,
  objectsGameObjectQueryResponseBody,
} from "#test-support/areas/objects";
import { creatureQueryResponse } from "#test-support/creature-query-fixtures";
import {
  buildCreatureQuery,
  buildGameObjectQuery,
  parseCreatureQueryResponse,
  parseGameObjectQueryResponse,
} from "./entity-queries";
import { PacketReader, PacketWriter } from "./packet";

describe("creature query", () => {
  test("buildCreatureQuery produces u32 entry + u64 guid", () => {
    const buf = buildCreatureQuery(1234, 5n);
    const r = new PacketReader(buf);
    expect(r.uint32LE()).toBe(1234);
    expect(r.uint64LE()).toBe(5n);
    expect(r.remaining).toBe(0);
  });

  test("parseCreatureQueryResponse extracts name", () => {
    const w = new PacketWriter();
    w.uint32LE(1234);
    w.cString("Innkeeper Palla");
    w.cString("");
    w.cString("");
    w.cString("");
    w.cString("Innkeeper");
    const r = new PacketReader(w.finish());
    const result = parseCreatureQueryResponse(r);
    expect(result.entry).toBe(1234);
    expect(result.name).toBe("Innkeeper Palla");
  });

  test("parseCreatureQueryResponse handles unknown entry", () => {
    const w = new PacketWriter();
    w.uint32LE(1234 | 0x80_00_00_00);
    const r = new PacketReader(w.finish());
    const result = parseCreatureQueryResponse(r);
    expect(result.entry).toBe(1234);
    expect(result.name).toBeUndefined();
  });

  test("buildCreatureQuery with large guid", () => {
    const guid = 0xdeadbeefcafebaben;
    const buf = buildCreatureQuery(999, guid);
    const r = new PacketReader(buf);
    expect(r.uint32LE()).toBe(999);
    expect(r.uint64LE()).toBe(guid);
  });

  test("parseCreatureQueryResponse keeps subName, type, family and rank", () => {
    const packet = creatureQueryResponse({
      entry: 15_366,
      name: "Springpaw Stalker",
      subName: "Pack Leader",
      creatureType: 1,
      family: 2,
      rank: 1,
    });
    expect(parseCreatureQueryResponse(new PacketReader(packet))).toEqual({
      entry: 15_366,
      name: "Springpaw Stalker",
      details: { subName: "Pack Leader", creatureType: 1, family: 2, rank: 1 },
    });
  });

  test("a response cut after the names keeps the name and no details", () => {
    const w = new PacketWriter();
    w.uint32LE(1234);
    w.cString("Stormwind Guard");
    expect(parseCreatureQueryResponse(new PacketReader(w.finish()))).toEqual({
      entry: 1234,
      name: "Stormwind Guard",
      details: undefined,
    });
  });
});

describe("game object query", () => {
  test("buildGameObjectQuery produces u32 entry + u64 guid", () => {
    const buf = buildGameObjectQuery(5678, 10n);
    const r = new PacketReader(buf);
    expect(r.uint32LE()).toBe(5678);
    expect(r.uint64LE()).toBe(10n);
    expect(r.remaining).toBe(0);
  });

  test("reads the full 3.3.5 template as AzerothCore writes it (QueryHandler.cpp:194-211)", () => {
    const data = [43, 10_119, 0, 1, ...Array.from({ length: 20 }, () => 0)];
    const body = objectsGameObjectQueryResponseBody({
      castBarCaption: "",
      data,
      displayId: 3012,
      entry: 161_557,
      iconName: "",
      name: "Milly's Harvest",
      questItems: [11_119],
      size: 1,
      type: 3,
      unk1: "",
    });
    const r = new PacketReader(body);
    const result = parseGameObjectQueryResponse(r);
    expect(result).toEqual({
      castBarCaption: "",
      data,
      displayId: 3012,
      entry: 161_557,
      gameObjectType: 3,
      iconName: "",
      name: "Milly's Harvest",
      questItems: [11_119, 0, 0, 0, 0, 0],
      size: 1,
      unk1: "",
    });
    expect(r.remaining).toBe(0);
  });

  test("reads the strings in writer order (QueryHandler.cpp:197-201, gameobject_template.sql:7910)", () => {
    const data = Array.from({ length: 24 }, () => 0);
    data[0] = 93;
    data[1] = 4091;
    data[6] = 24_124;
    const result = parseGameObjectQueryResponse(
      new PacketReader(
        objectsGameObjectQueryResponseBody({
          castBarCaption: "Examining",
          data,
          displayId: 4612,
          entry: 175_524,
          name: "Mysterious Red Crystal",
          size: 3,
          type: 2,
        }),
      ),
    );
    expect(result).toMatchObject({
      castBarCaption: "Examining",
      data,
      iconName: "",
      name: "Mysterious Red Crystal",
      size: 3,
      unk1: "",
    });
  });

  test("the masked reply for a missing entry keeps the name undefined (QueryHandler.cpp:220)", () => {
    const r = new PacketReader(objectsGameObjectQueryMissingBody(161_557));
    const result = parseGameObjectQueryResponse(r);
    expect(result.entry).toBe(161_557);
    expect(result.name).toBeUndefined();
    expect(result.gameObjectType).toBeUndefined();
    expect(r.remaining).toBe(0);
  });
});
