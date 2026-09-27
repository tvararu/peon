import type {
  NamedTrainerSpell,
  TrainerEvent,
  VendorEvent,
} from "@tuicraft/core";
import type { InteractAfter, TrainerLine } from "#harness/contract/details";
import type { ToolCtx } from "#harness/contract/services";
import { Refusal } from "#harness/ops/refusal";
import { settle } from "#harness/ops/settle";
import { nextCall, result } from "#harness/tools/define";
import {
  ANSWER_MS,
  baseAfter,
  type InteractStep,
  moneyChange,
  moneyText,
  type NpcTarget,
  npcLabel,
  send,
  shortMoney,
  type TalkExtra,
} from "#harness/tools/interact-quest";

const SPELLS_SHOWN = 6;
const TRAINER_ROLES = new Set([
  "trainer",
  "class_trainer",
  "profession_trainer",
]);

function trainerStep(
  ctx: ToolCtx<InteractAfter>,
  init: { settled: readonly TrainerEvent["type"][]; packet: () => void },
): Promise<TrainerEvent | undefined> {
  return settle<TrainerEvent>({
    match: (event) => init.settled.includes(event.type),
    send: send(ctx, init.packet),
    signal: ctx.signal,
    subscribe: (cb) => ctx.handle.onTrainerEvent(cb),
    timeoutMs: ANSWER_MS,
  });
}

function vendorStep(
  ctx: ToolCtx<InteractAfter>,
  init: { settled: readonly VendorEvent["type"][]; packet: () => void },
): Promise<VendorEvent | undefined> {
  return settle<VendorEvent>({
    match: (event) => init.settled.includes(event.type),
    send: send(ctx, init.packet),
    signal: ctx.signal,
    subscribe: (cb) => ctx.handle.onVendorEvent(cb),
    timeoutMs: ANSWER_MS,
  });
}

export async function openTrainerWindow(
  ctx: ToolCtx<InteractAfter>,
  npc: NpcTarget,
): Promise<NamedTrainerSpell[] | undefined> {
  const listed = await trainerStep(ctx, {
    packet: () => ctx.handle.openTrainer(npc.guid),
    settled: ["listed", "refused", "unanswered"],
  });
  if (listed?.type !== "listed") return;
  return (await ctx.handle.getTrainerState()).offer?.spells;
}

function lineState(state: NamedTrainerSpell["state"]): TrainerLine["state"] {
  if (state === "known") return "known";
  if (state === "available") return "available";
  return "unavailable";
}

export function trainerLines(
  spells: readonly NamedTrainerSpell[],
): TrainerLine[] {
  return spells.map((spell) => ({
    cost: spell.cost,
    level: spell.requiredLevel,
    name: spell.name ?? `spell ${spell.spellId}`,
    rank: spell.rank ?? undefined,
    spellId: spell.spellId,
    state: lineState(spell.state),
  }));
}

function spellName(line: TrainerLine): string {
  return line.rank ? `${line.name} (${line.rank})` : line.name;
}

function nextLevelText(spells: readonly NamedTrainerSpell[]): string {
  const levels = spells
    .filter((spell) => spell.state === "too_low")
    .map((spell) => spell.requiredLevel);
  return levels.length === 0
    ? ""
    : ` Next new spells at level ${Math.min(...levels)}.`;
}

export const trainerExtra: TalkExtra = async ({ ctx, npc }) => {
  if (!npc.unit.roles.some((role) => TRAINER_ROLES.has(role)))
    return { after: {}, lines: [] };
  const spells = await openTrainerWindow(ctx, npc);
  if (!spells)
    return { after: {}, lines: ["The trainer window did not open in 5 s."] };
  const lines = trainerLines(spells);
  const now = lines
    .filter((line) => line.state === "available")
    .slice(0, SPELLS_SHOWN);
  const teaches =
    now.length === 0
      ? "Nothing to learn now."
      : `Teaches now: ${now.map((line) => `${spellName(line)} ${shortMoney(line.cost)}`).join(", ")}.`;
  return {
    after: { spells: lines },
    lines: [`${teaches}${nextLevelText(spells)}`],
  };
};

export const trainStep: InteractStep = async ({ args, ctx, npc }) => {
  const spells = await openTrainerWindow(ctx, npc);
  if (!spells)
    throw new Refusal({
      detail: `${npcLabel(npc)} did not open a trainer window in 5 s.`,
      next: nextCall("interact", { npc: npc.unit.ref }),
      reason: "no_trainer_window",
      status: "UNCONFIRMED",
    });
  const lines = trainerLines(spells);
  const before = ctx.handle.getInventoryState().coinage ?? 0;
  const what = args.what?.trim().toLowerCase();
  const wanted = lines.filter(
    (line) =>
      line.state === "available" &&
      line.cost <= before &&
      (what === undefined || line.name.toLowerCase().includes(what)),
  );
  const learned: string[] = [];
  const refused: string[] = [];
  for (const line of wanted) {
    const answer = await trainerStep(ctx, {
      packet: () => ctx.handle.trainSpell(line.spellId),
      settled: ["trained", "refused", "unanswered"],
    });
    if (answer?.type === "trained") learned.push(spellName(line));
    else
      refused.push(
        answer?.state.lastOutcome?.reason ?? answer?.type ?? "no_answer",
      );
  }
  const change = moneyChange(ctx, before);
  const after = {
    ...baseAfter(ctx, npc, "train"),
    learned,
    money: change,
    spells: lines,
  };
  if (wanted.length === 0)
    return result("DONE", {
      after,
      detail: `nothing to learn from ${npcLabel(npc)} now.${nextLevelText(spells)}`,
    });
  const cost = change ? change.before - change.after : 0;
  const detail = `learned ${learned.length === 0 ? "nothing" : learned.join(", ")} for ${shortMoney(cost)}${moneyText(change)}.`;
  if (refused.length === 0) return result("DONE", { after, detail });
  return result(learned.length === 0 ? "FAILED" : "PARTLY", {
    after,
    detail: `${detail} Refused: ${refused.join(", ")}.`,
    reason: refused[0] ?? "refused",
  });
};

const NOTHING_DAMAGED = "Nothing needs repair";

async function openRepairWindow(
  ctx: ToolCtx<InteractAfter>,
  npc: NpcTarget,
): Promise<void> {
  if (!npc.unit.roles.includes("repair"))
    throw new Refusal({
      detail: `${npcLabel(npc)} does not repair.`,
      next: nextCall("look", { find: "repair" }),
      reason: "not_repairer",
    });
  const listed = await vendorStep(ctx, {
    packet: () => ctx.handle.openVendor(npc.guid),
    settled: ["listed", "refused", "unanswered"],
  });
  if (listed?.type !== "listed")
    throw new Refusal({
      detail: `${npcLabel(npc)} did not open a vendor window in 5 s.`,
      next: nextCall("interact", { do: "repair", npc: npc.unit.ref }),
      reason: "no_vendor_window",
      status: "UNCONFIRMED",
    });
}

async function repairAnswer(
  ctx: ToolCtx<InteractAfter>,
): Promise<VendorEvent | "nothing_damaged" | undefined> {
  try {
    return await vendorStep(ctx, {
      packet: () => ctx.handle.repairAll(),
      settled: ["repaired", "refused", "unanswered"],
    });
  } catch (error) {
    if (error instanceof Error && error.message === NOTHING_DAMAGED)
      return "nothing_damaged";
    throw error;
  }
}

export const repairStep: InteractStep = async ({ ctx, npc }) => {
  await openRepairWindow(ctx, npc);
  const before = ctx.handle.getInventoryState().coinage;
  const answer = await repairAnswer(ctx);
  if (answer === "nothing_damaged")
    return result("DONE", {
      after: { ...baseAfter(ctx, npc, "repair"), repairCost: 0 },
      detail: "nothing to repair: all gear is at full durability.",
    });
  const change = moneyChange(ctx, before);
  const repairCost = change ? change.before - change.after : undefined;
  const after = { ...baseAfter(ctx, npc, "repair"), money: change, repairCost };
  if (answer?.type === "repaired")
    return result("DONE", {
      after,
      detail: `repaired all gear for ${shortMoney(repairCost ?? 0)}${moneyText(change)}.`,
    });
  const reason =
    answer?.state.lastOutcome?.reason ?? answer?.type ?? "no_answer";
  return result("FAILED", {
    after,
    detail: `${npcLabel(npc)} did not repair (${reason}).`,
    next: nextCall("journal", { about: "bags" }),
    reason,
  });
};
