import { CHARACTER_OPCODES } from "#wow/areas/character/opcodes";
import {
  parseBarberShopResult,
  parsePlayedTime,
  parsePlayTimeWarning,
  parseRealmSplit,
  parseWhois,
} from "#wow/areas/character/protocol";
import { characterRuntime } from "#wow/areas/character/runtime";
import {
  parseCharDelete,
  parseCharNamedResult,
  splitAppearance,
} from "#wow/areas/character/select";
import type { CharOperationResult } from "#wow/areas/character/store";
import { CharacterStore } from "#wow/areas/character/store";
import { defineArea } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";

function emptyOperation(): Omit<
  CharOperationResult,
  "code" | "kind" | "result"
> {
  return {
    appearance: undefined,
    guid: undefined,
    name: undefined,
    race: undefined,
  };
}

export const characterArea = defineArea({
  name: "character",
  opcodes: CHARACTER_OPCODES,
  eventTypes: [
    "played_time",
    "barber_open",
    "barber_result",
    "operation",
    "whois",
    "play_warning",
    "declined_names",
    "realm_split",
  ],
  store: (deps) => new CharacterStore(deps),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_PLAYED_TIME, (reader) => {
      store.receivePlayedTime(parsePlayedTime(reader));
    });
    wire.on(GameOpcode.SMSG_ENABLE_BARBER_SHOP, () => {
      store.receiveBarberOpen();
    });
    wire.on(GameOpcode.SMSG_BARBER_SHOP_RESULT, (reader) => {
      store.receiveBarberResult(parseBarberShopResult(reader));
    });
    wire.on(GameOpcode.SMSG_CHAR_DELETE, (reader) => {
      const parsed = parseCharDelete(reader);
      store.receiveOperation({
        ...emptyOperation(),
        code: parsed.code,
        kind: "delete",
        result: parsed.result,
      });
    });
    wire.on(GameOpcode.SMSG_CHAR_RENAME, (reader) => {
      const parsed = parseCharNamedResult(reader);
      store.receiveOperation({
        ...emptyOperation(),
        code: parsed.code,
        guid: parsed.guid,
        kind: "rename",
        name: parsed.name,
        result: parsed.result,
      });
    });
    wire.on(GameOpcode.SMSG_CHAR_CUSTOMIZE, (reader) => {
      const parsed = parseCharNamedResult(reader);
      const tail = splitAppearance(parsed.rest, false);
      store.receiveOperation({
        kind: "customize",
        code: parsed.code,
        result: parsed.result,
        guid: parsed.guid,
        name: parsed.name,
        appearance: tail.appearance,
        race: undefined,
      });
    });
    wire.on(GameOpcode.SMSG_CHAR_FACTION_CHANGE, (reader) => {
      const parsed = parseCharNamedResult(reader);
      const tail = splitAppearance(parsed.rest, true);
      store.receiveOperation({
        kind: "faction_change",
        code: parsed.code,
        result: parsed.result,
        guid: parsed.guid,
        name: parsed.name,
        appearance: tail.appearance,
        race: tail.race,
      });
    });
    wire.on(GameOpcode.SMSG_WHOIS, (reader) => {
      store.receiveWhois(parseWhois(reader));
    });
    wire.on(GameOpcode.SMSG_REALM_SPLIT, (reader) => {
      store.receiveRealmSplit(parseRealmSplit(reader));
    });
    wire.on(GameOpcode.SMSG_PLAY_TIME_WARNING, (reader) => {
      store.receivePlayWarning(parsePlayTimeWarning(reader));
    });
  },
  runtime: characterRuntime,
});
