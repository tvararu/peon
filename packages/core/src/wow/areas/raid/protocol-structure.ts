import { PacketWriter } from "#wow/protocol/packet";

export const PARTY_ASSIGN_MAIN_TANK = 0;
export const PARTY_ASSIGN_MAIN_ASSIST = 1;

export function buildGroupRaidConvert(): Uint8Array {
  return new Uint8Array(0);
}

export function buildGroupChangeSubGroup(
  name: string,
  group: number,
): Uint8Array {
  const w = new PacketWriter();
  w.cString(name);
  w.uint8(group);
  return w.finish();
}

export function buildGroupSwapSubGroup(
  name: string,
  withName: string,
): Uint8Array {
  const w = new PacketWriter();
  w.cString(name);
  w.cString(withName);
  return w.finish();
}

export function buildGroupAssistantLeader(
  guid: bigint,
  on: boolean,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  w.uint8(on ? 1 : 0);
  return w.finish();
}

export function buildPartyAssignment(
  role: number,
  on: boolean,
  guid: bigint,
): Uint8Array {
  const w = new PacketWriter();
  w.uint8(role);
  w.uint8(on ? 1 : 0);
  w.uint64LE(guid);
  return w.finish();
}

export function buildGroupUninviteGuid(
  guid: bigint,
  reason: string,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  w.cString(reason);
  return w.finish();
}
