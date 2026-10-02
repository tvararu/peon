import { Emitter, type Unsubscribe } from "#lib/emitter";
import type { Entity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { PLAYER_FIELDS, UNIT_FIELDS } from "#wow/protocol/update-fields";
import type { SessionDeps } from "#wow/session-stores";

export const PVP_WANTS_FLAG = 0x200;
export const PVP_TIMER_FLAG = 0x40000;
export const PVP_CONTESTED_FLAG = 0x100;

export type BattlegroundsSelf = {
  wantsFlag: boolean;
  flagged: boolean;
  timer: boolean;
  contested: boolean;
  ffa: boolean;
  sanctuary: boolean;
  honor: number | undefined;
  arenaPoints: number | undefined;
  killsToday: number | undefined;
  killsYesterday: number | undefined;
  lifetimeKills: number | undefined;
  today: number | undefined;
  yesterday: number | undefined;
};

export type BattlegroundsFlag = {
  type: "pvp_flag";
  wants: boolean;
  flagged: boolean;
  timer: boolean;
  contested: boolean;
  ffa: boolean;
  sanctuary: boolean;
};

const EMPTY_SELF: BattlegroundsSelf = {
  arenaPoints: undefined,
  contested: false,
  ffa: false,
  flagged: false,
  honor: undefined,
  killsToday: undefined,
  killsYesterday: undefined,
  lifetimeKills: undefined,
  sanctuary: false,
  timer: false,
  today: undefined,
  wantsFlag: false,
  yesterday: undefined,
};

function read(entity: Entity, offset: number): number | undefined {
  return entity.rawFields.get(offset);
}

export function battlegroundsSelfOf(
  deps: Pick<SessionDeps, "getEntity" | "selfGuid">,
  guid: bigint,
): BattlegroundsSelf | undefined {
  if (guid !== deps.selfGuid()) return undefined;
  const entity = deps.getEntity(guid);
  if (!entity || entity.objectType !== ObjectType.PLAYER) return undefined;
  const playerFlags = read(entity, PLAYER_FIELDS.FLAGS.offset) ?? 0;
  const byte2 = read(entity, UNIT_FIELDS.BYTES_2.offset) ?? 0;
  const kills = read(entity, PLAYER_FIELDS.KILLS.offset);
  const today = read(entity, PLAYER_FIELDS.TODAY_CONTRIBUTION.offset);
  const yesterday = read(entity, PLAYER_FIELDS.YESTERDAY_CONTRIBUTION.offset);
  const lifetime = read(entity, PLAYER_FIELDS.LIFETIME_HONORBALE_KILLS.offset);
  const honor = read(entity, PLAYER_FIELDS.HONOR_CURRENCY.offset);
  const arena = read(entity, PLAYER_FIELDS.ARENA_CURRENCY.offset);
  return {
    arenaPoints: arena,
    contested: (playerFlags & PVP_CONTESTED_FLAG) !== 0,
    ffa: (byte2 & 0x04) !== 0,
    flagged: (byte2 & 0x01) !== 0,
    honor,
    killsToday: kills === undefined ? undefined : kills & 0xffff,
    killsYesterday: kills === undefined ? undefined : (kills >>> 16) & 0xffff,
    lifetimeKills: lifetime,
    sanctuary: (byte2 & 0x08) !== 0,
    timer: (playerFlags & PVP_TIMER_FLAG) !== 0,
    today,
    wantsFlag: (playerFlags & PVP_WANTS_FLAG) !== 0,
    yesterday,
  };
}

function flagsEqual(a: BattlegroundsSelf, b: BattlegroundsSelf): boolean {
  return (
    a.wantsFlag === b.wantsFlag &&
    a.flagged === b.flagged &&
    a.timer === b.timer &&
    a.contested === b.contested &&
    a.ffa === b.ffa &&
    a.sanctuary === b.sanctuary
  );
}

function flagEvent(self: BattlegroundsSelf): BattlegroundsFlag {
  return {
    contested: self.contested,
    ffa: self.ffa,
    flagged: self.flagged,
    sanctuary: self.sanctuary,
    timer: self.timer,
    type: "pvp_flag",
    wants: self.wantsFlag,
  };
}

export class BattlegroundsSelfTracker {
  private readonly events = new Emitter<[BattlegroundsFlag]>();
  private readonly deps: Pick<SessionDeps, "getEntity" | "selfGuid">;
  private self: BattlegroundsSelf = { ...EMPTY_SELF };

  constructor(deps: Pick<SessionDeps, "getEntity" | "selfGuid">) {
    this.deps = deps;
  }

  snapshot(): BattlegroundsSelf {
    return { ...this.self };
  }

  onEvent(cb: (event: BattlegroundsFlag) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  observe(guid: bigint): void {
    const next = battlegroundsSelfOf(this.deps, guid);
    if (!next) return;
    const before = this.self;
    this.self = { ...before, ...next };
    if (!flagsEqual(before, this.self)) this.events.emit(flagEvent(this.self));
  }

  dispose(): void {
    this.events.clear();
    this.self = { ...EMPTY_SELF };
  }
}
