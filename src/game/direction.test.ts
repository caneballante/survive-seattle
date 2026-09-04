import { describe, expect, it } from "vitest";
import { getTargetDirection } from "./direction";

describe("opportunity direction", () => {
  it("points left for a target before the camera", () => {
    expect(getTargetDirection(100, 500, 960)).toBe("left");
  });

  it("points right for a target after the camera", () => {
    expect(getTargetDirection(1800, 500, 960)).toBe("right");
  });

  it("reports targets inside the useful viewport as visible", () => {
    expect(getTargetDirection(900, 500, 960)).toBe("visible");
  });
});
