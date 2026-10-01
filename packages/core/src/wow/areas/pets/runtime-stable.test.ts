import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  petsStabledPetsBody,
  petsStableResultBody,
} from "#test-support/areas/pets";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import {
  buildBuyStableSlot,
  buildListStabledPets,
  buildStablePet,
  buildStableRevivePet,
  buildStableSwapPet,
  buildUnstablePet,
} from "#wow/areas/pets/protocol";
import { GameOpcode } from "#wow/protocol/opcodes";

const NPC = 0xf1_30_00_41_11_00_00_01n;
const OK = { ok: true } as const;

function rig() {
  const r = areaRig("pets", { selfGuid: 0x2an });
  const seen: string[] = [];
  const off = r.handle.onEvent((event) => seen.push(event.type));
  return { off, r, seen };
}

const LIST = petsStabledPetsBody({ npc: NPC, pets: [], slots: 1 });

describe("pets stable runtime", () => {
  test("each act sends its one packet with the AzerothCore body", () => {
    const { off, r } = rig();
    try {
      const { act } = r.handle;
      expect(act.listStabledPets(NPC)).toEqual(OK);
      expect(act.stablePet(NPC)).toEqual(OK);
      expect(act.unstablePet(NPC, 9)).toEqual(OK);
      expect(act.swapStabledPet(NPC, 9)).toEqual(OK);
      expect(act.buyStableSlot(NPC)).toEqual(OK);
      expect(act.stableRevivePet(NPC)).toEqual(OK);
      expect(r.sent.map((row) => [row.opcode, [...row.body]])).toEqual([
        [GameOpcode.MSG_LIST_STABLED_PETS, [...buildListStabledPets(NPC)]],
        [GameOpcode.CMSG_STABLE_PET, [...buildStablePet(NPC)]],
        [GameOpcode.CMSG_UNSTABLE_PET, [...buildUnstablePet(NPC, 9)]],
        [GameOpcode.CMSG_STABLE_SWAP_PET, [...buildStableSwapPet(NPC, 9)]],
        [GameOpcode.CMSG_BUY_STABLE_SLOT, [...buildBuyStableSlot(NPC)]],
        [GameOpcode.CMSG_STABLE_REVIVE_PET, [...buildStableRevivePet(NPC)]],
      ]);
    } finally {
      off();
      r.dispose();
    }
  });

  test("a silent server gives one unanswered stable event after 5 s", async () => {
    await withFakeTimers(async () => {
      const { off, r, seen } = rig();
      try {
        r.handle.act.stablePet(NPC);
        await elapse(4900);
        expect(seen).toEqual([]);
        await elapse(200);
        expect(r.handle.state().stable).toBeUndefined();
        expect(seen).toEqual(["unanswered"]);
      } finally {
        off();
        r.dispose();
      }
    });
  });

  test("the unanswered event names the stable request", async () => {
    await withFakeTimers(async () => {
      const { r } = rig();
      const events: unknown[] = [];
      const off = r.handle.onEvent((event) => events.push(event));
      try {
        r.handle.act.listStabledPets(NPC);
        await elapse(6000);
        expect(events).toEqual([{ request: "stable", type: "unanswered" }]);
      } finally {
        off();
        r.dispose();
      }
    });
  });

  test("a result ends the wait of stable, unstable, swap and buy", async () => {
    await withFakeTimers(async () => {
      const { off, r, seen } = rig();
      try {
        const { act } = r.handle;
        for (const send of [
          () => act.stablePet(NPC),
          () => act.unstablePet(NPC, 1),
          () => act.swapStabledPet(NPC, 1),
          () => act.buyStableSlot(NPC),
        ]) {
          send();
          r.inject(GameOpcode.SMSG_STABLE_RESULT, petsStableResultBody(0x06));
        }
        await elapse(6000);
        expect(seen).toEqual(new Array(4).fill("stable_result"));
      } finally {
        off();
        r.dispose();
      }
    });
  });

  test("a list reply ends the list wait", async () => {
    await withFakeTimers(async () => {
      const { off, r, seen } = rig();
      try {
        r.handle.act.listStabledPets(NPC);
        r.inject(GameOpcode.MSG_LIST_STABLED_PETS, LIST);
        await elapse(6000);
        expect(seen).toEqual(["stable_list"]);
      } finally {
        off();
        r.dispose();
      }
    });
  });

  test("a stale result does not answer a list request", async () => {
    await withFakeTimers(async () => {
      const { off, r, seen } = rig();
      try {
        r.handle.act.listStabledPets(NPC);
        r.inject(GameOpcode.SMSG_STABLE_RESULT, petsStableResultBody(0x06));
        await elapse(6000);
        expect(seen).toEqual(["stable_result", "unanswered"]);
      } finally {
        off();
        r.dispose();
      }
    });
  });

  test("a delayed list reply of a replaced request does not answer the newer one", async () => {
    await withFakeTimers(async () => {
      const { off, r, seen } = rig();
      const other = 0xf1_30_00_41_11_00_00_02n;
      try {
        r.handle.act.listStabledPets(NPC);
        await elapse(1000);
        r.handle.act.listStabledPets(other);
        r.inject(GameOpcode.MSG_LIST_STABLED_PETS, LIST);
        await elapse(5500);
        expect(seen).toEqual(["stable_list", "unanswered"]);
        r.handle.act.listStabledPets(other);
        r.inject(
          GameOpcode.MSG_LIST_STABLED_PETS,
          petsStabledPetsBody({ npc: other, pets: [], slots: 1 }),
        );
        await elapse(6000);
        expect(seen).toEqual(["stable_list", "unanswered", "stable_list"]);
      } finally {
        off();
        r.dispose();
      }
    });
  });

  test("a new act replaces the wait and only the newer deadline reports", async () => {
    await withFakeTimers(async () => {
      const { off, r, seen } = rig();
      try {
        r.handle.act.stablePet(NPC);
        await elapse(3000);
        r.handle.act.buyStableSlot(NPC);
        await elapse(2500);
        expect(seen).toEqual([]);
        await elapse(3000);
        expect(seen).toEqual(["unanswered"]);
      } finally {
        off();
        r.dispose();
      }
    });
  });

  test("the revive act sends and waits for nothing", async () => {
    await withFakeTimers(async () => {
      const { off, r, seen } = rig();
      try {
        expect(r.handle.act.stableRevivePet(NPC)).toEqual(OK);
        await elapse(10_000);
        expect(seen).toEqual([]);
      } finally {
        off();
        r.dispose();
      }
    });
  });

  test("disposing the runtime cancels a pending wait without a report", async () => {
    await withFakeTimers(async () => {
      const { off, r, seen } = rig();
      try {
        r.handle.act.unstablePet(NPC, 3);
        r.dispose();
        await elapse(10_000);
        expect(seen).toEqual([]);
      } finally {
        off();
      }
    });
  });
});
