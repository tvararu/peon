import type { AreaActsOf, AreaEventOf, AreaName, AreaState } from "@peon/core";
import type { LogClass } from "#harness/contract/log";
import type { RuleInput } from "#harness/events/rules";
import type { GlyphName } from "#harness/ui/glyphs";

export type AreaDraft = {
  class: LogClass;
  name: string;
  text: string;
  data: Record<string, unknown>;
  guid?: string;
  ref?: string;
  progress?: true;
};

export type AreaRules<K extends AreaName> = {
  event?: (event: AreaEventOf<K>, rc: RuleInput) => readonly AreaDraft[];
  attach?: (state: AreaState<K>, rc: RuleInput) => readonly AreaDraft[];
};

export type HarnessArea<
  K extends AreaName,
  W extends keyof AreaActsOf<K> & string,
> = {
  readonly area: K;
  readonly glyph?: GlyphName;
  readonly worldActs: readonly W[];
  rules?: () => AreaRules<K>;
};

export function defineHarnessArea<
  K extends AreaName,
  const W extends keyof AreaActsOf<K> & string,
>(area: HarnessArea<K, W>): HarnessArea<K, W> {
  return area;
}
