import type { PacketReader } from "#wow/protocol/packet";

export type PackedTime = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
};

export function parsePackedTime(raw: number): PackedTime {
  return {
    year: (raw >>> 24) + 2000,
    month: ((raw >>> 20) & 0x0f) + 1,
    day: ((raw >>> 14) & 0x3f) + 1,
    weekday: (raw >>> 11) & 0x07,
    hour: (raw >>> 6) & 0x1f,
    minute: raw & 0x3f,
  };
}

export function readPackedTime(reader: PacketReader): PackedTime {
  return parsePackedTime(reader.uint32LE());
}
