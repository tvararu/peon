import { describe, expect, test } from "bun:test";
import {
  threatHighestThreatUpdateBody,
  threatThreatClearBody,
  threatThreatRemoveBody,
  threatThreatUpdateBody,
} from "#test-support/areas/threat";
import {
  parseThreatClear,
  parseThreatRemove,
  parseThreatUpdate,
} from "#wow/areas/threat/protocol";
import { PacketReader } from "#wow/protocol/packet";

const CREATURE = 0xf1_30_00_3e_ea_00_0a_bcn;
const ME = 0x2an;
const PARTNER = 0x2bn;
const PET = 0xf1_40_00_00_01_00_00_07n;

describe("threat parsers", () => {
  test("SMSG_THREAT_UPDATE keeps wire order, not threat order (ThreatManager.cpp:880-898)", () => {
    const body = threatThreatUpdateBody({
      entries: [
        { threat: 300, victim: ME },
        { threat: 900, victim: PET },
        { threat: 100, victim: PARTNER },
      ],
      unit: CREATURE,
    });
    const reader = new PacketReader(body);
    expect(parseThreatUpdate(reader, { highest: false })).toEqual({
      entries: [
        { threat: 300, victim: ME },
        { threat: 900, victim: PET },
        { threat: 100, victim: PARTNER },
      ],
      newVictim: undefined,
      unit: CREATURE,
    });
    expect(reader.remaining).toBe(0);
  });

  test("SMSG_THREAT_UPDATE reads the AzerothCore byte layout", () => {
    const body = new Uint8Array([
      0b1100_0001, 0x07, 0x40, 0xf1, 1, 0, 0, 0, 0b0000_0001, 0x2a, 0x10, 0x27,
      0, 0,
    ]);
    expect(
      parseThreatUpdate(new PacketReader(body), { highest: false }),
    ).toEqual({
      entries: [{ threat: 10_000, victim: ME }],
      newVictim: undefined,
      unit: 0xf1_40_00_00_00_00_00_07n,
    });
  });

  test("SMSG_HIGHEST_THREAT_UPDATE reads the new victim after the unit (ThreatManager.cpp:884-885)", () => {
    const body = threatHighestThreatUpdateBody({
      entries: [{ threat: 12_345, victim: PET }],
      newVictim: PET,
      unit: CREATURE,
    });
    const reader = new PacketReader(body);
    expect(parseThreatUpdate(reader, { highest: true })).toEqual({
      entries: [{ threat: 12_345, victim: PET }],
      newVictim: PET,
      unit: CREATURE,
    });
    expect(reader.remaining).toBe(0);
  });

  test("a count of 0 reads no entries (ThreatManager.cpp:886-897)", () => {
    const body = threatThreatUpdateBody({ entries: [], unit: CREATURE });
    expect(
      parseThreatUpdate(new PacketReader(body), { highest: false }).entries,
    ).toEqual([]);
  });

  test("SMSG_THREAT_REMOVE reads the unit and the victim (ThreatManager.cpp:872-878)", () => {
    const body = threatThreatRemoveBody({ unit: CREATURE, victim: ME });
    expect(parseThreatRemove(new PacketReader(body))).toEqual({
      unit: CREATURE,
      victim: ME,
    });
  });

  test("SMSG_THREAT_CLEAR reads the unit (ThreatManager.cpp:865-870)", () => {
    const body = threatThreatClearBody({ unit: CREATURE });
    expect(parseThreatClear(new PacketReader(body))).toEqual({
      unit: CREATURE,
    });
  });
});
