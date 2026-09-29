import { type DbcFile, type DbcSource, f32, openDbc, u32 } from "#wow/dbc";

export type AreaTrigger = {
  id: number;
  map: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  length: number;
  width: number;
  height: number;
  orientation: number;
};

export const TRIGGER_LAYOUT = {
  file: "AreaTrigger.dbc",
  fields: 10,
  recordSize: 40,
} as const;

function decode(file: DbcFile, row: number): AreaTrigger {
  return {
    id: u32(file, row, 0),
    map: u32(file, row, 1),
    x: f32(file, row, 2),
    y: f32(file, row, 3),
    z: f32(file, row, 4),
    radius: f32(file, row, 5),
    length: f32(file, row, 6),
    width: f32(file, row, 7),
    height: f32(file, row, 8),
    orientation: f32(file, row, 9),
  };
}

export class AreaTriggerCatalog {
  private readonly byId = new Map<number, AreaTrigger>();
  private readonly byMap = new Map<number, AreaTrigger[]>();

  constructor(triggers: readonly AreaTrigger[]) {
    for (const trigger of triggers) {
      this.byId.set(trigger.id, trigger);
      const list = this.byMap.get(trigger.map) ?? [];
      list.push(trigger);
      this.byMap.set(trigger.map, list);
    }
  }

  get(id: number): AreaTrigger | undefined {
    return this.byId.get(id);
  }

  onMap(map: number): readonly AreaTrigger[] {
    return this.byMap.get(map) ?? [];
  }
}

export async function loadAreaTriggers(
  source: DbcSource,
): Promise<AreaTriggerCatalog> {
  const file = await openDbc(source, TRIGGER_LAYOUT);
  return new AreaTriggerCatalog(
    Array.from({ length: file.recordCount }, (_, row) => decode(file, row)),
  );
}
