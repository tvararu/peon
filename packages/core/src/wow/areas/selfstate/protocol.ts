import { type MoveCounter, parseMoveCounter } from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";
import type { MoveFlag } from "#wow/self-store";

export type FlagChange = { readonly flag: MoveFlag; readonly enable: boolean };

export const FLAG_OPCODES: readonly (readonly [
  opcode: number,
  change: FlagChange,
])[] = [
  [GameOpcode.SMSG_MOVE_WATER_WALK, { flag: "water_walk", enable: true }],
  [GameOpcode.SMSG_MOVE_LAND_WALK, { flag: "water_walk", enable: false }],
  [GameOpcode.SMSG_MOVE_SET_HOVER, { flag: "hover", enable: true }],
  [GameOpcode.SMSG_MOVE_UNSET_HOVER, { flag: "hover", enable: false }],
  [GameOpcode.SMSG_MOVE_FEATHER_FALL, { flag: "feather_fall", enable: true }],
  [GameOpcode.SMSG_MOVE_NORMAL_FALL, { flag: "feather_fall", enable: false }],
  [GameOpcode.SMSG_MOVE_GRAVITY_DISABLE, { flag: "gravity_off", enable: true }],
  [GameOpcode.SMSG_MOVE_GRAVITY_ENABLE, { flag: "gravity_off", enable: false }],
];

export const FLAG_CHANGES: ReadonlyMap<number, FlagChange> = new Map(
  FLAG_OPCODES,
);

const COMPOUND_OPCODES: ReadonlySet<number> = new Set([
  GameOpcode.SMSG_FORCE_MOVE_ROOT,
  GameOpcode.SMSG_MOVE_FEATHER_FALL,
  GameOpcode.SMSG_MOVE_WATER_WALK,
  GameOpcode.SMSG_MOVE_SET_HOVER,
]);

export type CompoundMove = MoveCounter & { opcode: number };
export type MultipleMoves = { entries: CompoundMove[]; skipped: number[] };

export function parseMultipleMoves(r: PacketReader): MultipleMoves {
  const size = r.uint32LE();
  const all = new PacketReader(r.bytes(Math.min(size, r.remaining)));
  const entries: CompoundMove[] = [];
  const skipped: number[] = [];
  while (all.remaining > 0) {
    const entry = new PacketReader(all.bytes(all.uint8()));
    const opcode = entry.uint16LE();
    if (COMPOUND_OPCODES.has(opcode))
      entries.push({ opcode, ...parseMoveCounter(entry) });
    else skipped.push(opcode);
  }
  return { entries, skipped };
}

export const STAND_STATES = {
  stand: 0,
  sit: 1,
  sit_chair: 2,
  sleep: 3,
  sit_low_chair: 4,
  sit_medium_chair: 5,
  sit_high_chair: 6,
  dead: 7,
  kneel: 8,
  submerged: 9,
} as const;
export type StandStateName = keyof typeof STAND_STATES;

export const MIRROR_TIMERS = ["fatigue", "breath", "fire"] as const;
export type MirrorTimerName = (typeof MIRROR_TIMERS)[number];

export type MirrorTimerStart = {
  timer: number;
  valueMs: number;
  maxMs: number;
  scale: number;
  paused: boolean;
  spellId: number;
};

export function standStateName(value: number): StandStateName | undefined {
  return (Object.keys(STAND_STATES) as StandStateName[]).find(
    (name) => STAND_STATES[name] === value,
  );
}

export function mirrorTimerName(timer: number): MirrorTimerName | undefined {
  return MIRROR_TIMERS[timer];
}

export function parseMirrorTimer(r: PacketReader): MirrorTimerStart {
  const timer = r.uint32LE();
  const valueMs = r.uint32LE();
  const maxMs = r.uint32LE();
  const scale = r.uint32LE() | 0;
  const paused = r.uint8() !== 0;
  const spellId = r.uint32LE();
  return { timer, valueMs, maxMs, scale, paused, spellId };
}

export function parseStopMirrorTimer(r: PacketReader): number {
  return r.uint32LE();
}

export function parseStandState(r: PacketReader): number {
  return r.uint8();
}

export function parsePreResurrect(r: PacketReader): bigint {
  return r.packedGuidBig();
}

export function buildStandStateChange(state: StandStateName): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(STAND_STATES[state]);
  return w.finish();
}
