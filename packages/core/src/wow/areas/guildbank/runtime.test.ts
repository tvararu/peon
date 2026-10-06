import { describe, expect, test } from "bun:test";
import {
  GUILD_BANK_VAULT,
  bankListBody,
  bankLogBody,
  bankTextBody,
  guildbankRig,
  moneyWithdrawnBody,
} from "#test-support/areas/guildbank";
import { GUILD_BANK_LOG } from "#wow/areas/guildbank/protocol";
import { GameOpcode } from "#wow/protocol/opcodes";

function openList() {
  return bankListBody({
    items: [{ count: 20, entry: 2589, slot: 4 }],
    money: 1_000_000n,
    tabs: [{ icon: "INV_Misc_Coin_01", name: "Loot" }],
    withdrawals: -1,
  });
}

async function opened() {
  const rig = guildbankRig();
  const opened = rig.handle.act.openVault(GUILD_BANK_VAULT);
  rig.inject(GameOpcode.SMSG_GUILD_BANK_LIST, openList());
  expect(await opened).toEqual({ status: "ok" });
  return rig;
}

describe("guildbank runtime", () => {
  test("openVault sends the activate and settles on the full list", async () => {
    const rig = guildbankRig();
    try {
      const pending = rig.handle.act.openVault(GUILD_BANK_VAULT);
      expect(rig.sent.at(-1)?.opcode).toBe(
        GameOpcode.CMSG_GUILD_BANKER_ACTIVATE,
      );
      rig.inject(GameOpcode.SMSG_GUILD_BANK_LIST, openList());
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("openVault throws with no vault in range", async () => {
    const rig = guildbankRig();
    try {
      expect(() =>
        rig.handle.act.openVault(0xf1_20_00_00_00_00_09_99n),
      ).toThrow("no guild vault in range");
    } finally {
      rig.dispose();
    }
  });

  test("queryTab sends the query and settles on its tab", async () => {
    const rig = await opened();
    try {
      const pending = rig.handle.act.queryTab(0);
      expect(rig.sent.at(-1)?.opcode).toBe(
        GameOpcode.CMSG_GUILD_BANK_QUERY_TAB,
      );
      rig.inject(
        GameOpcode.SMSG_GUILD_BANK_LIST,
        bankListBody({
          full: false,
          items: [{ count: 20, entry: 2589, slot: 4 }],
          tab: 0,
        }),
      );
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("buyTab settles when the full list shows the new tab", async () => {
    const rig = await opened();
    try {
      const pending = rig.handle.act.buyTab(1);
      expect(rig.sent.at(-1)?.opcode).toBe(GameOpcode.CMSG_GUILD_BANK_BUY_TAB);
      rig.inject(
        GameOpcode.SMSG_GUILD_BANK_LIST,
        bankListBody({
          items: [],
          tabs: [
            { icon: "INV_Misc_Coin_01", name: "Loot" },
            { icon: "", name: "" },
          ],
        }),
      );
      expect(await pending).toEqual({ status: "ok" });
      expect(rig.handle.state().tabs).toBe(2);
    } finally {
      rig.dispose();
    }
  });

  test("renameTab sends name and icon (GuildHandler.cpp:378-387)", async () => {
    const rig = await opened();
    try {
      const pending = rig.handle.act.renameTab(0, "Raid", "INV_Misc_Coin_02");
      expect(rig.sent.at(-1)?.opcode).toBe(
        GameOpcode.CMSG_GUILD_BANK_UPDATE_TAB,
      );
      rig.inject(GameOpcode.SMSG_GUILD_BANK_LIST, openList());
      expect(await pending).toEqual({ status: "ok" });
      expect(() =>
        rig.handle.act.renameTab(0, "", "INV_Misc_Coin_02"),
      ).toThrow("name is empty");
    } finally {
      rig.dispose();
    }
  });

  test("depositMoney and withdrawMoney settle on the money update", async () => {
    const rig = await opened();
    try {
      const deposit = rig.handle.act.depositMoney(100_000);
      expect(rig.sent.at(-1)?.opcode).toBe(
        GameOpcode.CMSG_GUILD_BANK_DEPOSIT_MONEY,
      );
      rig.inject(
        GameOpcode.SMSG_GUILD_BANK_LIST,
        bankListBody({ money: 1_100_000n }),
      );
      expect(await deposit).toEqual({ status: "ok" });
      expect(rig.handle.state().money).toBe(1_100_000n);
      const withdraw = rig.handle.act.withdrawMoney(50_000);
      expect(rig.sent.at(-1)?.opcode).toBe(
        GameOpcode.CMSG_GUILD_BANK_WITHDRAW_MONEY,
      );
      rig.inject(
        GameOpcode.SMSG_GUILD_BANK_LIST,
        bankListBody({ money: 1_050_000n }),
      );
      expect(await withdraw).toEqual({ status: "ok" });
      expect(() => rig.handle.act.depositMoney(0)).toThrow(
        "positive amount",
      );
    } finally {
      rig.dispose();
    }
  });

  test("setTabText settles on the broadcast text (Guild.cpp:2437-2444)", async () => {
    const rig = await opened();
    try {
      const pending = rig.handle.act.setTabText(0, "Tabs reset Sunday.");
      expect(rig.sent.at(-1)?.opcode).toBe(
        GameOpcode.CMSG_SET_GUILD_BANK_TEXT,
      );
      rig.inject(
        GameOpcode.MSG_QUERY_GUILD_BANK_TEXT,
        bankTextBody(0, "Tabs reset Sunday."),
      );
      expect(await pending).toEqual({ status: "ok" });
      expect(rig.handle.state().texts[0]).toBe("Tabs reset Sunday.");
    } finally {
      rig.dispose();
    }
  });

  test("queryLog and queryMoneyWithdrawn settle on their replies", async () => {
    const rig = await opened();
    try {
      const log = rig.handle.act.queryLog(6);
      expect(rig.sent.at(-1)?.opcode).toBe(
        GameOpcode.MSG_GUILD_BANK_LOG_QUERY,
      );
      rig.inject(
        GameOpcode.MSG_GUILD_BANK_LOG_QUERY,
        bankLogBody({
          entries: [{ age: 5, money: 1000, type: GUILD_BANK_LOG.DEPOSIT_MONEY }],
          tab: 6,
        }),
      );
      expect(await log).toEqual({ status: "ok" });
      const money = rig.handle.act.queryMoneyWithdrawn();
      expect(rig.sent.at(-1)?.opcode).toBe(
        GameOpcode.MSG_GUILD_BANK_MONEY_WITHDRAWN,
      );
      rig.inject(
        GameOpcode.MSG_GUILD_BANK_MONEY_WITHDRAWN,
        moneyWithdrawnBody(-1),
      );
      expect(await money).toEqual({ status: "ok" });
      expect(rig.handle.state().moneyWithdrawn).toBe(-1);
    } finally {
      rig.dispose();
    }
  });

  test("a second request while one is pending throws", async () => {
    const rig = await opened();
    try {
      const first = rig.handle.act.queryTab(0);
      first.catch(() => undefined);
      await expect(rig.handle.act.queryTab(0)).rejects.toThrow(
        "already pending",
      );
      rig.inject(
        GameOpcode.SMSG_GUILD_BANK_LIST,
        bankListBody({ full: false, items: [], tab: 0 }),
      );
      await first;
    } finally {
      rig.dispose();
    }
  });
});
