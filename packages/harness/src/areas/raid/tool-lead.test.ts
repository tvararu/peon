import type { Mock } from "bun:test";
import { describe, expect, jest, test } from "bun:test";
import type { AreaState, PartyMember } from "@peon/core";
import { elapse, withFakeTimers } from "@peon/core/test-support/fake-time";
import {
  partyMember,
  partyState,
} from "@peon/core/test-support/party-fixtures";
import { groupSpec, groupTool } from "#harness/areas/raid/tool";
import type { GroupAfter } from "#harness/areas/raid/tool-shared";
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
  return { ...t, tool: groupTool.definition(t.rt) };
}

describe("group tool lead", () => {
  test("refuses when Peon does not lead", async () => {
    const t = await world({
      group: { leader: TOM },
      members: [tom(), ann()],
    });
    const out = await runTool(t.tool, { do: "lead", to: "Ann" });
    expect(out.text).toContain("REFUSED not_leader");
    expect(t.handle.setLeader).not.toHaveBeenCalled();
  });

  test("an assistant may not lead-transfer", async () => {
    const t = await world({
      group: { leader: TOM, self: { flags: 1, roles: 0, subgroup: 0 } },
      members: [tom(), ann()],
    });
    const out = await runTool(t.tool, { do: "lead", to: "Ann" });
    expect(out.text).toContain("REFUSED not_leader");
  });

  test("refuses a name outside the roster and out of a group", async () => {
    const t = await world({ members: [tom()] });
    const unknown = await runTool(t.tool, { do: "lead", to: "Zed" });
    expect(unknown.text).toContain("REFUSED not_a_member");
    const missing = await runTool(t.tool, { do: "lead" });
    expect(missing.text).toContain("REFUSED");
    const alone = await world({ inGroup: false });
    const none = await runTool(alone.tool, { do: "lead", to: "Tom" });
    expect(none.text).toContain("REFUSED not_in_group");
    expect(t.handle.setLeader).not.toHaveBeenCalled();
  });

  test("is done on the leader change to that member", async () => {
    const t = await world({ members: [tom(), ann()] });
    (t.handle.setLeader as Mock<(name: string) => void>).mockImplementation(
      (name: string) =>
        t.handle.triggerGroupEvent({ name, type: "leader_changed" }),
    );
    const out = await runTool(t.tool, { do: "lead", to: "ann" });
    expect(t.handle.setLeader).toHaveBeenCalledWith("Ann");
    expect(out.text).toContain("DONE");
    expect(out.text).toContain("Ann");
    expect(out.details.result.after).toMatchObject({
      confirmed: true,
      do: "lead",
      to: "Ann",
    });
  });

  test("a leader change to someone else does not confirm", async () => {
    const t = await world({ members: [tom(), ann()] });
    (t.handle.setLeader as Mock<(name: string) => void>).mockImplementation(
      () => {
        t.handle.triggerGroupEvent({ name: "Tom", type: "leader_changed" });
        return elapse(3000);
      },
    );
    const out = await withFakeTimers(() =>
      runTool(t.tool, { do: "lead", to: "Ann" }),
    );
    expect(out.text).toContain("UNCONFIRMED");
  });

  test("stays unconfirmed when the server stays silent", async () => {
    const t = await world({ members: [tom(), ann()] });
    (t.handle.setLeader as Mock<(name: string) => void>).mockImplementation(
      () => elapse(3000),
    );
    const out = await withFakeTimers(() =>
      runTool(t.tool, { do: "lead", to: "Ann" }),
    );
    expect(out.text).toContain("UNCONFIRMED");
  });

  test("an aborted lead ends the wait", async () => {
    const t = await world({ members: [tom(), ann()] });
    const abort = new AbortController();
    abort.abort(new Error("cancelled"));
    await expect(
      groupSpec.run(
        { do: "lead", to: "Ann" },
        toolCtx<GroupAfter>(t, abort.signal),
      ),
    ).rejects.toThrow("cancelled");
    expect(t.handle.setLeader).not.toHaveBeenCalled();
  });
});
