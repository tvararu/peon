import type { AreaActsOf } from "@peon/core";
import { abortable } from "@peon/core/lib/abort";
import {
  asCatalog,
  freePointsOf,
  heldRanks,
  type TalentsAfter,
  type TalentsCatalog,
  type TalentsCtx,
  tabName,
  talentName,
} from "#harness/areas/talents/tool-types";
import type { ToolResult } from "#harness/contract/result";
import { Refusal } from "#harness/ops/refusal";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";
export type LearnWant = { talent: number; rank: number };

type LearnResult = AreaActsOf<"talents">["learnTalents"] extends (
  ...args: never[]
) => Promise<infer R>
  ? R
  : never;

type LearnOutcome = LearnResult extends { entries: { outcome: infer O }[] }
  ? O
  : never;
export const REASONS: Record<string, string> = {
  ambiguous_name: "more than one talent has that name; use the id.",
  bad_rank: "that rank does not exist; ranks run 1-5.",
  duplicate_entry: "that talent and rank is already in the plan.",
  missing_plan: "name the talent and rank to learn.",
  names_need_talent_data: "talent names need talent data; use ids.",
  needs_prerequisite: "the talent needs its prerequisite first.",
  no_points: "you have no free talent points.",
  no_reply: "the server did not answer.",
  not_enough_points: "you do not have enough free talent points.",
  rank_held: "you already hold that rank.",
  refused_by_server: "the server did not accept that rank.",
  tier_locked: "a higher row in the same tab is locked.",
  unknown_name: "no talent has that name; check show.",
  wrong_class: "your class cannot learn that talent.",
};

const DIGITS = /^\d+$/;

function digits(value: string): number | undefined {
  if (!DIGITS.test(value.trim())) return undefined;
  const id = Number(value.trim());
  return Number.isSafeInteger(id) ? id : undefined;
}

function nameToId(
  ctx: TalentsCtx,
  catalog: TalentsCatalog,
  want: string,
): number {
  const trimmed = want.trim();
  const ids = new Set<number>();
  for (const classId of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    for (const entry of catalog.talentsForClass(classId)) ids.add(entry.id);
  const lowered = trimmed.toLowerCase();
  const nameOf = (id: number): string => {
    const first = catalog.talent(id)?.ranks[0];
    if (first === undefined) return `talent ${id}`;
    return (ctx.handle.spellDefinition(first)?.name ?? `talent ${id}`)
      .trim()
      .toLowerCase();
  };
  const matched = [...ids].filter((id) => nameOf(id) === lowered);
  if (matched.length === 1) return matched[0] as number;
  const reason = matched.length > 1 ? "ambiguous_name" : "unknown_name";
  throw new Refusal({
    detail: `${trimmed} is not a learnable talent: ${REASONS[reason]}.`,
    next: nextCall("talents", { do: "show" }),
    reason,
  });
}

export function resolveWant(
  ctx: TalentsCtx,
  catalog: TalentsCatalog | undefined,
  want: { talent: string; rank: number },
): LearnWant {
  const id = digits(want.talent);
  if (id !== undefined) {
    if (id > 0xff_ff_ff_ff)
      throw new Refusal({
        detail: `${want.talent} is outside the talent id range; check show.`,
        next: nextCall("talents", { do: "show" }),
        reason: "unknown_talent",
      });
    return { rank: want.rank, talent: id };
  }
  if (catalog === undefined)
    throw new Refusal({
      detail: `${want.talent} cannot be spent by name: talent data is missing, so spend by id.`,
      next: nextCall("talents", { do: "show" }),
      reason: "names_need_talent_data",
    });
  return { rank: want.rank, talent: nameToId(ctx, catalog, want.talent) };
}

function learnedText(
  ctx: TalentsCtx,
  catalog: TalentsCatalog | undefined,
  talentId: number,
  rank: number,
): string {
  const tab = tabName(catalog, talentId);
  return `Learned ${talentName(ctx, catalog, talentId)} ${rank}/${catalog?.talent(talentId)?.ranks.length ?? "?"}${
    tab ? ` (${tab})` : ""
  }.`;
}

export async function learnTalents(
  ctx: TalentsCtx,
  wants: readonly { talent: string; rank: number }[],
): Promise<ToolResult<TalentsAfter>> {
  const { handle } = ctx;
  if (wants.length === 0)
    throw new Refusal({
      detail: "name the talent and rank to learn.",
      next: nextCall("talents", { do: "show" }),
      reason: "missing_plan",
    });
  const beforeHeld = heldRanks(handle.talents.state());
  const catalog = asCatalog(
    await abortable(handle.talents.act.catalog(), ctx.signal),
  );
  const entries = entriesOf(ctx, catalog, wants);
  const outcome = await sendEntries(ctx, entries);
  const byEntry = new Map(
    outcome.entries.map((entry) => [
      `${entry.talentId}:${entry.rank}`,
      entry.outcome,
    ]),
  );
  const after = handle.talents.state();
  const learned = outcome.entries.filter(
    (entry) => entry.outcome === "learned",
  ).length;
  const left = freePointsOf(after);
  const body = entries.map((entry) => {
    const outcomeOf =
      byEntry.get(`${entry.talent}:${entry.rank - 1}`) ?? "no_reply";
    if (outcomeOf !== "learned") {
      const counted =
        outcomeOf === "tier_locked"
          ? ` (${tabInfo(catalog, beforeHeld, entry)})`
          : "";
      return `${talentName(ctx, catalog, entry.talent)} not learned: ${REASONS[outcomeOf] ?? outcomeOf}${counted}`;
    }
    const text = learnedText(ctx, catalog, entry.talent, entry.rank);
    return entry === entries.at(-1) &&
      entries.length === learned &&
      left !== undefined
      ? `${text} ${left} point${left === 1 ? "" : "s"} left.`
      : text;
  });
  return learnResult(outcome.entries, entries.length, body, {
    do: "learn",
    freePoints: left,
    learned,
  });
}

function entriesOf(
  ctx: TalentsCtx,
  catalog: TalentsCatalog | undefined,
  wants: readonly { talent: string; rank: number }[],
): LearnWant[] {
  const entries = [] as LearnWant[];
  for (const want of wants) entries.push(resolveWant(ctx, catalog, want));
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = `${entry.talent}:${entry.rank}`;
    if (seen.has(key))
      throw new Refusal({
        detail: `${talentName(ctx, catalog, entry.talent)} rank ${entry.rank} is listed twice: learn each rank once.`,
        next: nextCall("talents", { do: "show" }),
        reason: "duplicate_entry",
      });
    seen.add(key);
  }
  return entries;
}

async function sendEntries(
  ctx: TalentsCtx,
  entries: readonly LearnWant[],
): Promise<LearnResult> {
  const wire = entries.map((entry) => ({
    rank: entry.rank - 1,
    talentId: entry.talent,
  }));
  const queued = ctx.rt.mutex.run(async () => {
    ctx.signal.throwIfAborted();
    return await ctx.handle.talents.act.learnTalents(wire);
  });
  queued.then(
    () => undefined,
    () => undefined,
  );
  return await abortable(queued, ctx.signal);
}

function learnResult(
  outcomes: readonly { outcome: LearnOutcome }[],
  total: number,
  body: string[],
  afterResult: TalentsAfter,
): ToolResult<TalentsAfter> {
  const learned = afterResult.learned;
  if (learned === total)
    return result("DONE", {
      after: afterResult,
      body,
      detail: `Learned ${learned} talent${learned === 1 ? "" : "s"}.`,
    });
  if (outcomes.every((entry) => entry.outcome === "no_reply"))
    return result("UNCONFIRMED", {
      after: afterResult,
      body,
      detail: "The server did not answer the learn request.",
      next: nextCall("talents", { do: "show" }),
      reason: "no_reply",
    });
  const first = outcomes.find((entry) => entry.outcome !== "learned")?.outcome;
  return result("REFUSED", {
    after: afterResult,
    body,
    detail: "Some talents were not learned.",
    next: nextCall("talents", { do: "show" }),
    reason: first ?? "refused_by_server",
  });
}
function tabInfo(
  catalog: TalentsCatalog | undefined,
  beforeHeld: Map<number, number>,
  entry: LearnWant,
): string {
  const row = catalog?.talent(entry.talent)?.row ?? 0;
  const tab = tabName(catalog, entry.talent) ?? "that tab";
  const tabId = catalog?.talent(entry.talent)?.tab;
  let spent = 0;
  for (const [id, rank] of beforeHeld)
    if (tabId !== undefined && catalog?.talent(id)?.tab === tabId)
      spent += rank;
  return `${tab} has ${spent} of ${row * 5} points`;
}
