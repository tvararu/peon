import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  accountUpdateAccountDataBodyWire,
  accountUpdateAccountDataCompleteBody,
} from "#test-support/areas/account";
import { loginAccountDataTimesBody } from "#test-support/areas/login";
import { GameOpcode } from "#wow/protocol/opcodes";

describe("account area wiring", () => {
  test("the account-data round trip fills the store and fires both events", async () => {
    const rig = areaRig("account");
    try {
      const seen: unknown[] = [];
      rig.handle.onEvent((event) => seen.push(event));
      const pending = rig.handle.act.readyForAccountDataTimes();
      rig.inject(
        GameOpcode.SMSG_ACCOUNT_DATA_TIMES,
        loginAccountDataTimesBody({
          mask: 0x15,
          serverTime: 2,
          times: [3, 4, 5],
        }),
      );
      expect(await pending).toBe(0x15);
      const reading = rig.handle.act.accountData(7);
      rig.inject(
        GameOpcode.SMSG_UPDATE_ACCOUNT_DATA,
        accountUpdateAccountDataBodyWire({
          guid: 0n,
          text: "peon",
          time: 100,
          type: 7,
        }),
      );
      expect(await reading).toBe("peon");
      const saving = rig.handle.act.saveAccountData(7, 100, "peon");
      rig.inject(
        GameOpcode.SMSG_UPDATE_ACCOUNT_DATA_COMPLETE,
        accountUpdateAccountDataCompleteBody({ type: 7 }),
      );
      await saving;
      expect(rig.handle.state().data).toEqual([
        { text: "peon", time: 100, type: 7 },
      ]);
      expect(rig.handle.state().lastSaved).toBe(7);
      expect(seen).toEqual([
        { bytes: 4, dataType: 7, time: 100, type: "account_data" },
        { dataType: 7, type: "account_data_saved" },
      ]);
    } finally {
      rig.dispose();
    }
  });
});
