import type { PackedTime } from "#wow/protocol/packed-time";
import { PacketWriter } from "#wow/protocol/packet";

export function packTime(time: PackedTime): number {
  return (
    (((time.year - 2000) << 24) |
      ((time.month - 1) << 20) |
      ((time.day - 1) << 14) |
      (time.weekday << 11) |
      (time.hour << 6) |
      time.minute) >>>
    0
  );
}

export function timeLoginSetTimeSpeedBody(init: {
  gameTime: PackedTime;
  speed: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(packTime(init.gameTime));
  w.floatLE(init.speed);
  w.uint32LE(0);
  return w.finish();
}

export function timeQueryResponseBody(init: {
  serverTime: number;
  dailyResetInSec: number;
}): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.serverTime);
  w.uint32LE(init.dailyResetInSec);
  return w.finish();
}

export function timeUiTimerUpdateBody(init: { gameTime: number }): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.gameTime);
  return w.finish();
}
