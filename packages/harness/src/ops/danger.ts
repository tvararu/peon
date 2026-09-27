import type { CombatEvent } from "@tuicraft/core";
import type {
  AttackLedger,
  Clock,
  OpsCtx,
  ViewCtx,
} from "#harness/contract/services";
import type { AttackerView, DangerView } from "#harness/contract/views";
import { guidHex } from "#harness/ops/refs";

export function createAttackLedger(clock: Clock): AttackLedger {
  const hits = new Map<bigint, number>();
  let last: bigint | undefined;
  return {
    attach(handle) {
      hits.clear();
      last = undefined;
      return handle.onCombatEvent((event) => {
        if (event.type !== "attacked" || event.attacker === undefined) return;
        hits.set(event.attacker, clock.now());
        last = event.attacker;
      });
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

function attackerView(ctx: ViewCtx, guid: bigint): AttackerView {
  const { rt } = ctx;
  const hitAt = rt.attacks.lastHitAt(guid);
  const hitAgoMs = hitAt === undefined ? undefined : rt.clock.now() - hitAt;
  return {
    guid: guidHex(guid),
    hitAgoMs,
    name: nameOf(ctx, guid),
    ref: rt.refs.refOf(guid),
  };
}

export function dangerView(ctx: ViewCtx): DangerView {
  const { attackers, self } = ctx.handle.getCombatState();
  const { health, maxHealth } = self;
  const hpPct =
    health !== undefined && maxHealth
      ? Math.round((health / maxHealth) * 100)
      : 100;
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
  const ago =
    first.hitAgoMs === undefined
      ? ""
      : ` (hit you ${Math.round(first.hitAgoMs / 1000)} s ago)`;
  return `Danger: ${first.name} ${first.ref} is ${still}attacking you${ago}. ${hp}`;
}

export type InterruptRules = {
  newAttacker: boolean;
  rooted: boolean;
  death: boolean;
};
export type InterruptCause = {
  code: "attacked" | "rooted" | "died";
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

function onAttacked({ ctx, event, fire, known, rules }: AttackWatch): void {
  if (event.type !== "attacked") return;
  const guid =
    event.attacker ??
    event.state.attackers.find((candidate) => !known.has(candidate));
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
  const known = new Set(handle.getCombatState().attackers);
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
    handle.onControlEvent((event) => {
      if (rules.rooted && event.state.blockedReason === "rooted") fire(ROOTED);
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
