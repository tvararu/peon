import type { ToolText } from "#harness/tools/game-tool";

const text: ToolText = {
  description: "Runs a probe.",
  guidelines: ["Use it in tests only."],
  label: "Probe",
};

export const PROBE = { minimalArgs: {}, renderers: {}, text };
