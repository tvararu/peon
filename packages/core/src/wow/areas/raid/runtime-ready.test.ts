import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  raidGroupListBody,
  raidReadyCheckBody,
  raidReadyConfirmBody,
} from "#test-support/areas/raid";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import type { AreaRuntimeCtx } from "#wow/areas/contract";
import { composeReadyRuntime } from "#wow/areas/raid/runtime-ready";
import { RaidAreaStore } from "#wow/areas/raid/store";
import type { RaidEvent } from "#wow/areas/raid/store-roster";
import { GameOpcode } from "#wow/protocol/opcodes";

const PEON = 0x30n;
const TOM = 0x10n;
const ANN = 0x20n;

function rigAsMember() {
  return areaRig("raid", { selfGuid: PEON });
}

function groupedAsLeader() {
  const rig = rigAsMember();
  rig.inject(
    GameOpcode.SMSG_GROUP_LIST,
    raidGroupListBody({
      counter: 1,
      leader: PEON,
      members: [
        { guid: PEON, name: "Peon" },
        { guid: ANN, name: "Ann" },
        { guid: TOM, name: "Tom" },
      ],
      type: 0,
    }),
  );
  return rig;
}

function openSelfCheck(rig: ReturnType<typeof groupedAsLeader>) {
  rig.inject(GameOpcode.MSG_RAID_READY_CHECK, raidReadyCheckBody(PEON));
}

describe("ready check acts", () => {
  test("each act sends one packet", () => {
    const rig = rigAsMember();
    try {
      rig.inject(GameOpcode.MSG_RAID_READY_CHECK, raidReadyCheckBody(TOM));
      rig.handle.act.startReadyCheck();
      rig.handle.act.answerReadyCheck(true);
      rig.handle.act.answerReadyCheck(false);
      rig.handle.act.finishReadyCheck();
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.MSG_RAID_READY_CHECK,
        GameOpcode.MSG_RAID_READY_CHECK,
        GameOpcode.MSG_RAID_READY_CHECK,
        GameOpcode.MSG_RAID_READY_CHECK_FINISHED,
      ]);
      expect([...(rig.sent[1]?.body ?? [])]).toEqual([1]);
      expect([...(rig.sent[2]?.body ?? [])]).toEqual([0]);
      expect(rig.sent[0]?.body.length).toBe(0);
      expect(rig.sent[3]?.body.length).toBe(0);
    } finally {
      rig.dispose();
    }
  });

  test("self start sends no finish of its own", () => {
    const rig = rigAsMember();
    try {
      rig.handle.act.startReadyCheck();
      expect(rig.sent).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });

  test("answering records our own answer", () => {
    const rig = groupedAsLeader();
    try {
      openSelfCheck(rig);
      rig.handle.act.answerReadyCheck(false);
      expect(rig.handle.state().readyCheck?.ownAnswer).toBe("not_ready");
    } finally {
      rig.dispose();
    }
  });
});

describe("ready check finish timer", () => {
  test("the finish goes out once every online member answered", async () => {
    await withFakeTimers(async () => {
      const rig = groupedAsLeader();
      try {
        openSelfCheck(rig);
        rig.handle.act.answerReadyCheck(true);
        rig.inject(
          GameOpcode.MSG_RAID_READY_CHECK_CONFIRM,
          raidReadyConfirmBody(ANN, 1),
        );
        rig.inject(
          GameOpcode.MSG_RAID_READY_CHECK_CONFIRM,
          raidReadyConfirmBody(TOM, 1),
        );
        await elapse(1000);
        expect(
          rig.sent.filter(
            (packet) =>
              packet.opcode === GameOpcode.MSG_RAID_READY_CHECK_FINISHED,
          ),
        ).toHaveLength(1);
        await elapse(30_000);
        expect(
          rig.sent.filter(
            (packet) =>
              packet.opcode === GameOpcode.MSG_RAID_READY_CHECK_FINISHED,
          ),
        ).toHaveLength(1);
      } finally {
        rig.dispose();
      }
    });
  });

  test("the timer sends the finish after 30 s without all answers", async () => {
    await withFakeTimers(async () => {
      const rig = groupedAsLeader();
      try {
        openSelfCheck(rig);
        await elapse(29_000);
        expect(
          rig.sent.some(
            (packet) =>
              packet.opcode === GameOpcode.MSG_RAID_READY_CHECK_FINISHED,
          ),
        ).toBe(false);
        await elapse(1000);
        const finished = rig.sent.filter(
          (packet) =>
            packet.opcode === GameOpcode.MSG_RAID_READY_CHECK_FINISHED,
        );
        expect(finished).toHaveLength(1);
      } finally {
        rig.dispose();
      }
    });
  });

  test("a check we did not start runs no timer", async () => {
    await withFakeTimers(async () => {
      const rig = groupedAsLeader();
      try {
        rig.inject(GameOpcode.MSG_RAID_READY_CHECK, raidReadyCheckBody(TOM));
        await elapse(31_000);
        expect(
          rig.sent.some(
            (packet) =>
              packet.opcode === GameOpcode.MSG_RAID_READY_CHECK_FINISHED,
          ),
        ).toBe(false);
      } finally {
        rig.dispose();
      }
    });
  });

  test("a server finish first cancels the timer", async () => {
    await withFakeTimers(async () => {
      const rig = groupedAsLeader();
      try {
        openSelfCheck(rig);
        rig.inject(GameOpcode.MSG_RAID_READY_CHECK_FINISHED, new Uint8Array(0));
        await elapse(31_000);
        expect(
          rig.sent.some(
            (packet) =>
              packet.opcode === GameOpcode.MSG_RAID_READY_CHECK_FINISHED,
          ),
        ).toBe(false);
      } finally {
        rig.dispose();
      }
    });
  });
});

describe("ready check self guid", () => {
  test("a guid fixed after composition still arms the timer", async () => {
    await withFakeTimers(async () => {
      const holder = { self: 0n };
      const sent: number[] = [];
      const store = new RaidAreaStore(() => 0);
      const ctx = {
        selfGuid: () => holder.self,
        send: (opcode: number) => {
          sent.push(opcode);
        },
      } as unknown as AreaRuntimeCtx<RaidEvent>;
      const runtime = composeReadyRuntime({ ctx, store });
      try {
        holder.self = PEON;
        store.receiveReadyStart(PEON, 0);
        await elapse(29_000);
        expect(sent).toEqual([]);
        await elapse(1000);
        expect(sent).toEqual([GameOpcode.MSG_RAID_READY_CHECK_FINISHED]);
      } finally {
        runtime.dispose();
        store.dispose();
      }
    });
  });
});
