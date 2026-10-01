import { type AreaRegister, defineArea } from "#wow/areas/contract";
import { TRANSPORTS_OPCODES } from "#wow/areas/transports/opcodes";
import {
  readGameObjectTemplate,
  templateFromQueryBody,
} from "#wow/areas/transports/protocol";
import { transportsRuntime } from "#wow/areas/transports/runtime";
import { TransportsStore } from "#wow/areas/transports/store";
import { inflateCompressedUpdate } from "#wow/protocol/compressed-update";
import { ObjectType, UpdateFlag } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { PacketReader } from "#wow/protocol/packet";
import { GAMEOBJECT_FIELDS, OBJECT_FIELDS } from "#wow/protocol/update-fields";
import { parseUpdateObject } from "#wow/protocol/update-object";

const bits = new DataView(new ArrayBuffer(4));

function asFloat(raw: number | undefined): number | undefined {
  if (raw === undefined) return undefined;
  bits.setUint32(0, raw, true);
  return bits.getFloat32(0, true);
}

function pathRotationOf(fields: ReadonlyMap<number, number>): number {
  const z = asFloat(fields.get(GAMEOBJECT_FIELDS.PARENTROTATION.offset + 2));
  const w = asFloat(fields.get(GAMEOBJECT_FIELDS.PARENTROTATION.offset + 3));
  if (z === undefined || w === undefined) return 0;
  return (z >= 0 ? 1 : -1) * 2 * Math.acos(Math.min(1, Math.max(-1, w)));
}

function observeCreates(store: TransportsStore, r: PacketReader): void {
  for (const entry of parseUpdateObject(r, 0)) {
    if (entry.type === "outOfRange") {
      for (const guid of entry.guids) store.receiveDestroyed(guid);
      continue;
    }
    if (entry.type !== "create" || entry.objectType !== ObjectType.GAMEOBJECT)
      continue;
    const position = entry.position;
    if (!position) continue;
    store.receiveCreated({
      entry: entry.fields.get(OBJECT_FIELDS.ENTRY.offset) ?? 0,
      guid: entry.guid,
      mapId: position.mapId,
      pathProgress: entry.pathProgress,
      pathRotation: pathRotationOf(entry.fields),
      pose: {
        x: position.x,
        y: position.y,
        z: position.z,
        orientation: position.orientation,
      },
    });
    void UpdateFlag.TRANSPORT;
  }
}

export const transportsArea = defineArea({
  eventTypes: ["transport_seen", "transport_gone"],
  name: "transports",
  opcodes: TRANSPORTS_OPCODES,
  register: (wire: AreaRegister, store: TransportsStore) => {
    wire.peek(GameOpcode.SMSG_UPDATE_OBJECT, (r) => observeCreates(store, r));
    wire.peek(GameOpcode.SMSG_COMPRESSED_UPDATE_OBJECT, (r) =>
      observeCreates(store, inflateCompressedUpdate(r)),
    );
    wire.peek(GameOpcode.SMSG_DESTROY_OBJECT, (r) =>
      store.receiveDestroyed(r.uint64LE()),
    );
    wire.peek(GameOpcode.SMSG_GAMEOBJECT_QUERY_RESPONSE, (r) => {
      const row = readGameObjectTemplate(templateFromQueryBody(r));
      if (row) store.receiveTemplate(row);
    });
  },
  runtime: transportsRuntime,
  store: (deps) => new TransportsStore(deps),
});
