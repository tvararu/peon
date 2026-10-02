import { Emitter, type Unsubscribe } from "#lib/emitter";
import type { DisplayCatalog } from "#wow/areas/objects/display-catalog";
import { objectFields } from "#wow/areas/objects/fields";
import type { LockCatalog } from "#wow/areas/objects/lock-catalog";
import type {
  AreaTriggerMessage,
  CastFailed,
  CustomAnim,
  DespawnAnim,
  PageTextReply,
  SpellStart,
} from "#wow/areas/objects/protocol";
import {
  DESPAWN_ANIM_MAX_ENTRIES,
  FISHING_SPELL,
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
export type LockCatalogState = "none" | "loading" | "ready" | "failed";
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
  displays: DisplayCatalog | undefined;
  anims: ReadonlyMap<bigint, number>;
  despawning: ReadonlySet<bigint>;
  fishing: FishingState | undefined;
};
export type FishingPhase = "cast" | "waiting" | "hooked";
export type FishingState = { bobber: bigint | undefined; phase: FishingPhase };
export type OpenUseRecord = UseRecord & {
  how: "use" | "cast";
  spellId?: number;
};
export type ObjectsEvent =
  | {
      type: "used";
      guid: bigint;
      entry: number;
      how: "use" | "cast";
      spellId?: number;
    }
  | { type: "trigger_sent"; triggerId: number; map: number }
  | { type: "trigger_message"; text: string }
  | { type: "page_read"; firstPageId: number; pages: readonly PageText[] }
  | { type: "page_shown"; guid: bigint; pageId: number }
  | { type: "page_unanswered"; pageId: number }
  | { type: "fish_hooked"; bobber: bigint }
  | { type: "fish_not_hooked" }
  | { type: "fish_escaped" };

export class ObjectsStore {
  private readonly events = new Emitter<[ObjectsEvent]>();
  private readonly deps: SessionDeps;
  private readonly core: CoreStores;
  private catalog: TriggerCatalogState = "none";
  private triggers: AreaTriggerCatalog | undefined;
  private locksState: LockCatalogState = "none";
  private locks: LockCatalog | undefined;
  private displays: DisplayCatalog | undefined;
  private lockWaiters: {
    resolve: (catalog: LockCatalog | undefined) => void;
  }[] = [];
  private watch: TriggerWatch | undefined;
  private last: TriggerPoint | undefined;
  private readonly sent = new Set<number>();
  private lastMessage: ObjectsState["lastMessage"];
  private readonly templates = new Map<number, GameObjectTemplate>();
  private pending: { guid: bigint; entry: number; sentAt: number } | undefined;
  private readonly pages = new Map<number, PageText[]>();
  private readonly chained = new Map<number, PageText[]>();
  private readonly nexts = new Map<number, number>();
  private readonly pendingShown = new Set<bigint>();
  private readonly anims = new Map<bigint, number>();
  private readonly despawning = new Map<bigint, number>();
  private despawnOrder = 0;
  private fishing: FishingState | undefined;

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
      displays: this.displays,
      anims: this.anims,
      despawning: new Set(this.despawning.keys()),
      fishing: this.fishing && { ...this.fishing },
    };
  }

  customAnim({ guid, anim }: CustomAnim): void {
    this.anims.set(guid, anim);
    if (
      this.fishing &&
      this.fishing.bobber === guid &&
      this.fishing.phase === "waiting"
    ) {
      this.fishing = { bobber: guid, phase: "hooked" };
      this.events.emit({ type: "fish_hooked", bobber: guid });
    }
  }

  despawnAnim({ guid }: DespawnAnim): void {
    this.despawning.set(guid, this.despawnOrder++);
    while (this.despawning.size > DESPAWN_ANIM_MAX_ENTRIES) {
      let oldest: bigint | undefined;
      let at = Number.POSITIVE_INFINITY;
      for (const [id, order] of this.despawning) {
        if (order < at) {
          at = order;
          oldest = id;
        }
      }
      if (oldest === undefined) break;
      this.despawning.delete(oldest);
    }
  }

  spellStarted(packet: SpellStart): void {
    if (packet.caster !== this.deps.selfGuid()) return;
    if (packet.spellId !== FISHING_SPELL) return;
    if (this.fishing) return;
    this.fishing = { bobber: undefined, phase: "cast" };
  }

  spellFailed(packet: CastFailed): void {
    if (packet.spellId !== FISHING_SPELL) return;
    if (this.fishing?.phase !== "cast") return;
    this.fishing = undefined;
  }

  bobberSeen(guid: bigint): void {
    if (this.fishing?.phase !== "cast") return;
    const entity = this.deps.getEntity(guid);
    if (entity?.objectType !== GAMEOBJECT_TYPE) return;
    const fields = objectFields(entity);
    if (fields.createdBy !== this.deps.selfGuid()) return;
    this.fishing = { bobber: guid, phase: "waiting" };
  }

  entityGone(guid: bigint): void {
    this.anims.delete(guid);
    this.despawning.delete(guid);
    if (this.fishing?.bobber === guid) this.fishing = undefined;
  }

  notHooked(): void {
    if (!this.fishing) return;
    this.fishing = undefined;
    this.events.emit({ type: "fish_not_hooked" });
  }

  escaped(): void {
    if (!this.fishing) return;
    this.fishing = undefined;
    this.events.emit({ type: "fish_escaped" });
  }

  onEvent(cb: (event: ObjectsEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  template(reply: GameObjectQueryResult): void {
    if (reply.name === undefined) return;
    this.templates.set(reply.entry, gameObjectTemplate(reply));
    for (const guid of [...this.pendingShown]) {
      const object = this.object(guid);
      if (object?.entry !== reply.entry) continue;
      this.pendingShown.delete(guid);
      this.shown({ guid });
    }
  }

  loadingTriggers(): void {
    this.catalog = "loading";
  }

  loadingLocks(): void {
    this.locksState = "loading";
  }

  locksFailed(): void {
    this.locksState = "failed";
    const waiters = this.lockWaiters;
    this.lockWaiters = [];
    for (const waiter of waiters) waiter.resolve(undefined);
  }

  useLocks(catalog: LockCatalog): void {
    this.locksState = "ready";
    this.locks = catalog;
    const waiters = this.lockWaiters;
    this.lockWaiters = [];
    for (const waiter of waiters) waiter.resolve(catalog);
  }

  lockOf(entry: number) {
    return this.templates.get(entry)?.lockId;
  }

  lockEntry(lockId: number) {
    return this.locks?.get(lockId);
  }

  useDisplays(catalog: DisplayCatalog): void {
    this.displays = catalog;
  }

  displayOf(entry: number): number | undefined {
    return this.templates.get(entry)?.displayId;
  }

  boundsOf(displayId: number) {
    return this.displays?.get(displayId);
  }

  waitLocks(): Promise<LockCatalog | undefined> {
    if (this.locksState === "ready") return Promise.resolve(this.locks);
    if (this.locksState === "failed" || this.locksState === "none")
      return Promise.resolve(undefined);
    return new Promise<LockCatalog | undefined>((resolve) => {
      this.lockWaiters.push({ resolve });
    });
  }

  locksReady(): boolean {
    return this.locksState === "ready";
  }

  recordOpen(object: UseRecord, spellId: number): void {
    this.pending = { ...object, sentAt: this.deps.now() };
    this.events.emit({ ...object, how: "cast", spellId, type: "used" });
  }

  triggersFailed(): void {
    this.catalog = "failed";
  }

  useTriggers(catalog: AreaTriggerCatalog): void {
    this.catalog = "ready";
    this.triggers = catalog;
    this.watch = new TriggerWatch((map) => catalog.onMap(map));
    if (this.last) this.watch.arrive(this.last);
  }

  triggersNear(
    map: number,
    x: number,
    y: number,
    radius: number,
  ): readonly { id: number; x: number; y: number; z: number }[] {
    return (
      this.triggers
        ?.onMap(map)
        .filter((trigger) => Math.hypot(trigger.x - x, trigger.y - y) <= radius)
        .sort(
          (one, other) =>
            Math.hypot(one.x - x, one.y - y) -
            Math.hypot(other.x - x, other.y - y),
        )
        .map((trigger) => ({
          id: trigger.id,
          x: trigger.x,
          y: trigger.y,
          z: trigger.z,
        })) ?? []
    );
  }
  move(point: TriggerPoint): number[] {
    this.last = point;
    return this.watch?.move(point, { taxi: this.onTaxi() }) ?? [];
  }

  arrive(point: TriggerPoint): void {
    this.last = point;
    this.watch?.arrive(point);
  }

  entity(guid: bigint) {
    return this.deps.getEntity(guid);
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
    const kept = this.pages.get(firstPageId);
    if (kept) return [...kept];
    const open = this.chained.get(firstPageId);
    if (open) return open;
    const pages: PageText[] = [];
    this.chained.set(firstPageId, pages);
    return pages;
  }

  chainsFor(reply: PageTextReply): number[] {
    const firsts: number[] = [];
    const open = this.chained.get(reply.pageId);
    if (open && open.length === 0) firsts.push(reply.pageId);
    for (const [first, pages] of this.chained) {
      if (first === reply.pageId) continue;
      if (pages.length > 0 && this.nexts.get(first) === reply.pageId)
        firsts.push(first);
    }
    return firsts;
  }

  page(reply: PageTextReply): void {
    if (this.pages.has(reply.pageId)) return;
    const firsts = this.chainsFor(reply);
    if (firsts.length === 0) return;
    for (const first of firsts) {
      const pages = this.chained.get(first);
      if (!pages) continue;
      pages.push({ pageId: reply.pageId, text: reply.text });
      this.nexts.set(first, reply.nextPageId);
      if (reply.nextPageId === 0 || pages.length >= PAGE_READ_MAX_PAGES) {
        this.markRead({ firstPageId: first, pages });
        continue;
      }
      const suffix = this.pages.get(reply.nextPageId);
      if (suffix) {
        pages.push(...suffix.slice(0, PAGE_READ_MAX_PAGES - pages.length));
        this.markRead({ firstPageId: first, pages });
      }
    }
  }

  shown({ guid }: { guid: bigint }): void {
    const object = this.object(guid);
    if (!object) return;
    const template = this.templates.get(object.entry);
    if (!template) {
      this.pendingShown.add(guid);
      return;
    }
    if (!template.pageId) return;
    this.events.emit({ guid, pageId: template.pageId, type: "page_shown" });
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
