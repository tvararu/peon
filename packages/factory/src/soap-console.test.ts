import { describe, expect, test } from "bun:test";
import { consoleCommand, type Ledger } from "#factory/soap";
import type { SoapResult } from "#factory/soap-copy";

const root = "/work/tree";
const a = "FAC6AB6E05F5A";
const b = "FAC6AB6E0601B";

function ledger(account: string, extra: Partial<Ledger> = {}): Ledger {
  return {
    account,
    character: account === a ? "Fgklgoafpfk" : "Fgklgoagabl",
    createdAt: "2026-09-27T00:00:00.000Z",
    owner: root,
    password: "hunter2hunter2",
    preset: "fresh",
    root,
    ...extra,
  };
}

function deps(
  entries: Ledger[],
  result: SoapResult = { ok: true, text: "ok" },
) {
  const sent: string[] = [];
  const logged: string[] = [];
  return {
    cwd: root,
    load: async (account: string) => entries.find((e) => e.account === account),
    log: async (line: string) => {
      logged.push(line);
    },
    logged,
    now: () => new Date("2026-09-27T01:02:03.000Z"),
    run: async (command: string) => {
      sent.push(command);
      return result;
    },
    sent,
  };
}

describe("consoleCommand", () => {
  test("runs the command for an account this worktree created", async () => {
    const d = deps([ledger(a)]);
    const res = await consoleCommand([a], "character level Fgklgoafpfk 5", d);
    expect(res).toEqual({ ok: true, text: "ok" });
    expect(d.sent).toEqual(["character level Fgklgoafpfk 5"]);
  });

  test("appends one JSON line per command without the password", async () => {
    const d = deps([ledger(a)], { ok: false, text: "no\nsuch" });
    await consoleCommand([a], "kick Fgklgoafpfk", d);
    expect(d.logged).toHaveLength(1);
    const line = d.logged[0] ?? "";
    expect(line.endsWith("\n")).toBe(true);
    expect(line.trimEnd()).not.toContain("\n");
    expect(line).not.toContain("hunter2");
    expect(JSON.parse(line)).toEqual({
      accounts: [a],
      at: "2026-09-27T01:02:03.000Z",
      command: "kick Fgklgoafpfk",
      ok: false,
      root,
      text: "no\nsuch",
    });
  });

  test.each([
    ["a non-factory account", ["ADMIN"], [ledger(a)]],
    ["an account with no ledger entry", [a], []],
    ["a ledger entry with no root", [a], [ledger(a, { root: undefined })]],
    ["an account from another worktree", [a], [ledger(a, { root: "/else" })]],
    ["a ledger whose character differs", [a], [ledger(a, { character: "Fx" })]],
    ["a second account that fails the guard", [a, b], [ledger(a)]],
    ["no account at all", [], [ledger(a)]],
  ])("refuses %s and sends nothing", async (_name, accounts, entries) => {
    const d = deps(entries);
    await expect(consoleCommand(accounts, "kick X", d)).rejects.toThrow();
    expect(d.sent).toEqual([]);
    expect(d.logged).toEqual([]);
  });
});
