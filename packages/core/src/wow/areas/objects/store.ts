import { Emitter, type Unsubscribe } from "#lib/emitter";
import type { AreaTriggerMessage } from "#wow/areas/objects/protocol";
import type { AreaTriggerCatalog } from "#wow/areas/objects/trigger-catalog";
import {
  type TriggerPoint,
  TriggerWatch,
} from "#wow/areas/objects/trigger-watch";
import { UnitFlag } from "#wow/protocol/entity-fields";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

export type TriggerCatalogState = "none" | "loading" | "ready" | "failed";
export type ObjectsState = {
  triggers: {
    catalog: TriggerCatalogState;
    map: number | undefined;
    inside: readonly number[];
    sent: readonly number[];
  };
  lastMessage: { text: string; at: number } | undefined;
};
export type ObjectsEvent =
  | { type: "trigger_sent"; triggerId: number; map: number }
  | { type: "trigger_message"; text: string };

export class ObjectsStore {
  private readonly events = new Emitter<[ObjectsEvent]>();
  private readonly deps: SessionDeps;
  private catalog: TriggerCatalogState = "none";
  private watch: TriggerWatch | undefined;
  private last: TriggerPoint | undefined;
  private readonly sent = new Set<number>();
  private lastMessage: ObjectsState["lastMessage"];

  constructor(deps: SessionDeps, _core: CoreStores) {
    this.deps = deps;
  }

  snapshot(): ObjectsState {
    return {
      triggers: {
        catalog: this.catalog,
        map: this.last?.mapId,
        inside: this.watch?.inside() ?? [],
        sent: [...this.sent],
      },
      lastMessage: this.lastMessage && { ...this.lastMessage },
    };
  }

  onEvent(cb: (event: ObjectsEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  loadingTriggers(): void {
    this.catalog = "loading";
  }

  triggersFailed(): void {
    this.catalog = "failed";
  }

  useTriggers(catalog: AreaTriggerCatalog): void {
    this.catalog = "ready";
    this.watch = new TriggerWatch((map) => catalog.onMap(map));
    if (this.last) this.watch.arrive(this.last);
  }

  move(point: TriggerPoint): number[] {
    this.last = point;
    return this.watch?.move(point, { taxi: this.onTaxi() }) ?? [];
  }

  arrive(point: TriggerPoint): void {
    this.last = point;
    this.watch?.arrive(point);
  }

  noteSent(triggerId: number, map: number): void {
    this.sent.add(triggerId);
    this.events.emit({ type: "trigger_sent", triggerId, map });
  }

  message({ text }: AreaTriggerMessage): void {
    this.lastMessage = { text, at: this.deps.now() };
    this.events.emit({ type: "trigger_message", text });
  }

  dispose(): void {
    this.events.clear();
  }

  private onTaxi(): boolean {
    const self = this.deps.getEntity(this.deps.selfGuid());
    if (!(self && "unitFlags" in self)) return false;
    return (self.unitFlags & UnitFlag.TAXI_FLIGHT) !== 0;
  }
}
