import type {
  PlayerLife,
  RecoveryEvent,
  RecoveryOutcome,
  RecoveryState,
} from "@peon/core";
import type { OpsCtx } from "#harness/contract/services";
import type { PoseView, UnitView } from "#harness/contract/views";
import { TALK_RANGE_YD } from "#harness/ops/range";
import { settle } from "#harness/ops/settle";
import { unitViews } from "#harness/ops/views";

export type RecoverHow = "corpse" | "spirit_healer" | "accept";
export type RecoverOpResult = {
  outcome: RecoveryOutcome;
  via: RecoverHow;
  legs: number;
  corpseYd: number | undefined;
  alternatives: string[];
};

const RELEASE_MS = 5000;
const ACCEPT_MS = 10_000;
const HEALER_MS = 12_000;

function waitLife(
  ctx: OpsCtx,
  life: PlayerLife,
  timeoutMs: number,
  send: () => void,
) {
  return settle<RecoveryEvent>({
    match: (event) =>
      event.type === "life_observed" && event.state.life === life,
    send: () => ctx.rt.mutex.run(send),
    signal: ctx.signal,
    subscribe: (cb) => ctx.handle.onRecoveryEvent(cb),
    timeoutMs,
  });
}

function nearestHealer(ctx: OpsCtx): UnitView | undefined {
  return unitViews(ctx).find((unit) => unit.roles.includes("spirit_healer"));
}

function healerText(unit: UnitView): string {
  const where = [`${Math.round(unit.distance ?? 0)} yd`, unit.compass]
    .filter(Boolean)
    .join(" ");
  return `spirit healer ${unit.ref} ${where} (resurrection sickness)`;
}

function alternativesFor(
  ctx: OpsCtx,
  how: RecoverHow,
  state: RecoveryState,
): string[] {
  const healer = nearestHealer(ctx);
  const offer =
    state.resurrection?.response === "unanswered"
      ? state.resurrection
      : undefined;
  return [
    ...(how === "spirit_healer"
      ? []
      : [healer ? healerText(healer) : "no spirit healer in view"]),
    ...(how === "accept"
      ? []
      : [
          offer
            ? `a resurrection offer from ${offer.name}`
            : "no resurrection offer",
        ]),
    ...(how === "corpse" ? [] : ["walk back to your corpse"]),
  ];
}

async function acceptOffer(
  ctx: OpsCtx,
  state: RecoveryState,
): Promise<RecoveryOutcome> {
  if (state.resurrection?.response !== "unanswered")
    return { cause: "no_resurrection_offer", ok: false };
  const alive = await waitLife(ctx, "alive", ACCEPT_MS, () =>
    ctx.handle.respondResurrection(true),
  );
  return alive
    ? { ok: true, outcome: "resurrected" }
    : { cause: "resurrection_unanswered", ok: false };
}

async function useHealer(ctx: OpsCtx): Promise<RecoveryOutcome> {
  const healer = nearestHealer(ctx);
  const guid = healer ? ctx.rt.refs.guidOf(healer.ref) : undefined;
  if (!healer || guid === undefined)
    return { cause: "no_spirit_healer", ok: false };
  const distance = healer.distance ?? Number.POSITIVE_INFINITY;
  if (distance > TALK_RANGE_YD)
    return {
      cause: "too_far",
      detail: { distance, ref: healer.ref },
      ok: false,
    };
  const alive = await waitLife(ctx, "alive", HEALER_MS, () =>
    ctx.handle.activateSpiritHealer(guid),
  );
  return alive
    ? { ok: true, outcome: "resurrected" }
    : { cause: "spirit_healer_unanswered", ok: false };
}

function legsOf(outcome: RecoveryOutcome): number {
  const legs = outcome.detail?.["legs"];
  return typeof legs === "number" ? legs : 0;
}

export function aliveWhere(
  corpseYd: number | undefined,
  pose: PoseView | undefined,
): string {
  const at = pose ? `, at ${Math.round(pose.x)}, ${Math.round(pose.y)}` : "";
  return corpseYd === undefined
    ? `near your corpse${at}`
    : `${Math.round(corpseYd)} yd from your corpse${at}`;
}

async function attempt(
  ctx: OpsCtx,
  how: RecoverHow,
  state: RecoveryState,
): Promise<RecoveryOutcome> {
  if (how === "accept") return acceptOffer(ctx, state);
  if (state.life === "dead") {
    const released = await waitLife(ctx, "ghost", RELEASE_MS, () =>
      ctx.handle.releaseSpirit(),
    );
    if (!released) return { cause: "release_unanswered", ok: false };
  }
  return how === "spirit_healer"
    ? useHealer(ctx)
    : ctx.handle.recoverCorpse(ctx.signal);
}

export async function recoverOp(
  ctx: OpsCtx,
  how: RecoverHow,
): Promise<RecoverOpResult> {
  const state = ctx.handle.getRecoveryState();
  const alternatives = alternativesFor(ctx, how, state);
  let lastYd = state.reclaim.distance;
  const off = ctx.handle.onRecoveryEvent((event) => {
    lastYd = event.state.reclaim.distance ?? lastYd;
  });
  try {
    const outcome = await attempt(ctx, how, state);
    return {
      alternatives,
      corpseYd: ctx.handle.getRecoveryState().reclaim.distance ?? lastYd,
      legs: legsOf(outcome),
      outcome,
      via: how,
    };
  } finally {
    off();
  }
}
