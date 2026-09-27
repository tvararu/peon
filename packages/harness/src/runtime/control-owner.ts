import { Emitter, type Unsubscribe } from "@peon/core/lib/emitter";
import type { RunRecord } from "#harness/contract/runs";

export type ControlOwner = "human" | "agent" | "loop";
export type ControlHolder = ControlOwner | "none";

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
  | { granted: true; stopped: RunRecord[] }
  | { granted: false; holder: ControlOwner };

export type ControlArbiter = {
  owner: () => ControlHolder;
  claim: (owner: ControlOwner, reason: string) => Claim;
  release: (owner: ControlOwner, reason: string) => void;
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
  let holder: ControlHolder = "none";
  const move = (owner: ControlHolder, reason: string) => {
    const previous = holder;
    if (previous === owner) return;
    holder = owner;
    changes.emit({ owner, previous, reason });
  };
  return {
    claim(owner, reason) {
      if (holder !== "none" && RANK[holder] > RANK[owner])
        return { granted: false, holder };
      const displaces =
        owner === "human" || (holder !== "none" && holder !== owner);
      const stopped = displaces
        ? preempt({ by: owner, displaced: holder, reason })
        : [];
      move(owner, reason);
      return { granted: true, stopped };
    },
    onChange: (cb) => changes.subscribe(cb),
    owner: () => holder,
    release(owner, reason) {
      if (holder === owner) move("none", reason);
    },
  };
}
