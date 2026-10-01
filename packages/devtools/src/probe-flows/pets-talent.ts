import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const WAIT_MS = 15_000;
const POLL_MS = 100;

async function waitFor(ready: () => boolean, ms = WAIT_MS): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (!ready() && Date.now() < deadline) await Bun.sleep(POLL_MS);
  return ready();
}

const hex = (guid: bigint | undefined) =>
  guid === undefined ? null : `0x${guid.toString(16)}`;

type Pick = { talent: number; rank: number };

function parsePicks(args: Record<string, string>): Pick[] | undefined {
  const list = args["talents"];
  if (list === undefined) return undefined;
  const picks = list.split(",").map((entry) => {
    const [id, rank = "0"] = entry.split(":");
    return { rank: Number(rank), talent: Number(id) };
  });
  const valid = picks.every(
    (pick) =>
      Number.isInteger(pick.talent) &&
      pick.talent > 0 &&
      Number.isInteger(pick.rank) &&
      pick.rank >= 0,
  );
  if (!valid)
    throw new Error("pets-talent needs --arg talents=<id>[:rank],<id>[:rank].");
  return picks;
}

function parseSingle(args: Record<string, string>): Pick {
  const talent = Number(args["talent"]);
  const rank = Number(args["rank"] ?? "0");
  if (!Number.isInteger(talent) || talent <= 0)
    throw new Error("pets-talent needs --arg talent=<id> [--arg rank=0].");
  if (!Number.isInteger(rank) || rank < 0)
    throw new Error("pets-talent needs --arg rank=<non-negative>.");
  return { rank, talent };
}

async function run({ args, handle, settle }: FlowContext): Promise<Json> {
  const preview = parsePicks(args);
  const picks = preview ?? [parseSingle(args)];
  await handle.loadCatalogs().catch(ignoreFailure);
  let arrivals = 0;
  let lastFree = -1;
  let last: { talentId: number; rank: number }[] = [];
  const stop = handle.talents.onEvent((event) => {
    if (event.type !== "pet_info") return;
    arrivals++;
    lastFree = event.freePoints;
    last = event.talents;
  });
  try {
    await settle(() => (handle.pets.state().bar ? true : undefined));
    if (!handle.pets.state().bar)
      throw new Error("no pet is out; call the pet first.");
    const seen = arrivals;
    const first = picks[0];
    const result = preview
      ? handle.pets.act.learnPetTalents(preview)
      : handle.pets.act.learnPetTalent(first?.talent ?? 0, first?.rank ?? 0);
    if (!result.ok) return { learned: null, result };
    const arrived = await waitFor(() => arrivals > seen);
    const confirmed =
      arrived &&
      picks.every((pick) =>
        last.some(
          (entry) => entry.talentId === pick.talent && entry.rank >= pick.rank,
        ),
      );
    return {
      confirmed,
      freePoints: lastFree,
      pet: hex(handle.pets.state().bar?.guid),
      picks,
      result,
      ...(preview ? {} : { talent: first?.talent }),
    };
  } finally {
    stop();
  }
}

export const flow: ProbeFlow = {
  name: "pets-talent",
  run,
  usage:
    "--flow pets-talent --arg talent=<id> [--arg rank=0] | --arg talents=<id>[:rank],...: learn one pet talent, or preview several at once, and print whether the talents area's pet_info event confirmed it.",
};
