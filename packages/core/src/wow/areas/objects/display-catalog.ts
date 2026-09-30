import { type DbcFile, type DbcSource, f32, openDbc, u32 } from "#wow/dbc";

export type DisplayBounds = {
  id: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
};

const DISPLAY_FILE = ["GameObject", "DisplayInfo.dbc"].join("");
export const DISPLAY_LAYOUT = {
  file: DISPLAY_FILE,
  fields: 19,
  recordSize: 76,
} as const;

function decode(file: DbcFile, row: number): DisplayBounds {
  return {
    id: u32(file, row, 0),
    minX: f32(file, row, 12),
    minY: f32(file, row, 13),
    minZ: f32(file, row, 14),
    maxX: f32(file, row, 15),
    maxY: f32(file, row, 16),
    maxZ: f32(file, row, 17),
  };
}

export class DisplayCatalog {
  private readonly byId = new Map<number, DisplayBounds>();

  constructor(entries: readonly DisplayBounds[]) {
    for (const entry of entries) this.byId.set(entry.id, entry);
  }

  get(id: number): DisplayBounds | undefined {
    return this.byId.get(id);
  }
}

export async function loadDisplayCatalog(
  source: DbcSource,
): Promise<DisplayCatalog> {
  const file = await openDbc(source, DISPLAY_LAYOUT);
  return new DisplayCatalog(
    Array.from({ length: file.recordCount }, (_, row) => decode(file, row)),
  );
}
