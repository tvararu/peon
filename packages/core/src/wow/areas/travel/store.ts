import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  BinderConfirm,
  BindPoint,
  PlayerBound,
} from "#wow/areas/travel/protocol";

export const BIND_OFFER_TTL_MS = 60_000;

export type TravelOffer = { npc: bigint; at: number };
export type TravelBound = { binder: bigint; areaId: number; at: number };
export type TravelState = {
  home: BindPoint | undefined;
  offer: TravelOffer | undefined;
  lastBound: TravelBound | undefined;
  bindPending: bigint | undefined;
};
export type TravelEvent =
  | ({ type: "bind_point"; reason: "login" | "bound" } & BindPoint)
  | { type: "bind_offer"; npc: bigint }
  | { type: "bound"; binder: bigint; areaId: number };

export function createTravelStore(now: () => number) {
  const events = new Emitter<[TravelEvent]>();
  let home: BindPoint | undefined;
  let offer: TravelOffer | undefined;
  let lastBound: TravelBound | undefined;
  let bindPending: bigint | undefined;

  const freshOffer = () =>
    offer && now() - offer.at <= BIND_OFFER_TTL_MS ? { ...offer } : undefined;

  return {
    snapshot: (): TravelState => ({
      home: home && { ...home },
      offer: freshOffer(),
      lastBound: lastBound && { ...lastBound },
      bindPending,
    }),
    onEvent: (cb: (event: TravelEvent) => void): Unsubscribe =>
      events.subscribe(cb),
    receiveBindPoint(point: BindPoint): void {
      home = { ...point };
      offer = undefined;
      const reason = bindPending === undefined ? "login" : "bound";
      events.emit({ type: "bind_point", reason, ...point });
    },
    receiveBinderConfirm({ npc }: BinderConfirm): void {
      offer = { npc, at: now() };
      events.emit({ type: "bind_offer", npc });
    },
    receivePlayerBound({ binder, areaId }: PlayerBound): void {
      lastBound = { binder, areaId, at: now() };
      events.emit({ type: "bound", binder, areaId });
    },
    beginBind(npc: bigint): void {
      bindPending = npc;
    },
    endBind(): void {
      bindPending = undefined;
    },
    dispose(): void {
      events.clear();
    },
  };
}

export type TravelStore = ReturnType<typeof createTravelStore>;
