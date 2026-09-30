import { needGroup, runRaidSettled } from "#harness/areas/raid/tool-settle";
import {
  emptyGroup,
  type GroupAfter,
  type GroupArgs,
  type GroupCtx,
  isAssistant,
  isLeader,
  type RaidGroup,
} from "#harness/areas/raid/tool-shared";
import type { ToolResult } from "#harness/contract/result";
import { Refusal } from "#harness/ops/refusal";
import { resolveUnit, unitRefusal } from "#harness/ops/resolve";

const ICONS: Record<string, number> = {
  circle: 1,
  cross: 6,
  diamond: 2,
  moon: 4,
  skull: 7,
  square: 5,
  star: 0,
  triangle: 3,
};

export const MARK_ICONS = Object.keys(ICONS).join(", ");

const CLEAR = "clear";
const SELF_GUID = 0n;

function refuse(reason: string, detail: string): never {
  throw new Refusal({ detail, next: "end your turn.", reason });
}

function needRankRaid(group: RaidGroup, ctx: GroupCtx): void {
  if (
    group.kind === "raid" &&
    !(isLeader(group, ctx) || isAssistant(group, ctx))
  )
    refuse("not_leader", "only the leader or an assistant marks a raid.");
}

function iconOf(what: string | undefined): number {
  const named = what?.trim().toLowerCase();
  if (!named) refuse("needs_icon", "name the mark: skull, or clear.");
  const icon = ICONS[named ?? ""];
  if (icon === undefined)
    refuse("bad_icon", `${what} is not a mark. Use ${MARK_ICONS}, or clear.`);
  return icon;
}

export function markTool(
  args: GroupArgs,
  ctx: GroupCtx,
): Promise<ToolResult<GroupAfter>> {
  const { group } = needGroup(ctx);
  needRankRaid(group, ctx);
  const named = args.what?.trim().toLowerCase();
  if (named === CLEAR) return clearTool(args, ctx);
  const icon = iconOf(args.what);
  const text = args.target?.trim();
  if (!text) refuse("needs_target", "name the unit to mark.");
  const resolved = resolveUnit(ctx, { text });
  if (resolved.kind !== "unit")
    throw unitRefusal({ param: "target", resolved, tool: "group" });
  const { guid, unit } = resolved;
  if (unit.kind === "player" && unit.relation === "hostile")
    refuse(
      "hostile_player",
      "marks go on creatures and allies, not hostile players.",
    );
  const self = ctx.handle.getControlState().selfGuid;
  return runRaidSettled(
    ctx,
    () => ctx.handle.raid.act.setRaidMark(icon, guid),
    (answer) => {
      if (answer?.kind !== "raid") return;
      if (answer.event.type !== "raid_mark") return;
      if (answer.event.who !== self || answer.event.icon !== icon) return;
      if (answer.event.target !== guid) return;
      return {
        after: { ...emptyGroup(), confirmed: true, do: "mark" },
        detail: `${unit.name} carries the ${named} mark.`,
        status: "DONE" as const,
      };
    },
    {
      after: { ...emptyGroup(), do: "mark" },
      detail: "the mark is not confirmed yet.",
      failedDetail: "the mark failed to set.",
      next: "end your turn; a [game] message comes if the mark lands.",
    },
  );
}

function clearTool(
  args: GroupArgs,
  ctx: GroupCtx,
): Promise<ToolResult<GroupAfter>> {
  const text = args.target?.trim();
  if (!text) refuse("needs_target", "name the unit to unmark.");
  const resolved = resolveUnit(ctx, { text });
  if (resolved.kind !== "unit")
    throw unitRefusal({ param: "target", resolved, tool: "group" });
  const { guid, unit } = resolved;
  if (unit.kind === "player" && unit.relation === "hostile")
    refuse(
      "hostile_player",
      "marks go on creatures and allies, not hostile players.",
    );
  const marks = ctx.handle.raid.state().marks;
  const clearIcon = marks.indexOf(guid);
  if (clearIcon < 0)
    refuse("not_marked", `${unit.name} carries no mark to clear.`);
  const self = ctx.handle.getControlState().selfGuid;
  return runRaidSettled(
    ctx,
    () => ctx.handle.raid.act.clearRaidMark(clearIcon),
    (answer) => {
      if (answer?.kind !== "raid") return;
      if (answer.event.type !== "raid_mark") return;
      if (answer.event.who !== self || answer.event.icon !== clearIcon) return;
      if (answer.event.target !== SELF_GUID) return;
      return {
        after: { ...emptyGroup(), confirmed: true, do: "mark" },
        detail: `the mark on ${unit.name} is cleared.`,
        status: "DONE" as const,
      };
    },
    {
      after: { ...emptyGroup(), do: "mark" },
      detail: "the clear is not confirmed yet.",
      failedDetail: "the mark failed to clear.",
      next: "end your turn; a [game] message comes if the clear lands.",
    },
  );
}

export async function pingTool(
  args: GroupArgs,
  ctx: GroupCtx,
): Promise<ToolResult<GroupAfter>> {
  needGroup(ctx);
  const text = args.target?.trim();
  let where = "your position";
  let x = ctx.handle.getControlState().pose?.x;
  let y = ctx.handle.getControlState().pose?.y;
  if (text) {
    const resolved = resolveUnit(ctx, { text });
    if (resolved.kind !== "unit")
      throw unitRefusal({ param: "target", resolved, tool: "group" });
    where = resolved.unit.name;
    x = resolved.unit.x;
    y = resolved.unit.y;
  }
  if (x === undefined || y === undefined)
    refuse("no_position", "Peon has no position to ping.");
  let pingFailure: string | undefined;
  try {
    await ctx.rt.mutex.run(() => ctx.handle.raid.act.pingMinimap(x, y));
  } catch (error) {
    pingFailure = error instanceof Error ? error.message : String(error);
  }
  if (pingFailure !== undefined)
    throw new Refusal({
      detail: `the ping failed to send: ${pingFailure}.`,
      next: "end your turn.",
      reason: "error",
      status: "FAILED",
    });
  return {
    after: { ...emptyGroup(), confirmed: true, do: "ping" },
    body: [],
    detail: `ping sent at ${where}.`,
    status: "DONE",
  };
}
