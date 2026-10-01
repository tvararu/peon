import type { WorldHandle } from "@peon/core";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const CAPITAL = "Silvermoon City";
const AT_WAR_FACTION = "Bloodsail Buccaneers";
const MODES = ["settings", "show", "restore"];

type Rows = ReturnType<WorldHandle["reputation"]["state"]>["factions"];

function rowNamed(rows: Rows, name: string) {
  const row = rows.find((entry) => entry.name === name);
  if (!row)
    throw new Error(
      `reputation-settings needs the faction "${name}" in the character's list (use a new blood elf).`,
    );
  return row;
}

function shown(handle: WorldHandle): Json {
  const { factions, watched } = handle.reputation.state();
  const pick = (name: string): Json => {
    const row = rowNamed(factions, name);
    return {
      atWar: row.atWar,
      inactive: row.inactive,
      name,
      repListId: row.repListId,
      visible: row.visible,
      watched: row.watched,
    };
  };
  return {
    factions: [pick(CAPITAL), pick(AT_WAR_FACTION)],
    watched: watched ?? null,
  };
}

async function run({ args, handle, settle }: FlowContext): Promise<Json> {
  const mode = args["do"] ?? "settings";
  if (!MODES.includes(mode))
    throw new Error(
      `reputation-settings needs do=<${MODES.join("|")}>, not "${mode}".`,
    );
  const ready = await settle(() =>
    handle.reputation.state().factions.length > 0 ? true : undefined,
  );
  if (!ready) throw new Error("reputation-settings: no faction list arrived.");
  const { factions } = handle.reputation.state();
  const capital = rowNamed(factions, CAPITAL).repListId;
  const war = rowNamed(factions, AT_WAR_FACTION).repListId;
  const acts = handle.reputation.act;
  const results: Json = {};
  if (mode === "settings") {
    results["setWatched"] = await acts.setWatched(capital);
    results["setInactive"] = acts.setInactive(capital, true);
    results["setAtWar"] = acts.setAtWar(war, false);
  } else if (mode === "restore") {
    results["setAtWar"] = acts.setAtWar(war, true);
    results["setInactive"] = acts.setInactive(capital, false);
    results["setWatched"] = await acts.setWatched(undefined);
  }
  return { after: shown(handle), mode, results };
}

export const flow: ProbeFlow = {
  name: "reputation-settings",
  run,
  usage: `--flow reputation-settings [--arg do=<${MODES.join("|")}>]: watch ${CAPITAL}, mark it inactive and clear war with ${AT_WAR_FACTION} (settings), undo all three (restore) or only print the two rows (show); pair it with a long --wait.`,
};
