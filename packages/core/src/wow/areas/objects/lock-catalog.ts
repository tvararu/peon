import { type DbcFile, type DbcSource, openDbc, u32 } from "#wow/dbc";

export type LockCase = {
  type: number;
  index: number;
  skill: number;
};

export type LockEntry = {
  id: number;
  cases: readonly LockCase[];
};

export const LockKeyType = { NONE: 0, ITEM: 1, SKILL: 2, SPELL: 3 } as const;

const LOCK_CASES = 8;
export const LOCK_LAYOUT = {
  file: "Lock.dbc",
  fields: 33,
  recordSize: 132,
} as const;

function decode(file: DbcFile, row: number): LockEntry {
  const cases: LockCase[] = [];
  for (let i = 0; i < LOCK_CASES; i++) {
    cases.push({
      type: u32(file, row, 1 + i),
      index: u32(file, row, 9 + i),
      skill: u32(file, row, 17 + i),
    });
  }
  return { id: u32(file, row, 0), cases };
}

export class LockCatalog {
  private readonly byId = new Map<number, LockEntry>();

  constructor(entries: readonly LockEntry[]) {
    for (const entry of entries) this.byId.set(entry.id, entry);
  }

  get(id: number): LockEntry | undefined {
    return this.byId.get(id);
  }
}

export async function loadLockCatalog(source: DbcSource): Promise<LockCatalog> {
  const file = await openDbc(source, LOCK_LAYOUT);
  return new LockCatalog(
    Array.from({ length: file.recordCount }, (_, row) => decode(file, row)),
  );
}
