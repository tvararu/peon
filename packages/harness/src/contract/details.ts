import type { ItemKind, NpcRole } from "@tuicraft/core";
import type { GameLogEntry } from "#harness/contract/log";
import type { ToolName, ToolResult } from "#harness/contract/result";
import type { RunRecord } from "#harness/contract/runs";
import type {
  AttackerView,
  CastView,
  Compass,
  DangerView,
  NearestKind,
  PlaceView,
  PoseView,
  RunView,
  SelfView,
  UnitView,
  VitalsView,
} from "#harness/contract/views";

export type LookFilter =
  | "any"
  | "hostile"
  | "attackable"
  | "questgiver"
  | "vendor"
  | "trainer"
  | "repair"
  | "lootable"
  | "player"
  | "corpse"
  | "spirit_healer";

export type LookAfter = {
  self: SelfView;
  place: PlaceView;
  target: UnitView | undefined;
  run: RunView | undefined;
  filter: LookFilter;
  name: string | undefined;
  within: number | undefined;
  rows: UnitView[];
  matched: number;
  seen: number;
  nearest: Partial<Record<NearestKind, UnitView>>;
  danger: DangerView;
  unchanged: number;
};

export type LegStatus =
  | "arrived"
  | "refused"
  | "failed"
  | "interrupted"
  | "cancelled";

export type LegView = {
  index: number;
  status: LegStatus;
  reason: string | undefined;
  traveledYd: number;
};

export type TravelGoalView =
  | { kind: "unit"; ref: string; name: string }
  | { kind: "point"; x: number; y: number; z: number | undefined }
  | { kind: "corpse" }
  | { kind: "explore"; direction: Compass | undefined }
  | { kind: "unstick"; refusedGoal: string | undefined };

export type TravelAfter = {
  goal: TravelGoalView;
  pose: PoseView | undefined;
  traveledYd: number;
  totalYd: number | undefined;
  remainingYd: number | undefined;
  elapsedMs: number;
  legs: LegView[];
  floors: number[] | undefined;
  floorRetried: boolean;
  newInView: UnitView[];
};

export type LootLine = {
  itemId: number;
  name: string;
  count: number;
  quality: number | null;
};

export type EngageTarget = {
  ref: string;
  name: string;
  outcome: "fighting" | "killed" | "lost" | "skipped";
  reason: string | undefined;
  durationMs: number | undefined;
  xp: number | undefined;
};

export type JevDecisionView = {
  at: number;
  kind: "wait" | "move" | "spell" | "face" | "attack" | "item";
  label: string;
  disposition: "applied" | "discarded";
};

export type CodeWord = { code: number; word: string; count: number };

export type EngageAfter = {
  mode: "single" | "cycle" | "quest";
  how: string;
  questId: number | undefined;
  wanted: number;
  kills: number;
  targets: EngageTarget[];
  current: UnitView | undefined;
  xp: number;
  loot: LootLine[];
  copper: number;
  self: VitalsView;
  cast: CastView | undefined;
  decisions: JevDecisionView[];
  timeouts: number;
  castErrors: CodeWord[];
  swingErrors: CodeWord[];
};

export type LootAfter = {
  corpse: UnitView | undefined;
  items: LootLine[];
  copper: number;
  windowClosed: boolean;
  freeSlots: number | undefined;
};

export type InteractAction =
  | "talk"
  | "accept"
  | "turn_in"
  | "gossip"
  | "buy"
  | "sell_junk"
  | "train"
  | "repair";

export type QuestOffer = {
  line: number;
  id: number;
  title: string;
  level: number | undefined;
  state: "available" | "ready" | "incomplete";
};

export type GossipLine = { line: number; text: string; icon: number };

export type StockLine = {
  line: number;
  itemId: number;
  name: string;
  price: number;
  stack: number;
  available: number | undefined;
};

export type TrainerLine = {
  spellId: number;
  name: string;
  rank: string | undefined;
  cost: number;
  level: number;
  state: "available" | "unavailable" | "known";
};

export type RewardChoice = { index: number; name: string; count: number };

export type MoneyChange = { before: number; after: number };

export type InteractAfter = {
  npc: UnitView;
  action: InteractAction;
  roles: NpcRole[];
  dialogOpened: boolean;
  offers: QuestOffer[];
  gossip: GossipLine[];
  stock: StockLine[];
  spells: TrainerLine[];
  rewardChoices: RewardChoice[];
  bought: LootLine | undefined;
  sold: LootLine[];
  learned: string[];
  repairCost: number | undefined;
  money: MoneyChange | undefined;
  freeSlots: number | undefined;
};

export type RestAfter = {
  used: LootLine[];
  durationMs: number;
  hpPct: number;
  manaPct: number | undefined;
  idle: boolean;
  itemsLeft: number;
  auraConfirmed: boolean;
};

export type RecoverAfter = {
  via: "corpse" | "spirit_healer" | "accept";
  alive: boolean;
  durationMs: number;
  corpseYd: number | undefined;
  legs: number;
  pose: PoseView | undefined;
  hp: number | undefined;
  maxHp: number | undefined;
  alternatives: string[];
};

export type SocialAction =
  | "say"
  | "whisper"
  | "party"
  | "guild"
  | "invite"
  | "accept_invite"
  | "decline_invite"
  | "leave_group";

export type SocialAfter = {
  action: SocialAction;
  to: string | undefined;
  text: string | undefined;
  confirmed: boolean;
  systemLine: string | undefined;
};

export type EquipSlotName =
  | "head"
  | "neck"
  | "shoulders"
  | "shirt"
  | "chest"
  | "waist"
  | "legs"
  | "feet"
  | "wrists"
  | "hands"
  | "finger1"
  | "finger2"
  | "trinket1"
  | "trinket2"
  | "back"
  | "main_hand"
  | "off_hand"
  | "ranged"
  | "tabard";

export type QuestLine = {
  id: number;
  title: string;
  level: number | undefined;
  status: "incomplete" | "complete" | "failed";
  objectives: { text: string; count: number; required: number }[];
  turnIn: string | undefined;
};

export type BagsView = {
  copper: number | undefined;
  freeSlots: number | undefined;
  equipped: { slot: EquipSlotName; name: string; quality: number | null }[];
  items: {
    name: string;
    count: number;
    quality: number | null;
    bag: number;
    slot: number;
    kind: ItemKind;
  }[];
};

export type SpellLine = {
  id: number;
  name: string;
  rank: string | undefined;
  cost: number | undefined;
  cooldownMs: number | undefined;
};

export type JournalAfter =
  | { about: "quests"; quests: QuestLine[] }
  | { about: "bags"; bags: BagsView }
  | { about: "spells"; spells: SpellLine[] }
  | { about: "log"; rows: GameLogEntry[]; more: number; label: string };

export type StopAfter = {
  stopped: RunRecord[];
  self: VitalsView;
  attackers: AttackerView[];
};

export type AfterMap = {
  look: LookAfter;
  travel: TravelAfter;
  engage: EngageAfter;
  loot: LootAfter;
  interact: InteractAfter;
  rest: RestAfter;
  recover: RecoverAfter;
  social: SocialAfter;
  journal: JournalAfter;
  stop: StopAfter;
};

export type ToolDetailsFor<K extends ToolName> = {
  tool: K;
  result: ToolResult<AfterMap[K]>;
};

export type ToolDetails = { [K in ToolName]: ToolDetailsFor<K> }[ToolName];
