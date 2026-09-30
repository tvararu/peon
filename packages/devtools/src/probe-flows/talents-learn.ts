import type { WorldHandle } from "@peon/core";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

type Plan = Parameters<WorldHandle["talents"]["act"]["learnTalents"]>[0];
type LearnResult = Awaited<
  ReturnType<WorldHandle["talents"]["act"]["learnTalents"]>
>;

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

function entriesOf(args: Readonly<Record<string, string>>): Plan {
  const raw = args["plan"];
  if (!raw)
    throw new Error("talents-learn needs plan=<talentId>:<rank>[,...].");
  return raw.split(",").map((part) => {
    const [id, rank] = part.split(":").map(Number);
    if (
      id === undefined ||
      rank === undefined ||
      !(Number.isInteger(id) && Number.isInteger(rank)) ||
      rank < 0
    )
      throw new Error(
        `talents-learn needs plan=<talentId>:<rank>, not "${raw}".`,
      );
    return { rank, talentId: id };
  });
}

function stateOf(handle: WorldHandle): Json {
  const state = handle.talents.state();
  return json({
    freePoints: state.player?.freePoints,
    held: (state.player?.specs[state.player.activeSpec]?.talents ?? []).map(
      (talent) => ({
        rank: talent.rank,
        talentId: talent.talentId,
      }),
    ),
  });
}

async function run(ctx: FlowContext): Promise<Json> {
  const { args, handle } = ctx;
  const before = stateOf(handle);
  const plan = entriesOf(args);
  let result: LearnResult;
  try {
    result = await handle.talents.act.learnTalents(plan);
  } catch (error) {
    return json({
      after: stateOf(handle),
      before,
      thrown: error instanceof Error ? error.message : String(error),
    });
  }
  return json({ after: stateOf(handle), before, plan, result });
}

export const flow: ProbeFlow = {
  name: "talents-learn",
  run,
  usage:
    "--flow talents-learn --arg plan=<talentId>:<rank>[,...] (0-based ranks): run the talents learn act with that plan and print the result with the talent state after the reply.",
};
