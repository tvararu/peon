import { ObjectType } from "@peon/core";
import { abortable } from "@peon/core/lib/abort";
import type { GearAfter, GearCtx } from "#harness/areas/items/tool";
import type { ToolResult } from "#harness/contract/result";
import { Refusal } from "#harness/ops/refusal";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

export type BankResult =
  | { status: "ok" }
  | { status: "refused"; reason: string }
  | { status: "no_change" }
  | { status: "unanswered" };

export type Banker = { name: string; ref: string };

export function bankerOf(ctx: GearCtx): Banker | undefined {
  for (const row of ctx.handle.queryNearby({ all: true })) {
    if (row.self) continue;
    const entity = row.entity;
    if (
      entity.objectType !== ObjectType.UNIT &&
      entity.objectType !== ObjectType.PLAYER
    )
      continue;
    if (!row.roles.includes("banker")) continue;
    return {
      name: entity.name ?? "the banker",
      ref: ctx.rt.refs.refOf(entity.guid),
    };
  }
  return undefined;
}

function closedBank(
  banker: Banker | undefined,
  npc: string,
  label: string,
): Refusal {
  return new Refusal({
    detail: `the bank is not open; open ${npc} first, then ${nextCall("interact", { do: "deposit", npc: banker?.ref ?? "banker", what: label })}.`,
    next:
      banker === undefined
        ? nextCall("look", { find: "banker" })
        : nextCall("interact", {
            do: "deposit",
            npc: banker.ref,
            what: label,
          }),
    reason: "bank_closed",
  });
}

async function sendDeposit(
  ctx: GearCtx,
  from: { bag: number; slot: number },
): Promise<BankResult> {
  const queued = ctx.rt.mutex.run(async () => {
    ctx.signal.throwIfAborted();
    ctx.handle.takeControl("manual_override");
    return await ctx.handle.bank.act.deposit(from.bag, from.slot);
  });
  queued.then(
    () => undefined,
    () => undefined,
  );
  try {
    const outcome = await abortable(queued, ctx.signal);
    ctx.signal.throwIfAborted();
    return outcome;
  } catch (error) {
    if (error instanceof Error && error.message === "no banker in range") {
      const refusal = new Refusal({
        detail: "the banker is out of reach; walk closer then deposit again.",
        next: nextCall("look", { find: "banker" }),
        reason: "banker_too_far",
      });
      refusal.cause = error;
      throw refusal;
    }
    throw error;
  }
}

function depositRefusal(
  banker: Banker,
  npc: string,
  label: string,
  outcome: Exclude<BankResult, { status: "ok" }>,
): Refusal {
  const reason = outcome.status === "refused" ? outcome.reason : outcome.status;
  if (outcome.status === "no_change")
    return new Refusal({
      detail: `${label} is already in the bank.`,
      next: nextCall("journal", { about: "bank" }),
      reason,
    });
  if (outcome.status === "unanswered")
    return new Refusal({
      detail: `${npc} did not answer the deposit; check whether ${label} is in the bank before trying again.`,
      next: nextCall("journal", { about: "bank" }),
      reason: "no_answer",
      status: "UNCONFIRMED",
    });
  return new Refusal({
    detail: `${npc} refused the deposit (${reason}).`,
    next: nextCall("interact", {
      do: "deposit",
      npc: banker.ref,
      what: label,
    }),
    reason,
  });
}

export async function runBankDeposit(
  ctx: GearCtx,
  found: { held: { item: { entry: number | undefined } }; label: string },
  from: { bag: number; slot: number },
): Promise<ToolResult<GearAfter>> {
  const open = ctx.handle.bank.state().banker;
  const banker = bankerOf(ctx);
  const label = found.label;
  const npc =
    banker === undefined ? "the banker" : `${banker.name} (${banker.ref})`;
  if (open === undefined || banker === undefined)
    throw closedBank(banker, npc, label);
  const outcome = await sendDeposit(ctx, from);
  if (outcome.status === "ok")
    return result("DONE", {
      after: {
        copper: 0,
        do: "move",
        entry: found.held.item.entry,
        from,
        item: label,
        taken: [],
        text: undefined,
        to: undefined,
        worn: undefined,
      },
      detail: `Deposited ${label} in the bank.`,
    });
  throw depositRefusal(banker, npc, label, outcome);
}
