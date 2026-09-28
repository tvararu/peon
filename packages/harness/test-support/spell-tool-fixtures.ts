import { jest } from "bun:test";
import type {
  CombatAura,
  CombatEvent,
  CombatEventType,
  CombatState,
  SpellDefinition,
} from "@peon/core";
import { spell } from "@peon/core/test-support/spell-fixtures";
import { createRefTable } from "#harness/ops/refs";
import {
  createTestRuntime,
  type MockHandle,
  type TestRuntime,
} from "#test-support/runtime-fixture";

export const SELF = 0x2an;
export const FROST_ARMOR = 168;
export const FIREBALL = 133;
export const HEARTHSTONE = 6948;
const MOUNTED_AURA = 78;
const PASSIVE = 0x40;

export type SpellInit = {
  id: number;
  name: string;
  rank?: string;
  castMs?: number;
  raw?: number;
  ex?: number;
  aura?: number;
};

export function definition(init: SpellInit): SpellDefinition {
  const base = spell();
  const [effect] = base.effects;
  return {
    ...base,
    attributes: { ex: init.ex ?? 0, ex2: 0, raw: init.raw ?? 0 },
    castTime: { castTimeMs: init.castMs ?? 0, id: 1 },
    effects: [
      {
        ...(effect as NonNullable<typeof effect>),
        applyAura: init.aura ?? 0,
        effect: init.aura === undefined ? 2 : 6,
      },
    ],
    id: init.id,
    name: init.name,
    rank: init.rank ?? "Rank 1",
  };
}

export const FROST_ARMOR_SPELL = definition({
  aura: 13,
  id: FROST_ARMOR,
  name: "Frost Armor",
});
export const FIREBALL_SPELL = definition({
  castMs: 3500,
  id: FIREBALL,
  name: "Fireball",
});

export function aura(over: Partial<CombatAura> = {}): CombatAura {
  return {
    caster: SELF,
    duration: 1_800_000,
    flags: 0x1b,
    level: 10,
    slot: 0,
    spellId: FROST_ARMOR,
    stacks: 0,
    timeLeft: 1_700_000,
    ...over,
  };
}

export function mountAura(): { aura: CombatAura; spell: SpellDefinition } {
  return {
    aura: aura({ slot: 1, spellId: 458 }),
    spell: definition({ aura: MOUNTED_AURA, id: 458, name: "Brown Horse" }),
  };
}

export function passiveSpell(id: number, name: string): SpellDefinition {
  return definition({ aura: 3, id, name, raw: PASSIVE });
}

export type SpellWorldInit = {
  book?: SpellDefinition[];
  auras?: CombatAura[];
  learned?: number[];
  inactive?: number[];
  definitions?: SpellDefinition[];
};

export type SpellWorld = TestRuntime & {
  auras: CombatAura[];
  state: () => CombatState;
};

export type SpellState = {
  auras: CombatAura[];
  state: () => CombatState;
};

export function installSpells(
  handle: MockHandle,
  init: SpellWorldInit = {},
): SpellState {
  const book = init.book ?? [FROST_ARMOR_SPELL, FIREBALL_SPELL];
  const known = new Map(
    [...book, ...(init.definitions ?? [])].map((def) => [def.id, def]),
  );
  const auras = init.auras ?? [];
  const learned = init.learned ?? book.map((def) => def.id);
  handle.getSpellbook = () => Promise.resolve(book);
  handle.spellDefinition = jest.fn((id: number) => known.get(id));
  const snapshot = handle.getCombatState();
  const state = (): CombatState => ({ ...snapshot, auras, learned });
  jest.spyOn(handle, "getCombatState").mockImplementation(state);
  const spellsState = handle.spells.state();
  jest.spyOn(handle.spells, "state").mockImplementation(() => ({
    ...spellsState,
    inactiveRanks: init.inactive ?? [],
  }));
  const control = handle.getControlState();
  jest
    .spyOn(handle, "getControlState")
    .mockImplementation(() => ({ ...control, selfGuid: SELF }));
  return { auras, state };
}

export async function spellWorld(
  init: SpellWorldInit = {},
): Promise<SpellWorld> {
  const t = await createTestRuntime({ parts: { refs: createRefTable() } });
  return { ...t, ...installSpells(t.handle, init) };
}

export function combatEvent(
  state: CombatState,
  type: CombatEventType,
  spellId: number,
  reason?: string,
): CombatEvent {
  const status = type === "cast_succeeded" ? "succeeded" : "failed";
  return {
    reason: reason && `${type}:${reason}`,
    state: {
      ...state,
      lastOutcome: {
        at: 0,
        kind: "cast",
        reason,
        spellId,
        status,
      },
    },
    type,
  };
}
