import type { ControlDeps } from "#wow/control";
import { DRIVEN_ACK_BITS } from "#wow/control-flag-acks";
import type { RideState } from "#wow/control-ride";
import { MovementFlag } from "#wow/protocol/entity-fields";

export type ForcedHost = {
  moveFlags: number;
  drivenFlags: number;
  rooted: boolean;
  moverRooted: boolean;
  moverRootKnown: boolean;
  pendingRoots: Map<bigint, boolean>;
  ride: RideState;
};

export type ForcedParts = {
  deps: ControlDeps;
  host: ForcedHost;
};

export class ForcedRoots {
  private readonly deps: ControlDeps;
  private readonly host: ForcedHost;

  constructor({ deps, host }: ForcedParts) {
    this.deps = deps;
    this.host = host;
  }

  notePending(
    mover: bigint | undefined,
    guid: bigint | undefined,
    rooted: boolean,
  ): void {
    if (guid !== undefined && guid !== this.deps.selfGuid())
      this.host.pendingRoots.set(guid, rooted);
    if (mover !== undefined) return;
    if (guid !== undefined && guid !== this.deps.selfGuid()) return;
    this.host.rooted = rooted;
    if (rooted) this.host.moveFlags |= MovementFlag.ROOT;
    else this.host.moveFlags &= ~MovementFlag.ROOT;
  }

  setMover(rooted: boolean): void {
    this.host.moverRooted = rooted;
    this.host.moverRootKnown = true;
    if (rooted) this.host.drivenFlags |= MovementFlag.ROOT;
    else this.host.drivenFlags &= ~MovementFlag.ROOT;
    if (rooted || !this.host.rooted)
      this.host.moveFlags = rooted
        ? this.host.moveFlags | MovementFlag.ROOT
        : this.host.moveFlags & ~MovementFlag.ROOT;
  }

  adoptFlags(flags: number): void {
    if (!this.host.moverRootKnown) {
      this.host.drivenFlags = flags;
      if ((flags & MovementFlag.ROOT) !== 0) this.setMover(true);
      else if (!this.host.rooted) this.host.moveFlags &= ~MovementFlag.ROOT;
      return;
    }
    if (this.host.moverRooted)
      this.host.drivenFlags = flags | MovementFlag.ROOT;
    else this.host.drivenFlags = flags & ~MovementFlag.ROOT;
  }

  adoptMover(mover: bigint | undefined): void {
    this.host.moverRootKnown =
      mover !== undefined && this.host.pendingRoots.has(mover);
  }

  forget(mover: bigint | undefined): void {
    if (mover === undefined) this.host.pendingRoots.clear();
    else this.host.pendingRoots.delete(mover);
  }

  drivenBits(): number {
    return this.host.drivenFlags & DRIVEN_ACK_BITS;
  }
}

export function flagTarget(
  mover: bigint | undefined,
  self: bigint,
  guid: bigint | undefined,
): "driven" | "self" | "drop" {
  if (guid !== undefined && mover !== undefined && guid === mover)
    return "driven";
  if (guid !== undefined && guid !== self) return "drop";
  return "self";
}
