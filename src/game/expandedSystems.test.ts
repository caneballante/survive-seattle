import { describe, expect, it } from "vitest";
import { CITY_EVENT_BY_ID } from "./cityEvents";
import { getTargetDirection } from "./direction";
import { LOCATION_BY_ID } from "./locations";
import { getOpenWorldBounds } from "./regions";
import { GameState } from "./state";

describe("visible aspirational world", () => {
  it("keeps the full street walkable while progression changes what is attainable", () => {
    const state = new GameState();
    const bounds = getOpenWorldBounds();
    expect(state.isLocationUnlocked("convenience")).toBe(true);
    expect(state.isLocationUnlocked("park")).toBe(true);
    expect(state.isLocationUnlocked("art-store")).toBe(true);
    expect(LOCATION_BY_ID.park.x).toBeGreaterThan(bounds.minX);
    expect(LOCATION_BY_ID["art-store"].x).toBeLessThan(bounds.maxX);
    expect(state.getInteractionAvailability("sketchbook-buy").allowed).toBe(false);

    const result = state.sleep();
    expect(result.worldExpanded).toBe(true);
    expect(state.opportunities.get("see-neighborhood")?.status).toBe("active");
  });

  it("points toward a newly revealed west-side location", () => {
    const parkX = LOCATION_BY_ID.park.x;
    expect(getTargetDirection(parkX, 2050, 960)).toBe("left");
  });
});

describe("street pressure encounters", () => {
  it("resolves an aggressive panhandler choice through the generic effect engine", () => {
    const state = new GameState();
    const result = state.resolveStreetEncounter("aggressive-panhandler", "give-five");
    expect(result.ok).toBe(true);
    expect(state.snapshot().stats.money).toBe(15);
    expect(state.snapshot().stats.happiness).toBe(6);
    expect(state.snapshot().minutes).toBe(485);
  });

  it("uses Energy to escape a street encounter", () => {
    const state = new GameState();
    const result = state.resolveStreetEncounter("aggressive-panhandler", "run");
    expect(result.ok).toBe(true);
    expect(state.snapshot().energy).toBe(60);
    expect(state.snapshot().minutes).toBe(482);
  });

  it("lets a cyclist collision spill a carried coffee", () => {
    const state = new GameState();
    state.orderCoffee();
    expect(state.snapshot().carriedItem).toBe("coffee");
    const result = state.resolveStreetEncounter("cyclist-pack", "recover");
    expect(result.ok).toBe(true);
    expect(state.snapshot().carriedItem).toBeNull();
    expect(result.message).toContain("coffee");
  });
});

describe("data-driven interactions", () => {
  it("applies time, money, and rewards for a cheap meal", () => {
    const state = new GameState();
    const result = state.performInteraction("cheap-meal");
    expect(result.ok).toBe(true);
    expect(state.snapshot().minutes).toBe(510);
    expect(state.snapshot().stats).toEqual({
      money: 12,
      socialStatus: 0,
      happiness: 6,
    });
  });

  it("enforces per-day and per-season limits", () => {
    const state = new GameState();
    state.unlockWorldStage(1);
    expect(state.performInteraction("park-walk").ok).toBe(true);
    expect(state.performInteraction("park-walk").ok).toBe(false);
    expect(state.performInteraction("theater-usher").ok).toBe(true);
    expect(state.performInteraction("theater-usher").ok).toBe(false);
    state.debugAdvanceSeason();
    expect(state.performInteraction("theater-usher").ok).toBe(true);
  });

  it("keeps the art store locked until Social Status 3", () => {
    const state = new GameState();
    state.unlockWorldStage(1);
    expect(state.getInteractionAvailability("sketchbook-buy").allowed).toBe(false);
    state.updateStat("socialStatus", 3);
    expect(state.getInteractionAvailability("sketchbook-buy").allowed).toBe(true);
    expect(state.performInteraction("sketchbook-buy").ok).toBe(true);
    expect(state.snapshot().inventory).toContain("sketchbook");
  });

  it("reveals the guitar, fails without money, and succeeds when affordable", () => {
    const state = new GameState();
    state.unlockWorldStage(1);
    expect(state.performInteraction("music-browse").ok).toBe(true);
    expect(state.snapshot().storyFlags).toContain("guitar-revealed");
    expect(state.performInteraction("guitar-buy").ok).toBe(false);
    state.updateStat("money", 100);
    expect(state.performInteraction("guitar-buy").ok).toBe(true);
    expect(state.snapshot().inventory).toContain("guitar");
    expect(state.snapshot().stats.happiness).toBe(7);
  });

  it("requires the bar to be visited after 5 PM", () => {
    const state = new GameState();
    state.unlockWorldStage(1);
    state.updateStat("money", 20);
    expect(state.getInteractionAvailability("bar-evening").allowed).toBe(false);
    state.debugSetTime(17 * 60);
    expect(state.performInteraction("bar-evening").ok).toBe(true);
    expect(state.snapshot().stats.socialStatus).toBe(1);
  });
});

describe("calendar and events", () => {
  it("advances seasons after five days and years after twenty", () => {
    const seasonState = new GameState();
    for (let index = 0; index < 5; index += 1) seasonState.sleep();
    expect(seasonState.snapshot().season).toBe("Summer");
    expect(seasonState.snapshot().day).toBe(6);

    const yearState = new GameState();
    for (let index = 0; index < 20; index += 1) yearState.sleep();
    expect(yearState.snapshot().year).toBe(2);
    expect(yearState.snapshot().day).toBe(1);
    expect(yearState.snapshot().season).toBe("Spring");
  });

  it("enforces event eligibility and cooldowns", () => {
    const state = new GameState();
    expect(
      state.cityEvents.isEligible(CITY_EVENT_BY_ID["snow-day"], state.snapshot()),
    ).toBe(false);
    expect(state.triggerEvent("parents-visit").ok).toBe(true);
    expect(state.triggerEvent("parents-visit").ok).toBe(false);
    expect(state.snapshot().eventCooldowns["parents-visit"]).toBe(1);
  });

  it("selects a tailored event for the current life", () => {
    const state = new GameState();
    expect(state.cityEvents.selectTailored(state.snapshot())?.id).toBe("parents-visit");
  });

  it("tailors Parents Visit to housing", () => {
    const tiny = new GameState();
    tiny.triggerEvent("parents-visit");
    expect(tiny.snapshot().stats.happiness).toBe(3);

    const better = new GameState();
    better.debugSetHousing("better-apartment");
    better.triggerEvent("parents-visit");
    expect(better.snapshot().stats.happiness).toBe(5);
  });

  it("persists a rent increase across days", () => {
    const state = new GameState();
    state.triggerEvent("rent-increase");
    expect(state.snapshot().rent).toBe(15);
    state.sleep();
    expect(state.snapshot().rent).toBe(15);
  });

  it("applies clear-day, sporting-event, and trend modifiers", () => {
    const state = new GameState();
    state.unlockWorldStage(1);
    state.triggerEvent("clear-day", true);
    state.performInteraction("park-walk");
    expect(state.snapshot().stats.happiness).toBe(7);

    state.updateStat("money", 30);
    state.debugSetTime(17 * 60);
    state.triggerEvent("sporting-event", true);
    state.performInteraction("bar-evening");
    expect(state.snapshot().stats.socialStatus).toBe(2);

    state.triggerEvent("ideological-trend", true);
    state.performInteraction("coffee-order");
    expect(state.snapshot().stats.socialStatus).toBe(4);
  });
});
