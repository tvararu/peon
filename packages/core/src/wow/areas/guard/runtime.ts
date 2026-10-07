import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildPrepareForRedirect,
  buildSetFactionCheat,
  buildWorldTeleport,
  type WorldTeleportTarget,
} from "#wow/areas/guard/protocol";
import type { GuardEvent, GuardStore } from "#wow/areas/guard/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const GUARD_ANSWER_MS = 3000;

export type GuardActs = {
  worldTeleport: (
    target: Omit<WorldTeleportTarget, "time">,
    signal?: AbortSignal,
  ) => Promise<"denied" | "sent">;
  requestFactionStates: () => void;
  prepareForRedirect: (
    signal?: AbortSignal,
  ) => Promise<"ignored" | { ok: boolean }>;
};

async function answer(
  ctx: AreaRuntimeCtx<GuardEvent>,
  match: (event: GuardEvent) => boolean,
  signal: AbortSignal | undefined,
): Promise<GuardEvent | undefined> {
  try {
    return await ctx.until(match, {
      timeoutMs: GUARD_ANSWER_MS,
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "timeout") return undefined;
    throw error;
  }
}

export function guardRuntime(
  ctx: AreaRuntimeCtx<GuardEvent>,
  _store: GuardStore,
  _core: CoreStores,
): AreaRuntime<GuardActs> {
  return {
    act: {
      async worldTeleport(target, signal) {
        const settled = answer(
          ctx,
          (event) => event.type === "notification",
          signal,
        );
        ctx.send(
          GameOpcode.CMSG_WORLD_TELEPORT,
          buildWorldTeleport({ ...target, time: ctx.now() }),
        );
        return (await settled) ? "denied" : "sent";
      },
      requestFactionStates() {
        ctx.send(GameOpcode.CMSG_SET_FACTION_CHEAT, buildSetFactionCheat());
      },
      async prepareForRedirect(signal) {
        const settled = answer(
          ctx,
          (candidate) => candidate.type === "redirect_ready",
          signal,
        );
        ctx.send(
          GameOpcode.TC9_CMSG_PREPARE_FOR_REDIRECT,
          buildPrepareForRedirect(),
        );
        const event = await settled;
        return event?.type === "redirect_ready" ? { ok: event.ok } : "ignored";
      },
    },
    dispose: () => undefined,
  };
}
