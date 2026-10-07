import { buildInspectArenaTeams, buildTeamId } from "#wow/areas/arena/protocol";
import {
  ARENA_ANSWER_MS,
  ARENA_INSPECT_MS,
  type Ctx,
} from "#wow/areas/arena/runtime-shared";
import type {
  ArenaActs,
  ArenaInspectResult,
  ArenaQueryResult,
  ArenaRosterResult,
} from "#wow/areas/arena/runtime-types";
import type { ArenaStore, ArenaTeam } from "#wow/areas/arena/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export type ArenaQueryActs = Pick<
  ArenaActs,
  "inspect" | "query" | "refresh" | "roster"
>;

export function arenaQueryActs(ctx: Ctx, store: ArenaStore): ArenaQueryActs {
  async function oneTeam(id: number): Promise<ArenaTeam> {
    const answered = ctx.until(
      (incoming) =>
        (incoming.type === "team" || incoming.type === "stats") &&
        incoming.id === id,
      { signal: ctx.signal, timeoutMs: ARENA_ANSWER_MS },
    );
    ctx.send(GameOpcode.CMSG_ARENA_TEAM_QUERY, buildTeamId(id));
    const reply = await answered;
    if (reply.type !== "team" && reply.type !== "stats")
      throw new Error("no_answer");
    const team = store.team(id);
    if (!team) throw new Error("no_answer");
    return team;
  }

  async function refresh(): Promise<ArenaTeam[]> {
    const teams: ArenaTeam[] = [];
    for (const id of store.teamIds()) teams.push(await oneTeam(id));
    return teams;
  }

  async function query(id: number): Promise<ArenaQueryResult> {
    return { team: await oneTeam(id) };
  }

  async function roster(id: number): Promise<ArenaRosterResult> {
    const answered = ctx.until(
      (incoming) => incoming.type === "roster" && incoming.id === id,
      { signal: ctx.signal, timeoutMs: ARENA_ANSWER_MS },
    );
    ctx.send(GameOpcode.CMSG_ARENA_TEAM_ROSTER, buildTeamId(id));
    const reply = await answered;
    if (reply.type !== "roster") throw new Error("no_answer");
    return { id, members: [...reply.members] };
  }

  async function inspect(guid: bigint): Promise<ArenaInspectResult> {
    const answered = ctx.until(
      (incoming) => incoming.type === "inspect" && incoming.guid === guid,
      { signal: ctx.signal, timeoutMs: ARENA_INSPECT_MS },
    );
    ctx.send(GameOpcode.MSG_INSPECT_ARENA_TEAMS, buildInspectArenaTeams(guid));
    try {
      const reply = await answered;
      if (reply.type !== "inspect") throw new Error("no_answer");
      return { guid, rows: [...reply.rows] };
    } catch (error) {
      if (error instanceof Error && error.message === "timeout")
        return { guid, rows: [] };
      throw error;
    }
  }

  return { inspect, query, refresh, roster };
}
