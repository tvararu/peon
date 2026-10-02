import { type Static, StringEnum, Type } from "@earendil-works/pi-ai";
import { fishFlow } from "#harness/areas/objects/tool-fish";
import { openObjectFlow } from "#harness/areas/objects/tool-open";
import {
  checkCastReach,
  checkReach,
  checkUsable,
  findObject,
} from "#harness/areas/objects/tool-reach-checks";
import { readObjectFlow } from "#harness/areas/objects/tool-read";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import { Refusal } from "#harness/ops/refusal";
import { defineGameTool, result } from "#harness/tools/define";
import type { GameToolSpec, ToolRenderers } from "#harness/tools/game-tool";
import { nextCall } from "#harness/tools/next-call";
import { argText } from "#harness/ui/draw";
import {
  type CallInit,
  callLine,
  callRenderer,
  resultRenderer,
} from "#harness/ui/renderers/line";

export const useParams = Type.Object({
  do: Type.Optional(
    StringEnum(["use", "open", "read", "fish"], {
      description:
        "open: unlock a chest or quest object and take what is inside. read: read the pages of a shrine, plaque or book. fish: cast for a fish, use the bobber on the bite and take the catch. Default use.",
    }),
  ),
  key: Type.Optional(
    Type.String({
      description:
        "For open: a key item from the bags when the lock names one instead of a spell.",
    }),
  ),
  object: Type.Optional(
    Type.String({
      description:
        'Which object: its "o<n>" ref as the look journal shows it, or its name. Not needed for fish.',
    }),
  ),
});

export type UseArgs = Static<typeof useParams>;
export type UseDo = "use" | "open" | "read" | "fish";

export type UseAfter = {
  do: UseDo;
  object: string;
  opened: boolean;
  taken: string[];
  text: string | undefined;
};

export type UseCtx = ToolCtx<UseAfter>;

export function emptyUse(): UseAfter {
  return {
    do: "use",
    object: "",
    opened: false,
    taken: [],
    text: undefined,
  };
}

export async function useObject(
  args: UseArgs,
  ctx: UseCtx,
): Promise<ToolResult<UseAfter>> {
  const do_ = (args.do ?? "use") as UseDo;
  if (do_ === "fish") return (await fishFlow(ctx)) as ToolResult<UseAfter>;
  if (args.object === undefined)
    throw new Refusal({
      detail: "name the object to use.",
      next: nextCall("look", { find: "object" }),
      reason: "missing_object",
    });
  const row = findObject(ctx, args.object);
  if (do_ === "open" || do_ === "read") checkCastReach(row, ctx);
  else checkReach(row, ctx);
  checkUsable(row);
  if (do_ === "open") return await openObjectFlow(ctx, row, args.key);
  if (do_ === "read") return await readObjectFlow(ctx, row);
  const template = ctx.handle.objects.state().templates.get(row.entry);
  const type = template?.type ?? row.type;
  if (type === 3) return await openObjectFlow(ctx, row, args.key);
  if (template?.pageId !== undefined && (type === 9 || type === 10))
    return readObjectFlow(ctx, row);
  const outcome = ctx.handle.objects.act.use(row.guid);
  if (!("ok" in outcome))
    throw new Refusal({
      detail: `${row.name} (${row.ref}) cannot be used.`,
      next: nextCall("look", { find: "object" }),
      reason: "not_usable",
    });
  return result("DONE", {
    after: { ...emptyUse(), do: do_, object: row.ref },
    detail: `Used ${row.name} (${row.ref}).`,
  });
}

function useCall(args: unknown, theme: CallInit["theme"]): string {
  return callLine({
    icon: "lootable",
    parts: [argText(args, "do") ?? "use", argText(args, "object")],
    theme,
    verb: "use",
  });
}

function useBody({
  after,
  expanded,
}: {
  after: UseAfter;
  expanded: boolean;
}): string[] {
  if (!expanded) return [];
  const rows = [...after.taken];
  if (after.text) rows.push(after.text);
  return rows;
}

export const useRenderers: ToolRenderers<"use", UseAfter> = {
  renderCall: callRenderer(useCall),
  renderResult: resultRenderer("use", useBody),
};

export const useSpec: GameToolSpec<typeof useParams, "use", UseAfter> = {
  fallback: emptyUse,
  kind: "action",
  minimalArgs: { object: "Milly's Harvest" },
  name: "use",
  parameters: useParams,
  renderers: useRenderers,
  run: useObject,
  text: {
    description:
      "Use a game object by name or ref. Opens locked chests and quest objects, reads shrines, plaques and books, presses other usable objects, and fishes (do fish) when a pole is equipped. Walk close to the object first when it is far.",
    guidelines: ["Read a page only once per object unless the quest needs it."],
    label: "Use",
  },
};

export const useTool = defineGameTool(useSpec);
