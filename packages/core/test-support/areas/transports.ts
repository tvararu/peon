import { dbcFiles, packDbc } from "#test-support/dbc";
import {
  writePackedGuid,
  writeUpdateMask,
} from "#test-support/world-handlers-fixtures";
import type { DbcSource } from "#wow/dbc";
import {
  ObjectType,
  UpdateFlag,
  UpdateType,
} from "#wow/protocol/entity-fields";
import { PacketWriter } from "#wow/protocol/packet";
import { GAMEOBJECT_FIELDS, OBJECT_FIELDS } from "#wow/protocol/update-fields";

export const MO_TRANSPORT_HIGH = 0x1f_c0n;
export const LIFT_HIGH = 0xf1_20n;

export function transportsGuid(high: bigint, low: number): bigint {
  return (high << 48n) | BigInt(low);
}

export function floatBits(value: number): number {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, true);
  return view.getUint32(0, true);
}

export type TransportsTaxiNode = {
  path: number;
  index: number;
  mapId: number;
  x: number;
  y: number;
  z: number;
  actionFlag?: number;
  delay?: number;
};

export function transportsTaxiPathNodeDbc(
  nodes: readonly TransportsTaxiNode[],
): Uint8Array {
  return packDbc(
    11,
    nodes.map((n, row) => [
      row + 1,
      n.path,
      n.index,
      n.mapId,
      floatBits(n.x),
      floatBits(n.y),
      floatBits(n.z),
      n.actionFlag ?? 0,
      n.delay ?? 0,
      0,
      0,
    ]),
  );
}

export type TransportsAnimationNode = {
  entry: number;
  timeSeg: number;
  x: number;
  y: number;
  z: number;
};

export function transportsAnimationDbc(
  nodes: readonly TransportsAnimationNode[],
): Uint8Array {
  return packDbc(
    7,
    nodes.map((n, row) => [
      row + 1,
      n.entry,
      n.timeSeg,
      floatBits(n.x),
      floatBits(n.y),
      floatBits(n.z),
      0,
    ]),
  );
}

export type TransportsRotationNode = {
  entry: number;
  timeSeg: number;
  x: number;
  y: number;
  z: number;
  w: number;
};

export function transportsRotationDbc(
  nodes: readonly TransportsRotationNode[],
): Uint8Array {
  return packDbc(
    7,
    nodes.map((n, row) => [
      row + 1,
      n.entry,
      n.timeSeg,
      floatBits(n.x),
      floatBits(n.y),
      floatBits(n.z),
      floatBits(n.w),
    ]),
  );
}

export function transportsDbc(init: {
  nodes?: readonly TransportsTaxiNode[];
  animations?: readonly TransportsAnimationNode[];
  rotations?: readonly TransportsRotationNode[];
}): DbcSource {
  return dbcFiles(
    new Map([
      ["TaxiPathNode.dbc", transportsTaxiPathNodeDbc(init.nodes ?? [])],
      ["TransportAnimation.dbc", transportsAnimationDbc(init.animations ?? [])],
      ["TransportRotation.dbc", transportsRotationDbc(init.rotations ?? [])],
    ]),
  );
}

export const TRANSPORTS_STRAIGHT_PATH = 7;
export const TRANSPORTS_STRAIGHT_ENTRY = 190_549;

export const TRANSPORTS_STRAIGHT_NODES: readonly TransportsTaxiNode[] = [
  { index: 0, mapId: 1, path: 7, x: 0, y: 0, z: 0 },
  { actionFlag: 2, delay: 5, index: 1, mapId: 1, path: 7, x: 100, y: 0, z: 0 },
  { index: 2, mapId: 1, path: 7, x: 200, y: 0, z: 0 },
  { actionFlag: 2, delay: 5, index: 3, mapId: 1, path: 7, x: 300, y: 0, z: 0 },
  { index: 4, mapId: 1, path: 7, x: 400, y: 0, z: 0 },
];

export type TransportsTemplateInit = {
  entry: number;
  type: number;
  data?: Readonly<Record<number, number>>;
};

export function transportsGameObjectQueryBody(
  init: TransportsTemplateInit,
): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.entry);
  w.uint32LE(init.type);
  w.uint32LE(0);
  w.cString("Transport");
  for (let i = 0; i < 3; i++) w.uint8(0);
  w.cString("");
  w.cString("");
  w.cString("");
  for (let i = 0; i < 24; i++) w.uint32LE(init.data?.[i] ?? 0);
  w.floatLE(1);
  for (let i = 0; i < 6; i++) w.uint32LE(0);
  return w.finish();
}

export function transportsMissingQueryBody(entry: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE((entry | 0x80_00_00_00) >>> 0);
  return w.finish();
}

export type TransportsCreateInit = {
  guid: bigint;
  entry: number;
  pathProgress: number;
  pose: { x: number; y: number; z: number; orientation: number };
  parentRotationZ?: number;
  parentRotationW?: number;
  state?: number;
};

export function transportsCreateBody(init: TransportsCreateInit): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(1);
  w.uint8(UpdateType.CREATE_OBJECT);
  writePackedGuid(w, init.guid);
  w.uint8(ObjectType.GAMEOBJECT);
  w.uint16LE(
    UpdateFlag.TRANSPORT |
      UpdateFlag.HIGH_GUID |
      UpdateFlag.HAS_POSITION |
      UpdateFlag.ROTATION,
  );
  w.floatLE(init.pose.x);
  w.floatLE(init.pose.y);
  w.floatLE(init.pose.z);
  w.floatLE(init.pose.orientation);
  w.uint32LE(Number(init.guid & 0xff_ff_ff_ffn));
  w.uint32LE(init.pathProgress);
  w.uint64LE(0n);
  const fields = new Map<number, number>([
    [OBJECT_FIELDS.ENTRY.offset, init.entry],
  ]);
  if (init.parentRotationZ !== undefined)
    fields.set(
      GAMEOBJECT_FIELDS.PARENTROTATION.offset + 2,
      floatBits(init.parentRotationZ),
    );
  if (init.parentRotationW !== undefined)
    fields.set(
      GAMEOBJECT_FIELDS.PARENTROTATION.offset + 3,
      floatBits(init.parentRotationW),
    );
  if (init.state !== undefined)
    fields.set(GAMEOBJECT_FIELDS.BYTES_1.offset, init.state);
  writeUpdateMask(w, fields);
  return w.finish();
}

export function transportsStateBody(guid: bigint, state: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(1);
  w.uint8(UpdateType.VALUES);
  writePackedGuid(w, guid);
  writeUpdateMask(w, new Map([[GAMEOBJECT_FIELDS.BYTES_1.offset, state]]));
  return w.finish();
}

export function transportsDestroyBody(guid: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  return w.finish();
}

export function transportsOutOfRangeBody(guids: readonly bigint[]): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(1);
  w.uint8(UpdateType.OUT_OF_RANGE);
  w.uint32LE(guids.length);
  for (const guid of guids) writePackedGuid(w, guid);
  return w.finish();
}
