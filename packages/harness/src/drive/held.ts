import type { MovementInput } from "@peon/core";
import { inputOf, type KeyPhase, type MoveKey } from "#harness/drive/keys";

export const FIRST_LEASE_MS = 600;
export const REPEAT_LEASE_MS = 250;
export const RELEASE_LEASE_MS = 700;
const OVERLAP_MS = 100;

export type DriveTimers = {
  now: () => number;
  set: (cb: () => void, ms: number) => unknown;
  clear: (timer: unknown) => void;
};

export type HeldInit = {
  timers: DriveTimers;
  send: (input: MovementInput, leaseMs: number) => void;
  changed: () => void;
};

export class HeldKeys {
  private readonly until = new Map<MoveKey, number>();
  private releases = false;
  private moving = false;
  private timer: unknown;

  private readonly init: HeldInit;

  constructor(init: HeldInit) {
    this.init = init;
  }

  key(key: MoveKey, phase: KeyPhase): void {
    const { now } = this.init.timers;
    if (phase === "release") {
      this.releases = true;
      this.until.delete(key);
    } else this.until.set(key, now() + this.leaseFor(key));
    this.apply();
  }

  clear(): void {
    this.until.clear();
    this.apply();
  }

  keys(): MoveKey[] {
    return [...this.until.keys()];
  }

  estimated(): boolean {
    return !this.releases;
  }

  private leaseFor(key: MoveKey): number {
    if (this.releases) return RELEASE_LEASE_MS;
    return this.until.has(key) ? REPEAT_LEASE_MS : FIRST_LEASE_MS;
  }

  private apply(): void {
    const { timers, send, changed } = this.init;
    const now = timers.now();
    for (const [key, at] of this.until) if (at <= now) this.until.delete(key);
    timers.clear(this.timer);
    this.timer = undefined;
    const input = inputOf(new Set(this.until.keys()));
    const idle = !(input.move || input.strafe || input.turn);
    const next = Math.min(...this.until.values());
    if (Number.isFinite(next))
      this.timer = timers.set(() => this.apply(), next - now);
    if (!idle) send(input, next - now + OVERLAP_MS);
    else if (this.moving) send(input, 1);
    this.moving = !idle;
    changed();
  }
}
