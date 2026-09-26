export type LogClass = "wake" | "passive" | "log";

export type Domain =
  | "session"
  | "control"
  | "nav"
  | "chat"
  | "combat"
  | "xp"
  | "quest"
  | "loot"
  | "money"
  | "vendor"
  | "trainer"
  | "fight"
  | "life"
  | "group"
  | "social"
  | "aura"
  | "run"
  | "tool"
  | "human"
  | "agent"
  | "packet"
  | "notice"
  | "snapshot"
  | "entity";

export type LogEvent =
  | "session/in_world"
  | "session/connected"
  | "session/lost"
  | "session/wake_throttled"
  | "control/server_correction"
  | "control/move_start"
  | "control/move_stop"
  | "control/teleport"
  | "control/place_changed"
  | "nav/route_start"
  | "nav/route_replaced"
  | "nav/route_end"
  | "nav/refused"
  | "chat/in"
  | "chat/out"
  | "combat/kill_credit"
  | "combat/cast"
  | "combat/attack_start"
  | "combat/attacked"
  | "xp/gain"
  | "xp/level_up"
  | "quest/accepted"
  | "quest/progress"
  | "quest/completed"
  | "quest/rewarded"
  | "loot/item"
  | "loot/open"
  | "loot/release"
  | "money/change"
  | "vendor/list"
  | "vendor/buy"
  | "vendor/sell"
  | "vendor/repair"
  | "trainer/list"
  | "trainer/learn"
  | "fight/start"
  | "fight/end"
  | "life/dead"
  | "life/released"
  | "life/alive"
  | "life/low_health"
  | "life/resurrect_offer"
  | "group/invite"
  | "group/kicked"
  | "group/disbanded"
  | "group/roster"
  | "social/duel_request"
  | "aura/gain"
  | "aura/fade"
  | "run/started"
  | "run/progress"
  | "run/ended"
  | "run/cancelled"
  | "tool/call"
  | "tool/result"
  | "tool/validation_error"
  | "human/input"
  | "agent/message"
  | "agent/now"
  | "agent/stuck"
  | "packet/error"
  | "notice/not_implemented"
  | "snapshot/world"
  | "entity/appear"
  | "entity/disappear";

export type GameLogEntry = {
  v: 1;
  seq: number;
  ts: number;
  char: string;
  domain: Domain;
  event: LogEvent;
  class: LogClass;
  delivered?: boolean;
  consumedBy?: string;
  runId?: string;
  tool?: string;
  ref?: string;
  guid?: string;
  text: string;
  data: Record<string, unknown>;
};

export type LogDraft = Omit<GameLogEntry, "v" | "seq" | "ts" | "char"> & {
  ts?: number;
};

export type WowEventDetails = {
  kind: "wake" | "passive";
  entries: GameLogEntry[];
};

export type HumanLineDetails = { entry: GameLogEntry };
