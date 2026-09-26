import { expect, test } from "bun:test";
import { runMethods } from "#wow/client-runs";
import type { Runtimes } from "#wow/runtime";
import type { WorldConn } from "#wow/world-conn";

test("lootCorpse and recoverCorpse reject until they are built", async () => {
  const methods = runMethods({} as WorldConn, {} as Runtimes);
  const { signal } = new AbortController();
  await expect(methods.lootCorpse(1n, signal)).rejects.toThrow(
    "not_implemented",
  );
  await expect(methods.recoverCorpse(signal)).rejects.toThrow(
    "not_implemented",
  );
});
