import type { WorldHandle } from "@peon/core";
import {
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
  type Settle,
  summary,
} from "#tools/probe-flows";

const REACH_YARDS = 3;
const STEP_YARDS = 20;
const MAX_STEPS = 6;
const CLOTH_ENTRY = 2589;

type Args = Readonly<Record<string, string>>;

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

function whole(args: Args, key: string): number | undefined {
  const raw = args[key];
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`bank-moves needs ${key}=<number>, not "${raw}".`);
  return value;
}

async function reach(handle: WorldHandle, guid: bigint): Promise<void> {
  for (let i = 0; i < MAX_STEPS; i++) {
    const row = others(handle).find((r) => r.entity.guid === guid);
    if (!row?.position || row.distance === null || row.distance <= REACH_YARDS)
      return;
    const { x, y, z } = row.position;
    const yards = Math.min(STEP_YARDS, row.distance - REACH_YARDS + 1);
    const walked = await handle.walkTowardPoint({ x, y, z }, yards);
    if (walked.traveled === 0) return;
  }
}

async function attempt(act: () => Promise<unknown>): Promise<Json> {
  try {
    return json(await act());
  } catch (error) {
    return { thrown: error instanceof Error ? error.message : String(error) };
  }
}

async function depositStack(handle: WorldHandle, entry: number): Promise<Json> {
  const stack = handle
    .getInventoryState()
    .slots.find(
      (slot) => slot.status === "occupied" && slot.item.entry === entry,
    );
  if (stack?.status !== "occupied")
    return { skipped: `no item ${entry} is carried to deposit.` };
  return await attempt(() => handle.bank.act.deposit(stack.bag, stack.slot));
}

async function withdrawStack(
  handle: WorldHandle,
  settle: Settle,
  entry: number,
): Promise<Json> {
  const stored = await settle(() =>
    handle
      .getInventoryState()
      .slots.find(
        (slot) =>
          slot.status === "occupied" &&
          (slot.region === "bank" || slot.region === "bankbag") &&
          slot.item.entry === entry,
      ),
  );
  if (stored?.status !== "occupied")
    return {
      skipped: `no item ${entry} is stored to withdraw.`,
    };
  return await attempt(() => handle.bank.act.withdraw(stored.bag, stored.slot));
}

type OutcomeStatus = { status: string };

function isOutcome(value: unknown): value is OutcomeStatus {
  if (typeof value !== "object" || value === null) return false;
  if (!("status" in value)) return false;
  return typeof value.status === "string";
}

async function buySlots(args: Args, handle: WorldHandle): Promise<Json> {
  const count = whole(args, "buy");
  if (count === undefined || count === 0) return null;
  const attempts: Json[] = [];
  for (let i = 0; i < count; i++) {
    const outcome = await attempt(() => handle.bank.act.buyBankSlot());
    attempts.push(outcome);
    if (isOutcome(outcome) && outcome.status !== "ok") break;
  }
  return json(attempts);
}

async function run(ctx: FlowContext): Promise<Json> {
  const { handle, args, settle } = ctx;
  await settle(() =>
    handle.getInventoryState().status === "complete" ? true : undefined,
  );
  const npc = whole(args, "npc");
  const banker = await settle(() =>
    others(handle).find(
      (r) =>
        r.roles.includes("banker") &&
        (npc === undefined || r.entity.entry === npc),
    ),
  );
  if (!banker) throw new Error("no banker is in view.");
  if (args["far"] !== "1") await reach(handle, banker.entity.guid);
  const opened = await attempt(() =>
    handle.bank.act.openBank(banker.entity.guid),
  );
  const entry = whole(args, "item") ?? CLOTH_ENTRY;
  const deposit = await depositStack(handle, entry);
  const withdraw = await withdrawStack(handle, settle, entry);
  const buy = await buySlots(args, handle);
  return json({
    banker: summary(banker),
    buy,
    deposit,
    opened,
    state: handle.bank.state(),
    withdraw,
  });
}

export const flow: ProbeFlow = {
  name: "bank-moves",
  run,
  usage:
    "--flow bank-moves [--arg npc=<entry>] [--arg item=<entry>] [--arg buy=<n>] [--arg far=1]: walk to the nearest banker (with that creature entry) and open the bank, deposit the first carried stack of item (Linen Cloth unless item names another), withdraw it again, then buy up to n bag slots (stopping at the first refusal) with buy=<n>; far=1 skips the walk so the acts run out of range.",
};
