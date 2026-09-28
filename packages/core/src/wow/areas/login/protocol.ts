import type { PacketReader } from "#wow/protocol/packet";

const ADDON_STATE = 2;
const ADDON_CRCPUB = 1;
const ADDON_KEY_BYTES = 256;
const BANNED_ADDON_BYTES = 44;
const BANNED_ADDON_TAIL = 40;
const TUTORIAL_VALUES = 8;
const ACCOUNT_DATA_TYPES = 8;

export type AddonEntry = { state: number; keyed: boolean };
export type AddonInfo = {
  addons: readonly AddonEntry[];
  banned: readonly { id: number }[];
};
export type ClientCacheVersion = { version: number };
export type TutorialFlags = { flags: readonly number[] };
export type AccountDataTimes = {
  serverTime: number;
  mask: number;
  times: readonly (readonly [type: number, time: number])[];
};
export type FeatureSystemStatus = { complaints: number; voice: number };
export type LearnedDanceMoves = { moves: readonly [number, number] };
export type Pong = { seq: number };
export type CharacterLoginFailed = { code: number; reason: string };

const LOGIN_FAILURE_REASONS = [
  "failed",
  "no_world",
  "duplicate_character",
  "no_instances",
  "disabled",
  "no_character",
  "locked_for_transfer",
  "locked_by_billing",
  "using_remote",
] as const;

function startsEntry(r: PacketReader): boolean {
  if (r.remaining < 2) return false;
  const peek = r.fork();
  return peek.uint8() === ADDON_STATE && peek.uint8() === ADDON_CRCPUB;
}

function readAddonEntry(r: PacketReader): AddonEntry {
  const state = r.uint8();
  const crcpub = r.uint8();
  let keyed = false;
  if (crcpub) {
    keyed = r.uint8() !== 0;
    if (keyed) r.skip(ADDON_KEY_BYTES);
    r.uint32LE();
  }
  if (r.uint8()) r.cString();
  return { state, keyed };
}

export function parseAddonInfo(r: PacketReader): AddonInfo {
  const addons: AddonEntry[] = [];
  while (startsEntry(r)) addons.push(readAddonEntry(r));
  const count = r.uint32LE();
  if (r.remaining !== count * BANNED_ADDON_BYTES)
    throw new RangeError(
      `addon info: ${r.remaining} bytes left for ${count} banned addons`,
    );
  const banned = Array.from({ length: count }, () => {
    const id = r.uint32LE();
    r.skip(BANNED_ADDON_TAIL);
    return { id };
  });
  return { addons, banned };
}

export function parseClientCacheVersion(r: PacketReader): ClientCacheVersion {
  const version = r.uint32LE();
  return { version };
}

export function parseTutorialFlags(r: PacketReader): TutorialFlags {
  const flags = Array.from({ length: TUTORIAL_VALUES }, () => r.uint32LE());
  return { flags };
}

export function parseAccountDataTimes(r: PacketReader): AccountDataTimes {
  const serverTime = r.uint32LE();
  r.uint8();
  const mask = r.uint32LE();
  const times: (readonly [number, number])[] = [];
  for (let type = 0; type < ACCOUNT_DATA_TYPES; type++)
    if (mask & (1 << type)) times.push([type, r.uint32LE()]);
  return { serverTime, mask, times };
}

export function parseFeatureSystemStatus(r: PacketReader): FeatureSystemStatus {
  const complaints = r.uint8();
  const voice = r.uint8();
  return { complaints, voice };
}

export function parseLearnedDanceMoves(r: PacketReader): LearnedDanceMoves {
  const first = r.uint32LE();
  const second = r.uint32LE();
  return { moves: [first, second] };
}

export function parsePong(r: PacketReader): Pong {
  return { seq: r.uint32LE() };
}

export function buildKeepAlive(): Uint8Array {
  return new Uint8Array(0);
}

export function parseCharacterLoginFailed(
  r: PacketReader,
): CharacterLoginFailed {
  const code = r.uint8();
  return { code, reason: LOGIN_FAILURE_REASONS[code] ?? "unknown" };
}

export function buildPlayerLogout(): Uint8Array {
  return new Uint8Array(0);
}

export function buildLogoutCancel(): Uint8Array {
  return new Uint8Array(0);
}
