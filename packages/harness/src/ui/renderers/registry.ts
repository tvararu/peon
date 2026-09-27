import type { TSchema } from "@earendil-works/pi-ai";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { ToolDetails } from "#harness/contract/details";
import type { ToolName } from "#harness/contract/result";
import { socialRenderers, stopRenderers } from "#harness/ui/renderers/line";
import { lookRenderers } from "#harness/ui/renderers/picture";

export type ToolRenderers = Pick<
  ToolDefinition<TSchema, ToolDetails>,
  "renderCall" | "renderResult"
>;

const RENDERERS: Readonly<Record<ToolName, ToolRenderers>> = {
  engage: {},
  interact: {},
  journal: {},
  look: lookRenderers,
  loot: {},
  recover: {},
  rest: {},
  social: socialRenderers,
  stop: stopRenderers,
  travel: {},
};

export function rendererFor(tool: ToolName): ToolRenderers {
  return RENDERERS[tool];
}
