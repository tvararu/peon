import {
  type BarberResult,
  buildAlterAppearance,
  buildPlayedTime,
  buildSetSheathed,
  buildShowing,
  buildWhois,
  type PlayedTime,
  type SheathState,
} from "#wow/areas/character/protocol";
import type { CharAppearance } from "#wow/areas/character/select";
import {
  buildCharCustomize,
  buildCharDelete,
  buildCharFactionChange,
  buildCharRename,
} from "#wow/areas/character/select";
import type {
  CharacterEvent,
  CharacterStore,
  CharOperationKind,
  CharOperationResult,
} from "#wow/areas/character/store";
import { styled } from "#wow/areas/character/styled";
import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const CHARACTER_REQUEST_MS = 10_000;

export type CharNameOutcome = {
  result: string;
  name: string | undefined;
};

export type CharStyleOutcome = CharNameOutcome & {
  appearance: CharAppearance | undefined;
  race: number | undefined;
};

export type CharacterActs = {
  playedTime: () => Promise<PlayedTime>;
  setSheathed: (state: SheathState) => void;
  setHelmShown: (shown: boolean) => void;
  setCloakShown: (shown: boolean) => void;
  styleAtBarber: (style: {
    hair: number;
    color: number;
    facialHair: number;
    skinColor: number;
  }) => Promise<BarberResult>;
  whois: (name: string) => Promise<string>;
  deleteCharacter: (guid: bigint) => Promise<string>;
  renameCharacter: (guid: bigint, name: string) => Promise<CharNameOutcome>;
  customizeCharacter: (
    guid: bigint,
    name: string,
    appearance: CharAppearance,
  ) => Promise<CharStyleOutcome>;
  changeFaction: (
    guid: bigint,
    name: string,
    race: number,
    appearance: CharAppearance,
  ) => Promise<CharStyleOutcome>;
  changeRace: (
    guid: bigint,
    name: string,
    race: number,
    appearance: CharAppearance,
  ) => Promise<CharStyleOutcome>;
};

type Wait = {
  ctx: AreaRuntimeCtx<CharacterEvent>;
};

async function awaitOperation(
  { ctx }: Wait,
  kind: CharOperationKind,
): Promise<CharOperationResult> {
  const event = await ctx.until(
    (e) => e.type === "operation" && e.state.operation?.kind === kind,
    { timeoutMs: CHARACTER_REQUEST_MS },
  );
  const outcome = event.state.operation;
  if (!outcome) throw new Error("operation_missing");
  return outcome;
}

async function restyle(
  wait: Wait,
  opcode: number,
  body: Uint8Array,
): Promise<CharStyleOutcome> {
  wait.ctx.send(opcode, body);
  const event = await wait.ctx.until(
    (e) =>
      e.type === "operation" &&
      (e.state.operation?.kind === "customize" ||
        e.state.operation?.kind === "faction_change"),
    { timeoutMs: CHARACTER_REQUEST_MS },
  );
  const outcome = event.state.operation;
  if (!outcome) throw new Error("operation_missing");
  return styled(outcome) as CharStyleOutcome;
}

async function playedOutcome({ ctx }: Wait): Promise<PlayedTime> {
  ctx.send(GameOpcode.CMSG_PLAYED_TIME, buildPlayedTime(false));
  const event = await ctx.until((e) => e.type === "played_time", {
    timeoutMs: CHARACTER_REQUEST_MS,
  });
  const played = event.state.played;
  if (!played) throw new Error("played_time_missing");
  return played;
}

async function barberOutcome({ ctx }: Wait): Promise<BarberResult> {
  const event = await ctx.until((e) => e.type === "barber_result", {
    timeoutMs: CHARACTER_REQUEST_MS,
  });
  const result = event.state.barberResult;
  if (!result) throw new Error("barber_result_missing");
  return result;
}

async function whoisOutcome(
  { ctx }: Wait,
  name: string,
): Promise<string> {
  ctx.send(GameOpcode.CMSG_WHOIS, buildWhois(name));
  const event = await ctx.until((e) => e.type === "whois", {
    timeoutMs: CHARACTER_REQUEST_MS,
  });
  const reply = event.state.whois;
  if (reply === undefined) throw new Error("whois_missing");
  return reply;
}

type Acts = {
  ctx: AreaRuntimeCtx<CharacterEvent>;
  store: CharacterStore;
  wait: Wait;
};

function setSheathed({ ctx }: Acts, state: SheathState): void {
  ctx.send(GameOpcode.CMSG_SET_SHEATHED, buildSetSheathed(state));
}

function setHelmShown({ ctx }: Acts, shown: boolean): void {
  ctx.send(GameOpcode.CMSG_TOGGLE_HELM, buildShowing(shown));
}

function setCloakShown({ ctx }: Acts, shown: boolean): void {
  ctx.send(GameOpcode.CMSG_TOGGLE_CLOAK, buildShowing(shown));
}

async function styleAtBarber(
  { ctx, store, wait }: Acts,
  style: {
    hair: number;
    color: number;
    facialHair: number;
    skinColor: number;
  },
): Promise<BarberResult> {
  if (!store.snapshot().barberOpen) throw new Error("not_seated");
  ctx.send(GameOpcode.CMSG_ALTER_APPEARANCE, buildAlterAppearance(style));
  return await barberOutcome(wait);
}

async function deleteCharacter({ ctx, wait }: Acts, guid: bigint): Promise<string> {
  ctx.send(GameOpcode.CMSG_CHAR_DELETE, buildCharDelete(guid));
  return (await awaitOperation(wait, "delete")).result;
}

async function renameCharacter(
  { ctx, wait }: Acts,
  guid: bigint,
  name: string,
): Promise<CharNameOutcome> {
  ctx.send(GameOpcode.CMSG_CHAR_RENAME, buildCharRename(guid, name));
  return styled(await awaitOperation(wait, "rename")) as CharNameOutcome;
}

function customizeCharacter(
  { wait }: Acts,
  guid: bigint,
  name: string,
  appearance: CharAppearance,
): Promise<CharStyleOutcome> {
  return restyle(
    wait,
    GameOpcode.CMSG_CHAR_CUSTOMIZE,
    buildCharCustomize(guid, name, appearance),
  );
}

type FactionArgs = {
  guid: bigint;
  name: string;
  race: number;
  appearance: CharAppearance;
};

function changeFaction(
  { wait }: Acts,
  args: FactionArgs,
): Promise<CharStyleOutcome> {
  return restyle(
    wait,
    GameOpcode.CMSG_CHAR_FACTION_CHANGE,
    buildCharFactionChange(args.guid, args.name, args.race, args.appearance),
  );
}

function changeRace(
  { wait }: Acts,
  args: FactionArgs,
): Promise<CharStyleOutcome> {
  return restyle(
    wait,
    GameOpcode.CMSG_CHAR_RACE_CHANGE,
    buildCharFactionChange(args.guid, args.name, args.race, args.appearance),
  );
}

export function characterRuntime(
  ctx: AreaRuntimeCtx<CharacterEvent>,
  store: CharacterStore,
  _core: CoreStores,
): AreaRuntime<CharacterActs> {
  const acts: Acts = { ctx, store, wait: { ctx } };

  return {
    act: {
      changeFaction: (guid, name, race, appearance) =>
        changeFaction(acts, { appearance, guid, name, race }),
      changeRace: (guid, name, race, appearance) =>
        changeRace(acts, { appearance, guid, name, race }),
      customizeCharacter: (...args) => customizeCharacter(acts, ...args),
      deleteCharacter: (...args) => deleteCharacter(acts, ...args),
      playedTime: () => playedOutcome(acts.wait),
      renameCharacter: (...args) => renameCharacter(acts, ...args),
      setCloakShown: (...args) => setCloakShown(acts, ...args),
      setHelmShown: (...args) => setHelmShown(acts, ...args),
      setSheathed: (...args) => setSheathed(acts, ...args),
      styleAtBarber: (...args) => styleAtBarber(acts, ...args),
      whois: (...args) => whoisOutcome(acts.wait, ...args),
    },
    dispose: () => undefined,
  };
}
