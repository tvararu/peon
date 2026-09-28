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
    [["deserter-bg", "1m"], `deserter bg add ${c} 1m`],
    [["deserter-bg", "1h"], `deserter bg add ${c} 1h`],
    [["deserter-bg", "3600s"], `deserter bg add ${c} 3600s`],
    [["reset-achievements"], `reset achievements ${c}`],
    [["guild-delete", "Fac", "Probe"], `guild delete "Fac Probe"`],
    [["read", "guild", "FacProbe"], `guild info "FacProbe"`],
    [["read", "arena", "7"], "arena info 7"],
    [["read", "arena-lookup", "FacProbe"], "arena lookup FacProbe"],
    [["read", "bf-queue"], "bf queue 1"],
    [["read", "characters"], `lookup player account ${account}`],
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
    ["deserter 2h", "deserter-bg", ["2h"]],
    ["deserter 10d", "deserter-bg", ["10d"]],
    ["deserter 61m", "deserter-bg", ["61m"]],
    ["deserter 0s", "deserter-bg", ["0s"]],
    ["deserter without a unit", "deserter-bg", ["60"]],
    ["reset-achievements with a target", "reset-achievements", ["Theo"]],
    ["guild-delete Stormwind", "guild-delete", ["Stormwind"]],
    ["guild-delete with a quote", "guild-delete", ['Fac"Probe']],
    ["read guild without Fac", "read", ["guild", "Stormwind"]],
    ["read arena not a number", "read", ["arena", "FacProbe"]],
    ["read arena-lookup with a quote", "read", ["arena-lookup", 'Fac"P']],
    ["read bf-queue 2", "read", ["bf-queue", "2"]],
    ["read characters of another account", "read", ["characters", other]],
    ["arena-disband not a number", "arena-disband", ["FacProbe"]],
    ["rename with a digit", "rename", ["Fgkl1"]],
    ["rename with a space", "rename", ["Fgk", "lgo"]],
    ["customize with no name", "customize", []],
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

describe("runGm two-step verbs", () => {
  const second = "Fsecond";
  const lookup = `lookup player account ${account}`;
  const characters = [
    `Characters at account ${account} (Id: 4711)`,
    `  ${c} (GUID 5001) - Blood Elf - Paladin - 1`,
    `  ${second} (GUID 5002)`,
    "",
  ].join("\r\n");
  const arenaInfo = (name: string, captain: string) =>
    [
      `Arena team: "${name}"[7] - Rating: 0 - Type: 2x2`,
      `Name:"${captain}"[guid:5001] - PR: 0 - Captain`,
      "",
    ].join("\r\n");

  function scripted(replies: Record<string, SoapResult>) {
    const lines: string[] = [];
    const calls: string[] = [];
    const targets: string[][] = [];
    return {
      calls,
      lines,
      run: async (accounts: string[], command: string) => {
        targets.push(accounts);
        calls.push(command);
        return replies[command] ?? { ok: true, text: "done" };
      },
      targets,
      write: (line: string) => lines.push(line),
    };
  }

  test.each([
    ["rename", `character rename ${second}`],
    ["customize", `character customize ${second}`],
    ["changefaction", `character changefaction ${second}`],
    ["changerace", `character changerace ${second}`],
  ])("%s reads the account's characters first", async (verb, command) => {
    const d = scripted({ [lookup]: { ok: true, text: characters } });
    expect(await runGm([account, verb, second], d)).toBe(0);
    expect(d.calls).toEqual([lookup, command]);
    expect(d.targets).toEqual([[account], [account]]);
    expect(JSON.parse(d.lines[0] ?? "")).toMatchObject({ command, ok: true });
  });

  test("rename takes the name in any case and sends the server's", async () => {
    const d = scripted({ [lookup]: { ok: true, text: characters } });
    expect(await runGm([account, "rename", "FSECOND"], d)).toBe(0);
    expect(d.calls).toEqual([lookup, `character rename ${second}`]);
  });

  test.each([
    ["the ledger's own character", c],
    ["a name absent from the reply", "Fother"],
  ])("rename refuses %s", async (_name, name2) => {
    const d = scripted({ [lookup]: { ok: true, text: characters } });
    await expect(runGm([account, "rename", name2], d)).rejects.toThrow();
    expect(d.calls).toEqual([lookup]);
    expect(d.lines).toEqual([]);
  });

  test("rename refuses when the lookup finds no players", async () => {
    const d = scripted({ [lookup]: { ok: false, text: "No players found!" } });
    await expect(runGm([account, "rename", second], d)).rejects.toThrow();
    expect(d.calls).toEqual([lookup]);
  });

  test("arena-disband reads the team first", async () => {
    const d = scripted({
      "arena info 7": { ok: true, text: arenaInfo("FacProbe", c) },
    });
    expect(await runGm([account, "arena-disband", "7"], d)).toBe(0);
    expect(d.calls).toEqual(["arena info 7", "arena disband 7"]);
  });

  test.each([
    ["a team not named Fac", arenaInfo("Kings", c)],
    ["a team another character captains", arenaInfo("FacProbe", "Other")],
    ["a reply without a header", "nothing"],
  ])("arena-disband refuses %s", async (_name, text) => {
    const d = scripted({ "arena info 7": { ok: true, text } });
    await expect(runGm([account, "arena-disband", "7"], d)).rejects.toThrow();
    expect(d.calls).toEqual(["arena info 7"]);
    expect(d.lines).toEqual([]);
  });

  test("arena-disband refuses a missing team", async () => {
    const d = scripted({
      "arena info 7": { ok: false, text: "Arena team [7] not found" },
    });
    await expect(runGm([account, "arena-disband", "7"], d)).rejects.toThrow();
    expect(d.calls).toEqual(["arena info 7"]);
  });
});
