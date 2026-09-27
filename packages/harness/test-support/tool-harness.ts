import type { Static, TSchema } from "@earendil-works/pi-ai";
import type {
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";

export type ToolRun<D> = {
  details: D;
  text: string;
  updates: D[];
};
export type RunInit = { id?: string; signal?: AbortSignal };

export async function runTool<P extends TSchema, D>(
  tool: ToolDefinition<P, D>,
  args: Static<P>,
  init: RunInit = {},
): Promise<ToolRun<D>> {
  const updates: D[] = [];
  const onUpdate = (partial: { details: D }) => {
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
