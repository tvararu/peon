import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export type CharterOffer = {
  index: number;
  entry: number;
  displayId: number;
  cost: number;
  unknown: number;
  required: number;
};

export type Showlist = { npc: bigint; entries: CharterOffer[] };

export function parseShowlist(r: PacketReader): Showlist {
  const npc = r.uint64LE();
  const count = r.uint8();
  const entries: CharterOffer[] = [];
  for (let i = 0; i < count; i++) {
    const index = r.uint32LE();
    const entry = r.uint32LE();
    const displayId = r.uint32LE();
    const cost = r.uint32LE();
    const unknown = r.uint32LE();
    const required = r.uint32LE();
    entries.push({ cost, displayId, entry, index, required, unknown });
  }
  return { entries, npc };
}

export function buildShowlist(npc: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(npc);
  return w.finish();
}

function zeros(w: PacketWriter, count: number): void {
  for (let i = 0; i < count; i++) w.uint32LE(0);
}

function emptyNames(w: PacketWriter, count: number): void {
  for (let i = 0; i < count; i++) w.cString("");
}

export function buildPetitionBuy(
  npc: bigint,
  index: number,
  name: string,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(npc);
  w.uint32LE(0);
  w.uint64LE(0n);
  w.cString(name);
  w.cString("");
  zeros(w, 7);
  w.uint16LE(0);
  zeros(w, 3);
  emptyNames(w, 10);
  w.uint32LE(index);
  w.uint32LE(0);
  return w.finish();
}

export function buildPetitionQuery(id: number, item: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(id);
  w.uint64LE(item);
  return w.finish();
}

export function buildShowSignatures(item: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(item);
  return w.finish();
}

export function buildPetitionRename(item: bigint, name: string): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(item);
  w.cString(name);
  return w.finish();
}

export type QueryResponse = {
  id: number;
  owner: bigint;
  name: string;
  minSigns: number;
  maxSigns: number;
  kind: "guild" | "arena";
};

export function parseQueryResponse(r: PacketReader): QueryResponse {
  const id = r.uint32LE();
  const owner = r.uint64LE();
  const name = r.cString();
  r.uint8();
  const first = r.uint32LE();
  const second = r.uint32LE();
  r.uint32LE();
  for (let i = 0; i < 4; i++) r.uint32LE();
  r.uint16LE();
  for (let i = 0; i < 3; i++) r.uint32LE();
  for (let i = 0; i < 10; i++) r.uint8();
  r.uint32LE();
  const arena = r.uint32LE() !== 0;

  return { id, kind: arena ? "arena" : "guild", maxSigns: second, minSigns: first, name, owner };
}

export type PetitionSignatures = {
  item: bigint;
  owner: bigint;
  petition: number;
  signers: bigint[];
};

export function parseSignatures(r: PacketReader): PetitionSignatures {
  const item = r.uint64LE();
  const owner = r.uint64LE();
  const petition = r.uint32LE();
  const count = r.uint8();
  const signers: bigint[] = [];
  for (let i = 0; i < count; i++) {
    signers.push(r.uint64LE());
    r.uint32LE();
  }
  return { item, owner, petition, signers };
}

export type PetitionRename = { item: bigint; name: string };

export function parseRename(r: PacketReader): PetitionRename {
  const item = r.uint64LE();
  const name = r.cString();
  return { item, name };
}
