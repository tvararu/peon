import { describe, expect, spyOn, test } from "bun:test";
import type { GuildRoster } from "@peon/core";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/guildadmin-roster";

function context(): FlowContext & { handle: MockHandle } {
  const handle = createMockHandle();
  return { args: {}, handle, settle: settleWithin(50) };
}

describe("guildadmin-roster flow", () => {
  test("returns undefined on a guildless character", async () => {
    const ctx = context();
    const roster = spyOn(ctx.handle, "requestGuildRoster").mockResolvedValue(
      undefined,
    );
    const result = (await flow.run(ctx)) as { roster?: unknown };
    expect(roster).toHaveBeenCalledTimes(1);
    expect(result.roster).toBeUndefined();
  });

  test("returns the staged guild roster with rank names and members", async () => {
    const ctx = context();
    const staged: GuildRoster = {
      guildInfo: "info",
      guildName: "FacABCDEF0123",
      members: [
        {
          area: 1,
          gender: 0,
          guid: 1n,
          level: 80,
          name: "FacABCDEF0123",
          officerNote: "",
          playerClass: 1,
          publicNote: "",
          rankIndex: 0,
          status: 1,
          timeOffline: 0,
        },
      ],
      motd: "motd",
      rankNames: ["Guild Master", "Member"],
    };
    spyOn(ctx.handle, "requestGuildRoster").mockResolvedValue(staged);
    const result = (await flow.run(ctx)) as unknown as { roster: GuildRoster };
    expect(result.roster.guildName).toBe("FacABCDEF0123");
    expect(result.roster.rankNames).toStrictEqual(["Guild Master", "Member"]);
    expect(result.roster.members).toHaveLength(1);
  });
});
