import { describe, expect, it } from "vitest";
import { GameState, formatTime } from "./state";

describe("game state", () => {
  it("advances and formats time", () => {
    const state = new GameState();
    state.advanceTime(45);
    expect(state.snapshot().minutes).toBe(525);
    expect(formatTime(state.snapshot().minutes)).toBe("8:45 AM");
  });

  it("updates each statistic", () => {
    const state = new GameState();
    state.updateStat("money", 5);
    state.updateStat("socialStatus", 2);
    state.updateStat("happiness", -1);
    expect(state.snapshot().stats).toEqual({ money: 25, socialStatus: 2, happiness: 4 });
  });

  it("rewards coffee only once per day", () => {
    const state = new GameState();
    expect(state.orderCoffee().ok).toBe(true);
    expect(state.orderCoffee().ok).toBe(false);
    expect(state.snapshot().stats.socialStatus).toBe(1);
    expect(state.snapshot().minutes).toBe(495);
    expect(state.snapshot().stats.money).toBe(15);
    expect(state.snapshot().energy).toBe(95);
    expect(state.snapshot().carriedItem).toBe("coffee");
  });

  it("accepts a job and unlocks the workplace opportunity", () => {
    const state = new GameState();
    const result = state.acceptJob();
    expect(result.ok).toBe(true);
    expect(state.snapshot().job?.employer).toBe("Cascadia Solutions");
    expect(state.snapshot().minutes).toBe(495);
    expect(state.opportunities.get("check-jobs")?.status).toBe("completed");
    expect(state.opportunities.get("first-shift")?.status).toBe("active");
  });

  it("rewards work only once per day and activates home", () => {
    const state = new GameState();
    state.acceptJob();
    expect(state.workShift().ok).toBe(true);
    expect(state.workShift().ok).toBe(false);
    expect(state.snapshot().stats.money).toBe(120);
    expect(state.snapshot().daily.workCompleted).toBe(true);
    expect(state.opportunities.get("return-home")?.status).toBe("active");
  });

  it("rolls to the next day, resets daily flags, and preserves the job", () => {
    const state = new GameState();
    state.orderCoffee();
    state.acceptJob();
    state.workShift();
    state.sleep();
    const snapshot = state.snapshot();
    expect(snapshot.day).toBe(2);
    expect(snapshot.minutes).toBe(480);
    expect(snapshot.daily).toEqual({
      coffeeOrdered: false,
      workCompleted: false,
      interactionUses: {},
    });
    expect(snapshot.stats).toEqual({ money: 115, socialStatus: 1, happiness: 6 });
    expect(snapshot.energy).toBe(70);
    expect(snapshot.carriedItem).toBeNull();
    expect(snapshot.weather).toBe("cloudy");
    expect(snapshot.job).not.toBeNull();
    expect(snapshot.prototypeComplete).toBe(true);
  });

  it("spends Energy without allowing it to go below zero", () => {
    const state = new GameState();
    expect(state.spendEnergy(10)).toBe(true);
    expect(state.snapshot().energy).toBe(60);
    expect(state.spendEnergy(100)).toBe(false);
    expect(state.snapshot().energy).toBe(60);
  });

  it("activates and completes opportunities", () => {
    const state = new GameState();
    expect(state.opportunities.get("morning-coffee")?.status).toBe("active");
    state.orderCoffee();
    expect(state.opportunities.get("morning-coffee")?.status).toBe("completed");
    state.acceptJob();
    expect(state.opportunities.get("first-shift")?.status).toBe("active");
    state.workShift();
    expect(state.opportunities.get("first-shift")?.status).toBe("completed");
    expect(state.opportunities.get("return-home")?.status).toBe("active");
  });
});
