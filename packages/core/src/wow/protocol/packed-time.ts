import type { PacketReader, PacketWriter } from "#wow/protocol/packet";

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

export function packPackedTime(time: PackedTime): number {
  if (
    time.year < 2000 ||
    time.year > 2031 ||
    time.month < 1 ||
    time.month > 12 ||
    time.day < 1 ||
    time.day > 31 ||
    time.weekday < 0 ||
    time.weekday > 6 ||
    time.hour < 0 ||
    time.hour > 23 ||
    time.minute < 0 ||
    time.minute > 59
  )
    throw new RangeError("packed time field out of range");
  return (
    (((time.year - 2000) << 24) |
      ((time.month - 1) << 20) |
      ((time.day - 1) << 14) |
      (time.weekday << 11) |
      (time.hour << 6) |
      time.minute) >>>
    0
  );
}

export function readPackedTime(reader: PacketReader): PackedTime {
  return parsePackedTime(reader.uint32LE());
}

export function writePackedTime(writer: PacketWriter, time: PackedTime): void {
  writer.uint32LE(packPackedTime(time));
}
