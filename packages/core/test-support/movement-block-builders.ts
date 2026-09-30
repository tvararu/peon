import { UpdateFlag } from "#wow/protocol/entity-fields";
import { PacketWriter } from "#wow/protocol/packet";

export function buildLivingBlock(
  opts: {
    updateFlags?: number;
    movementFlags?: number;
    movementFlagsExtra?: number;
    x?: number;
    y?: number;
    z?: number;
    orientation?: number;
    walkSpeed?: number;
    runSpeed?: number;
    runBackSpeed?: number;
  } = {},
): PacketWriter {
  const w = new PacketWriter();
  w.uint16LE(opts.updateFlags ?? UpdateFlag.LIVING);
  w.uint32LE(opts.movementFlags ?? 0);
  w.uint16LE(opts.movementFlagsExtra ?? 0);
  w.uint32LE(0);
  w.floatLE(opts.x ?? 0);
  w.floatLE(opts.y ?? 0);
  w.floatLE(opts.z ?? 0);
  w.floatLE(opts.orientation ?? 0);
  w.floatLE(0);
  const speeds = [
    opts.walkSpeed ?? 0,
    opts.runSpeed ?? 0,
    opts.runBackSpeed ?? 0,
    0,
    0,
    0,
    0,
    Math.PI,
    0,
  ];
  for (const s of speeds) w.floatLE(s);
  return w;
}
