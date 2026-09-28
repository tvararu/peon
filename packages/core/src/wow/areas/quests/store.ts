import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  GiverStatus,
  QuestPoi,
  QuestPoiReply,
} from "#wow/areas/quests/protocol";
import {
  forget,
  type GiverMark,
  giversOf,
  type MarkSource,
  type Marks,
  type MarksChange,
  receiveMultiple,
  receiveSingle,
} from "#wow/areas/quests/store-marks";
import {
  expirePois,
  type Pois,
  type PoisChange,
  receivePoiResponse,
  refreshAbsentPois,
  requestPois,
} from "#wow/areas/quests/store-poi";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

export type PoiEntryView = {
  questId: number;
  status: "known" | "none";
  pois: QuestPoi[];
};
export type QuestsState = { marks: Marks; pois: Pois };
export type QuestsEvent =
  | {
      type: "marks";
      source: MarkSource;
      changed: readonly bigint[];
      givers: readonly GiverMark[];
    }
  | { type: "poi"; questIds: readonly number[]; pois: readonly PoiEntryView[] };

export class QuestsStore {
  private readonly events = new Emitter<[QuestsEvent]>();
  private readonly now: () => number;
  private marks: Marks = new Map();
  private pois: Pois = new Map();

  constructor(deps: SessionDeps, _core: CoreStores) {
    this.now = deps.now;
  }

  snapshot(): QuestsState {
    return { marks: new Map(this.marks), pois: new Map(this.pois) };
  }

  onEvent(cb: (event: QuestsEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  hasMark(guid: bigint): boolean {
    return this.marks.has(guid);
  }

  receiveMultiple(givers: readonly GiverStatus[]): void {
    this.applyMarks(
      receiveMultiple(this.marks, givers, this.now()),
      "multiple",
    );
  }

  receiveSingle(giver: GiverStatus): void {
    this.applyMarks(receiveSingle(this.marks, giver, this.now()), "single");
  }

  forget(guid: bigint): void {
    this.marks = forget(this.marks, guid);
  }

  dispose(): void {
    this.events.clear();
    this.marks = new Map();
    this.pois = new Map();
  }

  queryPois(ids: readonly number[]): number[] {
    const { pois, requested } = requestPois(this.pois, ids, this.now());
    this.pois = pois;
    return requested;
  }

  refreshAbsentPois(ids: readonly number[]): void {
    this.pois = refreshAbsentPois(this.pois, ids);
  }

  receivePoiResponse(replies: readonly QuestPoiReply[]): void {
    this.applyPois(receivePoiResponse(this.pois, replies, this.now()));
  }

  expirePois(pending: readonly number[]): void {
    this.applyPois(expirePois(this.pois, pending, this.now()));
  }

  poiOf(ids: readonly number[]): PoiEntryView[] {
    const out: PoiEntryView[] = [];
    for (const id of ids) {
      const entry = this.pois.get(id);
      if (entry && entry.status !== "pending" && entry.status !== "no_reply")
        out.push({ questId: id, status: entry.status, pois: entry.pois });
    }
    return out;
  }

  private applyMarks(change: MarksChange, source: MarkSource): void {
    this.marks = change.marks;
    if (change.changed.length === 0) return;
    this.events.emit({
      type: "marks",
      source,
      changed: change.changed,
      givers: giversOf(this.marks),
    });
  }

  private applyPois(change: PoisChange): void {
    this.pois = change.pois;
    if (change.settled.length === 0) return;
    this.events.emit({
      type: "poi",
      questIds: change.settled,
      pois: this.poiOf(change.settled),
    });
  }
}
