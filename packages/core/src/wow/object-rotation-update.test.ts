import { describe, expect, test } from "bun:test";
import {
  type MotionFixture,
  motionFixture,
} from "#test-support/remote-motion-fixtures";
import {
  writePackedGuid,
  writeUpdateMask,
} from "#test-support/world-handlers-fixtures";
import type { GameObjectEntity } from "#wow/entity-store";
import {
  ObjectType,
  UpdateFlag,
  UpdateType,
} from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketWriter } from "#wow/protocol/packet";

const SHRINE = 0xf110_0000_0000_0771n;
const SPAWN_ROTATION = 514_395_574_543_411_482n;
const TURNED_ROTATION = 0n;

type Block = { position: boolean; rotation: bigint };

type UpdateKind = (typeof UpdateType)[keyof typeof UpdateType];

function shrineOf(handle: MotionFixture["handle"]): GameObjectEntity {
  const shrine = handle.getEntity(SHRINE);
  if (shrine?.objectType !== ObjectType.GAMEOBJECT)
    throw new Error("shrine missing");
  return shrine as GameObjectEntity;
}

function writeBlock(w: PacketWriter, { position, rotation }: Block): void {
  w.uint16LE((position ? UpdateFlag.HAS_POSITION : 0) | UpdateFlag.ROTATION);
  if (position) for (const value of [5, 6, 7, 0]) w.floatLE(value);
  w.uint64LE(rotation);
}

function shrineUpdate(type: UpdateKind, block: Block): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(1);
  w.uint8(type);
  writePackedGuid(w, SHRINE);
  if (type === UpdateType.CREATE_OBJECT2) w.uint8(ObjectType.GAMEOBJECT);
  writeBlock(w, block);
  if (type === UpdateType.CREATE_OBJECT2) writeUpdateMask(w, new Map());
  return w.finish();
}

async function withFixture(run: (f: MotionFixture) => Promise<void>) {
  const f = await motionFixture();
  try {
    await f.inject(
      GameOpcode.SMSG_UPDATE_OBJECT,
      shrineUpdate(UpdateType.CREATE_OBJECT2, {
        position: true,
        rotation: SPAWN_ROTATION,
      }),
    );
    await run(f);
  } finally {
    await f.close();
  }
}

describe("game object rotation from update blocks", () => {
  test("a create block stores the spawn rotation", async () => {
    await withFixture(async (f) => {
      expect(shrineOf(f.handle).rotation?.z).toBeCloseTo(-0.9118, 3);
    });
  });

  test("a movement block with a position replaces the rotation", async () => {
    await withFixture(async (f) => {
      await f.inject(
        GameOpcode.SMSG_UPDATE_OBJECT,
        shrineUpdate(UpdateType.MOVEMENT, {
          position: true,
          rotation: TURNED_ROTATION,
        }),
      );
      expect(shrineOf(f.handle).rotation).toMatchObject({
        w: 1,
        x: 0,
        y: 0,
        z: 0,
      });
    });
  });

  test("a rotation-only movement block replaces the rotation and keeps the position", async () => {
    await withFixture(async (f) => {
      await f.inject(
        GameOpcode.SMSG_UPDATE_OBJECT,
        shrineUpdate(UpdateType.MOVEMENT, {
          position: false,
          rotation: TURNED_ROTATION,
        }),
      );
      expect(shrineOf(f.handle).rotation).toMatchObject({
        w: 1,
        x: 0,
        y: 0,
        z: 0,
      });
      expect(shrineOf(f.handle).position).toMatchObject({ x: 5, y: 6, z: 7 });
    });
  });
});
