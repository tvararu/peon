import type { RunMeta } from "#harness/contract/config";

export type ExitReason =
  | "quit"
  | "sigterm"
  | "sighup"
  | "sigint"
  | "fatal_error";

export type ExitProcess = {
  on: (event: string, listener: (code: number) => void) => unknown;
  exit: (code: number) => unknown;
  listenerCount: (event: string) => number;
};

export type ExitRecorder = {
  piOwnsSignals: () => void;
  begin: () => Promise<void>;
  end: (patch: Partial<RunMeta>) => Promise<void>;
};

type ExitInit = {
  proc: ExitProcess;
  now: () => number;
  meta: RunMeta;
  write: (meta: RunMeta) => Promise<void>;
  writeSync: (meta: RunMeta) => void;
  notice: (line: string) => void;
};

export const EXIT_SIGINT = 130;
export const LOGOUT_NOTICE =
  "Logging out of the game. The harness exits when the server confirms, in up to 30 s.";

const SIGNALS: readonly (readonly [string, ExitReason, number])[] = [
  ["SIGTERM", "sigterm", 143],
  ["SIGHUP", "sighup", 129],
];

export function createExitRecorder(init: ExitInit): ExitRecorder {
  const { proc, now } = init;
  let reason: ExitReason | undefined;
  let meta = init.meta;
  let done = false;
  let piOwns = false;
  let sigintBase = Number.POSITIVE_INFINITY;
  const stamp = (patch: Partial<RunMeta>, fallback: ExitReason): RunMeta => {
    meta = {
      ...meta,
      ...patch,
      endedAt: now(),
      exitReason: reason ?? fallback,
    };
    return meta;
  };
  const final = (fallback: ExitReason) => {
    if (done) return;
    done = true;
    init.writeSync(stamp({}, fallback));
  };
  for (const [signal, cause, code] of SIGNALS)
    proc.on(signal, () => {
      reason ??= cause;
      if (piOwns) return;
      final(cause);
      proc.exit(code);
    });
  proc.on("SIGINT", () => {
    if (proc.listenerCount("SIGINT") > sigintBase) return;
    reason ??= "sigint";
    final("sigint");
    proc.exit(EXIT_SIGINT);
  });
  proc.on("exit", (code) => final(code === 0 ? "quit" : "fatal_error"));
  return {
    async begin() {
      if (reason === undefined) init.notice(LOGOUT_NOTICE);
      await init.write(stamp({}, "quit"));
    },
    async end(patch) {
      const value = stamp(patch, "quit");
      await init.write(value);
      done = true;
    },
    piOwnsSignals() {
      piOwns = true;
      sigintBase = proc.listenerCount("SIGINT");
    },
  };
}
