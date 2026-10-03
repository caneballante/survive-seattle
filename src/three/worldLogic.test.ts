import { describe, expect, it } from "vitest";
import { moveWithSliding, nearestWithin, normalizedMovement } from "./worldLogic";

describe("three-quarter world movement", () => {
  it("normalizes diagonal movement", () => {
    const movement = normalizedMovement(1, 1);
    expect(Math.hypot(movement.x, movement.z)).toBeCloseTo(1);
  });

  it("slides along solid storefronts instead of entering them", () => {
    const result = moveWithSliding(
      { x: 0, z: 0 },
      { x: 1, z: -1 },
      0.3,
      [{ minX: 0.5, maxX: 2, minZ: -2, maxZ: -0.5 }],
      { minX: -5, maxX: 5, minZ: -5, maxZ: 5 },
    );
    expect(result).toEqual({ x: 1, z: 0 });
  });

  it("finds only nearby interaction targets", () => {
    const targets = [{ id: "near", position: { x: 1, z: 0 } }, { id: "far", position: { x: 5, z: 0 } }];
    expect(nearestWithin({ x: 0, z: 0 }, targets, 1.5)?.id).toBe("near");
    expect(nearestWithin({ x: 0, z: 0 }, targets, 0.5)).toBeNull();
  });
});
