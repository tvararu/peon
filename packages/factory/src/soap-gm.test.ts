import { describe, expect, test } from "bun:test";
import type { SoapResult } from "#factory/soap-copy";
import { planGm, runGm } from "#factory/soap-gm";

const account = "FAC6AB6E05F5A";
const other = "FAC6AB6E0601B";
const c = "Fgklgoafpfk";
const c2 = "Fgklgoagabl";

describe("planGm templates", () => {
  test.each([
    [["level", "10"], `character level ${c} 10`],
    [["tele", "GoldshireInn"], `tele name ${c} GoldshireInn`],
    [["learn", "7620"], `player learn ${c} 7620`],
    [["unlearn", "7620"], `player unlearn ${c} 7620`],
    [["items", "6256:1"], `send items ${c} "Peon" "staging" 6256:1`],
    [
      ["items", "6256:1", "2589:20"],
      `send items ${c} "Peon" "staging" 6256:1 2589:20`,
    ],
    [["money", "12345"], `send money ${c} "Peon" "staging" 12345`],
    [["mail", "Hello", "there"], `send mail ${c} "Hello there" "staging"`],
    [["quest", "add", "3904"], `quest add 3904 ${c}`],
    [["quest", "complete", "3904"], `quest complete 3904 ${c}`],
    [["quest", "reward", "3904"], `quest reward 3904 ${c}`],
    [["quest", "remove", "3904"], `quest remove 3904 ${c}`],
    [["revive"], `revive ${c}`],
    [["kick"], `kick ${c}`],
    [["combatstop"], `combatstop ${c}`],
    [["reset-talents"], `reset talents ${c}`],
    [["achievement", "2188"], `achievement add 2188 ${c}`],
    [["guild-create", "Fac", "Guild"], `guild create ${c} "Fac Guild"`],
    [["arena-create", "3", "FacTeam"], `arena create ${c} "FacTeam" 3`],
    [["read", "group"], `group list ${c}`],
    [["read", "mail"], `mail list ${c}`],
    [["read", "pet"], `pet list ${c}`],
    [["read", "titles"], `character titles ${c}`],
    [["read", "reputation"], `character reputation ${c}`],
    [["read", "pinfo"], `pinfo ${c}`],
  ])("%p", ([verb = "", ...args], command) => {
    expect(planGm(account, verb, args)).toEqual({
      accounts: [account],
      command,
    });
  });

  test("guild-invite targets the second account's character", () => {
    expect(planGm(account, "guild-invite", [other, "FacGuild"])).toEqual({
      accounts: [account, other],
      command: `guild invite ${c2} "FacGuild"`,
    });
  });
});

describe("planGm refusals", () => {
  test.each([
    ["unknown verb", "die", []],
    ["missing level", "level", []],
    ["level 0", "level", ["0"]],
    ["level 81", "level", ["81"]],
    ["fractional level", "level", ["1.5"]],
    ["hex level", "level", ["0x10"]],
    ["extra argument", "level", ["10", "11"]],
    ["tele with a space", "tele", ["Goldshire", "Inn"]],
    ["tele with a quote", "tele", ['Gold"shire']],
    ["spell 0", "learn", ["0"]],
    ["negative spell", "learn", ["-5"]],
    ["items without a count", "items", ["6256"]],
    ["items count 0", "items", ["6256:0"]],
    ["items huge count", "items", ["6256:4294967296"]],
    ["items none", "items", []],
    ["items over the mail limit", "items", new Array(13).fill("6256:1")],
    ["money with a unit", "money", ["10g"]],
    ["money over int32", "money", ["2147483648"]],
    ["mail with a quote", "mail", ['Hi"there']],
    ["mail with a semicolon", "mail", ["Hi;there"]],
    ["mail over 24 characters", "mail", ["A".repeat(25)]],
    ["mail empty", "mail", []],
    ["quest unknown op", "quest", ["abandon", "3904"]],
    ["quest no id", "quest", ["add"]],
    ["revive with a target", "revive", ["Theo"]],
    ["guild name without Fac", "guild-create", ["Guild"]],
    ["guild name with a quote", "guild-create", ['Fac"Guild']],
    [
      "guild invite of a non-factory account",
      "guild-invite",
      ["ADMIN", "FacG"],
    ],
    ["arena type 4", "arena-create", ["4", "FacTeam"]],
    ["arena name without Fac", "arena-create", ["2", "Team"]],
    ["read unknown kind", "read", ["bank"]],
    ["read no kind", "read", []],
  ])("%s", (_name, verb, args) => {
    expect(() => planGm(account, verb, args as string[])).toThrow();
  });

  test("refuses a non-factory account", () => {
    expect(() => planGm("ADMIN", "level", ["10"])).toThrow();
  });
});

describe("runGm", () => {
  function deps(result: SoapResult) {
    const lines: string[] = [];
    const calls: [string[], string][] = [];
    return {
      calls,
      lines,
      run: async (accounts: string[], command: string) => {
        calls.push([accounts, command]);
        return result;
      },
      write: (line: string) => lines.push(line),
    };
  }

  test("runs the planned command and prints its result", async () => {
    const d = deps({ ok: true, text: "done" });
    expect(await runGm([account, "level", "10"], d)).toBe(0);
    expect(d.calls).toEqual([[[account], `character level ${c} 10`]]);
    expect(JSON.parse(d.lines[0] ?? "")).toEqual({
      account,
      command: `character level ${c} 10`,
      ok: true,
      text: "done",
      verb: "level",
    });
  });

  test("a server refusal exits 1", async () => {
    const d = deps({ ok: false, text: "Player not found" });
    expect(await runGm([account, "kick"], d)).toBe(1);
    expect(JSON.parse(d.lines[0] ?? "").ok).toBe(false);
  });

  test("a bad verb never reaches the server", async () => {
    const d = deps({ ok: true, text: "" });
    await expect(runGm([account, "die"], d)).rejects.toThrow();
    expect(d.calls).toEqual([]);
  });

  test("usage without an account or verb", async () => {
    const d = deps({ ok: true, text: "" });
    await expect(runGm([], d)).rejects.toThrow(/usage: soap gm/);
    await expect(runGm([account], d)).rejects.toThrow(/usage: soap gm/);
  });
});
