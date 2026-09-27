import type { NearbyRow, SpellDefinition } from "@peon/core";
import { slotLabel } from "#harness/drive/keys";
import type {
  Frozen,
  WorldActuators,
  WorldReads,
} from "#harness/world/service";

export type PlayWorld = { reads: WorldReads; act: WorldActuators };
export type Done = { text: string; action?: string; target?: string };

const ENEMY = 6;
const ALLY = 21;

type Row = Frozen<NearbyRow>;

function alive(row: Row): boolean {
  const { entity } = row;
  return !("health" in entity) || entity.health > 0;
}

export function nameOf(row: Row): string {
  return row.entity.name ?? "an unnamed unit";
}

export function hostiles(rows: readonly Row[]): Row[] {
  return rows
    .filter(
      (row) =>
        !row.self &&
        row.attackable &&
        row.relation === "hostile" &&
        row.distance !== null &&
        alive(row),
    )
    .toSorted((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
}

export function nextHostile(
  rows: readonly Row[],
  current: bigint | undefined,
): Row | undefined {
  const sorted = hostiles(rows);
  const at = sorted.findIndex((row) => row.entity.guid === current);
  return sorted[(at + 1) % Math.max(sorted.length, 1)];
}

export async function targetNext(
  world: PlayWorld,
  current: bigint | undefined,
): Promise<Done> {
  const row = nextHostile(world.reads.queryNearby(), current);
  if (!row) return { text: "No living hostile in view." };
  await world.act.selectTarget(row.entity.guid);
  const name = nameOf(row);
  return { target: name, text: `Target: ${name}.` };
}

function spellTarget(
  spell: Frozen<SpellDefinition> | undefined,
  self: bigint,
  target: bigint | undefined,
): bigint | undefined {
  const aims = (id: number) =>
    spell?.effects.some(
      (effect) =>
        effect.implicitTargetA === id || effect.implicitTargetB === id,
    ) ?? false;
  if (!spell || aims(ENEMY)) return target;
  if (aims(ALLY)) return target ?? self;
  return self;
}

export function spellLabel(id: number, name: string | undefined): string {
  return name
    ? `${name} (spell ${id}; name from the game files)`
    : `spell ${id}`;
}

async function castSpell(
  world: PlayWorld,
  id: number,
  target: bigint | undefined,
): Promise<Done> {
  const spell = world.reads.spellDefinition(id);
  const name = spellLabel(id, spell?.name);
  const self = world.reads.getControlState().selfGuid;
  const aim = spellTarget(spell, self, target);
  if (aim === undefined) return { text: `${name} needs a target.` };
  if (aim !== self) await world.act.faceGuid(aim);
  await world.act.cast(id, aim);
  return { action: `cast ${name}`, text: `Cast sent: ${name}.` };
}

async function useItem(world: PlayWorld, entry: number): Promise<Done> {
  const found = world.reads
    .getInventoryState()
    .slots.find(
      (slot) => slot.status === "occupied" && slot.item.entry === entry,
    );
  if (found?.status !== "occupied")
    return { text: `The bags hold no item ${entry}.` };
  const name = found.item.name ?? `item ${entry}`;
  await world.act.useItem(found.bag, found.slot);
  return { action: `used ${name}`, text: `Used ${name}.` };
}

export function useSlot(
  world: PlayWorld,
  slot: number,
  target: bigint | undefined,
): Promise<Done> {
  const key = slotLabel(slot);
  const button = world.reads.getActionBar().find((b) => b.slot === slot);
  if (!button)
    return Promise.resolve({ text: `Action bar slot ${key} is empty.` });
  if (button.type === "spell") return castSpell(world, button.id, target);
  if (button.type === "item") return useItem(world, button.id);
  return Promise.resolve({
    text: `Slot ${key} holds a ${button.type.replace("_", " ")}; PLAY cannot run it.`,
  });
}

export async function interact(
  world: PlayWorld,
  target: bigint | undefined,
): Promise<Done> {
  const row = world.reads
    .queryNearby()
    .find((candidate) => candidate.entity.guid === target);
  if (!row) return { text: "No target in view to interact with." };
  const name = nameOf(row);
  if (row.lootable) {
    await world.act.openLoot(row.entity.guid);
    return { action: `opened loot on ${name}`, text: `Looting ${name}.` };
  }
  if (row.roles.length > 0) {
    await world.act.talk(row.entity.guid);
    return { action: `talked to ${name}`, text: `Talking to ${name}.` };
  }
  return { text: `${name} has nothing to talk about or loot.` };
}
