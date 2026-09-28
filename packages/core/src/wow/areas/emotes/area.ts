import { defineArea } from "#wow/areas/contract";
import { EMOTES_OPCODES } from "#wow/areas/emotes/opcodes";
import { parseEmote, parseTextEmote } from "#wow/areas/emotes/protocol";
import { emotesRuntime } from "#wow/areas/emotes/runtime";
import { EmoteStore } from "#wow/areas/emotes/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const emotesArea = defineArea({
  name: "emotes",
  opcodes: EMOTES_OPCODES,
  eventTypes: ["emote", "text_emote"],
  store: (deps, core) => new EmoteStore(deps, core),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_EMOTE, (r) => store.emote(parseEmote(r)));
    wire.on(GameOpcode.SMSG_TEXT_EMOTE, (r) =>
      store.textEmote(parseTextEmote(r)),
    );
  },
  runtime: emotesRuntime,
});
