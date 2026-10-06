import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildAlterAppearance,
  type BarberResult,
  buildPlayedTime,
  type PlayedTime,
  buildSetSheathed,
  type SheathState,
  buildShowing,
  buildWhois,
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

export function characterRuntime(
  ctx: AreaRuntimeCtx<CharacterEvent>,
  store: CharacterStore,
  _core: CoreStores,
): AreaRuntime<CharacterActs> {
  async function awaitOperation(
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

  async function playedTime(): Promise<PlayedTime> {
    ctx.send(GameOpcode.CMSG_PLAYED_TIME, buildPlayedTime(false));
    const event = await ctx.until((e) => e.type === "played_time", {
      timeoutMs: CHARACTER_REQUEST_MS,
    });
    const played = event.state.played;
    if (!played) throw new Error("played_time_missing");
    return played;
  }

  function setSheathed(state: SheathState): void {
    ctx.send(GameOpcode.CMSG_SET_SHEATHED, buildSetSheathed(state));
  }

  function setHelmShown(shown: boolean): void {
    ctx.send(GameOpcode.CMSG_TOGGLE_HELM, buildShowing(shown));
  }

  function setCloakShown(shown: boolean): void {
    ctx.send(GameOpcode.CMSG_TOGGLE_CLOAK, buildShowing(shown));
  }

  async function styleAtBarber(style: {
    hair: number;
    color: number;
    facialHair: number;
    skinColor: number;
  }): Promise<BarberResult> {
    if (!store.snapshot().barberOpen) throw new Error("not_seated");
    ctx.send(GameOpcode.CMSG_ALTER_APPEARANCE, buildAlterAppearance(style));
    const event = await ctx.until((e) => e.type === "barber_result", {
      timeoutMs: CHARACTER_REQUEST_MS,
    });
    const result = event.state.barberResult;
    if (!result) throw new Error("barber_result_missing");
    return result;
  }

  async function whois(name: string): Promise<string> {
    ctx.send(GameOpcode.CMSG_WHOIS, buildWhois(name));
    const event = await ctx.until((e) => e.type === "whois", {
      timeoutMs: CHARACTER_REQUEST_MS,
    });
    const reply = event.state.whois;
    if (reply === undefined) throw new Error("whois_missing");
    return reply;
  }

  function styled(
    outcome: CharOperationResult,
  ): CharStyleOutcome | CharNameOutcome {
    if (
      outcome.kind === "customize" ||
      outcome.kind === "faction_change"
    ) {
      return {
        result: outcome.result,
        name: outcome.name,
        appearance: outcome.appearance,
        race: outcome.race,
      };
    }
    return { result: outcome.result, name: outcome.name };
  }

  return {
    act: {
      playedTime,
      setSheathed,
      setHelmShown,
      setCloakShown,
      styleAtBarber,
      whois,
      deleteCharacter: async (guid) => {
        ctx.send(GameOpcode.CMSG_CHAR_DELETE, buildCharDelete(guid));
        return (await awaitOperation("delete")).result;
      },
      renameCharacter: async (guid, name) => {
        ctx.send(GameOpcode.CMSG_CHAR_RENAME, buildCharRename(guid, name));
        return styled(await awaitOperation("rename")) as CharNameOutcome;
      },
      customizeCharacter: async (guid, name, appearance) => {
        ctx.send(
          GameOpcode.CMSG_CHAR_CUSTOMIZE,
          buildCharCustomize(guid, name, appearance),
        );
        return styled(await awaitOperation("customize")) as CharStyleOutcome;
      },
      changeFaction: async (guid, name, race, appearance) => {
        ctx.send(
          GameOpcode.CMSG_CHAR_FACTION_CHANGE,
          buildCharFactionChange(guid, name, race, appearance),
        );
        return styled(
          await awaitOperation("faction_change"),
        ) as CharStyleOutcome;
      },
      changeRace: async (guid, name, race, appearance) => {
        ctx.send(
          GameOpcode.CMSG_CHAR_RACE_CHANGE,
          buildCharFactionChange(guid, name, race, appearance),
        );
        return styled(
          await awaitOperation("faction_change"),
        ) as CharStyleOutcome;
      },
    },
    dispose: () => undefined,
  };
}
