import type { Mock } from "bun:test";
import { describe, expect, jest, test } from "bun:test";
import type { AreaEventOf, AreaState, PartyMember } from "@peon/core";
import { elapse, withFakeTimers } from "@peon/core/test-support/fake-time";
import {
  partyMember,
  partyState,
} from "@peon/core/test-support/party-fixtures";
import { groupTool } from "#harness/areas/raid/tool";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { runTool } from "#test-support/tool-harness";

type RaidState = AreaState<"raid">;
type RaidGroup = NonNullable<RaidState["group"]>;
type Member = PartyMember;
type RaidEvent = AreaEventOf<"raid">;
type RaidChange = Extract<RaidEvent, { type: "group_list" }>["changes"][number];

const SELF = 0x0764n;
const TOM = 0x100n;
const ANN = 0x200n;
const ASSISTANT = 0x01;
const WAIT_MS = 3000;

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
    kind: "raid",
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
  inGroup?: boolean;
};

async function world(setup: Setup = {}) {
  const t = await createTestRuntime();
  const members = setup.members ?? [tom(), ann()];
  const inGroup = setup.inGroup ?? true;
  const control = t.handle.getControlState();
  (t.handle.getControlState as Mock<() => typeof control>).mockReturnValue({
    ...control,
    selfGuid: SELF,
  });
  const party = inGroup
    ? partyState({ inGroup: true, leader: "Tom", members })
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
    stats: new Map(),
  };
  jest.spyOn(t.handle.raid, "state").mockReturnValue(groupState);
  const act = {
    convert: jest.spyOn(t.handle.raid.act, "convertToRaid"),
    loot: jest.spyOn(t.handle.looting.act, "setLootMethod"),
    mainAssist: jest.spyOn(t.handle.raid.act, "setMainAssist"),
    mainTank: jest.spyOn(t.handle.raid.act, "setMainTank"),
    move: jest.spyOn(t.handle.raid.act, "moveToSubgroup"),
    promote: jest.spyOn(t.handle.raid.act, "setAssistant"),
    swap: jest.spyOn(t.handle.raid.act, "swapSubgroups"),
  };
  for (const spy of Object.values(act)) spy.mockImplementation(() => undefined);
  const emit = (event: RaidEvent) => t.handle.triggerAreaEvent("raid", event);
  const changed = (...changes: readonly RaidChange[]) =>
    emit({ changes, group: raidGroup(), type: "group_list" });
  return { ...t, act, changed, emit, tool: groupTool.definition(t.rt) };
}

type SpyBag = {
  act: Record<string, Mock<(...args: never[]) => unknown>>;
};

function sent(t: SpyBag): number {
  return Object.values(t.act).reduce(
    (total, spy) => total + spy.mock.calls.length,
    0,
  );
}

const AS_ASSISTANT = {
  self: { flags: ASSISTANT, roles: 0, subgroup: 0 },
};

describe("group tool loot_rules", () => {
  test("refuses without the lead, out of a group, in a finder group", async () => {
    const follower = await world({
      group: { leader: TOM, ...AS_ASSISTANT },
    });
    expect(
      (await runTool(follower.tool, { do: "loot_rules", what: "group_loot" }))
        .text,
    ).toContain("REFUSED not_leader");
    const finder = await world({
      group: { dungeonFinder: { dungeonId: 1, status: 1 } },
    });
    expect(
      (await runTool(finder.tool, { do: "loot_rules", what: "group_loot" }))
        .text,
    ).toContain("REFUSED lfg_group");
    const none = await world({ inGroup: false });
    expect(
      (await runTool(none.tool, { do: "loot_rules", what: "group_loot" })).text,
    ).toContain("REFUSED not_in_group");
    for (const spy of [follower, finder, none]) expect(sent(spy)).toBe(0);
  });

  test("refuses an unknown method, quality or master", async () => {
    const t = await world();
    expect(
      (await runTool(t.tool, { do: "loot_rules", what: "greedy" })).text,
    ).toContain("REFUSED bad_loot_method");
    expect((await runTool(t.tool, { do: "loot_rules" })).text).toContain(
      "REFUSED bad_loot_method",
    );
    expect(
      (
        await runTool(t.tool, {
          do: "loot_rules",
          to: "Zed",
          what: "master_loot",
        })
      ).text,
    ).toContain("REFUSED not_a_member");
    expect(sent(t)).toBe(0);
  });

  test("sets the method and quality and settles on a loot change", async () => {
    const t = await world();
    t.act.loot.mockImplementation(() => t.changed({ kind: "loot" }));
    const out = await runTool(t.tool, {
      do: "loot_rules",
      quality: "rare",
      what: "group_loot",
    });
    expect(t.act.loot).toHaveBeenCalledWith({
      master: "",
      method: "group_loot",
      threshold: "rare",
    });
    expect(out.text).toContain("DONE");
  });

  test("master loot names a member, or the character itself when empty", async () => {
    const t = await world();
    t.act.loot.mockImplementation(() => t.changed({ kind: "loot" }));
    await runTool(t.tool, { do: "loot_rules", to: "ann", what: "master_loot" });
    expect(t.act.loot).toHaveBeenLastCalledWith({
      master: "Ann",
      method: "master_loot",
      threshold: "uncommon",
    });
    await runTool(t.tool, { do: "loot_rules", what: "master_loot" });
    expect(t.act.loot).toHaveBeenLastCalledWith({
      master: "@self",
      method: "master_loot",
      threshold: "uncommon",
    });
  });

  test("keeps the current quality when none is given", async () => {
    const t = await world({
      group: { loot: { master: 0n, method: 3, threshold: 3 } },
    });
    t.act.loot.mockImplementation(() => t.changed({ kind: "loot" }));
    await runTool(t.tool, { do: "loot_rules", what: "round_robin" });
    expect(t.act.loot).toHaveBeenCalledWith({
      master: "",
      method: "round_robin",
      threshold: "rare",
    });
  });

  test("rules already in force send nothing", async () => {
    const t = await world({
      group: { loot: { master: 0n, method: 3, threshold: 2 } },
    });
    const out = await runTool(t.tool, { do: "loot_rules", what: "group_loot" });
    expect(out.text).toContain("DONE");
    expect(sent(t)).toBe(0);
  });

  test("stays unconfirmed without a loot change", async () => {
    const t = await world();
    t.act.loot.mockImplementation(() => {
      t.changed({ kind: "converted" });
      return elapse(WAIT_MS);
    });
    const out = await withFakeTimers(() =>
      runTool(t.tool, { do: "loot_rules", what: "group_loot" }),
    );
    expect(out.text).toContain("UNCONFIRMED");
  });
});
