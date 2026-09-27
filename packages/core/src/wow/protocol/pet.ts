import { PacketWriter } from "#wow/protocol/packet";

const ACT_COMMAND = 0x07;
const COMMAND_ATTACK = 2;
export const PET_ATTACK_ACTION = (ACT_COMMAND << 24) | COMMAND_ATTACK;

export function buildPetAttack(pet: bigint, target: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(pet);
  w.uint32LE(PET_ATTACK_ACTION);
  w.uint64LE(target);
  return w.finish();
}
