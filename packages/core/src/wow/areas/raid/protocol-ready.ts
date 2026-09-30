import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export type ReadyCheckStart = { initiator: bigint };
export type ReadyCheckConfirm = { guid: bigint; ready: boolean };

export function parseReadyCheckStart(r: PacketReader): ReadyCheckStart {
  return { initiator: r.uint64LE() };
}

export function parseReadyCheckConfirm(r: PacketReader): ReadyCheckConfirm {
  const guid = r.uint64LE();
  return { guid, ready: r.uint8() !== 0 };
}

export function buildReadyCheckStart(): Uint8Array {
  return new Uint8Array(0);
}

export function buildReadyCheckAnswer(ready: boolean): Uint8Array {
  const w = new PacketWriter();
  w.uint8(ready ? 1 : 0);
  return w.finish();
}

export function buildReadyCheckFinished(): Uint8Array {
  return new Uint8Array(0);
}
