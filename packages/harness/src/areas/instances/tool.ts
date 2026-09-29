import { type Static, StringEnum, Type } from "@earendil-works/pi-ai";
import {
  difficultyLines,
  difficultyName,
  type InstancesSnapshot,
  type LfgSnapshot,
  lockStale,
  type RaidLockView,
} from "#harness/areas/instances/tool-status";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import { Refusal } from "#harness/ops/refusal";
import { defineGameTool, result } from "#harness/tools/define";
import type { GameToolSpec, ToolRenderers } from "#harness/tools/game-tool";
import { savesLine } from "#harness/tools/look-saves";
import { nextCall } from "#harness/tools/next-call";
import { argText } from "#harness/ui/draw";
import {
  type CallInit,
  callLine,
  callRenderer,
  resultRenderer,
} from "#harness/ui/renderers/line";

export const dungeonParams = Type.Object({
  accept: Type.Optional(
    Type.Boolean({
      description: "For bind: false refuses the save prompt. Default true.",
    }),
  ),
  do: Type.Optional(
    StringEnum(["status", "difficulty", "reset", "bind", "extend"], {
      description: "status: difficulty, saves and the queue. Default status.",
    }),
  ),
  extended: Type.Optional(
    Type.Boolean({
      description: "For extend: false shortens the lock. Default true.",
    }),
  ),
  for: Type.Optional(
    StringEnum(["dungeon", "raid"], {
      description: "Which difficulty the difficulty verb sets.",
    }),
  ),
  map: Type.Optional(
    Type.Number({
      description: "For extend: the saved map id whose lock changes.",
    }),
  ),
  value: Type.Optional(
    Type.String({
      description:
        "The new difficulty: normal or heroic for a dungeon; 10, 25, 10-heroic or 25-heroic for a raid.",
    }),
  ),
});

export type DungeonArgs = Static<typeof dungeonParams>;
export type DungeonDo = "status" | "difficulty" | "reset" | "bind" | "extend";

export type DungeonAfter = {
  do: DungeonDo;
  detail: string;
  refreshed: boolean;
  saves: string[];
  status: string;
};

export type DungeonCtx = ToolCtx<DungeonAfter>;

export function emptyDungeon(): DungeonAfter {
  return {
    detail: "",
    do: "status",
    refreshed: false,
    saves: [],
    status: "DONE",
  };
}

type Snapshots = { instances: InstancesSnapshot; lfg: LfgSnapshot };

function snapshotsOf(ctx: DungeonCtx): Snapshots {
  return {
    instances: ctx.handle.instances.state(),
    lfg: ctx.handle.lfg.state(),
  };
}

const RAID_VALUE: Readonly<Record<string, number>> = {
  "10": 0,
  "10-heroic": 2,
  "10-normal": 0,
  "25": 1,
  "25-heroic": 3,
  "25-normal": 1,
};

function difficultyValue(
  kind: "dungeon" | "raid",
  value: string,
): number | undefined {
  if (kind === "dungeon") {
    if (value === "normal") return 0;
    if (value === "heroic") return 1;
    return undefined;
  }
  return RAID_VALUE[value];
}

async function refreshSaves(
  ctx: DungeonCtx,
  instances: InstancesSnapshot,
): Promise<{ instances: InstancesSnapshot; refreshed: boolean }> {
  const outcome = await ctx.handle.instances.act.requestLockouts();
  if (outcome.status !== "ok") return { instances, refreshed: false };
  const next = snapshotsOf(ctx).instances;
  return { instances: { ...next, locks: outcome.locks }, refreshed: true };
}

function statusAfter(
  ctx: DungeonCtx,
  snapshots: Snapshots,
  refreshed: boolean,
): ToolResult<DungeonAfter> {
  const now = ctx.rt.clock.now();
  const lines = difficultyLines(snapshots.instances, now);
  if (!refreshed) lines.push("The save list did not refresh.");
  const saves = savesLine(snapshots.instances, snapshots.lfg, now);
  const detailLine =
    lines.find((line) => line.startsWith("Here:")) ??
    lines[0] ??
    "No saved instances.";
  return result("DONE", {
    after: {
      detail: detailLine,
      do: "status",
      refreshed,
      saves,
      status: "DONE",
    },
    body: [...lines, ...saves],
    detail: detailLine,
  });
}

async function runStatus(ctx: DungeonCtx): Promise<ToolResult<DungeonAfter>> {
  const first = snapshotsOf(ctx);
  if (!lockStale(first.instances, ctx.rt.clock.now()))
    return statusAfter(ctx, first, true);
  const refreshed = await ctx.rt.mutex.run(() =>
    refreshSaves(ctx, snapshotsOf(ctx).instances),
  );
  return statusAfter(
    ctx,
    { instances: refreshed.instances, lfg: snapshotsOf(ctx).lfg },
    refreshed.refreshed,
  );
}

function refusedOutcome(reason: string, detail: string): never {
  throw new Refusal({
    detail,
    next: nextCall("dungeon", { do: "status" }),
    reason,
  });
}

async function runDifficulty(
  ctx: DungeonCtx,
  kind: "dungeon" | "raid" | undefined,
  value: string | undefined,
): Promise<ToolResult<DungeonAfter>> {
  if (kind === undefined || value === undefined)
    return refusedOutcome(
      "missing_args",
      kind === "raid"
        ? "Raid difficulty needs a size: 10, 25, 10-heroic or 25-heroic."
        : "Difficulty needs for and value: dungeon normal or heroic, raid 10, 25, 10-heroic or 25-heroic.",
    );
  const wire = difficultyValue(kind, value);
  if (wire === undefined)
    return refusedOutcome(
      "bad_value",
      kind === "raid"
        ? `Raid difficulty needs a size: 10, 25, 10-heroic or 25-heroic, not ${value}.`
        : `Dungeon difficulty is normal or heroic, not ${value}.`,
    );
  const name = difficultyName(kind, wire);
  const outcome = await ctx.rt.mutex.run(() =>
    ctx.handle.instances.act.setDifficulty({ kind, value: wire }),
  );
  if (outcome.status === "ok")
    return result("DONE", {
      after: {
        detail: `${kind} difficulty set to ${name}.`,
        do: "difficulty",
        refreshed: false,
        saves: [],
        status: "DONE",
      },
      body: [
        `${kind === "dungeon" ? "Dungeon" : "Raid"} difficulty is now ${name}.`,
      ],
      detail: `${kind === "dungeon" ? "Dungeon" : "Raid"} difficulty set to ${name}.`,
    });
  if (outcome.status === "unconfirmed_solo")
    return result("UNCONFIRMED", {
      after: {
        detail: `Difficulty change to ${name} was sent.`,
        do: "difficulty",
        refreshed: false,
        saves: [],
        status: "UNCONFIRMED",
      },
      body: [
        `Changed ${kind} difficulty to ${name}; the server does not confirm a solo change; it shows on your next dungeon entry.`,
      ],
      detail: `Changed ${kind} difficulty to ${name}; the server does not confirm a solo change; it shows on your next dungeon entry.`,
      reason: "unconfirmed_solo",
    });
  if (outcome.status === "no_answer")
    return result("UNCONFIRMED", {
      after: {
        detail: `Difficulty change to ${name} was sent.`,
        do: "difficulty",
        refreshed: false,
        saves: [],
        status: "UNCONFIRMED",
      },
      body: [
        `The server did not answer the ${kind} difficulty change to ${name}.`,
      ],
      detail: `The server did not answer the ${kind} difficulty change to ${name}.`,
      reason: "no_answer",
    });
  if (outcome.status === "refused")
    return refusedOutcome(
      outcome.reason,
      outcome.reason === "not_leader"
        ? `Only the group leader can change ${kind} difficulty.`
        : `${kind} difficulty to ${name} was refused (${outcome.reason}).`,
    );
  throw new Error(`unexpected difficulty outcome ${outcome.status}`);
}

async function runReset(ctx: DungeonCtx): Promise<ToolResult<DungeonAfter>> {
  const outcome = await ctx.rt.mutex.run(() =>
    ctx.handle.instances.act.resetInstances(),
  );
  if (outcome.status === "nothing_to_reset")
    return result("DONE", {
      after: {
        detail: "There was nothing to reset.",
        do: "reset",
        refreshed: false,
        saves: [],
        status: "DONE",
      },
      body: ["No dungeons needed a reset."],
      detail: "There was nothing to reset.",
      reason: "nothing_to_reset",
    });
  if (outcome.status === "refused")
    return refusedOutcome(
      outcome.reason,
      outcome.reason === "not_leader"
        ? "Only the group leader can reset dungeons."
        : `Reset refused (${outcome.reason}).`,
    );
  if (outcome.status !== "ok")
    throw new Error(`unexpected reset outcome ${outcome.status}`);
  const reset = [...outcome.reset];
  const failed = [...outcome.failed];
  const body = [
    ...reset.map((mapId) => `map ${mapId} was reset.`),
    ...failed.map((mapId) => `map ${mapId} stayed inside and was not reset.`),
  ];
  if (failed.length === 0)
    return result("DONE", {
      after: {
        detail: body.join(" "),
        do: "reset",
        refreshed: false,
        saves: [],
        status: "DONE",
      },
      body,
      detail: body.join(" "),
    });
  if (reset.length === 0) return refusedOutcome("reset_failed", body.join(" "));
  return result("PARTLY", {
    after: {
      detail: body.join(" "),
      do: "reset",
      refreshed: false,
      saves: [],
      status: "PARTLY",
    },
    body,
    detail: body.join(" "),
  });
}

async function runBind(
  ctx: DungeonCtx,
  accept: boolean | undefined,
): Promise<ToolResult<DungeonAfter>> {
  const keep = accept ?? true;
  const outcome = await ctx.rt.mutex.run(() =>
    ctx.handle.instances.act.answerBind(keep),
  );
  if (outcome.status === "ok")
    return result("DONE", {
      after: {
        detail: keep
          ? "Accepted the instance save."
          : "Refused the instance save.",
        do: "bind",
        refreshed: false,
        saves: [],
        status: "DONE",
      },
      body: [
        keep
          ? "You are now saved to this instance."
          : "You refused the save and keep your old bind.",
      ],
      detail: keep
        ? "Accepted the instance save."
        : "Refused the instance save.",
    });
  if (outcome.status === "no_answer")
    return result("UNCONFIRMED", {
      after: {
        detail: "The bind answer was sent.",
        do: "bind",
        refreshed: false,
        saves: [],
        status: "UNCONFIRMED",
      },
      body: ["The server did not answer the bind choice."],
      detail: "The server did not answer the bind choice.",
      reason: "no_answer",
    });
  if (outcome.status === "refused")
    return refusedOutcome(
      outcome.reason,
      outcome.reason === "no_bind_offer"
        ? "No instance save prompt is open."
        : `The bind answer was refused (${outcome.reason}).`,
    );
  throw new Error(`unexpected bind outcome ${outcome.status}`);
}

function heldLocks(
  locks: readonly RaidLockView[],
  map: number,
): RaidLockView[] {
  return locks.filter((lock) => lock.mapId === map);
}

async function runExtend(
  ctx: DungeonCtx,
  map: number | undefined,
  extended: boolean | undefined,
  value: string | undefined,
): Promise<ToolResult<DungeonAfter>> {
  if (map === undefined)
    return refusedOutcome(
      "missing_args",
      "Extend needs the map id of the saved lock.",
    );
  const locks = ctx.handle.instances.state().locks ?? [];
  const held = heldLocks(locks, map);
  if (held.length === 0)
    return refusedOutcome(
      "no_matching_lock",
      `No save is held for map ${map}.`,
    );
  const want = extended ?? true;
  let picked = held[0];
  if (value !== undefined) {
    const wire = RAID_VALUE[value];
    if (wire === undefined || held.every((lock) => lock.difficulty !== wire))
      return refusedOutcome(
        "bad_value",
        `Map ${map} has no save with difficulty ${value}.`,
      );
    picked = held.find((lock) => lock.difficulty === wire) ?? held[0];
  } else if (held.length > 1)
    return refusedOutcome(
      "ambiguous",
      `Map ${map} has ${held.length} saves; name one with value 10, 25, 10-heroic or 25-heroic.`,
    );
  const difficulty = (picked as RaidLockView).difficulty;
  const outcome = await ctx.rt.mutex.run(() =>
    ctx.handle.instances.act.setLockoutExtended({
      difficulty,
      extended: want,
      mapId: map,
    }),
  );
  if (outcome.status === "ok")
    return result("DONE", {
      after: {
        detail: `Map ${map} lock ${want ? "extended" : "shortened"}.`,
        do: "extend",
        refreshed: false,
        saves: [],
        status: "DONE",
      },
      body: [`Map ${map} lock ${want ? "extended." : "shortened."}`],
      detail: `Map ${map} lock ${want ? "extended." : "shortened."}`,
    });
  if (outcome.status === "no_answer")
    return result("UNCONFIRMED", {
      after: {
        detail: `Map ${map} extend answer was sent.`,
        do: "extend",
        refreshed: false,
        saves: [],
        status: "UNCONFIRMED",
      },
      body: [`The server did not answer the extend choice for map ${map}.`],
      detail: `The server did not answer the extend choice for map ${map}.`,
      reason: "no_answer",
    });
  if (outcome.status === "refused")
    return refusedOutcome(
      outcome.reason,
      `Extending map ${map} was refused (${outcome.reason}).`,
    );
  throw new Error(`unexpected extend outcome ${outcome.status}`);
}

export async function runDungeon(
  args: DungeonArgs,
  ctx: DungeonCtx,
): Promise<ToolResult<DungeonAfter>> {
  const do_ = (args.do ?? "status") as DungeonDo;
  if (do_ === "status") return runStatus(ctx);
  if (do_ === "difficulty")
    return runDifficulty(
      ctx,
      args.for === "dungeon" || args.for === "raid" ? args.for : undefined,
      args.value,
    );
  if (do_ === "reset") return runReset(ctx);
  if (do_ === "bind") return runBind(ctx, args.accept);
  if (do_ === "extend")
    return runExtend(ctx, args.map, args.extended, args.value);
  return refusedOutcome(
    "unknown_verb",
    `Unknown dungeon verb ${String(do_)}. Use status, difficulty, reset, bind or extend.`,
  );
}

function dungeonCall(args: unknown, theme: CallInit["theme"]): string {
  return callLine({
    icon: "clock",
    parts: [
      argText(args, "do") ?? "status",
      argText(args, "for"),
      argText(args, "value"),
    ],
    theme,
    verb: "dungeon",
  });
}

function dungeonBody({
  after,
  expanded,
}: {
  after: DungeonAfter;
  expanded: boolean;
}): string[] {
  if (!expanded) return [];
  return [...after.saves];
}

export const dungeonRenderers: ToolRenderers<"dungeon", DungeonAfter> = {
  renderCall: callRenderer(dungeonCall),
  renderResult: resultRenderer("dungeon", dungeonBody),
};

export const dungeonSpec: GameToolSpec<
  typeof dungeonParams,
  "dungeon",
  DungeonAfter
> = {
  fallback: emptyDungeon,
  kind: "action",
  minimalArgs: {},
  name: "dungeon",
  parameters: dungeonParams,
  renderers: dungeonRenderers,
  run: runDungeon,
  text: {
    description:
      "Shows dungeon and raid difficulty, saved instances and the dungeon finder queue. It sets difficulty, resets dungeons, answers the save prompt and extends raid locks.",
    guidelines: [
      "Only the group leader can change difficulty or reset dungeons.",
    ],
    label: "Dungeon",
  },
};

export const dungeonTool = defineGameTool(dungeonSpec);
