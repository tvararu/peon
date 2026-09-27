import type { ToolName } from "#harness/contract/result";

export function nextCall(tool: ToolName, args: object = {}): string {
  const parts = Object.entries(args).map(
    ([key, value]) =>
      `${key}: ${typeof value === "string" ? JSON.stringify(value) : String(value)}`,
  );
  return `${tool}(${parts.join(", ")})`;
}

export function askHuman(question: string): string {
  return `ask the human: "${question}"`;
}
