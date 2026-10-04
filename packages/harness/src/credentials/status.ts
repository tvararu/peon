import type { ModelRuntime } from "@earendil-works/pi-coding-agent";

export type Login = { provider: string; source: string };
export type Choice = { explicit: string | undefined; logins: readonly Login[] };

export const NO_LOGIN =
  "No model login found. Type /login in the harness, or set an API key such as ANTHROPIC_API_KEY or OPENAI_API_KEY.";

const PREFERRED = [
  "openai-codex/gpt-6-luna",
  "anthropic/claude-sonnet-5",
  "openai/gpt-6-luna",
] as const;

export const FALLBACK_MODEL = PREFERRED[0];

export function peonAuthPath(home: string): string {
  return `${home}/.config/peon/auth.json`;
}

export async function findLogins(models: ModelRuntime): Promise<Login[]> {
  const checks = await Promise.all(
    models.getProviders().map(async ({ id }) => ({
      check: await models.checkAuth(id),
      id,
    })),
  );
  return checks.flatMap(({ check, id }) =>
    check ? [{ provider: id, source: check.source ?? check.type }] : [],
  );
}

export function chooseModel({ explicit, logins }: Choice): string | undefined {
  if (logins.length === 0) return undefined;
  if (explicit) return explicit;
  return PREFERRED.find((ref) =>
    logins.some(({ provider }) => ref.startsWith(`${provider}/`)),
  );
}

export function startupLine(logins: readonly Login[], model: string): string {
  const named = logins.map(({ provider, source }) => `${provider} (${source})`);
  const label = logins.length === 1 ? "Login" : "Logins";
  return `${label}: ${named.join(", ")}. Model: ${model}.`;
}
