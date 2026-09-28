import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  AreaTriggerMessage,
  PageTextReply,
} from "#wow/areas/objects/protocol";
import {
  type GameObjectTemplate,
  gameObjectTemplate,
} from "#wow/areas/objects/templates";
import type { AreaTriggerCatalog } from "#wow/areas/objects/trigger-catalog";
import {
  type TriggerPoint,
  TriggerWatch,
} from "#wow/areas/objects/trigger-watch";
import { UnitFlag } from "#wow/protocol/entity-fields";
import type { GameObjectQueryResult } from "#wow/protocol/entity-queries";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

const GAMEOBJECT_TYPE = 5;
export const PAGE_READ_MAX_PAGES = 30;
export type TriggerCatalogState = "none" | "loading" | "ready" | "failed";
export type PendingUse = {
  guid: bigint;
  entry: number;
  sentAt: number;
  expired: boolean;
};
export type UseRecord = { guid: bigint; entry: number };
export type UseRefusal = { ok: false; reason: "unknown" };
export type PageText = { pageId: number; text: string };
export type PageChain = { firstPageId: number; pages: readonly PageText[] };
export type UnansweredPage = { pageId: number };
export type ObjectsState = {
  templates: ReadonlyMap<number, GameObjectTemplate>;
  pendingUse: PendingUse | undefined;
  pages: ReadonlyMap<number, readonly PageText[]>;
  triggers: {
    catalog: TriggerCatalogState;
    map: number | undefined;
    inside: readonly number[];
    sent: readonly number[];
  };
  lastMessage: { text: string; at: number } | undefined;
};
export type ObjectsEvent =
  | { type: "used"; guid: bigint; entry: number; how: "use" }
  | { type: "trigger_sent"; triggerId: number; map: number }
  | { type: "trigger_message"; text: string }
  | { type: "page_read"; firstPageId: number; pages: readonly PageText[] }
  | { type: "page_shown"; guid: bigint; pageId: number }
  | { type: "page_unanswered"; pageId: number };

export class ObjectsStore {
  private readonly events = new Emitter<[ObjectsEvent]>();
  private readonly deps: SessionDeps;
  private readonly core: CoreStores;
  private catalog: TriggerCatalogState = "none";
  private watch: TriggerWatch | undefined;
  private last: TriggerPoint | undefined;
  private readonly sent = new Set<number>();
  private lastMessage: ObjectsState["lastMessage"];
  private readonly templates = new Map<number, GameObjectTemplate>();
  private pending: { guid: bigint; entry: number; sentAt: number } | undefined;
  private readonly pages = new Map<number, PageText[]>();
  private readonly chained = new Map<number, PageText[]>();
  private readonly nexts = new Map<number, number>();

  constructor(deps: SessionDeps, core: CoreStores) {
    this.deps = deps;
    this.core = core;
  }

  snapshot(): ObjectsState {
    return {
      templates: this.templates,
      pendingUse: this.pending && {
        ...this.pending,
        expired: this.deps.now() - this.pending.sentAt >= 5000,
      },
      pages: this.pages,
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

  template(reply: GameObjectQueryResult): void {
    if (reply.name === undefined) return;
    this.templates.set(reply.entry, gameObjectTemplate(reply));
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

  object(guid: bigint): UseRecord | undefined {
    const entity = this.deps.getEntity(guid);
    if (entity?.objectType !== GAMEOBJECT_TYPE) return undefined;
    return { entry: entity.entry, guid };
  }

  sendUse(guid: bigint): UseRecord | UseRefusal {
    const object = this.object(guid);
    if (!object) return { ok: false, reason: "unknown" };
    const entity = this.deps.getEntity(guid);
    if (entity && "gameObjectType" in entity && entity.gameObjectType === 2)
      this.core.quests.requestIntent({ action: "talk", guid });
    this.pending = { ...object, sentAt: this.deps.now() };
    this.events.emit({ ...object, how: "use", type: "used" });
    return object;
  }

  noteSent(triggerId: number, map: number): void {
    this.sent.add(triggerId);
    this.events.emit({ type: "trigger_sent", triggerId, map });
  }

  message({ text }: AreaTriggerMessage): void {
    this.lastMessage = { text, at: this.deps.now() };
    this.events.emit({ type: "trigger_message", text });
  }

  chain(firstPageId: number): PageText[] {
    const kept = this.pages.get(firstPageId) ?? [];
    const open = this.chained.get(firstPageId);
    if (open) return open;
    const pages = [...kept];
    this.chained.set(firstPageId, pages);
    return pages;
  }

  chainFor(reply: PageTextReply): number | undefined {
    if (this.chained.has(reply.pageId)) {
      const open = this.chained.get(reply.pageId);
      if (open && open.length === 0) return reply.pageId;
    }
    for (const [first, pages] of this.chained) {
      if (pages.length > 0 && this.nexts.get(first) === reply.pageId)
        return first;
    }
    return undefined;
  }

  page(reply: PageTextReply): void {
    if (this.pages.has(reply.pageId)) return;
    const first = this.chainFor(reply);
    if (first === undefined) return;
    const pages = this.chained.get(first);
    if (!pages) return;
    pages.push({ pageId: reply.pageId, text: reply.text });
    this.nexts.set(first, reply.nextPageId);
    if (
      reply.nextPageId === 0 ||
      pages.length >= PAGE_READ_MAX_PAGES ||
      this.pages.has(reply.nextPageId)
    )
      this.markRead({ firstPageId: first, pages });
  }

  shown({ guid }: { guid: bigint }): void {
    const object = this.object(guid);
    const pageId = object && this.templates.get(object.entry)?.pageId;
    if (!pageId) return;
    this.events.emit({ guid, pageId, type: "page_shown" });
  }

  markRead(chain: PageChain): void {
    this.pages.set(chain.firstPageId, [...chain.pages]);
    this.chained.delete(chain.firstPageId);
    this.nexts.delete(chain.firstPageId);
    this.events.emit({ ...chain, type: "page_read" });
  }

  unanswered(pageId: number): void {
    this.chained.delete(pageId);
    this.nexts.delete(pageId);
    this.events.emit({ pageId, type: "page_unanswered" });
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
