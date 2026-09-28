import { PacketWriter } from "#wow/protocol/packet";

type MoveCounterBody = { guid: bigint; counter: number };

function moveCounterBody({ guid, counter }: MoveCounterBody): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(guid);
  w.uint32LE(counter);
  return w.finish();
}

export function selfstateMoveWaterWalkBody(init: MoveCounterBody): Uint8Array {
  return moveCounterBody(init);
}

export function selfstateMoveLandWalkBody(init: MoveCounterBody): Uint8Array {
  return moveCounterBody(init);
}

export function selfstateMoveSetHoverBody(init: MoveCounterBody): Uint8Array {
  return moveCounterBody(init);
}

export function selfstateMoveUnsetHoverBody(init: MoveCounterBody): Uint8Array {
  return moveCounterBody(init);
}

export type MirrorTimerBody = {
  timer: number;
  valueMs: number;
  maxMs: number;
  scale: number;
  paused: number;
  spellId: number;
};

export function selfstateStartMirrorTimerBody({
  timer,
  valueMs,
  maxMs,
  scale,
  paused,
  spellId,
}: MirrorTimerBody): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(timer);
  w.uint32LE(valueMs);
  w.uint32LE(maxMs);
  w.uint32LE(scale >>> 0);
  w.uint8(paused);
  w.uint32LE(spellId);
  return w.finish();
}

export function selfstateStopMirrorTimerBody(timer: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(timer);
  return w.finish();
}

export function selfstateStandstateUpdateBody(state: number): Uint8Array {
  const w = new PacketWriter();
  w.uint8(state);
  return w.finish();
}

export function selfstatePreResurrectBody(guid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.packedGuidBig(guid);
  return w.finish();
}
