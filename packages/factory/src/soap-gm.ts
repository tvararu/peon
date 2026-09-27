import { assertFactory, characterName, consoleCommand } from "#factory/soap";
import type { SoapResult } from "#factory/soap-copy";

export type GmPlan = { accounts: string[]; command: string };
export type GmDeps = {
  run: (accounts: string[], command: string) => Promise<SoapResult>;
  write: (line: string) => void;
};

type Verb = (c: string, args: string[]) => GmPlan | string;

const digits = /^[1-9][0-9]*$/;
const freeText = /^[A-Za-z0-9 ]{1,24}$/;
const teleName = /^[A-Za-z0-9_]{1,40}$/;
const itemPair = /^([1-9][0-9]*):([1-9][0-9]*)$/;
const int32Max = 2_147_483_647;
const mailItemsMax = 12;
const itemCountMax = 1000;
const questOps = ["add", "complete", "reward", "remove"];
const arenaTypes = ["2", "3", "5"];
const reads: Record<string, string> = {
  group: "group list",
  mail: "mail list",
  pet: "pet list",
  pinfo: "pinfo",
  reputation: "character reputation",
  titles: "character titles",
};

export const gmUsage = `usage: soap gm <ACCOUNT> <verb> [args...]
  level <n> | tele <name> | learn <spell> | unlearn <spell>
  items <id>:<n>... | money <copper> | mail <subject>
  quest <add|complete|reward|remove> <id> | achievement <id>
  revive | kick | combatstop | reset-talents
  guild-create <Fac name> | guild-invite <ACCOUNT2> <Fac name>
  arena-create <2|3|5> <Fac name>
  read <group|mail|pet|titles|reputation|pinfo>`;

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

function read(c: string, args: string[]): string {
  const kind = one(args, "read");
  const command = reads[kind];
  if (!command)
    throw new Error(`read takes ${Object.keys(reads).join("|")}: ${kind}`);
  return `${command} ${c}`;
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
  combatstop: bare("combatstop"),
  "guild-create": (c, args) => `guild create ${c} "${facName(args)}"`,
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
  "reset-talents": bare("reset talents"),
  revive: bare("revive"),
  tele,
  unlearn: spell("player unlearn"),
};

export function planGm(account: string, verb: string, args: string[]): GmPlan {
  assertFactory(account);
  const build = Object.hasOwn(verbs, verb) ? verbs[verb] : undefined;
  if (!build) throw new Error(`unknown gm verb: ${verb}\n${gmUsage}`);
  const plan = build(characterName(account), args);
  return typeof plan === "string"
    ? { accounts: [account], command: plan }
    : { accounts: [account, ...plan.accounts], command: plan.command };
}

const defaults: GmDeps = {
  run: (accounts, command) => consoleCommand(accounts, command),
  write: (line) => console.log(line),
};

export async function runGm(
  [account, verb, ...args]: string[],
  { run, write }: GmDeps = defaults,
): Promise<number> {
  if (!(account && verb)) throw new Error(gmUsage);
  const { accounts, command } = planGm(account, verb, args);
  const { ok, text } = await run(accounts, command);
  write(JSON.stringify({ account, command, ok, text, verb }));
  return ok ? 0 : 1;
}
