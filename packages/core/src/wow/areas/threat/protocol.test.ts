import { describe, expect, test } from "bun:test";
import {
  threatAiReactionBody,
  threatBreakTargetBody,
  threatClearTargetBody,
  threatHighestThreatUpdateBody,
  threatThreatClearBody,
  threatThreatRemoveBody,
  threatThreatUpdateBody,
} from "#test-support/areas/threat";
import {
  parseAiReaction,
  parseBreakTarget,
  parseClearTarget,
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

describe("reaction and target break parsers", () => {
  test("SMSG_AI_REACTION reads the full guid and HOSTILE (Creature.cpp:2477-2487)", () => {
    const body = threatAiReactionBody({ reaction: 2, unit: CREATURE });
    const reader = new PacketReader(body);
    expect(parseAiReaction(reader)).toEqual({
      code: 2,
      reaction: "hostile",
      unit: CREATURE,
    });
    expect(reader.remaining).toBe(0);
  });

  test("SMSG_AI_REACTION reads the AzerothCore byte layout", () => {
    const body = new Uint8Array([
      0xbc, 0x0a, 0x00, 0xea, 0x3e, 0x00, 0x30, 0xf1, 0, 0, 0, 0,
    ]);
    expect(parseAiReaction(new PacketReader(body))).toEqual({
      code: 0,
      reaction: "alert",
      unit: CREATURE,
    });
  });

  test("SMSG_AI_REACTION names every value of AiReaction (SharedDefines.h:3471-3478)", () => {
    const names = [0, 1, 2, 3, 4].map(
      (code) =>
        parseAiReaction(
          new PacketReader(threatAiReactionBody({ reaction: code, unit: PET })),
        ).reaction,
    );
    expect(names).toEqual([
      "alert",
      "friendly",
      "hostile",
      "afraid",
      "destroy",
    ]);
  });

  test("SMSG_AI_REACTION keeps an unknown code without throwing", () => {
    const body = threatAiReactionBody({ reaction: 9, unit: CREATURE });
    expect(parseAiReaction(new PacketReader(body))).toEqual({
      code: 9,
      reaction: "unknown",
      unit: CREATURE,
    });
  });

  test("SMSG_BREAK_TARGET reads a packed creature guid (Unit.cpp:15842-15847)", () => {
    const body = threatBreakTargetBody({ unit: CREATURE });
    const reader = new PacketReader(body);
    expect(parseBreakTarget(reader)).toEqual({ unit: CREATURE });
    expect(reader.remaining).toBe(0);
  });

  test("SMSG_CLEAR_TARGET reads the caster's full guid (SpellEffects.cpp:5019-5024)", () => {
    const body = threatClearTargetBody({ caster: CREATURE });
    expect(body.length).toBe(8);
    const reader = new PacketReader(body);
    expect(parseClearTarget(reader)).toEqual({ caster: CREATURE });
    expect(reader.remaining).toBe(0);
  });
});
