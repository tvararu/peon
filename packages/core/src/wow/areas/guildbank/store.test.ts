import { describe, expect, test } from "bun:test";
import {
  bankListBody,
  bankLogBody,
  bankTextBody,
  GUILD_BANK_VAULT,
  guildbankRig,
  moneyWithdrawnBody,
} from "#test-support/areas/guildbank";
import { GUILD_BANK_LOG } from "#wow/areas/guildbank/protocol";
import type { GuildBankEvent } from "#wow/areas/guildbank/store";
import { GameOpcode } from "#wow/protocol/opcodes";

function openList() {
  return bankListBody({
    items: [{ count: 20, entry: 2589, slot: 4 }],
    money: 1_000_000n,
    tabs: [{ icon: "INV_Misc_Coin_01", name: "Loot" }],
    withdrawals: -1,
  });
}

describe("guildbank store", () => {
  test("SMSG_GUILD_BANK_LIST opens the vault, stores money, briefs and slots (Guild.cpp:2902-2906)", () => {
    const rig = guildbankRig();
    const seen: GuildBankEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      rig.handle.act.openVault(GUILD_BANK_VAULT).catch(() => undefined);
      rig.inject(GameOpcode.SMSG_GUILD_BANK_LIST, openList());
      const state = rig.handle.state();
      expect(state.vault).toBe(GUILD_BANK_VAULT);
      expect(state.money).toBe(1_000_000n);
      expect(state.tabs).toBe(1);
      expect(state.briefs[0]).toEqual({
        icon: "INV_Misc_Coin_01",
        name: "Loot",
      });
      expect(state.items.get(0)?.get(4)).toMatchObject({
        count: 20,
        entry: 2589,
      });
      expect(state.tabWithdrawals.get(0)).toBe(-1);
      expect(seen.map((event) => event.type)).toContain("opened");
    } finally {
      rig.dispose();
    }
  });

  test("a partial list merges one tab without touching the others (Guild.cpp:2873-2876)", () => {
    const rig = guildbankRig();
    try {
      rig.handle.act.openVault(GUILD_BANK_VAULT).catch(() => undefined);
      rig.inject(GameOpcode.SMSG_GUILD_BANK_LIST, openList());
      rig.inject(
        GameOpcode.SMSG_GUILD_BANK_LIST,
        bankListBody({
          full: false,
          items: [{ count: 1, entry: 1234, slot: 0 }],
          tab: 0,
          withdrawals: 5,
        }),
      );
      const state = rig.handle.state();
      expect(state.items.get(0)?.get(4)).toBeUndefined();
      expect(state.items.get(0)?.get(0)).toMatchObject({
        count: 1,
        entry: 1234,
      });
      expect(state.tabWithdrawals.get(0)).toBe(5);
    } finally {
      rig.dispose();
    }
  });

  test("reach refuses a non-vault gameobject", () => {
    const rig = guildbankRig();
    try {
      expect(
        rig.stores.areas.guildbank.reach?.(0xf1_10_00_00_00_00_00_01n),
      ).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("MSG_GUILD_BANK_LOG_QUERY stores the entries (Guild.cpp:1850-1867)", () => {
    const rig = guildbankRig();
    try {
      rig.inject(
        GameOpcode.MSG_GUILD_BANK_LOG_QUERY,
        bankLogBody({
          entries: [
            {
              age: 60,
              count: 20,
              entry: 2589,
              type: GUILD_BANK_LOG.DEPOSIT_ITEM,
            },
          ],
          tab: 0,
        }),
      );
      expect(rig.stores.areas.guildbank.log(0)).toEqual([
        expect.objectContaining({ entry: 2589, kind: "item" }),
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("MSG_QUERY_GUILD_BANK_TEXT stores the tab text (Guild.cpp:505-520)", () => {
    const rig = guildbankRig();
    try {
      rig.inject(
        GameOpcode.MSG_QUERY_GUILD_BANK_TEXT,
        bankTextBody(0, "Tabs reset Sunday."),
      );
      expect(rig.handle.state().texts[0]).toBe("Tabs reset Sunday.");
    } finally {
      rig.dispose();
    }
  });

  test("MSG_GUILD_BANK_MONEY_WITHDRAWN stores the remaining amount (Guild.cpp:1921-1933)", () => {
    const rig = guildbankRig();
    try {
      rig.inject(
        GameOpcode.MSG_GUILD_BANK_MONEY_WITHDRAWN,
        moneyWithdrawnBody(-1),
      );
      expect(rig.handle.state().moneyWithdrawn).toBe(-1);
    } finally {
      rig.dispose();
    }
  });
});
