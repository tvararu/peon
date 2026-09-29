import { describe, expect, jest, test } from "bun:test";
import {
  type AreaEventOf,
  type Entity,
  ObjectType,
  UNIT_FIELDS,
  type UnitEntity,
} from "@peon/core";
import { fakeAwait, withFakeTimers } from "@peon/core/test-support/fake-time";
import { petSpec } from "#harness/areas/pets/tool";
import { Refusal } from "#harness/ops/refusal";
import { setUnits, toolCtx, unitRow } from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { definition } from "#test-support/spell-tool-fixtures";

type PetsBarEvent = Extract<AreaEventOf<"pets">, { type: "bar" }>;

const ME = 0x2an;
const PET = 0xf1_40_00_0c_9f_00_01_e6n;
const WOLF = 0xf1_30_00_3e_ea_00_0a_bcn;
const BITE = 17_253;
const GROWL = 2649;
const CLAW = 16_827;
const CALL_PET = 883;
const REVIVE_PET = 982;
const DISMISS_PET = 2641;
const HAPPY = 700_000;
const BITE_READY = 1000;
const GROWL_READY = 5000;

type PetsBar = {
  guid: bigint;
  family: number;
  react: "passive" | "defensive" | "aggressive" | "unknown";
  command: "stay" | "follow" | "attack" | "abandon" | "unknown";
  spells: { spell: number; autocast: "on" | "off" | "passive" }[];
};

type PetsSnapshot = {
  bar: PetsBar | undefined;
  cooldowns: { spell: number; readyAt: number | undefined }[];
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

function barState(over: Partial<PetsSnapshot> = {}): PetsSnapshot {
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
      { readyAt: BITE_READY, spell: BITE },
      { readyAt: GROWL_READY, spell: GROWL },
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

function unit(init: Partial<UnitEntity> = {}): UnitEntity {
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

type WorldInit = {
  pets?: PetsSnapshot;
  petEntity?: UnitEntity | undefined;
  ownerPet?: bigint | undefined;
  known?: { id: number; name: string }[];
  elapsed?: number;
};

async function world(init: WorldInit = {}) {
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

async function refusal(promise: Promise<unknown>): Promise<Refusal> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof Refusal)) throw new Error("no refusal");
  return error;
}

function petBarEvent(guid: bigint, over: Partial<PetsBar> = {}) {
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

describe("pet status", () => {
  test("status sends nothing and reports no pet when the bar is missing", async () => {
    const t = await world();
    const out = await petSpec.run({}, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(out.detail).toBe("You have no pet out.");
    expect(t.game.sent).toHaveLength(0);
  });

  test("status prints name, family, level, health, happiness, stance, command and spells with autocast and cooldowns", async () => {
    const t = await world({
      elapsed: 2,
      petEntity: unit(),
      pets: barState(),
    });
    const out = await petSpec.run({}, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("Fang");
    expect(out.detail).toContain("Wolf");
    expect(out.detail).toContain("level 10");
    expect(out.detail).toContain("410/410");
    expect(out.detail).toContain("happy");
    expect(out.detail).toContain("defensive, follow");
    expect(out.body.join("\n")).toContain("Bite (17253): autocast on, ready.");
    expect(out.body.join("\n")).toContain(
      "Growl (2649): autocast off, ready in 3 s.",
    );
    expect(t.game.sent).toHaveLength(0);
  });
});

describe("pet follow, stay, stance and stop", () => {
  test("follow sends one petCommand and is DONE on the follow bar", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    const act = jest
      .spyOn(t.game.pets.act, "petCommand")
      .mockImplementation(() => {
        t.game.triggerAreaEvent("pets", petBarEvent(PET));
        return { ok: true };
      });
    const out = await petSpec.run({ do: "follow" }, toolCtx(t));
    expect(act).toHaveBeenCalledWith("follow");
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("follow");
  });

  test("a follow bar while waiting for stay keeps waiting, then times out UNCONFIRMED", async () => {
    await withFakeTimers(async () => {
      const t = await world({ petEntity: unit(), pets: barState() });
      const commanded = jest
        .spyOn(t.game.pets.act, "petCommand")
        .mockImplementation(() => {
          t.game.triggerAreaEvent("pets", petBarEvent(PET));
          return { ok: true };
        });
      const run = petSpec.run({ do: "stay" }, toolCtx(t));
      const out = await fakeAwait(run, 10_000);
      expect(commanded).toHaveBeenCalledWith("stay");
      expect(out.status).toBe("UNCONFIRMED");
    });
  });
});

describe("pet stance and stop", () => {
  test("stance passive sends one petStance and is DONE on the passive bar", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    const act = jest
      .spyOn(t.game.pets.act, "petStance")
      .mockImplementation(() => {
        t.game.triggerAreaEvent("pets", petBarEvent(PET, { react: "passive" }));
        return { ok: true };
      });
    const out = await petSpec.run(
      { do: "stance", what: "passive" },
      toolCtx(t),
    );
    expect(act).toHaveBeenCalledWith("passive");
    expect(out.status).toBe("DONE");
  });

  test("a missing stance is REFUSED missing_stance and sends nothing", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    const stance = jest.spyOn(t.game.pets.act, "petStance");
    const refused = await refusal(petSpec.run({ do: "stance" }, toolCtx(t)));
    expect(refused.reason).toBe("missing_stance");
    expect(stance).not.toHaveBeenCalled();
  });

  test("stop sends petStopAttack then follow and is DONE on the follow bar", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    const stopped = jest
      .spyOn(t.game.pets.act, "petStopAttack")
      .mockImplementation(() => ({ ok: true }));
    const followed = jest
      .spyOn(t.game.pets.act, "petCommand")
      .mockImplementation(() => {
        t.game.triggerAreaEvent("pets", petBarEvent(PET));
        return { ok: true };
      });
    const out = await petSpec.run({ do: "stop" }, toolCtx(t));
    expect(stopped).toHaveBeenCalledTimes(1);
    expect(followed).toHaveBeenCalledWith("follow");
    expect(out.status).toBe("DONE");
  });

  test("no pet out is REFUSED no_pet", async () => {
    const t = await world();
    const refused = await refusal(petSpec.run({ do: "follow" }, toolCtx(t)));
    expect(refused.reason).toBe("no_pet");
  });
});

describe("pet attack", () => {
  test("attack sends petAttack at the seen unit and is DONE when the pet targets it", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    const sent = jest.spyOn(t.game, "petAttack").mockImplementation(() => {
      const pet = { ...unit(), target: WOLF };
      Object.assign(t.game.getEntity(PET) ?? {}, { target: WOLF });
      t.game.triggerEntityEvent({
        changed: ["target"],
        entity: pet,
        type: "update",
      } as never);
    });
    const out = await petSpec.run({ do: "attack", target: "u1" }, toolCtx(t));
    expect(sent).toHaveBeenCalledWith(PET, WOLF);
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("Wolf");
  });

  test("an unseen target is REFUSED not_seen and sends nothing", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    const sent = jest.spyOn(t.game, "petAttack");
    const refused = await refusal(
      petSpec.run({ do: "attack", target: "u9" }, toolCtx(t)),
    );
    expect(refused.reason).toBe("not_seen");
    expect(sent).not.toHaveBeenCalled();
  });

  test("no answer within 5 s is UNCONFIRMED with a walk-back next", async () => {
    await withFakeTimers(async () => {
      const t = await world({ petEntity: unit(), pets: barState() });
      const run = petSpec.run({ do: "attack", target: "u1" }, toolCtx(t));
      const out = await fakeAwait(run, 10_000);
      expect(out.status).toBe("UNCONFIRMED");
      expect(out.next).toContain("travel");
    });
  });
});

describe("pet call, revive and dismiss", () => {
  test("call casts Call Pet and is DONE on the new bar", async () => {
    const t = await world({ petEntity: unit() });
    const cast = jest.spyOn(t.game, "cast").mockImplementation(() => {
      t.game.triggerAreaEvent("pets", petBarEvent(PET));
    });
    const out = await petSpec.run({ do: "call" }, toolCtx(t));
    expect(cast).toHaveBeenCalledWith(CALL_PET, ME);
    expect(out.status).toBe("DONE");
  });

  test("call with the pet already out is REFUSED already_out and sends nothing", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    const cast = jest.spyOn(t.game, "cast");
    const refused = await refusal(petSpec.run({ do: "call" }, toolCtx(t)));
    expect(refused.reason).toBe("already_out");
    expect(cast).not.toHaveBeenCalled();
  });

  test("revive casts Revive Pet on a dead pet and is DONE on the bar", async () => {
    const t = await world({
      petEntity: unit({ health: 0 }),
      pets: barState({
        pet: {
          canAbandon: true,
          guid: PET,
          happiness: HAPPY,
          health: 0,
          maxHealth: 410,
        },
      }),
    });
    const cast = jest.spyOn(t.game, "cast").mockImplementation(() => {
      t.game.triggerAreaEvent("pets", petBarEvent(PET));
    });
    const out = await petSpec.run({ do: "revive" }, toolCtx(t));
    expect(cast).toHaveBeenCalledWith(REVIVE_PET, ME);
    expect(out.status).toBe("DONE");
  });

  test("dismiss casts Dismiss Pet on a hunter pet and is DONE on the clear", async () => {
    const t = await world({ petEntity: unit(), pets: barState() });
    const cast = jest.spyOn(t.game, "cast").mockImplementation(() => {
      t.game.triggerAreaEvent("pets", { cleared: true, type: "bar" });
    });
    const out = await petSpec.run({ do: "dismiss" }, toolCtx(t));
    expect(cast).toHaveBeenCalledWith(DISMISS_PET, ME);
    expect(out.status).toBe("DONE");
  });

  test("dismiss on a pet that cannot be abandoned uses petCommand dismiss", async () => {
    const t = await world({
      petEntity: unit(),
      pets: barState({
        pet: {
          canAbandon: false,
          guid: PET,
          happiness: HAPPY,
          health: 410,
          maxHealth: 410,
        },
      }),
    });
    const cast = jest.spyOn(t.game, "cast");
    const commanded = jest
      .spyOn(t.game.pets.act, "petCommand")
      .mockImplementation(() => {
        t.game.triggerAreaEvent("pets", { cleared: true, type: "bar" });
        return { ok: true };
      });
    const out = await petSpec.run({ do: "dismiss" }, toolCtx(t));
    expect(commanded).toHaveBeenCalledWith("dismiss");
    expect(cast).not.toHaveBeenCalled();
    expect(out.status).toBe("DONE");
  });

  test("no answer within 5 s is UNCONFIRMED", async () => {
    await withFakeTimers(async () => {
      const t = await world({ petEntity: unit() });
      const run = petSpec.run({ do: "call" }, toolCtx(t));
      const out = await fakeAwait(run, 10_000);
      expect(out.status).toBe("UNCONFIRMED");
    });
  });
});
