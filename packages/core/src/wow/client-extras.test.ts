import { describe, expect, test } from "bun:test";
import { creatureQueryResponse } from "#test-support/creature-query-fixtures";
import { extrasMethods, type NoticeEvent } from "#wow/client-extras";
import { EntityStore } from "#wow/entity-store";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";
import type { Runtimes } from "#wow/runtime";
import type { WorldConn } from "#wow/world-conn";
import { createWorldEvents } from "#wow/world-events";
import { handleCreatureQueryResponse } from "#wow/world-handlers-entity";

const notice: NoticeEvent = {
  type: "not_implemented",
  opcode: GameOpcode.SMSG_WEATHER,
  label: "Weather change",
  text: "[peon] Weather change is not yet implemented",
  at: 1,
};

function extras() {
  const conn = {
    creatureInfoCache: new Map(),
    events: createWorldEvents(),
  } as unknown as WorldConn;
  return { conn, methods: extrasMethods(conn, {} as Runtimes) };
}

function creatureConn(): WorldConn {
  return {
    creatureInfoCache: new Map(),
    creatureNameCache: new Map(),
    entityStore: new EntityStore(),
    events: createWorldEvents(),
    pendingNameQueries: new Set(),
  } as unknown as WorldConn;
}

describe("extrasMethods", () => {
  test("onNotice delivers notice events until unsubscribed", () => {
    const { conn, methods } = extras();
    const seen: NoticeEvent[] = [];
    const off = methods.onNotice((event) => seen.push(event));
    conn.events.notice.emit(notice);
    off();
    conn.events.notice.emit(notice);
    expect(seen).toEqual([notice]);
  });

  test("capabilities come from the runtimes", () => {
    const flags = {
      factions: true,
      spells: false,
      navigation: true,
    };
    const conn = {
      creatureInfoCache: new Map(),
      events: createWorldEvents(),
    } as unknown as WorldConn;
    const rt = { capabilities: () => flags } as unknown as Runtimes;
    expect(extrasMethods(conn, rt).capabilities()).toEqual(flags);
  });

  test("getCreatureInfo returns the cached creature query answer by entry", () => {
    const conn = creatureConn();
    const methods = extrasMethods(conn, {} as Runtimes);
    expect(methods.getCreatureInfo(15_366)).toBeUndefined();
    const packet = creatureQueryResponse({
      entry: 15_366,
      name: "Springpaw Stalker",
      subName: "Pack Leader",
      creatureType: 1,
      family: 2,
      rank: 2,
    });
    handleCreatureQueryResponse(conn, new PacketReader(packet));
    expect(methods.getCreatureInfo(15_366)).toEqual({
      entry: 15_366,
      name: "Springpaw Stalker",
      subName: "Pack Leader",
      creatureType: 1,
      family: 2,
      rank: "rare_elite",
    });
  });

  test("an empty subName reads as undefined and an unknown rank as normal", () => {
    const conn = creatureConn();
    const packet = creatureQueryResponse({
      entry: 3,
      name: "Wolf",
      subName: "",
      creatureType: 1,
      family: 1,
      rank: 9,
    });
    handleCreatureQueryResponse(conn, new PacketReader(packet));
    expect(
      extrasMethods(conn, {} as Runtimes).getCreatureInfo(3),
    ).toMatchObject({ rank: "normal", subName: undefined });
  });

  test("a response cut after the names keeps the name and caches no info", () => {
    const conn = creatureConn();
    const w = new PacketWriter();
    w.uint32LE(1234);
    w.cString("Stormwind Guard");
    handleCreatureQueryResponse(conn, new PacketReader(w.finish()));
    expect(conn.creatureNameCache.get(1234)).toBe("Stormwind Guard");
    expect(
      extrasMethods(conn, {} as Runtimes).getCreatureInfo(1234),
    ).toBeUndefined();
  });
});
