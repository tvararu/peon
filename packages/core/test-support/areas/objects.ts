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

export type ObjectsTemplateFixture = {
  entry: number;
  type: number;
  displayId: number;
  name: string;
  iconName?: string;
  castBarCaption?: string;
  unk1?: string;
  data?: readonly number[];
  size?: number;
  questItems?: readonly number[];
};

export function objectsGameObjectQueryResponseBody(
  t: ObjectsTemplateFixture,
): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(t.entry);
  w.uint32LE(t.type);
  w.uint32LE(t.displayId);
  w.cString(t.name);
  for (let i = 0; i < 3; i++) w.uint8(0);
  w.cString(t.iconName ?? "");
  w.cString(t.castBarCaption ?? "");
  w.cString(t.unk1 ?? "");
  for (let i = 0; i < 24; i++) w.uint32LE(t.data?.[i] ?? 0);
  w.floatLE(t.size ?? 1);
  for (let i = 0; i < 6; i++) w.uint32LE(t.questItems?.[i] ?? 0);
  return w.finish();
}

export function objectsGameObjectQueryMissingBody(entry: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(entry | 0x80_00_00_00);
  return w.finish();
}
export function objectsAreaTriggerBody(triggerId: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(triggerId);
  return w.finish();
}

export function objectsGameObjUseBody(guid: bigint): Uint8Array {
  const w = new PacketWriter(8);
  w.uint64LE(guid);
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
