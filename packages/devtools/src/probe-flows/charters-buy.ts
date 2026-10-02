import {
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
} from "#tools/probe-flows";

const GUILD_CHARTER_INDEX = 1;
const GUILD_CHARTER_ENTRY = 5863;
const CHARTER_NAME = /^[A-Za-z0-9 ]{2,24}$/;

type Args = Readonly<Record<string, string>>;

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

function letters(args: Args): string {
  const raw = args["name"];
  if (raw !== undefined && CHARTER_NAME.test(raw)) return raw;
  throw new Error(
    `charters-buy needs name=<letters>, not "${raw ?? ""}". Use Fac<account id letters> (SR5-guild-1).`,
  );
}

async function attempt(act: () => Promise<unknown>): Promise<Json> {
  try {
    return json(await act());
  } catch (error) {
    return { thrown: error instanceof Error ? error.message : String(error) };
  }
}

type Petitioner = {
  distance: number | null;
  entity: { entry: number; guid: bigint };
  roles: readonly string[];
};

async function stage(ctx: FlowContext): Promise<{
  handle: FlowContext["handle"];
  args: FlowContext["args"];
  settle: FlowContext["settle"];
  master: Petitioner;
}> {
  const { handle, args, settle } = ctx;
  await settle(() =>
    handle.getInventoryState().status === "complete" ? true : undefined,
  );
  const found = await settle(() =>
    others(handle).find((row) => row.roles.includes("petitioner")),
  );
  if (!found) throw new Error("no petitioner is in view.");
  const master: Petitioner = {
    distance: found.distance,
    entity: { entry: found.entity.entry, guid: found.entity.guid },
    roles: found.roles,
  };
  return { args, handle, master, settle };
}
async function buyCharter(
  ctx: Pick<FlowContext, "handle" | "args">,
  master: { entity: { guid: bigint } },
): Promise<{ bought: Json; name: string }> {
  const name = letters(ctx.args);
  const bought = await attempt(() =>
    ctx.handle.charters.act.buy(master.entity.guid, name, GUILD_CHARTER_INDEX),
  );
  return { bought, name };
}

async function followUp(
  handle: FlowContext["handle"],
  name: string,
  guid: bigint | undefined,
): Promise<{ queried: Json; renamed: Json; signatures: Json }> {
  if (guid === undefined)
    return {
      queried: { skipped: "no charter was bought to query." },
      renamed: { skipped: "no charter was bought to rename." },
      signatures: { skipped: "no charter was bought to show." },
    };
  const queried = await attempt(() => handle.charters.act.query(guid));
  const renamed = await attempt(() =>
    handle.charters.act.rename(guid, `${name.slice(0, 15)}Z`),
  );
  const signatures = await attempt(() =>
    handle.charters.act.showSignatures(guid),
  );
  return { queried, renamed, signatures };
}

async function run(ctx: FlowContext): Promise<Json> {
  const { handle, settle, master } = await stage(ctx);
  const showlist = await attempt(() =>
    handle.charters.act.showList(master.entity.guid),
  );
  const { bought, name } = await buyCharter(ctx, master);
  const boughtItemRaw =
    !Array.isArray(bought) &&
    typeof bought === "object" &&
    bought !== null &&
    typeof bought["item"] === "string"
      ? (bought["item"] as string)
      : undefined;
  const boughtItem =
    boughtItemRaw === undefined ? undefined : BigInt(boughtItemRaw);
  const charter = await settle(() =>
    handle
      .getInventoryState()
      .slots.find(
        (slot) =>
          slot.status === "occupied" && slot.item.entry === GUILD_CHARTER_ENTRY,
      ),
  );
  const held = charter?.status === "occupied" ? charter.guid : undefined;
  const guid = held ?? boughtItem;
  const later = await followUp(handle, name, guid);
  return json({
    bought,
    charter: guid === undefined ? null : `0x${guid.toString(16)}`,
    master: {
      distance: master.distance,
      entry: master.entity.entry,
      guid: `0x${master.entity.guid.toString(16)}`,
      roles: master.roles,
    },
    queried: later.queried,
    renamed: later.renamed,
    showlist,
    signatures: later.signatures,
    state: handle.charters.state(),
  });
}

export const flow: ProbeFlow = {
  name: "charters-buy",
  run,
  usage:
    "--flow charters-buy --arg name=<letters>: ask the nearest petitioner for its charter list, buy a guild charter with that name (Fac + account id letters, SR5-guild-1), then query it, show its signatures and rename it. Stage guildless with 1 gold near Andrew Matthews first.",
};
