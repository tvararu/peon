import { assertFactory, characterName, consoleCommand } from "#factory/soap";
import type { SoapResult } from "#factory/soap-copy";

export type GmCheck = { command: string; verify: (text: string) => string };
export type GmPlan = { accounts: string[]; check?: GmCheck; command: string };
export type GmDeps = {
  run: (accounts: string[], command: string) => Promise<SoapResult>;
  write: (line: string) => void;
};

type Built = GmPlan | string | Omit<GmPlan, "accounts">;
type Verb = (c: string, args: string[], account: string) => Built;

const digits = /^[1-9][0-9]*$/;
const freeText = /^[A-Za-z0-9 ]{1,24}$/;
const teleName = /^[A-Za-z0-9_]{1,40}$/;
const playerName = /^[A-Za-z]{2,12}$/;
const duration = /^([0-9]{1,4})([smh])$/;
const itemPair = /^([1-9][0-9]*):([1-9][0-9]*)$/;
const lookupLine = /^\s*(\S+) \(GUID \d+\)/;
const lineBreak = /\r?\n/;
const arenaHeader = /^Arena team: "(.*)"\[(\d+)\]/m;
const arenaCaptain = /^Name:"(.*)"\[guid:\d+\] - PR: \d+ - Captain\s*$/m;
const int32Max = 2_147_483_647;
const mailItemsMax = 12;
const itemCountMax = 1000;
const deserterMaxSeconds = 3600;
const unitSeconds: Record<string, number> = { h: 3600, m: 60, s: 1 };
const questOps = ["add", "complete", "reward", "remove"];
const arenaTypes = ["2", "3", "5"];

export const gmUsage = `usage: soap gm <ACCOUNT> <verb> [args...]
  level <n> | tele <name> | learn <spell> | unlearn <spell>
  items <id>:<n>... | money <copper> | mail <subject>
  quest <add|complete|reward|remove> <id> | achievement <id>
  revive | kick | combatstop | reset-talents | reset-achievements
  deserter-bg <n><s|m|h> (at most 1h)
  rename|customize|changefaction|changerace <second character>
  guild-create <Fac name> | guild-invite <ACCOUNT2> <Fac name>
  guild-delete <Fac name>
  arena-create <2|3|5> <Fac name> | arena-disband <teamId>
  read <group|mail|pet|titles|reputation|pinfo|characters|bf-queue>
  read guild <Fac name> | read arena <teamId> | read arena-lookup <name>`;

function int(text: string | undefined, max: number, what: string): number {
  const value = Number(text);
  if (!(text && digits.test(text) && value <= max))
    throw new Error(`invalid ${what}: ${text} (1-${max})`);
  return value;
}

function exactly(args: string[], n: number, verb: string): void {
  if (args.length !== n)
    throw new Error(`${verb} takes ${n} argument(s), got ${args.length}`);
}

function phrase(args: string[], what: string): string {
  const joined = args.join(" ");
  if (!freeText.test(joined))
    throw new Error(`invalid ${what}: ${joined} (${freeText.source})`);
  return joined;
}

function facName(args: string[]): string {
  const name = phrase(args, "name");
  if (!name.startsWith("Fac"))
    throw new Error(`guild and arena names start with Fac: ${name}`);
  return name;
}

function one(args: string[], verb: string): string {
  exactly(args, 1, verb);
  return args[0] as string;
}

function tele(c: string, args: string[]): string {
  const name = one(args, "tele");
  if (!teleName.test(name)) throw new Error(`invalid tele name: ${name}`);
  return `tele name ${c} ${name}`;
}

function items(c: string, args: string[]): string {
  if (args.length === 0 || args.length > mailItemsMax)
    throw new Error(`items takes 1-${mailItemsMax} <id>:<n> pairs`);
  for (const pair of args) {
    const [, id, count] = pair.match(itemPair) ?? [];
    int(id, int32Max, "item id");
    int(count, itemCountMax, "item count");
  }
  return `send items ${c} "Peon" "staging" ${args.join(" ")}`;
}

function quest(c: string, args: string[]): string {
  exactly(args, 2, "quest");
  const [op = "", id] = args;
  if (!questOps.includes(op))
    throw new Error(`quest op must be ${questOps.join("|")}: ${op}`);
  return `quest ${op} ${int(id, int32Max, "quest id")} ${c}`;
}

function guildInvite(_c: string, args: string[]): GmPlan {
  const [account2 = "", ...name] = args;
  assertFactory(account2);
  return {
    accounts: [account2],
    command: `guild invite ${characterName(account2)} "${facName(name)}"`,
  };
}

function arena(c: string, args: string[]): string {
  const [type = "", ...name] = args;
  if (!arenaTypes.includes(type))
    throw new Error(`arena type must be ${arenaTypes.join("|")}: ${type}`);
  return `arena create ${c} "${facName(name)}" ${type}`;
}

function deserter(c: string, args: string[]): string {
  const text = one(args, "deserter-bg");
  const [, amount = "", unit = ""] = text.match(duration) ?? [];
  const seconds = Number(amount) * (unitSeconds[unit] ?? 0);
  if (!(seconds >= 1 && seconds <= deserterMaxSeconds))
    throw new Error(`invalid deserter duration: ${text} (1s-1h)`);
  return `deserter bg add ${c} ${text}`;
}

function teamId(args: string[], verb: string): number {
  return int(one(args, verb), int32Max, "team id");
}

function secondCharacter(template: string): Verb {
  return (c, args, account) => {
    const wanted = one(args, template);
    if (!playerName.test(wanted))
      throw new Error(`invalid character name: ${wanted}`);
    const verify = (text: string) => {
      const names = text
        .split(lineBreak)
        .flatMap((line) => line.match(lookupLine)?.[1] ?? []);
      const name = names.find((n) => n.toLowerCase() === wanted.toLowerCase());
      if (!name || name === c)
        throw new Error(
          `${wanted} is not a second character of ${account}: ${names.join(", ")}`,
        );
      return `${template} ${name}`;
    };
    return {
      check: { command: `lookup player account ${account}`, verify },
      command: `${template} ${wanted}`,
    };
  };
}

function arenaDisband(c: string, args: string[]): Omit<GmPlan, "accounts"> {
  const id = teamId(args, "arena-disband");
  const verify = (text: string) => {
    const [, name = "", headerId] = text.match(arenaHeader) ?? [];
    const captain = text.match(arenaCaptain)?.[1];
    if (!(name.startsWith("Fac") && headerId === String(id) && captain === c))
      throw new Error(`arena team ${id} is not a Fac team ${c} captains`);
    return `arena disband ${id}`;
  };
  return {
    check: { command: `arena info ${id}`, verify },
    command: `arena disband ${id}`,
  };
}

function onCharacter(template: string): Verb {
  return (c, args) => {
    exactly(args, 0, `read ${template}`);
    return `${template} ${c}`;
  };
}

function fixed(command: string, verb: string): Verb {
  return (_c, args) => {
    exactly(args, 0, verb);
    return command;
  };
}

const reads: Record<string, Verb> = {
  arena: (_c, args) => `arena info ${teamId(args, "read arena")}`,
  "arena-lookup": (_c, args) => `arena lookup ${phrase(args, "arena name")}`,
  "bf-queue": fixed("bf queue 1", "read bf-queue"),
  characters: (_c, args, account) => {
    exactly(args, 0, "read characters");
    return `lookup player account ${account}`;
  },
  group: onCharacter("group list"),
  guild: (_c, args) => `guild info "${facName(args)}"`,
  mail: onCharacter("mail list"),
  pet: onCharacter("pet list"),
  pinfo: onCharacter("pinfo"),
  reputation: onCharacter("character reputation"),
  titles: onCharacter("character titles"),
};

function read(c: string, args: string[], account: string): Built {
  const [kind = "", ...rest] = args;
  const build = Object.hasOwn(reads, kind) ? reads[kind] : undefined;
  if (!build)
    throw new Error(`read takes ${Object.keys(reads).join("|")}: ${kind}`);
  return build(c, rest, account);
}

function bare(template: string): Verb {
  return (c, args) => {
    exactly(args, 0, template);
    return `${template} ${c}`;
  };
}

function spell(template: string): Verb {
  return (c, args) =>
    `${template} ${c} ${int(one(args, template), int32Max, "spell id")}`;
}

const verbs: Record<string, Verb> = {
  achievement: (c, args) =>
    `achievement add ${int(one(args, "achievement"), int32Max, "achievement id")} ${c}`,
  "arena-create": arena,
  "arena-disband": arenaDisband,
  changefaction: secondCharacter("character changefaction"),
  changerace: secondCharacter("character changerace"),
  combatstop: bare("combatstop"),
  customize: secondCharacter("character customize"),
  "deserter-bg": deserter,
  "guild-create": (c, args) => `guild create ${c} "${facName(args)}"`,
  "guild-delete": (_c, args) => `guild delete "${facName(args)}"`,
  "guild-invite": guildInvite,
  items,
  kick: bare("kick"),
  learn: spell("player learn"),
  level: (c, args) =>
    `character level ${c} ${int(one(args, "level"), 80, "level")}`,
  mail: (c, args) => `send mail ${c} "${phrase(args, "subject")}" "staging"`,
  money: (c, args) =>
    `send money ${c} "Peon" "staging" ${int(one(args, "money"), int32Max, "copper")}`,
  quest,
  read,
  rename: secondCharacter("character rename"),
  "reset-achievements": bare("reset achievements"),
  "reset-talents": bare("reset talents"),
  revive: bare("revive"),
  tele,
  unlearn: spell("player unlearn"),
};

export function planGm(account: string, verb: string, args: string[]): GmPlan {
  assertFactory(account);
  const build = Object.hasOwn(verbs, verb) ? verbs[verb] : undefined;
  if (!build) throw new Error(`unknown gm verb: ${verb}\n${gmUsage}`);
  const plan = build(characterName(account), args, account);
  if (typeof plan === "string") return { accounts: [account], command: plan };
  const extra = "accounts" in plan ? plan.accounts : [];
  return { ...plan, accounts: [account, ...extra] };
}

const defaults: GmDeps = {
  run: (accounts, command) => consoleCommand(accounts, command),
  write: (line) => console.log(line),
};

async function checked(
  { accounts, check, command }: GmPlan,
  run: GmDeps["run"],
): Promise<string> {
  if (!check) return command;
  const { ok, text } = await run(accounts, check.command);
  if (!ok) throw new Error(`${check.command} refused: ${text}`);
  return check.verify(text);
}

export async function runGm(
  [account, verb, ...args]: string[],
  { run, write }: GmDeps = defaults,
): Promise<number> {
  if (!(account && verb)) throw new Error(gmUsage);
  const plan = planGm(account, verb, args);
  const command = await checked(plan, run);
  const { ok, text } = await run(plan.accounts, command);
  write(JSON.stringify({ account, command, ok, text, verb }));
  return ok ? 0 : 1;
}
