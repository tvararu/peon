import type { AreaEventOf } from "@peon/core";
import type { ObjectRow } from "#harness/areas/objects/reads";
import type { UseCtx } from "#harness/areas/objects/tool";
import type { ToolResult } from "#harness/contract/result";
import { EventWaiter } from "#harness/loops/event-waiter";
import { Refusal } from "#harness/ops/refusal";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

export const READ_LINES = 12;
export const READ_SETTLE_MS = 5000;

export const SENTENCE_BREAK = /(?<=[.!?])\s+(?=[A-Z"“])/;

const PAGE_BREAK = /\$B|\n/;
export function pageLines(text: string): string[] {
  return text
    .split(PAGE_BREAK)
    .flatMap((line) => line.split(SENTENCE_BREAK))
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function cutLines(lines: string[]): { head: string[]; more: number } {
  if (lines.length <= READ_LINES) return { head: lines, more: 0 };
  return { head: lines.slice(0, READ_LINES), more: lines.length - READ_LINES };
}

export async function readObjectFlow(
  ctx: UseCtx,
  row: ObjectRow,
): Promise<
  ToolResult<{
    do: "read";
    object: string;
    opened: boolean;
    taken: string[];
    text: string | undefined;
  }>
> {
  const { handle, rt } = ctx;
  const template = handle.objects.state().templates.get(row.entry);
  const type = template?.type ?? row.type;
  if (type === 9) {
    const pageId = template?.pageId;
    if (pageId === undefined)
      throw new Refusal({
        detail: `${row.name} (${row.ref}) has no text to read.`,
        next: nextCall("look", { find: "object" }),
        reason: "not_usable",
      });
    return readPages(ctx, row, pageId);
  }
  const waiter = new EventWaiter<AreaEventOf<"objects">>();
  const off = handle.objects.onEvent((event) => waiter.push(event));
  const useOutcome = await rt.mutex.run(() => handle.objects.act.use(row.guid));
  if (!("ok" in useOutcome)) {
    off();
    throw new Refusal({
      detail: `${row.name} (${row.ref}) cannot be used.`,
      next: nextCall("look", { find: "object" }),
      reason: "not_usable",
    });
  }
  let pageId: number | undefined;
  try {
    const shown = await waiter.find(
      (event) => event.type === "page_shown" && event.guid === row.guid,
      READ_SETTLE_MS,
      ctx.signal,
    );
    if (shown?.type === "page_shown") pageId = shown.pageId;
  } finally {
    off();
  }
  if (pageId === undefined)
    throw new Refusal({
      detail: `${row.name} (${row.ref}) showed no page.`,
      next: nextCall("look", { find: "object" }),
      reason: "not_usable",
    });
  return readPages(ctx, row, pageId);
}

async function readPages(
  ctx: UseCtx,
  row: ObjectRow,
  pageId: number,
): Promise<
  ToolResult<{
    do: "read";
    object: string;
    opened: boolean;
    taken: string[];
    text: string | undefined;
  }>
> {
  const { handle, rt } = ctx;
  const chain = await rt.mutex.run(() => handle.objects.act.readPage(pageId));
  if (!("pages" in chain))
    throw new Refusal({
      detail: `${row.name} (${row.ref}) did not answer; try again later.`,
      reason: "unanswered",
      status: "UNCONFIRMED",
    });
  const lines = chain.pages.flatMap((page) => pageLines(page.text));
  const { head, more } = cutLines(lines);
  const text = head.join("\n");
  const body = more > 0 ? [...head, `+${more} more lines in the log.`] : head;
  return result("DONE", {
    after: { do: "read", object: row.ref, opened: false, taken: [], text },
    body,
    detail: `Read ${row.name}: page ${pageId} (${chain.pages.length} page(s)).`,
    next: nextCall("journal", { about: "log", find: "page" }),
  });
}
