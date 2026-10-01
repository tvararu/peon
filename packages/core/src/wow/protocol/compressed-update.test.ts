import { describe, expect, test } from "bun:test";
import { deflateSync } from "node:zlib";
import { inflateCompressedUpdate } from "#wow/protocol/compressed-update";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";

describe("inflateCompressedUpdate", () => {
  test("round trip", () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const compressed = deflateSync(payload);
    const w = new PacketWriter();
    w.uint32LE(payload.byteLength);
    w.rawBytes(new Uint8Array(compressed));
    const out = inflateCompressedUpdate(new PacketReader(w.finish()));
    expect(out.bytes(out.remaining)).toEqual(payload);
  });

  test("size mismatch throws", () => {
    const payload = new Uint8Array([1, 2, 3]);
    const compressed = deflateSync(payload);
    const w = new PacketWriter();
    w.uint32LE(payload.byteLength + 1);
    w.rawBytes(new Uint8Array(compressed));
    expect(() => inflateCompressedUpdate(new PacketReader(w.finish()))).toThrow(
      "size mismatch",
    );
  });
});
