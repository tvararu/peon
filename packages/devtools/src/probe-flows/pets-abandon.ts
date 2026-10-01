import type { WorldHandle } from "@peon/core";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const CALL_PET = "Call Pet";
const DISMISS_PET = "Dismiss Pet";
const WAIT_MS = 15_000;
const POLL_MS = 100;

const hex = (guid: bigint) => `0x${guid.toString(16)}`;

async function waitFor(ready: () => boolean, ms = WAIT_MS): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (!ready() && Date.now() < deadline) await Bun.sleep(POLL_MS);
  return ready();
}

function selfGuid(handle: WorldHandle): bigint {
  const self = handle.queryNearby().find((row) => row.self);
  if (!self) throw new Error("the character is not in view.");
  return self.entity.guid;
}

async function castByName(handle: WorldHandle, name: string): Promise<number> {
  const spell = (await handle.getSpellbook()).find((row) => row.name === name);
  if (!spell) throw new Error(`the spellbook has no ${name}.`);
  handle.cast(spell.id, selfGuid(handle));
  return spell.id;
}

async function run({ handle, settle }: FlowContext): Promise<Json> {
  await handle.loadCatalogs().catch(ignoreFailure);
  const bars = { cleared: 0, shown: 0 };
  const failures: { code: number; reason: string }[] = [];
  const off = handle.pets.onEvent((event) => {
    if (event.type === "bar") {
      if (event.cleared) bars.cleared++;
      else bars.shown++;
    } else if (event.type === "tame_failed") {
      failures.push({ code: event.code, reason: event.reason });
    }
  });
  try {
    await settle(() => (bars.shown > 0 ? true : undefined));
    if (!(await waitFor(() => bars.shown > 0)))
      throw new Error("no pet bar arrived; stage a hunter with a pet out.");
    const { bar, lastRefusal } = handle.pets.state();
    if (!bar) throw new Error("the pet bar vanished before the abandon.");
    const guid = bar.guid;
    const dismissed = await (async () => {
      try {
        return await castByName(handle, DISMISS_PET);
      } catch {
        return null;
      }
    })();
    const abandoned = handle.pets.act.abandonPet();
    const cleared = await waitFor(() => bars.cleared > 0);
    const called = await castByName(handle, CALL_PET);
    const failed = await waitFor(() => failures.length > 0);
    return {
      abandoned,
      bars: { cleared: bars.cleared, shown: bars.shown },
      called,
      cleared,
      dismissed,
      failed,
      failures,
      lastRefusal: lastRefusal ? lastRefusal.reason : null,
      pet: hex(guid),
    };
  } finally {
    off();
  }
}

export const flow: ProbeFlow = {
  name: "pets-abandon",
  run,
  usage:
    "--flow pets-abandon: wait for the pet bar, abandon the pet, then cast Call Pet and print the SMSG_PET_TAME_FAILURE the server sends.",
};
