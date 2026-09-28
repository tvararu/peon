import { PacketWriter } from "#wow/protocol/packet";

const ADDON_KEY_BYTES = 256;

export function loginAddonInfoBody(init: {
  entries: readonly { usePk: boolean }[];
  banned: readonly { id: number; timestamp: number }[];
}): Uint8Array {
  const w = new PacketWriter();
  for (const entry of init.entries) {
    w.uint8(2);
    w.uint8(1);
    w.uint8(entry.usePk ? 1 : 0);
    if (entry.usePk) w.rawBytes(new Uint8Array(ADDON_KEY_BYTES).fill(0xc3));
    w.uint32LE(0);
    w.uint8(0);
  }
  w.uint32LE(init.banned.length);
  for (const addon of init.banned) {
    w.uint32LE(addon.id);
    w.rawBytes(new Uint8Array(16).fill(0xaa));
    w.rawBytes(new Uint8Array(16).fill(0xbb));
    w.uint32LE(addon.timestamp);
    w.uint32LE(1);
  }
  return w.finish();
}

export function loginClientCacheVersionBody(init: {
  version: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.version);
  return w.finish();
}

export function loginTutorialFlagsBody(init: {
  flags: readonly number[];
}): Uint8Array {
  const w = new PacketWriter();
  for (const flag of init.flags) w.uint32LE(flag);
  return w.finish();
}

export function loginAccountDataTimesBody(init: {
  serverTime: number;
  mask: number;
  times: readonly number[];
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.serverTime);
  w.uint8(1);
  w.uint32LE(init.mask);
  for (const time of init.times) w.uint32LE(time);
  return w.finish();
}

export function loginFeatureSystemStatusBody(init: {
  complaints: number;
  voice: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint8(init.complaints);
  w.uint8(init.voice);
  return w.finish();
}

export function loginLearnedDanceMovesBody(): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(0);
  w.uint32LE(0);
  return w.finish();
}

export function loginPongBody(init: { seq: number }): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.seq);
  return w.finish();
}
