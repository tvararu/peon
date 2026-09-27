import { Emitter, type Unsubscribe } from "@peon/core/lib/emitter";
import type { RunRecord } from "#harness/contract/runs";

export type ControlOwner = "human" | "agent" | "loop";
export type ControlHolder = ControlOwner | "none";

export type Grant = { readonly owner: ControlOwner; readonly reason: string };

export type OwnerChange = {
  owner: ControlHolder;
  previous: ControlHolder;
  reason: string;
};

export type Takeover = {
  by: ControlOwner;
  displaced: ControlHolder;
  reason: string;
};

export type Claim =
  | { granted: true; grant: Grant; stopped: RunRecord[] }
  | { granted: false; holder: ControlOwner };

export type ControlArbiter = {
  owner: () => ControlHolder;
  holds: (grant: Grant) => boolean;
  claim: (owner: ControlOwner, reason: string) => Claim;
  release: (grant: Grant, reason: string) => void;
  onChange: (cb: (change: OwnerChange) => void) => Unsubscribe;
};

const RANK: Record<ControlHolder, number> = {
  agent: 2,
  human: 3,
  loop: 1,
  none: 0,
};

export function createControlArbiter(
  preempt: (takeover: Takeover) => RunRecord[],
): ControlArbiter {
  const changes = new Emitter<[OwnerChange]>();
  let current: Grant | undefined;
  const holder = (): ControlHolder => current?.owner ?? "none";
  const move = (next: Grant | undefined, reason: string) => {
    const previous = holder();
    current = next;
    changes.emit({ owner: holder(), previous, reason });
  };
  return {
    claim(owner, reason) {
      const held = holder();
      if (held !== "none" && RANK[held] > RANK[owner])
        return { granted: false, holder: held };
      const stopped =
        owner === "human" || current
          ? preempt({ by: owner, displaced: held, reason })
          : [];
      const grant: Grant = Object.freeze({ owner, reason });
      move(grant, reason);
      return { grant, granted: true, stopped };
    },
    holds: (grant) => current === grant,
    onChange: (cb) => changes.subscribe(cb),
    owner: holder,
    release(grant, reason) {
      if (current === grant) move(undefined, reason);
    },
  };
}
