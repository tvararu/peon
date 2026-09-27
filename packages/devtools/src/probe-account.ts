import { readFile } from "node:fs/promises";
import type { ClientConfig } from "@peon/core";
import { parseConfig } from "@peon/core/lib/config";
import { resolvePaths } from "@peon/core/lib/paths";

export type AccountPaths = { config: string; pid: string };

export function accountPaths(root: string, account: string): AccountPaths {
  const dir = `${root}/tmp/factory-account-${account}`;
  const env = {
    XDG_CONFIG_HOME: `${dir}/config`,
    XDG_RUNTIME_DIR: `${dir}/runtime`,
  };
  const host = { home: root, tmp: root, uid: 0 };
  const { configPath, runtimeDir } = resolvePaths(env, host);
  return { config: configPath, pid: `${runtimeDir}/puppet.pid` };
}

function readText(path: string): Promise<string | undefined> {
  return readFile(path, "utf8").catch(() => undefined);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function puppetRunning(path: string): Promise<boolean> {
  const pid = Number.parseInt((await readText(path)) ?? "", 10);
  return Number.isInteger(pid) && pid > 0 && alive(pid);
}

export async function loadAccount(
  root: string,
  account: string,
): Promise<ClientConfig> {
  const paths = accountPaths(root, account);
  const text = await readText(paths.config);
  if (text === undefined)
    throw new Error(
      `no config for ${account} at ${paths.config}; run mise factory soap create here first.`,
    );
  const config = parseConfig(text);
  const logsIn = config.account.toUpperCase();
  if (logsIn !== account)
    throw new Error(`${paths.config} logs in ${logsIn}, not ${account}.`);
  if (await puppetRunning(paths.pid))
    throw new Error(
      `the puppet for ${account} runs; stop it first (tmp/puppet-${account} stop).`,
    );
  const { character, host, language, password, port } = config;
  return {
    account,
    character,
    host,
    language,
    password: password.toUpperCase(),
    port,
  };
}
