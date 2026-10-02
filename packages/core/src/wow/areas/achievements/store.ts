import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  AchievementEarned,
  AchievementId,
  ServerFirst,
  TitleEarned,
} from "#wow/areas/achievements/protocol";
import type {
  AchievementData,
  CriteriaProgress,
} from "#wow/protocol/achievement-data";
import type { PackedTime } from "#wow/protocol/packed-time";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

const RECENT = 5;

export type RecentAchievement = { id: number; at: PackedTime };
export type AchievementsState = {
  count: number;
  recent: readonly RecentAchievement[];
  criteria: number;
  titles: { known: readonly number[]; chosen: number };
};
export type AchievementsEvent =
  | { type: "achievement_earned"; guid: bigint; self: boolean; id: number }
  | { type: "achievement_removed"; id: number }
  | { type: "criteria_removed"; id: number }
  | { type: "title_changed"; bit: number; earned: boolean }
  | { type: "server_first"; name: string; guid: bigint; id: number };

function timeKey(at: PackedTime): number {
  return (
    (((at.year * 13 + at.month) * 32 + at.day) * 24 + at.hour) * 60 + at.minute
  );
}

export class AchievementStore {
  private readonly events = new Emitter<[AchievementsEvent]>();
  private readonly done = new Map<number, PackedTime>();
  private readonly criteria = new Map<number, CriteriaProgress>();
  private readonly knownTitles = new Set<number>();
  private chosenTitle = 0;
  private readonly selfGuid: () => bigint;

  constructor(deps: SessionDeps, _core: CoreStores) {
    this.selfGuid = deps.selfGuid;
  }

  snapshot(): AchievementsState {
    const recent = [...this.done]
      .reverse()
      .map(([id, at]) => ({ id, at }))
      .sort((a, b) => timeKey(b.at) - timeKey(a.at))
      .slice(0, RECENT);
    return {
      count: this.done.size,
      recent,
      criteria: this.criteria.size,
      titles: {
        chosen: this.chosenTitle,
        known: [...this.knownTitles].sort((a, b) => a - b),
      },
    };
  }

  onEvent(cb: (event: AchievementsEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  counter(id: number): bigint | undefined {
    return this.criteria.get(id)?.counter;
  }

  replace(data: AchievementData): void {
    this.done.clear();
    this.criteria.clear();
    for (const { id, at } of data.done) this.done.set(id, at);
    for (const entry of data.criteria) this.criteria.set(entry.id, entry);
  }

  setCriteria(entry: CriteriaProgress): void {
    this.criteria.set(entry.id, entry);
  }

  earned(packet: AchievementEarned): void {
    const self = packet.guid === this.selfGuid();
    if (self) {
      this.done.delete(packet.id);
      this.done.set(packet.id, packet.at);
    }
    this.events.emit({
      type: "achievement_earned",
      guid: packet.guid,
      self,
      id: packet.id,
    });
  }

  removeAchievement(packet: AchievementId): void {
    this.done.delete(packet.id);
    this.events.emit({ type: "achievement_removed", id: packet.id });
  }

  removeCriteria(packet: AchievementId): void {
    this.criteria.delete(packet.id);
    this.events.emit({ type: "criteria_removed", id: packet.id });
  }

  knows(bit: number): boolean {
    return this.knownTitles.has(bit);
  }

  setTitles(bits: readonly number[], chosen: number): void {
    this.knownTitles.clear();
    for (const bit of bits) this.knownTitles.add(bit);
    this.chosenTitle = chosen;
  }

  titleEarned(packet: TitleEarned): void {
    if (packet.earned) this.knownTitles.add(packet.bit);
    else this.knownTitles.delete(packet.bit);
    this.events.emit({
      bit: packet.bit,
      earned: packet.earned,
      type: "title_changed",
    });
  }

  serverFirst(packet: ServerFirst): void {
    this.events.emit({
      type: "server_first",
      name: packet.name,
      guid: packet.guid,
      id: packet.id,
    });
  }

  dispose(): void {
    this.events.clear();
    this.done.clear();
    this.criteria.clear();
    this.knownTitles.clear();
    this.chosenTitle = 0;
  }
}
