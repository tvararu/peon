import type { AuthResult, ClientConfig, WorldHandle } from "@peon/core";
import type { CharCreateSpec, createCharacter } from "@peon/core/session";
import type { RealmService } from "#factory/realm-service";
import type { Run, SoapResult } from "#factory/soap-copy";
import {
  type CreatePreset,
  isCreatePreset,
  type Preset,
  type PresetSpec,
  presetSpecs,
  type StageStep,
  templateFor,
} from "#factory/soap-presets";

export type CreateFn = typeof createCharacter;
export type LoginFn = (
  config: ClientConfig,
  auth: AuthResult,
) => Promise<WorldHandle>;
export type ConsoleFn = (
  accounts: string[],
  command: string,
) => Promise<SoapResult>;
export type Names = { account: string; character: string };

export type ServiceChar = Pick<RealmService, "char">;
export type CreateDeps = {
  run: Run;
  copy: (template: string, names: Names) => Promise<unknown>;
  create: CreateFn;
  login: LoginFn;
  console: ConsoleFn;
  auth: (config: ClientConfig) => Promise<AuthResult>;
  createConfig: (names: Names) => ClientConfig;
  loginConfig: (account: string) => Promise<ClientConfig>;
  service: ServiceChar;
  names: Names;
  sleep: (ms: number) => Promise<unknown>;
  templateEnv: Record<string, string>;
};
const pinfoTries = 100;
const pinfoPollMs = 50;
const onlineTries = 120;
const demoted = /GMLevel:\s*0\b/;
const skillBase = 636;
const skillSlots = 384;
const skillStride = 3;

function hasSkill(handle: WorldHandle, guid: bigint, skill: number): boolean {
  const fields = handle.getEntity(guid)?.rawFields;
  if (!fields) return false;
  for (const [offset, value] of fields) {
    if (
      offset >= skillBase &&
      offset < skillBase + skillSlots &&
      (offset - skillBase) % skillStride === 0 &&
      value % 65_536 === skill
    )
      return true;
  }
  return false;
}

export async function learnOnline(
  account: string,
  spells: readonly number[],
  deps: Pick<
    CreateDeps,
    "login" | "console" | "loginConfig" | "auth" | "sleep"
  >,
): Promise<void> {
  const config = await deps.loginConfig(account);
  const handle = await deps.login(config, await deps.auth(config));
  try {
    const self = handle.getControlState().selfGuid;
    for (const spell of spells) {
      const res = await deps.console(
        [account],
        `player learn ${config.character} ${spell}`,
      );
      if (!res.ok) throw new Error(`player learn ${spell}: ${res.text}`);
      let seen = false;
      for (let i = 0; i < onlineTries; i++) {
        if (hasSkill(handle, self, 356)) {
          seen = true;
          break;
        }
        await deps.sleep(pinfoPollMs);
      }
      if (!seen)
        throw new Error(`skill 356 never appeared after learning ${spell}`);
    }
  } finally {
    handle.logout();
    await handle.closed;
  }
}

export async function stagePreset(
  character: string,
  account: string,
  stage: readonly StageStep[],
  deps: Pick<
    CreateDeps,
    "service" | "login" | "console" | "loginConfig" | "auth" | "sleep"
  >,
): Promise<void> {
  for (const step of stage) {
    if ("online" in step) await learnOnline(account, step.online.learn, deps);
    else await deps.service.char(character, step.endpoint, step.body);
  }
}

export function specOf(preset: Preset): CreatePreset {
  const spec = presetSpecs[preset];
  if (!isCreatePreset(spec)) throw new Error(`preset ${preset} is not created`);
  return spec;
}

const authUnknownAccount = /status 0x4/;
const authRetryDelayMs = 30_000;
const authRetryAttempts = 10;

async function authForCreate(
  config: ClientConfig,
  deps: Pick<CreateDeps, "auth" | "sleep">,
): Promise<AuthResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await deps.auth(config);
    } catch (err) {
      if (
        !authUnknownAccount.test(String(err)) ||
        attempt + 1 >= authRetryAttempts
      )
        throw err;
      await deps.sleep(authRetryDelayMs);
    }
  }
}

export async function createByProtocol(
  preset: Preset,
  deps: CreateDeps,
): Promise<void> {
  const spec: PresetSpec = presetSpecs[preset];
  const { account, character } = deps.names;
  if (!isCreatePreset(spec)) {
    if (!spec.stage) throw new Error(`preset ${preset} is not created`);
    await deps.copy(templateFor(preset, deps.templateEnv), deps.names);
    await waitForCharacter(deps.run, deps.names, deps.sleep);
    await stagePreset(character, account, spec.stage, deps);
    return;
  }
  const createSpec: CharCreateSpec = { ...spec.create, name: character };
  const config = deps.createConfig(deps.names);
  if (spec.gmLevelForCreate === 1) {
    await deps.run(`account set gmlevel ${account} 1 -1`);
    try {
      await deps.create(config, await authForCreate(config, deps), createSpec);
    } finally {
      await demote(deps.run, deps.names, deps.sleep);
    }
  } else {
    await deps.create(config, await authForCreate(config, deps), createSpec);
  }
  await waitForCharacter(deps.run, deps.names, deps.sleep);
  await stagePreset(character, account, spec.stage, deps);
}

async function waitForCharacter(
  run: Run,
  { account, character }: Names,
  sleep: CreateDeps["sleep"],
): Promise<void> {
  let text = "";
  for (let i = 0; i < pinfoTries; i++) {
    text = (await run(`pinfo ${character}`)).text;
    if (text.includes(account)) return;
    await sleep(pinfoPollMs);
  }
  throw new Error(`pinfo ${character}: ${account} never appeared: ${text}`);
}

async function demote(
  run: Run,
  { account, character }: Names,
  sleep: CreateDeps["sleep"],
): Promise<void> {
  await run(`account set gmlevel ${account} 0 -1`);
  for (let i = 0; i < pinfoTries; i++) {
    const text = (await run(`pinfo ${character}`)).text;
    if (demoted.test(text)) return;
    await sleep(pinfoPollMs);
  }
  throw new Error(`demotion of ${account} could not be confirmed`);
}

export type { CharEndpoint, Json } from "#factory/realm-service";
