import type { PacketWriter } from "#wow/protocol/packet";

export type SpellTarget =
  | { kind: "none" }
  | { kind: "unit"; guid: bigint }
  | { kind: "object"; guid: bigint }
  | { kind: "item"; guid: bigint }
  | { kind: "dest"; x: number; y: number; z: number };

const TARGET_FLAG_UNIT = 0x00_00_00_02;
const TARGET_FLAG_ITEM = 0x00_00_00_10;
const TARGET_FLAG_DEST_LOCATION = 0x00_00_00_40;
const TARGET_FLAG_GAMEOBJECT = 0x00_00_08_00;

function maskOf(target: SpellTarget): number {
  switch (target.kind) {
    case "none":
      return 0;
    case "unit":
      return TARGET_FLAG_UNIT;
    case "object":
      return TARGET_FLAG_GAMEOBJECT;
    case "item":
      return TARGET_FLAG_ITEM;
    default:
      return TARGET_FLAG_DEST_LOCATION;
  }
}

export function writeSpellTargets(w: PacketWriter, target: SpellTarget): void {
  w.uint32LE(maskOf(target));
  switch (target.kind) {
    case "none":
      return;
    case "unit":
    case "object":
    case "item":
      w.packedGuidBig(target.guid);
      return;
    default:
      if (target.kind !== "dest") return;
      w.uint8(0);
      w.floatLE(target.x);
      w.floatLE(target.y);
      w.floatLE(target.z);
  }
}
