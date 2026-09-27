import { describe, expect, test } from "bun:test";
import type { Credential, CredentialStore } from "@earendil-works/pi-ai";
import { credentialStatus, startupCheck } from "#harness/credentials/status";

const NOW = Date.parse("2026-09-26T19:00:00Z");

function storeWith(credential: Credential | undefined): CredentialStore {
  return {
    delete: async () => {},
    list: async () => [],
    modify: async () => credential,
    read: async () => credential,
  };
}

const oauth = (expires: number): Credential => ({
  access: "token-never-printed",
  expires,
  refresh: "",
  type: "oauth",
});

describe("credentialStatus", () => {
  test("reports expiry and remaining time of the codex login", async () => {
    expect(
      await credentialStatus(storeWith(oauth(NOW + 3_600_000)), NOW),
    ).toEqual({
      expiresAt: NOW + 3_600_000,
      present: true,
      validForMs: 3_600_000,
    });
  });

  test("reports a missing login", async () => {
    expect(await credentialStatus(storeWith(undefined), NOW)).toEqual({
      expiresAt: undefined,
      present: false,
      validForMs: undefined,
    });
  });
});

describe("startupCheck", () => {
  test("accepts a valid login without a warning", () => {
    const check = startupCheck({
      expiresAt: Date.parse("2026-09-30T20:20:18Z"),
      present: true,
      validForMs: 3_600_000,
    });
    expect(check).toEqual({
      line: "Codex login: valid until 2026-09-30 20:20 UTC (omp).",
      ok: true,
      warn: false,
    });
  });

  test("warns under 30 minutes", () => {
    expect(
      startupCheck({
        expiresAt: NOW + 1_200_000,
        present: true,
        validForMs: 1_200_000,
      }),
    ).toMatchObject({ ok: true, warn: true });
  });

  test("refuses under 10 minutes with exit code 3", () => {
    expect(
      startupCheck({
        expiresAt: NOW + 540_000,
        present: true,
        validForMs: 540_000,
      }),
    ).toEqual({
      exitCode: 3,
      line: "The Codex login expires in 9 min. Run omp once so that it refreshes the login. Then start the harness again.",
      ok: false,
    });
  });

  test("refuses a missing login with exit code 3", () => {
    expect(
      startupCheck({
        expiresAt: undefined,
        present: false,
        validForMs: undefined,
      }),
    ).toEqual({
      exitCode: 3,
      line: "No Codex login found in omp. Run omp and log in to openai-codex. Then start the harness again.",
      ok: false,
    });
  });

  test("never prints the token", async () => {
    const check = startupCheck(
      await credentialStatus(storeWith(oauth(NOW + 3_600_000)), NOW),
    );
    expect(check.line).not.toContain("token-never-printed");
  });
});
