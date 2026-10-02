import { deflateSync, inflateSync } from "node:zlib";

export const ACCOUNT_DATA_MAX_BYTES = 0xff_ff;

export type PackedAccountData = { size: number; bytes: Uint8Array };

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function inflateAccountData(bytes: Uint8Array, size: number): string {
  if (size === 0) return "";
  const inflated = inflateSync(bytes);
  if (inflated.length !== size) {
    throw new Error(
      `Account data size mismatch: expected ${size}, got ${inflated.length}`,
    );
  }
  return decoder.decode(inflated);
}

export function deflateAccountData(text: string): PackedAccountData {
  if (text.includes("\0")) throw new Error("Account data text holds a NUL");
  const raw = encoder.encode(text);
  if (raw.byteLength > ACCOUNT_DATA_MAX_BYTES) {
    throw new Error(
      `Account data is ${raw.byteLength} bytes; the server drops over 0xFFFF`,
    );
  }
  if (raw.byteLength === 0) return { size: 0, bytes: new Uint8Array() };
  return { size: raw.byteLength, bytes: new Uint8Array(deflateSync(raw)) };
}
