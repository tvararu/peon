import { inflateSync } from "node:zlib";
import { PacketReader } from "#wow/protocol/packet";

export function inflateCompressedUpdate(r: PacketReader): PacketReader {
  const uncompressedSize = r.uint32LE();
  const compressed = r.bytes(r.remaining);
  const decompressed = inflateSync(compressed);
  if (decompressed.length !== uncompressedSize) {
    throw new Error(
      `Compressed update size mismatch: expected ${uncompressedSize}, got ${decompressed.length}`,
    );
  }
  return new PacketReader(new Uint8Array(decompressed));
}
