import { Emitter, type Unsubscribe } from "#lib/emitter";
import type { GiverStatus } from "#wow/areas/quests/protocol";
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
import type { CoreStores, SessionDeps } from "#wow/session-stores";

export type QuestsState = { marks: Marks };
export type QuestsEvent = {
  type: "marks";
  source: MarkSource;
  changed: readonly bigint[];
  givers: readonly GiverMark[];
};

export class QuestsStore {
  private readonly events = new Emitter<[QuestsEvent]>();
  private readonly now: () => number;
  private marks: Marks = new Map();

  constructor(deps: SessionDeps, _core: CoreStores) {
    this.now = deps.now;
  }

  snapshot(): QuestsState {
    return { marks: new Map(this.marks) };
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
}
