import { type PackedTime, readPackedTime } from "#wow/protocol/packed-time";
import type { PacketReader } from "#wow/protocol/packet";

const END = 0xff_ff_ff_ff;

export type DoneAchievement = { id: number; at: PackedTime };
export type CriteriaProgress = { id: number; counter: bigint; at: PackedTime };
export type AchievementData = {
  done: DoneAchievement[];
  criteria: CriteriaProgress[];
};

export function readCriteriaProgress(
  r: PacketReader,
  id: number,
): CriteriaProgress {
  const counter = r.packedGuidBig();
  r.packedGuidBig();
  r.uint32LE();
  const at = readPackedTime(r);
  r.uint32LE();
  r.uint32LE();
  return { id, counter, at };
}

export function parseAchievementData(r: PacketReader): AchievementData {
  const done: DoneAchievement[] = [];
  for (let id = r.uint32LE(); id !== END; id = r.uint32LE())
    done.push({ id, at: readPackedTime(r) });
  const criteria: CriteriaProgress[] = [];
  for (let id = r.uint32LE(); id !== END; id = r.uint32LE())
    criteria.push(readCriteriaProgress(r, id));
  return { done, criteria };
}
