import { Emitter, type Unsubscribe } from "#lib/emitter";
import type { GameObjectTemplateRow } from "#wow/areas/transports/protocol";
import type { SessionDeps } from "#wow/session-stores";

export const MO_TRANSPORT_GUID_HIGH = 0x1f_c0n;
export const LIFT_GUID_HIGH = 0xf1_20n;

export type TransportKind = "motion" | "lift";

export type TransportEntry = {
  guid: bigint;
  entry: number;
  kind: TransportKind;
  mapId: number;
  pose: { x: number; y: number; z: number; orientation: number };
  pathRotation: number;
  pathProgress: number;
  receivedAt: number;
};

export type TransportsData =
  | { status: "missing"; pathCount: number; animCount: number }
  | { status: "ready"; pathCount: number; animCount: number };

export type TransportsEvent =
  | { type: "transport_seen"; guid: bigint }
  | { type: "transport_gone"; guid: bigint };

export type TransportsState = {
  transports: ReadonlyMap<bigint, TransportEntry>;
  templates: ReadonlyMap<number, GameObjectTemplateRow>;
  data: TransportsData;
};

function emptyData(): TransportsData {
  return { status: "missing", pathCount: 0, animCount: 0 };
}

export class TransportsStore {
  private readonly deps: SessionDeps;
  private readonly now: () => number;
  private readonly transports = new Map<bigint, TransportEntry>();
  private readonly templates = new Map<number, GameObjectTemplateRow>();
  private data: TransportsData = emptyData();
  private readonly events = new Emitter<[TransportsEvent]>();
  private readonly pending: TransportsEvent[] = [];
  private emitting = false;

  constructor(deps: SessionDeps, init?: { now?: () => number }) {
    this.deps = deps;
    this.now = init?.now ?? deps.now;
  }

  snapshot(): TransportsState {
    return {
      transports: new Map(this.transports),
      templates: new Map(this.templates),
      data: { ...this.data },
    };
  }

  onEvent(cb: (event: TransportsEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  dispose(): void {
    this.transports.clear();
    this.templates.clear();
  }

  private queue(event: TransportsEvent): void {
    this.pending.push(event);
    if (this.emitting) return;
    this.emitting = true;
    try {
      while (this.pending.length > 0) {
        const next = this.pending.shift();
        if (next) this.events.emit(next);
      }
    } finally {
      this.emitting = false;
    }
  }

  receiveCreated(init: {
    guid: bigint;
    entry: number;
    mapId: number;
    pose: TransportEntry["pose"];
    pathRotation: number;
    pathProgress: number | undefined;
  }): void {
    const high = init.guid >> 48n;
    let kind: TransportKind | undefined;
    if (high === MO_TRANSPORT_GUID_HIGH) kind = "motion";
    else if (high === LIFT_GUID_HIGH) kind = "lift";
    if (kind === undefined) return;
    this.transports.set(init.guid, {
      guid: init.guid,
      entry: init.entry,
      kind,
      mapId: init.mapId,
      pose: { ...init.pose },
      pathRotation: init.pathRotation,
      pathProgress: init.pathProgress ?? 0,
      receivedAt: this.now(),
    });
    this.queue({ guid: init.guid, type: "transport_seen" });
  }

  receiveDestroyed(guid: bigint): void {
    if (!this.transports.delete(guid)) return;
    this.queue({ guid, type: "transport_gone" });
  }

  receiveTemplate(row: GameObjectTemplateRow): void {
    this.templates.set(row.entry, { ...row });
  }

  setModel(paths: number, anims: number): void {
    this.data = { status: "ready", pathCount: paths, animCount: anims };
  }

  setMissing(): void {
    this.data = emptyData();
  }

  setData(model: { paths: { size: number }; anims: { size: number } }): void {
    this.setModel(model.paths.size, model.anims.size);
  }

  entityEntry(guid: bigint): number | undefined {
    return this.deps.getEntity(guid)?.entry;
  }
}
