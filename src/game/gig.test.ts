import { describe, expect, it } from "vitest";
import { GameState } from "./state";
import { scoreStreetGig, STREET_GIG_TIME } from "./gig";

describe("street gig loop", () => {
  it("books a show and turns accepted flyers into an audience", () => {
    const state = new GameState();
    expect(state.bookStreetGig().ok).toBe(true);
    expect(state.snapshot().gig.flyersRemaining).toBe(10);

    expect(state.offerFlyer("prospect-1", true).ok).toBe(true);
    expect(state.offerFlyer("prospect-2", false).ok).toBe(true);
    expect(state.snapshot().gig.recruitedFans).toBe(1);
    expect(state.snapshot().gig.flyersRemaining).toBe(8);
    expect(state.offerFlyer("prospect-1", true).ok).toBe(false);
  });

  it("waits until showtime and applies performance consequences", () => {
    const state = new GameState();
    state.bookStreetGig();
    for (let index = 0; index < 6; index += 1) {
      state.offerFlyer(`fan-${index}`, true);
    }
    expect(state.startStreetGig().ok).toBe(true);
    expect(state.snapshot().minutes).toBe(STREET_GIG_TIME);

    const result = state.completeStreetGig({
      perfect: 8,
      good: 3,
      missed: 1,
      peakGroove: 94,
      leftCrowd: 82,
      rightCrowd: 78,
      walkIns: 2,
      walkouts: 0,
      specialMoves: 2,
      bestStreak: 7,
    });
    expect(result.ok).toBe(true);
    expect(state.snapshot().gig.phase).toBe("complete");
    expect(state.snapshot().gig.lastResult?.rating).toMatch(/Electric|Unforgettable/);
    expect(state.snapshot().stats.money).toBeGreaterThan(20);
    expect(state.snapshot().gig.lifetimeFans).toBeGreaterThan(0);
  });

  it("rewards preparation as well as timing", () => {
    const performance = {
      perfect: 7,
      good: 3,
      missed: 2,
      peakGroove: 78,
      leftCrowd: 70,
      rightCrowd: 70,
      walkIns: 1,
      walkouts: 0,
      specialMoves: 1,
      bestStreak: 5,
    };
    const emptyStreet = scoreStreetGig(0, 6, performance);
    const promotedShow = scoreStreetGig(6, 6, performance);
    expect(promotedShow.score).toBeGreaterThan(emptyStreet.score);
    expect(promotedShow.attendance).toBeGreaterThan(emptyStreet.attendance);
    expect(promotedShow.tips).toBeGreaterThan(emptyStreet.tips);
  });

  it("turns visible walk-ins and walkouts into real attendance consequences", () => {
    const performance = {
      perfect: 5,
      good: 4,
      missed: 2,
      peakGroove: 70,
      leftCrowd: 62,
      rightCrowd: 58,
      walkIns: 2,
      walkouts: 0,
      specialMoves: 1,
      bestStreak: 4,
    };
    const retained = scoreStreetGig(6, 6, performance);
    const lostCrowd = scoreStreetGig(6, 6, { ...performance, walkouts: 2, walkIns: 0 });
    expect(retained.attendance).toBe(8);
    expect(lostCrowd.attendance).toBe(4);
    expect(retained.tips).toBeGreaterThan(lostCrowd.tips);
    expect(retained.breakdown).toContain("2 joined");
  });
});
