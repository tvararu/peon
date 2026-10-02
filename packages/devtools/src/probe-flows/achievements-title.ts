import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const LINGER_MS = 5000;
const POLL_MS = 100;

type EarnedRow = { bit: number; earned: boolean };

function lingerOf(args: Readonly<Record<string, string>>): number {
  const seconds = Number(args["linger"] ?? LINGER_MS / 1000);
  if (!(seconds >= 0))
    throw new Error(
      `achievements-title needs linger >= 0, not "${args["linger"]}".`,
    );
  return seconds;
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const linger = lingerOf(args);
  const seen: EarnedRow[] = [];
  const off = handle.achievements.onEvent((event) => {
    if (event.type === "title_changed")
      seen.push({ bit: event.bit, earned: event.earned });
  });
  try {
    const earned = await settle(() => seen.find((row) => row.earned));
    if (!earned) throw new Error("no SMSG_TITLE_EARNED with earned 1 arrived.");
    const { bit } = earned;
    const chosen = handle.achievements.act.setTitle(bit);
    if (!chosen.ok)
      throw new Error(`setTitle refused bit ${bit}: ${chosen.reason}.`);
    const applied = await settle(
      () => handle.achievements.state().titles.chosen || undefined,
    );
    if (applied !== bit)
      throw new Error(`the chosen title never became bit ${bit}.`);
    const cleared = handle.achievements.act.setTitle(undefined);
    if (!cleared.ok) throw new Error("setTitle refused to clear the title.");
    const deadline = Date.now() + linger * 1000;
    let now = handle.achievements.state().titles.chosen;
    while (now !== 0 && Date.now() < deadline) {
      await Bun.sleep(POLL_MS);
      now = handle.achievements.state().titles.chosen;
    }
    if (now !== 0) throw new Error("the chosen title never cleared to 0.");
    return { bit, earned: seen };
  } finally {
    off();
  }
}

export const flow: ProbeFlow = {
  name: "achievements-title",
  run,
  usage:
    "--flow achievements-title [--arg linger=<s>]: wait for SMSG_TITLE_EARNED, choose the earned bit with CMSG_SET_TITLE, wait for the chosen title to match, clear it, and wait for 0.",
};
