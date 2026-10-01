import { joinGuid, UNIT_FIELDS, type WorldHandle } from "@peon/core";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const CALL_PET = "Call Pet";
const SQUIRREL_BOX = 4401;
const SQUIRREL_SPELL = "Mechanical Squirrel";
const USABLE_REGIONS: Record<string, true> = { backpack: true, bag_item: true };
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

function critterOf(handle: WorldHandle): bigint {
  const fields = handle.queryNearby().find((row) => row.self)?.entity.rawFields;
  return joinGuid(
    fields?.get(UNIT_FIELDS.CRITTER.offset) ?? 0,
    fields?.get(UNIT_FIELDS.CRITTER.offset + 1) ?? 0,
  );
}

async function spellByName(handle: WorldHandle, name: string) {
  const spell = (await handle.getSpellbook()).find((row) => row.name === name);
  if (!spell) throw new Error(`the spellbook has no ${name}.`);
  return spell;
}
function squirrelBox(handle: WorldHandle) {
  return handle
    .getInventoryState()
    .slots.find(
      (slot) =>
        slot.status === "occupied" &&
        USABLE_REGIONS[slot.region] === true &&
        slot.item.entry === SQUIRREL_BOX,
    );
}

async function companionLeg(
  handle: WorldHandle,
  settle: FlowContext["settle"],
): Promise<Json> {
  const box = await settle(() => squirrelBox(handle));
  if (!box) throw new Error("the Mechanical Squirrel Box is not in the bags.");
  const used = (await handle.useItem(box.bag, box.slot)) ?? null;
  const learnedAt = Date.now() + 20_000;
  while (
    !(await handle.getSpellbook()).some((row) => row.name === SQUIRREL_SPELL) &&
    Date.now() < learnedAt
  )
    await Bun.sleep(POLL_MS);
  const spell = await settle(async () =>
    (await handle.getSpellbook()).find((row) => row.name === SQUIRREL_SPELL),
  );
  if (!spell) throw new Error(`the spellbook never learned ${SQUIRREL_SPELL}.`);
  handle.cast(spell.id, selfGuid(handle));
  const out = await waitFor(() => critterOf(handle) !== 0n);
  const critter = critterOf(handle);
  const dismissed = handle.pets.act.dismissCritter();
  const gone = await waitFor(() => critterOf(handle) === 0n);
  return {
    critter: hex(critter),
    dismissed: dismissed.ok ? "sent" : dismissed.reason,
    gone,
    out,
    spell: spell.id,
    used,
  };
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
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
    await waitFor(() => handle.pets.state().pet !== undefined);
    const { bar } = handle.pets.state();
    if (!bar) throw new Error("no pet bar arrived; stage a hunter with a pet.");
    const abandoned = handle.pets.act.abandonPet();
    const cleared = await waitFor(() => bars.cleared > 0);
    const call = await spellByName(handle, CALL_PET);
    handle.cast(call.id, selfGuid(handle));
    const failed = await waitFor(() => failures.length > 0);
    const companion =
      args["companion"] === "1" ? await companionLeg(handle, settle) : null;
    return {
      abandoned,
      called: call.id,
      cleared,
      companion,
      failed,
      failures,
      lastRefusal: handle.pets.state().lastRefusal?.reason ?? null,
      pet: hex(bar.guid),
    };
  } finally {
    off();
  }
}

export const flow: ProbeFlow = {
  name: "pets-abandon",
  run,
  usage:
    "--flow pets-abandon [--arg companion=1]: wait for the pet bar, abandon the pet, cast Call Pet and print the SMSG_PET_TAME_FAILURE the server sends; with companion=1 also use the staged Mechanical Squirrel Box (4401), summon the critter and dismiss it.",
};
