import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Unsubscribe, WorldHandle } from "@peon/core";
import type { AreaClaimActs, AreaViews } from "#harness/areas/world";
import type { ConnectionState } from "#harness/contract/config";
import type { GameLogEntry } from "#harness/contract/log";
import type {
  ControlHolder,
  ControlOwner,
} from "#harness/runtime/control-owner";

export type Frozen<T> = unknown extends T
  ? T
  : T extends bigint | number | string | boolean | undefined | null
    ? T
    : T extends (...args: never[]) => unknown
      ? T
      : T extends ReadonlyMap<infer K, infer V>
        ? ReadonlyMap<K, Frozen<V>>
        : T extends ReadonlySet<infer V>
          ? ReadonlySet<Frozen<V>>
          : T extends readonly (infer E)[]
            ? readonly Frozen<E>[]
            : { readonly [K in keyof T]: Frozen<T[K]> };

type Reader<F> = F extends (...args: infer A) => infer R
  ? (...args: A) => Frozen<R>
  : never;

export type Sender<F> = F extends (...args: infer A) => infer R
  ? (...args: A) => Promise<Awaited<R>>
  : never;

export const READ_KEYS = [
  "getNearbyEntities",
  "getEntity",
  "queryNearby",
  "getRemotePoses",
  "getControlState",
  "getCombatState",
  "getPlaceState",
  "getPartyState",
  "getRecoveryState",
  "getQuestState",
  "getInventoryState",
  "getExperienceState",
  "getRewardsState",
  "observedPosition",
  "unitRelation",
  "unitAggroesSelf",
  "spellDefinition",
  "spellReadyAt",
  "itemLabel",
  "getCreatureInfo",
  "isAttackingSelf",
  "getSelfClass",
  "getActionBar",
] as const satisfies readonly (keyof WorldHandle)[];

export const EVENT_KEYS = [
  "onEntityEvent",
  "onControlEvent",
  "onCombatEvent",
  "onRecoveryEvent",
  "onQuestEvent",
  "onRewardsEvent",
  "onRemoteMotionEvent",
  "onMovementStop",
  "onMessage",
  "onGroupEvent",
  "onNotice",
  "onAreaEvent",
] as const satisfies readonly (keyof WorldHandle)[];

export const ACT_KEYS = [
  "move",
  "drive",
  "jump",
  "face",
  "faceGuid",
  "stopMoving",
  "selectTarget",
  "cast",
  "attack",
  "stopAttack",
  "cancelCast",
  "useItem",
  "talk",
  "openLoot",
  "takeLoot",
  "takeLootMoney",
  "releaseLoot",
  "sendSay",
  "sendWhisper",
] as const satisfies readonly (keyof WorldHandle)[];

export type WorldReads = {
  readonly [K in (typeof READ_KEYS)[number]]: Reader<WorldHandle[K]>;
};
export type WorldEvents = Readonly<
  Pick<WorldHandle, (typeof EVENT_KEYS)[number]>
>;
export type WorldActuators = {
  readonly [K in (typeof ACT_KEYS)[number]]: Sender<WorldHandle[K]>;
};

export type WorldSession = {
  readonly areas: AreaViews;
  readonly reads: WorldReads;
  readonly events: WorldEvents;
  readonly closed: Promise<void>;
};

export type WorldRefusal = "not_owner" | "offline";

export type Claim = {
  readonly owner: ControlOwner;
  readonly act: WorldActuators;
  readonly areas: AreaClaimActs;
  held: () => boolean;
  onLost: (cb: (to: ControlHolder) => void) => Unsubscribe;
  release: () => void;
};

export type ControlView = {
  owner: () => ControlHolder;
  onOwner: (cb: (owner: ControlHolder) => void) => Unsubscribe;
};

export type WorldService = {
  readonly version: 1;
  connection: () => ConnectionState;
  onConnection: (cb: (state: ConnectionState) => void) => Unsubscribe;
  current: () => WorldSession | undefined;
  onSession: (
    attach: (session: WorldSession) => Unsubscribe | undefined,
  ) => Unsubscribe;
  readonly control: ControlView;
  claim: (owner: ControlOwner, reason: string) => Claim | undefined;
  readonly log: {
    subscribe: (cb: (entry: Frozen<GameLogEntry>) => void) => Unsubscribe;
    recent: (n: number) => readonly Frozen<GameLogEntry>[];
  };
};

export const WORLD_READY = "peon:world/1:ready";
export const WORLD_REQUEST = "peon:world/1:request";

export function isWorld(data: unknown): data is WorldService {
  return (
    typeof data === "object" &&
    data !== null &&
    "version" in data &&
    data.version === 1 &&
    "claim" in data &&
    typeof data.claim === "function"
  );
}

export function onWorld(
  pi: Pick<ExtensionAPI, "events">,
  use: (world: WorldService) => void,
): Unsubscribe {
  let seen: WorldService | undefined;
  const take = (data: unknown) => {
    if (!isWorld(data) || data === seen) return;
    seen = data;
    use(data);
  };
  const off = pi.events.on(WORLD_READY, take);
  pi.events.emit(WORLD_REQUEST, take);
  return off;
}
