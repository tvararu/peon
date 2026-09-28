import { PacketWriter } from "#wow/protocol/packet";

const END = 0xff_ff_ff_ff;

export type DoneInit = { id: number; packedTime: number };
export type CriteriaInit = {
  id: number;
  counter: bigint;
  guid: bigint;
  flags?: number;
  packedTime: number;
  elapsed?: number;
  sinceStart?: number;
};

function writeCriteria(w: PacketWriter, init: CriteriaInit): void {
  w.uint32LE(init.id);
  w.packedGuidBig(init.counter);
  w.packedGuidBig(init.guid);
  w.uint32LE(init.flags ?? 0);
  w.uint32LE(init.packedTime);
  w.uint32LE(init.elapsed ?? 0);
  w.uint32LE(init.sinceStart ?? init.elapsed ?? 0);
}

export function achievementsAllAchievementDataBody(init: {
  done: readonly DoneInit[];
  criteria: readonly CriteriaInit[];
}): Uint8Array {
  const w = new PacketWriter();
  for (const entry of init.done) {
    w.uint32LE(entry.id);
    w.uint32LE(entry.packedTime);
  }
  w.uint32LE(END);
  for (const entry of init.criteria) writeCriteria(w, entry);
  w.uint32LE(END);
  return w.finish();
}

export function achievementsCriteriaUpdateBody(init: CriteriaInit): Uint8Array {
  const w = new PacketWriter();
  writeCriteria(w, init);
  return w.finish();
}

export function achievementsAchievementEarnedBody(init: {
  guid: bigint;
  id: number;
  packedTime: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(init.guid);
  w.uint32LE(init.id);
  w.uint32LE(init.packedTime);
  w.uint32LE(0);
  return w.finish();
}

export function achievementsServerFirstAchievementBody(init: {
  name: string;
  guid: bigint;
  id: number;
  link: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.cString(init.name);
  w.uint64LE(init.guid);
  w.uint32LE(init.id);
  w.uint32LE(init.link);
  return w.finish();
}

export function achievementsCriteriaDeletedBody(id: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(id);
  return w.finish();
}

export function achievementsAchievementDeletedBody(id: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(id);
  return w.finish();
}
