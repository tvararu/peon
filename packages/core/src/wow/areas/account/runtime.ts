import { ignoreFailure } from "#lib/ignore-failure";
import {
  buildRequestAccountData,
  buildUpdateAccountData,
  GLOBAL_ACCOUNT_DATA_MASK,
  parseAccountDataTimesMask,
  parseUpdateAccountData,
  parseUpdateAccountDataComplete,
} from "#wow/areas/account/protocol";
import type { AccountEvent, AccountStore } from "#wow/areas/account/store";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";

export const ACCOUNT_ANSWER_MS = 5000;

export type AccountActs = {
  readyForAccountDataTimes: () => Promise<number>;
  accountData: (type: number) => Promise<string>;
  saveAccountData: (type: number, time: number, text: string) => Promise<void>;
  eraseAccountData: (type: number) => Promise<void>;
};

type Env = {
  ctx: AreaRuntimeCtx<AccountEvent>;
};

function timeout<T>(env: Env, pending: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ACCOUNT_ANSWER_MS);
  });
  limit.catch(ignoreFailure);
  env.ctx.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
    },
    { once: true },
  );
  return Promise.race([pending, limit]).finally(() => {
    clearTimeout(timer);
  });
}

async function ready(env: Env): Promise<number> {
  const pending = env.ctx.expect(GameOpcode.SMSG_ACCOUNT_DATA_TIMES, {
    match: (reader) =>
      parseAccountDataTimesMask(reader) === GLOBAL_ACCOUNT_DATA_MASK,
  });
  pending.catch(ignoreFailure);
  env.ctx.send(GameOpcode.CMSG_READY_FOR_ACCOUNT_DATA_TIMES);
  return parseAccountDataTimesMask(await timeout(env, pending));
}

async function read(env: Env, type: number): Promise<string> {
  const pending = env.ctx.expect(GameOpcode.SMSG_UPDATE_ACCOUNT_DATA, {
    match: (reader) => {
      reader.uint64LE();
      return reader.uint32LE() === type;
    },
  });
  pending.catch(ignoreFailure);
  env.ctx.send(
    GameOpcode.CMSG_REQUEST_ACCOUNT_DATA,
    buildRequestAccountData(type),
  );
  return parseUpdateAccountData(await timeout(env, pending)).text;
}

async function waitSave(env: Env, type: number): Promise<void> {
  const pending = env.ctx.expect(GameOpcode.SMSG_UPDATE_ACCOUNT_DATA_COMPLETE, {
    match: (reader) => parseUpdateAccountDataComplete(reader).type === type,
  });
  pending.catch(ignoreFailure);
  await timeout(env, pending);
}

export function accountRuntime(
  ctx: AreaRuntimeCtx<AccountEvent>,
  _store: AccountStore,
): AreaRuntime<AccountActs> {
  const env: Env = { ctx };
  async function saveAccountData(
    type: number,
    time: number,
    text: string,
  ): Promise<void> {
    const pending = waitSave(env, type);
    ctx.send(
      GameOpcode.CMSG_UPDATE_ACCOUNT_DATA,
      buildUpdateAccountData({ text, time, type }),
    );
    await pending;
  }
  async function eraseAccountData(type: number): Promise<void> {
    const pending = waitSave(env, type);
    ctx.send(
      GameOpcode.CMSG_UPDATE_ACCOUNT_DATA,
      buildUpdateAccountData({ text: "", time: 0, type }),
    );
    await pending;
  }
  return {
    act: {
      accountData: (type) => read(env, type),
      eraseAccountData,
      readyForAccountDataTimes: () => ready(env),
      saveAccountData,
    },
    dispose: () => undefined,
  };
}
