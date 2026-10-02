import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const ACCOUNT_TYPE = 7;
const SAVE_TEXT = "peon";
const SAVE_TIME = 1_790_000_100;

async function run({ handle }: FlowContext): Promise<Json> {
  const mask = await handle.account.act.readyForAccountDataTimes();
  if (mask !== 0x15)
    throw new Error(`account-data wants mask 0x15, saw ${mask}`);
  await handle.account.act.saveAccountData(ACCOUNT_TYPE, SAVE_TIME, SAVE_TEXT);
  const saved = await handle.account.act.accountData(ACCOUNT_TYPE);
  if (saved !== SAVE_TEXT)
    throw new Error(`account-data wants "${SAVE_TEXT}", saw "${saved}"`);
  await handle.account.act.eraseAccountData(ACCOUNT_TYPE);
  const erased = await handle.account.act.accountData(ACCOUNT_TYPE);
  if (erased !== "")
    throw new Error(`account-data wants empty text, saw "${erased}"`);
  return { erased: true, mask, saved };
}

export const flow: ProbeFlow = {
  name: "account-data",
  run,
  usage:
    "--flow account-data: wait for the 0x15 account-data-times mask, save type 7 as 'peon', read it back, erase it and read the empty text.",
};
