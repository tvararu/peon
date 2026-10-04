import { abortable } from "@peon/core/lib/abort";
import type {
  VehicleAfter,
  VehicleArgs,
  VehicleCtx,
  VehicleOutcome,
} from "#harness/areas/vehicles/tool-types";
import type { ToolResult } from "#harness/contract/result";
import type { UnitView } from "#harness/contract/views";
import { INTERACT_APPROACH_YD, TALK_RANGE_YD } from "#harness/ops/range";
import { Refusal } from "#harness/ops/refusal";
import { notAtLastKnown, seekLastKnown } from "#harness/ops/remembered";
import { resolveUnit, unitRefusal } from "#harness/ops/resolve";
import { travelLeg } from "#harness/ops/travel-leg";
import { reachNext } from "#harness/ops/unreached";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

const DRIVE_EXAMPLE = "10 yd north";

type Target = { guid: bigint; unit: UnitView };

function missing(verb: string, param: string): Refusal {
  return new Refusal({
    detail: `name the ${param} to ${verb}.`,
    next: nextCall("look"),
    reason: "missing_target",
  });
}

function ambiguous(
  candidates: readonly UnitView[],
  verb: VehicleArgs["do"],
  param: string,
): Refusal {
  const names = [...new Set(candidates.map((unit) => unit.name))].join(", ");
  const call = (unit: UnitView) =>
    nextCall("vehicle", { do: verb, [param]: unit.ref });
  const nearest = candidates.at(0);
  const where = (unit: UnitView) => {
    if (unit.distance === undefined) return "distance unknown";
    if (unit.compass) return `${Math.round(unit.distance)} yd ${unit.compass}`;
    return `${Math.round(unit.distance)} yd`;
  };
  return new Refusal({
    body: candidates
      .slice(0, 5)
      .map((unit) => `${unit.name} ${unit.ref}, ${where(unit)}: ${call(unit)}`),
    detail: `the name matches ${candidates.length} units (${names}).`,
    next: nearest ? call(nearest) : nextCall("look"),
    options: candidates.map((unit) => unit.ref),
    reason: "ambiguous_unit",
  });
}

function vehicleVerb(verb: string): VehicleArgs["do"] {
  if (verb === "ride with") return "ride_with";
  if (verb === "eject") return "eject";
  return "board";
}

function find(ctx: VehicleCtx, text: string | undefined, verb: string): Target {
  const wanted = text?.trim() ?? "";
  if (wanted === "")
    throw missing(verb, verb === "ride with" ? "player" : "unit");
  const resolved = resolveUnit(ctx, { alive: true, text: wanted });
  if (resolved.kind === "ambiguous")
    throw ambiguous(
      resolved.candidates,
      vehicleVerb(verb),
      verb === "ride with" ? "player" : "unit",
    );
  if (resolved.kind !== "unit")
    throw unitRefusal({
      param: verb === "ride with" ? "player" : "unit",
      resolved,
      tool: "vehicle",
    });
  return { guid: resolved.guid, unit: resolved.unit };
}

async function approach(ctx: VehicleCtx, target: Target): Promise<Target> {
  if (target.unit.inView) {
    if ((target.unit.distance ?? 0) <= TALK_RANGE_YD) return target;
  } else {
    const { found, leg } = await seekLastKnown(ctx, target.unit);
    if (found) return approach(ctx, found);
    if (leg && leg.status !== "arrived")
      throw new Refusal({
        detail: `could not reach ${target.unit.name}: ${leg.detail}.`,
        next: reachNext(leg, target.unit),
        reason: leg.reason ?? leg.status,
        status: "FAILED",
      });
    throw notAtLastKnown(ctx, target.unit);
  }
  const leg = await travelLeg(ctx, {
    goal: { guid: target.guid, kind: "unit", name: target.unit.name },
    within: INTERACT_APPROACH_YD,
  });
  if (leg.status !== "arrived")
    throw new Refusal({
      detail: `could not reach ${target.unit.name}: ${leg.detail}.`,
      next: reachNext(leg, target.unit),
      reason: leg.reason ?? leg.status,
      status: "FAILED",
    });
  return target;
}

async function send(
  ctx: VehicleCtx,
  act: () => Promise<VehicleOutcome>,
): Promise<VehicleOutcome> {
  const queued = ctx.rt.mutex.run(async () => {
    ctx.signal.throwIfAborted();
    return await act();
  });
  queued.then(
    () => undefined,
    () => undefined,
  );
  return await abortable(queued, ctx.signal);
}

function report(
  outcome: VehicleOutcome,
  after: VehicleAfter,
  done: string,
): ToolResult<VehicleAfter> {
  if (outcome.status === "ok") return result("DONE", { after, detail: done });
  if (outcome.status === "no_answer")
    return result("UNCONFIRMED", {
      after,
      detail: "The server gave no answer; the seat may not have changed.",
      next: nextCall("look"),
      reason: "no_answer",
    });
  throw new Refusal({
    detail: REFUSALS[outcome.reason],
    next: nextCall("look"),
    reason: outcome.reason,
  });
}

const REFUSALS: Record<
  Extract<VehicleOutcome, { status: "refused" }>["reason"],
  string
> = {
  not_a_vehicle: "you are not on a vehicle that can do this.",
  not_clickable: "that unit has no seat you can click.",
  not_controlling: "you are not driving a vehicle.",
  not_seated: "you are not in a vehicle seat.",
};

function seatAct(ctx: VehicleCtx, seat: VehicleArgs["seat"]) {
  const act = ctx.handle.vehicles.act;
  if (seat === "next") return () => act.nextSeat();
  if (seat === "prev") return () => act.prevSeat();
  if (
    typeof seat === "number" &&
    Number.isInteger(seat) &&
    seat >= 0 &&
    seat <= 7
  )
    return () => act.switchSeat(seat);
  if (typeof seat === "number")
    throw new Refusal({
      detail: `no vehicle seat ${seat}: pick a seat from 0 to 7.`,
      next: nextCall("vehicle", { do: "seat", seat: "next" }),
      reason: "bad_seat",
    });
  throw new Refusal({
    detail: 'say which seat: "next", "prev" or a seat number.',
    next: nextCall("vehicle", { do: "seat", seat: "next" }),
    reason: "missing_seat",
  });
}

export async function vehicleRun(
  args: VehicleArgs,
  ctx: VehicleCtx,
): Promise<ToolResult<VehicleAfter>> {
  const act = ctx.handle.vehicles.act;
  if (args.do === "leave")
    return report(
      await send(ctx, () => act.exitVehicle()),
      { do: "leave", target: undefined },
      "You left the vehicle seat.",
    );
  if (args.do === "seat") {
    const run = seatAct(ctx, args.seat);
    return report(
      await send(ctx, run),
      { do: "seat", target: String(args.seat) },
      `You asked for seat ${args.seat}.`,
    );
  }
  if (args.do === "board") {
    const seen = await approach(ctx, find(ctx, args.unit, "board"));
    const boarded = report(
      await send(ctx, () => act.spellClick(seen.guid)),
      { do: "board", target: seen.unit.ref },
      `You clicked ${seen.unit.name} (${seen.unit.ref}) and took a seat.`,
    );
    return boarded.status === "DONE" &&
      ctx.handle.vehicles.state().seat?.controlling
      ? {
          ...boarded,
          detail: `${boarded.detail} You control it: travel drives it.`,
          next: nextCall("travel", { to: DRIVE_EXAMPLE }),
        }
      : boarded;
  }
  if (args.do === "ride_with") {
    const seen = await approach(ctx, find(ctx, args.player, "ride with"));
    return report(
      await send(ctx, () => act.enterPlayerVehicle(seen.guid)),
      { do: "ride_with", target: seen.unit.ref },
      `You asked to ride with ${seen.unit.name}.`,
    );
  }
  const seen = await approach(ctx, find(ctx, args.unit, "eject"));
  return report(
    await send(ctx, () => act.ejectPassenger(seen.guid)),
    { do: "eject", target: seen.unit.ref },
    `You asked ${seen.unit.name} to leave the vehicle.`,
  );
}
