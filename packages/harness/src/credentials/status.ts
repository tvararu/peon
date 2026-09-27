import type { CredentialStore } from "@earendil-works/pi-ai";

export type CredentialStatus = {
  present: boolean;
  expiresAt: number | undefined;
  validForMs: number | undefined;
};
export type StartupCheck =
  | { ok: true; warn: boolean; line: string }
  | { ok: false; exitCode: 3; line: string };

export const MIN_VALID_MS = 600_000;
export const WARN_VALID_MS = 1_800_000;

const MISSING =
  "No Codex login found in omp. Run omp and log in to openai-codex. Then start the harness again.";

export async function credentialStatus(
  store: CredentialStore,
  now: number,
): Promise<CredentialStatus> {
  const credential = await store.read("openai-codex");
  if (credential?.type !== "oauth")
    return { expiresAt: undefined, present: false, validForMs: undefined };
  return {
    expiresAt: credential.expires,
    present: true,
    validForMs: credential.expires - now,
  };
}

export function startupCheck(status: CredentialStatus): StartupCheck {
  const { expiresAt, validForMs } = status;
  if (expiresAt === undefined || validForMs === undefined)
    return { exitCode: 3, line: MISSING, ok: false };
  if (validForMs < MIN_VALID_MS)
    return { exitCode: 3, line: expiringLine(validForMs), ok: false };
  return {
    line: `Codex login: valid until ${utcMinute(expiresAt)} UTC (omp).`,
    ok: true,
    warn: validForMs < WARN_VALID_MS,
  };
}

function expiringLine(validForMs: number): string {
  const minutes = Math.max(0, Math.floor(validForMs / 60_000));
  return `The Codex login expires in ${minutes} min. Run omp once so that it refreshes the login. Then start the harness again.`;
}

function utcMinute(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}
