import { type Static, StringEnum, Type } from "@earendil-works/pi-ai";
import type { ToolResult } from "#harness/contract/result";
import type { ToolCtx } from "#harness/contract/services";
import { defineGameTool, result } from "#harness/tools/define";
import type { GameToolSpec, ToolRenderers } from "#harness/tools/game-tool";
import { argText } from "#harness/ui/draw";
import {
  type CallInit,
  callLine,
  callRenderer,
  resultRenderer,
} from "#harness/ui/renderers/line";

export const useParams = Type.Object({
  do: Type.Optional(
    StringEnum(["use", "open", "read"], {
      description:
        "open: unlock a chest or quest object and take what is inside. read: read the pages of a shrine, plaque or book. Default use.",
    }),
  ),
  key: Type.Optional(
    Type.String({
      description:
        "For open: a key item from the bags when the lock names one instead of a spell.",
    }),
  ),
  object: Type.String({
    description:
      'Which object: its "o<n>" ref as the look journal shows it, or its name.',
  }),
});

export type UseArgs = Static<typeof useParams>;
export type UseDo = "use" | "open" | "read";

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
  return result("DONE", {
    after: { ...emptyUse(), do: args.do ?? "use", object: args.object },
    detail: `Used ${args.object}.`,
  });
}

function useCall(args: unknown, theme: CallInit["theme"]): string {
  return callLine({
    icon: "object",
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
      "Use a game object by name or ref. Opens locked chests and quest objects, reads shrines, plaques and books, and presses other usable objects. Walk close to the object first when it is far.",
    guidelines: ["Read a page only once per object unless the quest needs it."],
    label: "Use",
  },
};

export const useTool = defineGameTool(useSpec);
