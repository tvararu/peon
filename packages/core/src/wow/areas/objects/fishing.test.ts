import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  objectsCustomAnimBody,
  objectsDespawnAnimBody,
} from "#test-support/areas/objects";
import { spellsSpellStartBody } from "#test-support/areas/spells";
import { EntityStore } from "#test-support/internals";
import { FISHING_FAIL_WATER } from "#wow/areas/objects/protocol";
import type { ObjectsEvent } from "#wow/areas/objects/store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketWriter } from "#wow/protocol/packet";
import { GAMEOBJECT_FIELDS } from "#wow/protocol/update-fields";

const SELF = 0x42n;
const OTHER = 0x77n;
const BOBBER = 0xf1_10_8b_07_00_00_00_01n;
const CHEST = 0xf1_10_2c_14_00_00_52_80n;
const FISHING = 7620;
const BOBBER_ENTRY = 35_591;

function createdBy(guid: bigint) {
  const offset = GAMEOBJECT_FIELDS.CREATED_BY.offset;
  return new Map([
    [offset, Number(guid & 0xff_ff_ff_ffn)],
    [offset + 1, Number(guid >> 32n)],
  ]);
}

function rig() {
  const world = new EntityStore();
  const h = areaRig("objects", {
    getEntity: (guid) => world.get(guid),
    selfGuid: SELF,
  });
  world.onEvent((event) => h.events.entity.emit(event));
  const events: ObjectsEvent[] = [];
  h.stores.areas.objects.onEvent((event) => events.push(event));
  const state = () => h.stores.areas.objects.snapshot();
  const cast = (spellId = FISHING, caster = SELF) =>
    h.inject(
      GameOpcode.SMSG_SPELL_START,
      spellsSpellStartBody({
        caster,
        castCount: 1,
        spellId,
        flags: 0,
        timer: 0,
      }),
    );
  const bobber = (owner: bigint, guid = BOBBER) =>
    world.create(guid, ObjectType.GAMEOBJECT, {
      entry: BOBBER_ENTRY,
      rawFields: createdBy(owner),
    } as never);
  return { cast, bobber, events, rig: h, state, world };
}

function failureBody(spellId: number): Uint8Array {
  const w = new PacketWriter();
  w.uint8(1);
  w.uint32LE(spellId);
  w.uint8(FISHING_FAIL_WATER);
  return w.finish();
}

describe("objects animations", () => {
  test("a custom animation is kept by guid and cleared when the object disappears", () => {
    const { rig: r, state, world } = rig();
    world.create(CHEST, ObjectType.GAMEOBJECT, { entry: 1 } as never);
    r.inject(
      GameOpcode.SMSG_GAMEOBJECT_CUSTOM_ANIM,
      objectsCustomAnimBody(CHEST, 2),
    );
    expect(state().anims.get(CHEST)).toBe(2);
    world.destroy(CHEST);
    expect(state().anims.has(CHEST)).toBe(false);
  });

  test("a despawn animation is kept until the object disappears, even for a guid never seen", () => {
    const { rig: r, state, world } = rig();
    world.create(CHEST, ObjectType.GAMEOBJECT, { entry: 1 } as never);
    r.inject(
      GameOpcode.SMSG_GAMEOBJECT_DESPAWN_ANIM,
      objectsDespawnAnimBody(CHEST),
    );
    r.inject(
      GameOpcode.SMSG_GAMEOBJECT_DESPAWN_ANIM,
      objectsDespawnAnimBody(OTHER),
    );
    expect(state().despawning.has(CHEST)).toBe(true);
    expect(state().despawning.has(OTHER)).toBe(true);
    world.destroy(CHEST);
    expect(state().despawning.has(CHEST)).toBe(false);
  });

  test("the despawn set stays bounded when no disappear follows", () => {
    const { rig: r, state } = rig();
    for (let i = 1n; i <= 400n; i++)
      r.inject(
        GameOpcode.SMSG_GAMEOBJECT_DESPAWN_ANIM,
        objectsDespawnAnimBody(i),
      );
    expect(state().despawning.size).toBeLessThan(400);
    expect(state().despawning.has(400n)).toBe(true);
  });
});

describe("objects fishing", () => {
  test("casting a fishing spell starts the cast phase and ignores other casters and spells", () => {
    const { cast, state } = rig();
    cast(FISHING, OTHER);
    cast(2096);
    expect(state().fishing).toBeUndefined();
    cast();
    expect(state().fishing).toEqual({ bobber: undefined, phase: "cast" });
  });

  test("the caster's own bobber moves the phase to waiting; another player's does not", () => {
    const { bobber, cast, state } = rig();
    cast();
    bobber(OTHER, 0xf1_10_8b_07_00_00_00_09n);
    expect(state().fishing?.phase).toBe("cast");
    bobber(SELF);
    expect(state().fishing).toEqual({ bobber: BOBBER, phase: "waiting" });
  });

  test("an own object created while no cast is running is not a bobber", () => {
    const { bobber, state } = rig();
    bobber(SELF);
    expect(state().fishing).toBeUndefined();
  });

  test("the bobber's custom animation hooks the fish once and emits fish_hooked", () => {
    const { bobber, cast, events, rig: r, state } = rig();
    cast();
    bobber(SELF);
    r.inject(
      GameOpcode.SMSG_GAMEOBJECT_CUSTOM_ANIM,
      objectsCustomAnimBody(CHEST, 0),
    );
    expect(events).toEqual([]);
    r.inject(
      GameOpcode.SMSG_GAMEOBJECT_CUSTOM_ANIM,
      objectsCustomAnimBody(BOBBER, 0),
    );
    expect(state().fishing).toEqual({ bobber: BOBBER, phase: "hooked" });
    expect(events).toEqual([{ type: "fish_hooked", bobber: BOBBER }]);
  });

  test("a bobber animation before the bobber is known does not hook", () => {
    const { cast, events, rig: r, state } = rig();
    cast();
    r.inject(
      GameOpcode.SMSG_GAMEOBJECT_CUSTOM_ANIM,
      objectsCustomAnimBody(BOBBER, 0),
    );
    expect(events).toEqual([]);
    expect(state().fishing?.phase).toBe("cast");
  });

  test("SMSG_FISH_NOT_HOOKED and SMSG_FISH_ESCAPED end the fishing state and emit their events", () => {
    const { bobber, cast, events, rig: r, state } = rig();
    cast();
    bobber(SELF);
    r.inject(GameOpcode.SMSG_FISH_NOT_HOOKED, new Uint8Array());
    expect(state().fishing).toBeUndefined();
    cast();
    r.inject(GameOpcode.SMSG_FISH_ESCAPED, new Uint8Array());
    expect(state().fishing).toBeUndefined();
    expect(events).toEqual([
      { type: "fish_not_hooked" },
      { type: "fish_escaped" },
    ]);
  });

  test("the bobber disappearing ends the fishing state, and a later cast starts fresh", () => {
    const { bobber, cast, state, world } = rig();
    cast();
    bobber(SELF);
    world.destroy(BOBBER);
    expect(state().fishing).toBeUndefined();
    cast();
    expect(state().fishing).toEqual({ bobber: undefined, phase: "cast" });
  });

  test("a failed fishing cast ends the cast phase but another spell's failure does not", () => {
    const { cast, rig: r, state } = rig();
    cast();
    r.inject(GameOpcode.SMSG_CAST_FAILED, failureBody(2096));
    expect(state().fishing?.phase).toBe("cast");
    r.inject(GameOpcode.SMSG_CAST_FAILED, failureBody(FISHING));
    expect(state().fishing).toBeUndefined();
  });

  test("a failure after the bobber is waiting leaves the bobber state alone", () => {
    const { bobber, cast, rig: r, state } = rig();
    cast();
    bobber(SELF);
    r.inject(GameOpcode.SMSG_CAST_FAILED, failureBody(FISHING));
    expect(state().fishing?.phase).toBe("waiting");
  });

  test("the store never sends a packet for the bobber", () => {
    const { bobber, cast, rig: r } = rig();
    cast();
    bobber(SELF);
    r.inject(
      GameOpcode.SMSG_GAMEOBJECT_CUSTOM_ANIM,
      objectsCustomAnimBody(BOBBER, 0),
    );
    expect(r.sent).toEqual([]);
  });
});
