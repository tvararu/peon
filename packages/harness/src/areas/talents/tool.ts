import { StringEnum, Type } from "@earendil-works/pi-ai";
import {
  glyphArgsOf,
  glyphTalents,
  unglyphTalents,
} from "#harness/areas/talents/tool-glyph";
import { learnTalents } from "#harness/areas/talents/tool-learn";
import { showTalents } from "#harness/areas/talents/tool-show";
import type {
  TalentsAfter,
  TalentsCtx,
} from "#harness/areas/talents/tool-types";
import type { ToolResult } from "#harness/contract/result";
import { defineGameTool } from "#harness/tools/define";
import type { GameToolSpec, ToolRenderers } from "#harness/tools/game-tool";
import { argText } from "#harness/ui/draw";
import {
  type BodyInit,
  type CallInit,
  callLine,
  callRenderer,
  resultRenderer,
} from "#harness/ui/renderers/line";

const talentRef = (description: string) =>
  Type.Union(
    [
      Type.String({ description }),
      Type.Integer({ description, maximum: 0xff_ff_ff_ff, minimum: 0 }),
    ],
    { description },
  );

export const talentPlanEntry = Type.Object({
  rank: Type.Integer({ description: "The rank to learn, 1-5.", minimum: 1 }),
  talent: talentRef('A talent name from show, or its id like "124".'),
});

export const talentParams = Type.Object({
  do: StringEnum(["show", "learn", "glyph", "unglyph"], {
    description:
      "show: list free talent points, learned talents and glyph slots. learn: spend points from the plan. glyph: put a glyph item in a slot. unglyph: clear a glyph slot.",
  }),
  item: Type.Optional(
    Type.String({
      description:
        'For glyph: the glyph item as the bags journal shows it, "item <id>", or "bag B slot S".',
    }),
  ),
  plan: Type.Optional(
    Type.Array(talentPlanEntry, {
      description: "Talents to learn, each a talent name or id with a rank.",
    }),
  ),
  rank: Type.Optional(
    Type.Integer({
      description: "The rank to learn with talent, 1-5.",
      minimum: 1,
    }),
  ),
  slot: Type.Optional(
    Type.Union([Type.Integer({ minimum: 1 }), Type.String()], {
      description:
        "For glyph: the glyph slot 1-6 or a kind shown by show. For unglyph: the slot 1-6 to clear.",
    }),
  ),
  talent: Type.Optional(
    talentRef('The talent to learn with rank, a name or id like "124".'),
  ),
});

export type TalentsArgs = {
  do: "show" | "learn" | "glyph" | "unglyph";
  plan?: { talent: string | number; rank: number }[];
  rank?: number;
  talent?: string | number;
  item?: string;
  slot?: string | number;
};

function wantsOf(args: TalentsArgs): { talent: string; rank: number }[] {
  const text = (value: string | number): string => String(value);
  if (args.plan !== undefined && args.talent === undefined)
    return args.plan.map((entry) => ({
      rank: entry.rank,
      talent: text(entry.talent),
    }));
  if (args.talent !== undefined && args.rank !== undefined)
    return [{ rank: args.rank, talent: text(args.talent) }];
  return [];
}

export function talentsRun(
  args: TalentsArgs,
  ctx: TalentsCtx,
): Promise<ToolResult<TalentsAfter>> {
  if (args.do === "show") return showTalents(ctx);
  if (args.do === "glyph") {
    const parsed = glyphArgsOf(args);
    return glyphTalents(ctx, parsed.item, parsed.slot);
  }
  if (args.do === "unglyph") return unglyphTalents(ctx, args.slot);
  return learnTalents(ctx, wantsOf(args));
}

function talentsCall(args: unknown, theme: CallInit["theme"]): string {
  return callLine({
    icon: "friendly",
    parts: [
      argText(args, "do") ?? "show",
      argText(args, "talent") ?? argText(args, "plan"),
    ],
    theme,
    verb: "talents",
  });
}

function talentsBody({
  expanded,
  result: out,
}: BodyInit<TalentsAfter>): string[] {
  return expanded ? out.body : [];
}

const talentsRenderers: ToolRenderers<"talents", TalentsAfter> = {
  renderCall: callRenderer(talentsCall),
  renderResult: resultRenderer("talents", talentsBody),
};

export const talentsSpec: GameToolSpec<
  typeof talentParams,
  "talents",
  TalentsAfter
> = {
  allowStopped: (args) => args.do === "show",
  fallback: () => ({ do: "show", freePoints: undefined, learned: 0 }),
  kind: "action",
  maxLines: 30,
  minimalArgs: { do: "show" },
  name: "talents",
  parameters: talentParams,
  renderers: talentsRenderers,
  run: talentsRun as GameToolSpec<
    typeof talentParams,
    "talents",
    TalentsAfter
  >["run"],
  text: {
    description:
      "Show free talent points, learned talents and glyph slots, or learn a talent. Each learn call spends one point: pass the next rank to gain, or call again for the rank after.",
    guidelines: [
      "Call show first so names and ranks are known before learning. Spend points one rank per learn call: a higher rank waits for the ranks below it.",
    ],
    label: "Talents",
  },
};

export const talentsTool = defineGameTool(talentsSpec);
