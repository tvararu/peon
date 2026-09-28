import { Emitter, type Unsubscribe } from "#lib/emitter";
import type { FlagChange } from "#wow/areas/selfstate/protocol";
import type { MoveCounter } from "#wow/protocol/movement";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

export type SelfstateState = Readonly<Record<never, never>>;
export type SelfstateEvent = never;

export class SelfstateStore {
  private readonly events = new Emitter<[SelfstateEvent]>();
  private readonly deps: SessionDeps;
  private readonly core: CoreStores;

  constructor(deps: SessionDeps, core: CoreStores) {
    this.deps = deps;
    this.core = core;
  }

  snapshot(): SelfstateState {
    return {};
  }

  onEvent(cb: (event: SelfstateEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  receiveMoveFlag(change: FlagChange, { guid, counter }: MoveCounter): void {
    if (guid !== this.deps.selfGuid()) return;
    this.core.self.receive({
      type: "move_flag",
      flag: change.flag,
      enable: change.enable,
      counter,
    });
  }

  dispose(): void {
    this.events.clear();
  }
}
