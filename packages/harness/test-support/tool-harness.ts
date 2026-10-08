import type { Static, TSchema } from "@earendil-works/pi-ai";
import type {
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { ToolName } from "#harness/contract/result";
import type { GameToolModule } from "#harness/tools/game-tool";
import { createMockGame, type MockGame } from "#test-support/mock-game";
import { createTestRuntime } from "#test-support/runtime-fixture";

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

export async function expectSendKind<N extends ToolName, P extends TSchema, A>(
  tool: GameToolModule<N, P, A>,
  args: Static<P>,
  game: MockGame = createMockGame(),
): Promise<void> {
  const { rt } = await createTestRuntime({
    parts: { login: async () => game },
  });
  const before = game.sent.length;
  await runTool(tool.definition(rt), args);
  const sent = game.sent.length - before;
  const sends = tool.kind === "action" || tool.kind === "run";
  if (sent > 0 && !sends)
    throw new Error(
      `${tool.name} is kind ${tool.kind} but sent ${sent} packet(s); a sending tool is kind action or run`,
    );
  if (sent === 0 && sends)
    throw new Error(
      `${tool.name} is kind ${tool.kind} but sent no packets; a tool that sends nothing is kind read or control`,
    );
}
