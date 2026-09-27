import type {
  ControlDeps,
  ControlMode,
  ControlPose,
  NavigationState,
} from "#wow/control";
import { MAX_DURATION_MS } from "#wow/control-motion";
import type { Guide, GuideStep, Mover } from "#wow/control-mover";
import type { Emit, MovementSync } from "#wow/control-sync";
import { distance2d } from "#wow/geometry";
import {
  classifyNavigationRefusal,
  type GroundRoute,
  type NavDestination,
  type NavigationRefusal,
  type NavPoint,
} from "#wow/navigation";
import { START_SNAP } from "#wow/navigation-collision";
import {
  REPLAN_LIMITS,
  type Replanner,
  RouteSession,
  replannable,
} from "#wow/route-session";

const ROUTE_HEARTBEAT_MS = 100;

export type RouteParts = {
  deps: ControlDeps;
  sync: MovementSync;
  mover: Mover;
  emit: Emit;
  mode: () => ControlMode;
};

export type RouteRefusal = {
  refusal?: NavigationRefusal;
  target?: bigint;
  floors?: readonly number[];
};

type RouteLeg = {
  route: GroundRoute;
  sync: MovementSync;
  follower: RouteFollower;
};

class RouteGuide implements Guide {
  readonly heartbeatMs = ROUTE_HEARTBEAT_MS;
  readonly route: GroundRoute;
  distance = 0;
  sampleFailure = false;
  private readonly sync: MovementSync;
  private readonly follower: RouteFollower;

  constructor({ route, sync, follower }: RouteLeg) {
    this.route = route;
    this.sync = sync;
    this.follower = follower;
  }

  advance(pose: ControlPose, yards: number, now: number): GuideStep {
    const { route } = this;
    const distance = Math.min(route.length, this.distance + yards);
    try {
      Object.assign(pose, route.sample(distance));
    } catch (error) {
      this.sampleFailure = true;
      const reason =
        error instanceof Error ? error.message : "navigation_sample_failed";
      return { fail: reason };
    }
    pose.source = "predicted";
    pose.updatedAt = now;
    this.distance = distance;
    this.follower.progressed(route.length - distance);
    return distance >= route.length ? { halt: "arrived" } : undefined;
  }

  leaseMs(): number {
    const { route, sync } = this;
    const speed = sync.runSpeed ?? Number.NaN;
    const ms = ((route.length - this.distance) / speed) * 1000;
    return Math.max(1, Math.min(MAX_DURATION_MS, ms));
  }

  end(reason: string): void {
    this.follower.ended(this, reason);
  }
}

export class RouteFollower {
  private readonly deps: ControlDeps;
  private readonly sync: MovementSync;
  private readonly mover: Mover;
  private readonly emit: Emit;
  private readonly mode: () => ControlMode;
  private active: RouteGuide | undefined;
  private session: RouteSession | undefined;
  private replanTimer: ReturnType<typeof setTimeout> | undefined;
  private navigation: NavigationState = {
    active: false,
    destination: undefined,
    remaining: undefined,
    owner: "none",
    blockedReason: undefined,
    refusal: undefined,
  };

  constructor({ deps, sync, mover, emit, mode }: RouteParts) {
    this.deps = deps;
    this.sync = sync;
    this.mover = mover;
    this.emit = emit;
    this.mode = mode;
  }

  following(): boolean {
    return this.active !== undefined;
  }

  state(): NavigationState {
    const { destination, floors } = this.navigation;
    return {
      ...this.navigation,
      destination: destination ? { ...destination } : undefined,
      ...(floors ? { floors: [...floors] } : {}),
    };
  }

  refuse(
    destination: NavDestination | undefined,
    reason: string,
    detail: RouteRefusal = {},
  ): void {
    const { refusal, target, floors } = detail;
    this.mover.abort(reason);
    this.navigation = {
      active: false,
      destination: destination ? { ...destination } : undefined,
      remaining: undefined,
      owner: "none",
      blockedReason: reason,
      refusal: refusal ?? classifyNavigationRefusal(reason),
      target,
      ...(floors ? { floors: [...floors] } : {}),
    };
    this.emit("control_error", reason);
  }

  navigate(
    route: GroundRoute,
    destination: NavPoint,
    replan?: Replanner,
    target?: bigint,
  ): void {
    this.mover.guard("forward");
    this.mover.stop("navigation_replaced", true);
    const origin = route.points[0];
    const pose = this.sync.requirePose();
    if (origin === undefined) throw new Error("navigation_route_empty");
    if (!startsUnder(origin, pose))
      throw new Error("navigation_origin_changed");
    this.session = replan
      ? new RouteSession(replan, route, this.deps.now())
      : undefined;
    this.start(route, destination, target);
  }

  observeDisappear(guid: bigint): void {
    if (this.navigation.target !== guid) return;
    if (this.active) this.mover.stop("target_lost", true);
    else this.cancelReplan("target_lost");
  }

  cancelReplan(reason: string): void {
    if (this.replanTimer === undefined) return;
    clearTimeout(this.replanTimer);
    this.replanTimer = undefined;
    this.session?.settle(this.deps.now());
    this.finishReplan(reason, false);
  }

  progressed(remaining: number): void {
    this.navigation.remaining = remaining;
  }

  ended(guide: RouteGuide, reason: string): void {
    if (this.active !== guide) return;
    this.active = undefined;
    const session = this.session;
    const replan =
      session !== undefined &&
      reason !== "arrived" &&
      replannable(reason, guide.sampleFailure);
    session?.walked(guide.distance, this.deps.now());
    if (replan) session?.interrupted(reason);
    else this.session = undefined;
    this.navigation = {
      ...this.navigation,
      active: false,
      owner: "none",
      blockedReason: reason === "arrived" ? undefined : reason,
      refusal:
        reason === "arrived" ? undefined : classifyNavigationRefusal(reason),
      replan: session?.snapshot(),
    };
    if (replan)
      this.replanTimer = setTimeout(
        () => this.replanNow(),
        REPLAN_LIMITS.delayMs,
      );
  }

  private start(
    route: GroundRoute,
    destination: NavDestination,
    target?: bigint,
  ): void {
    if (route.length === 0) {
      this.navigation = {
        active: false,
        destination,
        remaining: 0,
        owner: "none",
        blockedReason: undefined,
        refusal: undefined,
        replan: this.session?.snapshot(),
        target,
      };
      this.session = undefined;
      return;
    }
    this.mover.face(route.sample(0).orientation);
    const guide = new RouteGuide({ route, sync: this.sync, follower: this });
    const mode = this.mode();
    this.active = guide;
    this.navigation = {
      active: true,
      destination: { ...destination },
      remaining: route.length,
      owner: mode === "none" ? "manual" : mode,
      blockedReason: undefined,
      refusal: undefined,
      replan: this.session?.snapshot(),
      target,
    };
    const ms = (route.length / (this.sync.runSpeed ?? Number.NaN)) * 1000;
    this.mover.start("forward", Math.min(MAX_DURATION_MS, ms), guide);
  }

  private replanNow(): void {
    this.replanTimer = undefined;
    const session = this.session;
    const destination = this.navigation.destination;
    if (!(session && destination)) return;
    session.settle(this.deps.now());
    const { x, y, z } = this.sync.requirePose();
    const origin = { x, y, z };
    const limit = this.sync.blockReason() ?? session.limitReached(origin);
    if (limit) {
      this.finishReplan(limit, true);
      return;
    }
    let route: GroundRoute;
    try {
      route = session.replan(origin);
    } catch (error) {
      const raw = error instanceof Error ? error.message : "replan_failed";
      this.finishReplan(`replan_refused: ${raw}`, true);
      return;
    }
    session.planned(route);
    this.emit("control_changed", "replanned");
    this.start(route, destination, this.navigation.target);
  }

  private finishReplan(reason: string, error: boolean): void {
    const session = this.session;
    this.session = undefined;
    this.navigation = {
      ...this.navigation,
      active: false,
      owner: "none",
      blockedReason: reason,
      refusal: classifyNavigationRefusal(reason),
      replan: session?.snapshot(),
    };
    if (error) this.emit("control_error", reason);
  }
}

function startsUnder(origin: NavPoint, pose: NavPoint): boolean {
  const drop = pose.z - origin.z;
  return (
    distance2d(origin, pose) <= 1e-6 && drop >= -1e-6 && drop <= START_SNAP
  );
}
