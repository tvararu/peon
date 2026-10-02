import {
  ACCOUNT_DATA_MAX_BYTES,
  deflateAccountData,
} from "#wow/protocol/account-data-zlib";
import { PacketWriter } from "#wow/protocol/packet";

export const ACCOUNT_DATA_TYPES = 8;

export function accountRequestAccountDataBody(type: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(type);
  return w.finish();
}

export function accountUpdateAccountDataBody(init: {
  type: number;
  time: number;
  text: string;
}): Uint8Array {
  const packed = deflateAccountData(init.text);
  if (packed.size > ACCOUNT_DATA_MAX_BYTES)
    throw new Error(
      `Account data is ${packed.size} bytes; the server drops over 0xFFFF`,
    );
  const w = new PacketWriter();
  w.uint32LE(init.type);
  w.uint32LE(init.time);
  w.uint32LE(packed.size);
  if (packed.size > 0) w.rawBytes(packed.bytes);
  return w.finish();
}

export function accountUpdateAccountDataBodyWire(init: {
  guid: bigint;
  type: number;
  time: number;
  text: string;
}): Uint8Array {
  const packed = deflateAccountData(init.text);
  const w = new PacketWriter();
  w.uint64LE(init.guid);
  w.uint32LE(init.type);
  w.uint32LE(init.time);
  w.uint32LE(packed.size);
  if (packed.size > 0) w.rawBytes(packed.bytes);
  else w.rawBytes(new Uint8Array(13));
  return w.finish();
}

export function accountUpdateAccountDataCompleteBody(init: {
  type: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.type);
  w.uint32LE(0);
  return w.finish();
}
