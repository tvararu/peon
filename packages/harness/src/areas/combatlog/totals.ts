import type { AreaState } from "@peon/core";

type Entry = AreaState<"combatlog">["entries"][number];

export type Sums = {
  dealt: number;
  taken: number;
  healed: number;
  avoided: Record<string, number>;
  immune: number[];
  immuneCount: number;
};

export type FightFigures = {
  dealt: number;
  taken: number;
  healed: number;
  misses: Readonly<Record<string, number>>;
};

const DAMAGE = new Set<Entry["kind"]>([
  "melee",
  "spell_damage",
  "periodic_damage",
  "damage_shield",
  "environmental",
  "instakill",
]);
const HEALS = new Set<Entry["kind"]>(["heal", "periodic_heal"]);
const AVOIDED = new Set([
  "miss",
  "dodge",
  "parry",
  "block",
  "evade",
  "deflect",
]);
const IMMUNE_OUTCOMES = new Set(["immune", "immune2"]);

export const isDamage = (kind: Entry["kind"]): boolean => DAMAGE.has(kind);

const HIGH = 0x1_00_00_00_00_00_00n;
const ENTRY_UNIT = 0x1_00_00_00n;
const CREATURE_HIGHS = new Set([0xf1_30, 0xf1_50]);

export function creatureEntry(guid: bigint): number | undefined {
  if (!CREATURE_HIGHS.has(Number(BigInt.asUintN(16, guid / HIGH))))
    return undefined;
  return Number(BigInt.asUintN(24, guid / ENTRY_UNIT));
}

function isImmune(entry: Row): boolean {
  if (entry.kind === "immune") return true;
  return entry.kind === "miss" && IMMUNE_OUTCOMES.has(entry.outcome ?? "");
}

type Own = (guid: bigint) => boolean;

type Row = Pick<Entry, "kind" | "source" | "target" | "amount"> &
  Partial<Pick<Entry, "outcome" | "spellId">>;

function noteAmounts(sums: Sums, entry: Row, self: bigint, ours: Own): void {
  if (DAMAGE.has(entry.kind)) {
    if (ours(entry.source) && !ours(entry.target)) sums.dealt += entry.amount;
    if (entry.target === self) sums.taken += entry.amount;
  }
  if (HEALS.has(entry.kind) && entry.target === self)
    sums.healed += entry.amount;
}

function noteOwnCasts(sums: Sums, entry: Row): void {
  const outcome = entry.outcome ?? "";
  if (AVOIDED.has(outcome))
    sums.avoided[outcome] = (sums.avoided[outcome] ?? 0) + 1;
  const spellId = entry.spellId ?? 0;
  if (!(isImmune(entry) && spellId > 0)) return;
  sums.immuneCount++;
  if (!sums.immune.includes(spellId)) sums.immune.push(spellId);
}

export function newSums(): Sums {
  return {
    avoided: {},
    dealt: 0,
    healed: 0,
    immune: [],
    immuneCount: 0,
    taken: 0,
  };
}

export function noteEntry(
  sums: Sums,
  entry: Row,
  self: bigint,
  ours: Own,
): void {
  noteAmounts(sums, entry, self, ours);
  if (ours(entry.source)) noteOwnCasts(sums, entry);
}

function plural(word: string, count: number): string {
  if (count === 1) return word;
  return word.endsWith("s") ? `${word}es` : `${word}s`;
}

export function missText(misses: Readonly<Record<string, number>>): string {
  return Object.entries(misses)
    .map(([word, count]) => `${count} ${plural(word, count)}`)
    .join(", ");
}

export function fightText(figures: FightFigures): string {
  const { dealt, healed, misses, taken } = figures;
  const healing = healed > 0 ? `, healed ${healed}` : "";
  const missed = missText(misses);
  const tail = missed === "" ? "" : ` (${missed})`;
  return `Fight over: dealt ${dealt}, took ${taken}${healing}${tail}.`;
}
