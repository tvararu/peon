import type { WorldHandle } from "@peon/core";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const WAIT_MS = 15_000;
const POLL_MS = 100;

const hex = (guid: bigint | undefined) =>
  guid === undefined ? null : `0x${guid.toString(16)}`;

async function waitFor(ready: () => boolean, ms = WAIT_MS): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (!ready() && Date.now() < deadline) await Bun.sleep(POLL_MS);
  return ready();
}

type Names = { name: number; refused: number; unanswered: number };

function watchNames(handle: WorldHandle, counts: Names): () => void {
  return handle.pets.onEvent((event) => {
    if (event.type === "name") counts.name++;
    else if (event.type === "name_invalid") counts.refused++;
    else if (event.type === "unanswered") counts.unanswered++;
  });
}

function namesJson(handle: WorldHandle): Json {
  const { lastRefusal, names, pet } = handle.pets.state();
  return {
    names: Object.values(names).map(
      ({ declined, name, number, timestamp }) => ({
        declined: declined ? [...declined] : null,
        name,
        number,
        timestamp,
      }),
    ),
    pet: pet
      ? {
          canRename: pet.canRename,
          guid: hex(pet.guid),
          nameTimestamp: pet.nameTimestamp,
          number: pet.number,
        }
      : null,
    refusal: lastRefusal ? lastRefusal.reason : null,
  };
}

async function run({ args, handle }: FlowContext): Promise<Json> {
  const rename = args["rename"];
  if (!rename) throw new Error("pets-name needs --arg rename=<name>.");
  await handle.loadCatalogs().catch(ignoreFailure);
  const counts: Names = { name: 0, refused: 0, unanswered: 0 };
  const stop = watchNames(handle, counts);
  try {
    if (!handle.pets.state().bar) handle.pets.act.requestPetInfo();
    if (!(await waitFor(() => handle.pets.state().bar !== undefined)))
      throw new Error("no pet is out; call the pet first.");
    const pet = handle.pets.state().pet;
    if (!pet) throw new Error("no pet is out; call the pet first.");
    const before = namesJson(handle);
    const seen = { ...counts };
    const result = handle.pets.act.renamePet(rename);
    const answered = await waitFor(
      () =>
        counts.name > seen.name ||
        counts.refused > seen.refused ||
        counts.unanswered > seen.unanswered,
    );
    return {
      answered,
      before,
      counts,
      names: namesJson(handle),
      result,
    };
  } finally {
    stop();
  }
}

export const flow: ProbeFlow = {
  name: "pets-name",
  run,
  usage:
    "--flow pets-name --arg rename=<name>: rename the hunter pet and print the next name, name_invalid or unanswered event.",
};
