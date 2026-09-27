import { mkdir, rm, writeFile } from "node:fs/promises";

export type AccountFiles = { dir: string; wrapper: string };
export type WrapperSpec = { account: string; character: string; root: string };
export type XdgEnv = Record<
  "XDG_CONFIG_HOME" | "XDG_RUNTIME_DIR" | "XDG_STATE_HOME",
  string
>;

export function accountFiles(root: string, account: string): AccountFiles {
  return {
    dir: `${root}/tmp/factory-account-${account}`,
    wrapper: `${root}/tmp/puppet-${account}`,
  };
}

export function xdgEnv(dir: string): XdgEnv {
  return {
    XDG_CONFIG_HOME: `${dir}/config`,
    XDG_RUNTIME_DIR: `${dir}/runtime`,
    XDG_STATE_HOME: `${dir}/state`,
  };
}

function quote(text: string): string {
  return `'${text.replaceAll("'", `'\\''`)}'`;
}

export function wrapperScript({
  account,
  character,
  root,
}: WrapperSpec): string {
  const env = xdgEnv(accountFiles(root, account).dir);
  return `#!/usr/bin/env bash
set -euo pipefail
account=${quote(account)}
character=${quote(character)}
export XDG_CONFIG_HOME=${quote(env.XDG_CONFIG_HOME)}
export XDG_RUNTIME_DIR=${quote(env.XDG_RUNTIME_DIR)}
export XDG_STATE_HOME=${quote(env.XDG_STATE_HOME)}

refuse() {
  printf 'puppet-%s: refusing to run: %s\\n' "$account" "$1" >&2
  exit 1
}

field() {
  sed -n "s/^$1 = \\"\\(.*\\)\\"$/\\1/p" "$config"
}

config=$XDG_CONFIG_HOME/tuicraft/config.toml
[[ -f $config ]] || refuse "no config at $config"
logs_in="$(field account)/$(field character)"
[[ $logs_in == "$account/$character" ]] ||
  refuse "$config logs in $logs_in, not $account/$character"

printf 'puppet-%s: character %s\\n' "$account" "$character" >&2
exec bun ${quote(`${root}/packages/harness/src/puppet/main.ts`)} "$@"
`;
}

export async function writeWrapper(spec: WrapperSpec): Promise<string> {
  const { wrapper } = accountFiles(spec.root, spec.account);
  await mkdir(`${spec.root}/tmp`, { recursive: true });
  await writeFile(wrapper, wrapperScript(spec), { mode: 0o755 });
  return wrapper;
}

export async function removeAccountFiles(
  root: string,
  account: string,
): Promise<void> {
  const { dir, wrapper } = accountFiles(root, account);
  await Promise.all([
    rm(wrapper, { force: true }),
    rm(dir, { force: true, recursive: true }),
  ]);
}
