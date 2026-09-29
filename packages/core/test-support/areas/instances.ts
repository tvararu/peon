import { PacketWriter } from "#wow/protocol/packet";

function u32s(...values: number[]): Uint8Array {
  const w = new PacketWriter();
  for (const value of values) w.uint32LE(value);
  return w.finish();
}

export function instancesDifficultyBody(init: {
  difficulty: number;
  inGroup: boolean;
}): Uint8Array {
  return u32s(init.difficulty, 1, init.inGroup ? 1 : 0);
}

export function instancesInstanceDifficultyBody(init: {
  difficulty: number;
  dynamicHeroic: boolean;
}): Uint8Array {
  return u32s(init.difficulty, init.dynamicHeroic ? 1 : 0);
}

export function instancesOwnershipBody(hasBinds: boolean): Uint8Array {
  return u32s(hasBinds ? 1 : 0);
}

export function instancesLastInstanceBody(mapId: number): Uint8Array {
  return u32s(mapId);
}

export function instancesRaidInstanceMessageBody(init: {
  kind: number;
  mapId: number;
  difficulty: number;
  secondsLeft: number;
  locked?: boolean;
  extended?: boolean;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.kind);
  w.uint32LE(init.mapId);
  w.uint32LE(init.difficulty);
  w.uint32LE(init.secondsLeft);
  if (init.kind === 4) {
    w.uint8(init.locked ? 1 : 0);
    w.uint8(init.extended ? 1 : 0);
  }
  return w.finish();
}

export function instancesRaidGroupOnlyBody(init: {
  timerMs: number;
  code: number;
}): Uint8Array {
  return u32s(init.timerMs, init.code);
}

export type InstancesRaidLockInit = {
  mapId: number;
  difficulty: number;
  instanceGuid: bigint;
  extended: boolean;
  secondsToReset: number;
};

export function instancesRaidInstanceInfoBody(
  locks: readonly InstancesRaidLockInit[],
): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(locks.length);
  for (const lock of locks) {
    w.uint32LE(lock.mapId);
    w.uint32LE(lock.difficulty);
    w.uint64LE(lock.instanceGuid);
    w.uint8(1);
    w.uint8(lock.extended ? 1 : 0);
    w.uint32LE(lock.secondsToReset);
  }
  return w.finish();
}

export function instancesLockWarningBody(init: {
  timeoutMs: number;
  encounterMask: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.timeoutMs);
  w.uint32LE(init.encounterMask);
  w.uint8(0);
  return w.finish();
}

export function instancesSaveCreatedBody(): Uint8Array {
  return u32s(0);
}

export function instancesResetBody(mapId: number): Uint8Array {
  return u32s(mapId);
}

export function instancesResetFailedBody(init: {
  reason: number;
  mapId: number;
}): Uint8Array {
  return u32s(init.reason, init.mapId);
}

export function instancesResetFailedNotifyBody(mapId: number): Uint8Array {
  return u32s(mapId);
}

export type InstancesEncounterFrame =
  | { frame: 0 | 1 | 2; guid: bigint; priority: number }
  | { frame: 3 | 4 | 6; param: number }
  | { frame: 5; param: number; extra: number }
  | { frame: 7 };

export function instancesEncounterUnitBody(
  init: InstancesEncounterFrame,
): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.frame);
  switch (init.frame) {
    case 0:
    case 1:
    case 2:
      w.packedGuidBig(init.guid);
      w.uint8(init.priority);
      break;
    case 3:
    case 4:
    case 6:
      w.uint8(init.param);
      break;
    case 5:
      w.uint8(init.param);
      w.uint8(init.extra);
      break;
    case 7:
      break;
  }
  return w.finish();
}
