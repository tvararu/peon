import type { WorldHandle } from "@peon/core";
import {
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
  summary,
} from "#tools/probe-flows";

type Pois = ReturnType<WorldHandle["quests"]["state"]>["pois"];

function poiRows(state: Pois): Json[] {
  return [...state].map(([questId, { status, pois }]) => ({
    poiCount: pois.length,
    points: pois.flatMap((poi) => poi.points),
    questId,
    status,
  }));
}

async function run({ handle, settle }: FlowContext): Promise<Json> {
  const quests = handle.quests;
  quests.act.queryPoi([8325]);
  const settled = await settle(() => {
    const entry = quests.state().pois.get(8325);
    return entry && entry.status !== "pending" ? entry : undefined;
  });
  const row = others(handle).find((r) => r.entity.entry === 15_278);
  return {
    ender: row ? summary(row) : null,
    pois: poiRows(quests.state().pois),
    status: settled?.status ?? null,
  };
}

export const flow: ProbeFlow = {
  name: "quests-poi",
  run,
  usage:
    "--flow quests-poi: call queryPoi for the staged quest, wait for the POI reply, and print the settled POI state.",
};
