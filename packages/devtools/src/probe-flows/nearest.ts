import {
  entityType,
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
  summary,
} from "#tools/probe-flows";

const LIMIT = 5;
const TYPES = new Set(["unit", "player", "gameobject"]);
const ROLES = new Set([
  "gossip",
  "questgiver",
  "trainer",
  "class_trainer",
  "profession_trainer",
  "vendor",
  "vendor_ammo",
  "vendor_food",
  "vendor_poison",
  "vendor_reagent",
  "repair",
  "flight_master",
  "spirit_healer",
  "spirit_guide",
  "innkeeper",
  "banker",
  "petitioner",
  "tabard_designer",
  "battlemaster",
  "auctioneer",
  "stable_master",
  "guild_banker",
  "spellclick",
  "mailbox",
]);

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const kind = args["kind"] ?? "";
  if (!(TYPES.has(kind) || ROLES.has(kind)))
    throw new Error(
      `nearest needs kind=<unit|player|gameobject|an NPC role>, not "${kind}".`,
    );
  const matches = () => {
    const found = others(handle).filter((row) =>
      TYPES.has(kind)
        ? entityType(row) === kind
        : row.roles.some((role) => role === kind),
    );
    return found.length > 0 ? found : undefined;
  };
  const rows = (await settle(matches)) ?? [];
  return { kind, rows: rows.slice(0, LIMIT).map(summary) };
}

export const flow: ProbeFlow = {
  name: "nearest",
  run,
  usage:
    "--flow nearest --arg kind=<object type or NPC role>: list the five nearest.",
};
