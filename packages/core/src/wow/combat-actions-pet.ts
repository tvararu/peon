import type { CombatState } from "#wow/combat";
import { hex } from "#wow/combat-actions-observation";
import { type EntityLookup, fieldOf, isUnit } from "#wow/entity-store";
import type { JevCandidate } from "#wow/jev";
import { UNIT_FIELDS } from "#wow/protocol/entity-fields";
import { joinGuid } from "#wow/protocol/packet";

const COMMAND_REPEAT_MS = 2000;

export type PetView = {
  guid: bigint;
  name: string | undefined;
  health: number;
  maxHealth: number;
  target: bigint | undefined;
};

export function petOf(
  entity: EntityLookup,
  selfGuid: bigint,
): PetView | undefined {
  const self = entity(selfGuid);
  const low = fieldOf(self, UNIT_FIELDS.SUMMON.offset);
  const high = fieldOf(self, UNIT_FIELDS.SUMMON.offset + 1);
  if (!(low || high)) return undefined;
  const guid = joinGuid(low ?? 0, high ?? 0);
  const pet = entity(guid);
  if (!isUnit(pet)) return undefined;
  const { name, health, maxHealth } = pet;
  const target = pet.target === 0n ? undefined : pet.target;
  return { guid, name, health, maxHealth, target };
}

export function hunterObservation(
  state: CombatState,
  entity: EntityLookup,
  targetGuid: bigint,
): Record<string, unknown> {
  const repeat = state.autoRepeat;
  return {
    autoRepeat: repeat ? { ...repeat, target: hex(repeat.target) } : null,
    pet: petObservation(petOf(entity, state.self.guid), targetGuid),
  };
}

function petObservation(
  pet: PetView | undefined,
  targetGuid: bigint,
): Record<string, unknown> | null {
  if (!pet) return null;
  return {
    guid: hex(pet.guid),
    name: pet.name,
    health: pet.health,
    maxHealth: pet.maxHealth,
    target: hex(pet.target) ?? null,
    onTarget: pet.target === targetGuid,
  };
}

export function petCandidate(
  pet: PetView | undefined,
  state: CombatState,
  now: number,
): JevCandidate | undefined {
  const target = state.target;
  if (!(pet && target) || pet.health <= 0 || target.health === 0)
    return undefined;
  if (pet.target === target.guid) return undefined;
  const command = state.petCommand;
  if (
    command?.pet === pet.guid &&
    command.target === target.guid &&
    now - command.at < COMMAND_REPEAT_MS
  )
    return undefined;
  return {
    id: "pet_attack",
    description:
      "Send your pet to attack the selected creature; send it first so the creature fights the pet while you shoot",
  };
}
