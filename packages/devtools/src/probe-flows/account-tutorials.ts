import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const OPS = ["reset", "clear", "flag"] as const;

function opOf(value: string | undefined): (typeof OPS)[number] {
  const found = OPS.find((candidate) => candidate === value);
  if (!found)
    throw new Error(
      `account-tutorials needs op=${OPS.join("|")}, not "${value}".`,
    );
  return found;
}

function bitOf(value: string | undefined): number {
  const bit = Number(value);
  if (value === undefined || !Number.isInteger(bit) || bit < 0 || bit > 255)
    throw new Error(
      `account-tutorials needs bit=<0-255> with op=flag, not "${value}".`,
    );
  return bit;
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const op = opOf(args["op"]);
  const before = (await settle(() => handle.login.state().tutorials)) ?? null;
  if (op === "reset") await handle.account.act.resetTutorials();
  else if (op === "clear") await handle.account.act.clearTutorials();
  else await handle.account.act.tutorialFlag(bitOf(args["bit"]));
  return { before: before && [...before], op };
}

export const flow: ProbeFlow = {
  name: "account-tutorials",
  run,
  usage:
    "--flow account-tutorials --arg op=reset|clear|flag [--arg bit=<0-255>]: print the tutorial flags this world session received, then send CMSG_TUTORIAL_RESET (clears every bit), CMSG_TUTORIAL_CLEAR (sets every bit) or CMSG_TUTORIAL_FLAG (sets one bit). The server saves them at logout.",
};
