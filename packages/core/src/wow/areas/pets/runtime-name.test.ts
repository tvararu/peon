import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  petsNameInvalidBody,
  petsNameQueryResponseBody,
  petsPetSpellsBody,
} from "#test-support/areas/pets";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import { buildPetNameQuery, buildPetRename } from "#wow/areas/pets/protocol";
import { petsRuntime } from "#wow/areas/pets/runtime";
import type { Entity } from "#wow/entity-store";
import { GameOpcode } from "#wow/protocol/opcodes";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";

const ME = 0x2an;
const PET = 0xf1_40_00_0c_a9_00_02_0bn;
const NUMBER = 42;

const BAR = petsPetSpellsBody({
  command: 1,
  cooldowns: [],
  duration: 0,
  family: 31,
  flags: 0,
  guid: PET,
  react: 0,
  slots: [
    { action: 2, type: 0x07 },
    { action: 1, type: 0x07 },
    { action: 0, type: 0x07 },
    { action: 17_253, type: 0xc1 },
    { action: 2649, type: 0x81 },
    { action: 23_099, type: 0x01 },
    { action: 0, type: 0x01 },
    { action: 2, type: 0x06 },
    { action: 1, type: 0x06 },
    { action: 0, type: 0x06 },
  ],
  spells: [
    { action: 17_253, type: 0xc1 },
    { action: 2649, type: 0x81 },
    { action: 23_099, type: 0x01 },
  ],
});

function rig(bytes2: number, timestamp: number) {
  const fields = new Map<number, number>([
    [UNIT_FIELDS.BYTES_2.offset, bytes2],
    [UNIT_FIELDS.PETNUMBER.offset, NUMBER],
    [UNIT_FIELDS.PET_NAME_TIMESTAMP.offset, timestamp],
    [UNIT_FIELDS.HEALTH.offset, 410],
    [UNIT_FIELDS.MAXHEALTH.offset, 410],
  ]);
  const pet = { guid: PET, rawFields: fields } as unknown as Entity;
  const owner = {
    guid: ME,
    rawFields: new Map([
      [UNIT_FIELDS.SUMMON.offset, 0xa9_00_02_0b],
      [UNIT_FIELDS.SUMMON.offset + 1, 0xf1_40_00_0c],
    ]),
  } as unknown as Entity;
  const r = areaRig("pets", {
    getEntity: (guid) => [owner, pet].find((row) => row.guid === guid),
    selfGuid: ME,
  });
  r.inject(GameOpcode.SMSG_PET_SPELLS, BAR);
  return { fields, r };
}

const QUERY = {
  body: buildPetNameQuery(NUMBER, PET),
  opcode: GameOpcode.CMSG_PET_NAME_QUERY,
};

describe("pets names runtime", () => {
  test("a new bar asks for the pet name (PetHandler.cpp:616-627)", () => {
    const { r } = rig(0x01_00_00, 7);
    try {
      const last = r.sent.at(-1);
      expect(last?.opcode).toBe(GameOpcode.CMSG_PET_NAME_QUERY);
      const sent = [...(last?.body ?? [])];
      expect(sent).toEqual([...QUERY.body]);
    } finally {
      r.dispose();
    }
  });

  test("a cached name at the same timestamp asks nothing", () => {
    const { r } = rig(0x01_00_00, 7);
    try {
      const before = r.sent.length;
      r.inject(
        GameOpcode.SMSG_PET_NAME_QUERY_RESPONSE,
        petsNameQueryResponseBody({
          name: "Rex",
          number: NUMBER,
          timestamp: 7,
        }),
      );
      expect(r.sent).toHaveLength(before);
    } finally {
      r.dispose();
    }
  });
  test("a transition re-query marks the cached name stale until the reply", () => {
    const { fields, r } = rig(0x01_00_00, 7);
    try {
      r.inject(
        GameOpcode.SMSG_PET_NAME_QUERY_RESPONSE,
        petsNameQueryResponseBody({
          name: "Rex",
          number: NUMBER,
          timestamp: 7,
        }),
      );
      fields.set(UNIT_FIELDS.BYTES_2.offset, 0);
      r.events.entity.emit({
        changed: ["rawFields"],
        entity: { guid: PET, rawFields: fields } as unknown as Entity,
        type: "update",
      });
      expect(r.sent.at(-1)?.opcode).toBe(GameOpcode.CMSG_PET_NAME_QUERY);
      expect(r.handle.state().renamePending).toContain(NUMBER);
      r.inject(
        GameOpcode.SMSG_PET_NAME_QUERY_RESPONSE,
        petsNameQueryResponseBody({
          name: "Fangtooth",
          number: NUMBER,
          timestamp: 7,
        }),
      );
      expect(r.handle.state().renamePending).toEqual([]);
      expect(r.handle.state().names[NUMBER]?.name).toBe("Fangtooth");
    } finally {
      r.dispose();
    }
  });

  test("an entity update with a newer timestamp asks again", () => {
    const { fields, r } = rig(0x01_00_00, 7);
    try {
      r.inject(
        GameOpcode.SMSG_PET_NAME_QUERY_RESPONSE,
        petsNameQueryResponseBody({
          name: "Rex",
          number: NUMBER,
          timestamp: 7,
        }),
      );
      const before = r.sent.length;
      fields.set(UNIT_FIELDS.PET_NAME_TIMESTAMP.offset, 9);
      r.events.entity.emit({
        changed: ["rawFields"],
        entity: { guid: PET, rawFields: fields } as unknown as Entity,
        type: "update",
      });
      expect(r.sent).toHaveLength(before + 1);
      expect(r.sent.at(-1)?.opcode).toBe(GameOpcode.CMSG_PET_NAME_QUERY);
    } finally {
      r.dispose();
    }
  });
  test("renamePet refuses when the pet is not renamable", () => {
    const { r } = rig(0x00_00_00, 7);
    try {
      expect(r.handle.act.renamePet("Fangtooth")).toEqual({
        ok: false,
        reason: "not_renamable",
      });
      expect(r.sent).toHaveLength(1);
    } finally {
      r.dispose();
    }
  });

  test("renamePet sends CMSG_PET_RENAME (PetHandler.cpp:840-929)", () => {
    const { r } = rig(0x01_00_00, 7);
    try {
      const before = r.sent.length;
      expect(r.handle.act.renamePet("Fangtooth")).toEqual({ ok: true });
      const last = r.sent.at(-1);
      expect(last?.opcode).toBe(GameOpcode.CMSG_PET_RENAME);
      expect([...(last?.body ?? [])]).toEqual([
        ...buildPetRename(PET, "Fangtooth"),
      ]);
      expect(r.sent.length).toBe(before + 1);
    } finally {
      r.dispose();
    }
  });

  test("a refusal ends the rename wait with no unanswered event", async () => {
    await withFakeTimers(async () => {
      const { r } = rig(0x01_00_00, 7);
      const seen: string[] = [];
      const off = r.handle.onEvent((event) => seen.push(event.type));
      try {
        expect(r.handle.act.renamePet("A")).toEqual({ ok: true });
        r.inject(
          GameOpcode.SMSG_PET_NAME_INVALID,
          petsNameInvalidBody({ code: 3, name: "A" }),
        );
        await elapse(6000);
        expect(seen).toEqual(["name_invalid"]);
      } finally {
        off();
        r.dispose();
      }
    });
  });

  test("a rename with no reply emits unanswered", async () => {
    await withFakeTimers(async () => {
      const { r } = rig(0x01_00_00, 7);
      const seen: string[] = [];
      const off = r.handle.onEvent((event) => seen.push(event.type));
      try {
        expect(r.handle.act.renamePet("Fangtooth")).toEqual({ ok: true });
        await elapse(6000);
        expect(seen).toEqual(["unanswered"]);
      } finally {
        off();
        r.dispose();
      }
    });
  });

  test("a throwing send rethrows and leaves no wait to report", async () => {
    await withFakeTimers(async () => {
      const failure = new Error("no world socket");
      const { r } = rig(0x01_00_00, 7);
      const store = r.stores.areas.pets;
      expect(store.snapshot().pet?.canRename).toBe(true);
      expect(store.snapshot().bar?.guid).toBe(PET);
      const ctx = {
        listen: () => () => undefined,
        send: () => {
          throw failure;
        },
        signal: new AbortController().signal,
        until: () =>
          new Promise<never>((_resolve, reject) => {
            setTimeout(() => reject(new Error("timeout")), 5000);
          }),
      };
      const seen: string[] = [];
      const off = store.onEvent((event) => seen.push(event.type));
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => unhandled.push(reason);
      process.on("unhandledRejection", onUnhandled);
      try {
        const single = petsRuntime(ctx as never, store, r.stores as never);
        expect(() => single.act.renamePet("Fangtooth")).toThrow(failure);
        await elapse(6000);
        expect(seen).not.toContain("unanswered");
        expect(unhandled).toEqual([]);
        single.dispose();
      } finally {
        process.off("unhandledRejection", onUnhandled);
        off();
        r.dispose();
      }
    });
  });

  test("a same-second rename still refreshes and stores the new name", async () => {
    await withFakeTimers(async () => {
      const { fields, r } = rig(0x01_00_00, 7);
      const seen: string[] = [];
      const off = r.handle.onEvent((event) => seen.push(event.type));
      try {
        r.inject(
          GameOpcode.SMSG_PET_NAME_QUERY_RESPONSE,
          petsNameQueryResponseBody({
            name: "Rex",
            number: NUMBER,
            timestamp: 7,
          }),
        );
        expect(r.handle.act.renamePet("Fangtooth")).toEqual({ ok: true });
        const before = r.sent.length;
        fields.set(UNIT_FIELDS.BYTES_2.offset, 0);
        r.events.entity.emit({
          changed: ["rawFields"],
          entity: { guid: PET, rawFields: fields } as unknown as Entity,
          type: "update",
        });
        expect(r.sent).toHaveLength(before + 1);
        expect(r.sent.at(-1)?.opcode).toBe(GameOpcode.CMSG_PET_NAME_QUERY);
        r.inject(
          GameOpcode.SMSG_PET_NAME_QUERY_RESPONSE,
          petsNameQueryResponseBody({
            name: "Fangtooth",
            number: NUMBER,
            timestamp: 7,
          }),
        );
        await elapse(6000);
        expect(r.handle.state().names[NUMBER]?.name).toBe("Fangtooth");
        expect(r.handle.state().renamePending).toEqual([]);
        expect(seen).toEqual(["name", "name"]);
      } finally {
        off();
        r.dispose();
      }
    });
  });

  test("a replaced rename emits one unanswered at the newer deadline", async () => {
    await withFakeTimers(async () => {
      const { r } = rig(0x01_00_00, 7);
      const seen: { at: number; type: string }[] = [];
      let clock = 0;
      const off = r.handle.onEvent((event) =>
        seen.push({ at: clock, type: event.type }),
      );
      try {
        expect(r.handle.act.renamePet("A")).toEqual({ ok: true });
        await elapse(3000);
        clock = 3000;
        expect(r.handle.act.renamePet("B")).toEqual({ ok: true });
        await elapse(2500);
        expect(seen).toEqual([]);
        clock = 5500;
        await elapse(3000);
        expect(seen.map((row) => row.type)).toEqual(["unanswered"]);
      } finally {
        off();
        r.dispose();
      }
    });
  });
});

describe("pets rename correlation", () => {
  test("a newer reply for the first name does not confirm the second rename", async () => {
    await withFakeTimers(async () => {
      const { r } = rig(0x01_00_00, 7);
      const seen: string[] = [];
      const off = r.handle.onEvent((event) => seen.push(event.type));
      try {
        expect(r.handle.act.renamePet("Fangtooth")).toEqual({ ok: true });
        expect(r.handle.act.renamePet("Rex")).toEqual({ ok: true });
        r.inject(
          GameOpcode.SMSG_PET_NAME_QUERY_RESPONSE,
          petsNameQueryResponseBody({
            name: "Fangtooth",
            number: NUMBER,
            timestamp: 9,
          }),
        );
        await elapse(6000);
        expect(seen).toEqual(["name", "unanswered"]);
      } finally {
        off();
        r.dispose();
      }
    });
  });

  test("a refusal of another name does not end the rename wait", async () => {
    await withFakeTimers(async () => {
      const { r } = rig(0x01_00_00, 7);
      const seen: string[] = [];
      const off = r.handle.onEvent((event) => seen.push(event.type));
      try {
        expect(r.handle.act.renamePet("Fangtooth")).toEqual({ ok: true });
        r.inject(
          GameOpcode.SMSG_PET_NAME_INVALID,
          petsNameInvalidBody({ code: 3, name: "Other" }),
        );
        await elapse(6000);
        expect(seen).toEqual(["name_invalid", "unanswered"]);
      } finally {
        off();
        r.dispose();
      }
    });
  });

  test("the reply for the requested name ends the wait without unanswered", async () => {
    await withFakeTimers(async () => {
      const { r } = rig(0x01_00_00, 7);
      const seen: string[] = [];
      const off = r.handle.onEvent((event) => seen.push(event.type));
      try {
        expect(r.handle.act.renamePet("Rex")).toEqual({ ok: true });
        r.inject(
          GameOpcode.SMSG_PET_NAME_QUERY_RESPONSE,
          petsNameQueryResponseBody({
            name: "Rex",
            number: NUMBER,
            timestamp: 9,
          }),
        );
        await elapse(6000);
        expect(seen).toEqual(["name"]);
      } finally {
        off();
        r.dispose();
      }
    });
  });
});
