import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  emotesEmoteBody,
  emotesTextEmoteBody,
} from "#test-support/areas/emotes";
import type { EmotesEvent } from "#wow/areas/emotes/store";
import type { UnitEntity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";

const ME = 0xde1n;
const PARTNER = 0xde2n;
const CREATURE = 0xf1_30_00_3d_28_01_48_d2n;
const WOUND_CRITICAL = 8;
const EMOTE_STATE_DANCE = 10;
const DANCE = 34;
const WAVE = 101;

function dancer(): UnitEntity {
  return {
    class_: 1,
    displayId: 1,
    entry: 0,
    factionTemplate: 1,
    gender: 0,
    guid: PARTNER,
    health: 100,
    level: 10,
    maxHealth: 100,
    maxPower: [0, 0, 0, 0, 0, 0, 0],
    name: "Tom",
    npcFlags: 0,
    objectType: ObjectType.PLAYER,
    position: undefined,
    power: [0, 0, 0, 0, 0, 0, 0],
    race: 10,
    rawFields: new Map([
      [UNIT_FIELDS.NPC_EMOTESTATE.offset, EMOTE_STATE_DANCE],
    ]),
    scale: 1,
    target: 0n,
    unitFlags: 0,
  };
}

function rigWithEvents() {
  const rig = areaRig("emotes", { selfGuid: ME });
  const seen: EmotesEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  return { rig, seen };
}

describe("emotes area wiring", () => {
  test("SMSG_EMOTE emits emote", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_EMOTE,
        emotesEmoteBody({ emote: WOUND_CRITICAL, guid: CREATURE }),
      );
      expect(seen).toEqual([
        { emote: WOUND_CRITICAL, guid: CREATURE, type: "emote" },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_TEXT_EMOTE emits text_emote for the character and for others", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_TEXT_EMOTE,
        emotesTextEmoteBody({
          emoteNum: 0xff_ff_ff_ff,
          guid: ME,
          name: "",
          textEmote: DANCE,
        }),
      );
      rig.inject(
        GameOpcode.SMSG_TEXT_EMOTE,
        emotesTextEmoteBody({
          emoteNum: 0,
          guid: PARTNER,
          name: "Fgklkacgjjg",
          textEmote: WAVE,
        }),
      );
      expect(seen).toEqual([
        {
          emoteNum: 0xff_ff_ff_ff,
          guid: ME,
          self: true,
          target: undefined,
          textEmote: DANCE,
          type: "text_emote",
        },
        {
          emoteNum: 0,
          guid: PARTNER,
          self: false,
          target: "Fgklkacgjjg",
          textEmote: WAVE,
          type: "text_emote",
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("an entity update with the dance state shows in the snapshot", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.events.entity.emit({
        changed: ["rawFields"],
        entity: dancer(),
        type: "update",
      });
      expect(rig.handle.state()).toEqual({
        emoteStates: [{ guid: PARTNER, state: EMOTE_STATE_DANCE }],
      });
      expect(seen).toEqual([]);
    } finally {
      rig.dispose();
    }
  });
});
