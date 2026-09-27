import type { AttackLedger, Clock, ViewCtx } from "#harness/contract/services";
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
