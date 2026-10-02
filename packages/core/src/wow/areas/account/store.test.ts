import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  accountUpdateAccountDataBodyWire,
  accountUpdateAccountDataCompleteBody,
} from "#test-support/areas/account";
import { GameOpcode } from "#wow/protocol/opcodes";

describe("account store", () => {
  test("0x20C stores time and text per type and emits account_data", () => {
    const rig = areaRig("account");
    try {
      const seen: unknown[] = [];
      rig.handle.onEvent((event) => seen.push(event));
      rig.inject(
        GameOpcode.SMSG_UPDATE_ACCOUNT_DATA,
        accountUpdateAccountDataBodyWire({
          guid: 0n,
          text: "peon",
          time: 100,
          type: 7,
        }),
      );
      rig.inject(
        GameOpcode.SMSG_UPDATE_ACCOUNT_DATA,
        accountUpdateAccountDataBodyWire({
          guid: 0n,
          text: "ui",
          time: 200,
          type: 0,
        }),
      );
      const state = rig.handle.state();
      expect(state.data).toEqual([
        { text: "peon", time: 100, type: 7 },
        { text: "ui", time: 200, type: 0 },
      ]);
      expect(seen).toEqual([
        { bytes: 4, dataType: 7, time: 100, type: "account_data" },
        { bytes: 2, dataType: 0, time: 200, type: "account_data" },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a second 0x20C for the same type replaces the entry", () => {
    const rig = areaRig("account");
    try {
      rig.inject(
        GameOpcode.SMSG_UPDATE_ACCOUNT_DATA,
        accountUpdateAccountDataBodyWire({
          guid: 0n,
          text: "old",
          time: 1,
          type: 7,
        }),
      );
      rig.inject(
        GameOpcode.SMSG_UPDATE_ACCOUNT_DATA,
        accountUpdateAccountDataBodyWire({
          guid: 0n,
          text: "new",
          time: 2,
          type: 7,
        }),
      );
      expect(rig.handle.state().data).toEqual([
        { text: "new", time: 2, type: 7 },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("0x463 emits account_data_saved and records the saved type", () => {
    const rig = areaRig("account");
    try {
      const seen: unknown[] = [];
      rig.handle.onEvent((event) => seen.push(event));
      rig.inject(
        GameOpcode.SMSG_UPDATE_ACCOUNT_DATA_COMPLETE,
        accountUpdateAccountDataCompleteBody({ type: 7 }),
      );
      expect(seen).toEqual([{ dataType: 7, type: "account_data_saved" }]);
      expect(rig.handle.state().lastSaved).toBe(7);
    } finally {
      rig.dispose();
    }
  });
});
