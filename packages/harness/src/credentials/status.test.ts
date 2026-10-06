import { describe, expect, test } from "bun:test";
import {
  chooseModel,
  type Login,
  peonAuthPath,
  startupLine,
} from "#harness/credentials/status";

const CODEX: Login = { provider: "openai-codex", source: "OAuth" };
const CLAUDE: Login = { provider: "anthropic", source: "ANTHROPIC_API_KEY" };
const GPT: Login = { provider: "openai", source: "OPENAI_API_KEY" };

describe("peonAuthPath", () => {
  test("lives under the Peon config dir", () => {
    expect(peonAuthPath("/home/me")).toBe("/home/me/.config/peon/auth.json");
  });
});

describe("chooseModel", () => {
  test("--model wins over any login", () => {
    expect(chooseModel({ explicit: "custom/model", logins: [CLAUDE] })).toBe(
      "custom/model",
    );
  });

  test("prefers codex before anthropic before openai", () => {
    expect(chooseModel({ explicit: undefined, logins: [GPT, CLAUDE] })).toBe(
      "anthropic/claude-sonnet-5",
    );
    expect(
      chooseModel({ explicit: undefined, logins: [GPT, CLAUDE, CODEX] }),
    ).toBe("openai-codex/gpt-6-luna");
    expect(chooseModel({ explicit: undefined, logins: [GPT] })).toBe(
      "openai/gpt-6-luna",
    );
  });

  test("an unknown provider gives no model", () => {
    expect(chooseModel({ explicit: undefined, logins: [] })).toBe(undefined);
    expect(
      chooseModel({
        explicit: undefined,
        logins: [{ provider: "other", source: "OTHER_KEY" }],
      }),
    ).toBe(undefined);
  });
});

describe("startupLine", () => {
  test("names a single login and the model", () => {
    expect(startupLine([CODEX], "openai-codex/gpt-6-luna")).toBe(
      "Login: openai-codex (OAuth). Model: openai-codex/gpt-6-luna.",
    );
  });

  test("names every login", () => {
    expect(startupLine([CODEX, CLAUDE], "openai-codex/gpt-6-luna")).toBe(
      "Logins: openai-codex (OAuth), anthropic (ANTHROPIC_API_KEY). Model: openai-codex/gpt-6-luna.",
    );
  });
});
