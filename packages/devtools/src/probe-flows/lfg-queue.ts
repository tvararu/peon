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
  const joined = await handle.lfg.act.join({
    comment: "peon",
    entries: [entry],
    roles: 8,
  });
  if (joined.status !== "ok") return json({ joined });
  const changed = await handle.lfg.act.setComment("peon-live");
  const rejoined = await handle.lfg.act.join({
    entries: [entry],
    roles: 8,
  });
  const queuedComment = handle.lfg.state().comment;
  await Bun.sleep(12_000);
  const left = json(await handle.lfg.act.leave());
  const status = await handle.lfg.act.requestStatus();
  return json({
    changed,
    joined,
    left,
    queuedComment,
    rejoined,
    state: handle.lfg.state(),
    status,
  });
}

export const flow: ProbeFlow = {
  name: "lfg-queue",
  run,
  usage:
    "--flow lfg-queue: request dungeons, join the first unlocked random entry as damage with comment peon, change the comment to peon-live, rejoin without a comment so the join update surfaces the changed comment, wait 12 s, then leave.",
};
