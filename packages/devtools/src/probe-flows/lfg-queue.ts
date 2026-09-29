import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

async function run({ handle }: FlowContext): Promise<Json> {
  const dungeons = await handle.lfg.act.requestDungeons();
  if (dungeons.status !== "ok") return json({ dungeons });
  const entry = dungeons.available.at(0)?.entry;
  if (entry === undefined) return json({ dungeons, queued: "no_entries" });
  const commented = await handle.lfg.act.setComment("peon");
  const joined = await handle.lfg.act.join({
    comment: "peon",
    entries: [entry],
    roles: 8,
  });
  await Bun.sleep(12_000);
  const status = json(await handle.lfg.act.requestStatus());
  const left = json(await handle.lfg.act.leave());
  return json({ commented, joined, left, state: handle.lfg.state(), status });
}

export const flow: ProbeFlow = {
  name: "lfg-queue",
  run,
  usage:
    "--flow lfg-queue: request dungeons, comment, join the first unlocked random entry as damage, wait 12 s, request status, then leave.",
};
