import { describe, expect, it } from "vitest";
import {
  ambientMinutesForElapsed,
  SPRINT_SPEED,
  travelMinutesForElapsed,
  WALK_SPEED,
} from "./movement";

describe("street movement economy", () => {
  it("moves the clock forward while the player is idle", () => {
    expect(ambientMinutesForElapsed(1499)).toBe(0);
    expect(ambientMinutesForElapsed(1500)).toBe(1);
    expect(ambientMinutesForElapsed(6200)).toBe(4);
  });

  it("turns sustained travel into in-game minutes", () => {
    expect(travelMinutesForElapsed(999)).toBe(0);
    expect(travelMinutesForElapsed(1000)).toBe(2);
    expect(travelMinutesForElapsed(3500)).toBe(6);
  });

  it("lets sprinting cover ground faster than walking", () => {
    expect(SPRINT_SPEED).toBeGreaterThan(WALK_SPEED);
  });
});
