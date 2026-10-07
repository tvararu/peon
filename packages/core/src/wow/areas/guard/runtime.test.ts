import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  guardNotificationBody,
  guardReadyBody,
  readWorldTeleport,
} from "#test-support/areas/guard";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import { GameOpcode } from "#wow/protocol/opcodes";

const TARGET = { map: 530, x: 1, y: 2, z: 3, orientation: 0.25 };

describe("worldTeleport", () => {
  test("sends 0x008 with the target and resolves denied on a notification", async () => {
    await withFakeTimers(async () => {
      const rig = areaRig("guard", { now: () => 1234 });
      try {
        const pending = rig.handle.act.worldTeleport(TARGET);
        expect(rig.sent.map((p) => p.opcode)).toEqual([
          GameOpcode.CMSG_WORLD_TELEPORT,
        ]);
        expect(
          readWorldTeleport(rig.sent[0]?.body ?? new Uint8Array()),
        ).toMatchObject({ time: 1234, map: 530, x: 1, y: 2, z: 3 });
        rig.inject(
          GameOpcode.SMSG_NOTIFICATION,
          guardNotificationBody("denied"),
        );
        expect(await pending).toBe("denied");
        expect(jest.getTimerCount()).toBe(0);
      } finally {
        rig.dispose();
      }
    });
  });

  test("resolves sent after 3 s with no notice and leaves no timer", async () => {
    await withFakeTimers(async () => {
      const rig = areaRig("guard");
      try {
        const pending = rig.handle.act.worldTeleport(TARGET);
        await elapse(3000);
        expect(await pending).toBe("sent");
        expect(jest.getTimerCount()).toBe(0);
      } finally {
        rig.dispose();
      }
    });
  });

  test("an abort rejects the wait", async () => {
    await withFakeTimers(async () => {
      const rig = areaRig("guard");
      try {
        const controller = new AbortController();
        const pending = rig.handle.act
          .worldTeleport(TARGET, controller.signal)
          .then(
            () => "resolved",
            (error: unknown) =>
              error instanceof Error ? error.name : String(error),
          );
        controller.abort();
        await Promise.resolve();
        expect(await pending).toBe("AbortError");
        expect(jest.getTimerCount()).toBe(0);
      } finally {
        rig.dispose();
      }
    });
  });
});

describe("requestFactionStates", () => {
  test("sends one empty 0x126", () => {
    const rig = areaRig("guard");
    try {
      rig.handle.act.requestFactionStates();
      expect(rig.sent).toEqual([
        { opcode: GameOpcode.CMSG_SET_FACTION_CHEAT, body: new Uint8Array() },
      ]);
    } finally {
      rig.dispose();
    }
  });
});

describe("prepareForRedirect", () => {
  test("sends 0x51f and resolves ignored after 3 s", async () => {
    await withFakeTimers(async () => {
      const rig = areaRig("guard");
      try {
        const pending = rig.handle.act.prepareForRedirect();
        expect(rig.sent.map((p) => p.opcode)).toEqual([
          GameOpcode.TC9_CMSG_PREPARE_FOR_REDIRECT,
        ]);
        await elapse(3000);
        expect(await pending).toBe("ignored");
      } finally {
        rig.dispose();
      }
    });
  });

  test("resolves with ok on an injected 0x520", async () => {
    await withFakeTimers(async () => {
      const rig = areaRig("guard");
      try {
        const pending = rig.handle.act.prepareForRedirect();
        rig.inject(GameOpcode.TC9_SMSG_READY_FOR_REDIRECT, guardReadyBody(1));
        expect(await pending).toEqual({ ok: false });
      } finally {
        rig.dispose();
      }
    });
  });
});
