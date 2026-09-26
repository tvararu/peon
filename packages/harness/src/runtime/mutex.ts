import { ignoreFailure } from "@tuicraft/core/lib/ignore-failure";
import type { WorldMutex } from "#harness/contract/services";

export function createWorldMutex(): WorldMutex {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(send: () => T): Promise<T> {
      const result = tail.then(send);
      tail = result.catch(ignoreFailure);
      return result;
    },
  };
}
