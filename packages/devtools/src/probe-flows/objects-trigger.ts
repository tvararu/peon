import type { WorldHandle } from "@peon/core";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const ID = /^[1-9][0-9]*$/;
const POINT = /^-?[0-9.]+,-?[0-9.]+,-?[0-9.]+$/;
const DEFAULT_SECONDS = 3;
const STEP_YARDS = 20;
const MAX_STEPS = 12;
const ARRIVED_YARDS = 1;
const MAX_STALLS = 3;

type Point = { x: number; y: number; z: number };

function parsePoint(text: string | undefined): Point | undefined {
  if (text === undefined) return undefined;
  if (!POINT.test(text))
    throw new Error(`objects-trigger needs to=<x>,<y>,<z>, not "${text}".`);
  const [x = 0, y = 0, z = 0] = text.split(",").map(Number);
  return { x, y, z };
}

function parseId(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  if (!ID.test(text))
    throw new Error(`objects-trigger needs id=<trigger id>, not "${text}".`);
  return Number(text);
}

type Walk = { traveled: number; stop: string | null };

async function walkTo(handle: WorldHandle, point: Point): Promise<Walk> {
  let traveled = 0;
  let stop: string | null = null;
  let stalls = 0;
  for (let i = 0; i < MAX_STEPS; i++) {
    const pose = handle.getControlState().pose;
    if (!pose) break;
    const left = Math.hypot(point.x - pose.x, point.y - pose.y);
    if (left <= ARRIVED_YARDS) break;
    const walked = await handle.walkTowardPoint(
      point,
      Math.min(STEP_YARDS, left),
    );
    traveled += walked.traveled;
    stop = walked.reason ?? null;
    stalls = walked.traveled === 0 ? stalls + 1 : 0;
    if (stalls >= MAX_STALLS) break;
  }
  return { stop, traveled: Math.round(traveled * 10) / 10 };
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const id = parseId(args["id"]);
  const to = parsePoint(args["to"]);
  if (id === undefined && to === undefined)
    throw new Error("objects-trigger needs id=<n>, to=<x>,<y>,<z> or both.");
  const seconds = Number(args["seconds"] ?? DEFAULT_SECONDS);
  const sent: number[] = [];
  const messages: string[] = [];
  const off = handle.objects.onEvent((event) => {
    if (event.type === "trigger_sent") sent.push(event.triggerId);
    else if (event.type === "trigger_message") messages.push(event.text);
  });
  const mapBefore = handle.getControlState().pose?.mapId ?? null;
  if (to)
    await settle(() => (handle.getControlState().speed > 0 ? true : undefined));
  const walk = to ? await walkTo(handle, to) : null;
  if (id !== undefined) handle.objects.act.enterTrigger(id);
  await Bun.sleep(seconds * 1000);
  off();
  const { triggers } = handle.objects.state();
  return {
    catalog: triggers.catalog,
    inside: [...triggers.inside],
    mapAfter: handle.getControlState().pose?.mapId ?? null,
    mapBefore,
    messages,
    sent,
    walk,
  };
}

export const flow: ProbeFlow = {
  name: "objects-trigger",
  run,
  usage:
    "--flow objects-trigger [--arg to=<x>,<y>,<z>] [--arg id=<n>] [--arg seconds=<s>]: walk to a point so the watcher sends the triggers it enters, or send CMSG_AREATRIGGER for one trigger, then report the triggers sent and the messages that arrive.",
};
