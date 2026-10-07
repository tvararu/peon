import {
  buildBattlefieldPort,
  buildJoinArena,
} from "#wow/areas/arena/protocol";
import {
  ARENA_ANSWER_MS,
  type Ctx,
  noReply,
} from "#wow/areas/arena/runtime-shared";
import type {
  ArenaActs,
  ArenaJoinResult,
} from "#wow/areas/arena/runtime-types";
import type { ArenaEvent, ArenaStore } from "#wow/areas/arena/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const BG_TYPE_ARENA = 6;

export type ArenaQueueActs = Pick<ArenaActs, "joinQueue" | "leaveQueue">;

function joinResult(event: ArenaEvent | undefined): ArenaJoinResult {
  if (!event) return { status: "no_reply" };
  if (event.type === "queue_refused")
    return { reason: `queue_${event.result}`, status: "refused" };
  if (event.type === "arena_error")
    return event.arenaType === undefined
      ? { reason: "arena_error", status: "refused" }
      : { arenaType: event.arenaType, status: "no_teams" };
  if (event.type !== "queue") return { status: "no_reply" };
  const queued = event.queue.find((row) => row.kind === "queued");
  if (!queued) return { status: "no_reply" };
  return { queue: [...event.queue], slot: queued.slot, status: "queued" };
}

export function arenaQueueActs(ctx: Ctx, store: ArenaStore): ArenaQueueActs {
  async function joinQueue(
    master: bigint,
    slot: number,
    rated: boolean,
  ): Promise<ArenaJoinResult> {
    if (slot < 0 || slot > 2)
      throw new Error(`arena slot ${slot} is not 0, 1 or 2`);
    const reply = await noReply(
      ctx,
      (incoming) =>
        (incoming.type === "queue" &&
          incoming.queue.some((row) => row.kind === "queued")) ||
        incoming.type === "queue_refused" ||
        incoming.type === "arena_error",
      ARENA_ANSWER_MS,
      () =>
        ctx.send(
          GameOpcode.CMSG_BATTLEMASTER_JOIN_ARENA,
          buildJoinArena(master, slot, false, rated),
        ),
    );
    return joinResult(reply);
  }

  async function leaveQueue(
    slot: number,
  ): Promise<{ status: "left" } | { status: "no_slot" }> {
    const current = store.snapshot().queue.find((row) => row.slot === slot);
    if (!current || current.kind === "none") return { status: "no_slot" };
    await noReply(
      ctx,
      (incoming) =>
        incoming.type === "queue" &&
        !incoming.queue.some((row) => row.slot === slot && row.kind !== "none"),
      ARENA_ANSWER_MS,
      () =>
        ctx.send(
          GameOpcode.CMSG_BATTLEFIELD_PORT,
          buildBattlefieldPort(current.arenaType, BG_TYPE_ARENA, false),
        ),
    );
    return { status: "left" };
  }

  return { joinQueue, leaveQueue };
}
