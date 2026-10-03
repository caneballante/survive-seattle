import { describe, expect, it } from "vitest";
import {
  DEFAULT_PEDESTRIAN_TUNING,
  expectedAcceptancesPerTen,
  nextCrowdRollDelay,
  percentageTotal,
  pickWeighted,
  rollCrowd,
  rollDisposition,
  sanitizePedestrianTuning,
} from "./pedestrians";

describe("pedestrian tuning and decisions", () => {
  it("ships with the requested 5/10/60/20/5 crowd spread", () => {
    expect(DEFAULT_PEDESTRIAN_TUNING.crowdBands.map((band) => band.weight)).toEqual([5, 10, 60, 20, 5]);
    expect(percentageTotal(DEFAULT_PEDESTRIAN_TUNING.crowdBands)).toBe(100);
    expect(expectedAcceptancesPerTen(DEFAULT_PEDESTRIAN_TUNING.dispositions)).toBeCloseTo(6.09, 1);
  });

  it("selects a crowd band and a count within its range", () => {
    const values = [0.2, 0.999];
    const roll = rollCrowd(DEFAULT_PEDESTRIAN_TUNING, () => values.shift() ?? 0);
    expect(roll.band.id).toBe("few");
    expect(roll.target).toBe(6);
  });

  it("combines disposition weight and acceptance probability", () => {
    const values = [0, 0.89];
    expect(rollDisposition(DEFAULT_PEDESTRIAN_TUNING, () => values.shift() ?? 0)).toEqual({
      disposition: "interested",
      accepts: true,
    });
  });

  it("sanitizes ranges and keeps all required rows", () => {
    const tuning = sanitizePedestrianTuning({
      crowdIntervalSeconds: 1,
      crowdBands: [{ id: "packed", label: "ignored", weight: 250, minPeople: 20, maxPeople: 2 }],
    });
    expect(tuning.crowdIntervalSeconds).toBe(10);
    expect(tuning.crowdBands).toHaveLength(5);
    expect(tuning.crowdBands.at(-1)).toMatchObject({ id: "packed", weight: 100, minPeople: 20, maxPeople: 20 });
  });

  it("supports deterministic weighted boundaries and randomized intervals", () => {
    expect(pickWeighted([{ weight: 1, id: "a" }, { weight: 1, id: "b" }], () => 0.75).id).toBe("b");
    expect(nextCrowdRollDelay(DEFAULT_PEDESTRIAN_TUNING, () => 0)).toBeCloseTo(43.2);
    expect(nextCrowdRollDelay(DEFAULT_PEDESTRIAN_TUNING, () => 1)).toBeCloseTo(76.8);
  });
});
