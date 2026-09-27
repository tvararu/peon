import type { FramingVariant } from "#wow/framing";

export type JevCandidate = {
  id: string;
  description: string;
};

export type JevActionRequest = {
  instruction: string;
  observation: Readonly<Record<string, unknown>>;
  candidates: readonly JevCandidate[];
  framing?: FramingVariant;
  characterClass?: string;
};

export type JevActionResult = {
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
  model: string;
  inputTokens: number;
  elapsedMs: number;
};

export type JevSelect = (
  request: JevActionRequest,
  options: { signal: AbortSignal },
) => Promise<JevActionResult>;

export type JevPort = {
  select: JevSelect;
  fault?: string;
};
