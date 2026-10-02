import {
  ACCOUNT_DATA_MAX_BYTES,
  deflateAccountData,
  inflateAccountData,
} from "#wow/protocol/account-data-zlib";
import type { PacketReader } from "#wow/protocol/packet";

export const ACCOUNT_DATA_TYPES = 8;
export const GLOBAL_ACCOUNT_DATA_MASK = 0x15;

export type UpdateAccountData = {
  guid: bigint;
  type: number;
  time: number;
  text: string;
};
export type UpdateAccountDataComplete = { type: number };

export function parseUpdateAccountData(r: PacketReader): UpdateAccountData {
  const guid = r.uint64LE();
  const type = r.uint32LE();
  const time = r.uint32LE();
  const size = r.uint32LE();
  if (size === 0) return { guid, text: "", time, type };
  const text = inflateAccountData(r.bytes(r.remaining), size);
  return { guid, text, time, type };
}

export function parseUpdateAccountDataComplete(
  r: PacketReader,
): UpdateAccountDataComplete {
  const type = r.uint32LE();
  r.uint32LE();
  return { type };
}

export function parseAccountDataTimesMask(r: PacketReader): number {
  r.uint32LE();
  r.uint8();
  return r.uint32LE();
}

export function buildRequestAccountData(type: number): Uint8Array {
  if (!Number.isInteger(type) || type < 0 || type >= ACCOUNT_DATA_TYPES)
    throw new Error(`Account data type is 0-7, not ${type}`);
  const body = new Uint8Array(4);
  new DataView(body.buffer).setUint32(0, type, true);
  return body;
}

export function buildUpdateAccountData(init: {
  type: number;
  time: number;
  text: string;
}): Uint8Array {
  const packed = deflateAccountData(init.text);
  if (packed.size > ACCOUNT_DATA_MAX_BYTES)
    throw new Error(
      `Account data is ${packed.size} bytes; the server drops over 0xFFFF`,
    );
  const body = new Uint8Array(12 + packed.bytes.byteLength);
  const view = new DataView(body.buffer);
  view.setUint32(0, init.type, true);
  view.setUint32(4, init.time, true);
  view.setUint32(8, packed.size, true);
  body.set(packed.bytes, 12);
  return body;
}

export const TUTORIAL_BIT_MAX = 255;

export function buildTutorialFlag(bit: number): Uint8Array {
  if (!Number.isInteger(bit) || bit < 0 || bit > TUTORIAL_BIT_MAX)
    throw new Error(`Tutorial bit is 0-255, not ${bit}`);
  const body = new Uint8Array(4);
  new DataView(body.buffer).setUint32(0, bit, true);
  return body;
}
