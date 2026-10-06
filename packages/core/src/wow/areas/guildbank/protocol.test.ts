import { describe, expect, test } from "bun:test";
import {
  GUILD_BANK_VAULT,
  bankListBody,
  bankLogBody,
  bankTextBody,
  moneyWithdrawnBody,
} from "#test-support/areas/guildbank";
import { bytes } from "#test-support/hex";
import {
  GUILD_BANK_LOG,
  buildBankLogQuery,
  buildBankQueryTab,
  buildBankTextQuery,
  buildBankerActivate,
  buildBankOnlySwap,
  buildBuyBankTab,
  buildDepositBankMoney,
  buildInventorySwap,
  buildSetBankText,
  buildUpdateBankTab,
  buildWithdrawBankMoney,
  guildBankLogName,
  parseBankList,
  parseBankLog,
  parseBankText,
  parseMoneyWithdrawn,
} from "#wow/areas/guildbank/protocol";
import { PacketReader } from "#wow/protocol/packet";

describe("guildbank builders", () => {
  test("CMSG_GUILD_BANKER_ACTIVATE writes the vault guid and the bool (GuildPackets.cpp:239-243)", () => {
    expect(buildBankerActivate(GUILD_BANK_VAULT, true)).toEqual(
      bytes("010c 0000 0000 20f1 01"),
    );
    expect(buildBankerActivate(GUILD_BANK_VAULT, false)).toEqual(
      bytes("010c 0000 0000 20f1 00"),
    );
  });

  test("CMSG_GUILD_BANK_QUERY_TAB writes guid, tab and bool (GuildPackets.cpp:265-269)", () => {
    expect(buildBankQueryTab(GUILD_BANK_VAULT, 2, false)).toEqual(
      bytes("010c 0000 0000 20f1 02 00"),
    );
  });

  test("a tab above 6 is refused", () => {
    expect(() => buildBankQueryTab(GUILD_BANK_VAULT, 7, true)).toThrow("tab");
    expect(() => buildBankLogQuery(99)).toThrow("tab");
  });

  test("the bank-only swap writes the dest, src, unknown and count fields (GuildPackets.cpp:337-355)", () => {
    expect(
      buildBankOnlySwap(GUILD_BANK_VAULT, {
        count: 5,
        destSlot: 3,
        destTab: 1,
        entry: 2589,
        srcSlot: 4,
        srcTab: 0,
      }),
    ).toEqual(
      bytes("010c 0000 0000 20f1 01 01 03 1d0a 0000 00 04 0000 0000 00 0500 0000"),
    );
  });

  test("the manual inventory swap writes the bag, slot, direction and split (GuildPackets.cpp:357-377)", () => {
    expect(
      buildInventorySwap(GUILD_BANK_VAULT, {
        autoStore: false,
        bag: 255,
        bagSlot: 25,
        count: 0,
        entry: 2589,
        slot: 4,
        tabId: 0,
        toChar: false,
      }),
    ).toEqual(
      bytes("010c 0000 0000 20f1 00 00 04 1d0a 0000 00 ff 19 00 0000 0000"),
    );
  });

  test("the autostore swap writes the count and the to-slot bool (GuildPackets.cpp:365-369)", () => {
    expect(
      buildInventorySwap(GUILD_BANK_VAULT, {
        autoStore: true,
        count: 20,
        entry: 2589,
        slot: 4,
        tabId: 0,
      }),
    ).toEqual(
      bytes("010c 0000 0000 20f1 00 00 04 1d0a 0000 01 1400 0000 01 0000 0000"),
    );
  });

  test("CMSG_GUILD_BANK_BUY_TAB writes guid and tab (GuildPackets.cpp:245-249)", () => {
    expect(buildBuyBankTab(GUILD_BANK_VAULT, 0)).toEqual(
      bytes("010c 0000 0000 20f1 00"),
    );
  });

  test("CMSG_GUILD_BANK_UPDATE_TAB writes guid, tab and two strings (GuildPackets.cpp:251-257)", () => {
    expect(
      buildUpdateBankTab(GUILD_BANK_VAULT, 0, "Loot", "INV_Misc_Coin_01"),
    ).toEqual(
      bytes(
        "010c 0000 0000 20f1 00 4c6f 6f74 00 494e 565f 4d69 7363 5f43 6f69 6e5f 3031 00",
      ),
    );
  });

  test("the money packets write guid and u32 (GuildPackets.cpp:259-263, :279-283)", () => {
    expect(buildDepositBankMoney(GUILD_BANK_VAULT, 100_000)).toEqual(
      bytes("010c 0000 0000 20f1 a086 0100"),
    );
    expect(buildWithdrawBankMoney(GUILD_BANK_VAULT, 500)).toEqual(
      bytes("010c 0000 0000 20f1 f401 0000"),
    );
  });

  test("the log, text and withdrawn queries write one u8 or nothing (GuildPackets.cpp:380-383, :419-421, :427-431)", () => {
    expect(buildBankLogQuery(6)).toEqual(bytes("06"));
    expect(buildBankTextQuery(0)).toEqual(bytes("00"));
    expect(buildSetBankText(0, "Tabs reset Sunday.")).toEqual(
      bytes("00 5461 6273 2072 6573 6574 2053 756e 6461 792e 00"),
    );
  });

  test("copper above u32 is refused", () => {
    expect(() => buildDepositBankMoney(GUILD_BANK_VAULT, 2 ** 32)).toThrow(
      "copper",
    );
  });
});

describe("SMSG_GUILD_BANK_LIST", () => {
  test("a full tab-0 list reads money, withdrawals, tab briefs and slots (GuildPackets.cpp:285-330)", () => {
    const parsed = parseBankList(
      new PacketReader(
        bankListBody({
          items: [
            { charges: 0, count: 20, entry: 2589, flags: 0, slot: 4 },
            { entry: 0, slot: 5 },
          ],
          money: 1_000_000n,
          tabs: [{ icon: "INV_Misc_Coin_01", name: "Loot" }],
          withdrawals: -1,
        }),
      ),
    );
    expect(parsed).toMatchObject({
      full: true,
      money: 1_000_000n,
      tab: 0,
      withdrawals: -1,
    });
    expect(parsed?.tabs).toEqual([
      { icon: "INV_Misc_Coin_01", name: "Loot" },
    ]);
    expect(parsed?.items).toEqual([
      expect.objectContaining({ count: 20, entry: 2589, slot: 4 }),
      expect.objectContaining({ entry: 0, slot: 5 }),
    ]);
  });

  test("a partial slot list reads the slot, entry and count (Guild.cpp:2902-2906)", () => {
    const parsed = parseBankList(
      new PacketReader(
        bankListBody({
          full: false,
          items: [{ count: 1, entry: 1234, slot: 7 }],
          tab: 1,
        }),
      ),
    );
    expect(parsed?.tabs).toEqual([]);
    expect(parsed?.items).toEqual([
      expect.objectContaining({ count: 1, entry: 1234, slot: 7 }),
    ]);
  });

  test("a random-property item reads the seed, and sockets read index then id (GuildPackets.cpp:304-322)", () => {
    const parsed = parseBankList(
      new PacketReader(
        bankListBody({
          full: false,
          items: [
            {
              count: 1,
              entry: 4323,
              randomProperty: -187,
              randomSeed: 44,
              slot: 0,
              sockets: [{ enchant: 2656, index: 0 }],
            },
          ],
          tab: 0,
        }),
      ),
    );
    expect(parsed?.items).toEqual([
      expect.objectContaining({
        entry: 4323,
        randomProperty: -187,
        randomSeed: 44,
        sockets: [{ enchant: 2656, index: 0 }],
      }),
    ]);
  });

  test("a truncated list is refused", () => {
    expect(
      parseBankList(new PacketReader(bytes("4042 0f00 0000 0000"))),
    ).toBeUndefined();
  });
});

describe("MSG_GUILD_BANK_LOG_QUERY", () => {
  test("deposit and withdraw items read entry, count and age (GuildPackets.cpp:385-399)", () => {
    const parsed = parseBankLog(
      new PacketReader(
        bankLogBody({
          entries: [
            {
              age: 60,
              count: 20,
              entry: 2589,
              type: GUILD_BANK_LOG.DEPOSIT_ITEM,
            },
            {
              age: 120,
              count: 1,
              entry: 1234,
              type: GUILD_BANK_LOG.WITHDRAW_ITEM,
            },
          ],
          tab: 0,
        }),
      ),
    );
    expect(parsed?.tab).toBe(0);
    expect(parsed?.entries).toEqual([
      expect.objectContaining({
        count: 20,
        entry: 2589,
        kind: "item",
        name: "deposit_item",
      }),
      expect.objectContaining({
        count: 1,
        entry: 1234,
        kind: "item",
        name: "withdraw_item",
      }),
    ]);
  });

  test("a move entry reads the other tab, money entries read copper (GuildPackets.cpp:402-413)", () => {
    const parsed = parseBankLog(
      new PacketReader(
        bankLogBody({
          entries: [
            {
              age: 30,
              count: 5,
              entry: 2589,
              otherTab: 1,
              type: GUILD_BANK_LOG.MOVE_ITEM,
            },
            { age: 10, money: 1000, type: GUILD_BANK_LOG.DEPOSIT_MONEY },
          ],
          tab: 6,
        }),
      ),
    );
    expect(parsed?.entries).toEqual([
      expect.objectContaining({
        kind: "move",
        name: "move_item",
        otherTab: 1,
      }),
      expect.objectContaining({
        kind: "money",
        money: 1000,
        name: "deposit_money",
      }),
    ]);
  });

  test("an unknown log type keeps its number in the name", () => {
    expect(guildBankLogName(99)).toBe("bank_log_99");
  });
});

describe("MSG_QUERY_GUILD_BANK_TEXT", () => {
  test("the reply reads the tab and the text (GuildPackets.cpp:424-429)", () => {
    expect(
      parseBankText(new PacketReader(bankTextBody(0, "Tabs reset Sunday."))),
    ).toEqual({ tab: 0, text: "Tabs reset Sunday." });
  });
});

describe("MSG_GUILD_BANK_MONEY_WITHDRAWN", () => {
  test("the reply reads one i32, -1 for the guildmaster (GuildPackets.cpp:272-277, Guild.cpp:2634-2645)", () => {
    expect(parseMoneyWithdrawn(new PacketReader(moneyWithdrawnBody(-1)))).toBe(
      -1,
    );
    expect(parseMoneyWithdrawn(new PacketReader(moneyWithdrawnBody(5000)))).toBe(
      5000,
    );
  });
});
