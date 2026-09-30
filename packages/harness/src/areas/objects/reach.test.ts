import { describe, expect, test } from "bun:test";
import {
  inDisplayReach,
  interactionRadius,
  type ReachTarget,
} from "#harness/areas/objects/reach";

const SQRT_HALF = Math.sqrt(0.5);

function shrine(over: Partial<ReachTarget> = {}): ReachTarget {
  return {
    at: { x: 0, y: 0, z: 0 },
    bounds: SHRINE,
    rotation: { w: 1, x: 0, y: 0, z: 0 },
    scale: 3.01,
    type: 10,
    ...over,
  };
}

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

  test("a nearer box face outweighs a farther face for the walk-up range", () => {
    expect(
      inDisplayReach(
        { x: 30, y: -5.4, z: 42.5 },
        {
          at: { x: 30, y: 0, z: 42.5 },
          bounds: SHRINE,
          scale: 1.91,
          type: 9,
        },
      ),
    ).toBe(true);
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

  test("the deep side of the shrine box reaches past the plain threshold", () => {
    expect(inDisplayReach({ x: 0, y: 5.8, z: 0 }, shrine())).toBe(true);
    expect(inDisplayReach({ x: 0, y: -5.6, z: 0 }, shrine())).toBe(false);
  });

  test("a quarter turn moves the deep side of the box", () => {
    const turned = shrine({
      rotation: { w: SQRT_HALF, x: 0, y: 0, z: SQRT_HALF },
    });
    expect(inDisplayReach({ x: 5.8, y: 0, z: 0 }, shrine())).toBe(true);
    expect(inDisplayReach({ x: 5.8, y: 0, z: 0 }, turned)).toBe(false);
  });

  test("reversed bounds reach the same box", () => {
    expect(inDisplayReach({ x: 0, y: 0, z: 5.7 }, shrine())).toBe(true);
    expect(inDisplayReach({ x: 0, y: 0, z: 5.8 }, shrine())).toBe(false);
  });
});
