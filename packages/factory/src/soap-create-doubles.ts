import type { ClientConfig, WorldHandle } from "@peon/core";
import type { CharEndpoint, CreateDeps, Json } from "#factory/soap-create";
import type { Preset } from "#factory/soap-presets";

export function serviceDouble() {
  const calls: { body: Json; character: string; endpoint: CharEndpoint }[] = [];
  return {
    calls,
    service: {
      char: (character: string, endpoint: CharEndpoint, body: Json) => {
        calls.push({ body, character, endpoint });
        return Promise.resolve({});
      },
    },
  };
}

export function loginDouble(seen: { skill: boolean }) {
  const logouts: string[] = [];
  const handle = {
    closed: Promise.resolve(),
    getControlState: () => ({ selfGuid: 1n }),
    getEntity: () => ({
      rawFields: new Map(seen.skill ? [[636, 356 + 65_536]] : []),
    }),
    logout: () => {
      logouts.push("logout");
    },
  } as unknown as WorldHandle;
  return {
    handle,
    login: () => Promise.resolve(handle),
    logouts,
  };
}

export const accountInfoText = (account: string, gmLevel: number) =>
  `| Account: ${account} (ID: 309),\n\n GMLevel: ${gmLevel}`;

export const pinfoText = (account: string, gmLevel: number) =>
  [
    "| Player Faaaaaaaaab (guid: 2515)",
    `| Account: ${account} (ID: 309),`,
    `   GMLevel: ${gmLevel}`,
  ].join("\n");

export function depsFor(_preset: Preset, overrides?: Partial<CreateDeps>) {
  const commands: string[] = [];
  const copies = { value: 0 };
  const service = serviceDouble();
  const login = loginDouble({ skill: true });
  const deps: CreateDeps = {
    auth: () =>
      Promise.resolve({
        realmHost: "h",
        realmId: 1,
        realmPort: 1,
        sessionKey: new Uint8Array(0),
      }),
    console: () => Promise.resolve({ ok: true, text: "" }),
    copy: () => {
      copies.value += 1;
      return Promise.resolve(1);
    },
    create: () => Promise.resolve({ result: "success" }),
    createConfig: (names) =>
      ({ account: names.account, character: names.character }) as ClientConfig,
    login: login.login,
    loginConfig: (account) =>
      Promise.resolve({
        account,
        character: "Faaaaaaaaab",
      }) as Promise<ClientConfig>,
    names: { account: "FAC0000000001", character: "Faaaaaaaaab" },
    run: (command: string) => {
      commands.push(command);
      return Promise.resolve({
        ok: true,
        text: command.startsWith("pinfo") ? pinfoText("FAC0000000001", 0) : "",
      });
    },
    service: service.service,
    sleep: () => Promise.resolve(undefined),
    templateEnv: {},
    ...overrides,
  };
  return { commands, copies, deps, service };
}

const gmSet = /^account set gmlevel \S+ (\d+) -1$/;

export function privilegeDouble(preset: Preset, stuck = false) {
  const level = { value: 0 };
  const made = depsFor(preset);
  made.deps.run = (command: string) => {
    const set = gmSet.exec(command);
    if (set) {
      if (!(stuck && set[1] === "0")) level.value = Number(set[1]);
      return Promise.resolve({ ok: true, text: "" });
    }
    if (command.startsWith("pinfo"))
      return Promise.resolve({
        ok: true,
        text: pinfoText("FAC0000000001", level.value),
      });
    if (command.startsWith("account info"))
      return Promise.resolve({
        ok: true,
        text: accountInfoText("FAC0000000001", level.value),
      });
    return Promise.resolve({ ok: true, text: "" });
  };
  return { ...made, level };
}
