import type { Static, TSchema } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { ToolDetailsFor } from "#harness/contract/details";
import type { ToolName, ToolResult } from "#harness/contract/result";
import type { HarnessRuntime, ToolCtx } from "#harness/contract/services";

export type ToolKind = "read" | "action" | "run" | "control";

export type ToolText = {
  label: string;
  description: string;
  guidelines: string[];
};

export type ToolRenderers<N extends ToolName, A> = Pick<
  ToolDefinition<TSchema, ToolDetailsFor<N, A>>,
  "renderCall" | "renderResult"
>;

export type GameToolSpec<P extends TSchema, N extends ToolName, A> = {
  name: N;
  kind: ToolKind;
  parameters: P;
  text: ToolText;
  minimalArgs: Partial<Static<P>>;
  renderers: ToolRenderers<N, A>;
  fallback: () => A;
  run: (args: Static<P>, ctx: ToolCtx<A>) => Promise<ToolResult<A>>;
  maxLines?: number;
  prepareArguments?: (args: unknown) => Static<P>;
};

export type GameToolModule<N extends ToolName, P extends TSchema, A> = {
  readonly name: N;
  readonly kind: ToolKind;
  readonly text: ToolText;
  readonly minimalCall: string;
  readonly renderers: ToolRenderers<N, A>;
  definition: (rt: HarnessRuntime) => ToolDefinition<P, ToolDetailsFor<N, A>>;
  register: (pi: ExtensionAPI, rt: HarnessRuntime) => void;
};
