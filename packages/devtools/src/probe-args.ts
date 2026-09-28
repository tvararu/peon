import { opcodeNumber } from "@peon/core/session";

export type SendStep = { opcode: number; body?: string };
export type FlowStep = { flow: string; args: Record<string, string> };
export type ProbeStep = SendStep | FlowStep;

export type ProbeArgs = {
  account: string;
  steps: ProbeStep[];
  waitMs: number;
  until: number[];
  expect: number[];
  bodies: boolean;
  out?: string;
};

export type Usage = { usage: string };

export const PROBE_USAGE = `mise protocol:probe <ACCOUNT> [--send <OPCODE> [--body <hex>]]...
    [--flow <name> [--arg <key>=<value>]...] [--wait <s>] [--until <OPCODE>]...
    [--expect <OPCODE>]... [--bodies] [--out <dir>]`;

export const ACCOUNT_PATTERN = /^FAC[0-9A-F]{10}$/;

const DEFAULT_WAIT_MS = 5000;
const HEX_BODY = /^(?:[0-9a-f]{2})*$/i;
const KEY_VALUE = /^([a-z][a-z0-9_-]*)=(.*)$/i;

class UsageError extends Error {}

type Parse = { args: ProbeArgs; last: ProbeStep | undefined; rest: string[] };

function refuse(text: string): never {
  throw new UsageError(text);
}

function take(parse: Parse, flag: string): string {
  const value = parse.rest.shift();
  if (value === undefined) refuse(`${flag} needs a value.`);
  return value;
}

function opcode(parse: Parse, flag: string): number {
  const text = take(parse, flag);
  return opcodeNumber(text) ?? refuse(`${flag}: unknown opcode ${text}.`);
}

function body(parse: Parse): void {
  const text = take(parse, "--body");
  const { last } = parse;
  if (!last || "flow" in last || last.body !== undefined)
    refuse("--body follows a --send, once.");
  if (!HEX_BODY.test(text)) refuse("--body takes even-length hex.");
  last.body = text.toLowerCase();
}

function flowArg(parse: Parse): void {
  const text = take(parse, "--arg");
  const { last } = parse;
  if (!(last && "flow" in last)) refuse("--arg follows a --flow.");
  const match = text.match(KEY_VALUE);
  if (!(match?.[1] && match[2] !== undefined)) refuse("--arg takes key=value.");
  last.args[match[1]] = match[2];
}

function wait(parse: Parse): number {
  const seconds = Number(take(parse, "--wait"));
  if (!Number.isFinite(seconds) || seconds < 0)
    refuse("--wait takes seconds, 0 or more.");
  return Math.round(seconds * 1000);
}

function push(parse: Parse, step: ProbeStep): void {
  parse.args.steps.push(step);
  parse.last = step;
}

function readFlag(parse: Parse, name: string): void {
  const { args } = parse;
  if (name === "--send") push(parse, { opcode: opcode(parse, name) });
  else if (name === "--flow")
    push(parse, { args: {}, flow: take(parse, name) });
  else if (name === "--body") body(parse);
  else if (name === "--arg") flowArg(parse);
  else if (name === "--wait") args.waitMs = wait(parse);
  else if (name === "--until") args.until.push(opcode(parse, name));
  else if (name === "--expect") args.expect.push(opcode(parse, name));
  else if (name === "--bodies") args.bodies = true;
  else if (name === "--out") args.out = take(parse, name);
  else refuse(`unknown option ${name}.`);
}

function account(argv: readonly string[]): string {
  const names = argv.filter(
    (word, i) => !(word.startsWith("--") || takesValue(argv[i - 1])),
  );
  if (names.length === 0) refuse("name an account.");
  if (names.length > 1) refuse("name one account.");
  const [name = ""] = names;
  if (!ACCOUNT_PATTERN.test(name))
    refuse(`${name} is not a FAC account from soap create.`);
  return name;
}

function takesValue(word: string | undefined): boolean {
  return word !== undefined && word !== "--bodies" && word.startsWith("--");
}

function readArgs(argv: readonly string[]): ProbeArgs {
  const args: ProbeArgs = {
    account: account(argv),
    bodies: false,
    expect: [],
    steps: [],
    until: [],
    waitMs: DEFAULT_WAIT_MS,
  };
  const state: Parse = { args, last: undefined, rest: [...argv] };
  while (state.rest.length > 0) {
    const word = state.rest.shift() ?? "";
    if (word.startsWith("--")) readFlag(state, word);
  }
  return args;
}

export function parseProbeArgs(argv: readonly string[]): ProbeArgs | Usage {
  try {
    return readArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) return { usage: error.message };
    throw error;
  }
}
