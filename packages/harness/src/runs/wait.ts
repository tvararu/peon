import type { RunHandle, RunWait } from "#harness/contract/runs";
import type { HarnessRuntime } from "#harness/contract/services";

export const YIELD_AFTER_MS = 120_000;

type AwaitInit<R> = {
  rt: HarnessRuntime;
  run: RunHandle<R>;
  yieldAfterMs?: number;
};

export async function awaitRun<R>({
  rt,
  run,
  yieldAfterMs = YIELD_AFTER_MS,
}: AwaitInit<R>): Promise<RunWait<R>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<RunWait<R>>((resolve) => {
    timer = setTimeout(
      () => resolve({ kind: "yielded", why: "timeout" }),
      yieldAfterMs,
    );
  });
  const human = rt.yields
    .wait()
    .then((): RunWait<R> => ({ kind: "yielded", why: "human" }));
  const ended = run.done.then((end): RunWait<R> => ({ end, kind: "ended" }));
  const outcome = await Promise.race([ended, human, timeout]).finally(() =>
    clearTimeout(timer),
  );
  if (outcome.kind === "yielded") rt.runs.release(run.id);
  return outcome;
}
