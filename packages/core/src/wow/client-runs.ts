import type { WorldHandle } from "#wow/client";
import type { CycleRecovery } from "#wow/corpse-run";
import type { CycleStop } from "#wow/cycle-stop";
import type { CycleLootRecord } from "#wow/encounter-cycle";
import type { Runtimes } from "#wow/runtime";
import type { WorldConn } from "#wow/world-conn";

export type LootOutcome =
  | { ok: true; record: CycleLootRecord | undefined }
  | CycleStop;
export type RecoveryOutcome = ({ ok: true } & CycleRecovery) | CycleStop;

type Runs = Pick<WorldHandle, "lootCorpse" | "recoverCorpse">;

export function runMethods(_conn: WorldConn, _rt: Runtimes): Runs {
  return {
    lootCorpse() {
      return Promise.reject(new Error("not_implemented"));
    },
    recoverCorpse() {
      return Promise.reject(new Error("not_implemented"));
    },
  };
}
