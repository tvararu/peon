import type { WorldHandle } from "@peon/core";
import type { RunRecord, RunRegistry, StopCause } from "#harness/contract/runs";
import type {
  HarnessRuntime,
  RuntimeParts,
  SessionFlags,
} from "#harness/contract/services";
import { type Connection, createConnection } from "#harness/runtime/connection";

export function createHarnessRuntime(parts: RuntimeParts): HarnessRuntime {
  const { login, ...rest } = parts;
  const observers = [
    parts.ready,
    parts.router,
    parts.sightings,
    parts.attacks,
    parts.progress,
    parts.snapshots,
  ];
  const link = createConnection({
    clock: parts.clock,
    log: parts.log,
    login,
    observers,
    profile: parts.profile,
    runs: parts.runs,
  });
  const stopAll = (cause: StopCause) =>
    stopEverything(parts.runs, link.handle(), cause);
  const shutdown = () => shutdownAll({ link, parts, stopAll });
  return {
    ...rest,
    ...link,
    session: initialSession(parts.flags.wake),
    shutdown,
    stopAll,
  };
}

function initialSession(wake: boolean): SessionFlags {
  return {
    agent: "idle",
    humanTexts: [],
    humanWaiting: false,
    lastNow: undefined,
    lastToolCallAt: undefined,
    tool: undefined,
    turnStartSeq: 0,
    turnToolCalls: 0,
    unreadWhispers: 0,
    wake,
  };
}

function stopEverything(
  runs: RunRegistry,
  handle: WorldHandle | undefined,
  cause: StopCause,
): RunRecord[] {
  const stopped = runs.cancelAll(cause);
  handle?.halt();
  handle?.stopCycle();
  handle?.stopAttack();
  return stopped;
}

type Shutdown = {
  parts: RuntimeParts;
  link: Connection;
  stopAll: (cause: StopCause) => RunRecord[];
};

async function shutdownAll({ parts, link, stopAll }: Shutdown): Promise<void> {
  stopAll("quit");
  await link.disconnect();
  await parts.log.flush();
  await parts.jevLog.close();
  await parts.stats.stop();
}
