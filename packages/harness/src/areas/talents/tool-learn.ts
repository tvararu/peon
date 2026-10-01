import type { AreaActsOf } from "@peon/core";
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

type LearnOutcome = AreaActsOf<"talents">["learnTalents"] extends (
  ...args: never[]
) => Promise<{ entries: { outcome: infer O }[] }>
  ? O
  : never;

export const REASONS: Record<string, string> = {
  ambiguous_name: "more than one talent has that name; use the id.",
  bad_rank: "that rank does not exist; ranks run 1-5.",
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
  unknown_talent: "the server knows no talent with that id.",
  wrong_class: "your class cannot learn that talent.",
};

function digits(value: string): number | undefined {
  if (!/^\d+$/.test(value.trim())) return undefined;
  const id = Number(value.trim());
  return Number.isSafeInteger(id) ? id : undefined;
}

async function nameToId(
  ctx: TalentsCtx,
  catalog: TalentsCatalog,
  want: string,
): Promise<number> {
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

export async function resolveWant(
  ctx: TalentsCtx,
  catalog: TalentsCatalog | undefined,
  want: { talent: string; rank: number },
): Promise<LearnWant> {
  const id = digits(want.talent);
  if (id !== undefined) return { rank: want.rank, talent: id };
  if (catalog === undefined)
    throw new Refusal({
      detail: `${want.talent} cannot be spent by name: talent data is missing, so spend by id.`,
      next: nextCall("talents", { do: "show" }),
      reason: "names_need_talent_data",
    });
  return { rank: want.rank, talent: await nameToId(ctx, catalog, want.talent) };
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
  const { handle, rt } = ctx;
  if (wants.length === 0)
    throw new Refusal({
      detail: "name the talent and rank to learn.",
      next: nextCall("talents", { do: "show" }),
      reason: "missing_plan",
    });
  const beforeHeld = heldRanks(handle.talents.state());
  const catalog = asCatalog(await handle.talents.act.catalog());
  const entries = [] as LearnWant[];
  for (const want of wants) entries.push(await resolveWant(ctx, catalog, want));
  const wire = entries.map((entry) => ({
    rank: entry.rank - 1,
    talentId: entry.talent,
  }));
  const outcome = await rt.mutex.run(() =>
    handle.talents.act.learnTalents(wire),
  );
  const order = new Map<string, LearnOutcome>(
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
      order.get(`${entry.talent}:${entry.rank - 1}`) ?? "no_reply";
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
  const afterResult: TalentsAfter = {
    do: "learn",
    freePoints: left,
    learned,
  };
  if (learned === entries.length)
    return result("DONE", {
      after: afterResult,
      body,
      detail: `Learned ${learned} talent${learned === 1 ? "" : "s"}.`,
    });
  if (outcome.entries.every((entry) => entry.outcome === "no_reply"))
    return result("UNCONFIRMED", {
      after: afterResult,
      body,
      detail: "The server did not answer the learn request.",
      next: nextCall("talents", { do: "show" }),
      reason: "no_reply",
    });
  const first = outcome.entries.find(
    (entry) => entry.outcome !== "learned",
  )?.outcome;
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
