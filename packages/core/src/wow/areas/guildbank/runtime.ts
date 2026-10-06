import { ignoreFailure } from "#lib/ignore-failure";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildBankerActivate,
  buildBankLogQuery,
  buildBankQueryTab,
  buildBankTextQuery,
  buildBuyBankTab,
  buildDepositBankMoney,
  buildInventorySwap,
  buildBankOnlySwap,
  buildSetBankText,
  buildUpdateBankTab,
  buildWithdrawBankMoney,
} from "#wow/areas/guildbank/protocol";
import {
  GUILD_BANK_YARDS,
  type GuildBankEvent,
  type GuildBankRequest,
  type GuildBankResult,
  type GuildBankStore,
} from "#wow/areas/guildbank/store";
import type { InventorySlot } from "#wow/inventory";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const GUILD_BANK_ANSWER_MS = 5000;

export type GuildBankActs = {
  openVault: (vault: bigint) => Promise<GuildBankResult>;
  queryTab: (tab: number) => Promise<GuildBankResult>;
  buyTab: (tab: number) => Promise<GuildBankResult>;
  renameTab: (
    tab: number,
    name: string,
    icon: string,
  ) => Promise<GuildBankResult>;
  depositMoney: (copper: number) => Promise<GuildBankResult>;
  withdrawMoney: (copper: number) => Promise<GuildBankResult>;
  depositItem: (
    bag: number,
    slot: number,
    tab: number,
    bankSlot: number,
  ) => Promise<GuildBankResult>;
  withdrawItem: (
    tab: number,
    bankSlot: number,
    bag: number,
    bagSlot: number,
  ) => Promise<GuildBankResult>;
  moveWithinBank: (
    srcTab: number,
    srcSlot: number,
    destTab: number,
    destSlot: number,
  ) => Promise<GuildBankResult>;
  setTabText: (tab: number, text: string) => Promise<GuildBankResult>;
  queryLog: (tab: number) => Promise<GuildBankResult>;
  queryText: (tab: number) => Promise<GuildBankResult>;
  queryMoneyWithdrawn: () => Promise<GuildBankResult>;
};

type Env = {
  ctx: AreaRuntimeCtx<GuildBankEvent>;
  store: GuildBankStore;
};

const SETTLED = new Set<GuildBankEvent["type"]>([
  "opened",
  "tab",
  "tab_bought",
  "tab_renamed",
  "money_moved",
  "moved",
  "text_set",
  "logged",
  "money_queried",
  "refused",
  "no_change",
  "unanswered",
]);

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
}

function requireWorld(env: Env): void {
  if (!env.ctx.selfGuid()) throw new Error("the character is not in world");
}

function openVaultOf(env: Env): bigint {
  const vault = env.store.snapshot().vault;
  if (vault === undefined) throw new Error("no guild vault is open");
  return vault;
}

function requireVault(env: Env, vault: bigint): void {
  const yards = env.store.reach(vault);
  if (yards === undefined || yards > GUILD_BANK_YARDS)
    throw new Error("no guild vault in range");
}

function allSlots(env: Env): InventorySlot[] {
  const inventory = env.store.inventory();
  return [...inventory.slots, ...(inventory.bank?.slots ?? [])];
}

async function send(
  env: Env,
  request: GuildBankRequest,
  packet: readonly [opcode: number, body: Uint8Array],
): Promise<GuildBankResult> {
  env.store.begin(request);
  const cancel = new AbortController();
  const settled = env.ctx.until(
    (event) =>
      SETTLED.has(event.type) && env.store.resultOf(request) !== undefined,
    {
      signal: AbortSignal.any([env.ctx.signal, cancel.signal]),
      timeoutMs: GUILD_BANK_ANSWER_MS,
    },
  );
  settled.catch(ignoreFailure);
  try {
    env.ctx.send(...packet);
  } catch (error) {
    cancel.abort();
    env.store.abandon();
    throw error;
  }
  try {
    await settled;
  } catch (error) {
    if (!isTimeout(error)) {
      env.store.abandon();
      throw error;
    }
    if (env.store.snapshot().pending === request) env.store.expire();
  }
  return env.store.takeResult(request) ?? { status: "unanswered" };
}

function open(env: Env, vault: bigint): Promise<GuildBankResult> {
  requireWorld(env);
  requireVault(env, vault);
  env.store.noteVault(vault);
  return send(
    env,
    { kind: "open", requestedAt: env.ctx.now(), vault },
    [GameOpcode.CMSG_GUILD_BANKER_ACTIVATE, buildBankerActivate(vault, true)],
  );
}

function query(env: Env, tab: number): Promise<GuildBankResult> {
  requireWorld(env);
  const vault = openVaultOf(env);
  requireVault(env, vault);
  return send(
    env,
    { kind: "query", requestedAt: env.ctx.now(), tab },
    [
      GameOpcode.CMSG_GUILD_BANK_QUERY_TAB,
      buildBankQueryTab(vault, tab, true),
    ],
  );
}

function buy(env: Env, tab: number): Promise<GuildBankResult> {
  requireWorld(env);
  const vault = openVaultOf(env);
  requireVault(env, vault);
  return send(
    env,
    { kind: "buy", requestedAt: env.ctx.now(), tab },
    [GameOpcode.CMSG_GUILD_BANK_BUY_TAB, buildBuyBankTab(vault, tab)],
  );
}

function rename(
  env: Env,
  tab: number,
  name: string,
  icon: string,
): Promise<GuildBankResult> {
  requireWorld(env);
  const vault = openVaultOf(env);
  requireVault(env, vault);
  if (name.length === 0) throw new Error("the tab name is empty");
  if (icon.length === 0) throw new Error("the tab icon is empty");
  return send(
    env,
    { kind: "rename", requestedAt: env.ctx.now(), tab },
    [
      GameOpcode.CMSG_GUILD_BANK_UPDATE_TAB,
      buildUpdateBankTab(vault, tab, name, icon),
    ],
  );
}

function checkCopper(copper: number): void {
  if (!Number.isInteger(copper) || copper <= 0)
    throw new Error(`copper ${copper} is not a positive amount`);
}

function depositMoney(env: Env, copper: number): Promise<GuildBankResult> {
  requireWorld(env);
  const vault = openVaultOf(env);
  requireVault(env, vault);
  checkCopper(copper);
  return send(
    env,
    { copper, kind: "deposit_money", requestedAt: env.ctx.now() },
    [
      GameOpcode.CMSG_GUILD_BANK_DEPOSIT_MONEY,
      buildDepositBankMoney(vault, copper),
    ],
  );
}

function withdrawMoney(env: Env, copper: number): Promise<GuildBankResult> {
  requireWorld(env);
  const vault = openVaultOf(env);
  requireVault(env, vault);
  checkCopper(copper);
  return send(
    env,
    { copper, kind: "withdraw_money", requestedAt: env.ctx.now() },
    [
      GameOpcode.CMSG_GUILD_BANK_WITHDRAW_MONEY,
      buildWithdrawBankMoney(vault, copper),
    ],
  );
}

function deposit(
  env: Env,
  bag: number,
  slot: number,
  tab: number,
  bankSlot: number,
): Promise<GuildBankResult> {
  requireWorld(env);
  const vault = openVaultOf(env);
  requireVault(env, vault);
  const held = allSlots(env).find(
    (candidate) => candidate.bag === bag && candidate.slot === slot,
  );
  if (held?.status !== "occupied")
    throw new Error(`bag ${bag} slot ${slot} holds no item`);
  return send(
    env,
    {
      count: held.item.count ?? 0,
      entry: held.item.entry ?? 0,
      kind: "move",
      requestedAt: env.ctx.now(),
      slot: bankSlot,
      tab,
    },
    [
      GameOpcode.CMSG_GUILD_BANK_SWAP_ITEMS,
      buildInventorySwap(vault, {
        autoStore: false,
        bag,
        bagSlot: slot,
        count: 0,
        entry: held.item.entry ?? 0,
        slot: bankSlot,
        tabId: tab,
        toChar: false,
      }),
    ],
  );
}

function withdraw(
  env: Env,
  tab: number,
  bankSlot: number,
  bag: number,
  bagSlot: number,
): Promise<GuildBankResult> {
  requireWorld(env);
  const vault = openVaultOf(env);
  requireVault(env, vault);
  const seen = env.store.snapshot().items.get(tab)?.get(bankSlot);
  if (!seen || seen.entry === 0)
    throw new Error(`tab ${tab} slot ${bankSlot} holds no item`);
  return send(
    env,
    {
      count: seen.count,
      entry: seen.entry,
      kind: "move",
      requestedAt: env.ctx.now(),
      slot: bankSlot,
      tab,
    },
    [
      GameOpcode.CMSG_GUILD_BANK_SWAP_ITEMS,
      buildInventorySwap(vault, {
        autoStore: false,
        bag,
        bagSlot,
        count: 0,
        entry: seen.entry,
        slot: bankSlot,
        tabId: tab,
        toChar: true,
      }),
    ],
  );
}

function moveWithin(
  env: Env,
  srcTab: number,
  srcSlot: number,
  destTab: number,
  destSlot: number,
): Promise<GuildBankResult> {
  requireWorld(env);
  const vault = openVaultOf(env);
  requireVault(env, vault);
  if (srcTab === destTab && srcSlot === destSlot)
    throw new Error("the source and destination are the same slot");
  const seen = env.store.snapshot().items.get(srcTab)?.get(srcSlot);
  if (!seen || seen.entry === 0)
    throw new Error(`tab ${srcTab} slot ${srcSlot} holds no item`);
  return send(
    env,
    {
      count: seen.count,
      entry: seen.entry,
      kind: "move",
      requestedAt: env.ctx.now(),
      slot: destSlot,
      tab: destTab,
    },
    [
      GameOpcode.CMSG_GUILD_BANK_SWAP_ITEMS,
      buildBankOnlySwap(vault, {
        count: 0,
        destSlot,
        destTab,
        entry: 0,
        srcSlot,
        srcTab,
      }),
    ],
  );
}

function setText(
  env: Env,
  tab: number,
  text: string,
): Promise<GuildBankResult> {
  requireWorld(env);
  openVaultOf(env);
  return send(
    env,
    { kind: "set_text", requestedAt: env.ctx.now(), tab },
    [GameOpcode.CMSG_SET_GUILD_BANK_TEXT, buildSetBankText(tab, text)],
  );
}

function queryLog(env: Env, tab: number): Promise<GuildBankResult> {
  requireWorld(env);
  openVaultOf(env);
  return send(
    env,
    { kind: "log", requestedAt: env.ctx.now(), tab },
    [GameOpcode.MSG_GUILD_BANK_LOG_QUERY, buildBankLogQuery(tab)],
  );
}

function queryText(env: Env, tab: number): Promise<GuildBankResult> {
  requireWorld(env);
  openVaultOf(env);
  return send(
    env,
    { kind: "text", requestedAt: env.ctx.now(), tab },
    [GameOpcode.MSG_QUERY_GUILD_BANK_TEXT, buildBankTextQuery(tab)],
  );
}

function queryWithdrawn(env: Env): Promise<GuildBankResult> {
  requireWorld(env);
  openVaultOf(env);
  return send(env, { kind: "money_query", requestedAt: env.ctx.now() }, [
    GameOpcode.MSG_GUILD_BANK_MONEY_WITHDRAWN,
    new Uint8Array(0),
  ]);
}

export function guildbankRuntime(
  ctx: AreaRuntimeCtx<GuildBankEvent>,
  store: GuildBankStore,
  _core: CoreStores,
): AreaRuntime<GuildBankActs> {
  const env = { ctx, store };
  return {
    act: {
      buyTab: (tab) => buy(env, tab),
      depositItem: (bag, slot, tab, bankSlot) =>
        deposit(env, bag, slot, tab, bankSlot),
      depositMoney: (copper) => depositMoney(env, copper),
      moveWithinBank: (srcTab, srcSlot, destTab, destSlot) =>
        moveWithin(env, srcTab, srcSlot, destTab, destSlot),
      openVault: (vault) => open(env, vault),
      queryLog: (tab) => queryLog(env, tab),
      queryMoneyWithdrawn: () => queryWithdrawn(env),
      queryTab: (tab) => query(env, tab),
      queryText: (tab) => queryText(env, tab),
      renameTab: (tab, name, icon) => rename(env, tab, name, icon),
      setTabText: (tab, text) => setText(env, tab, text),
      withdrawItem: (tab, bankSlot, bag, bagSlot) =>
        withdraw(env, tab, bankSlot, bag, bagSlot),
      withdrawMoney: (copper) => withdrawMoney(env, copper),
    },
    dispose: () => undefined,
  };
}
