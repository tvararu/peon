import type { AreaEvent, CombatEvent, Unsubscribe } from "@peon/core";
import type { Game } from "#harness/loops/game";

export type Heard = CombatEvent | AreaEvent;

export function hearCasts(handle: Game) {
  return (cb: (event: Heard) => void): Unsubscribe => {
    const offCombat = handle.onCombatEvent(cb);
    const offArea = handle.onAreaEvent(cb);
    return () => {
      offCombat();
      offArea();
    };
  };
}
