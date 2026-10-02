import { describe, expect, test } from "bun:test";
import {
  combatlogSpellExecuteBody,
  type ExecuteRecordInit,
} from "#test-support/areas/combatlog";
import {
  executeEntries,
  parseSpellExecute,
} from "#wow/areas/combatlog/execute";
import { PacketReader } from "#wow/protocol/packet";

const ME = 0x2an;
const WITCH = 0xf1_30_00_3e_d5_00_0a_bcn;

function parse(body: Uint8Array) {
  return parseSpellExecute(new PacketReader(body));
}

describe("parseSpellExecute (Spell.cpp:5224-5256, :5258-5322)", () => {
  test("reads caster, spell and a create-item record", () => {
    const parsed = parse(
      combatlogSpellExecuteBody({
        caster: ME,
        effects: [{ effect: 24, records: [{ entry: 5350 }] }],
        spellId: 5504,
      }),
    );
    expect(parsed).toEqual({
      caster: ME,
      effects: [{ effect: 24, records: [{ guid: 0n, value: 5350 }] }],
      spellId: 5504,
      truncated: false,
    });
  });

  const cases: readonly (readonly [
    name: string,
    effect: number,
    record: ExecuteRecordInit,
    expected: { guid: bigint; value: number; power?: number },
  ])[] = [
    [
      "power drain",
      8,
      { guid: WITCH, powerTaken: 31, powerType: 0, multiplier: 1.5 },
      { guid: WITCH, value: 31, power: 0 },
    ],
    [
      "power burn",
      62,
      { guid: WITCH, powerTaken: 40, powerType: 0, multiplier: 0 },
      { guid: WITCH, value: 40, power: 0 },
    ],
    [
      "extra attacks",
      19,
      { guid: WITCH, attacks: 2 },
      { guid: WITCH, value: 2 },
    ],
    ["interrupt", 68, { guid: WITCH, spell: 332 }, { guid: WITCH, value: 332 }],
    [
      "durability damage",
      111,
      { guid: WITCH, item: 2092, slot: 15 },
      { guid: WITCH, value: 2092 },
    ],
    [
      "durability damage on every item",
      111,
      { guid: WITCH, item: -1, slot: -1 },
      { guid: WITCH, value: -1 },
    ],
    ["feed pet", 101, { entry: 117 }, { guid: 0n, value: 117 }],
    ...[18, 113, 33, 28, 50, 76, 83, 102, 104, 105, 106, 107].map(
      (effect) =>
        [
          `guid only (${effect})`,
          effect,
          { guid: WITCH },
          { guid: WITCH, value: 0 },
        ] as const,
    ),
  ];
  test.each(cases)("%s", (_name, effect, record, expected) => {
    const parsed = parse(
      combatlogSpellExecuteBody({
        caster: ME,
        effects: [{ effect, records: [record] }],
        spellId: 1,
      }),
    );
    expect(parsed.truncated).toBe(false);
    expect(parsed.effects).toEqual([{ effect, records: [expected] }]);
  });

  test("a target count above 1 reads that many records (Spell.cpp:8838-8845)", () => {
    const parsed = parse(
      combatlogSpellExecuteBody({
        caster: ME,
        effects: [
          {
            effect: 68,
            records: [
              { guid: WITCH, spell: 332 },
              { guid: ME, spell: 403 },
            ],
          },
          { effect: 24, records: [{ entry: 5350 }] },
        ],
        spellId: 1,
      }),
    );
    expect(parsed.truncated).toBe(false);
    expect(parsed.effects.map((e) => [e.effect, e.records.length])).toEqual([
      [68, 2],
      [24, 1],
    ]);
    expect(parsed.effects[0]?.records[1]).toEqual({ guid: ME, value: 403 });
  });

  test("an effect outside the table keeps what was read and sets truncated", () => {
    const parsed = parse(
      combatlogSpellExecuteBody({
        caster: ME,
        effects: [
          { effect: 24, records: [{ entry: 5350 }] },
          { effect: 999, records: [{ raw: new Uint8Array([1, 2, 3, 4]) }] },
          { effect: 68, records: [{ guid: WITCH, spell: 332 }] },
        ],
        spellId: 1,
      }),
    );
    expect(parsed.truncated).toBe(true);
    expect(parsed.effects).toEqual([
      { effect: 24, records: [{ guid: 0n, value: 5350 }] },
      { effect: 999, records: [] },
    ]);
  });

  test("a body cut inside a record keeps the records before it", () => {
    const full = combatlogSpellExecuteBody({
      caster: ME,
      effects: [
        {
          effect: 68,
          records: [
            { guid: WITCH, spell: 332 },
            { guid: WITCH, spell: 403 },
          ],
        },
      ],
      spellId: 1,
    });
    const parsed = parse(full.slice(0, full.length - 3));
    expect(parsed.truncated).toBe(true);
    expect(parsed.effects).toEqual([
      { effect: 68, records: [{ guid: WITCH, value: 332 }] },
    ]);
  });

  test("a record count larger than the bytes left is truncated, not read", () => {
    const body = combatlogSpellExecuteBody({
      caster: ME,
      effects: [{ effect: 24, records: [{ entry: 5350 }] }],
      spellId: 1,
    });
    new DataView(body.buffer, body.byteOffset).setUint32(
      body.length - 8,
      4_000_000_000,
      true,
    );
    const parsed = parse(body);
    expect(parsed.truncated).toBe(true);
    expect(parsed.effects).toEqual([{ effect: 24, records: [] }]);
  });

  const SHORT_PLAYER = 0x1322n;

  test.each([18, 113])(
    "a final GUID-only effect %i reads a three-byte player record (Spell.cpp:5319-5322)",
    (effect) => {
      const body = combatlogSpellExecuteBody({
        caster: ME,
        effects: [{ effect, records: [{ guid: SHORT_PLAYER }] }],
        spellId: 1,
      });
      expect(Array.from(body.slice(body.length - 3))).toEqual([
        0x03, 0x22, 0x13,
      ]);
      const parsed = parse(body);
      expect(parsed.truncated).toBe(false);
      expect(parsed.effects).toEqual([
        { effect, records: [{ guid: SHORT_PLAYER, value: 0 }] },
      ]);
    },
  );

  test("two short GUID-only records in one effect are both read", () => {
    const parsed = parse(
      combatlogSpellExecuteBody({
        caster: ME,
        effects: [
          {
            effect: 113,
            records: [{ guid: SHORT_PLAYER }, { guid: 0x1323n }],
          },
        ],
        spellId: 1,
      }),
    );
    expect(parsed.truncated).toBe(false);
    expect(parsed.effects[0]?.records.map((r) => r.guid)).toEqual([
      SHORT_PLAYER,
      0x1323n,
    ]);
  });

  test("a GUID-only count larger than the bytes left is still truncated", () => {
    const body = combatlogSpellExecuteBody({
      caster: ME,
      effects: [{ effect: 18, records: [{ guid: SHORT_PLAYER }] }],
      spellId: 1,
    });
    new DataView(body.buffer, body.byteOffset).setUint32(
      body.length - 7,
      4,
      true,
    );
    const parsed = parse(body);
    expect(parsed.truncated).toBe(true);
    expect(parsed.effects).toEqual([{ effect: 18, records: [] }]);
  });

  test("an effect count of zero yields no effects", () => {
    const parsed = parse(
      combatlogSpellExecuteBody({ caster: ME, effects: [], spellId: 7 }),
    );
    expect(parsed).toEqual({
      caster: ME,
      effects: [],
      spellId: 7,
      truncated: false,
    });
  });

  test("a body cut before an effect header is truncated", () => {
    const full = combatlogSpellExecuteBody({
      caster: ME,
      effects: [{ effect: 24, records: [{ entry: 5350 }] }],
      spellId: 1,
    });
    const parsed = parse(full.slice(0, 8));
    expect(parsed.truncated).toBe(true);
    expect(parsed.effects).toEqual([]);
  });
});

describe("executeEntries", () => {
  test("maps each record to one execute entry tagged with its effect", () => {
    const entries = executeEntries({
      caster: ME,
      effects: [
        {
          effect: 62,
          records: [{ guid: WITCH, value: 40, power: 0 }],
        },
        { effect: 24, records: [{ guid: 0n, value: 5350 }] },
        {
          effect: 68,
          records: [
            { guid: WITCH, value: 332 },
            { guid: ME, value: 403 },
          ],
        },
      ],
      spellId: 8129,
      truncated: false,
    });
    expect(entries).toEqual([
      {
        kind: "execute",
        source: ME,
        target: WITCH,
        spellId: 8129,
        amount: 40,
        power: 0,
        extra: 62,
      },
      {
        kind: "execute",
        source: ME,
        target: 0n,
        spellId: 8129,
        amount: 5350,
        extra: 24,
      },
      {
        kind: "execute",
        source: ME,
        target: WITCH,
        spellId: 8129,
        amount: 332,
        extra: 68,
      },
      {
        kind: "execute",
        source: ME,
        target: ME,
        spellId: 8129,
        amount: 403,
        extra: 68,
      },
    ]);
  });

  test("an effect with no record yields nothing", () => {
    expect(
      executeEntries({
        caster: ME,
        effects: [{ effect: 999, records: [] }],
        spellId: 1,
        truncated: true,
      }),
    ).toEqual([]);
  });
});
