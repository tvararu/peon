import { BAGS, type Found, named } from "#harness/areas/items/tool-resolve";
import {
  afterOf,
  type GearAfter,
  type GearCtx,
  moveRefusal,
} from "#harness/areas/items/tool-shared";
import type { ToolResult } from "#harness/contract/result";
import { Refusal } from "#harness/ops/refusal";
import { result } from "#harness/tools/define";

const READ_LINES = 12;
const PAGE_BREAK = /\$B|\n/;

function pageLines(text: string): string[] {
  return text
    .split(PAGE_BREAK)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function cutHead(lines: string[]): { head: string[]; more: number } {
  if (lines.length <= READ_LINES) return { head: lines, more: 0 };
  return { head: lines.slice(0, READ_LINES), more: lines.length - READ_LINES };
}

async function readPages(
  ctx: GearCtx,
  found: Found,
  from: { bag: number; slot: number },
  pageId: number,
): Promise<ToolResult<GearAfter>> {
  const { handle, rt } = ctx;
  const chain = await rt.mutex.run(() => handle.objects.act.readPage(pageId));
  if (!("pages" in chain))
    throw new Refusal({
      detail: `${found.label} did not answer; try again later.`,
      next: BAGS,
      reason: "unanswered",
      status: "UNCONFIRMED",
    });
  const lines = chain.pages.flatMap((page) => pageLines(page.text));
  const { head, more } = cutHead(lines);
  const joined = head.join("\n");
  const body = more > 0 ? [...head, `+${more} more lines in the log.`] : head;
  return result("DONE", {
    after: afterOf(found, from, {
      do: "read",
      item: found.label,
      text: joined,
    }),
    body,
    detail: `Read ${found.label}: page ${pageId} (${chain.pages.length} page(s)).`,
  });
}

export async function runRead(
  ctx: GearCtx,
  item: string,
): Promise<ToolResult<GearAfter>> {
  const { handle, rt } = ctx;
  const found = named(handle.getInventoryState(), item, [
    "backpack",
    "bag_item",
  ]);
  const from = { bag: found.held.bag, slot: found.held.slot };
  const outcome_ = await rt.mutex.run(() => handle.items.act.read(from));
  if (outcome_.status !== "ok")
    throw new Refusal({
      detail:
        outcome_.status === "unanswered"
          ? "the server did not answer."
          : `the server refused: ${outcome_.reason ?? "read_item_failed"}.`,
      next: BAGS,
      reason: outcome_.reason ?? outcome_.status,
      status: outcome_.status === "unanswered" ? "UNCONFIRMED" : "REFUSED",
    });
  const entry = found.held.item.entry;
  const queried =
    entry === undefined
      ? undefined
      : await rt.mutex.run(() =>
          handle.getItemTemplate(entry).catch(() => undefined),
        );
  const pageId = queried?.pageText || undefined;
  if (pageId !== undefined) return readPages(ctx, found, from, pageId);
  const text = await rt.mutex.run(() =>
    handle.items.act.queryText(found.held.guid),
  );
  return result("DONE", {
    after: afterOf(found, from, {
      do: "read",
      item: found.label,
      text,
    }),
    detail: text
      ? `Read ${found.label}: ${text}.`
      : `Read ${found.label} (no text).`,
  });
}

export async function runAmmo(
  ctx: GearCtx,
  item: string,
): Promise<ToolResult<GearAfter>> {
  const { handle, rt } = ctx;
  const found = named(handle.getInventoryState(), item, [
    "backpack",
    "bag_item",
  ]);
  const entry = found.held.item.entry;
  if (entry === undefined)
    throw new Refusal({
      detail: `${found.label} is not identified yet; look at your bags and try again.`,
      next: BAGS,
      reason: "unknown_item",
    });
  const outcome_ = await rt.mutex.run(() => handle.items.act.setAmmo(entry));
  if (outcome_.last?.status !== "confirmed")
    throw moveRefusal(handle, found.held.guid, outcome_);
  return result("DONE", {
    after: afterOf(
      found,
      { bag: found.held.bag, slot: found.held.slot },
      {
        do: "ammo",
        item: found.label,
      },
    ),
    detail: `${found.label} loaded.`,
  });
}
