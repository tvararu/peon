import type { CombatlogWire } from "#wow/areas/combatlog/entries";
import type { PacketReader } from "#wow/protocol/packet";

export type ExecuteRecord = {
  guid: bigint;
  value: number;
  power?: number;
};

export type SpellExecuteEffect = {
  effect: number;
  records: ExecuteRecord[];
};

export type SpellExecute = {
  caster: bigint;
  spellId: number;
  effects: SpellExecuteEffect[];
  truncated: boolean;
};

type RecordReader = (r: PacketReader) => ExecuteRecord;

function readPower(r: PacketReader): ExecuteRecord {
  const guid = r.packedGuidBig();
  const value = r.uint32LE();
  const power = r.uint32LE();
  r.floatLE();
  return { guid, value, power };
}

function readGuidAndAmount(r: PacketReader): ExecuteRecord {
  const guid = r.packedGuidBig();
  const value = r.uint32LE();
  return { guid, value };
}

function readDurability(r: PacketReader): ExecuteRecord {
  const guid = r.packedGuidBig();
  const value = r.int32LE();
  r.int32LE();
  return { guid, value };
}

function readItemEntry(r: PacketReader): ExecuteRecord {
  return { guid: 0n, value: r.uint32LE() };
}

function readGuidOnly(r: PacketReader): ExecuteRecord {
  return { guid: r.packedGuidBig(), value: 0 };
}

const RECORD_READERS: Record<number, RecordReader> = {
  8: readPower,
  62: readPower,
  19: readGuidAndAmount,
  68: readGuidAndAmount,
  111: readDurability,
  24: readItemEntry,
  101: readItemEntry,
  18: readGuidOnly,
  113: readGuidOnly,
  33: readGuidOnly,
  28: readGuidOnly,
  50: readGuidOnly,
  76: readGuidOnly,
  83: readGuidOnly,
  102: readGuidOnly,
  104: readGuidOnly,
  105: readGuidOnly,
  106: readGuidOnly,
  107: readGuidOnly,
};

const HEADER_BYTES = 4;
const SMALLEST_RECORD = 4;
const SMALLEST_GUID_RECORD = 1;

export function parseSpellExecute(r: PacketReader): SpellExecute {
  const caster = r.packedGuidBig();
  const spellId = r.uint32LE();
  const effects: SpellExecute["effects"] = [];
  if (r.remaining < HEADER_BYTES)
    return { caster, spellId, effects, truncated: true };
  const effectCount = r.uint32LE();
  for (let i = 0; i < effectCount; i++) {
    if (r.remaining < HEADER_BYTES * 2)
      return { caster, spellId, effects, truncated: true };
    const effect = r.uint32LE();
    const targetCount = r.uint32LE();
    const read = RECORD_READERS[effect];
    const records: ExecuteRecord[] = [];
    effects.push({ effect, records });
    if (read === undefined)
      return { caster, spellId, effects, truncated: true };
    const smallest =
      read === readGuidOnly ? SMALLEST_GUID_RECORD : SMALLEST_RECORD;
    if (targetCount * smallest > r.remaining)
      return { caster, spellId, effects, truncated: true };
    try {
      for (let j = 0; j < targetCount; j++) records.push(read(r));
    } catch {
      return { caster, spellId, effects, truncated: true };
    }
  }
  return { caster, spellId, effects, truncated: false };
}

export function executeEntries(parsed: SpellExecute): CombatlogWire[] {
  return parsed.effects.flatMap((effect) =>
    effect.records.map((record) => ({
      kind: "execute",
      source: parsed.caster,
      target: record.guid,
      spellId: parsed.spellId,
      amount: record.value,
      ...(record.power === undefined ? {} : { power: record.power }),
      extra: effect.effect,
    })),
  );
}
