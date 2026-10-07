import {
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
  settleWithin,
} from "#tools/probe-flows";

type Args = Readonly<Record<string, string>>;

type Petitioner = {
  distance: number | null;
  entity: { entry: number; guid: bigint };
  roles: readonly string[];
};

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

function required(args: Args, key: string): string {
  const value = args[key];
  if (value === undefined || value.length === 0)
    throw new Error(`charters-sign needs ${key}=<value>.`);
  return value;
}

async function attempt(act: () => Promise<unknown>): Promise<Json> {
  try {
    return json(await act());
  } catch (error) {
    return { thrown: error instanceof Error ? error.message : String(error) };
  }
}

async function owner(ctx: FlowContext): Promise<Json> {
  const { handle, args, settle } = ctx;
  const name = required(args, "name");
  const index = Number(args["index"] ?? 1);
  await settle(() =>
    handle.getInventoryState().status === "complete" ? true : undefined,
  );
  const master = await settle(() =>
    others(handle).find((row) => row.roles.includes("petitioner")),
  );
  if (!master) throw new Error("no petitioner is in view.");
  const npc = master.entity.guid;
  const showlist = await attempt(() => handle.charters.act.showList(npc));
  const bought = await attempt(() => handle.charters.act.buy(npc, name, index));
  const charterGuid =
    typeof bought === "object" &&
    bought !== null &&
    !Array.isArray(bought) &&
    typeof bought["item"] === "string"
      ? BigInt(bought["item"])
      : undefined;
  const held = await settle(() =>
    handle
      .getInventoryState()
      .slots.find(
        (slot) =>
          slot.status === "occupied" &&
          [23_560, 23_561, 23_562].includes(slot.item.entry ?? 0),
      ),
  );
  const item =
    charterGuid ?? (held?.status === "occupied" ? held.guid : undefined);
  if (item === undefined) return { bought, showlist };
  return finish(handle, args, item, { bought, master, showlist });
}

async function finish(
  handle: FlowContext["handle"],
  args: Args,
  item: bigint,
  seen: { bought: Json; master: Petitioner; showlist: Json },
): Promise<Json> {
  const early = await attempt(() => handle.charters.act.turnIn(item));
  const partner = required(args, "partner");
  const target = await settleWithin(Number(args["wait_ms"] ?? 60_000))(() =>
    others(handle).find((row) => row.entity.name === partner),
  );
  if (!target) throw new Error(`no player named ${partner} is in view.`);
  const first = await attempt(() =>
    handle.charters.act.offer(item, target.entity.guid),
  );
  const second = await attempt(() =>
    handle.charters.act.offer(item, target.entity.guid),
  );
  const signatures = await attempt(() =>
    handle.charters.act.showSignatures(item),
  );
  const turned = await attempt(() => handle.charters.act.turnIn(item));
  const refreshed = await attempt(() => handle.arena.act.refresh());
  return json({
    bought: seen.bought,
    early,
    first,
    master: { distance: seen.master.distance, entry: seen.master.entity.entry },
    refreshed,
    second,
    showlist: seen.showlist,
    signatures,
    state: handle.charters.state(),
    turned,
  });
}

async function signer(ctx: FlowContext): Promise<Json> {
  const { handle, args } = ctx;
  const wait = settleWithin(Number(args["wait_ms"] ?? 90_000));
  const first = await wait(() => handle.charters.state().pendingOffer?.item);
  if (first === undefined) throw new Error("no charter was offered.");
  const declined = await attempt(() => handle.charters.act.decline(first));
  const again = await wait(() => handle.charters.state().pendingOffer?.item);
  if (again === undefined)
    return json({
      declined,
      first,
      signed: "the charter was not offered again.",
    });
  const signed = await attempt(() => handle.charters.act.sign(again));
  return json({
    again,
    declined,
    first,
    signed,
    state: handle.charters.state(),
  });
}

function run(ctx: FlowContext): Promise<Json> {
  const role = required(ctx.args, "role");
  if (role === "owner") return owner(ctx);
  if (role === "signer") return signer(ctx);
  throw new Error(`charters-sign role must be owner or signer, not ${role}.`);
}
export const flow: ProbeFlow = {
  name: "charters-sign",
  run,
  usage:
    "--flow charters-sign --arg role=owner --arg name=<letters> --arg partner=<name> [--arg index=1]: buy an arena charter at the nearest petitioner, turn it in unsigned, offer it twice to the partner, then turn it in. --arg role=signer: wait for an offer, decline it, wait for the next, sign it. Run the signer first, both staged at the organizer.",
};
