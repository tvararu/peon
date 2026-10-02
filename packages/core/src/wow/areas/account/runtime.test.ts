import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  accountUpdateAccountDataBodyWire,
  accountUpdateAccountDataCompleteBody,
} from "#test-support/areas/account";
import { loginAccountDataTimesBody } from "#test-support/areas/login";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import { GameOpcode } from "#wow/protocol/opcodes";

describe("account runtime", () => {
  test("readyForAccountDataTimes sends empty 0x4FF and resolves with the 0x15 mask, skipping the 0xEA one", async () => {
    const rig = areaRig("account");
    try {
      const pending = rig.handle.act.readyForAccountDataTimes();
      expect(rig.sent).toEqual([
        {
          opcode: GameOpcode.CMSG_READY_FOR_ACCOUNT_DATA_TIMES,
          body: new Uint8Array(),
        },
      ]);
      rig.inject(
        GameOpcode.SMSG_ACCOUNT_DATA_TIMES,
        loginAccountDataTimesBody({
          mask: 0xea,
          serverTime: 1,
          times: [1, 2, 3, 4, 5],
        }),
      );
      rig.inject(
        GameOpcode.SMSG_ACCOUNT_DATA_TIMES,
        loginAccountDataTimesBody({
          mask: 0x15,
          serverTime: 2,
          times: [3, 4, 5],
        }),
      );
      expect(await pending).toBe(0x15);
    } finally {
      rig.dispose();
    }
  });

  test("readyForAccountDataTimes rejects timeout after 5 s with only the login packet", async () => {
    await withFakeTimers(async () => {
      const rig = areaRig("account");
      try {
        const pending = rig.handle.act.readyForAccountDataTimes();
        const assertion = pending.then(
          () => "resolved",
          (error: Error) => error.message,
        );
        rig.inject(
          GameOpcode.SMSG_ACCOUNT_DATA_TIMES,
          loginAccountDataTimesBody({
            mask: 0xea,
            serverTime: 1,
            times: [1, 2, 3, 4, 5],
          }),
        );
        await elapse(5100);
        expect(await assertion).toBe("timeout");
      } finally {
        rig.dispose();
      }
    });
  });

  test("accountData sends 0x20A with the type and resolves with the text of the matching 0x20C", async () => {
    const rig = areaRig("account");
    try {
      const pending = rig.handle.act.accountData(7);
      rig.inject(
        GameOpcode.SMSG_UPDATE_ACCOUNT_DATA,
        accountUpdateAccountDataBodyWire({
          guid: 0n,
          text: "other",
          time: 1,
          type: 0,
        }),
      );
      rig.inject(
        GameOpcode.SMSG_UPDATE_ACCOUNT_DATA,
        accountUpdateAccountDataBodyWire({
          guid: 0n,
          text: "peon",
          time: 100,
          type: 7,
        }),
      );
      expect(await pending).toBe("peon");
      const last = rig.sent.at(-1);
      expect(last?.opcode).toBe(GameOpcode.CMSG_REQUEST_ACCOUNT_DATA);
    } finally {
      rig.dispose();
    }
  });

  test("accountData rejects timeout after 5 s with no 0x20C", async () => {
    await withFakeTimers(async () => {
      const rig = areaRig("account");
      try {
        const pending = rig.handle.act.accountData(7);
        const assertion = pending.then(
          () => "resolved",
          (error: Error) => error.message,
        );
        await elapse(5100);
        expect(await assertion).toBe("timeout");
      } finally {
        rig.dispose();
      }
    });
  });

  test("saveAccountData and eraseAccountData send 0x20B and resolve on the matching 0x463", async () => {
    const rig = areaRig("account");
    try {
      const saving = rig.handle.act.saveAccountData(7, 100, "peon");
      rig.inject(
        GameOpcode.SMSG_UPDATE_ACCOUNT_DATA_COMPLETE,
        accountUpdateAccountDataCompleteBody({ type: 0 }),
      );
      rig.inject(
        GameOpcode.SMSG_UPDATE_ACCOUNT_DATA_COMPLETE,
        accountUpdateAccountDataCompleteBody({ type: 7 }),
      );
      await saving;
      const erasing = rig.handle.act.eraseAccountData(7);
      rig.inject(
        GameOpcode.SMSG_UPDATE_ACCOUNT_DATA_COMPLETE,
        accountUpdateAccountDataCompleteBody({ type: 7 }),
      );
      await erasing;
      const saved = rig.sent.filter(
        (packet) => packet.opcode === GameOpcode.CMSG_UPDATE_ACCOUNT_DATA,
      );
      expect(saved).toHaveLength(2);
    } finally {
      rig.dispose();
    }
  });

  test("saveAccountData rejects timeout after 5 s with no 0x463", async () => {
    await withFakeTimers(async () => {
      const rig = areaRig("account");
      try {
        const pending = rig.handle.act.saveAccountData(7, 100, "peon");
        const assertion = pending.then(
          () => "resolved",
          (error: Error) => error.message,
        );
        await elapse(5100);
        expect(await assertion).toBe("timeout");
      } finally {
        rig.dispose();
      }
    });
  });

  test("a validation failure leaves no subscribed waiter behind", async () => {
    const rig = areaRig("account");
    try {
      await expect(
        rig.handle.act.saveAccountData(7, 1, "a\0b"),
      ).rejects.toThrow("NUL");
      await expect(
        rig.handle.act.saveAccountData(7, 1, "x".repeat(0x1_00_00)),
      ).rejects.toThrow("0xFFFF");
      await expect(rig.handle.act.accountData(8)).rejects.toThrow("0-7");
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });
});
