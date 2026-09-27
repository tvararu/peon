import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Capabilities, ClientConfig } from "@peon/core";
import type { LogEvent } from "#harness/contract/log";
import type { ToolStatus } from "#harness/contract/result";
import type { RunView } from "#harness/contract/views";

export type HarnessFlags = {
  profile: string;
  runDir: string | undefined;
  model: string;
  thinking: ThinkingLevel;
  connect: boolean;
  wake: boolean;
  glyphs: string | undefined;
  stopReflex: boolean;
  nowPerCall: boolean;
  logEntities: boolean;
  check: boolean;
};

export type ProfileSource = "soap_session" | "soap_ledger" | "config_toml";

export type Profile = {
  source: ProfileSource;
  path: string;
  account: string;
  character: string;
  client: ClientConfig;
};

export type RunPaths = {
  dir: string;
  meta: string;
  gamelog: string;
  jev: string;
  session: string;
  piSessions: string;
  tools: string;
  runs: string;
  status: string;
  snapshots: string;
  workspace: string;
};

export type ConnectionState =
  | "offline"
  | "connecting"
  | "online"
  | "closing"
  | "backoff";

export type RunMeta = {
  v: 1;
  gitSha: string | undefined;
  account: string;
  character: string;
  characterGuid: string | undefined;
  model: string;
  thinking: ThinkingLevel;
  glyphs: "nerd" | "unicode" | "ascii";
  flags: HarnessFlags;
  startedAt: number;
  endedAt: number | undefined;
  exitReason: string | undefined;
  capabilities: Capabilities | undefined;
  files: {
    gamelog: string;
    session: string;
    tools: string;
    runs: string;
    jev: string;
    status: string;
  };
};

export type ToolStatsRow = {
  calls: number;
  statuses: Partial<Record<ToolStatus, number>>;
  validationErrors: number;
  repeatHits: number;
  p50Ms: number | undefined;
  p95Ms: number | undefined;
  lastError: string | undefined;
};

export type ToolsJson = {
  v: 1;
  updatedAt: number;
  tools: Record<string, ToolStatsRow>;
};

export type AgentState = "idle" | "streaming" | "tool";

export type StatusJson = {
  v: 1;
  at: number;
  agent: AgentState;
  tool: string | undefined;
  run: RunView | undefined;
  lastToolCallAt: number | undefined;
  lastProgress: { at: number; event: LogEvent } | undefined;
  connection: ConnectionState;
  ready: boolean;
};
