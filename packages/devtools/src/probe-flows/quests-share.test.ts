import { describe, expect, jest, test } from "bun:test";
import type { UnitEntity, WorldHandle } from "@peon/core";
import {
  fakeAwait,
  fakeRejection,
  withFakeTimers,
} from "@peon/core/test-support/fake-time";
import {
  createMockHandle,
  type MockHandle,
} from "@peon/core/test-support/mock-handle";
import {
  partyMember,
  partyState,
} from "@peon/core/test-support/party-fixtures";
import { type FlowContext, settleWithin } from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/quests-share";

const ESCORT_QUEST = 8488;
const SHARER = 0x2bn;
const MIRVEDA = 0xf1_30_00_3e_99_00_11_11n;

type QuestState = WorldHandle["getQuestState"] extends () => infer S
  ? S
  : never;

function mirvedaEntity(): UnitEntity {
  const position = { mapId: 530, orientation: 0, x: 1, y: 2, z: 3 };
  return {
    class_: 1,
    displayId: 1,
    entry: 15_402,
    factionTemplate: 1604,
    gender: 0,
    guid: MIRVEDA,
    health: 100,
    level: 30,
    maxHealth: 100,
    maxPower: [],
    name: "Apprentice Mirveda",
    npcFlags: 0x2,
    objectType: 3,
    position,
    power: [],
    race: 0,
    rawFields: new Map(),
    scale: 1,
    target: 0n,
    unitFlags: 0,
  };
}

function sharerContext(log: readonly number[]): FlowContext & {
  handle: MockHandle;
} {
  const handle = createMockHandle();
  handle.queryNearby = () =>
    [{ entity: mirvedaEntity() }] as unknown as ReturnType<
      WorldHandle["queryNearby"]
    >;
  handle.getPartyState = (() =>
    partyState({
      inGroup: true,
      members: [partyMember({ guid: SHARER })],
    })) as unknown as MockHandle["getPartyState"];
  const questState = handle.getQuestState();
  handle.getQuestState = jest.fn(
    (): QuestState => ({
      ...questState,
      dialog: {
        data: {
          activateAccept: 1,
          autoAccept: false,
          details: "",
          dividerGuid: 0n,
          emotes: [],
          flags: 0,
          guid: MIRVEDA,
          objectives: "",
          questId: ESCORT_QUEST,
          rewards: {
            arenaPoints: 0,
            choices: [],
            experience: 0,
            factions: [],
            honor: 0,
            honorMultiplier: 0,
            items: [],
            money: 0,
            reputationMask: 0,
            spellCastId: 0,
            spellId: 0,
            talents: 0,
            titleId: 0,
          },
          suggestedPlayers: 0,
          title: "Unexpected Results",
          unknown: 0,
        },
        kind: "details",
      },
      log: {
        ...questState.log,
        slots: log.map((questId, slot) => ({
          counters: [undefined, undefined, undefined, undefined],
          expiresAtSeconds: undefined,
          flags: undefined,
          questId,
          slot,
        })),
      },
    }),
  );
  return { args: { mode: "escort" }, handle, settle: settleWithin(100) };
}

type Offer = { kind: "share" | "confirm"; questId: number };

function partnerContext(offer: Offer): FlowContext {
  const handle = createMockHandle();
  const state = handle.quests.state();
  jest.spyOn(handle.quests, "state").mockReturnValue({
    ...state,
    share: {
      dropped: state.share?.dropped ?? 0,
      offer: { at: 0, from: SHARER, title: "Offered", ...offer },
      push: state.share?.push,
    },
  });
  return {
    args: { mode: "escort-confirm" },
    handle,
    settle: settleWithin(100),
  };
}

describe("quests-share escort mode", () => {
  test("the sharer takes the escort quest and waits for it in the log", () =>
    withFakeTimers(async () => {
      const ctx = sharerContext([ESCORT_QUEST]);
      expect(await fakeAwait(flow.run(ctx), 1000)).toMatchObject({
        questId: ESCORT_QUEST,
      });
      expect(ctx.handle.talk).toHaveBeenCalledWith(MIRVEDA);
      expect(ctx.handle.acceptQuest).toHaveBeenCalledTimes(1);
    }));

  test("the sharer waits when the quest never enters the log", () =>
    withFakeTimers(async () => {
      const ctx = sharerContext([]);
      expect(await fakeRejection(flow.run(ctx), 1000)).toContain(
        `quest ${ESCORT_QUEST} did not enter the log`,
      );
      expect(ctx.handle.talk).toHaveBeenCalledWith(MIRVEDA);
    }));

  test("the partner prints a confirm offer for the escort quest", () =>
    withFakeTimers(async () => {
      const ctx = partnerContext({ kind: "confirm", questId: ESCORT_QUEST });
      expect(await fakeAwait(flow.run(ctx), 1000)).toMatchObject({
        from: `0x${SHARER.toString(16)}`,
        questId: ESCORT_QUEST,
      });
    }));

  test("an ordinary shared-quest offer is not an escort prompt", () =>
    withFakeTimers(async () => {
      const ctx = partnerContext({ kind: "share", questId: 8329 });
      expect(await fakeRejection(flow.run(ctx), 1000)).toContain(
        "no escort prompt was offered",
      );
    }));

  test("a confirm offer for another quest is not the escort prompt", () =>
    withFakeTimers(async () => {
      const ctx = partnerContext({ kind: "confirm", questId: 8329 });
      expect(await fakeRejection(flow.run(ctx), 1000)).toContain(
        "no escort prompt was offered",
      );
    }));
});
