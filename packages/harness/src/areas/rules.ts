import type { AreaEvent, AreaEventOf, AreaHandles, AreaName } from "@peon/core";
import type { AreaDraft, AreaRules } from "#harness/areas/contract";
import { HARNESS_AREAS } from "#harness/areas/registry";
import type { LogDraft } from "#harness/contract/log";
import type { RuleInput } from "#harness/events/rules";
import type { Game } from "#harness/loops/game";

export type AreaRuleSet = { readonly [K in AreaName]?: AreaRules<K> };
export type HarnessRegistry = Readonly<
  Record<string, { readonly area: string; rules?: () => object }>
>;

const DRAFT_NAME = /^[a-z_]+$/;

export function areaRuleSet(
  registry: HarnessRegistry = HARNESS_AREAS,
): AreaRuleSet {
  const ruled = Object.entries(registry).flatMap(([area, module]) =>
    module.rules ? [[area, module.rules()] as const] : [],
  );
  return Object.fromEntries(ruled) as AreaRuleSet;
}

function logDraft(area: AreaName, draft: AreaDraft): LogDraft {
  const { name, ...row } = draft;
  if (!DRAFT_NAME.test(name))
    throw new Error(`bad area draft name "${area}/${name}"`);
  return { ...row, domain: area, event: `${area}/${name}` };
}

function scalar(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString(10);
  const plain =
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean";
  return plain ? value : undefined;
}

export function fallbackDraft({ area, event }: AreaEvent): LogDraft {
  const { type }: { readonly type: string } = event;
  const fields = Object.entries(event).flatMap(([key, value]) => {
    const kept = scalar(value);
    return kept === undefined ? [] : [[key, kept] as const];
  });
  return logDraft(area, {
    class: "log",
    data: { ...Object.fromEntries(fields), fallback: true },
    name: type,
    text: `${area} ${type}`,
  });
}

function ruleDrafts<K extends AreaName>(
  rules: AreaRuleSet,
  e: { readonly area: K; readonly event: AreaEventOf<K> },
  rc: RuleInput,
): readonly AreaDraft[] | undefined {
  return rules[e.area]?.event?.(e.event, rc);
}

export function areaDrafts(
  rules: AreaRuleSet,
  event: AreaEvent,
  rc: RuleInput,
): LogDraft[] {
  const { area } = event;
  const drafts = ruleDrafts(rules, event, rc);
  if (!drafts) return [fallbackDraft(event)];
  return drafts.map((draft) => logDraft(area, draft));
}

function isRuled(rules: AreaRuleSet, name: string): name is AreaName {
  return Object.hasOwn(rules, name);
}

function stateDrafts<K extends AreaName>(
  rules: AreaRuleSet,
  handles: AreaHandles,
  area: K,
  rc: RuleInput,
): LogDraft[] {
  const attach = rules[area]?.attach;
  if (!attach) return [];
  return attach(handles[area].state(), rc).map((draft) =>
    logDraft(area, draft),
  );
}

export function attachDrafts(
  rules: AreaRuleSet,
  handle: Game,
  rc: RuleInput,
): LogDraft[] {
  return Object.keys(rules)
    .filter((name) => isRuled(rules, name))
    .flatMap((area) => stateDrafts(rules, handle, area, rc));
}
