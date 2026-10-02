import { defineArea } from "#wow/areas/contract";
import { GUILDADMIN_OPCODES } from "#wow/areas/guildadmin/opcodes";
import { parseGuildInfo } from "#wow/areas/guildadmin/protocol";
import { guildadminRuntime } from "#wow/areas/guildadmin/runtime";
import { GuildadminStore } from "#wow/areas/guildadmin/store";
import { parseGuildEvent } from "#wow/protocol/guild";
import { GameOpcode } from "#wow/protocol/opcodes";

export const guildadminArea = defineArea({
  name: "guildadmin",
  opcodes: GUILDADMIN_OPCODES,
  eventTypes: ["info", "disbanded"],
  store: () => new GuildadminStore(),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_GUILD_INFO, (r) =>
      store.receiveInfo(parseGuildInfo(r)),
    );
    wire.peek(GameOpcode.SMSG_GUILD_EVENT, (r) =>
      store.receiveGuildEvent(parseGuildEvent(r).eventType),
    );
  },
  runtime: guildadminRuntime,
});
