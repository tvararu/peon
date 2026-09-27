import { distance2d, type WorldHandle } from "@peon/core";

export const CYCLE_APPROACH_YD = 30;
export const CYCLE_WITHIN_YD = 25;
const TICK_MS = 250;
const UNREACHABLE = "target_unreachable";
const HALT = "cycle_approach";

export type CycleApproach = (
  guid: bigint,
  signal: AbortSignal,
) => Promise<string | undefined>;

export type ApproachDeps = {
  gap: (guid: bigint) => number;
  goTo: (guid: bigint) => void;
  halt: (reason: string) => void;
  navigation: () => { active: boolean; blockedReason: string | undefined };
  tick?: () => Promise<void>;
};

export async function approachUnit(
  deps: ApproachDeps,
  guid: bigint,
  signal: AbortSignal,
): Promise<string | undefined> {
  const far = deps.gap(guid) > CYCLE_APPROACH_YD;
  if (!far || signal.aborted) return undefined;
  try {
    deps.goTo(guid);
  } catch {
    return UNREACHABLE;
  }
  const tick = deps.tick ?? (() => Bun.sleep(TICK_MS));
  for (;;) {
    if (signal.aborted || deps.gap(guid) <= CYCLE_WITHIN_YD) {
      deps.halt(HALT);
      return undefined;
    }
    const route = deps.navigation();
    if (!route.active)
      return route.blockedReason === undefined ? undefined : UNREACHABLE;
    await tick();
  }
}

export function handleApproach(handle: WorldHandle): ApproachDeps {
  return {
    gap(guid) {
      const pose = handle.getControlState().pose;
      if (!pose) return Number.NaN;
      try {
        return distance2d(pose, handle.observedPosition(guid));
      } catch {
        return Number.NaN;
      }
    },
    goTo: (guid) => handle.goTo({ guid, kind: "guid" }),
    halt: (reason) => handle.stopMoving(reason),
    navigation() {
      const { active, blockedReason, replan } = handle.getNavigationState();
      return { active: active || replan?.pending === true, blockedReason };
    },
  };
}
