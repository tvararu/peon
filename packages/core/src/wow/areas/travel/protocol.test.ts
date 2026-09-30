import { describe, expect, test } from "bun:test";
import {
  travelBinderConfirmBody,
  travelBindPointUpdateBody,
  travelPlayerBoundBody,
  travelShowTaxiNodesBody,
  travelTaxiNodeStatusBody,
} from "#test-support/areas/travel";
import {
  buildBinderActivate,
  buildEnableTaxi,
  buildSetTaxiBenchmarkMode,
  buildTaxiNodeStatusQuery,
  buildTaxiQueryAvailableNodes,
  parseBinderConfirm,
  parseBindPointUpdate,
  parsePlayerBound,
  parseShowTaxiNodes,
  parseTaxiNodeStatus,
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

const TAXI_MASTER = 0xf1_30_00_3d_c1_00_04_57n;
const ALL_ZERO = new Array<number>(14).fill(0);

function maskOf(...nodes: number[]): number[] {
  const words = new Array<number>(14).fill(0);
  for (const node of nodes) {
    const word = Math.floor((node - 1) / 32);
    words[word] = ((words[word] ?? 0) | (1 << ((node - 1) % 32))) >>> 0;
  }
  return words;
}

describe("travel taxi parsers", () => {
  test("SMSG_SHOWTAXINODES reads the npc, the current node and the known nodes from the mask (TaxiHandler.cpp:98-102, PlayerTaxi.h:35-40)", () => {
    const body = travelShowTaxiNodesBody({
      npc: TAXI_MASTER,
      currentNode: 82,
      mask: maskOf(1, 82, 413),
    });
    const parsed = parseShowTaxiNodes(new PacketReader(body));
    expect(parsed.npc).toBe(TAXI_MASTER);
    expect(parsed.currentNode).toBe(82);
    expect(parsed.known).toEqual([1, 82, 413]);
  });

  test("SMSG_SHOWTAXINODES with an empty mask has no known nodes", () => {
    const body = travelShowTaxiNodesBody({
      npc: TAXI_MASTER,
      currentNode: 82,
      mask: ALL_ZERO,
    });
    expect(parseShowTaxiNodes(new PacketReader(body))).toEqual({
      npc: TAXI_MASTER,
      currentNode: 82,
      known: [],
    });
  });

  test("SMSG_TAXINODE_STATUS reads the guid and a boolean (TaxiHandler.cpp:27-55, Player.cpp:10715-10717)", () => {
    const yes = new PacketReader(
      travelTaxiNodeStatusBody({ npc: TAXI_MASTER, known: true }),
    );
    const no = new PacketReader(
      travelTaxiNodeStatusBody({ npc: TAXI_MASTER, known: false }),
    );
    expect(parseTaxiNodeStatus(yes)).toEqual({ npc: TAXI_MASTER, known: true });
    expect(parseTaxiNodeStatus(no)).toEqual({
      npc: TAXI_MASTER,
      known: false,
    });
  });

  test("a short taxi body throws", () => {
    expect(() => parseShowTaxiNodes(new PacketReader(new Uint8Array(16)))).toThrow();
    expect(() =>
      parseTaxiNodeStatus(new PacketReader(new Uint8Array(8))),
    ).toThrow();
  });
});

describe("travel taxi builders", () => {
  test("the node status query, the map query and enable taxi each write the 8-byte npc guid (TaxiHandler.cpp:27-33,60-63; Opcodes.cpp:1302)", () => {
    const w = new PacketWriter();
    w.uint64LE(TAXI_MASTER);
    const expected = w.finish();
    expect(buildTaxiNodeStatusQuery(TAXI_MASTER)).toEqual(expected);
    expect(buildTaxiQueryAvailableNodes(TAXI_MASTER)).toEqual(expected);
    expect(buildEnableTaxi(TAXI_MASTER)).toEqual(expected);
    expect(buildEnableTaxi(TAXI_MASTER)).toHaveLength(8);
  });

  test("CMSG_SET_TAXI_BENCHMARK_MODE is one u8 (MiscHandler.cpp:1580-1585)", () => {
    expect(buildSetTaxiBenchmarkMode(true)).toEqual(new Uint8Array([1]));
    expect(buildSetTaxiBenchmarkMode(false)).toEqual(new Uint8Array([0]));
  });
});
