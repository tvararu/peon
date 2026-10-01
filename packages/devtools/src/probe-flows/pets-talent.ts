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

async function run({ args, handle, settle }: FlowContext): Promise<Json> {
  const talent = Number(args["talent"]);
  const rank = Number(args["rank"] ?? "0");
  if (!Number.isInteger(talent) || talent <= 0)
    throw new Error("pets-talent needs --arg talent=<id> [--arg rank=0].");
  if (!Number.isInteger(rank) || rank < 0)
    throw new Error("pets-talent needs --arg rank=<non-negative>.");
  await handle.loadCatalogs().catch(ignoreFailure);
  let petInfo = 0;
  let lastFree = -1;
  const stop = handle.talents.onEvent((event) => {
    if (event.type === "pet_info") {
      petInfo++;
      lastFree = event.freePoints;
    }
  });
  try {
    await settle(() => (handle.pets.state().bar ? true : undefined));
    if (!handle.pets.state().bar)
      throw new Error("no pet is out; call the pet first.");
    const seen = petInfo;
    const result = handle.pets.act.learnPetTalent(talent, rank);
    if (!result.ok) return { learned: null, result };
    const confirmed = await waitFor(() => petInfo > seen);
    return {
      confirmed,
      freePoints: lastFree,
      pet: hex(handle.pets.state().bar?.guid),
      result,
      talent,
    };
  } finally {
    stop();
  }
}

export const flow: ProbeFlow = {
  name: "pets-talent",
  run,
  usage:
    "--flow pets-talent --arg talent=<id> [--arg rank=0]: learn one pet talent and print whether the talents area's pet_info event confirmed it.",
};
