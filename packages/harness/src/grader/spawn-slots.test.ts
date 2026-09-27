import { describe, expect, test } from "bun:test";
import { loadScenario, ROUND_1 } from "#harness/grader/scenarios";
import { startSlots } from "#harness/grader/spawn-slots";

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
    expect(seen.size).toBe(2 * 2 * 10);
  });

  test("points stay a few yards from the preset spawn, on its map and zone", () => {
    for (const id of ROUND_1) {
      const slots = startSlots(loadScenario(id), 2);
      if (slots === undefined) continue;
      for (const step of [slots.agent, slots.partner]) {
        expect(step.endpoint).toBe("position");
        const body = bodyOf(step);
        const spawn =
          body.map === 530 && body.zone === 3433
            ? { x: 7575, y: -6835 }
            : { x: 8735, y: -6685 };
        expect(
          Math.hypot(body.x - spawn.x, body.y - spawn.y),
        ).toBeLessThanOrEqual(16);
      }
    }
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
});
