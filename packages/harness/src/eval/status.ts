import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import type { StatusJson } from "#harness/contract/config";
import type { HarnessRuntime } from "#harness/contract/services";
import { writeJsonAtomic } from "#harness/eval/run-dir";
import { runView } from "#harness/runs/registry";

export const STATUS_EVERY_MS = 1000;

export type StatusWriter = {
  start: (everyMs: number) => void;
  stop: () => Promise<void>;
};

type WriterInit = { path: string; snapshot: () => StatusJson };

export function statusSnapshot(rt: HarnessRuntime): StatusJson {
  const at = rt.clock.now();
  const active = rt.runs.active();
  const { agent, lastToolCallAt, tool } = rt.session;
  return {
    agent,
    at,
    connection: rt.connection(),
    lastProgress: rt.progress.lastProgress(),
    lastToolCallAt,
    ready: rt.ready.isReady(),
    run: active && runView(active, at),
    tool,
    v: 1,
  };
}

export function createStatusWriter({
  path,
  snapshot,
}: WriterInit): StatusWriter {
  let timer: ReturnType<typeof setInterval> | undefined;
  let chain: Promise<void> = Promise.resolve();
  const write = (): Promise<void> => {
    chain = chain
      .catch(ignoreFailure)
      .then(() => writeJsonAtomic(path, snapshot()));
    return chain;
  };
  return {
    start(everyMs) {
      clearInterval(timer);
      timer = setInterval(() => write().catch(ignoreFailure), everyMs);
    },
    async stop() {
      clearInterval(timer);
      timer = undefined;
      await write();
    },
  };
}
