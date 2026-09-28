import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { petsPetSpellsBody } from "#test-support/areas/pets";
import { testStores } from "#test-support/session-fixtures";
import {
  type AreaRuntimes,
  type AreaStores,
  areaHandles,
  createModuleRuntimes,
  looseModule,
  registerModules,
} from "#wow/areas/compose";
import { petsArea } from "#wow/areas/pets/area";
import { buildPetAction, PET_ACTION } from "#wow/areas/pets/protocol";
import { testPort } from "#wow/areas/port";
import type { Entity } from "#wow/entity-store";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";
import { OpcodeDispatch } from "#wow/protocol/world";
import { disposeSessionStores } from "#wow/session-stores";

const ME = 0x2an;
const PET = 0xf1_40_00_0c_a9_00_02_0bn;
const BAR = petsPetSpellsBody({
  command: 1,
  cooldowns: [],
  duration: 0,
  family: 31,
  flags: 0,
  guid: PET,
  react: 0,
  slots: Array.from({ length: 10 }, () => ({ action: 0, type: 0 })),
  spells: [],
});
const REQUEST = {
  body: new Uint8Array(),
  opcode: GameOpcode.CMSG_REQUEST_PET_INFO,
};

function action(type: number, value: number) {
  return {
    body: buildPetAction(PET, type, value, 0n),
    opcode: GameOpcode.CMSG_PET_ACTION,
  };
}

function withBar() {
  const rig = areaRig("pets", { selfGuid: ME });
  rig.inject(GameOpcode.SMSG_PET_SPELLS, BAR);
  return rig;
}

function withPet(bytes2: number) {
  const owner = {
    guid: ME,
    rawFields: new Map([
      [UNIT_FIELDS.SUMMON.offset, 0xa9_00_02_0b],
      [UNIT_FIELDS.SUMMON.offset + 1, 0xf1_40_00_0c],
    ]),
  } as unknown as Entity;
  const pet = {
    guid: PET,
    rawFields: new Map([[UNIT_FIELDS.BYTES_2.offset, bytes2]]),
  } as unknown as Entity;
  const port = testPort({ selfGuid: () => ME });
  const stores = testStores({
    getEntity: (guid) => [owner, pet].find((row) => row.guid === guid),
    selfGuid: () => ME,
    send: port.send,
  });
  const module = looseModule(petsArea);
  const dispatch = new OpcodeDispatch();
  const own = { pets: stores.areas.pets };
  registerModules(dispatch, [module], own);
  const lifetime = createModuleRuntimes(port, [module], own, stores);
  const handles = areaHandles(
    own as unknown as AreaStores,
    lifetime.runtimes as AreaRuntimes,
    () => port.events().area,
  );
  void dispatch.handle(GameOpcode.SMSG_PET_SPELLS, new PacketReader(BAR));
  return {
    act: handles.pets.act,
    dispose: () => {
      lifetime.dispose();
      disposeSessionStores(stores);
    },
    sent: port.sent,
  };
}

describe("pets runtime", () => {
  test("requestPetInfo sends one empty CMSG_REQUEST_PET_INFO", () => {
    const rig = areaRig("pets");
    try {
      expect(rig.handle.act.requestPetInfo()).toEqual({ ok: true });
      expect(rig.sent).toEqual([REQUEST]);
    } finally {
      rig.dispose();
    }
  });

  test("follow and stay send CMSG_PET_ACTION then ask for the bar again (MiscHandler.cpp:1567-1568)", () => {
    const rig = withBar();
    try {
      expect(rig.handle.act.petCommand("follow")).toEqual({ ok: true });
      expect(rig.handle.act.petCommand("stay")).toEqual({ ok: true });
      expect(rig.sent).toEqual([
        action(PET_ACTION.command, 1),
        REQUEST,
        action(PET_ACTION.command, 0),
        REQUEST,
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("each stance sends its reaction then asks for the bar again", () => {
    const rig = withBar();
    try {
      expect(rig.handle.act.petStance("passive")).toEqual({ ok: true });
      expect(rig.handle.act.petStance("defensive")).toEqual({ ok: true });
      expect(rig.handle.act.petStance("aggressive")).toEqual({ ok: true });
      expect(rig.sent).toEqual([
        action(PET_ACTION.reaction, 0),
        REQUEST,
        action(PET_ACTION.reaction, 1),
        REQUEST,
        action(PET_ACTION.reaction, 2),
        REQUEST,
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("petStopAttack sends one CMSG_PET_STOP_ATTACK with the pet guid", () => {
    const rig = withBar();
    try {
      expect(rig.handle.act.petStopAttack()).toEqual({ ok: true });
      expect(rig.sent).toHaveLength(1);
      expect(rig.sent[0]?.opcode).toBe(GameOpcode.CMSG_PET_STOP_ATTACK);
      expect(
        new PacketReader(rig.sent[0]?.body ?? new Uint8Array()).uint64LE(),
      ).toBe(PET);
    } finally {
      rig.dispose();
    }
  });

  test("with no bar every act refuses no_pet and sends nothing", () => {
    const rig = areaRig("pets", { selfGuid: ME });
    try {
      const refused = { ok: false, reason: "no_pet" } as const;
      expect(rig.handle.act.petCommand("follow")).toEqual(refused);
      expect(rig.handle.act.petCommand("stay")).toEqual(refused);
      expect(rig.handle.act.petCommand("dismiss")).toEqual(refused);
      expect(rig.handle.act.petStance("aggressive")).toEqual(refused);
      expect(rig.handle.act.petStopAttack()).toEqual(refused);
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("dismiss with a bar but no pet entity in view refuses no_pet and sends nothing", () => {
    const rig = withBar();
    try {
      expect(rig.handle.act.petCommand("dismiss")).toEqual({
        ok: false,
        reason: "no_pet",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("dismiss refuses a hunter pet, because command 3 deletes it (PetHandler.cpp:287-288)", () => {
    const rig = withPet(0x00_02_00_00);
    try {
      expect(rig.act.petCommand("dismiss")).toEqual({
        ok: false,
        reason: "hunter_pet_dismiss",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("dismiss sends command 3 for a pet that cannot be abandoned", () => {
    const rig = withPet(0);
    try {
      expect(rig.act.petCommand("dismiss")).toEqual({ ok: true });
      expect(rig.sent).toEqual([action(PET_ACTION.command, 3)]);
    } finally {
      rig.dispose();
    }
  });
});
