import type { TSchema } from "@earendil-works/pi-ai";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { ToolDetails } from "#harness/contract/details";
import type { ToolName } from "#harness/contract/result";
import { socialRenderers, stopRenderers } from "#harness/ui/renderers/line";
import {
  engageRenderers,
  recoverRenderers,
  restRenderers,
  travelRenderers,
} from "#harness/ui/renderers/live-run";
import { lookRenderers } from "#harness/ui/renderers/picture";

export type ToolRenderers = Pick<
  ToolDefinition<TSchema, ToolDetails>,
  "renderCall" | "renderResult"
>;

const RENDERERS: Readonly<Record<ToolName, ToolRenderers>> = {
  engage: engageRenderers,
  interact: {},
  journal: {},
  look: lookRenderers,
  loot: {},
  recover: recoverRenderers,
  rest: restRenderers,
  social: socialRenderers,
  stop: stopRenderers,
  travel: travelRenderers,
};

export function rendererFor(tool: ToolName): ToolRenderers {
  return RENDERERS[tool];
}
