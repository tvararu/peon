import { dbcFiles, packDbc } from "#test-support/dbc";
import type { DbcSource } from "#wow/dbc";
import { PacketWriter } from "#wow/protocol/packet";

export type FactionSlot = { flags: number; standing: number };

export function reputationInitializeFactionsBody(
  entries: ReadonlyMap<number, FactionSlot> = new Map(),
  count = 128,
): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(count);
  for (let id = 0; id < count; id++) {
    const slot = entries.get(id);
    w.uint8(slot?.flags ?? 0);
    w.uint32LE(slot?.standing ?? 0);
  }
  return w.finish();
}

export function reputationSetFactionStandingBody(init: {
  increased: boolean;
  entries: readonly { repListId: number; standing: number }[];
}): Uint8Array {
  const w = new PacketWriter();
  w.floatLE(0);
  w.uint8(init.increased ? 1 : 0);
  w.uint32LE(init.entries.length);
  for (const entry of init.entries) {
    w.uint32LE(entry.repListId);
    w.uint32LE(entry.standing);
  }
  return w.finish();
}

export function reputationSetFactionVisibleBody(repListId: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(repListId);
  return w.finish();
}

export type FactionDbcRow = {
  id: number;
  repListId: number;
  name: string;
  races?: readonly number[];
  classes?: readonly number[];
  values?: readonly number[];
  flags?: readonly number[];
};

export function reputationFactionDbc(
  rows: readonly FactionDbcRow[],
): Uint8Array {
  let text = "\0";
  const cells = rows.map((init) => {
    const row = new Array<number>(57).fill(0);
    row[0] = init.id;
    row[1] = init.repListId;
    for (let i = 0; i < 4; i++) {
      row[2 + i] = init.races?.[i] ?? 0;
      row[6 + i] = init.classes?.[i] ?? 0;
      row[10 + i] = init.values?.[i] ?? 0;
      row[14 + i] = init.flags?.[i] ?? 0;
    }
    row[23] = text.length;
    text += `${init.name}\0`;
    return row;
  });
  return packDbc(57, cells, new TextEncoder().encode(text));
}

export function reputationDbcSource(rows: readonly FactionDbcRow[]): DbcSource {
  return dbcFiles(new Map([["Faction.dbc", reputationFactionDbc(rows)]]));
}

export const BLOOD_ELF_MASK = 1 << 9;
export const MAGE_MASK = 1 << 7;
export const WARLOCK_MASK = 1 << 8;
export const HORDE_RACES_MASK = 0x2_b2;

export const REPUTATION_FACTIONS: readonly FactionDbcRow[] = [
  {
    classes: [0, WARLOCK_MASK, 0, 0],
    flags: [0x11, 0x10, 0, 0],
    id: 911,
    name: "Silvermoon City",
    races: [BLOOD_ELF_MASK, 0, HORDE_RACES_MASK, 0],
    repListId: 14,
    values: [3000, 400, -42_000, 0],
  },
  {
    id: 87,
    name: "Bloodsail Buccaneers",
    races: [1791],
    repListId: 20,
    values: [-2500],
  },
  { id: 589, name: "Wintersaber Trainers", repListId: -1 },
];
