import type { CombatEvent, EntityEvent, WorldHandle } from "@peon/core";
import { engagedWith } from "#harness/areas/threat/reads";
import type {
  AttackLedger,
  Clock,
  OpsCtx,
  ViewCtx,
} from "#harness/contract/services";
import type { AttackerView, DangerView } from "#harness/contract/views";
import { guidHex } from "#harness/ops/refs";

export function selfHealthOf(
  handle: WorldHandle,
  event: EntityEvent,
): number | undefined {
  if (event.type !== "update" || !event.changed.includes("health")) return;
  const { entity } = event;
  if (!("health" in entity)) return;
  const { selfGuid } = handle.getControlState();
  return entity.guid === selfGuid ? entity.health : undefined;
}

export function createAttackLedger(clock: Clock): AttackLedger {
  const hits = new Map<bigint, number>();
  let last: bigint | undefined;
  let health: number | undefined;
  const onHealth = (handle: WorldHandle, now: number | undefined) => {
    if (now === undefined) return;
    const dropped = health !== undefined && now < health;
    health = now;
    if (!dropped) return;
    for (const guid of handle.getCombatState().attackers)
      hits.set(guid, clock.now());
  };
  return {
    attach(handle) {
      hits.clear();
      last = undefined;
      health = handle.getCombatState().self.health;
      const offs = [
        handle.onCombatEvent((event) => {
          if (event.type !== "attacked" || event.attacker === undefined) return;
          last = event.attacker;
        }),
        handle.onEntityEvent((event) =>
          onHealth(handle, selfHealthOf(handle, event)),
        ),
      ];
      return () => {
        for (const off of offs) off();
      };
    },
    lastAttacker: () => last,
    lastHitAt: (guid) => hits.get(guid),
  };
}

export function nameOf({ handle, rt }: ViewCtx, guid: bigint): string {
  const entity = handle
    .getNearbyEntities()
    .find((candidate) => candidate.guid === guid);
  return entity?.name ?? rt.sightings.get(guid)?.name ?? "an unknown unit";
}

function distanceOf({ handle }: ViewCtx, guid: bigint): number | undefined {
  const distance = handle
    .queryNearby({ all: true })
    .find((row) => row.entity.guid === guid)?.distance;
  return typeof distance === "number" ? distance : undefined;
}

function attackerView(ctx: ViewCtx, guid: bigint): AttackerView {
  const { rt } = ctx;
  const hitAt = rt.attacks.lastHitAt(guid);
  const hitAgoMs = hitAt === undefined ? undefined : rt.clock.now() - hitAt;
  return {
    distance: distanceOf(ctx, guid),
    guid: guidHex(guid),
    hitAgoMs,
    name: nameOf(ctx, guid),
    ref: rt.refs.refOf(guid),
  };
}

function attackersOf(handle: WorldHandle): bigint[] {
  const { attackers } = handle.getCombatState();
  const { selfGuid } = handle.getControlState();
  const engaged = engagedWith(handle.threat.state(), selfGuid);
  return [...new Set([...attackers, ...engaged])];
}

export function dangerView(ctx: ViewCtx): DangerView {
  const { self } = ctx.handle.getCombatState();
  const { health, maxHealth } = self;
  const hpPct =
    health !== undefined && maxHealth
      ? Math.round((health / maxHealth) * 100)
      : 100;
  const attackers = attackersOf(ctx.handle);
  return { attackers: attackers.map((guid) => attackerView(ctx, guid)), hpPct };
}

export function dangerLine(
  { attackers, hpPct }: DangerView,
  opts: { still?: boolean } = {},
): string | undefined {
  const [first] = attackers;
  if (!first) return;
  const hp = `You are at ${hpPct}% HP.`;
  const still = opts.still ? "still " : "";
  if (attackers.length > 1)
    return `Danger: ${first.name} ${first.ref} and ${attackers.length - 1} more are ${still}attacking you. ${hp}`;
  if (first.hitAgoMs === undefined) {
    const yd =
      first.distance === undefined ? "" : ` (${Math.round(first.distance)} yd)`;
    return `Danger: ${first.name} ${first.ref} is ${still}coming at you${yd}. ${hp}`;
  }
  const ago = Math.round(first.hitAgoMs / 1000);
  return `Danger: ${first.name} ${first.ref} is ${still}attacking you (hit you ${ago} s ago). ${hp}`;
}

export type InterruptRules = {
  newAttacker: boolean;
  rooted: boolean;
  death: boolean;
};
export type InterruptCause = {
  code: "attacked" | "rooted" | "died" | "breath";
  detail: string;
  attacker: bigint | undefined;
};
export type InterruptWatch = {
  signal: AbortSignal;
  cause: () => InterruptCause | undefined;
  dispose: () => void;
};

type Fire = (cause: InterruptCause) => void;
type AttackWatch = {
  ctx: OpsCtx;
  event: CombatEvent;
  fire: Fire;
  known: Set<bigint>;
  rules: InterruptRules;
};

const ROOTED: InterruptCause = {
  attacker: undefined,
  code: "rooted",
  detail: "you cannot move (rooted).",
};
const DIED: InterruptCause = {
  attacker: undefined,
  code: "died",
  detail: "you died.",
};

function breathCause(remainingMs: number): InterruptCause {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  return {
    attacker: undefined,
    code: "breath",
    detail: `Surface now: you have ${seconds} s of breath.`,
  };
}

function onAttacked({ ctx, event, fire, known, rules }: AttackWatch): void {
  if (event.type !== "attacked") return;
  const guid =
    event.attacker ??
    event.state.attackers.find((candidate) => !known.has(candidate));
  noteAttacker({ ctx, fire, known, rules }, guid);
}

function noteAttacker(
  { ctx, fire, known, rules }: Omit<AttackWatch, "event">,
  guid: bigint | undefined,
): void {
  if (guid === undefined || known.has(guid)) return;
  known.add(guid);
  if (rules.newAttacker)
    fire({
      attacker: guid,
      code: "attacked",
      detail: `${nameOf(ctx, guid)} ${ctx.rt.refs.refOf(guid)} attacked you.`,
    });
}

export function watchInterrupts(
  ctx: OpsCtx,
  rules: InterruptRules,
): InterruptWatch {
  const { handle, signal } = ctx;
  const controller = new AbortController();
  const known = new Set(attackersOf(handle));
  let cause: InterruptCause | undefined;
  const fire: Fire = (next) => {
    if (controller.signal.aborted) return;
    cause = next;
    controller.abort(new Error(next.code));
  };
  const follow = () => controller.abort(signal.reason);
  const offs = [
    handle.onCombatEvent((event) =>
      onAttacked({ ctx, event, fire, known, rules }),
    ),
    handle.threat.onEvent((event) => {
      if (
        event.type === "victim_changed" &&
        event.to === handle.getControlState().selfGuid
      )
        noteAttacker({ ctx, fire, known, rules }, event.unit);
    }),
    handle.onControlEvent((event) => {
      if (rules.rooted && event.state.blockedReason === "rooted") fire(ROOTED);
    }),
    handle.selfstate.onEvent((event) => {
      if (event.type === "breath_low") fire(breathCause(event.remainingMs));
    }),
    handle.onRecoveryEvent((event) => {
      if (
        rules.death &&
        event.type === "life_observed" &&
        event.state.life === "dead"
      )
        fire(DIED);
    }),
  ];
  if (signal.aborted) follow();
  else signal.addEventListener("abort", follow, { once: true });
  return {
    cause: () => cause,
    dispose() {
      for (const off of offs) off();
      signal.removeEventListener("abort", follow);
    },
    signal: controller.signal,
  };
}
