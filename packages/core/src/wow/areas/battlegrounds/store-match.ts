import type {
  AreaSpiritHealerTime,
  PlayerPositions,
  PvpLogData,
} from "#wow/areas/battlegrounds/protocol-match";
import type { CoreStores, SessionDeps } from "#wow/session-stores";

export type BattlegroundsMatchScore = PvpLogData;

export type BattlegroundsMatch = {
  mapId: number;
  bgType: number;
  enteredAt: number;
  roster: readonly bigint[];
  score: BattlegroundsMatchScore | undefined;
  carriers: readonly { guid: bigint; x: number; y: number }[];
  rez: { guide: bigint; nextAt: number } | undefined;
};

export type BattlegroundsMatchState = {
  current: BattlegroundsMatch | undefined;
  spirit: { guide: bigint; nextAt: number } | undefined;
};

export type BattlegroundsMatchEntered = {
  type: "bg_entered";
  mapId: number;
  bgType: number;
};

export type BattlegroundsMatchLeft = {
  type: "bg_left_match";
  mapId: number | undefined;
};

export type BattlegroundsMatchPlayer = {
  type: "bg_player_joined" | "bg_player_left";
  guid: bigint;
};

export type BattlegroundsMatchScoreEvent = {
  type: "bg_score";
  score: BattlegroundsMatchScore;
};

export type BattlegroundsMatchCarriers = {
  type: "bg_carriers";
  positions: PlayerPositions;
};

export type BattlegroundsMatchRez = {
  type: "bg_rez_time";
  guide: bigint;
  nextAt: number;
  ms: number;
};

export type BattlegroundsMatchEvent =
  | BattlegroundsMatchEntered
  | BattlegroundsMatchLeft
  | BattlegroundsMatchPlayer
  | BattlegroundsMatchScoreEvent
  | BattlegroundsMatchCarriers
  | BattlegroundsMatchRez;

const BG_MAP_IDS: Record<number, true> = {
  30: true,
  489: true,
  529: true,
  566: true,
  607: true,
  628: true,
  726: true,
};

export function inBattlegroundMap(mapId: number): boolean {
  return BG_MAP_IDS[mapId] === true;
}

export class BattlegroundsMatchTracker {
  private current: BattlegroundsMatch | undefined;
  private spirit: { guide: bigint; nextAt: number } | undefined;

  private readonly deps: Pick<SessionDeps, "now">;
  private readonly core: Pick<CoreStores, "self">;
  private readonly active: () => { bgType: number; mapId: number } | undefined;
  private readonly emit: (event: BattlegroundsMatchEvent) => void;

  constructor(
    deps: Pick<SessionDeps, "now">,
    core: Pick<CoreStores, "self">,
    active: () => { bgType: number; mapId: number } | undefined,
    emit: (event: BattlegroundsMatchEvent) => void,
  ) {
    this.deps = deps;
    this.core = core;
    this.active = active;
    this.emit = emit;
  }

  snapshot(): BattlegroundsMatchState {
    return {
      current: this.current
        ? {
            ...this.current,
            carriers: [...this.current.carriers],
            roster: [...this.current.roster],
          }
        : undefined,
      spirit: this.spirit ? { ...this.spirit } : undefined,
    };
  }

  observeMap(mapId: number): void {
    const live = this.current;
    if (live !== undefined) {
      if (live.mapId === mapId) return;
      this.current = undefined;
      this.emit({ mapId: live.mapId, type: "bg_left_match" });
      return;
    }
    if (!inBattlegroundMap(mapId)) return;
    const slot = this.active();
    if (slot !== undefined && slot.mapId === mapId)
      this.open(slot.bgType, mapId);
  }

  observeStatus(kind: string, bgType: number, mapId: number): void {
    if (kind !== "active") return;
    if (this.core.self.mapId === mapId && this.current?.mapId !== mapId)
      this.open(bgType, mapId);
  }

  receivePlayer(guid: bigint, joined: boolean): void {
    const live = this.current;
    if (live === undefined) return;
    if (joined) {
      if (live.roster.includes(guid)) return;
      this.current = { ...live, roster: [...live.roster, guid] };
      this.emit({ guid, type: "bg_player_joined" });
      return;
    }
    if (!live.roster.includes(guid)) return;
    this.current = {
      ...live,
      roster: live.roster.filter((one) => one !== guid),
    };
    this.emit({ guid, type: "bg_player_left" });
  }

  receiveScore(score: PvpLogData): void {
    const live = this.current;
    if (live === undefined) return;
    this.current = { ...live, score };
    this.emit({ score, type: "bg_score" });
  }

  receivePositions(positions: PlayerPositions): void {
    const live = this.current;
    if (live === undefined) return;
    this.current = { ...live, carriers: positions.carriers };
    this.emit({ positions, type: "bg_carriers" });
  }

  receiveSpirit(time: AreaSpiritHealerTime): void {
    const row = { guide: time.guid, nextAt: this.deps.now() + time.ms };
    const live = this.current;
    if (live !== undefined) this.current = { ...live, rez: row };
    this.spirit = row;
    this.emit({
      guide: time.guid,
      ms: time.ms,
      nextAt: row.nextAt,
      type: "bg_rez_time",
    });
  }

  private open(bgType: number, mapId: number): void {
    this.current = {
      bgType,
      carriers: [],
      enteredAt: this.deps.now(),
      mapId,
      rez: this.spirit,
      roster: [],
      score: undefined,
    };
    this.emit({ bgType, mapId, type: "bg_entered" });
  }

  dispose(): void {
    this.current = undefined;
    this.spirit = undefined;
  }
}
