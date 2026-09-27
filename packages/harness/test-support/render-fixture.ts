import type { ToolRenderResultOptions } from "@earendil-works/pi-coding-agent";
import type { ToolDetailsFor } from "#harness/contract/details";
import type { ToolName, ToolResult } from "#harness/contract/result";
import type { ToolRenderers } from "#harness/tools/game-tool";
import { plain, testTheme } from "#test-support/ui-fixture";

export type RenderInit = {
  options?: ToolRenderResultOptions;
  text?: string;
  width?: number;
};

type Rendered<N extends ToolName, A> = {
  name: N;
  renderers: ToolRenderers<N, A>;
};

export const closed: ToolRenderResultOptions = {
  expanded: false,
  isPartial: false,
};
export const open: ToolRenderResultOptions = {
  expanded: true,
  isPartial: false,
};
export const partial: ToolRenderResultOptions = {
  expanded: false,
  isPartial: true,
};

const theme = testTheme();

export function toolResult<N extends ToolName, A>(
  tool: N,
  result: ToolResult<A>,
  text = "",
) {
  const details: ToolDetailsFor<N, A> = { result, tool };
  return { content: [{ text, type: "text" as const }], details };
}

export function renderResultLines<N extends ToolName, A>(
  tool: Rendered<N, A>,
  result: ToolResult<A>,
  init: RenderInit = {},
): string[] {
  const render = tool.renderers.renderResult;
  if (!render) throw new Error(`no renderer for ${tool.name}`);
  const component = render(
    toolResult(tool.name, result, init.text),
    init.options ?? closed,
    theme,
    undefined as never,
  );
  return component.render(init.width ?? 120);
}

export function renderCallLine<N extends ToolName, A>(
  tool: Rendered<N, A>,
  args: Record<string, unknown>,
): string {
  const render = tool.renderers.renderCall;
  if (!render) throw new Error(`no renderer for ${tool.name}`);
  return plain(render(args, theme, undefined as never).render(120))[0] ?? "";
}
