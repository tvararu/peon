import type { Mock } from "bun:test";
import { describe, expect, jest, test } from "bun:test";
import { validateToolArguments } from "@earendil-works/pi-ai";
import type { AreaState, PartyMember } from "@peon/core";
import { elapse, withFakeTimers } from "@peon/core/test-support/fake-time";
import {
  partyMember,
  partyState,
} from "@peon/core/test-support/party-fixtures";
import { groupSpec, groupTool } from "#harness/areas/raid/tool";
import type { GroupAfter } from "#harness/areas/raid/tool-shared";
import { groupParams } from "#harness/areas/raid/tool-shared";
import { toolCtx } from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { runTool } from "#test-support/tool-harness";

type RaidState = AreaState<"raid">;
type RaidGroup = NonNullable<RaidState["group"]>;
type Member = PartyMember;

const SELF = 0x0764n;
const TOM = 0x100n;
const ANN = 0x200n;
const NOW = 1_000_000;
const ONLINE_STATUS = 0x01;
const DEAD_STATUS = 0x04;
const GHOST_STATUS = 0x08;
const OFFLINE_STATUS = 0x00;

function tom(over: Partial<Member> = {}): Member {
  return partyMember({ guid: TOM, name: "Tom", ...over });
}

function ann(over: Partial<Member> = {}): Member {
  return partyMember({ guid: ANN, name: "Ann", subgroup: 1, ...over });
}

function raidGroup(over: Partial<RaidGroup> = {}): RaidGroup {
  return {
    battleground: false,
    counter: 1,
    difficulty: undefined,
    dungeonFinder: undefined,
    groupGuid: 1n,
    kind: "party",
    leader: SELF,
    loot: undefined,
    members: [],
    self: { flags: 0, roles: 0, subgroup: 0 },
    ...over,
  };
}

type Setup = {
  members?: Member[];
  group?: Partial<RaidGroup>;
  party?: Parameters<typeof partyState>[0];
  stats?: RaidState["stats"];
  inGroup?: boolean;
};

async function world(setup: Setup = {}) {
  const t = await createTestRuntime();
  const members = setup.members ?? [tom()];
  const inGroup = setup.inGroup ?? true;
  t.clock.set(NOW);
  const control = t.handle.getControlState();
  (t.handle.getControlState as Mock<() => typeof control>).mockReturnValue({
    ...control,
    selfGuid: SELF,
  });
  const party = inGroup
    ? partyState({
        inGroup: true,
        leader: "Tom",
        members,
        ...setup.party,
      })
    : partyState();
  (t.handle.getPartyState as Mock<() => typeof party>).mockReturnValue(party);
  const groupState: RaidState = {
    group: inGroup
      ? raidGroup({
          members: members.map((member) => ({
            flags: member.flags,
            guid: member.guid,
            name: member.name,
            roles: member.roles,
            status: member.status,
            subgroup: member.subgroup,
          })),
          ...setup.group,
        })
      : undefined,
    marks: Array.from({ length: 8 }, () => 0n),
    stats: setup.stats ?? new Map(),
  };
  jest.spyOn(t.handle.raid, "state").mockReturnValue(groupState);
  const uninvite = jest.fn();
  jest.spyOn(t.handle.raid.act, "uninviteGuid").mockImplementation(uninvite);
  return { ...t, tool: groupTool.definition(t.rt), uninvite };
}

describe("group tool", () => {
  test("minimalArgs passes the parameters schema", () => {
    expect(
      validateToolArguments(
        { description: "probe", name: "probe", parameters: groupParams },
        {
          arguments: groupSpec.minimalArgs,
          id: "c1",
          name: "probe",
          type: "toolCall",
        },
      ),
    ).toEqual(groupSpec.minimalArgs);
  });

  describe("status", () => {
    test("outside a group it says so and sends nothing", async () => {
      const t = await world({ inGroup: false });
      const out = await runTool(t.tool, {});
      expect(out.text).toContain("DONE");
      expect(out.text).toContain("not in a group");
      expect(t.uninvite).not.toHaveBeenCalled();
      expect(t.handle.setLeader).not.toHaveBeenCalled();
    });

    test("lists name, subgroup, roles, vitals and life per member", async () => {
      const t = await world({
        group: { kind: "raid", self: { flags: 1, roles: 0, subgroup: 0 } },
        members: [
          tom({
            flags: 3,
            health: 80,
            maxHealth: 100,
            maxPower: 50,
            power: 20,
            powerType: 0,
            statsAt: NOW,
          }),
          ann({ status: ONLINE_STATUS + DEAD_STATUS }),
          partyMember({
            guid: 0x300n,
            name: "Bea",
            status: ONLINE_STATUS + GHOST_STATUS,
          }),
          partyMember({
            guid: 0x400n,
            name: "Cy",
            online: false,
            status: OFFLINE_STATUS,
          }),
        ],
      });
      const out = await runTool(t.tool, { do: "status" });
      const rows = out.text.split("\n");
      const row = (name: string) => rows.find((line) => line.includes(name));
      expect(out.text).toContain("DONE");
      expect(out.text).toContain("raid");
      expect(row("Tom")).toMatch(/group 1/);
      expect(row("Tom")).toMatch(/assistant/);
      expect(row("Tom")).toMatch(/main tank/);
      expect(row("Tom")).toMatch(/HP 80\/100/);
      expect(row("Tom")).toMatch(/mana 20\/50/);
      expect(row("Ann")).toMatch(/group 2/);
      expect(row("Ann")).toMatch(/dead/);
      expect(row("Bea")).toMatch(/ghost/);
      expect(row("Cy")).toMatch(/offline/);
      expect(t.uninvite).not.toHaveBeenCalled();
    });

    test("names the leader and says whether Peon leads", async () => {
      const mine = await world();
      const mineOut = await runTool(mine.tool, {});
      expect(mineOut.text).toMatch(/You lead/i);
      const theirs = await world({
        group: { leader: TOM, self: { flags: 1, roles: 0, subgroup: 0 } },
        members: [tom(), ann({ flags: 0 })],
        party: { leader: "Tom" },
      });
      const theirOut = await runTool(theirs.tool, {});
      expect(theirOut.text).toMatch(/Tom leads/);
      expect(theirOut.text).toMatch(/you assist/);
    });

    test("stale party stats say how long ago they were seen", async () => {
      const t = await world({
        members: [
          tom({
            health: 10,
            maxHealth: 100,
            source: "party_stats",
            statsAt: NOW - 42_000,
          }),
          ann({
            health: 90,
            maxHealth: 100,
            source: "unit",
            statsAt: NOW,
          }),
        ],
      });
      const out = await runTool(t.tool, {});
      const rows = out.text.split("\n");
      expect(rows.find((line) => line.includes("Tom"))).toMatch(
        /last seen 42 s ago/,
      );
      expect(rows.find((line) => line.includes("Ann"))).not.toMatch(
        /last seen/,
      );
    });

    test("the raid stats say a member died even before the roster does", async () => {
      const t = await world({
        members: [tom({ status: 1 })],
        stats: new Map([
          [
            TOM,
            {
              afk: false,
              auras: [],
              dead: true,
              dnd: false,
              ghost: false,
              guid: TOM,
              hp: 0,
              level: 10,
              maxHp: 100,
              maxPower: 0,
              name: "Tom",
              online: true,
              pet: null,
              position: { x: 0, y: 0 },
              power: 0,
              powerType: 0,
              pvp: false,
              pvpFfa: false,
              seenAt: NOW,
              status: 5,
              vehicleSeat: 0,
              zone: 1,
            },
          ],
        ]),
      });
      const out = await runTool(t.tool, {});
      expect(out.text).toMatch(/Tom.*dead/);
    });

    test("an offline member with remembered stats is still offline", async () => {
      const cy = 0x400n;
      const t = await world({
        members: [
          partyMember({
            guid: cy,
            name: "Cy",
            online: false,
            status: OFFLINE_STATUS,
          }),
        ],
        stats: new Map([
          [
            cy,
            {
              afk: false,
              auras: [],
              dead: false,
              dnd: false,
              ghost: false,
              guid: cy,
              hp: 100,
              level: 10,
              maxHp: 100,
              maxPower: 0,
              name: "Cy",
              online: true,
              pet: null,
              position: { x: 0, y: 0 },
              power: 0,
              powerType: 0,
              pvp: false,
              pvpFfa: false,
              seenAt: NOW,
              status: 1,
              vehicleSeat: 0,
              zone: 1,
            },
          ],
        ]),
      });
      const out = await runTool(t.tool, {});
      expect(out.text).toMatch(/Cy.*offline/);
      expect(out.text).not.toMatch(/Cy.*alive/);
    });

    test("the lead text counts Peon in the group size", async () => {
      const t = await world({ members: [tom()] });
      const out = await runTool(t.tool, {});
      expect(out.text).toMatch(/lead the (party|raid) of 2/);
    });

    test("a full raid hits the line cap and a named status reaches the hidden member", async () => {
      const members = Array.from({ length: 39 }, (_, index) =>
        partyMember({
          guid: BigInt(0x10_00 + index),
          name: `Raider${index + 1}`,
          subgroup: Math.floor(index / 5),
        }),
      );
      const t = await world({ group: { kind: "raid" }, members });
      const all = await runTool(t.tool, {});
      expect(all.text.split("\n").length).toBeLessThanOrEqual(24);
      expect(all.text).toMatch(/\+\d+ more/);
      expect(all.text).not.toContain("Raider39");
      const one = await runTool(t.tool, { to: "Raider39" });
      expect(one.text).toContain("Raider39");
      expect(one.text).not.toContain("Raider1 ");
      const none = await runTool(t.tool, { to: "Nobody" });
      expect(none.text).toContain("REFUSED");
      expect(none.text).toContain("Nobody");
    });
  });

  describe("kick", () => {
    test("refuses out of a group", async () => {
      const t = await world({ inGroup: false });
      const out = await runTool(t.tool, { do: "kick", to: "Tom" });
      expect(out.text).toContain("REFUSED not_in_group");
      expect(t.uninvite).not.toHaveBeenCalled();
    });

    test("needs a name", async () => {
      const t = await world();
      const out = await runTool(t.tool, { do: "kick" });
      expect(out.text).toContain("REFUSED");
      expect(out.text).toMatch(/name/);
      expect(t.uninvite).not.toHaveBeenCalled();
    });

    test("refuses a name outside the roster and lists the members", async () => {
      const t = await world({ members: [tom(), ann()] });
      const out = await runTool(t.tool, { do: "kick", to: "Zed" });
      expect(out.text).toContain("REFUSED not_a_member");
      expect(out.text).toContain("Tom");
      expect(out.text).toContain("Ann");
      expect(t.uninvite).not.toHaveBeenCalled();
    });

    test("refuses when Peon neither leads nor assists", async () => {
      const t = await world({
        group: { leader: TOM },
        members: [tom(), ann()],
      });
      const out = await runTool(t.tool, { do: "kick", to: "Ann" });
      expect(out.text).toContain("REFUSED not_leader");
      expect(t.uninvite).not.toHaveBeenCalled();
    });

    test("refuses to kick the leader", async () => {
      const t = await world({
        group: { leader: TOM, self: { flags: 1, roles: 0, subgroup: 0 } },
        members: [tom(), ann()],
      });
      const out = await runTool(t.tool, { do: "kick", to: "Tom" });
      expect(out.text).toContain("REFUSED target_is_leader");
      expect(t.uninvite).not.toHaveBeenCalled();
    });

    test("refuses in a dungeon-finder group", async () => {
      const t = await world({
        group: { dungeonFinder: { dungeonId: 1, status: 1 } },
        members: [tom(), ann()],
      });
      const out = await runTool(t.tool, { do: "kick", to: "Ann" });
      expect(out.text).toContain("REFUSED lfg_vote_kick");
      expect(t.uninvite).not.toHaveBeenCalled();
    });

    test("an assistant may kick a member", async () => {
      const t = await world({
        group: { leader: TOM, self: { flags: 1, roles: 0, subgroup: 0 } },
        members: [tom(), ann()],
      });
      t.uninvite.mockImplementation(() => elapse(3000));
      const out = await withFakeTimers(() =>
        runTool(t.tool, { do: "kick", to: "ann" }),
      );
      expect(t.uninvite).toHaveBeenCalledWith("Ann", "");
      expect(out.text).toContain("UNCONFIRMED no_answer");
      expect(out.text).toContain("Ann");
    });

    test("sends the reason and is done when the member leaves the roster", async () => {
      const t = await world({ members: [tom(), ann()] });
      t.uninvite.mockImplementation(() =>
        t.handle.triggerAreaEvent("raid", {
          changes: [{ kind: "left", name: "Ann" }],
          group: raidGroup(),
          type: "group_list",
        }),
      );
      const out = await runTool(t.tool, {
        do: "kick",
        text: "test",
        to: "ann",
      });
      expect(t.uninvite).toHaveBeenCalledWith("Ann", "test");
      expect(out.text).toContain("DONE");
      expect(out.text).toContain("Ann");
      expect(out.details.result.after).toMatchObject({
        confirmed: true,
        do: "kick",
        to: "Ann",
      });
    });

    test("a left change for someone else does not confirm", async () => {
      const t = await world({ members: [tom(), ann()] });
      t.uninvite.mockImplementation(() => {
        t.handle.triggerAreaEvent("raid", {
          changes: [{ kind: "left", name: "Tom" }],
          group: raidGroup(),
          type: "group_list",
        });
        return elapse(3000);
      });
      const out = await withFakeTimers(() =>
        runTool(t.tool, { do: "kick", to: "Ann" }),
      );
      expect(out.text).toContain("UNCONFIRMED");
    });

    test("a party of two with Peon leading disbands on a kick", async () => {
      const t = await world({ members: [ann()] });
      t.uninvite.mockImplementation(() =>
        t.handle.triggerAreaEvent("raid", { type: "disbanded" }),
      );
      const out = await runTool(t.tool, { do: "kick", to: "Ann" });
      expect(out.text).toContain("DONE");
      expect(out.text).toMatch(/disband/i);
    });

    test("fails when the server refuses", async () => {
      const t = await world({ members: [tom(), ann()] });
      t.uninvite.mockImplementation(() =>
        t.handle.triggerAreaEvent("raid", {
          member: "Ann",
          operation: "uninvite",
          result: "not_leader",
          type: "command_result",
        }),
      );
      const out = await runTool(t.tool, { do: "kick", to: "Ann" });
      expect(out.text).toContain("FAILED not_leader");
    });

    test("an ok command result is not a refusal", async () => {
      const t = await world({ members: [tom(), ann()] });
      t.uninvite.mockImplementation(() => {
        t.handle.triggerAreaEvent("raid", {
          member: "Ann",
          operation: "uninvite",
          result: "ok",
          type: "command_result",
        });
        t.handle.triggerAreaEvent("raid", {
          changes: [{ kind: "left", name: "Ann" }],
          group: raidGroup(),
          type: "group_list",
        });
      });
      const out = await runTool(t.tool, { do: "kick", to: "Ann" });
      expect(out.text).toContain("DONE");
    });

    test("a send that throws rejects the call", async () => {
      const t = await world({ members: [tom(), ann()] });
      t.uninvite.mockImplementation(() => {
        throw new Error("not in your party: Ann");
      });
      const out = await runTool(t.tool, { do: "kick", to: "Ann" });
      expect(out.text).toContain("FAILED");
    });

    test("an aborted signal ends the wait", async () => {
      const t = await world({ members: [tom(), ann()] });
      const abort = new AbortController();
      abort.abort(new Error("cancelled"));
      await expect(
        groupSpec.run(
          { do: "kick", to: "Ann" },
          toolCtx<GroupAfter>(t, abort.signal),
        ),
      ).rejects.toThrow("cancelled");
      expect(t.uninvite).not.toHaveBeenCalled();
    });
  });
});
