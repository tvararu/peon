import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  petsNameInvalidBody,
  petsNameQueryResponseBody,
} from "#test-support/areas/pets";
import type { PetsEvent } from "#wow/areas/pets/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const ME = 0x2an;

function rig() {
  const r = areaRig("pets", { now: () => 1000, selfGuid: ME });
  const seen: PetsEvent[] = [];
  r.handle.onEvent((event) => seen.push(event));
  return { r, seen };
}

describe("pets names", () => {
  test("a name reply fills the names map and emits name", () => {
    const { r, seen } = rig();
    try {
      r.inject(
        GameOpcode.SMSG_PET_NAME_QUERY_RESPONSE,
        petsNameQueryResponseBody({ name: "Rex", number: 7, timestamp: 5 }),
      );
      expect(r.handle.state().names).toEqual({
        7: { declined: undefined, name: "Rex", number: 7, timestamp: 5 },
      });
      expect(seen).toEqual([
        {
          name: { declined: undefined, name: "Rex", number: 7, timestamp: 5 },
          type: "name",
        },
      ]);
    } finally {
      r.dispose();
    }
  });

  test("a not-found reply caches nothing and emits nothing", () => {
    const { r, seen } = rig();
    try {
      r.inject(
        GameOpcode.SMSG_PET_NAME_QUERY_RESPONSE,
        new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      );
      expect(r.handle.state().names).toEqual({});
      expect(seen).toEqual([]);
    } finally {
      r.dispose();
    }
  });

  test("a refusal sets the last refusal and emits name_invalid", () => {
    const { r, seen } = rig();
    try {
      r.inject(
        GameOpcode.SMSG_PET_NAME_INVALID,
        petsNameInvalidBody({ code: 3, name: "A" }),
      );
      expect(r.handle.state().lastRefusal).toEqual({
        at: 1000,
        reason: "too_short",
      });
      expect(seen).toEqual([
        {
          declined: undefined,
          name: "A",
          reason: "too_short",
          type: "name_invalid",
        },
      ]);
    } finally {
      r.dispose();
    }
  });

  test("a declined-name refusal keeps the five cases", () => {
    const { r, seen } = rig();
    try {
      r.inject(
        GameOpcode.SMSG_PET_NAME_INVALID,
        petsNameInvalidBody({
          code: 16,
          declined: ["a", "b", "c", "d", "e"],
          name: "Rex",
        }),
      );
      expect(seen).toEqual([
        {
          declined: ["a", "b", "c", "d", "e"],
          name: "Rex",
          reason: "declension_mismatch",
          type: "name_invalid",
        },
      ]);
    } finally {
      r.dispose();
    }
  });

  test("refreshing marks the number pending and the reply settles it", () => {
    const { r } = rig();
    try {
      const store = r.stores.areas.pets;
      store.refreshing(7);
      store.refreshing(7);
      expect(r.handle.state().renamePending).toEqual([7]);
      r.inject(
        GameOpcode.SMSG_PET_NAME_QUERY_RESPONSE,
        petsNameQueryResponseBody({ name: "Rex", number: 7, timestamp: 5 }),
      );
      expect(r.handle.state().renamePending).toEqual([]);
    } finally {
      r.dispose();
    }
  });
});
