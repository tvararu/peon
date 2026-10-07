import { PacketWriter } from "#wow/protocol/packet";

export function arenaQueryBody(): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(7);
  w.cString("Faceless");
  w.uint32LE(2);
  w.uint32LE(0xff_ff_ff_ff);
  w.uint32LE(3);
  w.uint32LE(0x00_11_22_33);
  w.uint32LE(5);
  w.uint32LE(0x44_55_66_77);
  return w.finish();
}

export function arenaStatsBody(): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(7);
  w.uint32LE(1500);
  w.uint32LE(10);
  w.uint32LE(6);
  w.uint32LE(40);
  w.uint32LE(25);
  w.uint32LE(1234);
  return w.finish();
}

export function arenaRosterBody(extra: boolean): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(7);
  w.uint8(extra ? 1 : 0);
  w.uint32LE(1);
  w.uint32LE(2);
  w.uint64LE(0x0b_00n);
  w.uint8(1);
  w.cString("Facone");
  w.uint32LE(0);
  w.uint8(80);
  w.uint8(7);
  w.uint32LE(10);
  w.uint32LE(6);
  w.uint32LE(40);
  w.uint32LE(25);
  w.uint32LE(1490);
  if (extra) {
    w.floatLE(0);
    w.floatLE(0);
  }
  return w.finish();
}

export function arenaEventBody(
  event: number,
  strings: string[],
  guid?: bigint,
): Uint8Array {
  const w = new PacketWriter();
  w.uint8(event);
  w.uint8(strings.length);
  for (const text of strings) w.cString(text);
  if (guid !== undefined) w.uint64LE(guid);
  return w.finish();
}

export function arenaResultBody(
  action: number,
  team: string,
  player: string,
  error: number,
): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(action);
  w.cString(team);
  w.cString(player);
  w.uint32LE(error);
  return w.finish();
}

export function arenaQueuedBody(): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(0);
  w.uint8(2);
  w.uint8(0x0e);
  w.uint32LE(1);
  w.uint16LE(0x1f_90);
  w.uint8(71);
  w.uint8(80);
  w.uint32LE(0);
  w.uint8(0);
  w.uint32LE(1);
  w.uint32LE(0);
  w.uint32LE(0);
  return w.finish();
}
