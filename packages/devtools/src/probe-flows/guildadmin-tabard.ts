import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

async function run({ handle, settle }: FlowContext): Promise<Json> {
  const row = await settle(
    () =>
      handle
        .queryNearby({ all: true })
        .filter((r) => !r.self && r.roles.includes("tabard_designer"))
        .sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9))[0],
  );
  if (row === undefined) return { error: "no tabard designer nearby" };
  const npc = row.entity.guid;
  const act = handle.guildadmin.act;
  const opened = await act.openTabardVendor(npc);
  const saved = await act.saveEmblem(npc, {
    backgroundColor: 5,
    borderColor: 4,
    borderStyle: 1,
    color: 2,
    style: 3,
  });
  const state = handle.guildadmin.state();
  return json({ at: row.position, distance: row.distance, npc, opened, saved, emblem: state.emblem });
}

export const flow: ProbeFlow = {
  name: "guildadmin-tabard",
  run,
  usage:
    "--flow guildadmin-tabard: within 5.5 yards of a tabard designer (the Dalaran guild master), opens the designer and saves an emblem. A guildless character gets result 2; a guild leader with 10 gold gets 0 and a new emblem.",
};
