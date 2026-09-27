import type { ToolRenderResultOptions } from "@earendil-works/pi-coding-agent";
import type { AfterMap, ToolDetails } from "#harness/contract/details";
import type { ToolName, ToolResult } from "#harness/contract/result";
import { rendererFor } from "#harness/ui/renderers/registry";
import { plain, testTheme } from "#test-support/ui-fixture";

export type RenderInit = {
  options?: ToolRenderResultOptions;
  text?: string;
  width?: number;
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

export function toolResult<K extends ToolName>(
  tool: K,
  result: ToolResult<AfterMap[K]>,
  text = "",
) {
  const details = { result, tool } as ToolDetails;
  return { content: [{ text, type: "text" as const }], details };
}

export function renderResultLines<K extends ToolName>(
  tool: K,
  result: ToolResult<AfterMap[K]>,
  init: RenderInit = {},
): string[] {
  const render = rendererFor(tool).renderResult;
  if (!render) throw new Error(`no renderer for ${tool}`);
  const component = render(
    toolResult(tool, result, init.text),
    init.options ?? closed,
    theme,
    undefined as never,
  );
  return component.render(init.width ?? 120);
}

export function renderCallLine(
  tool: ToolName,
  args: Record<string, unknown>,
): string {
  const render = rendererFor(tool).renderCall;
  if (!render) throw new Error(`no renderer for ${tool}`);
  return plain(render(args, theme, undefined as never).render(120))[0] ?? "";
}
