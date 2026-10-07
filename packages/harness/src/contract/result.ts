export type ToolName =
  | "look"
  | "travel"
  | "engage"
  | "pilot"
  | "loot"
  | "interact"
  | "rest"
  | "recover"
  | "social"
  | "journal"
  | "stop"
  | "gear"
  | "use"
  | "spell"
  | "pet"
  | "dungeon"
  | "group"
  | "trade"
  | "character"
  | "talents"
  | "guildbank"
  | "mail"
  | "vehicle"
  | "guild"
  | "channel"
  | "arena"
  | "calendar"
  | "wintergrasp";

export type ToolKind = "read" | "action" | "run" | "control";

export type ToolStatus =
  | "DONE"
  | "PARTLY"
  | "RUNNING"
  | "UNCONFIRMED"
  | "REFUSED"
  | "FAILED";

export type Evidence = { seq: number; domain: string; event: string };

export type ToolResult<A> = {
  status: ToolStatus;
  reason?: string;
  detail: string;
  body: string[];
  next?: string;
  options?: unknown;
  after: A;
  runId?: string;
  evidence?: Evidence[];
};

export type ResultInit<A> = Omit<ToolResult<A>, "status" | "body"> & {
  body?: string[];
};
