import { describe, expect, test } from "bun:test";
import { createService, type Fetch } from "#factory/realm-service";
import {
  runService,
  serviceCommands,
  serviceUsage,
} from "#factory/soap-service-cli";

function harness(status = 200, body = '{"ok":true,"savedAt":"t"}') {
  const urls: string[] = [];
  const bodies: (string | undefined)[] = [];
  const fetch: Fetch = async (url, init) => {
    urls.push(url);
    bodies.push(init.body as string | undefined);
    return new Response(body, { status });
  };
  const out: string[] = [];
  const err: string[] = [];
  const deps = {
    err: (line: string) => err.push(line),
    out: (line: string) => out.push(line),
    service: createService({ baseUrl: "http://realm.test", fetch }),
  };
  return { bodies, deps, err, out, urls };
}

describe("runService", () => {
  test("lists exactly the commands it handles, for soap-cli to route", async () => {
    expect([...serviceCommands].sort()).toEqual([
      "accounts",
      "health",
      "presets",
      "reset",
      "setup",
      "truth",
    ]);
    for (const name of serviceCommands) {
      const h = harness();
      await runService([name], h.deps);
      expect(h.err).not.toContain(serviceUsage);
    }
    const unknown = harness();
    expect(await runService(["nope"], unknown.deps)).toBe(1);
    expect(unknown.err).toContain(serviceUsage);
  });

  test("truth maps the account to its character", async () => {
    const h = harness();
    expect(await runService(["truth", "FAC6AB6E05F5A"], h.deps)).toBe(0);
    expect(h.urls).toEqual(["http://realm.test/truth/Fgklgoafpfk"]);
    expect(JSON.parse(h.out[0] ?? "")).toEqual({ ok: true, savedAt: "t" });
  });

  test("setup posts the JSON argument to the endpoint", async () => {
    const h = harness();
    const args = ["setup", "FAC6AB6E05F5A", "money", '{"copper":500}'];
    expect(await runService(args, h.deps)).toBe(0);
    expect(h.urls).toEqual(["http://realm.test/char/Fgklgoafpfk/money"]);
    expect(h.bodies).toEqual(['{"copper":500}']);
  });

  test("setup without a body sends an empty object", async () => {
    const h = harness();
    await runService(["setup", "FAC6AB6E05F5A", "snapshot"], h.deps);
    expect(h.bodies).toEqual(["{}"]);
  });

  test("reset and health", async () => {
    const h = harness();
    await runService(["reset", "FAC6AB6E05F5A"], h.deps);
    await runService(["health"], h.deps);
    expect(h.urls).toEqual([
      "http://realm.test/account/FAC6AB6E05F5A/reset",
      "http://realm.test/health",
    ]);
  });

  test("refuses protected accounts without calling the service", async () => {
    const h = harness();
    for (const account of ["ADMIN", "DEITY", "X", "TCPRESETS", "RNDBOT7"]) {
      expect(await runService(["truth", account], h.deps)).toBe(1);
      expect(await runService(["reset", account], h.deps)).toBe(1);
      expect(await runService(["setup", account, "level", "{}"], h.deps)).toBe(
        1,
      );
    }
    expect(h.urls).toEqual([]);
    expect(JSON.parse(h.out[0] ?? "")).toMatchObject({
      ok: false,
      reason: "protected_account",
    });
  });

  test("rejects bad JSON and unknown endpoints locally", async () => {
    const h = harness();
    const bad = ["setup", "FAC6AB6E05F5A", "money", "{copper"];
    expect(await runService(bad, h.deps)).toBe(1);
    expect(JSON.parse(h.out[0] ?? "").reason).toBe("bad_json");
    const unknown = ["setup", "FAC6AB6E05F5A", "gm", "{}"];
    expect(await runService(unknown, h.deps)).toBe(1);
    expect(JSON.parse(h.out[1] ?? "").reason).toBe("unknown_endpoint");
    expect(h.urls).toEqual([]);
  });

  test("service errors print their reason and exit 1", async () => {
    const h = harness(
      409,
      '{"ok":false,"reason":"character_online","error":"online"}',
    );
    const args = ["setup", "FAC6AB6E05F5A", "level", '{"level":12}'];
    expect(await runService(args, h.deps)).toBe(1);
    expect(JSON.parse(h.out[0] ?? "")).toEqual({
      error: "online",
      ok: false,
      reason: "character_online",
    });
    expect(h.err).toEqual(["character_online: online"]);
  });

  test("missing arguments print usage", async () => {
    const h = harness();
    expect(await runService(["truth"], h.deps)).toBe(1);
    expect(h.err[0]).toContain("usage: soap truth <ACCOUNT>");
  });
});
