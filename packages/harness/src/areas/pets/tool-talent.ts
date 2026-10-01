import {
  hearAll,
  type PetAfter,
  type PetCtx,
  SETTLE_MS,
  stateOf,
  throwUnlessOk,
} from "#harness/areas/pets/tool-command";
import type { Heard } from "#harness/areas/spells/tool-wait";
import type { TalentsCatalog } from "#harness/areas/talents/tool-types";
import type { ToolResult } from "#harness/contract/result";
import { Refusal } from "#harness/ops/refusal";
import { settle } from "#harness/ops/settle";
import { result } from "#harness/tools/define";
import { nextCall } from "#harness/tools/next-call";

type PetInfo = {
  freePoints: number | undefined;
  talents: readonly { talentId: number; rank: number }[];
};

type PetTree = {
  tab: { id: number; name: string } | undefined;
  mask: number;
  ids: number[];
};

const FEROCITY: readonly number[] = [1, 2, 7, 11, 12, 25, 37, 39, 44, 45, 46];
const TENACITY: readonly number[] = [4, 5, 6, 8, 9, 20, 21, 32, 42, 43];
const CUNNING: readonly number[] = [3, 24, 26, 27, 30, 31, 33, 34, 35, 38, 41];

function talentMask(family: number): number | undefined {
  if (FEROCITY.includes(family)) return 1;
  if (TENACITY.includes(family)) return 2;
  if (CUNNING.includes(family)) return 4;
  return undefined;
}

function petInfo(ctx: PetCtx): PetInfo {
  const pet = ctx.handle.talents.state()?.pet;
  return {
    freePoints: pet?.freePoints,
    talents: pet?.talents ?? [],
  };
}

type PetReply = {
  freePoints: number | undefined;
  talents: readonly { talentId: number; rank: number }[];
};

function petReplyOf(event: Heard | { type: "entity" }): PetReply | undefined {
  if (!("area" in event) || event.area !== "talents") return undefined;
  const inner = event.event;
  if (inner.type !== "pet_info") return undefined;
  return {
    freePoints: inner.freePoints,
    talents: inner.talents,
  };
}

function tabOf(mask: number): { id: number; name: string } {
  if (mask === 1) return { id: 410, name: "Ferocity" };
  if (mask === 2) return { id: 412, name: "Tenacity" };
  return { id: 411, name: "Cunning" };
}

function maskOfTab(
  catalog: TalentsCatalog,
  entryTab: number,
): number | undefined {
  const tab = catalog.tab(entryTab) as { petMask?: number } | undefined;
  return tab?.petMask;
}

function petIdsOf(catalog: TalentsCatalog, mask: number): number[] {
  const ids: number[] = [];
  for (let id = 2000; id <= 3000; id++) {
    const entry = catalog.talent(id);
    if (entry === undefined) continue;
    if (maskOfTab(catalog, entry.tab) === mask) ids.push(id);
  }
  return ids;
}

function treeOf(
  catalog: TalentsCatalog | undefined,
  family: number,
): PetTree | undefined {
  const mask = talentMask(family);
  if (mask === undefined || catalog === undefined) return undefined;
  const tab = tabOf(mask);
  const named = catalog.tab(tab.id) as { name?: string } | undefined;
  if (typeof named?.name === "string") tab.name = named.name;
  return { ids: petIdsOf(catalog, mask), mask, tab };
}

const DIGITS = /^\d+$/;

function resolveId(
  ctx: PetCtx,
  catalog: TalentsCatalog | undefined,
  tree: PetTree,
  what: string,
): number {
  const trimmed = what.trim();
  if (DIGITS.test(trimmed)) {
    const id = Number(trimmed);
    const talent = catalog?.talent(id);
    const entryTab =
      talent === undefined ? undefined : catalog?.tab(talent.tab);
    const mask = (entryTab as { petMask?: number } | undefined)?.petMask;
    if (talent !== undefined && mask === tree.mask) return id;
    throw new Refusal({
      detail: `${trimmed} is not a talent in this pet's ${tree.tab?.name ?? "tree"}: check the list.`,
      next: nextCall("pet", { do: "talent" }),
      reason: "wrong_tree",
    });
  }
  if (catalog === undefined)
    throw new Refusal({
      detail: `${trimmed} cannot be spent by name: talent data is missing, so spend by id.`,
      next: nextCall("pet", { do: "talent" }),
      reason: "names_need_talent_data",
    });
  const lowered = trimmed.toLowerCase();
  const matched = tree.ids.filter((id) => {
    const first = catalog.talent(id)?.ranks[0];
    if (first === undefined) return false;
    const name = ctx.handle.spellDefinition(first)?.name ?? "";
    return name.trim().toLowerCase() === lowered;
  });
  if (matched.length === 1) return matched[0] as number;
  throw new Refusal({
    detail:
      matched.length > 1
        ? `more than one pet talent is named "${trimmed}": use the id.`
        : `${trimmed} is not a talent in this pet's ${tree.tab?.name ?? "tree"}: check the list.`,
    next: nextCall("pet", { do: "talent" }),
    reason: matched.length > 1 ? "ambiguous_name" : "unknown_talent",
  });
}

function talentLabel(
  ctx: PetCtx,
  catalog: TalentsCatalog | undefined,
  id: number,
): string {
  const first = catalog?.talent(id)?.ranks[0];
  if (first === undefined) return `talent ${id}`;
  return ctx.handle.spellDefinition(first)?.name ?? `talent ${id}`;
}

function lineOf(
  ctx: PetCtx,
  catalog: TalentsCatalog | undefined,
  held: ReadonlyMap<number, number>,
  id: number,
): string {
  const entry = catalog?.talent(id);
  const total = entry?.ranks.length ?? "?";
  const have = held.get(id) ?? 0;
  return `${talentLabel(ctx, catalog, id)} (${id}) ${have}/${total}`;
}

function throwNoPet(): never {
  throw new Refusal({
    detail: "you have no pet out.",
    next: nextCall("pet"),
    reason: "no_pet",
  });
}

export async function talentList(ctx: PetCtx): Promise<ToolResult<PetAfter>> {
  const bar = stateOf(ctx.handle).bar;
  if (!bar) throwNoPet();
  const after: PetAfter = { do: "talent", target: undefined, what: undefined };
  const mask = talentMask(bar.family);
  if (mask === undefined)
    throw new Refusal({
      detail: "this pet has no talent tree.",
      next: nextCall("pet"),
      reason: "no_tree",
    });
  const catalog = await ctx.handle.talents.act.catalog();
  const tree = treeOf(catalog, bar.family) ?? {
    ids: [],
    mask,
    tab: undefined,
  };
  const info = petInfo(ctx);
  const held = new Map(info.talents.map((row) => [row.talentId, row.rank + 1]));
  const name = tree.tab?.name ?? "pet";
  const free =
    info.freePoints === undefined
      ? "free points unknown"
      : `${info.freePoints} free point${info.freePoints === 1 ? "" : "s"}`;
  return result("DONE", {
    after,
    body: tree.ids.map((id) => lineOf(ctx, catalog, held, id)),
    detail: `${free} in the ${name} tree.`,
  });
}

export async function talentFlow(
  what: string,
  ctx: PetCtx,
): Promise<ToolResult<PetAfter>> {
  const name = what.trim();
  const bar = stateOf(ctx.handle).bar;
  if (!bar) throwNoPet();
  if (name === "") return talentList(ctx);
  const mask = talentMask(bar.family);
  if (mask === undefined)
    throw new Refusal({
      detail: "this pet has no talent tree.",
      next: nextCall("pet"),
      reason: "no_tree",
    });
  const after: PetAfter = { do: "talent", target: undefined, what: name };
  const catalog = await ctx.handle.talents.act.catalog();
  const tree = treeOf(catalog, bar.family) ?? { ids: [], mask, tab: undefined };
  const id = resolveId(ctx, catalog, tree, name);
  const entry = catalog?.talent(id);
  const ranks = entry?.ranks.length ?? 0;
  const info = petInfo(ctx);
  const held = new Map(info.talents.map((row) => [row.talentId, row.rank + 1]));
  const have = held.get(id) ?? 0;
  if (ranks > 0 && have >= ranks)
    throw new Refusal({
      detail: `${talentLabel(ctx, catalog, id)} is already at rank ${have}/${ranks}.`,
      next: nextCall("pet", { do: "talent" }),
      reason: "max_rank",
    });
  const display = talentLabel(ctx, catalog, id);
  if ((info.freePoints ?? 1) <= 0)
    return result("FAILED", {
      after,
      detail: `No free pet talent point: ${display} cannot be learned.`,
      reason: "no_points",
    });
  return sendTalent(ctx, after, { display, have, id, total: ranks });
}

type TalentSend = {
  display: string;
  have: number;
  id: number;
  total: number;
};

async function sendTalent(
  ctx: PetCtx,
  after: PetAfter,
  send: TalentSend,
): Promise<ToolResult<PetAfter>> {
  const heard = await settle<Heard | { type: "entity" }>({
    match: (event) => petReplyOf(event as Heard) !== undefined,
    send: () =>
      ctx.rt.mutex.run(() => {
        ctx.signal.throwIfAborted();
        throwUnlessOk(ctx.handle.pets.act.learnPetTalent(send.id, send.have));
      }),
    signal: ctx.signal,
    subscribe: hearAll(ctx.handle),
    timeoutMs: SETTLE_MS,
  });
  if (heard === undefined)
    return result("UNCONFIRMED", {
      after,
      detail: `The server did not answer the pet talent learn of ${send.display}.`,
      next: nextCall("pet"),
      reason: "no_reply",
    });
  return confirmTalent(after, send, petReplyOf(heard) ?? petInfo(ctx));
}

function confirmTalent(
  after: PetAfter,
  send: TalentSend,
  reply: PetReply,
): ToolResult<PetAfter> {
  const got = reply.talents.find((row) => row.talentId === send.id);
  if (got === undefined || got.rank + 1 <= send.have)
    return result("FAILED", {
      after,
      detail: `The server did not learn ${send.display}.`,
      reason: "refused_by_server",
    });
  const total = send.total > 0 ? `${send.total}` : "?";
  const left = reply.freePoints;
  const leftText =
    left === undefined ? "" : ` ${left} point${left === 1 ? "" : "s"} left.`;
  return result("DONE", {
    after,
    detail: `Learned ${send.display} ${got.rank + 1}/${total}.${leftText}`,
  });
}
