import type { Mock } from "bun:test";
import { describe, expect, jest, test } from "bun:test";
import type { AreaEventOf, AreaState, PartyMember } from "@peon/core";
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
type ReadyCheck = NonNullable<RaidState["readyCheck"]>;
type RaidEvent = AreaEventOf<"raid">;

const SELF = 0x0764n;
const TOM = 0x100n;
const ANN = 0x200n;
const ASSISTANT = 1;

function tom(): PartyMember {
  return partyMember({ guid: TOM, name: "Tom" });
}

function ann(): PartyMember {
  return partyMember({ guid: ANN, name: "Ann", subgroup: 1 });
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

function openCheck(over: Partial<ReadyCheck> = {}): ReadyCheck {
  return {
    answers: new Map(),
    finishedAt: undefined,
    initiator: TOM,
    ownAnswer: undefined,
    startedAt: 1,
    ...over,
  };
}

type Setup = {
  group?: Partial<RaidGroup>;
  inGroup?: boolean;
  readyCheck?: ReadyCheck;
};

async function world(setup: Setup = {}) {
  const t = await createTestRuntime();
  const members = [tom(), ann()];
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
    readyCheck: setup.readyCheck,
    stats: new Map(),
  };
  jest.spyOn(t.handle.raid, "state").mockReturnValue(groupState);
  const start = jest
    .spyOn(t.handle.raid.act, "startReadyCheck")
    .mockImplementation(() => undefined);
  const answer = jest
    .spyOn(t.handle.raid.act, "answerReadyCheck")
    .mockImplementation(() => undefined);
  const emit = (event: RaidEvent) => t.handle.triggerAreaEvent("raid", event);
  return { ...t, answer, emit, start, tool: groupTool.definition(t.rt) };
}

const AS_ASSISTANT = {
  group: { leader: TOM, self: { flags: ASSISTANT, roles: 0, subgroup: 0 } },
};

describe("group tool ready_check", () => {
  test("refuses to a plain member and out of a group", async () => {
    const member = await world({ group: { leader: TOM } });
    const refused = await runTool(member.tool, { do: "ready_check" });
    expect(refused.text).toContain("REFUSED not_leader");
    const alone = await world({ inGroup: false });
    const none = await runTool(alone.tool, { do: "ready_check" });
    expect(none.text).toContain("REFUSED not_in_group");
    expect(member.start).not.toHaveBeenCalled();
    expect(alone.start).not.toHaveBeenCalled();
  });

  test("is done when the server relays the start from Peon", async () => {
    const t = await world();
    t.start.mockImplementation(() =>
      t.emit({ initiator: SELF, name: "", type: "ready_check_started" }),
    );
    const out = await runTool(t.tool, { do: "ready_check" });
    expect(t.start).toHaveBeenCalledTimes(1);
    expect(out.text).toContain("DONE");
    expect(out.details.result.after).toMatchObject({ do: "ready_check" });
  });

  test("an assistant may start a check", async () => {
    const t = await world(AS_ASSISTANT);
    t.start.mockImplementation(() =>
      t.emit({ initiator: SELF, name: "", type: "ready_check_started" }),
    );
    const out = await runTool(t.tool, { do: "ready_check" });
    expect(t.start).toHaveBeenCalledTimes(1);
    expect(out.text).toContain("DONE");
  });

  test("a start by someone else does not confirm", async () => {
    const t = await world();
    t.start.mockImplementation(() => {
      t.emit({ initiator: TOM, name: "Tom", type: "ready_check_started" });
      return elapse(3000);
    });
    const out = await withFakeTimers(() =>
      runTool(t.tool, { do: "ready_check" }),
    );
    expect(out.text).toContain("UNCONFIRMED");
  });

  test("stays unconfirmed when the server stays silent", async () => {
    const t = await world();
    t.start.mockImplementation(() => elapse(3000));
    const out = await withFakeTimers(() =>
      runTool(t.tool, { do: "ready_check" }),
    );
    expect(out.text).toContain("UNCONFIRMED");
  });

  test("fails when the send throws", async () => {
    const t = await world();
    t.start.mockImplementation(() => {
      throw new Error("socket closed");
    });
    const out = await runTool(t.tool, { do: "ready_check" });
    expect(out.text).toContain("FAILED");
  });

  test("an aborted run ends the wait before sending", async () => {
    const t = await world();
    const abort = new AbortController();
    abort.abort(new Error("cancelled"));
    await expect(
      groupSpec.run(
        { do: "ready_check" },
        toolCtx<GroupAfter>(t, abort.signal),
      ),
    ).rejects.toThrow("cancelled");
    expect(t.start).not.toHaveBeenCalled();
  });
});

describe("group tool ready", () => {
  test("refuses when no check is open", async () => {
    const none = await world();
    const out = await runTool(none.tool, { do: "ready", what: "yes" });
    expect(out.text).toContain("REFUSED no_check");
    const over = await world({ readyCheck: openCheck({ finishedAt: 5 }) });
    const done = await runTool(over.tool, { do: "ready", what: "yes" });
    expect(done.text).toContain("REFUSED no_check");
    expect(none.answer).not.toHaveBeenCalled();
    expect(over.answer).not.toHaveBeenCalled();
  });

  test("refuses out of a group", async () => {
    const t = await world({ inGroup: false });
    const out = await runTool(t.tool, { do: "ready", what: "yes" });
    expect(out.text).toContain("REFUSED not_in_group");
  });

  test("answers yes and no on an open check", async () => {
    const t = await world({
      group: { leader: TOM },
      readyCheck: openCheck(),
    });
    const yes = await runTool(t.tool, { do: "ready", what: "yes" });
    expect(t.answer).toHaveBeenLastCalledWith(true);
    expect(yes.text).toContain("DONE");
    const no = await runTool(t.tool, { do: "ready", what: " No " });
    expect(t.answer).toHaveBeenLastCalledWith(false);
    expect(no.text).toContain("DONE");
  });

  test("refuses an unclear answer before sending", async () => {
    const t = await world({ readyCheck: openCheck() });
    const missing = await runTool(t.tool, { do: "ready" });
    expect(missing.text).toContain("REFUSED bad_answer");
    const odd = await runTool(t.tool, { do: "ready", what: "maybe" });
    expect(odd.text).toContain("REFUSED bad_answer");
    expect(t.answer).not.toHaveBeenCalled();
  });

  test("fails when the send throws", async () => {
    const t = await world({ readyCheck: openCheck() });
    t.answer.mockImplementation(() => {
      throw new Error("socket closed");
    });
    const out = await runTool(t.tool, { do: "ready", what: "yes" });
    expect(out.text).toContain("FAILED");
  });
});
