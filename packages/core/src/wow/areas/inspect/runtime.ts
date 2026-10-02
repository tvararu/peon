import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildInspect,
  buildQueryInspectAchievements,
  type InspectTalent,
  type RespondInspectAchievements,
} from "#wow/areas/inspect/protocol";
import type { InspectEvent, InspectStore } from "#wow/areas/inspect/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const INSPECT_TIMEOUT_MS = 3000;

export type InspectActs = {
  inspect: (guid: bigint) => Promise<InspectTalent | undefined>;
  inspectAchievements: (
    guid: bigint,
  ) => Promise<RespondInspectAchievements | undefined>;
};

export function inspectRuntime(
  ctx: AreaRuntimeCtx<InspectEvent>,
  _store: InspectStore,
  _core: CoreStores,
): AreaRuntime<InspectActs> {
  function watch(
    types: readonly InspectEvent["type"][],
    guid: bigint,
  ): Promise<InspectEvent> {
    return ctx.until(
      (event) => types.includes(event.type) && event.reply.guid === guid,
      { timeoutMs: INSPECT_TIMEOUT_MS },
    );
  }

  async function inspect(guid: bigint): Promise<InspectTalent | undefined> {
    const pending = watch(["talents"], guid);
    ctx.send(GameOpcode.CMSG_INSPECT, buildInspect(guid));
    try {
      const event = await pending;
      if (event.type !== "talents") return undefined;
      return event.reply;
    } catch (error) {
      if (error instanceof Error && error.message === "timeout")
        return undefined;
      throw error;
    }
  }

  async function inspectAchievements(
    guid: bigint,
  ): Promise<RespondInspectAchievements | undefined> {
    const pending = watch(["achievements"], guid);
    ctx.send(
      GameOpcode.CMSG_QUERY_INSPECT_ACHIEVEMENTS,
      buildQueryInspectAchievements(guid),
    );
    try {
      const event = await pending;
      if (event.type !== "achievements") return undefined;
      return event.reply;
    } catch (error) {
      if (error instanceof Error && error.message === "timeout")
        return undefined;
      throw error;
    }
  }

  return { act: { inspect, inspectAchievements }, dispose: () => undefined };
}
