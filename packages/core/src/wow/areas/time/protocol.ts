import { type PackedTime, readPackedTime } from "#wow/protocol/packed-time";
import type { PacketReader } from "#wow/protocol/packet";

export type LoginSetTimeSpeed = { gameTime: PackedTime; speed: number };
export type TimeQueryResponse = { serverTime: number; dailyResetInSec: number };
export type UiTimerUpdate = { gameTime: number };

export function parseLoginSetTimeSpeed(r: PacketReader): LoginSetTimeSpeed {
  const gameTime = readPackedTime(r);
  const speed = r.floatLE();
  r.uint32LE();
  return { gameTime, speed };
}

export function parseTimeQueryResponse(r: PacketReader): TimeQueryResponse {
  const serverTime = r.uint32LE();
  const dailyResetInSec = r.uint32LE();
  return { serverTime, dailyResetInSec };
}

export function parseUiTimerUpdate(r: PacketReader): UiTimerUpdate {
  return { gameTime: r.uint32LE() };
}
