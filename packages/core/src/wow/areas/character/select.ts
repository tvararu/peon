import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export type CharAppearance = {
  gender: number;
  skin: number;
  face: number;
  hairStyle: number;
  hairColor: number;
  facialHair: number;
};
export type RosterRow = {
  guid: bigint;
  name: string;
  race: number;
  classId: number;
  level: number;
  zone: number;
  map: number;
  guildId: number;
  gender: number;
  skin: number;
  face: number;
  hairStyle: number;
  hairColor: number;
  facialHair: number;
  flags: number;
  customizeFlags: number;
  firstLogin: boolean;
};

export const DELETE_RESULTS: Readonly<Record<number, string>> = {
  70: "in_progress",
  71: "success",
  72: "failed",
  73: "locked_for_transfer",
  74: "guild_leader",
  75: "arena_captain",
};

const NAME_RESULTS: Readonly<Record<number, string>> = {
  0: "success",
  48: "error",
  50: "name_in_use",
  87: "name_success",
  88: "name_failure",
  89: "no_name",
  90: "too_short",
  91: "too_long",
  92: "invalid_character",
  93: "mixed_languages",
  94: "profane",
  95: "reserved",
  96: "invalid_apostrophe",
  97: "multiple_apostrophes",
  98: "three_consecutive",
  99: "invalid_space",
  100: "consecutive_spaces",
  101: "russian_consecutive_silent",
  102: "russian_silent_at_edge",
  103: "declension_mismatch",
};

export function charResponseName(
  code: number,
  table: Readonly<Record<number, string>>,
): string {
  return table[code] ?? `code_0x${code.toString(16)}`;
}

export function parseCharDelete(r: PacketReader): {
  code: number;
  result: string;
} {
  const code = r.uint8();
  return { code, result: charResponseName(code, DELETE_RESULTS) };
}

export function parseCharNamedResult(r: PacketReader): {
  code: number;
  result: string;
  guid: bigint | undefined;
  name: string | undefined;
  rest: Uint8Array;
} {
  const code = r.uint8();
  const result = charResponseName(code, NAME_RESULTS);
  if (code !== 0)
    return {
      code,
      result,
      guid: undefined,
      name: undefined,
      rest: new Uint8Array(0),
    };
  return {
    code,
    result,
    guid: r.uint64LE(),
    name: r.cString(),
    rest: r.bytes(r.remaining),
  };
}

export function splitAppearance(
  rest: Uint8Array,
  wide: boolean,
): { appearance: CharAppearance | undefined; race: number | undefined } {
  if (rest.length < 6) return { appearance: undefined, race: undefined };
  const appearance = {
    gender: rest[0] ?? 0,
    skin: rest[1] ?? 0,
    face: rest[2] ?? 0,
    hairStyle: rest[3] ?? 0,
    hairColor: rest[4] ?? 0,
    facialHair: rest[5] ?? 0,
  };
  return {
    appearance,
    race: wide && rest.length >= 7 ? (rest[6] ?? 0) : undefined,
  };
}

export function buildCharDelete(guid: bigint): Uint8Array {
  const w = new PacketWriter(8);
  w.uint64LE(guid);
  return w.finish();
}

export function buildCharRename(guid: bigint, name: string): Uint8Array {
  const w = new PacketWriter(8 + name.length + 1);
  w.uint64LE(guid);
  w.cString(name);
  return w.finish();
}

export function buildCharCustomize(
  guid: bigint,
  name: string,
  appearance: CharAppearance,
): Uint8Array {
  const w = new PacketWriter(8 + name.length + 7);
  w.uint64LE(guid);
  w.cString(name);
  w.uint8(appearance.gender);
  w.uint8(appearance.skin);
  w.uint8(appearance.hairColor);
  w.uint8(appearance.hairStyle);
  w.uint8(appearance.facialHair);
  w.uint8(appearance.face);
  return w.finish();
}

export function buildCharFactionChange(
  guid: bigint,
  name: string,
  race: number,
  appearance: CharAppearance,
): Uint8Array {
  const w = new PacketWriter(8 + name.length + 8);
  w.uint64LE(guid);
  w.cString(name);
  w.uint8(appearance.gender);
  w.uint8(appearance.skin);
  w.uint8(appearance.hairColor);
  w.uint8(appearance.hairStyle);
  w.uint8(appearance.facialHair);
  w.uint8(appearance.face);
  w.uint8(race);
  return w.finish();
}

export function parseRosterRow(r: PacketReader): RosterRow {
  const low = r.uint32LE();
  const high = r.uint32LE();
  const name = r.cString();
  const race = r.uint8();
  const classId = r.uint8();
  const gender = r.uint8();
  const skin = r.uint8();
  const face = r.uint8();
  const hairStyle = r.uint8();
  const hairColor = r.uint8();
  const facialHair = r.uint8();
  const level = r.uint8();
  const zone = r.uint32LE();
  const map = r.uint32LE();
  r.skip(12);
  const guildId = r.uint32LE();
  const flags = r.uint32LE();
  const customizeFlags = r.uint32LE();
  const firstLogin = r.uint8();
  return {
    guid: (BigInt(high) << 32n) | BigInt(low),
    name,
    race,
    classId,
    level,
    zone,
    map,
    guildId,
    gender,
    skin,
    face,
    hairStyle,
    hairColor,
    facialHair,
    flags,
    customizeFlags,
    firstLogin: firstLogin !== 0,
  };
}

export function buildWhoisName(name: string): Uint8Array {
  const w = new PacketWriter(name.length + 1);
  w.cString(name);
  return w.finish();
}
