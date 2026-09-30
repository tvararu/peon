import type { FactionRelation, NpcRole, PlayerLife } from "@peon/core";
import type { RunKind } from "#harness/contract/runs";
import type { GameCapabilities } from "#harness/loops/game";

export type Compass = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

export type PoseView = {
  mapId: number;
  x: number;
  y: number;
  z: number;
  facing: Compass;
  source: "server" | "predicted";
  ageMs: number;
  serverFixAgeMs: number | undefined;
};

export type PowerKind =
  | "mana"
  | "rage"
  | "energy"
  | "focus"
  | "runic_power"
  | "none";

export type VitalsView = {
  hp: number;
  maxHp: number;
  power: number;
  maxPower: number;
  powerKind: PowerKind;
  comboPoints?: number;
};

export type Posture = "sitting" | "kneeling" | "sleeping";

export type SelfView = VitalsView & {
  name: string;
  guid: string;
  level: number;
  className: string;
  race: string;
  life: PlayerLife;
  inCombat: boolean;
  xpPct: number | undefined;
  copper: number | undefined;
  freeSlots: number | undefined;
  pose: PoseView | undefined;
  posture?: Posture | undefined;
};

export type PlaceView = {
  zone: string | undefined;
  area: string | undefined;
  zoneId: number | undefined;
  areaId: number | undefined;
  ageMs: number | undefined;
};

export type QuestMark =
  | "available"
  | "available_low"
  | "available_repeatable"
  | "reward"
  | "incomplete";

export type UnitView = {
  ref: string;
  guid: string;
  entry: number;
  name: string;
  kind: "creature" | "player";
  level: number;
  relation: FactionRelation;
  attackable: boolean;
  attackingMe: boolean;
  targetsMe: boolean;
  roles: NpcRole[];
  alive: boolean;
  hp: number;
  maxHp: number;
  hpPct: number;
  lootable: boolean;
  tappedByOther: boolean;
  distance: number | undefined;
  compass: Compass | undefined;
  x: number | undefined;
  y: number | undefined;
  z: number | undefined;
  seenAgoMs: number;
  inView: boolean;
  fightingMe?: boolean;
  aggro?: string;
  myThreatPct?: number;
  questMark?: QuestMark;
  movement?: {
    rooted: boolean;
    slowedPct: number | undefined;
    swimming: boolean;
    flying: boolean;
    hover: boolean;
  };
};

export type NearestKind =
  | "hostile"
  | "attackable"
  | "questgiver"
  | "vendor"
  | "trainer"
  | "repair"
  | "innkeeper"
  | "lootable"
  | "player"
  | "spirit_healer";

export type AttackerView = {
  ref: string;
  guid: string;
  name: string;
  distance: number | undefined;
  hitAgoMs: number | undefined;
};

export type DangerView = { attackers: AttackerView[]; hpPct: number };

export type CastView = { spell: string; elapsedMs: number; totalMs: number };

export type AuraView = {
  spellId: number;
  name: string;
  remainingMs: number | undefined;
  mine: boolean;
};

export type RunView = {
  id: string;
  kind: RunKind;
  label: string;
  elapsedMs: number;
  progress: string | undefined;
};

export type RecoveryView = {
  corpseYd: number | undefined;
  corpseCompass: Compass | undefined;
  reclaimInMs: number | undefined;
  spiritHealer: UnitView | undefined;
};

export type NoProgress = {
  actions: number;
  sinceMs: number;
  lastRefusal: string | undefined;
  untried: string[];
};

export type NowSnapshot = {
  at: number;
  self: SelfView;
  breathS?: number | undefined;
  place: PlaceView;
  target: UnitView | undefined;
  targetAuras: AuraView[];
  selfCast: CastView | undefined;
  attackers: AttackerView[];
  hpDelta5s: number | undefined;
  run: RunView | undefined;
  nearest: Partial<Record<NearestKind, UnitView>>;
  recovery: RecoveryView | undefined;
  noProgress: NoProgress | undefined;
  wake: boolean;
};

export type SnapshotWorld = {
  self: SelfView;
  place: PlaceView;
  target: UnitView | undefined;
  attackers: AttackerView[];
  units: UnitView[];
};

export type InWorld = {
  char: string;
  guid: string;
  account: string;
  level: number;
  className: string;
  race: string;
  mapId: number;
  zoneId: number | undefined;
  zone: string | undefined;
  pose: { mapId: number; x: number; y: number; z: number };
  capabilities: GameCapabilities;
  at: number;
};
