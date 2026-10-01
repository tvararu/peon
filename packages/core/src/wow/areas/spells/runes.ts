import type { SpellRuneState } from "#wow/protocol/spell";
import { PLAYER_FIELDS, UNIT_FIELDS } from "#wow/protocol/update-fields";

export const RUNE_SLOTS = 6;
export const RUNE_BASE_TYPES = [0, 0, 1, 1, 2, 2] as const;
export const DEATH_KNIGHT_CLASS = 6;

export type Rune = {
  readonly index: number;
  readonly type: number;
  readonly ready: boolean;
  readonly cooldown: number | undefined;
  readonly regen: number | undefined;
};

export type RuneConverted = {
  type: "rune_converted";
  index: number;
  from: number;
  to: number;
};

export type RuneEvent = RuneConverted;

const RUNE_REGEN_SLOTS = 4;

function uint32ToFloat(value: number): number {
  const bits = new DataView(new ArrayBuffer(4));
  bits.setUint32(0, value >>> 0, true);
  return bits.getFloat32(0, true);
}

function classOf(raw: ReadonlyMap<number, number> | undefined): number {
  return ((raw?.get(UNIT_FIELDS.BYTES_0.offset) ?? 0) >> 8) & 0xff;
}

function regensOf(raw: ReadonlyMap<number, number>): (number | undefined)[] {
  return Array.from({ length: RUNE_REGEN_SLOTS }, (_, slot) => {
    const word = raw.get(PLAYER_FIELDS.RUNE_REGEN_1.offset + slot);
    return word === undefined ? undefined : uint32ToFloat(word);
  });
}

function spentBytes(
  state: SpellRuneState,
  previous: ReadonlyMap<number, number>,
): { fresh: Map<number, number>; kept: Map<number, number> } {
  const fresh = new Map<number, number>();
  const kept = new Map<number, number>();
  let order = 0;
  for (let slot = 0; slot < RUNE_SLOTS; slot++) {
    const bit = 1 << slot;
    if (bit & state.after) continue;
    if (bit & state.initial) {
      const byte = state.cooldowns[order] ?? 0;
      order += 1;
      fresh.set(slot, byte);
      kept.set(slot, byte);
      continue;
    }
    const byte = previous.get(slot);
    if (byte !== undefined) kept.set(slot, byte);
  }
  return { fresh, kept };
}

export class Runes {
  private types: readonly number[] | undefined;
  private readyMask: number | undefined;
  private spentBytes = new Map<number, number>();

  private created(raw: ReadonlyMap<number, number> | undefined): boolean {
    return classOf(raw) === DEATH_KNIGHT_CLASS;
  }

  read(
    raw: ReadonlyMap<number, number> | undefined,
    state?: SpellRuneState,
  ): readonly Rune[] | undefined {
    if (!this.created(raw)) {
      this.types = undefined;
      this.readyMask = undefined;
      this.spentBytes = new Map();
      return undefined;
    }
    const current = this.types ?? [...RUNE_BASE_TYPES];
    const mask = state?.initial ?? this.readyMask ?? 0x3f;
    const elapsed = new Map<number, number>();
    if (state) {
      const spent = spentBytes(state, this.spentBytes);
      for (const [slot, byte] of spent.fresh) elapsed.set(slot, byte);
      this.readyMask = state.after;
      this.spentBytes = spent.kept;
    }
    const regens = raw ? regensOf(raw) : [];
    this.types = current;
    return current.map((type, index) => {
      const bit = 1 << index;
      const ready = (mask & bit) !== 0;
      return {
        cooldown:
          elapsed.get(index) ??
          (ready ? undefined : this.spentBytes.get(index)),
        index,
        ready,
        regen: regens[type],
        type,
      };
    });
  }

  convert(
    raw: ReadonlyMap<number, number> | undefined,
    index: number,
    type: number,
  ): RuneConverted | undefined {
    if (!this.created(raw)) return undefined;
    const current = this.types ?? [...RUNE_BASE_TYPES];
    const from = current[index] ?? 0;
    this.types = current.map((entry, slot) => (slot === index ? type : entry));
    return { from, index, to: type, type: "rune_converted" };
  }

  clear(): void {
    this.types = undefined;
    this.readyMask = undefined;
    this.spentBytes = new Map();
  }
}
