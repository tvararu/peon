import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const RAID_TYPE = 2;
const FALLBACK_ENTRY = 1;

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

async function run({ handle, args }: FlowContext): Promise<Json> {
  const dungeons = await handle.lfg.act.requestDungeons();
  const given = args["entry"] === undefined ? undefined : Number(args["entry"]);
  const raid =
    dungeons.status === "ok"
      ? dungeons.locks.find((lock) => lock.type === RAID_TYPE)
      : undefined;
  const entry = given ?? raid?.entry ?? FALLBACK_ENTRY;
  const searched = await handle.lfg.act.searchRaids(entry);
  await Bun.sleep(3000);
  const stopped = await handle.lfg.act.stopSearch(entry);
  await Bun.sleep(6000);
  return json({
    entry,
    raidLists: handle.lfg.state().raidLists,
    searched,
    stopped,
  });
}

export const flow: ProbeFlow = {
  name: "lfg-raid-browser",
  run,
  usage:
    "--flow lfg-raid-browser [--arg entry=<n>]: request the lock info, search the raid browser for the first raid-type lock entry (or entry, or 1), wait 3 s, leave the search, wait 6 s, then report the lists the server sent.",
};
