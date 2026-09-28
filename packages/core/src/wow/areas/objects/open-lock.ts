import { type LockEntry, LockKeyType } from "#wow/areas/objects/lock-catalog";
import type { SpellDefinition } from "#wow/spell-catalog";

export type OpenLockNeed = { skill: number; need: number };

export type OpenLockChoice =
  | { by: "spell"; spellId: number }
  | { by: "item"; entry: number }
  | ({ ok: false; reason: "locked" } & OpenLockNeed);

export type OpenLockInputs = {
  lock: LockEntry | undefined;
  spellbook: readonly SpellDefinition[];
  skillOf: (skill: number) => number;
  hasItem: (entry: number) => boolean;
};

const OPEN_LOCK_EFFECT = 33;

const SKILL_BY_LOCK_TYPE: ReadonlyMap<number, number> = new Map([
  [1, 633],
  [2, 182],
  [3, 186],
  [19, 356],
  [20, 773],
]);

function openSpell(
  spellbook: readonly SpellDefinition[],
): SpellDefinition | undefined {
  return spellbook.find((spell) =>
    spell.effects.some((effect) => effect.effect === OPEN_LOCK_EFFECT),
  );
}

function skillSpell(
  spellbook: readonly SpellDefinition[],
  index: number,
): SpellDefinition | undefined {
  return spellbook.find((spell) =>
    spell.effects.some(
      (effect) =>
        effect.effect === OPEN_LOCK_EFFECT && effect.miscValue === index,
    ),
  );
}

type Walk = {
  spellbook: readonly SpellDefinition[];
  skillOf: (skill: number) => number;
  hasItem: (entry: number) => boolean;
};

function stepCase(
  walk: Walk,
  lockCase: { type: number; index: number; skill: number },
  need: OpenLockNeed,
): { done: OpenLockChoice | undefined; need: OpenLockNeed; stop: boolean } {
  if (lockCase.type === LockKeyType.SPELL)
    return {
      done: { by: "spell", spellId: lockCase.index },
      need,
      stop: true,
    };
  if (lockCase.type === LockKeyType.ITEM) {
    if (walk.hasItem(lockCase.index))
      return {
        done: { by: "item", entry: lockCase.index },
        need,
        stop: true,
      };
    return { done: undefined, need: { skill: 0, need: 0 }, stop: false };
  }
  if (lockCase.type !== LockKeyType.SKILL)
    return { done: undefined, need, stop: true };
  const match = skillSpell(walk.spellbook, lockCase.index);
  const skill = SKILL_BY_LOCK_TYPE.get(lockCase.index);
  const short = skill !== undefined && walk.skillOf(skill) < lockCase.skill;
  if (!match || short)
    return {
      done: undefined,
      need: { skill: skill ?? 0, need: lockCase.skill },
      stop: false,
    };
  return { done: { by: "spell", spellId: match.id }, need, stop: true };
}

export function pickOpenLock(inputs: OpenLockInputs): OpenLockChoice {
  const { lock, spellbook, skillOf, hasItem } = inputs;
  if (lock === undefined) {
    const any = openSpell(spellbook);
    if (any) return { by: "spell", spellId: any.id };
    return { ok: false, reason: "locked", skill: 0, need: 0 };
  }
  const walk: Walk = { spellbook, skillOf, hasItem };
  let need: OpenLockNeed = { skill: 0, need: 0 };
  for (const lockCase of lock.cases) {
    if (lockCase.type === LockKeyType.NONE) continue;
    const step = stepCase(walk, lockCase, need);
    need = step.need;
    if (step.done) return step.done;
    if (step.stop) break;
  }
  return { ok: false, reason: "locked", ...need };
}
