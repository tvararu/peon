import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import { Refusal } from "#harness/ops/refusal";
import { nextCall } from "#harness/tools/next-call";

export const DISMOUNTED_FIRST = "Dismounted first.";

export type DismountRide = "not_mounted" | "dismounted";

export function withDismountedFirst<A>(
  ride: DismountRide,
  report: ToolResult<A>,
): ToolResult<A> {
  return ride === "dismounted"
    ? { ...report, detail: `${DISMOUNTED_FIRST} ${report.detail}` }
    : report;
}

type DismountCtx = Pick<ToolCtx<unknown>, "handle" | "signal">;

export async function dismountFirst(ctx: DismountCtx): Promise<DismountRide> {
  const { handle, signal } = ctx;
  signal.throwIfAborted();
  if (!handle.selfstate.state().mounted) return "not_mounted";
  const { promise, reject } = Promise.withResolvers<never>();
  const onAbort = () => reject(signal.reason);
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    const outcome = await Promise.race([
      handle.selfstate.act.dismount(),
      promise,
    ]);
    if (outcome.status === "ok") return "dismounted";
    if (outcome.status === "no_answer")
      throw new Refusal({
        detail:
          "Dismount was sent but the server did not answer within 2 s, so the mount is still on.",
        next: nextCall("spell", { do: "dismount" }),
        reason: "no_reply",
        status: "UNCONFIRMED",
      });
    if (outcome.reason === "not_mounted") return "not_mounted";
    throw new Refusal({
      detail: "You cannot dismount while flying. Land first.",
      next: nextCall("look", {}),
      reason: "in_flight",
    });
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
