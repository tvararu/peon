import type { CombatCasts } from "#wow/combat-casts";
import type { CombatOutcome } from "#wow/combat-types";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { SpellGo, SpellStart } from "#wow/protocol/spell";
import { spellCastReason } from "#wow/protocol/spell-cast-result";

export type CombatAutoRepeat = {
  spellId: number;
  target: bigint;
  status: "pending" | "active";
  startedAt: number;
  shots: number;
  lastShotAt?: number;
};

type AutoRepeatDeps = {
  send: (opcode: number, body?: Uint8Array) => void;
  now: () => number;
  casts: CombatCasts;
};

export class AutoRepeatTracker {
  private readonly deps: AutoRepeatDeps;
  private current: (CombatAutoRepeat & { count: number }) | undefined;

  constructor(deps: AutoRepeatDeps) {
    this.deps = deps;
  }

  get state(): CombatAutoRepeat | undefined {
    if (!this.current) return undefined;
    const { count: _, ...state } = this.current;
    return state;
  }

  send(spellId: number, target: bigint): CombatOutcome {
    const count = this.deps.casts.sendUntracked(spellId, target);
    const at = this.deps.now();
    this.current = {
      count,
      shots: 0,
      spellId,
      startedAt: at,
      status: "pending",
      target,
    };
    return { at, kind: "cast", spellId, status: "sent", target };
  }

  start(packet: SpellStart): CombatOutcome | undefined {
    const current = this.current;
    if (current?.spellId !== packet.spellId) return undefined;
    current.status = "active";
    const target = packet.targets.objectGuid;
    return {
      at: this.deps.now(),
      kind: "cast",
      spellId: packet.spellId,
      status: "started",
      target,
    };
  }

  shot(packet: SpellGo): CombatOutcome {
    const at = this.deps.now();
    if (this.current?.spellId === packet.spellId) {
      this.current.status = "active";
      this.current.shots += 1;
      this.current.lastShotAt = at;
    }
    return {
      at,
      hits: packet.hits,
      kind: "cast",
      misses: packet.misses,
      spellId: packet.spellId,
      status: "succeeded",
      target: packet.targets.objectGuid,
    };
  }

  fail(
    spellId: number,
    count: number,
    result: number,
    status: "failed" | "interrupted",
  ): CombatOutcome | undefined {
    const current = this.current;
    if (current?.spellId !== spellId || current.count !== count)
      return undefined;
    this.current = undefined;
    return {
      at: this.deps.now(),
      kind: "cast",
      reason: spellCastReason(result),
      result,
      spellId,
      status,
    };
  }

  cancelled(): CombatOutcome | undefined {
    const spellId = this.current?.spellId;
    if (spellId === undefined) return undefined;
    this.current = undefined;
    return {
      at: this.deps.now(),
      kind: "cancel",
      reason: "auto_repeat_cancelled",
      spellId,
      status: "succeeded",
    };
  }

  stop(): CombatOutcome | undefined {
    const spellId = this.current?.spellId;
    if (spellId === undefined) return undefined;
    this.deps.send(GameOpcode.CMSG_CANCEL_AUTO_REPEAT_SPELL);
    this.current = undefined;
    return { at: this.deps.now(), kind: "cancel", spellId, status: "sent" };
  }

  clear(): void {
    this.current = undefined;
  }
}
