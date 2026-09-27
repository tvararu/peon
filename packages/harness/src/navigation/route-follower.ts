import {
  type ControlOwner,
  type ControlPose,
  type ControlState,
  distance2d,
  type GuideStep,
  MAX_DURATION_MS,
  type MovementGuide,
  type NavPoint,
  type Unsubscribe,
  type WorldHandle,
} from "@peon/core";
import { START_SNAP } from "#harness/navigation/collision";
import {
  classifyNavigationRefusal,
  type GroundRoute,
  type NavDestination,
  type NavigationRefusal,
} from "#harness/navigation/planner";
import {
  REPLAN_LIMITS,
  type Replanner,
  type ReplanState,
  RouteSession,
  replannable,
} from "#harness/navigation/route-session";

const ROUTE_HEARTBEAT_MS = 100;

export type NavigationState = {
  active: boolean;
  destination: NavDestination | undefined;
  remaining: number | undefined;
  owner: ControlOwner;
  blockedReason: string | undefined;
  refusal: NavigationRefusal | undefined;
  target?: bigint;
  replan?: ReplanState;
  floors?: number[];
};

export type RouteHandle = Pick<
  WorldHandle,
  | "getControlState"
  | "follow"
  | "stopMoving"
  | "onMovementStop"
  | "onEntityEvent"
>;

export type RouteParts = { handle: RouteHandle; now: () => number };

export type RouteRefusal = {
  refusal?: NavigationRefusal;
  target?: bigint;
  floors?: readonly number[];
};

type RouteLeg = {
  route: GroundRoute;
  follower: RouteFollower;
  speed: () => number;
};

class RouteGuide implements MovementGuide {
  readonly heartbeatMs = ROUTE_HEARTBEAT_MS;
  readonly route: GroundRoute;
  distance = 0;
  sampleFailure = false;
  private readonly follower: RouteFollower;
  private readonly speed: () => number;

  constructor({ route, follower, speed }: RouteLeg) {
    this.route = route;
    this.follower = follower;
    this.speed = speed;
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
    const ms = ((this.route.length - this.distance) / this.speed()) * 1000;
    return Math.max(1, Math.min(MAX_DURATION_MS, ms));
  }

  end(reason: string): void {
    this.follower.ended(this, reason);
  }
}

export class RouteFollower {
  private readonly handle: RouteHandle;
  private readonly now: () => number;
  private readonly detach: Unsubscribe[];
  private active: RouteGuide | undefined;
  private session: RouteSession | undefined;
  private replanTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private navigation: NavigationState = {
    active: false,
    blockedReason: undefined,
    destination: undefined,
    owner: "none",
    refusal: undefined,
    remaining: undefined,
  };

  constructor({ handle, now }: RouteParts) {
    this.handle = handle;
    this.now = now;
    this.detach = [
      handle.onMovementStop((reason) => this.cancelReplan(reason)),
      handle.onEntityEvent((event) => {
        if (event.type === "disappear") this.observeDisappear(event.guid);
      }),
    ];
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
    this.handle.stopMoving(reason);
    this.navigation = {
      active: false,
      blockedReason: reason,
      destination: destination ? { ...destination } : undefined,
      owner: "none",
      refusal: refusal ?? classifyNavigationRefusal(reason),
      remaining: undefined,
      target,
      ...(floors ? { floors: [...floors] } : {}),
    };
  }

  navigate(
    route: GroundRoute,
    destination: NavPoint,
    replan?: Replanner,
    target?: bigint,
  ): void {
    guard(this.handle.getControlState());
    this.handle.stopMoving("navigation_replaced");
    const origin = route.points[0];
    const pose = this.handle.getControlState().pose;
    if (!pose) throw new Error("no_pose");
    if (origin === undefined) throw new Error("navigation_route_empty");
    if (!startsUnder(origin, pose))
      throw new Error("navigation_origin_changed");
    this.session = replan
      ? new RouteSession(replan, route, this.now())
      : undefined;
    this.start(route, destination, target);
  }

  observeDisappear(guid: bigint): void {
    if (this.navigation.target !== guid) return;
    if (this.active) this.handle.stopMoving("target_lost");
    else this.cancelReplan("target_lost");
  }

  cancelReplan(reason: string): void {
    if (this.replanTimer === undefined) return;
    clearTimeout(this.replanTimer);
    this.replanTimer = undefined;
    this.session?.settle(this.now());
    this.finishReplan(reason);
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
    session?.walked(guide.distance, this.now());
    if (replan) session?.interrupted(reason);
    else this.session = undefined;
    this.navigation = {
      ...this.navigation,
      active: false,
      blockedReason: reason === "arrived" ? undefined : reason,
      owner: "none",
      refusal:
        reason === "arrived" ? undefined : classifyNavigationRefusal(reason),
      replan: session?.snapshot(),
    };
    if (replan && !this.disposed)
      this.replanTimer = setTimeout(
        () => this.replanNow(),
        REPLAN_LIMITS.delayMs,
      );
  }

  dispose(): void {
    if (this.disposed) return;
    if (this.active) this.handle.stopMoving("close");
    this.disposed = true;
    for (const off of this.detach) off();
    if (this.replanTimer !== undefined) clearTimeout(this.replanTimer);
    this.replanTimer = undefined;
  }

  private start(
    route: GroundRoute,
    destination: NavDestination,
    target?: bigint,
  ): void {
    if (route.length === 0) {
      this.navigation = {
        active: false,
        blockedReason: undefined,
        destination,
        owner: "none",
        refusal: undefined,
        remaining: 0,
        replan: this.session?.snapshot(),
        target,
      };
      this.session = undefined;
      return;
    }
    const state = this.handle.getControlState();
    const speed = () => speedOf(this.handle.getControlState());
    const guide = new RouteGuide({ follower: this, route, speed });
    this.active = guide;
    this.navigation = {
      active: true,
      blockedReason: undefined,
      destination: { ...destination },
      owner: state.owner === "loop" ? "loop" : "manual",
      refusal: undefined,
      remaining: route.length,
      replan: this.session?.snapshot(),
      target,
    };
    const ms = (route.length / speedOf(state)) * 1000;
    const facing = route.sample(0).orientation;
    try {
      this.handle.follow(guide, facing, Math.min(MAX_DURATION_MS, ms));
    } catch (error) {
      this.active = undefined;
      throw error;
    }
  }

  private replanNow(): void {
    this.replanTimer = undefined;
    const session = this.session;
    const destination = this.navigation.destination;
    if (!(session && destination)) return;
    session.settle(this.now());
    const state = this.handle.getControlState();
    const { pose } = state;
    const origin = pose && { x: pose.x, y: pose.y, z: pose.z };
    const blocked = state.movementAllowed ? undefined : state.blockedReason;
    const limit =
      blocked ?? (origin ? session.limitReached(origin) : "no_pose");
    if (limit || !origin) {
      this.finishReplan(limit ?? "no_pose");
      return;
    }
    try {
      const route = session.replan(origin);
      session.planned(route);
      this.start(route, destination, this.navigation.target);
    } catch (error) {
      const raw = error instanceof Error ? error.message : "replan_failed";
      this.finishReplan(`replan_refused: ${raw}`);
    }
  }

  private finishReplan(reason: string): void {
    const session = this.session;
    this.session = undefined;
    this.navigation = {
      ...this.navigation,
      active: false,
      blockedReason: reason,
      owner: "none",
      refusal: classifyNavigationRefusal(reason),
      replan: session?.snapshot(),
    };
  }
}

function guard(state: ControlState): void {
  if (!state.movementAllowed) throw new Error(state.blockedReason);
  if (!state.pose) throw new Error("no_pose");
}

function speedOf(state: ControlState): number {
  return state.speed > 0 ? state.speed : Number.NaN;
}

function startsUnder(origin: NavPoint, pose: NavPoint): boolean {
  const drop = pose.z - origin.z;
  return (
    distance2d(origin, pose) <= 1e-6 && drop >= -1e-6 && drop <= START_SNAP
  );
}
