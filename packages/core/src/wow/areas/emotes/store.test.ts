import { describe, expect, test } from "bun:test";
import { testStores } from "#test-support/session-fixtures";
import { EmoteStore, type EmotesEvent } from "#wow/areas/emotes/store";
import type { SessionDeps } from "#wow/session-stores";

const ME = 0xde1n;
const OTHER = 0xde2n;
const CREATURE = 0xf1_30_00_3d_28_01_48_d2n;
const DANCE_STATE = 10;

function setup() {
  const deps: SessionDeps = {
    getEntity: () => undefined,
    now: () => 0,
    selfGuid: () => ME,
    send: () => undefined,
    updateEntity: () => undefined,
  };
  const store = new EmoteStore(deps, testStores(deps));
  const seen: EmotesEvent[] = [];
  store.onEvent((event) => seen.push(event));
  return { seen, store };
}

describe("EmoteStore", () => {
  test("starts with no emote states", () => {
    expect(setup().store.snapshot()).toEqual({ emoteStates: [] });
  });

  test("an animation emits emote", () => {
    const { seen, store } = setup();
    store.emote({ emote: 17, guid: CREATURE });
    expect(seen).toEqual([{ emote: 17, guid: CREATURE, type: "emote" }]);
  });

  test("a text emote names the sender, whether it is the character, and the target", () => {
    const { seen, store } = setup();
    store.textEmote({
      emoteNum: 0,
      guid: OTHER,
      target: "Tom",
      textEmote: 101,
    });
    store.textEmote({
      emoteNum: 0xff_ff_ff_ff,
      guid: ME,
      target: "",
      textEmote: 34,
    });
    expect(seen).toEqual([
      {
        emoteNum: 0,
        guid: OTHER,
        self: false,
        target: "Tom",
        textEmote: 101,
        type: "text_emote",
      },
      {
        emoteNum: 0xff_ff_ff_ff,
        guid: ME,
        self: true,
        target: undefined,
        textEmote: 34,
        type: "text_emote",
      },
    ]);
  });

  test("emote states hold non-zero values and emit nothing", () => {
    const { seen, store } = setup();
    store.setEmoteState(CREATURE, DANCE_STATE);
    store.setEmoteState(OTHER, 0);
    store.setEmoteState(ME, 12);
    expect(store.snapshot().emoteStates).toEqual([
      { guid: CREATURE, state: DANCE_STATE },
      { guid: ME, state: 12 },
    ]);
    store.setEmoteState(CREATURE, 0);
    store.setEmoteState(ME, undefined);
    expect(store.snapshot().emoteStates).toEqual([]);
    expect(seen).toEqual([]);
  });

  test("forget drops a unit's emote state", () => {
    const { store } = setup();
    store.setEmoteState(CREATURE, DANCE_STATE);
    store.forget(CREATURE);
    expect(store.snapshot().emoteStates).toEqual([]);
  });
});
