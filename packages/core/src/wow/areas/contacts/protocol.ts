import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export type ContactListRequest = { flags: number };
export type SetContactNote = { guid: bigint; note: string };
export type ChatIgnored = { guid: bigint };
export type IgnoredNotice = { guid: bigint; name: string };

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
