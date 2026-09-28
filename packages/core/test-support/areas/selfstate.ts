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

export function selfstateMoveFeatherFallBody(
  init: MoveCounterBody,
): Uint8Array {
  return moveCounterBody(init);
}

export function selfstateMoveNormalFallBody(init: MoveCounterBody): Uint8Array {
  return moveCounterBody(init);
}

export function selfstateMoveGravityDisableBody(
  init: MoveCounterBody,
): Uint8Array {
  return moveCounterBody(init);
}

export function selfstateMoveGravityEnableBody(
  init: MoveCounterBody,
): Uint8Array {
  return moveCounterBody(init);
}

export type MultipleMovesEntry = MoveCounterBody & {
  opcode: number;
  extra?: readonly number[];
};

export function selfstateMultipleMovesBody(
  entries: readonly MultipleMovesEntry[],
): Uint8Array {
  const inner = new PacketWriter();
  for (const { opcode, guid, counter, extra = [] } of entries) {
    const entry = new PacketWriter();
    entry.uint16LE(opcode);
    entry.packedGuidBig(guid);
    entry.uint32LE(counter);
    for (const byte of extra) entry.uint8(byte);
    const bytes = entry.finish();
    inner.uint8(bytes.length);
    inner.rawBytes(bytes);
  }
  const body = inner.finish();
  const w = new PacketWriter();
  w.uint32LE(body.length);
  w.rawBytes(body);
  return w.finish();
}
