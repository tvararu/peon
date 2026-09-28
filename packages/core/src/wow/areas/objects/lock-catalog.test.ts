import { describe, expect, test } from "bun:test";
import { dbcFiles, packDbc } from "#test-support/dbc";
import { loadLockCatalog, LockKeyType } from "#wow/areas/objects/lock-catalog";

const FIELDS = 33;

function lockRow(cells: Record<number, number>): number[] {
  const row = new Array<number>(FIELDS).fill(0);
  for (const [key, value] of Object.entries(cells)) row[Number(key)] = value;
  return row;
}

describe("loadLockCatalog (src/server/shared/DataStores/DBCfmt.h:85)", () => {
  test("reads lock 43 as one skill case of lock type 13", async () => {
    const bytes = packDbc(FIELDS, [
      lockRow({ 0: 43, 2: 2, 10: 13 }),
      lockRow({ 0: 57, 2: 2, 3: 2, 10: 5, 11: 6 }),
    ]);
    const catalog = await loadLockCatalog(
      dbcFiles(new Map([["Lock.dbc", bytes]])),
    );
    expect(catalog.get(43)).toEqual({
      id: 43,
      cases: [
        { type: 0, index: 0, skill: 0 },
        { type: 2, index: 13, skill: 0 },
        { type: 0, index: 0, skill: 0 },
        { type: 0, index: 0, skill: 0 },
        { type: 0, index: 0, skill: 0 },
        { type: 0, index: 0, skill: 0 },
        { type: 0, index: 0, skill: 0 },
        { type: 0, index: 0, skill: 0 },
      ],
    });
    expect(catalog.get(57)?.cases[1]).toEqual({
      type: 2,
      index: 5,
      skill: 0,
    });
    expect(catalog.get(43)?.cases[1]?.type).toBe(LockKeyType.SKILL);
    expect(catalog.get(1)).toBeUndefined();
  });
});
