import { describe, expect, it } from "vitest";
import { advanceOnGround, crossedFootfall, gaitPhaseForDistance } from "./pedestrianMotion";

describe("distance-driven pedestrian motion", () => {
  it("moves toward a destination without overshooting", () => {
    const step = advanceOnGround({ x: 0, z: 0 }, { x: 3, z: 4 }, 2);
    expect(step.position.x).toBeCloseTo(1.2);
    expect(step.position.z).toBeCloseTo(1.6);
    expect(step.distance).toBe(2);
    expect(step.arrived).toBe(false);
  });

  it("lands exactly on close destinations", () => {
    const step = advanceOnGround({ x: 1, z: 1 }, { x: 1.2, z: 1.1 }, 1);
    expect(step.position).toEqual({ x: 1.2, z: 1.1 });
    expect(step.arrived).toBe(true);
  });

  it("derives gait and footfalls from ground distance", () => {
    const before = gaitPhaseForDistance(0.7, 1.5);
    const after = gaitPhaseForDistance(0.8, 1.5);
    expect(crossedFootfall(before, after)).toBe(true);
    expect(gaitPhaseForDistance(1.5, 1.5)).toBeCloseTo(Math.PI * 2);
  });
});
