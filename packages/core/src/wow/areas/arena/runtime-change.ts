import {
  buildTeamId,
  buildTeamName,
  TEAM_EVENT_DISBANDED,
  TEAM_EVENT_LEADER_CHANGED,
  TEAM_EVENT_REMOVE,
} from "#wow/areas/arena/protocol";
import {
  ARENA_ANSWER_MS,
  type Ctx,
  noReply,
} from "#wow/areas/arena/runtime-shared";
import type {
  ArenaActs,
  ArenaSimpleResult,
} from "#wow/areas/arena/runtime-types";
import type { ArenaEvent, ArenaStore } from "#wow/areas/arena/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export type ArenaChangeActs = Pick<
  ArenaActs,
  "disband" | "leave" | "remove" | "setLeader"
>;

async function change(
  ctx: Ctx,
  opcode: number,
  body: Uint8Array,
  done: (event: ArenaEvent) => boolean,
): Promise<ArenaSimpleResult> {
  const reply = await noReply(ctx, done, ARENA_ANSWER_MS, () =>
    ctx.send(opcode, body),
  );
  if (!reply) return { status: "no_reply" };
  if (reply.type !== "result") return { status: "ok" };
  return reply.result.ok
    ? { status: "ok" }
    : { reason: reply.result.error, status: "refused" };
}

export function arenaChangeActs(ctx: Ctx, store: ArenaStore): ArenaChangeActs {
  const leave: ArenaActs["leave"] = (id) =>
    change(
      ctx,
      GameOpcode.CMSG_ARENA_TEAM_LEAVE,
      buildTeamId(id),
      (incoming) =>
        (incoming.type === "result" &&
          (incoming.result.action === "quit" ||
            incoming.result.action === "create")) ||
        (incoming.type === "team_event" &&
          incoming.strings.includes(store.team(id)?.name ?? "")),
    );
  const remove: ArenaActs["remove"] = (id, name) => {
    if (!name) throw new Error("arena remove needs a name");
    return change(
      ctx,
      GameOpcode.CMSG_ARENA_TEAM_REMOVE,
      buildTeamName(id, name),
      (incoming) =>
        incoming.type === "result" ||
        (incoming.type === "team_event" &&
          incoming.event === TEAM_EVENT_REMOVE &&
          incoming.strings[0] === name),
    );
  };

  const disband: ArenaActs["disband"] = (id) =>
    change(
      ctx,
      GameOpcode.CMSG_ARENA_TEAM_DISBAND,
      buildTeamId(id),
      (incoming) =>
        (incoming.type === "team_event" &&
          incoming.event === TEAM_EVENT_DISBANDED) ||
        (incoming.type === "result" && !incoming.result.ok),
    );

  const setLeader: ArenaActs["setLeader"] = (id, name) => {
    if (!name) throw new Error("arena leader needs a name");
    return change(
      ctx,
      GameOpcode.CMSG_ARENA_TEAM_LEADER,
      buildTeamName(id, name),
      (incoming) =>
        incoming.type === "result" ||
        (incoming.type === "team_event" &&
          incoming.event === TEAM_EVENT_LEADER_CHANGED &&
          incoming.strings[1] === name),
    );
  };

  return { disband, leave, remove, setLeader };
}
