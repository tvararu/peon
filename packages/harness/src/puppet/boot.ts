import { mkdir, rm } from "node:fs/promises";
import type { ClientConfig, WorldHandle } from "@peon/core";
import { messageOf } from "@peon/core/lib/errors";
import { loadProfile } from "#harness/config/profile";
import { type PuppetPaths, sendRequest } from "#harness/puppet/protocol";
import { listenPuppet, type PuppetServer } from "#harness/puppet/server";

export type PuppetBootInit = {
  paths: PuppetPaths;
  login: (config: ClientConfig) => Promise<WorldHandle>;
};

export async function bootPuppet({
  paths,
  login,
}: PuppetBootInit): Promise<PuppetServer> {
  const profile = await loadProfile(paths.configPath);
  await mkdir(paths.runtimeDir, { mode: 0o700, recursive: true });
  const running = await sendRequest(paths.socket, { cmd: "status" }).then(
    () => true,
    () => false,
  );
  if (running)
    throw new Error(
      `A puppet is already running at ${paths.socket}; stop it first.`,
    );
  await rm(paths.socket, { force: true });
  const handle = await login(profile.client).catch((error: unknown) => {
    throw new Error(
      `${profile.character} on ${profile.account} could not log in: ${messageOf(error)}`,
      { cause: error },
    );
  });
  return listenPuppet({ handle, paths });
}
