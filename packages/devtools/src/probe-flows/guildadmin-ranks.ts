import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

async function run({ handle, args }: FlowContext): Promise<Json> {
  const me = args["name"] ?? "";
  const act = handle.guildadmin.act;
  await handle.requestGuildRoster();
  const added = await act.addRank("Raider");
  const renamed = await act.setRank(5, {
    goldPerDay: 0,
    name: "Raiders",
    rights: 0x4_1,
    tabs: [],
  });
  const publicNote = await act.setNote(me, "tank", { officer: false });
  const officerNote = await act.setNote(me, "boss", { officer: true });
  const infoText = await act.setInfoText("Raid at eight");
  const permissions = await act.permissions();
  const eventLog = await act.eventLog();
  const removed = await act.removeLowestRank({ confirm: true });
  const roster = await handle.requestGuildRoster();
  return json({
    added,
    eventLog,
    infoText,
    officerNote,
    permissions,
    publicNote,
    removed,
    renamed,
    roster,
  });
}

export const flow: ProbeFlow = {
  name: "guildadmin-ranks",
  run,
  usage:
    "--flow guildadmin-ranks --arg name=<own character name>: in a staged guild as its leader, adds a rank, renames it, sets the public and officer notes of the character, sets the info text, asks for permissions and the event log, then removes the lowest rank.",
};
