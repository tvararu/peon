import type { WorldHandle } from "@peon/core";
import {
  entityType,
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
  summary,
} from "#tools/probe-flows";

const DEFAULT_LINGER = 5;
const POLL_MS = 100;
const WAVE_ANIMATION = 3;

const hex = (guid: bigint) => `0x${guid.toString(16)}`;

function lingerOf(args: Readonly<Record<string, string>>): number {
  const seconds = Number(args["linger"] ?? DEFAULT_LINGER);
  if (!(seconds >= 0))
    throw new Error(`emotes-send needs linger >= 0, not "${args["linger"]}".`);
  return seconds;
}

function nearestUnit(handle: WorldHandle) {
  return others(handle).find((row) => entityType(row) === "unit");
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const name = args["name"] ?? "wave";
  const linger = lingerOf(args);
  const target = await settle(() => nearestUnit(handle));
  if (!target) throw new Error("no creature is in view to emote at.");
  const animations: Json[] = [];
  const echoes: Json[] = [];
  let named = false;
  const off = handle.emotes.onEvent((event) => {
    if (event.type === "emote")
      animations.push({ emote: event.emote, guid: hex(event.guid) });
    else if (event.self) {
      echoes.push({
        emoteNum: event.emoteNum,
        target: event.target ?? null,
        textEmote: event.textEmote,
      });
      if (event.target) named = true;
    }
  });
  try {
    const wave = handle.emotes.act.emote(WAVE_ANIMATION);
    if (!wave.ok) throw new Error(`emote refused: ${wave.reason}.`);
    const sent = await handle.emotes.act.textEmote(name, target.entity.guid);
    if (!sent.ok) throw new Error(`text emote refused: ${sent.reason}.`);
    const deadline = Date.now() + linger * 1000;
    while (!named && Date.now() < deadline) await Bun.sleep(POLL_MS);
    if (!named)
      throw new Error(
        "no SMSG_TEXT_EMOTE naming the target arrived from the character.",
      );
    return { animations, echoes, target: summary(target) };
  } finally {
    off();
  }
}

export const flow: ProbeFlow = {
  name: "emotes-send",
  run,
  usage:
    "--flow emotes-send [--arg name=<text emote, default wave>] [--arg linger=<n>]: send the wave animation, then a text emote at the nearest creature, and wait up to 5 s for the server's SMSG_TEXT_EMOTE naming it.",
};
