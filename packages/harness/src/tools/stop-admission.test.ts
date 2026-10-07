import { describe, expect, jest, test } from "bun:test";
import { ChatType, ObjectType, type UnitEntity } from "@peon/core";
import { calendarTool } from "#harness/areas/calendar/tool";
import { characterTool } from "#harness/areas/character/tool";
import { guildTool } from "#harness/areas/guildadmin/tool";
import { dungeonTool } from "#harness/areas/instances/tool";
import { gearTool } from "#harness/areas/items/tool";
import { petTool } from "#harness/areas/pets/tool";
import { groupTool } from "#harness/areas/raid/tool";
import { talentsTool } from "#harness/areas/talents/tool";
import type { TalentsSnapshot } from "#harness/areas/talents/tool-types";
import { tradeTool } from "#harness/areas/trade/tool";
import { installInput } from "#harness/extension/input";
import { socialTool } from "#harness/tools/social";
import { createFakePi } from "#test-support/fake-pi";
import {
  barState,
  world as petWorld,
  unit,
} from "#test-support/pets-command-fixture";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { runTool } from "#test-support/tool-harness";

const human = (text: string) => ({
  source: "interactive",
  text,
  type: "input",
});

function me(): UnitEntity {
  return {
    class_: 1,
    createComplete: true,
    displayId: 0,
    entry: 1,
    factionTemplate: 0,
    gender: 0,
    guid: 42n,
    health: 100,
    level: 12,
    maxHealth: 100,
    maxPower: [],
    name: "War",
    npcFlags: 0,
    objectType: ObjectType.PLAYER,
    position: undefined,
    power: [],
    race: 1,
    rawFields: new Map(),
    scale: 1,
    target: 0n,
    unitFlags: 0,
  };
}

function talentsState(): TalentsSnapshot {
  return {
    fields: {
      enabledMask: 0b11,
      freePoints: 2,
      glyphs: [0, 0, 0, 0, 0, 0],
      slotTypes: [21, 23, undefined, undefined, undefined, undefined],
    },
    pendingOffer: undefined,
    pet: undefined,
    player: {
      activeSpec: 0,
      freePoints: 2,
      kind: "player",
      specCount: 1,
      specs: [
        { glyphs: [0, 0, 0, 0, 0, 0], talents: [{ rank: 0, talentId: 124 }] },
      ],
    },
    slots: [
      { glyphId: 0, index: 0, typeId: 21, unlocked: true },
      { glyphId: 21, index: 1, typeId: 23, unlocked: true },
      { glyphId: undefined, index: 2, typeId: undefined, unlocked: false },
      { glyphId: undefined, index: 3, typeId: undefined, unlocked: false },
      { glyphId: undefined, index: 4, typeId: undefined, unlocked: false },
      { glyphId: undefined, index: 5, typeId: undefined, unlocked: false },
    ],
  } as unknown as TalentsSnapshot;
}

async function withFakeTimers<T>(body: () => Promise<T>): Promise<T> {
  jest.useFakeTimers();
  try {
    return await body();
  } finally {
    jest.useRealTimers();
  }
}

describe("stop hold per-operation admission", () => {
  test("a chat reply through the real social tool runs while stopped; an invite stays refused", async () => {
    const { handle, rt } = await createTestRuntime();
    const tool = socialTool.definition(rt);
    rt.session.stopped = true;
    handle.sendWhisper = jest.fn((to: string, text: string) =>
      handle.triggerMessage({
        message: text,
        sender: to,
        type: ChatType.WHISPER_INFORM,
      }),
    );
    const reply = await runTool(tool, {
      text: "on my way",
      to: "Kaelyn",
    });
    expect(reply.details.result.status).toBe("DONE");
    expect(handle.sendWhisper).toHaveBeenCalledWith("Kaelyn", "on my way");
    const invite = await runTool(tool, { do: "invite", to: "Kaelyn" });
    expect(invite.details.result).toMatchObject({
      reason: "stopped",
      status: "REFUSED",
    });
    expect(handle.invite).not.toHaveBeenCalled();
  });

  test("pet status through the real pet tool runs while stopped; follow stays refused", async () => {
    const t = await petWorld({ petEntity: unit(), pets: barState() });
    const state = t.handle.getCombatState();
    t.handle.getCombatState = jest.fn(() => ({
      ...state,
      attackers: [],
      self: { ...state.self, health: 200, maxHealth: 200 },
    }));
    const tool = petTool.definition(t.rt);
    t.rt.session.stopped = true;
    const status = await runTool(tool, {});
    expect(status.details.result.status).toBe("DONE");
    const follow = await runTool(tool, { do: "follow" });
    expect(follow.details.result).toMatchObject({
      reason: "stopped",
      status: "REFUSED",
    });
  });

  test("talents show through the real talents tool runs while stopped; learn stays refused", async () => {
    const t = await createTestRuntime();
    const state = talentsState();
    Object.assign(t.handle.talents.act, { catalog: async () => undefined });
    Object.assign(t.handle.talents, { state: () => state });
    Object.assign(t.handle, {
      getControlState: jest.fn(() => ({ selfGuid: 42n })),
      getEntity: jest.fn(() => me()),
      spellDefinition: jest.fn(() => undefined),
    });
    const tool = talentsTool.definition(t.rt);
    t.rt.session.stopped = true;
    const show = await runTool(tool, { do: "show" });
    expect(show.details.result.status).toBe("DONE");
    const learn = await runTool(tool, {
      do: "learn",
      talent: "Deflection",
    });
    expect(learn.details.result).toMatchObject({
      reason: "stopped",
      status: "REFUSED",
    });
  });

  test("group status through the real group tool runs while stopped; kick stays refused", async () => {
    const { rt } = await createTestRuntime();
    const tool = groupTool.definition(rt);
    rt.session.stopped = true;
    for (const args of [{}, { do: "status" as const }]) {
      const status = await runTool(tool, args);
      expect(status.details.result.status).toBe("DONE");
    }
    const kick = await runTool(tool, {
      do: "kick",
      to: "Kaelyn",
      what: "afk",
    });
    expect(kick.details.result).toMatchObject({
      reason: "stopped",
      status: "REFUSED",
    });
  });

  test("trade show through the real trade tool runs while stopped; cancel stays refused", async () => {
    const { rt } = await createTestRuntime();
    const tool = tradeTool.definition(rt);
    rt.session.stopped = true;
    const show = await runTool(tool, { do: "show" });
    expect(show.details.result.status).not.toBe("REFUSED");
    const bare = await runTool(tool, {});
    expect(bare.details.result.status).not.toBe("REFUSED");
    const cancel = await runTool(tool, { do: "cancel" });
    expect(cancel.details.result).toMatchObject({
      reason: "stopped",
      status: "REFUSED",
    });
  });

  test("dungeon status through the real dungeon tool runs while stopped; reset stays refused", async () => {
    const { handle, rt } = await createTestRuntime();
    const freshInstances = {
      ...handle.instances.state(),
      locks: [],
      locksAt: rt.clock.now(),
    };
    jest
      .spyOn(handle.instances, "state")
      .mockImplementation(() => freshInstances);
    const tool = dungeonTool.definition(rt);
    rt.session.stopped = true;
    for (const args of [{}, { do: "status" as const }]) {
      const status = await runTool(tool, args);
      expect(status.details.result.status).toBe("DONE");
      expect(status.details.result.after).toMatchObject({ do: "status" });
    }
    for (const args of [
      { do: "difficulty", for: "dungeon", value: "heroic" },
      { do: "reset" },
      { accept: true, do: "bind" },
      { do: "extend", map: 36 },
      { do: "queue" },
      { do: "leave_queue" },
      { do: "answer" },
      { do: "roles" },
      { do: "teleport" },
      { do: "kick_vote" },
    ] as const) {
      const refused = await runTool(tool, args);
      expect(refused.details.result).toMatchObject({
        reason: "stopped",
        status: "REFUSED",
      });
    }
  });

  test("gear read through the real gear tool runs while stopped; equip stays refused", async () => {
    const { handle, rt } = await createTestRuntime();
    const inventory = handle.getInventoryState();
    const letter = 0x40_00_00_00_00_00_00_05n;
    handle.getInventoryState = () => ({
      ...inventory,
      slots: [
        {
          bag: 255,
          guid: letter,
          item: {
            contained: undefined,
            count: 1,
            durability: undefined,
            entry: 123,
            flags: 0,
            guid: letter,
            maxDurability: undefined,
            name: "Letter",
            owner: undefined,
            quality: 1,
            randomPropertyId: 0,
          },
          region: "backpack",
          slot: 35,
          status: "occupied",
        } as never,
      ],
    });
    const items = handle.items as unknown as { act: Record<string, unknown> };
    items.act = { ...items.act };
    jest
      .spyOn(items.act, "read")
      .mockResolvedValue({ observedAt: 0, status: "ok" });
    jest.spyOn(items.act, "queryText").mockResolvedValue("Read me.");
    const tool = gearTool.definition(rt);
    rt.session.stopped = true;
    const read = await runTool(tool, { do: "read", item: "Letter" });
    expect(read.details.result.status).toBe("DONE");
    const equip = await runTool(tool, { do: "equip", item: "Letter" });
    expect(equip.details.result).toMatchObject({
      reason: "stopped",
      status: "REFUSED",
    });
  });

  test("a stop that lands while an acting call waits for readiness refuses the call", async () => {
    const { handle, rt } = await createTestRuntime();
    const gate = Promise.withResolvers<boolean>();
    rt.ready.whenReady = () => gate.promise;
    const pending = runTool(socialTool.definition(rt), {
      do: "invite",
      to: "Kaelyn",
    });
    await Promise.resolve();
    rt.session.stopped = true;
    gate.resolve(true);
    const invite = await pending;
    expect(invite.details.result).toMatchObject({
      reason: "stopped",
      status: "REFUSED",
    });
    expect(handle.invite).not.toHaveBeenCalled();
  });

  test("a readiness timeout after a stop refuses stopped, not not_ready", async () => {
    const { rt } = await createTestRuntime();
    const gate = Promise.withResolvers<boolean>();
    rt.ready.whenReady = () => gate.promise;
    const pending = runTool(socialTool.definition(rt), {
      do: "invite",
      to: "Kaelyn",
    });
    await Promise.resolve();
    rt.session.stopped = true;
    gate.resolve(false);
    const invite = await pending;
    expect(invite.details.result).toMatchObject({
      reason: "stopped",
      status: "REFUSED",
    });
  });

  test("character played, calendar list and guild permissions run while stopped; their acting verbs stay refused", async () => {
    const { handle, rt } = await createTestRuntime();
    jest.spyOn(handle.character.act, "playedTime").mockResolvedValue({
      levelSeconds: 20,
      totalSeconds: 100,
      trigger: false,
    });
    const calendar = handle.calendar as unknown as {
      act: Record<string, unknown>;
      state: () => unknown;
    };
    const calendarState = calendar.state();
    calendar.act = {
      ...calendar.act,
      get: jest.fn(async () => ({ state: calendarState, status: "ok" })),
    };
    jest.spyOn(handle.guildadmin.act, "permissions").mockResolvedValue({
      permissions: {
        goldPerDay: -1,
        rank: 0,
        rights: 0,
        tabCount: 0,
        tabs: [],
      },
      status: "ok",
    });
    rt.session.stopped = true;
    const played = await runTool(characterTool.definition(rt), {
      do: "played",
    });
    expect(played.details.result.status).toBe("DONE");
    const list = await runTool(calendarTool.definition(rt), { do: "list" });
    expect(list.details.result.status).toBe("DONE");
    const permissions = await runTool(guildTool.definition(rt), {
      do: "permissions",
    });
    expect(permissions.details.result.status).toBe("DONE");
    const sheathe = await runTool(characterTool.definition(rt), {
      do: "sheathe",
    });
    expect(sheathe.details.result).toMatchObject({
      reason: "stopped",
      status: "REFUSED",
    });
    const create = await runTool(calendarTool.definition(rt), {
      do: "create",
    });
    expect(create.details.result).toMatchObject({
      reason: "stopped",
      status: "REFUSED",
    });
    const rank = await runTool(guildTool.definition(rt), { do: "rank" });
    expect(rank.details.result).toMatchObject({
      reason: "stopped",
      status: "REFUSED",
    });
  });

  test("a read-only call that waits for readiness still runs after a stop", async () => {
    const t = await createTestRuntime();
    const state = talentsState();
    Object.assign(t.handle.talents.act, { catalog: async () => undefined });
    Object.assign(t.handle.talents, { state: () => state });
    Object.assign(t.handle, {
      getControlState: jest.fn(() => ({ selfGuid: 42n })),
      getEntity: jest.fn(() => me()),
      spellDefinition: jest.fn(() => undefined),
    });
    const gate = Promise.withResolvers<boolean>();
    t.rt.ready.whenReady = () => gate.promise;
    const pending = runTool(talentsTool.definition(t.rt), { do: "show" });
    await Promise.resolve();
    t.rt.session.stopped = true;
    gate.resolve(true);
    expect((await pending).details.result.status).toBe("DONE");
  });

  test("a human message through the input path lifts the stop hold for actions", async () => {
    const { handle, rt } = await createTestRuntime();
    const fake = createFakePi();
    installInput(fake.api, rt);
    await fake.emit(human("Stop, we're done."));
    const held = await runTool(socialTool.definition(rt), {
      do: "invite",
      to: "Kaelyn",
    });
    expect(held.details.result).toMatchObject({
      reason: "stopped",
      status: "REFUSED",
    });
    await fake.emit(human("carry on"));
    await fake.emit({ timestamp: 0, turnIndex: 0, type: "turn_start" });
    expect(rt.session.stopped).toBe(false);
    handle.invite = jest.fn(() => jest.advanceTimersByTime(3000));
    const invite = await withFakeTimers(() =>
      runTool(socialTool.definition(rt), { do: "invite", to: "Kaelyn" }),
    );
    expect(invite.details.result).not.toMatchObject({
      reason: "stopped",
      status: "REFUSED",
    });
    expect(handle.invite).toHaveBeenCalledWith("Kaelyn");
  });
});
