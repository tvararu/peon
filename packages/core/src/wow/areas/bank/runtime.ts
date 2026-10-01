import { ignoreFailure } from "#lib/ignore-failure";
import {
  buildAutobankItem,
  buildAutostoreBankItem,
  buildBankerActivate,
  buildBuyBankSlot,
} from "#wow/areas/bank/protocol";
import {
  BANKER_YARDS,
  type BankEvent,
  type BankMoveRequest,
  type BankResult,
  type BankStore,
} from "#wow/areas/bank/store";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import type { InventorySlot, InventoryState } from "#wow/inventory";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const BANK_ANSWER_MS = 5000;
export const BANK_SLOT_FIRST = 39;
export const BANK_SLOT_LAST = 73;
export const BANK_BAG_FIRST = 67;
export const BANK_BAG_LAST = 73;

export type BankActs = {
  openBank: (npc: bigint) => Promise<BankResult>;
  deposit: (bag: number, slot: number) => Promise<BankResult>;
  withdraw: (bag: number, slot: number) => Promise<BankResult>;
  buyBankSlot: () => Promise<BankResult>;
};

const SETTLED = new Set<BankEvent["type"]>([
  "opened",
  "moved",
  "slot_bought",
  "refused",
  "no_change",
  "unanswered",
]);

type Env = {
  ctx: AreaRuntimeCtx<BankEvent>;
  store: BankStore;
};

function requireWorld(env: Env): void {
  if (!env.ctx.selfGuid()) throw new Error("the character is not in world");
}

function requireBanker(env: Env, banker: bigint): void {
  const yards = env.store.reach(banker);
  if (yards === undefined || yards > BANKER_YARDS)
    throw new Error("no banker in range");
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
}

function outcome(store: BankStore): BankResult {
  const last = store.snapshot().lastOutcome;
  if (!last) return { status: "unanswered" };
  if (last.status === "refused")
    return { status: "refused", reason: last.reason };
  return { status: last.status };
}

async function send(
  env: Env,
  request: BankMoveRequest,
  packet: readonly [opcode: number, body: Uint8Array],
): Promise<BankResult> {
  env.store.begin(request);
  const cancel = new AbortController();
  const settled = env.ctx.until(
    (event) =>
      SETTLED.has(event.type) && env.store.resultOf(request) !== undefined,
    {
      signal: AbortSignal.any([env.ctx.signal, cancel.signal]),
      timeoutMs: BANK_ANSWER_MS,
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
  return env.store.takeResult(request) ?? outcome(env.store);
}

function isBankPosition(bag: number, slot: number): boolean {
  if (bag === 255) return slot >= BANK_SLOT_FIRST && slot <= BANK_SLOT_LAST;
  return bag >= BANK_BAG_FIRST && bag <= BANK_BAG_LAST;
}

function open(env: Env, npc: bigint): Promise<BankResult> {
  requireWorld(env);
  const yards = env.store.reach(npc);
  if (yards !== undefined && yards > BANKER_YARDS)
    return Promise.resolve({ status: "unanswered" });
  return send(env, { kind: "open", npc, requestedAt: env.ctx.now() }, [
    GameOpcode.CMSG_BANKER_ACTIVATE,
    buildBankerActivate(npc),
  ]);
}

function allSlots(inventory: InventoryState): InventorySlot[] {
  return [...inventory.slots, ...(inventory.bank?.slots ?? [])];
}

function eligibleRegion(kind: "deposit" | "withdraw", region: string): boolean {
  if (kind === "deposit")
    return (
      region === "bank" ||
      region === "bankbag" ||
      region === "bank_bag_item" ||
      region === "equipment"
    );
  return (
    region === "backpack" ||
    region === "bag_item" ||
    region === "bag" ||
    region === "equipment" ||
    region === "keyring" ||
    region === "currency"
  );
}
function mergeTargets(
  inventory: InventoryState,
  kind: "deposit" | "withdraw",
  guid: bigint | undefined,
  entry: number | undefined,
): { toCount: number | undefined }[] {
  if (guid === undefined || entry === undefined) return [];
  return allSlots(inventory)
    .filter(
      (
        candidate,
      ): candidate is Extract<InventorySlot, { status: "occupied" }> =>
        candidate.status === "occupied" &&
        candidate.guid !== guid &&
        candidate.item.entry === entry &&
        eligibleRegion(kind, candidate.region),
    )
    .map((target) => ({ toCount: target.item.count }));
}

function move(
  env: Env,
  kind: "deposit" | "withdraw",
  bag: number,
  slot: number,
): Promise<BankResult> {
  requireWorld(env);
  const banker = env.store.snapshot().banker;
  if (banker === undefined) throw new Error("no banker is open");
  requireBanker(env, banker);
  const fromBank = isBankPosition(bag, slot);
  if (kind === "withdraw" && !fromBank)
    throw new Error(`bag ${bag} slot ${slot} is not a bank position`);
  if (kind === "deposit" && fromBank)
    throw new Error(`bag ${bag} slot ${slot} is already in the bank`);
  const inventory = env.store.inventory();
  const held = allSlots(inventory).find(
    (candidate) => candidate.bag === bag && candidate.slot === slot,
  );
  const guid = held?.status === "occupied" ? held.guid : undefined;
  const entry = held?.status === "occupied" ? held.item.entry : undefined;
  const targets = mergeTargets(inventory, kind, guid, entry);
  const toCounts = targets
    .map((target) => target.toCount)
    .filter((count) => count !== undefined);
  const body =
    kind === "deposit"
      ? buildAutobankItem(bag, slot)
      : buildAutostoreBankItem(bag, slot);
  const opcode =
    kind === "deposit"
      ? GameOpcode.CMSG_AUTOBANK_ITEM
      : GameOpcode.CMSG_AUTOSTORE_BANK_ITEM;
  return send(
    env,
    {
      bag,
      entry,
      guid,
      kind,
      requestedAt: env.ctx.now(),
      slot,
      toCounts,
    },
    [opcode, body],
  );
}

function buySlot(env: Env): Promise<BankResult> {
  requireWorld(env);
  const banker = env.store.snapshot().banker;
  if (banker === undefined) throw new Error("no banker is open");
  requireBanker(env, banker);
  return send(env, { banker, kind: "slot", requestedAt: env.ctx.now() }, [
    GameOpcode.CMSG_BUY_BANK_SLOT,
    buildBuyBankSlot(banker),
  ]);
}

export function bankRuntime(
  ctx: AreaRuntimeCtx<BankEvent>,
  store: BankStore,
  _core: CoreStores,
): AreaRuntime<BankActs> {
  const env = { ctx, store };
  const off = ctx.listen("entity", () => store.observeInventory());
  return {
    act: {
      buyBankSlot: () => buySlot(env),
      deposit: (bag, slot) => move(env, "deposit", bag, slot),
      openBank: (npc) => open(env, npc),
      withdraw: (bag, slot) => move(env, "withdraw", bag, slot),
    },
    dispose: off,
  };
}
