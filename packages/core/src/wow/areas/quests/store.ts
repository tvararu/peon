import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  GiverStatus,
  GossipPoi,
  NpcText,
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
import {
  type GossipPoiEntry,
  greetingOf,
  type NpcTextChange,
  type NpcTexts,
  receivePoi,
  receiveText,
  requestText,
  textNoReply,
} from "#wow/areas/quests/store-text";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

export type PoiEntryView = {
  questId: number;
  status: "known" | "none";
  pois: QuestPoi[];
};
export type QuestsState = {
  marks: Marks;
  pois: Pois;
  texts: NpcTexts;
  gossipPoi: GossipPoiEntry | undefined;
};
export type QuestsEvent =
  | {
      type: "marks";
      source: MarkSource;
      changed: readonly bigint[];
      givers: readonly GiverMark[];
    }
  | { type: "poi"; questIds: readonly number[]; pois: readonly PoiEntryView[] }
  | NpcTextChange;

export class QuestsStore {
  private readonly events = new Emitter<[QuestsEvent]>();
  private readonly now: () => number;
  private marks: Marks = new Map();
  private pois: Pois = new Map();
  private texts: NpcTexts = new Map();
  private gossipPoi: GossipPoiEntry | undefined;

  private readonly core: CoreStores;

  constructor(deps: SessionDeps, core: CoreStores) {
    this.now = deps.now;
    this.core = core;
  }

  snapshot(): QuestsState {
    return {
      marks: new Map(this.marks),
      pois: new Map(this.pois),
      texts: new Map(this.texts),
      gossipPoi: this.gossipPoi,
    };
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

  greeting(textId: number): string | undefined {
    return greetingOf(this.texts.get(textId));
  }

  requestNpcText(textId: number, guid: bigint): boolean {
    const next = requestText(this.texts, textId, guid, this.now());
    this.texts = next.texts;
    return next.send;
  }

  receiveNpcText(text: NpcText): void {
    const guid = this.texts.get(text.textId)?.guid;
    const next = receiveText(this.texts, text, guid, this.now());
    this.texts = next.texts;
    this.events.emit(next.change);
  }

  npcTextNoReply(textId: number): void {
    if (this.texts.get(textId)?.status !== "pending") return;
    const next = textNoReply(this.texts, textId, this.now());
    this.texts = next.texts;
    this.events.emit(next.change);
  }

  receiveGossipPoi(poi: GossipPoi): void {
    const from = this.core.quests.snapshot().giver;
    const next = receivePoi(poi, from, this.now());
    this.gossipPoi = next.entry;
    this.events.emit(next.change);
  }

  dispose(): void {
    this.events.clear();
    this.marks = new Map();
    this.texts = new Map();
    this.gossipPoi = undefined;
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
