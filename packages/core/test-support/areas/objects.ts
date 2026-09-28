import { packDbc } from "#test-support/dbc";
import type { AreaTrigger } from "#wow/areas/objects/trigger-catalog";
import { PacketWriter } from "#wow/protocol/packet";

export function objectsAreaTriggerMessageBody(
  message: string,
  line = 0,
): Uint8Array {
  const lines = message.split("\n");
  const start = lines.slice(0, line).reduce((at, l) => at + l.length + 1, 0);
  const w = new PacketWriter();
  w.uint32LE((lines[line] ?? "").length + 1);
  w.cString(message.slice(start));
  return w.finish();
}

export function objectsAreaTriggerBody(triggerId: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(triggerId);
  return w.finish();
}

const floatBits = new DataView(new ArrayBuffer(4));

function bitsOf(value: number): number {
  floatBits.setFloat32(0, value, true);
  return floatBits.getUint32(0, true);
}

export function objectsAreaTriggerDbc(
  triggers: readonly AreaTrigger[],
): Uint8Array {
  return packDbc(
    10,
    triggers.map((t) => [
      t.id,
      t.map,
      ...[
        t.x,
        t.y,
        t.z,
        t.radius,
        t.length,
        t.width,
        t.height,
        t.orientation,
      ].map(bitsOf),
    ]),
  );
}
