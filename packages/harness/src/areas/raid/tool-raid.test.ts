import type { Mock } from "bun:test";
import { describe, expect, jest, test } from "bun:test";
import { validateToolArguments } from "@earendil-works/pi-ai";
import type { AreaEventOf, AreaState, PartyMember } from "@peon/core";
import { elapse, withFakeTimers } from "@peon/core/test-support/fake-time";
import {
  partyMember,
  partyState,
} from "@peon/core/test-support/party-fixtures";
import { groupSpec, groupTool } from "#harness/areas/raid/tool";
import { type GroupAfter, groupParams } from "#harness/areas/raid/tool-shared";
import { toolCtx } from "#test-support/ops-fixtures";
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
    marks: Array.from({ length: 8 }, () => 0n),
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

describe("group tool raid", () => {
  test("the raid and loot do values pass the parameters schema", () => {
    const calls: Record<string, string | number>[] = [
      { do: "raid" },
      { do: "move", group: 2, to: "Tom" },
      { do: "swap", to: "Tom", with: "Ann" },
      { do: "promote", to: "Tom", what: "assistant" },
      { do: "loot_rules", quality: "rare", what: "master_loot" },
    ];
    for (const args of calls) {
      expect(
        validateToolArguments(
          { description: "probe", name: "probe", parameters: groupParams },
          { arguments: args, id: "c1", name: "probe", type: "toolCall" },
        ),
      ).toEqual(args);
    }
  });

  test("refuses out of a group, when not leader, alone, in a finder group or already a raid", async () => {
    const out = await world({ inGroup: false });
    expect((await runTool(out.tool, { do: "raid" })).text).toContain(
      "REFUSED not_in_group",
    );
    expect(sent(out)).toBe(0);
    const follower = await world({
      group: { kind: "party", leader: TOM, ...AS_ASSISTANT },
    });
    expect((await runTool(follower.tool, { do: "raid" })).text).toContain(
      "REFUSED not_leader",
    );
    expect(sent(follower)).toBe(0);
    const alone = await world({ group: { kind: "party" }, members: [] });
    expect((await runTool(alone.tool, { do: "raid" })).text).toContain(
      "REFUSED too_few_members",
    );
    expect(sent(alone)).toBe(0);
    const finder = await world({
      group: { dungeonFinder: { dungeonId: 1, status: 1 }, kind: "party" },
    });
    expect((await runTool(finder.tool, { do: "raid" })).text).toContain(
      "REFUSED lfg_group",
    );
    expect(sent(finder)).toBe(0);
    const done = await world();
    expect((await runTool(done.tool, { do: "raid" })).text).toContain(
      "REFUSED already_raid",
    );
    expect(sent(done)).toBe(0);
  });

  test("is done when the group converts", async () => {
    const t = await world({ group: { kind: "party" } });
    t.act.convert.mockImplementation(() => t.changed({ kind: "converted" }));
    const out = await runTool(t.tool, { do: "raid" });
    expect(t.act.convert).toHaveBeenCalledTimes(1);
    expect(out.text).toContain("DONE");
    expect(out.details.result.after).toMatchObject({
      confirmed: true,
      do: "raid",
    });
  });

  test("fails with level_too_low on the level refusal", async () => {
    const t = await world({ group: { kind: "party" } });
    t.act.convert.mockImplementation(() =>
      t.emit({
        member: "",
        operation: "invite",
        result: "raid_disallowed_by_level",
        type: "command_result",
      }),
    );
    const out = await runTool(t.tool, { do: "raid" });
    expect(out.text).toContain("FAILED level_too_low");
  });

  test("an ok command result does not fail the wait", async () => {
    const t = await world({ group: { kind: "party" } });
    t.act.convert.mockImplementation(() => {
      t.emit({
        member: "",
        operation: "invite",
        result: "ok",
        type: "command_result",
      });
      t.changed({ kind: "converted" });
    });
    expect((await runTool(t.tool, { do: "raid" })).text).toContain("DONE");
  });

  test("Peon and one other member may convert", async () => {
    const t = await world({ group: { kind: "party" }, members: [tom()] });
    t.act.convert.mockImplementation(() => elapse(WAIT_MS));
    await withFakeTimers(() => runTool(t.tool, { do: "raid" }));
    expect(t.act.convert).toHaveBeenCalledTimes(1);
  });

  test("stays unconfirmed after 3 s of silence", async () => {
    const t = await world({ group: { kind: "party" } });
    t.act.convert.mockImplementation(() => elapse(WAIT_MS));
    const out = await withFakeTimers(() => runTool(t.tool, { do: "raid" }));
    expect(out.text).toContain("UNCONFIRMED");
  });

  test("a send that throws fails and releases the wait", async () => {
    const t = await world({ group: { kind: "party" } });
    t.act.convert.mockImplementation(() => {
      throw new Error("boom");
    });
    const out = await runTool(t.tool, { do: "raid" });
    expect(out.text).toContain("FAILED");
  });

  test("an aborted signal ends the wait before any send", async () => {
    const t = await world({ group: { kind: "party" } });
    const abort = new AbortController();
    abort.abort(new Error("cancelled"));
    await expect(
      groupSpec.run({ do: "raid" }, toolCtx<GroupAfter>(t, abort.signal)),
    ).rejects.toThrow("cancelled");
    expect(sent(t)).toBe(0);
  });
});

describe("group tool move and swap", () => {
  test("refuse without a raid, without rank, or with a bad group", async () => {
    const party = await world({ group: { kind: "party" } });
    expect(
      (await runTool(party.tool, { do: "move", group: 2, to: "Tom" })).text,
    ).toContain("REFUSED not_raid");
    const follower = await world({ group: { leader: TOM } });
    expect(
      (await runTool(follower.tool, { do: "move", group: 2, to: "Tom" })).text,
    ).toContain("REFUSED not_leader");
    expect(
      (
        await runTool(follower.tool, {
          do: "swap",
          to: "Tom",
          with: "Ann",
        })
      ).text,
    ).toContain("REFUSED not_leader");
    const t = await world();
    for (const group of [0, 9, 1.5])
      expect(
        (await runTool(t.tool, { do: "move", group, to: "Tom" })).text,
      ).toContain("REFUSED bad_group");
    expect((await runTool(t.tool, { do: "move", to: "Tom" })).text).toContain(
      "REFUSED bad_group",
    );
    expect(
      (await runTool(t.tool, { do: "move", group: 2, to: "Zed" })).text,
    ).toContain("REFUSED not_a_member");
    expect((await runTool(t.tool, { do: "move", group: 2 })).text).toContain(
      "REFUSED needs_name",
    );
    for (const spy of [party, follower, t]) expect(sent(spy)).toBe(0);
  });

  test("an assistant may move a member", async () => {
    const t = await world({ group: { leader: TOM, ...AS_ASSISTANT } });
    t.act.move.mockImplementation(() =>
      t.changed({ from: 0, kind: "subgroup", name: "Tom", to: 1 }),
    );
    const out = await runTool(t.tool, { do: "move", group: 2, to: "tom" });
    expect(t.act.move).toHaveBeenCalledWith("Tom", 2);
    expect(out.text).toContain("DONE");
  });

  test("refuses a full subgroup and skips a member already there", async () => {
    const five = [1, 2, 3, 4, 5].map((n) =>
      partyMember({ guid: BigInt(0x9_00 + n), name: `Full${n}`, subgroup: 1 }),
    );
    const full = await world({ members: [tom(), ...five] });
    const out = await runTool(full.tool, { do: "move", group: 2, to: "Tom" });
    expect(out.text).toContain("REFUSED group_full");
    expect(sent(full)).toBe(0);
    const same = await world();
    const there = await runTool(same.tool, { do: "move", group: 2, to: "Ann" });
    expect(there.text).toContain("DONE");
    expect(sent(same)).toBe(0);
  });

  test("a subgroup change to another group or member does not confirm", async () => {
    const t = await world();
    t.act.move.mockImplementation(() => {
      t.changed({ from: 0, kind: "subgroup", name: "Tom", to: 2 });
      t.changed({ from: 0, kind: "subgroup", name: "Ann", to: 1 });
      return elapse(WAIT_MS);
    });
    const out = await withFakeTimers(() =>
      runTool(t.tool, { do: "move", group: 2, to: "Tom" }),
    );
    expect(out.text).toContain("UNCONFIRMED");
  });

  test("swap is done when both members change group", async () => {
    const t = await world();
    t.act.swap.mockImplementation(() =>
      t.changed(
        { from: 0, kind: "subgroup", name: "Tom", to: 1 },
        { from: 1, kind: "subgroup", name: "Ann", to: 0 },
      ),
    );
    const out = await runTool(t.tool, { do: "swap", to: "Tom", with: "ann" });
    expect(t.act.swap).toHaveBeenCalledWith("Tom", "Ann");
    expect(out.text).toContain("DONE");
  });

  test("swap needs two distinct members of the group", async () => {
    const t = await world();
    expect((await runTool(t.tool, { do: "swap", to: "Tom" })).text).toContain(
      "REFUSED needs_name",
    );
    expect(
      (await runTool(t.tool, { do: "swap", to: "Tom", with: "tom" })).text,
    ).toContain("REFUSED needs_name");
    expect(
      (await runTool(t.tool, { do: "swap", to: "Tom", with: "Zed" })).text,
    ).toContain("REFUSED not_a_member");
    expect(sent(t)).toBe(0);
  });

  test("a swap with one changed member stays unconfirmed", async () => {
    const t = await world();
    t.act.swap.mockImplementation(() => {
      t.changed({ from: 0, kind: "subgroup", name: "Tom", to: 1 });
      return elapse(WAIT_MS);
    });
    const out = await withFakeTimers(() =>
      runTool(t.tool, { do: "swap", to: "Tom", with: "Ann" }),
    );
    expect(out.text).toContain("UNCONFIRMED");
  });
});

describe("group tool promote", () => {
  test("needs a known role and a member", async () => {
    const t = await world();
    expect(
      (await runTool(t.tool, { do: "promote", to: "Tom", what: "king" })).text,
    ).toContain("REFUSED bad_role");
    expect(
      (await runTool(t.tool, { do: "promote", what: "assistant" })).text,
    ).toContain("REFUSED needs_name");
    expect(
      (await runTool(t.tool, { do: "promote", to: "Zed", what: "assistant" }))
        .text,
    ).toContain("REFUSED not_a_member");
    expect(sent(t)).toBe(0);
  });

  test("a role name is case-insensitive", async () => {
    const t = await world();
    t.act.promote.mockImplementation(() => elapse(WAIT_MS));
    const out = await withFakeTimers(() =>
      runTool(t.tool, { do: "promote", to: "Tom", what: "Assistant" }),
    );
    expect(out.text).not.toContain("bad_role");
    expect(t.act.promote).toHaveBeenCalledTimes(1);
  });

  test("assistant needs the leader, main roles accept an assistant", async () => {
    const t = await world({ group: { leader: TOM, ...AS_ASSISTANT } });
    const refused = await runTool(t.tool, {
      do: "promote",
      to: "Ann",
      what: "assistant",
    });
    expect(refused.text).toContain("REFUSED not_leader");
    expect(t.act.promote).not.toHaveBeenCalled();
    t.act.mainTank.mockImplementation(() =>
      t.changed({ flag: "main_tank", kind: "flag", name: "Ann", on: true }),
    );
    const ok = await runTool(t.tool, {
      do: "promote",
      to: "Ann",
      what: "main_tank",
    });
    expect(t.act.mainTank).toHaveBeenCalledWith("Ann", true);
    expect(ok.text).toContain("DONE");
  });

  test("each role calls its act and settles on its flag", async () => {
    const t = await world();
    t.act.promote.mockImplementation(() =>
      t.changed({ flag: "assistant", kind: "flag", name: "Ann", on: true }),
    );
    t.act.mainAssist.mockImplementation(() =>
      t.changed({ flag: "main_assist", kind: "flag", name: "Ann", on: true }),
    );
    const a = await runTool(t.tool, {
      do: "promote",
      to: "Ann",
      what: "assistant",
    });
    const m = await runTool(t.tool, {
      do: "promote",
      to: "Ann",
      what: "main_assist",
    });
    expect(t.act.promote).toHaveBeenCalledWith("Ann", true);
    expect(t.act.mainAssist).toHaveBeenCalledWith("Ann", true);
    expect(a.text).toContain("DONE");
    expect(m.text).toContain("DONE");
  });

  test("text off clears the role and needs the flag change off", async () => {
    const t = await world({ members: [tom(), ann({ flags: ASSISTANT })] });
    t.act.promote.mockImplementation(() => {
      t.changed({ flag: "assistant", kind: "flag", name: "Ann", on: true });
      return elapse(WAIT_MS);
    });
    const out = await withFakeTimers(() =>
      runTool(t.tool, {
        do: "promote",
        text: "off",
        to: "Ann",
        what: "assistant",
      }),
    );
    expect(t.act.promote).toHaveBeenCalledWith("Ann", false);
    expect(out.text).toContain("UNCONFIRMED");
  });

  test("a member that already holds the role sends nothing", async () => {
    const t = await world({ members: [tom(), ann({ flags: 0x02 })] });
    const out = await runTool(t.tool, {
      do: "promote",
      to: "Ann",
      what: "main_tank",
    });
    expect(out.text).toContain("DONE");
    expect(sent(t)).toBe(0);
  });
});
