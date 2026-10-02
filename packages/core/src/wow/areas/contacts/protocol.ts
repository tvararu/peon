import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export type ContactListRequest = { flags: number };
export type SetContactNote = { guid: bigint; note: string };
export type ChatIgnored = { guid: bigint };

export const CONTACT_NOTE_BYTES = 48;

export function truncateNote(note: string): string {
  const bytes = new TextEncoder().encode(note);
  if (bytes.length <= CONTACT_NOTE_BYTES) return note;
  let end = CONTACT_NOTE_BYTES;
  while (end > 0) {
    const prev = bytes[end - 1] ?? 0;
    if (prev < 0x80) break;
    if (prev >= 0xc0) {
      end -= 1;
      break;
    }
    end -= 1;
  }
  return new TextDecoder().decode(bytes.subarray(0, end));
}

export function buildContactListRequest(flags: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(flags);
  return w.finish();
}

export function parseContactListRequest(r: PacketReader): ContactListRequest {
  return { flags: r.uint32LE() };
}

export function buildSetContactNote(guid: bigint, note: string): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  w.cString(note);
  return w.finish();
}

export function parseSetContactNote(r: PacketReader): SetContactNote {
  const guid = r.uint64LE();
  const note = r.cString();
  return { guid, note };
}

export function buildChatIgnored(guid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  w.uint8(0);
  return w.finish();
}

export function parseChatIgnored(r: PacketReader): ChatIgnored {
  const guid = r.uint64LE();
  r.uint8();
  return { guid };
}
