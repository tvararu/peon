import { type PacketReader, PacketWriter } from "#wow/protocol/packet";

export type PlayedTime = {
  totalSeconds: number;
  levelSeconds: number;
  trigger: boolean;
};

export type SheathState = "unarmed" | "melee" | "ranged";

export const SHEATH_VALUES: Readonly<Record<SheathState, number>> = {
  melee: 1,
  ranged: 2,
  unarmed: 0,
};

export const SHEATH_NAMES: Readonly<Record<number, SheathState>> = {
  0: "unarmed",
  1: "melee",
  2: "ranged",
};

export type BarberResultName = "ok" | "not_enough_money" | "not_seated";

const BARBER_RESULTS: Readonly<Record<number, BarberResultName>> = {
  0: "ok",
  1: "not_enough_money",
  2: "not_seated",
  3: "not_enough_money",
};

export type BarberResult = { code: number; result: string };

export type BarberStyle = {
  hair: number;
  color: number;
  facialHair: number;
  skinColor: number;
};

export function buildPlayedTime(trigger: boolean): Uint8Array {
  const w = new PacketWriter(1);
  w.uint8(trigger ? 1 : 0);
  return w.finish();
}

export function parsePlayedTime(r: PacketReader): PlayedTime {
  return {
    totalSeconds: r.uint32LE(),
    levelSeconds: r.uint32LE(),
    trigger: r.uint8() !== 0,
  };
}

export function buildSetSheathed(state: SheathState): Uint8Array {
  const w = new PacketWriter(4);
  w.uint32LE(SHEATH_VALUES[state]);
  return w.finish();
}

export function buildShowing(show: boolean): Uint8Array {
  const w = new PacketWriter(1);
  w.uint8(show ? 1 : 0);
  return w.finish();
}

export function buildAlterAppearance(style: BarberStyle): Uint8Array {
  const w = new PacketWriter(16);
  w.uint32LE(style.hair);
  w.uint32LE(style.color);
  w.uint32LE(style.facialHair);
  w.uint32LE(style.skinColor);
  return w.finish();
}

export function parseBarberShopResult(r: PacketReader): BarberResult {
  const code = r.uint32LE();
  return { code, result: BARBER_RESULTS[code] ?? `code_${code}` };
}

export type DeclinedNameResult = { code: number; guid: bigint };

export type RealmSplit = { echo: number; state: number; date: string };

export type PlayTimeWarning = { flag: number; remainingSeconds: number };

export function buildDeclinedNames(
  guid: bigint,
  name: string,
  declined: readonly string[],
): Uint8Array {
  const w = new PacketWriter(
    8 + name.length + 1 + declined.join("").length + 5,
  );
  w.uint64LE(guid);
  w.cString(name);
  for (const form of declined) w.cString(form);
  return w.finish();
}

export function parseDeclinedNameResult(r: PacketReader): DeclinedNameResult {
  const code = r.uint32LE();
  return { code, guid: r.uint64LE() };
}

export function parsePlayTimeWarning(r: PacketReader): PlayTimeWarning {
  return { flag: r.uint32LE(), remainingSeconds: r.int32LE() };
}

export function buildWhois(name: string): Uint8Array {
  const w = new PacketWriter(name.length + 1);
  w.cString(name);
  return w.finish();
}

export function parseWhois(r: PacketReader): string {
  return r.cString();
}

export function buildRealmSplit(realm: number): Uint8Array {
  const w = new PacketWriter(4);
  w.uint32LE(realm);
  return w.finish();
}

export function parseRealmSplit(r: PacketReader): RealmSplit {
  return { echo: r.uint32LE(), state: r.uint32LE(), date: r.cString() };
}
