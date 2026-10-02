import { type PacketReader, PacketWriter } from "#wow/protocol/packet";
import {
  parseCastFailed as castFailed,
  parseSpellStart as spellStart,
} from "#wow/protocol/spell";

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

export type CustomAnim = { guid: bigint; anim: number };

export function parseCustomAnim(r: PacketReader): CustomAnim {
  const guid = r.uint64LE();
  const anim = r.uint32LE();
  return { guid, anim };
}

export type DespawnAnim = { guid: bigint };

export function parseDespawnAnim(r: PacketReader): DespawnAnim {
  const guid = r.uint64LE();
  return { guid };
}
export type SpellStart = { caster: bigint; spellId: number };

export function parseSpellStart(r: PacketReader): SpellStart {
  const { caster, spellId } = spellStart(r);
  return { caster, spellId };
}

export type CastFailed = { spellId: number };

export function parseCastFailed(r: PacketReader): CastFailed {
  const { spellId } = castFailed(r);
  return { spellId };
}

export const FISHING_SPELL = 7620;
export const FISHING_FAIL_WATER = 0x3c;
export const DESPAWN_ANIM_MAX_ENTRIES = 256;
