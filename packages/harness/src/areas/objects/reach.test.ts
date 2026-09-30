import { describe, expect, test } from "bun:test";
import {
  inDisplayReach,
  inscribedReach,
  interactionRadius,
} from "#harness/areas/objects/reach";

const SHRINE = {
  id: 3011,
  maxX: 0.236,
  maxY: 0.4726,
  maxZ: 0,
  minX: -0.236,
  minY: 0.0004,
  minZ: 0.083,
};

describe("object reach", () => {
  test("a text object keeps the server interaction radius", () => {
    expect(interactionRadius(9)).toBeCloseTo(5.555_555_3, 6);
  });

  test("an unknown type falls back to the server default", () => {
    expect(interactionRadius(99)).toBe(5.5);
  });

  test("display bounds widen the walk-up range by the inscribed half extent", () => {
    expect(
      inscribedReach({
        at: { x: 30, y: 0, z: 42.5 },
        bounds: SHRINE,
        scale: 1.91,
        type: 9,
      }),
    ).toBeGreaterThan(interactionRadius(9));
  });

  test("the shrine stays usable from the far side of its stone", () => {
    const target = {
      at: { x: 30, y: 0, z: 42.5 },
      bounds: SHRINE,
      scale: 1.91,
      type: 9,
    };
    expect(inDisplayReach({ x: 30, y: -5.4, z: 42.5 }, target)).toBe(true);
    expect(inDisplayReach({ x: 30, y: -5.7, z: 42.5 }, target)).toBe(false);
  });

  test("a player beyond the bounds is out of reach", () => {
    const target = {
      at: { x: 30, y: 0, z: 42.5 },
      bounds: SHRINE,
      scale: 1,
      type: 9,
    };
    expect(inDisplayReach({ x: 30, y: -20, z: 42.5 }, target)).toBe(false);
  });

  test("without bounds the check is the centre distance", () => {
    const target = {
      at: { x: 30, y: 0, z: 0 },
      bounds: undefined,
      scale: 1,
      type: 9,
    };
    expect(inDisplayReach({ x: 30, y: -5, z: 0 }, target)).toBe(true);
    expect(inDisplayReach({ x: 30, y: -6, z: 0 }, target)).toBe(false);
  });
});
