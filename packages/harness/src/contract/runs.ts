export type RunKind =
  | "travel"
  | "engage"
  | "pilot"
  | "rest"
  | "recover"
  | "trade";

export type RunStatus =
  | "running"
  | "succeeded"
  | "partly"
  | "failed"
  | "cancelled"
  | "interrupted";

export type StopCause = "human" | "esc" | "quit" | "lost" | "tool";

export type RunRecord = {
  id: string;
  kind: RunKind;
  args: Record<string, unknown>;
  toolCallId: string | undefined;
  startedAt: number;
  endedAt: number | undefined;
  status: RunStatus;
  reason: string | undefined;
  summary: string | undefined;
  progress: string | undefined;
  awaited: boolean;
};

export type RunEnd<R> = {
  status: Exclude<RunStatus, "running">;
  reason?: string;
  summary: string;
  value: R;
};

export type RunControl = {
  signal: AbortSignal;
  progress: (text: string) => void;
};

export type RunLaunch<R> = (run: RunControl) => Promise<RunEnd<R>>;

export type RunStart<R> = {
  kind: RunKind;
  args: Record<string, unknown>;
  toolCallId: string | undefined;
  launch: RunLaunch<R>;
};

export type RunHandle<R> = {
  id: string;
  signal: AbortSignal;
  done: Promise<RunEnd<R>>;
};

export type RunEvent = {
  type: "started" | "progress" | "ended";
  record: RunRecord;
};

export type RunWait<R> =
  | { kind: "ended"; end: RunEnd<R> }
  | { kind: "yielded"; why: "human" | "timeout" };

export type RunRegistry = {
  start: <R>(init: RunStart<R>) => RunHandle<R>;
  active: () => RunRecord | undefined;
  get: (id: string) => RunRecord | undefined;
  list: () => RunRecord[];
  cancel: (id: string, cause: StopCause) => RunRecord | undefined;
  cancelAll: (cause: StopCause) => RunRecord[];
  release: (id: string) => void;
  subscribe: (cb: (event: RunEvent) => void) => () => void;
};
