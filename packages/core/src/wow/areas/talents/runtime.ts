import { abortable } from "#lib/abort";
import { ignoreFailure } from "#lib/ignore-failure";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  loadTalentCatalog,
  type TalentCatalog,
} from "#wow/areas/talents/catalog";
import {
  buildLearnPreviewTalents,
  buildLearnTalent,
} from "#wow/areas/talents/protocol";
import {
  MAX_TALENT_RANK,
  orderPlan,
  type RulesState,
  type TalentRefusal,
} from "#wow/areas/talents/rules";
import type {
  TalentsEvent,
  TalentsState,
  TalentsStore,
} from "#wow/areas/talents/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { TalentRank } from "#wow/protocol/talent-spec";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";
import type { CoreStores } from "#wow/session-stores";

export const LEARN_ANSWER_MS = 5000;

export type LearnOutcome =
  | "learned"
  | "refused_by_server"
  | "no_reply"
  | TalentRefusal;

export type LearnEntryResult = {
  talentId: number;
  rank: number;
  outcome: LearnOutcome;
};

export type LearnTalentsResult = {
  catalog: boolean;
  entries: LearnEntryResult[];
};

export type TalentsActs = {
  catalog: () => Promise<TalentCatalog | undefined>;
  learnTalents: (plan: readonly TalentRank[]) => Promise<LearnTalentsResult>;
};

type Env = {
  ctx: AreaRuntimeCtx<TalentsEvent>;
  store: TalentsStore;
  catalog: () => Promise<TalentCatalog | undefined>;
};

function rulesState(env: Env): RulesState {
  const snapshot = env.store.snapshot();
  const guid = env.ctx.selfGuid();
  const entity = guid ? env.store.entityOf(guid) : undefined;
  const held = new Map<number, number>();
  const active = snapshot.player?.specs[snapshot.player.activeSpec];
  for (const talent of active?.talents ?? [])
    held.set(talent.talentId, talent.rank + 1);
  const bytes0 = entity?.rawFields.get(UNIT_FIELDS.BYTES_0.offset) ?? 0;
  return {
    classId: (bytes0 >> 8) & 0xff,
    freePoints: snapshot.player?.freePoints ?? snapshot.fields.freePoints,
    held,
  };
}

function decidedLocally(
  entry: TalentRank,
  state: RulesState,
): LearnOutcome | undefined {
  if (state.freePoints === 0) return "no_points";
  if (entry.rank >= MAX_TALENT_RANK) return "bad_rank";
  return undefined;
}

function rankOf(snapshot: TalentsState, entry: TalentRank): number | undefined {
  const active = snapshot.player?.specs[snapshot.player.activeSpec];
  return active?.talents.find((talent) => talent.talentId === entry.talentId)
    ?.rank;
}

function gradeReply(
  env: Env,
  entries: readonly TalentRank[],
): LearnEntryResult[] {
  const snapshot = env.store.snapshot();
  return entries.map((entry) => {
    const rank = rankOf(snapshot, entry);
    return {
      outcome:
        rank !== undefined && rank >= entry.rank
          ? ("learned" as const)
          : ("refused_by_server" as const),
      rank: entry.rank,
      talentId: entry.talentId,
    };
  });
}

function refusedEntry(
  refused: TalentRank,
  outcome: LearnOutcome,
): LearnEntryResult {
  return { outcome, rank: refused.rank, talentId: refused.talentId };
}

function sendAndWait(
  env: Env,
  toSend: readonly TalentRank[],
): Promise<LearnEntryResult[] | "no_reply"> {
  const body =
    toSend.length === 1
      ? buildLearnTalent(toSend[0] as TalentRank)
      : buildLearnPreviewTalents(toSend);
  const opcode =
    toSend.length === 1
      ? GameOpcode.CMSG_LEARN_TALENT
      : GameOpcode.CMSG_LEARN_PREVIEW_TALENTS;
  const scope = new AbortController();
  const waited = env.ctx.until((event) => event.type === "info", {
    signal: AbortSignal.any([env.ctx.signal, scope.signal]),
    timeoutMs: LEARN_ANSWER_MS,
  });
  const handled: Promise<LearnEntryResult[] | "no_reply"> = waited.then(
    () => gradeReply(env, toSend),
    (error: unknown) => {
      if (error instanceof Error && error.message === "timeout")
        return "no_reply" as const;
      throw error;
    },
  );
  try {
    env.ctx.signal.throwIfAborted();
    env.ctx.send(opcode, body);
  } catch (error) {
    scope.abort();
    return handled.catch(() => {
      throw error;
    });
  }
  return handled;
}

async function sendDegraded(
  env: Env,
  plan: readonly TalentRank[],
  state: RulesState,
): Promise<LearnTalentsResult> {
  const refusedEntries = plan.filter(
    (entry) => decidedLocally(entry, state) !== undefined,
  );
  const toSend = plan.filter(
    (entry) => decidedLocally(entry, state) === undefined,
  );
  const local = refusedEntries.map((entry) =>
    refusedEntry(entry, decidedLocally(entry, state) ?? "no_points"),
  );
  if (toSend.length === 0) {
    env.store.noteRefused(refusedEntries);
    return { catalog: false, entries: local };
  }
  env.store.noteRefused(refusedEntries);
  const outcome = await sendAndWait(env, toSend);
  if (outcome === "no_reply")
    return {
      catalog: false,
      entries: [
        ...toSend.map((entry) => refusedEntry(entry, "no_reply")),
        ...local,
      ],
    };
  return { catalog: false, entries: [...outcome, ...local] };
}

async function sendRuled(
  env: Env,
  plan: readonly TalentRank[],
  state: RulesState,
  catalog: TalentCatalog,
): Promise<LearnTalentsResult> {
  const ordered = orderPlan(plan, state, catalog);
  const local = ordered.refused.map((refusal) =>
    refusedEntry(refusal.entry, refusal.reason),
  );
  if (ordered.send.length === 0) {
    env.store.noteRefused(ordered.refused.map((refusal) => refusal.entry));
    return { catalog: true, entries: local };
  }
  env.store.noteRefused(ordered.refused.map((refusal) => refusal.entry));
  const outcome = await sendAndWait(env, ordered.send);
  if (outcome === "no_reply")
    return {
      catalog: true,
      entries: [
        ...ordered.send.map((entry) => refusedEntry(entry, "no_reply")),
        ...local,
      ],
    };
  return { catalog: true, entries: [...outcome, ...local] };
}

async function learn(
  env: Env,
  plan: readonly TalentRank[],
): Promise<LearnTalentsResult> {
  const catalog = await abortable(env.catalog(), env.ctx.signal);
  const state = rulesState(env);
  env.ctx.signal.throwIfAborted();
  if (!catalog) return sendDegraded(env, plan, state);
  return sendRuled(env, plan, state, catalog);
}

function catalogLoader(env: Env): () => Promise<TalentCatalog | undefined> {
  let cached: Promise<TalentCatalog | undefined> | undefined;
  return () => {
    cached ??= env.ctx.dbc
      ? loadTalentCatalog(env.ctx.dbc).catch(ignoreFailure)
      : Promise.resolve(undefined);
    return cached;
  };
}

export function talentsRuntime(
  ctx: AreaRuntimeCtx<TalentsEvent>,
  store: TalentsStore,
  _core: CoreStores,
): AreaRuntime<TalentsActs> {
  const env: Env = { catalog: () => Promise.resolve(undefined), ctx, store };
  env.catalog = catalogLoader(env);
  let inFlight = false;
  return {
    act: {
      catalog: () => env.catalog(),
      learnTalents: async (plan) => {
        if (inFlight) throw new Error("talent_request_busy");
        inFlight = true;
        try {
          return await learn(env, plan);
        } finally {
          inFlight = false;
        }
      },
    },
    dispose: () => {
      inFlight = false;
    },
  };
}
