import { StringEnum, Type, type Static } from "@earendil-works/pi-ai";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { AreaActsOf, AreaState } from "@peon/core";
type Acts = AreaActsOf<"arena">;
type ArenaInspectResult = Awaited<ReturnType<Acts["inspect"]>>;
type ArenaJoinResult = Awaited<ReturnType<Acts["joinQueue"]>>;
type ArenaQueryResult = Awaited<ReturnType<Acts["query"]>>;
type ArenaRosterResult = Awaited<ReturnType<Acts["roster"]>>;
type ArenaTeam = AreaState<"arena">["teams"][string];
type ArenaMember = ArenaTeam["members"][number];
type ArenaInspectRow = ArenaInspectResult["rows"][number];
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import { defineGameTool, result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";
import type { GameToolSpec, ToolRenderers } from "#harness/tools/game-tool";
import { callLine, callRenderer, resultRenderer } from "#harness/ui/renderers/line";
import { argText } from "#harness/ui/draw";
import { knownUnits } from "#harness/ops/views";
import { parseRef } from "#harness/ops/refs";
import { Refusal } from "#harness/ops/refusal";

export const arenaParams = Type.Object({
  action: Type.Optional(
    Type.String({
      description:
        "The team action: info, roster, invite, accept, decline, leave, kick, captain or disband.",
    }),
  ),
  do: Type.Optional(
    StringEnum(["show", "team", "inspect", "queue"], {
      description:
        "show: list your arena teams. team: act on a team. inspect: read a player's arena teams. queue: join or leave an arena queue. Default show.",
    }),
  ),
  master: Type.Optional(
    Type.String({
      description:
        'For queue join: the battlemaster, a name or ref like "u2" from look.',
    }),
  ),
  name: Type.Optional(
    Type.String({
      description: "For team invite, kick and captain: the player name.",
    }),
  ),
  rated: Type.Optional(
    Type.Boolean({
      description: "For queue join: queue the rated match. Default false.",
    }),
  ),
  size: Type.Optional(
    StringEnum(["2v2", "3v3", "5v5"], {
      description:
        "For team info and queue join: the bracket. Default 2v2.",
    }),
  ),
  slot: Type.Optional(
    Type.Number({
      description: "For queue leave: the queue slot 0, 1 or 2. Default 0.",
    }),
  ),
  team: Type.Optional(
    Type.Number({
      description: "For team actions: the team id from show. Default 0.",
    }),
  ),
  unit: Type.Optional(
    Type.String({
      description: 'For inspect: the player, a name or ref like "u2".',
    }),
  ),
});

export type ArenaArgs = Static<typeof arenaParams>;
export type ArenaDo = "show" | "team" | "inspect" | "queue";
export type ArenaAction =
  | "info"
  | "roster"
  | "invite"
  | "accept"
  | "decline"
  | "leave"
  | "kick"
  | "captain"
  | "disband";

export type ArenaAfter = {
  do: ArenaDo;
  action: ArenaAction | undefined;
  team: number | undefined;
};

export type ArenaCtx = ToolCtx<ArenaAfter>;

const ARENA_SLOTS: Record<string, number> = { "2v2": 0, "3v3": 1, "5v5": 2 };
const MATCH_TYPES = [2, 3, 5] as const;

function emptyArena(action?: ArenaAction): ArenaAfter {
  return { action, do: "show", team: undefined };
}

function arenaRefusal(reason: string, detail: string, next?: string): Refusal {
  return new Refusal({
    detail,
    next: next ?? nextCall("arena"),
    reason,
  });
}

function stateTeams(ctx: ArenaCtx): ArenaTeam[] {
  return Object.values(ctx.handle.arena.state().teams);
}

function teamIdOf(ctx: ArenaCtx, args: ArenaArgs): number | undefined {
  if (args.team !== undefined) return args.team;
  const wanted = MATCH_TYPES[ARENA_SLOTS[args.size ?? "2v2"] ?? 0] ?? 2;
  return stateTeams(ctx).find((team) => team.type === wanted)?.id;
}

function memberLines(team: ArenaTeam): string {
  const members = team.members
    .map((member: ArenaMember) => `${member.name}${member.captain ? " (captain)" : ""}`)
    .join(", ");
  return `${team.type}v${team.type} ${team.name}: rating ${team.rating}, ${team.members.length} members${members === "" ? "" : ` (${members})`}.`;
}

async function runShow(ctx: ArenaCtx): Promise<ToolResult<ArenaAfter>> {
  const live = await ctx.rt.mutex.run(() => ctx.handle.arena.act.refresh());
  const teams = live.length === 0 ? stateTeams(ctx) : live;
  if (teams.length === 0)
    return result("DONE", {
      after: emptyArena(),
      body: [],
      detail: "You are in no arena team.",
    });
  return result("DONE", {
    after: emptyArena(),
    body: teams.map((team) => memberLines(team)),
    detail: `You are in ${teams.length} arena team${teams.length === 1 ? "" : "s"}.`,
  });
}

function queryLines(query: ArenaQueryResult): string[] {
  return [memberLines(query.team)];
}

function rosterLines(query: ArenaRosterResult): string[] {
  return query.members.map(
    (member: ArenaMember) =>
      `${member.name}${member.captain ? " (captain)" : ""}: played ${member.weekGames}, won ${member.weekWins}.`,
  );
}

function inspectLines(query: ArenaInspectResult): string[] {
  return query.rows.map(
    (row: ArenaInspectRow) =>
      `${row.slot === 0 ? "2v2" : row.slot === 1 ? "3v3" : "5v5"} team ${row.teamId}: rating ${row.rating}.`,
  );
}

async function runTeam(
  args: ArenaArgs,
  ctx: ArenaCtx,
): Promise<ToolResult<ArenaAfter>> {
  const action = (args.action ?? "info") as ArenaAction;
  switch (action) {
    case "accept": {
      const accepted = await ctx.rt.mutex.run(() =>
        ctx.handle.arena.act.accept(),
      );
      if ("status" in accepted)
        return result("REFUSED", {
          after: { action, do: "team", team: undefined },
          detail: `No arena invite to accept (${accepted.reason}).`,
          reason: accepted.reason,
        });
      return result("DONE", {
        after: { action, do: "team", team: undefined },
        detail: `You joined ${accepted.team}.`,
      });
    }
    case "decline": {
      const declined = await ctx.rt.mutex.run(() =>
        ctx.handle.arena.act.decline(),
      );
      if (declined.status === "no_invite")
        return result("REFUSED", {
          after: { action, do: "team", team: undefined },
          detail: "No arena invite to decline.",
          reason: "no_invite",
        });
      return result("DONE", {
        after: { action, do: "team", team: undefined },
        detail: "You declined the arena invite.",
      });
    }
    default:
      break;
  }
  const id = teamIdOf(ctx, args);
  if (id === undefined)
    throw arenaRefusal(
      "no_team",
      "You are in no arena team of that size.",
      "call arena and read your teams.",
    );
  switch (action) {
    case "info": {
      const query = await ctx.rt.mutex.run(() =>
        ctx.handle.arena.act.query(id),
      );
      return result("DONE", {
        after: { action, do: "team", team: id },
        body: queryLines(query),
        detail: `Arena team ${query.team.name}.`,
      });
    }
    case "roster": {
      const roster = await ctx.rt.mutex.run(() =>
        ctx.handle.arena.act.roster(id),
      );
      return result("DONE", {
        after: { action, do: "team", team: id },
        body: rosterLines(roster),
        detail: `Arena team ${id} has ${roster.members.length} members.`,
      });
    }
    case "invite": {
      const name = args.name?.trim() ?? "";
      if (name === "")
        throw arenaRefusal(
          "missing_player",
          "Name the player to invite.",
          "call arena with a player name.",
        );
      const invited = await ctx.rt.mutex.run(() =>
        ctx.handle.arena.act.invite(id, name),
      );
      if (invited.status === "refused")
        return result("REFUSED", {
          after: { action, do: "team", team: id },
          detail: `The invite to ${name} was refused (${invited.reason}).`,
          reason: invited.reason,
        });
      return result("DONE", {
        after: { action, do: "team", team: id },
        detail: `You invited ${name} to team ${id}.`,
      });
    }
    case "leave":
    case "kick":
    case "captain":
    case "disband": {
      const changed = await ctx.rt.mutex.run(() => {
        if (action === "leave") return ctx.handle.arena.act.leave(id);
        if (action === "disband") return ctx.handle.arena.act.disband(id);
        const name = args.name?.trim() ?? "";
        if (name === "")
          throw arenaRefusal(
            "missing_player",
            `Name the player to ${action === "kick" ? "kick" : "make captain"}.`,
            "call arena with a player name.",
          );
        if (action === "kick") return ctx.handle.arena.act.remove(id, name);
        return ctx.handle.arena.act.setLeader(id, name);
      });
      if (changed.status === "refused")
        return result("REFUSED", {
          after: { action, do: "team", team: id },
          detail: `Team ${id} ${action} was refused (${changed.reason}).`,
          reason: changed.reason,
        });
      return result("DONE", {
        after: { action, do: "team", team: id },
        detail: `Team ${id} ${action} done.`,
      });
    }
    default:
      throw arenaRefusal(
        "unknown_action",
        `Unknown team action ${action}. Use info, roster, invite, accept, decline, leave, kick, captain or disband.`,
      );
  }
}

function resolveUnit(ctx: ArenaCtx, wanted: string | undefined): bigint {
  const text = wanted?.trim() ?? "";
  if (text === "")
    throw arenaRefusal(
      "missing_unit",
      "Name the player to inspect.",
      "call arena with a player name or ref.",
    );
  const found = parseRef(text)
    ? knownUnits(ctx).find((unit) => unit.ref === text)
    : knownUnits(ctx).find(
        (unit) => unit.name.toLowerCase() === text.toLowerCase(),
      );
  if (!found)
    throw arenaRefusal(
      "not_seen",
      `no unit "${text}" is in view.`,
      nextCall("look"),
    );
  if (found.kind === "player" && found.relation === "hostile")
    throw arenaRefusal(
      "hostile",
      `${found.name} is hostile; inspect a friendly player.`,
      nextCall("look"),
    );
  return BigInt(`0x${found.guid}`);
}

async function runInspect(
  args: ArenaArgs,
  ctx: ArenaCtx,
): Promise<ToolResult<ArenaAfter>> {
  const guid = resolveUnit(ctx, args.unit);
  const query = await ctx.rt.mutex.run(() =>
    ctx.handle.arena.act.inspect(guid),
  );
  if (query.rows.length === 0)
    return result("DONE", {
      after: emptyArena(),
      body: [],
      detail: "That player is in no arena team.",
    });
  return result("DONE", {
    after: emptyArena(),
    body: inspectLines(query),
    detail: `That player is in ${query.rows.length} arena team${query.rows.length === 1 ? "" : "s"}.`,
  });
}

function resolveMaster(ctx: ArenaCtx, wanted: string | undefined): bigint {
  const text = wanted?.trim() ?? "";
  const masters = knownUnits(ctx).filter((unit) =>
    unit.roles.includes("battlemaster"),
  );
  const found =
    text === ""
      ? masters[0]
      : parseRef(text)
        ? masters.find((unit) => unit.ref === text)
        : masters.find(
            (unit) => unit.name.toLowerCase() === text.toLowerCase(),
          );
  if (!found)
    throw arenaRefusal(
      "no_battlemaster",
      text === ""
        ? "No battlemaster is in view."
        : `no battlemaster "${text}" is in view.`,
      nextCall("look"),
    );
  return BigInt(`0x${found.guid}`);
}

function joinDetail(join: ArenaJoinResult): {
  detail: string;
  reason?: string;
  status: "DONE" | "REFUSED";
} {
  if (join.status === "queued")
    return {
      detail: `Queued for an arena skirmish in slot ${join.slot}.`,
      status: "DONE",
    };
  if (join.status === "no_reply")
    return {
      detail: "The arena queue did not answer.",
      reason: "no_reply",
      status: "REFUSED",
    };
  if (join.status === "no_teams")
    return {
      detail: `You have no ${join.arenaType}v${join.arenaType} team to queue with.`,
      reason: "no_teams",
      status: "REFUSED",
    };
  return {
    detail: `The arena queue refused the join (${join.reason}).`,
    reason: join.reason,
    status: "REFUSED",
  };
}

async function runQueue(
  args: ArenaArgs,
  ctx: ArenaCtx,
): Promise<ToolResult<ArenaAfter>> {
  const action = (args.action ?? "join") as "join" | "leave";
  if (action === "leave") {
    const slot = args.slot ?? 0;
    const left = await ctx.rt.mutex.run(() =>
      ctx.handle.arena.act.leaveQueue(slot),
    );
    if (left.status === "no_slot")
      return result("REFUSED", {
        after: emptyArena(),
        detail: `No arena queue fills slot ${slot}.`,
        reason: "no_slot",
      });
    return result("DONE", {
      after: emptyArena(),
      detail: `You left the arena queue in slot ${slot}.`,
    });
  }
  if (action !== "join")
    throw arenaRefusal(
      "unknown_action",
      `Unknown queue action ${action}. Use join or leave.`,
    );
  const slot = ARENA_SLOTS[args.size ?? "2v2"] ?? 0;
  const master = resolveMaster(ctx, args.master);
  const rated = args.rated ?? false;
  const join = await ctx.rt.mutex.run(() =>
    ctx.handle.arena.act.joinQueue(master, slot, rated),
  );
  const done = joinDetail(join);
  return result(done.status, {
    after: emptyArena(),
    detail: done.detail,
    reason: done.reason,
  });
}

export async function runArena(
  args: ArenaArgs,
  ctx: ArenaCtx,
): Promise<ToolResult<ArenaAfter>> {
  const verb = (args.do ?? "show") as ArenaDo;
  if (verb === "show") return await runShow(ctx);
  if (verb === "team") return await runTeam(args, ctx);
  if (verb === "inspect") return await runInspect(args, ctx);
  if (verb === "queue") return await runQueue(args, ctx);
  throw arenaRefusal(
    "unknown_verb",
    `Unknown arena verb ${String(verb)}. Use show, team, inspect or queue.`,
  );
}

function arenaCall(args: unknown, theme: Theme): string {
  return callLine({
    icon: "friendly",
    parts: [
      argText(args, "do") ?? "show",
      argText(args, "action"),
      argText(args, "team"),
      argText(args, "name") ?? argText(args, "unit"),
    ],
    theme,
    verb: "arena",
  });
}

export const arenaRenderers: ToolRenderers<"arena", ArenaAfter> = {
  renderCall: callRenderer(arenaCall),
  renderResult: resultRenderer("arena", ({ expanded, result: out }) =>
    expanded ? out.body : [],
  ),
};

export const arenaSpec: GameToolSpec<typeof arenaParams, "arena", ArenaAfter> =
  {
    fallback: () => emptyArena(),
    kind: "action",
    minimalArgs: { do: "show" },
    name: "arena",
    parameters: arenaParams,
    renderers: arenaRenderers,
    run: runArena,
    text: {
      description:
        "Read your arena teams and their rosters, invite players and pass the captaincy, inspect a nearby player's teams, and join or leave an arena queue at a battlemaster.",
      guidelines: [
        "Call show first so team ids are known before acting. Queue only at a battlemaster in view, and only with a team for that bracket.",
      ],
      label: "Arena",
    },
  };

export const arenaTool = defineGameTool(arenaSpec);
