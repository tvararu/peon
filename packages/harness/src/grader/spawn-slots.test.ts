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
