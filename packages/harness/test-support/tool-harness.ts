import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ToolDetails } from "#harness/contract/details";
import type { GameTool } from "#harness/tools/define";

export type ToolRun = {
  details: ToolDetails;
  text: string;
  updates: ToolDetails[];
};
export type RunInit = { id?: string; signal?: AbortSignal };

export async function runTool(
  tool: GameTool,
  args: Record<string, unknown>,
  init: RunInit = {},
): Promise<ToolRun> {
  const updates: ToolDetails[] = [];
  const onUpdate = (partial: { details: ToolDetails }) => {
    updates.push(partial.details);
  };
  const out = await tool.execute(
    init.id ?? "call-1",
    args,
    init.signal,
    onUpdate,
    {} as ExtensionContext,
  );
  const text = out.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n");
  return { details: out.details, text, updates };
}
