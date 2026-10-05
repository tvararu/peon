import { describe, expect, test } from "bun:test";
import { loadScenario, ROUND_1 } from "#harness/grader/scenarios";
import { spawnOf, startSlots } from "#harness/grader/spawn-slots";

type Body = { map: number; x: number; y: number; z: number; zone: number };

const bodyOf = (step: { body: Record<string, unknown> }): Body =>
  step.body as Body;

describe("startSlots", () => {
  test("every run and its partner get their own point for two replicas", () => {
    const seen = new Set<string>();
    for (const id of ROUND_1)
      for (const replica of [1, 2]) {
        const slots = startSlots(loadScenario(id), replica);
        if (slots === undefined) continue;
        for (const step of [slots.agent, slots.partner]) {
          const { map, x, y } = bodyOf(step);
          const key = `${map}:${x}:${y}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }
    const spawned = ROUND_1.filter((id) => spawnOf(loadScenario(id)));
    expect(seen.size).toBe(2 * 2 * spawned.length);
  });

  test("points stay a few yards from their spawn, on its map and zone", () => {
    for (const id of ROUND_1) {
      const scenario = loadScenario(id);
      const slots = startSlots(scenario, 2);
      if (slots === undefined) continue;
      const spawn = spawnOf(scenario);
      const [x, y] = spawn?.points[0] ?? [0, 0];
      for (const step of [slots.agent, slots.partner]) {
        expect(step.endpoint).toBe("position");
        const body = bodyOf(step);
        expect(body.map).toBe(spawn?.map ?? -1);
        expect(body.zone).toBe(spawn?.zone ?? -1);
        expect(Math.hypot(body.x - x, body.y - y)).toBeLessThanOrEqual(16);
      }
    }
  });

  test("the crowd-sensitive runs start 60 yd or more from every other start", () => {
    const starts = (id: string) =>
      [1, 2].flatMap((replica) => {
        const slots = startSlots(loadScenario(id), replica);
        return slots === undefined ? [] : [slots.agent, slots.partner];
      });
    const others = ROUND_1.filter(
      (id) => id !== "t0-who-is-near" && id !== "t2-whisper-reply",
    ).flatMap(starts);
    const apart = (a: string, b: readonly Body[]) =>
      starts(a).every((step) =>
        b.every(
          (other) =>
            Math.hypot(bodyOf(step).x - other.x, bodyOf(step).y - other.y) >=
            60,
        ),
      );
    expect(others.length).toBeGreaterThan(0);
    expect(apart("t0-who-is-near", others.map(bodyOf))).toBe(true);
    expect(apart("t2-whisper-reply", others.map(bodyOf))).toBe(true);
    expect(
      apart("t0-who-is-near", starts("t2-whisper-reply").map(bodyOf)),
    ).toBe(true);
  });

  test("t6 starts on an eversong slot although its preset is fresh", () => {
    const body = bodyOf(
      startSlots(loadScenario("t6-die-and-recover"), 1)?.agent ?? { body: {} },
    );
    expect(body.map).toBe(530);
    expect(Math.hypot(body.x - 8735, body.y + 6685)).toBeLessThanOrEqual(16);
  });

  test("the first ghostlands run starts on the preset point at the floor z", () => {
    expect(startSlots(loadScenario("t3-ghostlands-kill"), 1)?.agent).toEqual({
      body: { map: 530, o: 4.007, x: 7575, y: -6835, z: 88.66, zone: 3433 },
      endpoint: "position",
    });
  });

  test("presets that no other run shares keep their spawn", () => {
    for (const id of ["t4-quest-first", "t4-alliance-first"])
      expect(startSlots(loadScenario(id), 1)).toBeUndefined();
  });

  test("a replica past the table is refused", () => {
    expect(() => startSlots(loadScenario("t0-self-state"), 4)).toThrow(
      "no start slot for t0-self-state replica 4",
    );
  });
  test("the silvermoon bank grid starts at the banker with twelve points", () => {
    const spawn = spawnOf({
      id: "t9-bank-deposit",
      spawn: "silvermoon-bank",
    } as never);
    expect(spawn?.points).toHaveLength(12);
    expect(spawn?.points[0]).toEqual([9808, -7478, 13.6]);
    expect(spawn).toMatchObject({ map: 530, o: 1.686, zone: 3487 });
    for (const [x, y] of spawn?.points ?? [])
      expect(Math.hypot(x - 9808, y + 7478)).toBeLessThanOrEqual(16);
  });

  test("every kite start has three lone creatures 28 to 45 yd away and a point for each replica", () => {
    const creatures = {
      "eversong-kite-hold": [
        [8504.61, -7109.27],
        [8560.83, -7114.68],
        [8497.95, -7151.96],
      ],
      "eversong-kite-train": [
        [8885.98, -6521.18],
        [8853.21, -6486.6],
        [8885.47, -6454.98],
        [8913.3, -6482.37],
      ],
    } as const;
    for (const [name, spots] of Object.entries(creatures)) {
      const spawn = spawnOf({ id: "t3-pilot-kite", spawn: name } as never);
      expect(spawn?.points).toHaveLength(8);
      for (const [x, y] of spawn?.points ?? []) {
        const inRing = spots.filter(([cx, cy]) => {
          const yards = Math.hypot(x - (cx ?? 0), y - (cy ?? 0));
          return yards >= 28 && yards <= 45;
        });
        expect(inRing.length).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
