import { CHARACTER_OPCODES } from "#wow/areas/character/opcodes";
import {
  parseBarberShopResult,
  parsePlayedTime,
  parsePlayTimeWarning,
  parseWhois,
} from "#wow/areas/character/protocol";
import {
  parseCharDelete,
  parseCharNamedResult,
  splitAppearance,
} from "#wow/areas/character/select";
import { characterRuntime } from "#wow/areas/character/runtime";
import { CharacterStore } from "#wow/areas/character/store";
import { defineArea } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";

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
        kind: "delete",
        code: parsed.code,
        result: parsed.result,
        guid: undefined,
        name: undefined,
        appearance: undefined,
        race: undefined,
      });
    });
    wire.on(GameOpcode.SMSG_CHAR_RENAME, (reader) => {
      const parsed = parseCharNamedResult(reader);
      store.receiveOperation({
        kind: "rename",
        code: parsed.code,
        result: parsed.result,
        guid: parsed.guid,
        name: parsed.name,
        appearance: undefined,
        race: undefined,
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
    wire.on(GameOpcode.SMSG_PLAY_TIME_WARNING, (reader) => {
      store.receivePlayWarning(parsePlayTimeWarning(reader));
    });
  },
  runtime: characterRuntime,
});
