import type { WorldHandle } from "@peon/core";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const CALL_PET = "Call Pet";
const DISMISS_PET = "Dismiss Pet";
const WAIT_MS = 15_000;
const POLL_MS = 100;

type Bars = { shown: number; cleared: number };

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

function stateJson(handle: WorldHandle): Json {
  const { bar, cooldowns, pet } = handle.pets.state();
  return {
    bar: bar
      ? {
          command: bar.command,
          durationMs: bar.durationMs,
          family: bar.family,
          flags: bar.flags,
          guid: hex(bar.guid),
          react: bar.react,
          slots: bar.slots.map(({ action, type }) => ({ action, type })),
          spells: bar.spells.map(({ autocast, spell }) => ({
            autocast,
            spell,
          })),
        }
      : null,
    cooldowns: cooldowns.map(({ category, infinite, spell }) => ({
      category,
      infinite,
      spell,
    })),
    pet: pet
      ? {
          canAbandon: pet.canAbandon,
          canRename: pet.canRename,
          guid: hex(pet.guid),
          happiness: pet.happiness,
          nameTimestamp: pet.nameTimestamp,
          number: pet.number,
        }
      : null,
  };
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const bars: Bars = { cleared: 0, shown: 0 };
  const off = handle.pets.onEvent((event) => {
    if (event.type !== "bar") return;
    if (event.cleared) bars.cleared++;
    else bars.shown++;
  });
  try {
    await handle.loadCatalogs().catch(ignoreFailure);
    const out = await settle(() => (bars.shown > 0 ? true : undefined));
    const called = out ? null : await castByName(handle, CALL_PET);
    if (!(await waitFor(() => bars.shown > 0)))
      throw new Error("no pet bar arrived.");
    const before = bars.shown;
    handle.pets.act.requestPetInfo();
    const replied = await waitFor(() => bars.shown > before);
    const dismiss = args["dismiss"] === "1";
    const dismissed = dismiss ? await castByName(handle, DISMISS_PET) : null;
    const cleared = dismiss ? await waitFor(() => bars.cleared > 0) : null;
    return {
      bars: { cleared: bars.cleared, shown: bars.shown },
      called,
      cleared,
      dismissed,
      replied,
      state: stateJson(handle),
    };
  } finally {
    off();
  }
}

export const flow: ProbeFlow = {
  name: "pets-bar",
  run,
  usage:
    "--flow pets-bar [--arg dismiss=1]: wait for the pet bar, cast Call Pet when none arrives, ask for the bar again with CMSG_REQUEST_PET_INFO and print the pets state; dismiss=1 then casts Dismiss Pet and waits for the cleared bar.",
};
