import { type QuestState, questSlotStatus } from "@tuicraft/core";
import type { ToolResult } from "#harness/contract/result";
import type { ViewCtx } from "#harness/contract/services";
import { nextCall } from "#harness/tools/next-call";

type Goal = { objectives: string; ender: string | undefined };

const ENDERS = [
  /\b(?:[Ss]peak|[Tt]alk)(?: again)? (?:with|to) ([A-Z][\w'-]*(?: (?:[A-Z][\w'-]*|of|the)(?=[ .,;!]|$))*)/,
  /\b(?:[Rr]eport|[Rr]eturn)(?: back)? to ([A-Z][\w'-]*(?: (?:[A-Z][\w'-]*|of|the)(?=[ .,;!]|$))*)/,
  /\b(?:[Bb]ring|[Dd]eliver|[Tt]ake)\b[^.]*? to ([A-Z][\w'-]*(?: (?:[A-Z][\w'-]*|of|the)(?=[ .,;!]|$))*)/,
];
const TRAILING = / (?:of|the)$/;

export function enderIn(text: string): string | undefined {
  for (const pattern of ENDERS) {
    const name = pattern.exec(text)?.[1]?.replace(TRAILING, "");
    if (name) return name;
  }
}

export function questGoal({ handle, rt }: ViewCtx, questId: number): Goal {
  const note = rt.quests.get(questId);
  const query = handle
    .getQuestState()
    .queries.find((known) => known.questId === questId);
  const queried = query?.status === "known" ? query.data.objectives.trim() : "";
  const objectives = note?.objectives || queried;
  return { ender: note?.ender ?? enderIn(objectives), objectives };
}

export function questTitle(ctx: ViewCtx, questId: number): string {
  const query = ctx.handle
    .getQuestState()
    .queries.find((known) => known.questId === questId);
  if (query?.status === "known") return query.data.title;
  return ctx.rt.quests.get(questId)?.title ?? `quest ${questId}`;
}

export function turnInTarget(
  ctx: ViewCtx,
  questId: number,
): string | undefined {
  return questGoal(ctx, questId).ender ?? ctx.rt.quests.get(questId)?.giver;
}

export function turnInNext(ctx: ViewCtx, questId: number): string {
  const target = turnInTarget(ctx, questId);
  return target
    ? nextCall("interact", { do: "turn_in", npc: target })
    : nextCall("look", { find: "questgiver" });
}

export function completeQuestIds(state: QuestState): Set<number> {
  const ids = new Set<number>();
  for (const slot of state.log.slots)
    if (slot.questId && questSlotStatus(slot) === "complete")
      ids.add(slot.questId);
  return ids;
}

export function noteQuestsDone<A>(
  ctx: ViewCtx,
  before: ReadonlySet<number>,
  report: ToolResult<A>,
): ToolResult<A> {
  const done = [...completeQuestIds(ctx.handle.getQuestState())].filter(
    (questId) => !before.has(questId),
  );
  const [first] = done;
  if (first === undefined) return report;
  const lines = done.map((questId) => ` Quest ${questId} complete.`).join("");
  return {
    ...report,
    detail: `${report.detail}${lines}`,
    next: report.next ?? turnInNext(ctx, first),
  };
}
