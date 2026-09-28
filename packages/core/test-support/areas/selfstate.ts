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
