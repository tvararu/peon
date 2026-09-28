import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const ID = /^[1-9][0-9]*$/;
const DEFAULT_SECONDS = 3;

function parsePage(text: string | undefined): number {
  if (text === undefined || !ID.test(text))
    throw new Error(`objects-read needs page=<page id>, not "${text}".`);
  return Number(text);
}

async function run({ handle, args }: FlowContext): Promise<Json> {
  const firstPageId = parsePage(args["page"]);
  const seconds = Number(args["seconds"] ?? DEFAULT_SECONDS);
  const shown: Json[] = [];
  const off = handle.objects.onEvent((event) => {
    if (event.type === "page_shown")
      shown.push({
        guid: `0x${event.guid.toString(16)}`,
        pageId: event.pageId,
      });
  });
  const read = await handle.objects.act.readPage(firstPageId);
  await Bun.sleep(seconds * 1000);
  off();
  return {
    read: JSON.parse(JSON.stringify(read, (_, v) =>
      typeof v === "bigint" ? `0x${v.toString(16)}` : v,
    )) as Json,
    shown,
  };
}
export const flow: ProbeFlow = {
  name: "objects-read",
  run,
  usage:
    "--flow objects-read --arg page=<page id> [--arg seconds=<s>]: send CMSG_PAGE_TEXT_QUERY and report the page chain the server answers with.",
};
