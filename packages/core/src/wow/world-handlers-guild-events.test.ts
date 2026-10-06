import { describe, expect, test } from "bun:test";
import {
  guildadminCommandResultBody,
  guildadminEventBody,
} from "#test-support/areas/guildadmin";
import type { GuildEvent } from "#wow/client";
import { PacketReader } from "#wow/protocol/packet";
import type { WorldConn } from "#wow/world-conn";
import { createWorldEvents } from "#wow/world-events";
import {
  handleGuildCommandResult,
  handleGuildEvent,
} from "#wow/world-handlers-guild";

function connWith(listener?: (event: GuildEvent) => void): WorldConn {
  const events = createWorldEvents();
  if (listener) events.guild.subscribe(listener);
  return { events } as unknown as WorldConn;
}

function eventOf(code: number, params: string[]): GuildEvent {
  let result!: GuildEvent;
  const conn = connWith((e: GuildEvent) => {
    result = e;
  });
  handleGuildEvent(
    conn,
    new PacketReader(guildadminEventBody({ code, params })),
  );
  return result;
}

describe("handleGuildEvent bank and rank codes", () => {
  test("rank update keeps the rank id, name and rank count", () => {
    const e = eventOf(10, ["2", "Veteran", "5"]);
    expect(e).toEqual({
      type: "rank_updated",
      rankId: 2,
      name: "Veteran",
      rankCount: 5,
    });
  });

  test("rank deletion keeps the rank count", () => {
    expect(eventOf(11, ["4"])).toEqual({ type: "rank_deleted", rankCount: 4 });
  });

  test("bank tab purchase has no parameters", () => {
    expect(eventOf(15, [])).toEqual({ type: "bank_tab_purchased" });
  });

  test("bank tab update keeps the tab id, name and icon", () => {
    const e = eventOf(16, ["1", "Consumables", "INV_Misc_Bag_07"]);
    expect(e).toEqual({
      type: "bank_tab_updated",
      tabId: 1,
      name: "Consumables",
      icon: "INV_Misc_Bag_07",
    });
  });

  test("bank money set decodes the 16-hex-digit balance to 3200", () => {
    const e = eventOf(17, ["0000000000000C80"]);
    expect(e).toEqual({ type: "bank_money", balance: 3200n });
  });

  test("bank tab and money update is a bank reset", () => {
    expect(eventOf(18, [])).toEqual({ type: "bank_reset" });
  });
});

describe("handleGuildCommandResult success", () => {
  test("emits a command_result event for result 0", () => {
    let result!: GuildEvent;
    const conn = connWith((e: GuildEvent) => {
      result = e;
    });
    handleGuildCommandResult(
      conn,
      new PacketReader(
        guildadminCommandResultBody({ command: 1, name: "Thrall", result: 0 }),
      ),
    );
    expect(result).toEqual({
      type: "command_result",
      command: 1,
      name: "Thrall",
      result: 0,
    });
  });
});
