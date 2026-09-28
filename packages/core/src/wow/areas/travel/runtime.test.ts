import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  travelBindPointUpdateBody,
  travelPlayerBoundBody,
} from "#test-support/areas/travel";
import { buildBinderActivate } from "#wow/areas/travel/protocol";
import { registerTrainerHandlers } from "#wow/gameplay-handlers";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketWriter } from "#wow/protocol/packet";
import type { WorldConn } from "#wow/world-conn";

const INNKEEPER = 0xf1_30_00_3e_4a_00_12_34n;
const TRAINER = 0xf1_30_00_3d_c1_00_00_77n;
const BIND_SPELL = 3286;
const HOME = { mapId: 530, x: 9500, y: -6800, z: 20, areaId: 3487 };

function binds(sent: readonly { opcode: number }[]) {
  return sent.filter((p) => p.opcode === GameOpcode.CMSG_BINDER_ACTIVATE);
}

function buySucceeded(guid: bigint, spellId: number): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(guid);
  w.uint32LE(spellId);
  return w.finish();
}

describe("travel runtime: bindActivate", () => {
  test("sends CMSG_BINDER_ACTIVATE with the npc guid and settles ok on the new bind point", async () => {
    const rig = areaRig("travel");
    try {
      const pending = rig.handle.act.bindActivate(INNKEEPER);
      expect(rig.sent).toEqual([
        {
          opcode: GameOpcode.CMSG_BINDER_ACTIVATE,
          body: buildBinderActivate(INNKEEPER),
        },
      ]);
      rig.inject(
        GameOpcode.SMSG_BINDPOINTUPDATE,
        travelBindPointUpdateBody(HOME),
      );
      rig.inject(
        GameOpcode.SMSG_PLAYERBOUND,
        travelPlayerBoundBody({ binder: INNKEEPER, areaId: HOME.areaId }),
      );
      expect(await pending).toEqual({ status: "ok", home: HOME });
      expect(rig.handle.state()).toMatchObject({
        home: HOME,
        bindPending: undefined,
        lastBound: { binder: INNKEEPER, areaId: HOME.areaId },
      });
    } finally {
      rig.dispose();
    }
  });

  test("settles no_answer after 5 s of silence and clears the pending bind (NPCHandler.cpp:298-307,317-319)", async () => {
    jest.useFakeTimers();
    const rig = areaRig("travel");
    try {
      const pending = rig.handle.act.bindActivate(INNKEEPER);
      jest.advanceTimersByTime(4999);
      expect(rig.handle.state().bindPending).toBe(INNKEEPER);
      jest.advanceTimersByTime(1);
      expect(await pending).toEqual({ status: "no_answer" });
      expect(rig.handle.state().bindPending).toBeUndefined();
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("a second bind while one is pending refuses busy and sends nothing", async () => {
    const rig = areaRig("travel");
    try {
      const first = rig.handle.act.bindActivate(INNKEEPER);
      expect(await rig.handle.act.bindActivate(INNKEEPER)).toEqual({
        status: "refused",
        reason: "busy",
      });
      expect(binds(rig.sent)).toHaveLength(1);
      rig.inject(
        GameOpcode.SMSG_BINDPOINTUPDATE,
        travelBindPointUpdateBody(HOME),
      );
      expect(await first).toMatchObject({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("dispose rejects a pending bind with the abort reason", async () => {
    const rig = areaRig("travel");
    const pending = rig.handle.act.bindActivate(INNKEEPER);
    rig.dispose();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  test("the bind's SMSG_TRAINER_BUY_SUCCEEDED for spell 3286 is no purchase for a pending train (NPCHandler.cpp:321-331, trainer-store.ts:106-112)", () => {
    const rig = areaRig("travel", {
      register: (dispatch, stores) =>
        registerTrainerHandlers({ dispatch } as unknown as WorldConn, stores),
    });
    try {
      rig.stores.trainer.begin({
        action: "train",
        guid: TRAINER,
        spellId: 133,
        cost: 100,
        coinageBefore: 1000,
        learnedBefore: [],
        succeeded: false,
        requestedAt: 0,
      });
      rig.inject(
        GameOpcode.SMSG_TRAINER_BUY_SUCCEEDED,
        buySucceeded(INNKEEPER, BIND_SPELL),
      );
      expect(rig.stores.trainer.pending).toMatchObject({ succeeded: false });
      expect(rig.stores.trainer.snapshot().lastOutcome).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });
});
