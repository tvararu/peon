import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export type AreaTriggerMessage = { text: string };

export function buildAreaTrigger(triggerId: number): Uint8Array {
  const w = new PacketWriter(4);
  w.uint32LE(triggerId);
  return w.finish();
}

export function parseAreaTriggerMessage(r: PacketReader): AreaTriggerMessage {
  r.uint32LE();
  const text = r.cString();
  return { text };
}

export function buildGameObjUse(guid: bigint): Uint8Array {
  const w = new PacketWriter(8);
  w.uint64LE(guid);
  return w.finish();
}

export function buildGameObjReportUse(guid: bigint): Uint8Array {
  const w = new PacketWriter(8);
  w.uint64LE(guid);
  return w.finish();
}

export type PageTextReply = {
  pageId: number;
  text: string;
  nextPageId: number;
};

export type GameObjectPageText = { guid: bigint };

export function buildPageTextQuery(pageId: number, guid: bigint): Uint8Array {
  const w = new PacketWriter(12);
  w.uint32LE(pageId);
  w.uint64LE(guid);
  return w.finish();
}

export function parsePageText(r: PacketReader): PageTextReply {
  const pageId = r.uint32LE();
  const text = r.cString();
  const nextPageId = r.uint32LE();
  return { pageId, text, nextPageId };
}

export function parseGameObjectPageText(r: PacketReader): GameObjectPageText {
  const guid = r.uint64LE();
  return { guid };
}
