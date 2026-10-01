import { jest } from "bun:test";
import {
  type AreaEventOf,
  type Entity,
  ObjectType,
  UNIT_FIELDS,
  type UnitEntity,
} from "@peon/core";
import { Refusal } from "#harness/ops/refusal";
import { setUnits, unitRow } from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { definition } from "#test-support/spell-tool-fixtures";

export type PetsBarEvent = Extract<AreaEventOf<"pets">, { type: "bar" }>;

export const ME = 0x2an;
export const PET = 0xf1_40_00_0c_9f_00_01_e6n;
export const WOLF = 0xf1_30_00_3e_ea_00_0a_bcn;
export const BITE = 17_253;
export const GROWL = 2649;
export const CLAW = 16_827;
export const CALL_PET = 883;
export const REVIVE_PET = 982;
export const DISMISS_PET = 2641;
export const HAPPY = 700_000;
export const BITE_READY = 1000;
export const GROWL_READY = 5000;

export type PetsBar = {
  guid: bigint;
  family: number;
  react: "passive" | "defensive" | "aggressive" | "unknown";
  command: "stay" | "follow" | "attack" | "abandon" | "unknown";
  spells: { spell: number; autocast: "on" | "off" | "passive" }[];
};

export type PetsSnapshot = {
  bar: PetsBar | undefined;
  cooldowns: {
    spell: number;
    readyAt: number | undefined;
    infinite: boolean;
  }[];
  lastRefusal: { reason: string; at: number } | undefined;
  pet:
    | {
        guid: bigint;
        happiness: number;
        health: number;
        maxHealth: number;
        canAbandon: boolean;
      }
    | undefined;
};

export function barState(over: Partial<PetsSnapshot> = {}): PetsSnapshot {
  return {
    bar: {
      command: "follow",
      family: 1,
      guid: PET,
      react: "defensive",
      spells: [
        { autocast: "on", spell: BITE },
        { autocast: "off", spell: GROWL },
        { autocast: "passive", spell: CLAW },
      ],
    },
    cooldowns: [
      { infinite: false, readyAt: BITE_READY, spell: BITE },
      { infinite: false, readyAt: GROWL_READY, spell: GROWL },
    ],
    lastRefusal: undefined,
    pet: {
      canAbandon: true,
      guid: PET,
      happiness: HAPPY,
      health: 410,
      maxHealth: 410,
    },
    ...over,
  };
}

export function unit(init: Partial<UnitEntity> = {}): UnitEntity {
  return {
    class_: 0,
    createComplete: true,
    displayId: 0,
    entry: 1,
    factionTemplate: 0,
    gender: 0,
    guid: PET,
    health: 410,
    level: 10,
    maxHealth: 410,
    maxPower: [],
    name: "Fang",
    npcFlags: 0,
    objectType: ObjectType.UNIT,
    position: undefined,
    power: [],
    race: 0,
    rawFields: new Map(),
    scale: 1,
    target: 0n,
    unitFlags: 0,
    ...init,
  };
}

export type WorldInit = {
  pets?: PetsSnapshot;
  petEntity?: UnitEntity | undefined;
  ownerPet?: bigint | undefined;
  known?: { id: number; name: string }[];
  elapsed?: number;
};

export async function world(init: WorldInit = {}) {
  const t = await createTestRuntime();
  const live = t.handle;
  const pets = init.pets ?? {
    bar: undefined,
    cooldowns: [],
    lastRefusal: undefined,
    pet: undefined,
  };
  const state = { ...pets };
  const livePets = live.pets;
  const seen: PetsBarEvent[] = [];
  live.onAreaEvent((event) => {
    if (event.area === "pets" && event.event.type === "bar")
      seen.push(event.event as PetsBarEvent);
  });
  const petsState = (): PetsSnapshot => {
    const last = seen.at(-1);
    if (last === undefined) return { ...state };
    if (last.cleared) return { ...state, bar: undefined };
    const bar = last.bar;
    return {
      ...state,
      bar: {
        command: bar.command,
        family: bar.family,
        guid: bar.guid,
        react: bar.react,
        spells: bar.spells.map((row) => ({
          autocast: row.autocast as "on" | "off" | "passive",
          spell: row.spell,
        })),
      },
    };
  };
  Object.assign(livePets, { state: petsState });
  const entities = new Map<bigint, Entity>();
  if (init.petEntity !== undefined) entities.set(PET, init.petEntity);
  const owner = unit({ guid: ME, name: "Hunter" });
  const summon = init.ownerPet ?? (init.petEntity === undefined ? 0n : PET);
  const summonFields = new Map([
    [UNIT_FIELDS.SUMMON.offset, Number(summon % 4_294_967_296n)],
    [UNIT_FIELDS.SUMMON.offset + 1, Number(summon / 4_294_967_296n)],
  ]);
  const owned: UnitEntity = { ...owner, rawFields: summonFields };
  entities.set(ME, owned);
  entities.set(ME, owner);
  Object.assign(live, {
    getEntity: jest.fn((guid: bigint) => entities.get(guid)),
  });
  const control = live.getControlState();
  jest
    .spyOn(live, "getControlState")
    .mockImplementation(() => ({ ...control, selfGuid: ME }));
  const book = (
    init.known ?? [
      { id: CALL_PET, name: "Call Pet" },
      { id: REVIVE_PET, name: "Revive Pet" },
      { id: DISMISS_PET, name: "Dismiss Pet" },
    ]
  ).map((entry) => definition({ id: entry.id, name: entry.name }));
  const byId = new Map(book.map((def) => [def.id, def]));
  Object.assign(live, { getSpellbook: jest.fn(async () => book) });
  const petDefs = new Map([
    [BITE, definition({ id: BITE, name: "Bite" })],
    [GROWL, definition({ id: GROWL, name: "Growl" })],
    [CLAW, definition({ id: CLAW, name: "Claw" })],
  ]);
  Object.assign(live, {
    spellDefinition: jest.fn((id: number) => petDefs.get(id) ?? byId.get(id)),
  });
  Object.assign(live, {
    getCombatState: () => ({
      learned: book.map((def) => def.id),
      unknownLearned: [],
    }),
  });
  setUnits(live, [
    unitRow({ distance: 10, guid: WOLF, name: "Wolf", x: 10, y: 0 }),
  ]);
  t.rt.refs.refOf(WOLF);
  const at = (init.elapsed ?? 0) * 1000;
  jest.spyOn(t.rt.clock, "now").mockImplementation(() => at);
  return { ...t, game: live as unknown as typeof live };
}

export async function refusal(promise: Promise<unknown>): Promise<Refusal> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof Refusal)) throw new Error("no refusal");
  return error;
}

export function petBarEvent(guid: bigint, over: Partial<PetsBar> = {}) {
  const base = barState().bar;
  if (!base) throw new Error("bar fixture cleared");
  const bar = { ...base, guid, ...over };
  const event: PetsBarEvent = {
    bar: {
      command: bar.command,
      durationMs: 0,
      family: bar.family,
      flags: 0,
      guid: bar.guid,
      react: bar.react,
      receivedAt: 0,
      slots: [],
      spells: bar.spells.map((row) => ({
        autocast: row.autocast,
        spell: row.spell,
      })),
    },
    cleared: false,
    type: "bar",
  };
  return event;
}
