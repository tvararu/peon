import { approached } from "#harness/loops/combat-progress";
import type { ControlPort } from "#harness/loops/ports";
import type { TacticsFrame } from "#harness/loops/tactics";

export const STALL_MS = 5000;
const UNREACHABLE = "target_unreachable";

type Stall = { at: number; range: number | undefined };

export type RouteStep = {
  control: Pick<ControlPort, "goTo" | "halt" | "navigationState">;
  guid: bigint;
  now: number;
  range: number | undefined;
  reachable: boolean;
};

export class StallRoute {
  private stall: Stall | undefined;
  private routing = false;

  reset(): void {
    this.stall = undefined;
    this.routing = false;
  }

  get routed(): boolean {
    return this.routing;
  }

  step(input: RouteStep): TacticsFrame["outcome"] {
    const { control, now, range, reachable } = input;
    if (reachable) {
      if (this.routing) control.halt("in_reach");
      this.reset();
      return undefined;
    }
    if (this.routing) return this.follow(input);
    const last = this.stall;
    if (!last || approached(range, last.range)) {
      this.stall = { at: now, range };
      return undefined;
    }
    last.range ??= range;
    if (now - last.at < STALL_MS) return undefined;
    return this.start(input);
  }

  private start(input: RouteStep): TacticsFrame["outcome"] {
    const { control, guid } = input;
    try {
      control.goTo(guid);
    } catch {
      return this.refused(input);
    }
    this.routing = true;
    return undefined;
  }

  private refused({ control, now, range }: RouteStep): TacticsFrame["outcome"] {
    if (control.navigationState().refusal === "unreachable")
      return { status: "blocked", reason: UNREACHABLE };
    this.stall = { at: now, range };
    return undefined;
  }

  private follow(input: RouteStep): TacticsFrame["outcome"] {
    const { now, range } = input;
    const { active, blockedReason, replan } = input.control.navigationState();
    if (active || replan?.pending) return undefined;
    this.routing = false;
    if (blockedReason !== undefined) return this.refused(input);
    this.stall = { at: now, range };
    return undefined;
  }
}
