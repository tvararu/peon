import { StringEnum, Type } from "@earendil-works/pi-ai";
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

export const talentPlanEntry = Type.Object({
  rank: Type.Integer({ description: "The rank to learn, 1-5.", minimum: 1 }),
  talent: Type.String({
    description: 'A talent name from show, or its id like "124".',
  }),
});

export const talentParams = Type.Object({
  do: StringEnum(["show", "learn"], {
    description:
      "show: list free talent points, learned talents and glyph slots. learn: spend points from the plan.",
  }),
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
  talent: Type.Optional(
    Type.String({
      description: 'The talent to learn with rank, a name or id like "124".',
    }),
  ),
});

export type TalentsArgs = {
  do: "show" | "learn";
  plan?: { talent: string; rank: number }[];
  rank?: number;
  talent?: string;
};

export function wantsOf(args: TalentsArgs): { talent: string; rank: number }[] {
  if (args.plan !== undefined && args.talent === undefined)
    return [...args.plan];
  if (args.talent !== undefined && args.rank !== undefined)
    return [{ rank: args.rank, talent: args.talent }];
  return [];
}

export function talentsRun(
  args: TalentsArgs,
  ctx: TalentsCtx,
): Promise<ToolResult<TalentsAfter>> {
  if (args.do === "show") return showTalents(ctx);
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
