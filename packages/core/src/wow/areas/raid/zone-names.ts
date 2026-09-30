import {
  type DbcFile,
  type DbcSource,
  DbcTable,
  localeString,
  openDbc,
} from "#wow/dbc";

export const AREA_TABLE_LAYOUT = {
  fields: 36,
  file: "AreaTable.dbc",
  recordSize: 144,
} as const;

const NAME_COLUMN = 11;

export type ZoneNames = { get: (id: number) => string | undefined };

function decodeName(file: DbcFile, row: number): string {
  return localeString(file, row, NAME_COLUMN);
}

export async function loadZoneNames(source: DbcSource): Promise<ZoneNames> {
  const table = new DbcTable(
    await openDbc(source, AREA_TABLE_LAYOUT),
    decodeName,
  );
  return {
    get: (id) => {
      const name = table.get(id);
      return name === undefined || name === "" ? undefined : name;
    },
  };
}
