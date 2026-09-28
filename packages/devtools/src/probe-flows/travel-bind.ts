import type { WorldHandle } from "@peon/core";
import {
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
  summary,
} from "#tools/probe-flows";

const REACH_YARDS = 4;
const STEP_YARDS = 20;
const MAX_STEPS = 6;
const WAIT_MS = 5000;
const HOME_OPTION = /home/i;

type Row = ReturnType<WorldHandle["queryNearby"]>[number];
type TravelEvent = Parameters<
  Parameters<WorldHandle["travel"]["onEvent"]>[0]
>[0];

const hex = (guid: bigint) => `0x${guid.toString(16)}`;

function watch(handle: WorldHandle) {
  const seen: TravelEvent[] = [];
  const off = handle.travel.onEvent((event) => seen.push(event));
  const next = async <T extends TravelEvent["type"]>(
    type: T,
  ): Promise<Extract<TravelEvent, { type: T }> | undefined> => {
    const deadline = Date.now() + WAIT_MS;
    const find = () =>
      seen.find((e): e is Extract<TravelEvent, { type: T }> => e.type === type);
    while (!find() && Date.now() < deadline) await Bun.sleep(50);
    return find();
  };
  return { next, off };
}

async function reach(handle: WorldHandle, guid: bigint): Promise<void> {
  for (let i = 0; i < MAX_STEPS; i++) {
    const row = others(handle).find((r) => r.entity.guid === guid);
    if (!row?.position || row.distance === null || row.distance <= REACH_YARDS)
      return;
    const { x, y, z } = row.position;
    const yards = Math.min(STEP_YARDS, row.distance - REACH_YARDS + 1);
    const walked = await handle.walkTowardPoint({ x, y, z }, yards);
    if (walked.traveled === 0) return;
  }
}

async function homeOption(
  handle: WorldHandle,
  guid: bigint,
  settle: FlowContext["settle"],
): Promise<number> {
  const menu = await settle(() => {
    const dialog = handle.getQuestState().dialog;
    return dialog?.kind === "gossip" && dialog.data.guid === guid
      ? dialog.data
      : undefined;
  });
  if (!menu) throw new Error("the innkeeper sent no gossip menu.");
  const option = menu.options.find((o) => HOME_OPTION.test(o.text));
  if (!option)
    throw new Error(
      `no home option in the innkeeper's menu: ${JSON.stringify(menu.options.map((o) => o.text))}.`,
    );
  return option.optionIndex;
}

async function viaGossip(
  ctx: FlowContext,
  innkeeper: Row,
  events: ReturnType<typeof watch>,
): Promise<Json> {
  const guid = innkeeper.entity.guid;
  ctx.handle.talk(guid);
  ctx.handle.selectGossipOption(await homeOption(ctx.handle, guid, ctx.settle));
  const offer = await events.next("bind_offer");
  return {
    innkeeper: summary(innkeeper),
    offer: offer ? { npc: hex(offer.npc) } : null,
  };
}

async function direct(
  ctx: FlowContext,
  innkeeper: Row,
  events: ReturnType<typeof watch>,
): Promise<Json> {
  const outcome = await ctx.handle.travel.act.bindActivate(
    innkeeper.entity.guid,
  );
  const bound =
    outcome.status === "ok" ? await events.next("bound") : undefined;
  return {
    bound: bound ? { areaId: bound.areaId, binder: hex(bound.binder) } : null,
    innkeeper: summary(innkeeper),
    outcome,
  };
}

async function run(ctx: FlowContext): Promise<Json> {
  const find = () =>
    others(ctx.handle).find((r) => r.roles.includes("innkeeper"));
  const innkeeper = await ctx.settle(find);
  if (!innkeeper) throw new Error("no innkeeper is in view.");
  await reach(ctx.handle, innkeeper.entity.guid);
  const events = watch(ctx.handle);
  try {
    return ctx.args["gossip"] === "1"
      ? await viaGossip(ctx, innkeeper, events)
      : await direct(ctx, innkeeper, events);
  } finally {
    events.off();
  }
}

export const flow: ProbeFlow = {
  name: "travel-bind",
  run,
  usage:
    "--flow travel-bind [--arg gossip=1]: walk to the nearest innkeeper and send CMSG_BINDER_ACTIVATE, then wait for SMSG_PLAYERBOUND; with gossip=1, open the innkeeper's gossip menu and pick the option that names home, then wait for SMSG_BINDER_CONFIRM.",
};
