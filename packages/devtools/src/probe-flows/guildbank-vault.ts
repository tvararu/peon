import type { WorldHandle } from "@peon/core";
import {
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
  summary,
} from "#tools/probe-flows";

const VAULT_OBJECT_TYPE = 34;
const DEPOSIT_COPPER = 2000;
const WITHDRAW_COPPER = 500;

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

async function attempt(act: () => Promise<unknown>): Promise<Json> {
  try {
    return json(await act());
  } catch (error) {
    return { thrown: error instanceof Error ? error.message : String(error) };
  }
}

function findVault(handle: WorldHandle) {
  return others(handle).find(({ entity }) => {
    if (!("gameObjectType" in entity)) return false;
    return entity.gameObjectType === VAULT_OBJECT_TYPE;
  });
}

async function run({ handle }: FlowContext): Promise<Json> {
  const vault = findVault(handle);
  if (!vault)
    throw new Error(
      "guildbank-vault found no guild vault object nearby; place the character at a vault first.",
    );
  const act = handle.guildbank.act;
  const opened = await attempt(() => act.openVault(vault.entity.guid));
  const tab = await attempt(() => act.queryTab(0));
  const text = await attempt(() => act.queryText(0));
  const log = await attempt(() => act.queryLog(0));
  const limit = await attempt(() => act.queryMoneyWithdrawn());
  const deposited = await attempt(() => act.depositMoney(DEPOSIT_COPPER));
  const withdrawn = await attempt(() => act.withdrawMoney(WITHDRAW_COPPER));
  return json({
    deposited,
    limit,
    log,
    opened,
    state: handle.guildbank.state(),
    tab,
    text,
    vault: summary(vault),
    withdrawn,
  });
}

export const flow: ProbeFlow = {
  name: "guildbank-vault",
  run,
  usage:
    "--flow guildbank-vault: within 10 yards of a guild vault as a guild member, opens the vault, queries tab 0, reads its text and log and the money-withdrawn limit, deposits 2000 copper and withdraws 500.",
};
