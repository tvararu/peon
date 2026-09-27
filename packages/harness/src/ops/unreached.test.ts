import { describe, expect, test } from "bun:test";
import { reachNext, structuralReach } from "#harness/ops/unreached";

const FARLEY = { name: "Innkeeper Farley", ref: "u18" };

describe("reachNext", () => {
  test("an unsupported map asks the human instead of hinting travel", () => {
    const next = reachNext(
      {
        detail: "unsupported map 0 (only Expansion01/530)",
        reason: "unsupported_map_0",
      },
      FARLEY,
    );
    expect(next).toBe(
      'ask the human: "This map has no navigation data, so I cannot walk to Innkeeper Farley. Can you move me there?"',
    );
  });

  test("a destination the mesh cannot reach asks the human", () => {
    const next = reachNext(
      {
        detail: "pathfind_find_path failed (UNKNOWN_PATH)",
        reason: "pathfind_find_path_failed",
      },
      FARLEY,
    );
    expect(next).toBe(
      'ask the human: "I cannot reach Innkeeper Farley from here. Is there another way?"',
    );
  });

  test("a start off the mesh points at unstick", () => {
    expect(
      reachNext(
        {
          detail: "start snapped off the requested ground position",
          reason: "start_off_mesh",
        },
        FARLEY,
      ),
    ).toBe('travel(to: "unstick")');
  });

  test("a transient stop still hints travel to the unit", () => {
    expect(
      reachNext(
        { detail: "ground corridor changes surface", reason: "surface_change" },
        FARLEY,
      ),
    ).toBe('travel(to: "u18")');
  });

  test("structuralReach names map, path and ground failures only", () => {
    expect(structuralReach({ detail: "", reason: "unsupported_map_1" })).toBe(
      "unsupported_map",
    );
    expect(
      structuralReach({ detail: "UNKNOWN_HEIGHT", reason: "no_ground" }),
    ).toBe("no_ground");
    expect(
      structuralReach({ detail: "native path omits destination", reason: "x" }),
    ).toBe("no_path");
    expect(
      structuralReach({ detail: "obstructed", reason: "obstructed" }),
    ).toBeUndefined();
  });
});
