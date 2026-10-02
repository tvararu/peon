import type { NamedInventoryState } from "@peon/core";
import { abortable } from "@peon/core/lib/abort";
import { noMailboxText, pickMailbox } from "#harness/areas/mail/tool-check";
import type {
  MailAfter,
  MailArgs,
  MailCtx,
} from "#harness/areas/mail/tool-types";
import type { ToolResult } from "#harness/contract/result";
import { Refusal } from "#harness/ops/refusal";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

export type MailDraftItem = { slot: number; guid: bigint };

export const MAIL_SEND_POSTAGE = 30;
export const MAX_SEND_ITEMS = 12;

const BAG_SLOT = /^bag (\d+) slot (\d+)$/i;
const ENTRY_REF = /^item (\d+)$/i;
type Carried = {
  bag: number;
  entry: number | undefined;
  guid: bigint;
  label: string;
  slot: number;
};

type OccupiedSlot = Extract<
  NamedInventoryState["slots"][number],
  { status: "occupied" }
>;

function carriedRow(slot: OccupiedSlot): Carried {
  return {
    bag: slot.bag,
    entry: slot.item.entry,
    guid: slot.guid,
    label: slot.item.name ?? `item ${slot.item.entry ?? 0}`,
    slot: slot.slot,
  };
}

function carriedOf(state: NamedInventoryState): Carried[] {
  return state.slots.flatMap((slot) => {
    if (slot.status !== "occupied") return [];
    if (slot.region !== "backpack" && slot.region !== "bag_item") return [];
    return [carriedRow(slot as OccupiedSlot)];
  });
}

function matchCarried(pool: Carried[], text: string): Carried[] {
  const trimmed = text.trim();
  const at = BAG_SLOT.exec(trimmed);
  if (at?.[1] !== undefined && at[2] !== undefined) {
    const bag = Number(at[1]);
    const slot = Number(at[2]);
    return pool.filter((held) => held.bag === bag && held.slot === slot);
  }
  const id = ENTRY_REF.exec(trimmed)?.[1];
  if (id) {
    const entry = Number(id);
    return pool.filter((held) => held.entry === entry);
  }
  const lower = trimmed.toLowerCase();
  const exact = pool.filter((held) => held.label.toLowerCase() === lower);
  if (exact.length > 0) return exact;
  return pool.filter((held) => held.label.toLowerCase().includes(lower));
}

export function pickAttachments(
  state: NamedInventoryState,
  names: readonly string[],
): { items: MailDraftItem[]; labels: string[] } {
  if (names.length > MAX_SEND_ITEMS) {
    const refusal = new Refusal({
      detail: `A letter holds 12 items, not ${names.length}.`,
      next: nextCall("journal", { about: "bags" }),
      reason: "too_many_items",
    });
    throw refusal;
  }
  const pool = carriedOf(state);
  const picked: (Carried & { draft: MailDraftItem })[] = [];
  const seen: Record<string, true> = {};
  names.forEach((name, index) => {
    const near = matchCarried(pool, name);
    const held = near[0];
    if (held === undefined) {
      const refusal = new Refusal({
        detail: `No carried item matches "${name}".`,
        next: nextCall("journal", { about: "bags" }),
        reason: "no_such_item",
      });
      throw refusal;
    }
    if (near.length > 1) {
      const refusal = new Refusal({
        detail: `"${name}" matches more than one item; name one bag and slot, like "bag 255 slot 25".`,
        next: nextCall("journal", { about: "bags" }),
        reason: "ambiguous_item",
      });
      throw refusal;
    }
    const key = `${held.bag}/${held.slot}`;
    if (seen[key]) {
      const refusal = new Refusal({
        detail: `${held.label} is named twice; name each item once.`,
        next: nextCall("journal", { about: "bags" }),
        reason: "duplicate_item",
      });
      throw refusal;
    }
    seen[key] = true;
    picked.push({ ...held, draft: { guid: held.guid, slot: index } });
  });
  return {
    items: picked.map((entry) => entry.draft),
    labels: picked.map((entry) => entry.label),
  };
}

function sendRefusal(reason: string, detail: string): Refusal {
  return new Refusal({
    detail,
    next: nextCall("mail", { do: "check" }),
    reason,
  });
}

export async function runSend(
  args: MailArgs,
  ctx: MailCtx,
): Promise<ToolResult<MailAfter>> {
  const picked = pickMailbox(ctx);
  if (!picked.found)
    throw sendRefusal("no_mailbox", noMailboxText(picked.known));
  const to = args.to?.trim() ?? "";
  if (to === "")
    throw sendRefusal(
      "missing_receiver",
      "Name the character who gets the letter.",
    );
  const names = args.items ?? [];
  const gold = args.gold ?? 0;
  if (!Number.isInteger(gold) || gold < 0)
    throw sendRefusal(
      "bad_gold",
      `Gold ${gold} is not a copper amount of 0 or more.`,
    );
  const attachments = pickAttachments(ctx.handle.getInventoryState(), names);
  const act = ctx.handle.mail.act;
  const sent = await ctx.rt.mutex.run(async () => {
    ctx.signal.throwIfAborted();
    return await abortable(
      act.sendMail({
        body: args.text ?? "",
        items: attachments.items,
        mailbox: picked.guid,
        money: gold,
        receiver: to,
        subject: args.subject ?? "",
      }),
      ctx.signal,
    );
  });
  if (sent.status !== "ok") {
    if (sent.status === "unanswered")
      throw sendRefusal("no_answer", "The mailbox did not answer the send.");
    throw sendRefusal("mail_refused", `The send was refused (${sent.why}).`);
  }
  const postage = MAIL_SEND_POSTAGE * Math.max(attachments.items.length, 1);
  const detail = `Sent to ${to}; postage ${postage} copper.`;
  return result("DONE", {
    after: { do: "send", letters: 0, sentTo: to, taken: [] },
    body: [detail],
    detail,
  });
}
