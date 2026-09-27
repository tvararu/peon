import type { CombatAura } from "#wow/aura-store";
import type { CombatAutoRepeat } from "#wow/combat-auto-repeat";
import type { CombatCooldown } from "#wow/cooldown-store";
import type { CombatPose, UnitMotion } from "#wow/motion-store";
import type { AttackSwingError } from "#wow/protocol/combat";
import type { LevelUpInfo } from "#wow/protocol/experience";

export type CombatItem = {
  entry: number;
  bag: number;
  slot: number;
  guid: bigint;
};

export type CombatCast = {
  spellId: number;
  target: bigint | undefined;
  startedAt: number;
  durationMs: number;
  source: "server" | "pending";
  count: number;
  cancelRequested?: boolean;
  item?: CombatItem;
};

export type CombatOutcome = {
  kind: "cast" | "attack" | "cancel";
  status: "sent" | "started" | "succeeded" | "failed" | "interrupted";
  spellId?: number;
  target?: bigint;
  result?: number;
  reason?: string;
  error?: AttackSwingError;
  at: number;
  hits?: bigint[];
  misses?: { guid: bigint; reason: number; reflect?: number }[];
  item?: CombatItem;
  inventoryResult?: number;
};

export type CombatPetCommand = { pet: bigint; target: bigint; at: number };

export type CombatXp = {
  victim: bigint;
  total: number;
  kind: "kill" | "other";
  at: number;
};

export type CombatUnit = {
  guid: bigint;
  name: string | undefined;
  health: number | undefined;
  maxHealth: number | undefined;
  power: number | undefined;
  maxPower: number | undefined;
  powerType: number | undefined;
  baseMana: number | undefined;
  level: number | undefined;
  shapeshiftForm?: number;
  pose: CombatPose | undefined;
  serverPose: CombatPose | undefined;
  motion: UnitMotion | undefined;
};

export type CombatState = {
  self: CombatUnit;
  target: CombatUnit | undefined;
  selectedGuid: bigint | undefined;
  attacking: boolean;
  pendingAttack: bigint | undefined;
  attackTarget: bigint | undefined;
  casting: CombatCast | undefined;
  pendingCast: CombatCast | undefined;
  autoRepeat: CombatAutoRepeat | undefined;
  petCommand: CombatPetCommand | undefined;
  learned: number[];
  unknownLearned: number[];
  cooldowns: CombatCooldown[];
  auras: CombatAura[];
  targetAuras: CombatAura[];
  lastOutcome: CombatOutcome | undefined;
  lastXp: CombatXp | undefined;
  lastLevelUp: (LevelUpInfo & { at: number }) | undefined;
  attackers: bigint[];
};

export type CombatEventType =
  | "spellbook"
  | "cast_sent"
  | "cast_started"
  | "cast_succeeded"
  | "cast_failed"
  | "cast_interrupted"
  | "attack_started"
  | "attack_stopped"
  | "attacked"
  | "aura"
  | "xp"
  | "level_up"
  | "learned"
  | "outcome";

export type CombatEvent = {
  type: CombatEventType;
  state: CombatState;
  reason?: string;
  spellName?: string;
  attacker?: bigint;
};
