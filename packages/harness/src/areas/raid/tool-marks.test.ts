import type { Mock } from "bun:test";
import { describe, expect, jest, test } from "bun:test";
import type { AreaEventOf, AreaState } from "@peon/core";
import { elapse, withFakeTimers } from "@peon/core/test-support/fake-time";
import {
  partyMember,
  partyState,
} from "@peon/core/test-support/party-fixtures";
import { groupSpec, groupTool } from "#harness/areas/raid/tool";
import type { GroupAfter } from "#harness/areas/raid/tool-shared";
import {
  moveTo,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { runTool } from "#test-support/tool-harness";

type RaidState = AreaState<"raid">;
type RaidGroup = NonNullable<RaidState["group"]>;
type RaidEvent = AreaEventOf<"raid">;

const SELF = 0x0764n;
const TOM = 0x100n;
const LYNX = 0x3000n;
const RAT = 0x3001n;
const FOE = 0x3002n;
const ALLY = 0x3003n;
const SKULL = 7;
const STAR = 0;
const ASSISTANT = 1;

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
  group?: Partial<RaidGroup>;
  inGroup?: boolean;
  marks?: readonly bigint[];
};

async function world(setup: Setup = {}) {
  const t = await createTestRuntime();
  const control = t.handle.getControlState();
  (t.handle.getControlState as Mock<() => typeof control>).mockReturnValue({
    ...control,
    selfGuid: SELF,
  });
  const inGroup = setup.inGroup ?? true;
  const members = [partyMember({ guid: TOM, name: "Tom" })];
  const party = inGroup
    ? partyState({ inGroup: true, leader: "Tom", members })
    : partyState();
  (t.handle.getPartyState as Mock<() => typeof party>).mockReturnValue(party);
  const state: RaidState = {
    group: inGroup ? raidGroup(setup.group) : undefined,
    marks: setup.marks ?? Array.from({ length: 8 }, () => 0n),
    readyCheck: undefined,
    stats: new Map(),
  };
  jest.spyOn(t.handle.raid, "state").mockReturnValue(state);
  setSelf(t.handle);
  moveTo(t.handle, { x: 100, y: 200 });
  setUnits(t.handle, [
    unitRow({
      distance: 5,
      guid: LYNX,
      level: 7,
      name: "Springpaw Lynx",
      x: 105,
      y: 200,
    }),
    unitRow({
      distance: 9,
      guid: RAT,
      level: 7,
      name: "Field Rat",
      x: 100,
      y: 209,
    }),
    unitRow({
      distance: 12,
      guid: FOE,
      name: "Bandit",
      player: true,
      relation: "hostile",
      x: 112,
      y: 200,
    }),
    unitRow({
      distance: 14,
      guid: ALLY,
      name: "Friend",
      player: true,
      relation: "friendly",
      x: 100,
      y: 214,
    }),
  ]);
  const set = jest
    .spyOn(t.handle.raid.act, "setRaidMark")
    .mockImplementation(() => undefined);
  jest
    .spyOn(t.handle.raid.act, "clearRaidMark")
    .mockImplementation(() => undefined);
  const ping = jest
    .spyOn(t.handle.raid.act, "pingMinimap")
    .mockImplementation(() => undefined);
  const emit = (event: RaidEvent) => t.handle.triggerAreaEvent("raid", event);
  return { ...t, emit, ping, set, tool: groupTool.definition(t.rt) };
}

function echo(icon: number, target: bigint): RaidEvent {
  return { icon, name: "", target, type: "raid_mark", who: SELF };
}

const AS_ASSISTANT = {
  group: {
    kind: "raid" as const,
    leader: TOM,
    self: { flags: ASSISTANT, roles: 0, subgroup: 0 },
  },
};

describe("group tool mark", () => {
  test("sets skull on the named creature and is done on the echo", async () => {
    const t = await world();
    t.set.mockImplementation((icon, guid) => t.emit(echo(icon, guid)));
    const out = await runTool(t.tool, {
      do: "mark",
      target: "Springpaw Lynx",
      what: "skull",
    });
    expect(t.set).toHaveBeenCalledWith(SKULL, LYNX);
    expect(out.text).toContain("DONE");
    expect(out.details.result.after).toMatchObject({ do: "mark" });
  });

  test("resolves a unit id and any case of the icon name", async () => {
    const t = await world();
    t.set.mockImplementation((icon, guid) => t.emit(echo(icon, guid)));
    const out = await runTool(t.tool, {
      do: "mark",
      target: "Field Rat",
      what: " Star ",
    });
    expect(t.set).toHaveBeenCalledWith(STAR, RAT);
    expect(out.text).toContain("DONE");
  });

  test("an echo for another icon does not confirm", async () => {
    const t = await world();
    t.set.mockImplementation(() => {
      t.emit(echo(STAR, LYNX));
      t.emit(echo(SKULL, RAT));
      return elapse(3000);
    });
    const out = await withFakeTimers(() =>
      runTool(t.tool, { do: "mark", target: "Springpaw Lynx", what: "skull" }),
    );
    expect(out.text).toContain("UNCONFIRMED");
  });

  test("stays unconfirmed after 3 s of silence", async () => {
    const t = await world();
    t.set.mockImplementation(() => elapse(3000));
    const out = await withFakeTimers(() =>
      runTool(t.tool, { do: "mark", target: "Springpaw Lynx", what: "skull" }),
    );
    expect(out.text).toContain("UNCONFIRMED");
  });

  test("clear removes the icon that holds the target", async () => {
    const marks = Array.from({ length: 8 }, () => 0n);
    marks[SKULL] = LYNX;
    const t = await world({ marks });
    const clear = t.handle.raid.act.clearRaidMark as unknown as {
      mockImplementation: (fn: (icon: number) => void) => void;
    };
    clear.mockImplementation((icon) => t.emit(echo(icon, 0n)));
    const out = await runTool(t.tool, {
      do: "mark",
      target: "Springpaw Lynx",
      what: "clear",
    });
    expect(t.handle.raid.act.clearRaidMark).toHaveBeenCalledWith(SKULL);
    expect(out.text).toContain("DONE");
  });

  test("clear refuses a target that carries no mark", async () => {
    const t = await world();
    const out = await runTool(t.tool, {
      do: "mark",
      target: "Springpaw Lynx",
      what: "clear",
    });
    expect(out.text).toContain("REFUSED not_marked");
    expect(t.set).not.toHaveBeenCalled();
  });

  test("a raid member without rank is refused before any send", async () => {
    const t = await world({ group: { kind: "raid", leader: TOM } });
    const out = await runTool(t.tool, {
      do: "mark",
      target: "Springpaw Lynx",
      what: "skull",
    });
    expect(out.text).toContain("REFUSED not_leader");
    expect(t.set).not.toHaveBeenCalled();
  });

  test("a plain party member may mark, an assistant marks in a raid", async () => {
    const party = await world({ group: { leader: TOM } });
    party.set.mockImplementation((icon, guid) => party.emit(echo(icon, guid)));
    const inParty = await runTool(party.tool, {
      do: "mark",
      target: "Springpaw Lynx",
      what: "skull",
    });
    expect(inParty.text).toContain("DONE");
    const raid = await world(AS_ASSISTANT);
    raid.set.mockImplementation((icon, guid) => raid.emit(echo(icon, guid)));
    const inRaid = await runTool(raid.tool, {
      do: "mark",
      target: "Springpaw Lynx",
      what: "skull",
    });
    expect(inRaid.text).toContain("DONE");
  });

  test("refuses a hostile player but marks a friendly one", async () => {
    const t = await world();
    t.set.mockImplementation((icon, guid) => t.emit(echo(icon, guid)));
    const foe = await runTool(t.tool, {
      do: "mark",
      target: "Bandit",
      what: "skull",
    });
    expect(foe.text).toContain("REFUSED hostile_player");
    expect(t.set).not.toHaveBeenCalled();
    const friend = await runTool(t.tool, {
      do: "mark",
      target: "Friend",
      what: "moon",
    });
    expect(friend.text).toContain("DONE");
    expect(t.set).toHaveBeenCalledWith(4, ALLY);
  });

  test("refuses bad input and a group-less character", async () => {
    const t = await world();
    const noTarget = await runTool(t.tool, { do: "mark", what: "skull" });
    expect(noTarget.text).toContain("REFUSED");
    const badIcon = await runTool(t.tool, {
      do: "mark",
      target: "Springpaw Lynx",
      what: "purple",
    });
    expect(badIcon.text).toContain("REFUSED bad_icon");
    const missing = await runTool(t.tool, {
      do: "mark",
      target: "Dragon",
      what: "skull",
    });
    expect(missing.text).toContain("REFUSED");
    const alone = await world({ inGroup: false });
    const none = await runTool(alone.tool, {
      do: "mark",
      target: "Springpaw Lynx",
      what: "skull",
    });
    expect(none.text).toContain("REFUSED not_in_group");
    expect(t.set).not.toHaveBeenCalled();
    expect(alone.set).not.toHaveBeenCalled();
  });

  test("fails when the send throws", async () => {
    const t = await world();
    t.set.mockImplementation(() => {
      throw new Error("socket closed");
    });
    const out = await runTool(t.tool, {
      do: "mark",
      target: "Springpaw Lynx",
      what: "skull",
    });
    expect(out.text).toContain("FAILED");
  });

  test("an aborted run ends before sending", async () => {
    const t = await world();
    const abort = new AbortController();
    abort.abort(new Error("cancelled"));
    await expect(
      groupSpec.run(
        { do: "mark", target: "Springpaw Lynx", what: "skull" },
        toolCtx<GroupAfter>(t, abort.signal),
      ),
    ).rejects.toThrow("cancelled");
    expect(t.set).not.toHaveBeenCalled();
  });
});

describe("group tool ping", () => {
  test("pings the named unit's position and is done on send", async () => {
    const t = await world();
    const out = await runTool(t.tool, { do: "ping", target: "Springpaw Lynx" });
    expect(t.ping).toHaveBeenCalledTimes(1);
    expect(t.ping).toHaveBeenCalledWith(105, 200);
    expect(out.text).toContain("DONE");
    expect(out.details.result.after).toMatchObject({ do: "ping" });
  });

  test("pings the character's own position without a target", async () => {
    const t = await world();
    const out = await runTool(t.tool, { do: "ping" });
    expect(t.ping).toHaveBeenCalledWith(100, 200);
    expect(out.text).toContain("DONE");
  });

  test("refuses out of a group and for an unknown target", async () => {
    const alone = await world({ inGroup: false });
    const none = await runTool(alone.tool, { do: "ping" });
    expect(none.text).toContain("REFUSED not_in_group");
    const t = await world();
    const missing = await runTool(t.tool, { do: "ping", target: "Dragon" });
    expect(missing.text).toContain("REFUSED");
    expect(alone.ping).not.toHaveBeenCalled();
    expect(t.ping).not.toHaveBeenCalled();
  });

  test("fails when the send throws", async () => {
    const t = await world();
    t.ping.mockImplementation(() => {
      throw new Error("socket closed");
    });
    const out = await runTool(t.tool, { do: "ping" });
    expect(out.text).toContain("FAILED");
  });
});
