import type { Json, ProbeFlow } from "#tools/probe-flows";

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

export const flow: ProbeFlow = {
  name: "guildadmin-roster",
  async run({ handle }) {
    const roster = await handle.requestGuildRoster();
    return json({ roster });
  },
  usage:
    "--flow guildadmin-roster: call requestGuildRoster(). On a guildless character it resolves undefined (command 5, result 9); in a staged guild it returns the roster with rank rights, gold per day and bank tab pairs, plus the guild name and emblem from the query response.",
};
