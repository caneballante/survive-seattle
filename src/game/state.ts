import { CityEventManager, CITY_EVENT_BY_ID, CITY_EVENTS } from "./cityEvents";
import { INTERACTION_BY_ID, INTERACTIONS } from "./interactions";
import { LOCATION_BY_ID } from "./locations";
import { OpportunityManager } from "./opportunities";
import { getWorldStage } from "./regions";
import {
  getEncounterChoiceAvailability,
  STREET_ENCOUNTER_BY_ID,
} from "./streetEncounters";
import { getDailyWeather } from "./weather";
import type {
  ActionResult,
  CityEventDefinition,
  GameSnapshot,
  HousingId,
  InteractionAvailability,
  InteractionDefinition,
  Job,
  LocationId,
  Opportunity,
  PlayerStats,
  RegionId,
  Season,
} from "./types";

export const AVAILABLE_JOB: Job = {
  title: "Junior Community Alignment Associate",
  employer: "Cascadia Solutions",
  description:
    "Help a growing organization ensure that its values, messaging, and meeting invitations remain strategically adjacent.",
};

const SEASONS: Season[] = ["Spring", "Summer", "Fall", "Winter"];
const DAYS_PER_SEASON = 5;
const DAYS_PER_YEAR = 20;
const MAX_ENERGY = 100;
const MORNING_ENERGY = 70;

type StateListener = (snapshot: Readonly<GameSnapshot>) => void;

function has<T>(values: readonly T[], value: T): boolean {
  return values.includes(value);
}

export class GameState {
  private data: GameSnapshot;
  readonly opportunities = new OpportunityManager();
  readonly cityEvents = new CityEventManager();
  private readonly listeners = new Set<StateListener>();

  constructor() {
    this.data = this.freshSnapshot();
    this.opportunities.refresh(this.data);
  }

  private freshSnapshot(): GameSnapshot {
    return {
      day: 1,
      season: "Spring",
      year: 1,
      totalDays: 1,
      minutes: 8 * 60,
      stats: { money: 20, socialStatus: 0, happiness: 5 },
      energy: MORNING_ENERGY,
      carriedItem: null,
      daily: {
        coffeeOrdered: false,
        workCompleted: false,
        interactionUses: {},
      },
      seasonUses: {},
      job: null,
      prototypeComplete: false,
      inventory: [],
      housing: "tiny-apartment",
      storyFlags: [],
      unlockedRegions: ["arrival"],
      worldStage: 0,
      rent: 10,
      activeEvents: [],
      eventCooldowns: {},
      cityTrend: null,
      weather: getDailyWeather(1, "Spring"),
      transitDelayMinutes: 0,
      currentDistrict: "Arrival Block",
      relationshipStrength: 0,
      familyMembers: 0,
    };
  }

  snapshot(): Readonly<GameSnapshot> {
    return {
      ...this.data,
      stats: { ...this.data.stats },
      daily: {
        ...this.data.daily,
        interactionUses: { ...this.data.daily.interactionUses },
      },
      seasonUses: { ...this.data.seasonUses },
      job: this.data.job ? { ...this.data.job } : null,
      inventory: [...this.data.inventory],
      storyFlags: [...this.data.storyFlags],
      unlockedRegions: [...this.data.unlockedRegions],
      activeEvents: [...this.data.activeEvents],
      eventCooldowns: { ...this.data.eventCooldowns },
    };
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  private finish(
    message: string,
    opportunityId?: string,
    extras: Partial<ActionResult> = {},
  ): ActionResult {
    if (opportunityId) this.opportunities.complete(opportunityId);
    const activated = this.opportunities.refresh(this.data);
    this.emit();
    return { ok: true, message, activated, ...extras };
  }

  private failure(message: string): ActionResult {
    return { ok: false, message, activated: [] };
  }

  advanceTime(minutes: number): void {
    if (minutes < 0) throw new Error("Time cannot move backwards.");
    this.data.minutes += minutes;
    this.emit();
  }

  updateStat(stat: keyof PlayerStats, amount: number): void {
    this.data.stats[stat] += amount;
    this.emit();
  }

  updateEnergy(amount: number): void {
    this.data.energy = Math.max(0, Math.min(MAX_ENERGY, this.data.energy + amount));
    this.emit();
  }

  spendEnergy(amount: number): boolean {
    if (amount <= 0 || this.data.energy < amount) return false;
    this.data.energy = Math.max(0, this.data.energy - amount);
    this.emit();
    return true;
  }

  isRegionUnlocked(regionId: RegionId): boolean {
    return has(this.data.unlockedRegions, regionId);
  }

  isLocationUnlocked(locationId: LocationId): boolean {
    return LOCATION_BY_ID[locationId] !== undefined;
  }

  getVisibleInteractions(locationId: LocationId): InteractionDefinition[] {
    const flags = this.data.storyFlags;
    return INTERACTIONS.filter(
      (interaction) =>
        interaction.locationId === locationId &&
        (!interaction.hiddenUntilStoryFlag ||
          flags.includes(interaction.hiddenUntilStoryFlag)),
    );
  }

  getInteractionAvailability(interactionId: string): InteractionAvailability {
    const interaction = INTERACTION_BY_ID[interactionId];
    if (!interaction) return { allowed: false, reasons: ["Unknown interaction."] };

    const reasons: string[] = [];
    const requirements = interaction.requirements ?? {};
    const costs = this.getEffectiveCosts(interaction);
    const location = LOCATION_BY_ID[interaction.locationId];

    if (requirements.region && !this.isRegionUnlocked(requirements.region)) {
      reasons.push("The required city region is still closed.");
    }
    if ((requirements.money ?? costs.money ?? 0) > this.data.stats.money) {
      reasons.push(`Requires $${requirements.money ?? costs.money}.`);
    }
    if ((requirements.socialStatus ?? 0) > this.data.stats.socialStatus) {
      reasons.push(`Requires Social Status ${requirements.socialStatus}.`);
    }
    if ((requirements.happiness ?? 0) > this.data.stats.happiness) {
      reasons.push(`Requires Happiness ${requirements.happiness}.`);
    }
    if ((requirements.energy ?? costs.energy ?? 0) > this.data.energy) {
      reasons.push(`Requires ${requirements.energy ?? costs.energy} Energy.`);
    }
    if (requirements.job === true && !this.data.job) reasons.push("Requires a job.");
    if (requirements.job === false && this.data.job) reasons.push("Requires being between jobs.");
    if (requirements.relationship === true && this.data.relationshipStrength <= 0) {
      reasons.push("Requires a relationship.");
    }
    if (requirements.family === true && this.data.familyMembers <= 0) {
      reasons.push("Requires a family.");
    }
    if (requirements.housing && requirements.housing !== this.data.housing) {
      reasons.push(`Requires ${requirements.housing.replaceAll("-", " ")}.`);
    }
    if (requirements.item && !this.data.inventory.includes(requirements.item)) {
      reasons.push(`Requires ${requirements.item}.`);
    }
    if (
      requirements.storyFlag &&
      !this.data.storyFlags.includes(requirements.storyFlag)
    ) {
      reasons.push("A related opportunity must be discovered first.");
    }
    if (
      requirements.afterMinutes !== undefined &&
      this.data.minutes < requirements.afterMinutes
    ) {
      reasons.push(`Available after ${formatTime(requirements.afterMinutes)}.`);
    }
    if (
      requirements.beforeMinutes !== undefined &&
      this.data.minutes >= requirements.beforeMinutes
    ) {
      reasons.push(`Available before ${formatTime(requirements.beforeMinutes)}.`);
    }

    const dailyUses = this.data.daily.interactionUses[interaction.id] ?? 0;
    if (
      interaction.maximumUsesPerDay !== undefined &&
      dailyUses >= interaction.maximumUsesPerDay
    ) {
      reasons.push("Already used today.");
    }
    const seasonUses = this.data.seasonUses[interaction.id] ?? 0;
    if (
      interaction.maximumUsesPerSeason !== undefined &&
      seasonUses >= interaction.maximumUsesPerSeason
    ) {
      reasons.push("Already used this season.");
    }

    if (
      location.outdoor &&
      this.data.activeEvents.includes("smoke-week")
    ) {
      reasons.push("Closed because the outdoor air is currently a concept.");
    }
    if (
      interaction.id === "theater-usher" &&
      this.data.job &&
      !this.data.daily.workCompleted &&
      this.data.minutes >= 9 * 60 &&
      this.data.minutes < 17 * 60
    ) {
      reasons.push("Unavailable while you are supposed to be working.");
    }
    if (
      interaction.rewards?.item &&
      this.data.inventory.includes(interaction.rewards.item)
    ) {
      reasons.push(`You already own the ${interaction.rewards.item}.`);
    }

    return { allowed: reasons.length === 0, reasons };
  }

  private getEffectiveCosts(interaction: InteractionDefinition): {
    minutes: number;
    money: number;
    socialStatus: number;
    happiness: number;
    energy: number;
  } {
    const base = interaction.costs ?? {};
    let minutes = base.minutes ?? 0;
    let money = base.money ?? 0;
    if (interaction.id === "transit-trip") minutes += this.data.transitDelayMinutes;
    if (
      interaction.id === "cheap-meal" &&
      this.data.cityTrend === "Mandatory Authenticity"
    ) {
      money += 2;
    }
    return {
      minutes,
      money,
      socialStatus: base.socialStatus ?? 0,
      happiness: base.happiness ?? 0,
      energy: base.energy ?? 0,
    };
  }

  performInteraction(interactionId: string): ActionResult {
    const interaction = INTERACTION_BY_ID[interactionId];
    if (!interaction) return this.failure("That interaction does not exist.");
    const availability = this.getInteractionAvailability(interactionId);
    if (!availability.allowed) return this.failure(availability.reasons.join(" "));

    if (
      interaction.chanceOfSuccess !== undefined &&
      Math.random() > interaction.chanceOfSuccess
    ) {
      return this.failure(interaction.failureResult ?? "It did not work out.");
    }

    const costs = this.getEffectiveCosts(interaction);
    const rewards = interaction.rewards ?? {};
    this.data.minutes += costs.minutes;
    this.data.stats.money -= costs.money;
    this.data.stats.socialStatus -= costs.socialStatus;
    this.data.stats.happiness -= costs.happiness;
    this.data.energy = Math.max(0, this.data.energy - costs.energy);
    this.data.stats.money += rewards.money ?? 0;
    this.data.stats.socialStatus += rewards.socialStatus ?? 0;
    this.data.stats.happiness += rewards.happiness ?? 0;
    this.data.energy = Math.max(
      0,
      Math.min(MAX_ENERGY, this.data.energy + (rewards.energy ?? 0)),
    );

    if (
      interaction.id === "coffee-order" &&
      this.data.cityTrend === "Mandatory Authenticity"
    ) {
      this.data.stats.socialStatus += 1;
    }
    if (
      interaction.id === "park-walk" &&
      this.data.activeEvents.includes("clear-day")
    ) {
      this.data.stats.happiness += 1;
    }
    if (
      interaction.id === "park-walk" &&
      this.data.activeEvents.includes("snow-day")
    ) {
      this.data.stats.happiness += 1;
    }
    if (
      interaction.id === "bar-evening" &&
      this.data.activeEvents.includes("sporting-event")
    ) {
      this.data.stats.socialStatus += 1;
    }

    if (rewards.item && !this.data.inventory.includes(rewards.item)) {
      this.data.inventory.push(rewards.item);
    }
    if (rewards.carriedItem) this.data.carriedItem = rewards.carriedItem;
    if (rewards.storyFlag && !this.data.storyFlags.includes(rewards.storyFlag)) {
      this.data.storyFlags.push(rewards.storyFlag);
    }
    if (rewards.housing) this.data.housing = rewards.housing;
    if (rewards.relationshipEffect) {
      this.data.relationshipStrength += rewards.relationshipEffect;
    }
    if (rewards.jobTitle) {
      this.data.job = {
        title: rewards.jobTitle,
        employer: "Future Employer",
        description: "A data-driven job reward.",
      };
    }
    if (rewards.promotion && this.data.job) {
      this.data.job.title = rewards.promotion;
    }
    if (interaction.id === "coffee-order") {
      this.data.daily.coffeeOrdered = true;
      this.opportunities.complete("morning-coffee");
    }
    if (interaction.id === "transit-trip") {
      this.data.currentDistrict = "Rainier Overlook (preview)";
    }

    this.data.daily.interactionUses[interaction.id] =
      (this.data.daily.interactionUses[interaction.id] ?? 0) + 1;
    this.data.seasonUses[interaction.id] =
      (this.data.seasonUses[interaction.id] ?? 0) + 1;

    let resultText = interaction.resultText;
    if (
      interaction.id === "park-walk" &&
      (this.data.activeEvents.includes("clear-day") ||
        this.data.activeEvents.includes("snow-day"))
    ) {
      resultText += " Event bonus: Happiness +1.";
    }
    if (
      interaction.id === "bar-evening" &&
      this.data.activeEvents.includes("sporting-event")
    ) {
      resultText += " Game-night bonus: Social Status +1.";
    }
    if (
      interaction.id === "cheap-meal" &&
      this.data.cityTrend === "Mandatory Authenticity"
    ) {
      resultText += " Authentic packaging surcharge: $2.";
    }

    return this.finish(resultText, rewards.opportunityId);
  }

  getStreetEncounterChoiceAvailability(
    encounterId: string,
    choiceId: string,
  ): InteractionAvailability {
    const encounter = STREET_ENCOUNTER_BY_ID[encounterId];
    const choice = encounter?.choices.find((item) => item.id === choiceId);
    if (!encounter || !choice) {
      return { allowed: false, reasons: ["Unknown street encounter choice."] };
    }
    return getEncounterChoiceAvailability(this.snapshot(), choice);
  }

  resolveStreetEncounter(encounterId: string, choiceId: string): ActionResult {
    const encounter = STREET_ENCOUNTER_BY_ID[encounterId];
    const choice = encounter?.choices.find((item) => item.id === choiceId);
    if (!encounter || !choice) return this.failure("That street encounter does not exist.");

    const availability = getEncounterChoiceAvailability(this.snapshot(), choice);
    if (!availability.allowed) return this.failure(availability.reasons.join(" "));

    const effect = choice.effect;
    this.data.minutes += effect.minutes ?? 0;
    this.data.stats.money = Math.max(0, this.data.stats.money + (effect.money ?? 0));
    this.data.stats.socialStatus = Math.max(
      0,
      this.data.stats.socialStatus + (effect.socialStatus ?? 0),
    );
    this.data.stats.happiness = Math.max(
      0,
      this.data.stats.happiness + (effect.happiness ?? 0),
    );
    this.data.energy = Math.max(
      0,
      Math.min(MAX_ENERGY, this.data.energy + (effect.energy ?? 0)),
    );

    let resultText = choice.resultText;
    if (effect.dropCarriedItem && this.data.carriedItem) {
      const dropped = this.data.carriedItem;
      this.data.carriedItem = null;
      resultText += ` Your ${dropped} is no longer part of the journey.`;
    }
    return this.finish(resultText);
  }

  visitLocation(locationId: LocationId): void {
    const region = LOCATION_BY_ID[locationId].regionId;
    if (
      this.data.worldStage >= 1 &&
      (region === "neighborhood-west" || region === "neighborhood-east") &&
      !this.data.storyFlags.includes("explored-neighborhood")
    ) {
      this.data.storyFlags.push("explored-neighborhood");
      this.opportunities.complete("see-neighborhood");
      this.opportunities.refresh(this.data);
      this.emit();
    }
  }

  orderCoffee(): ActionResult {
    return this.performInteraction("coffee-order");
  }

  acceptJob(): ActionResult {
    if (this.data.job) {
      return this.failure("You already possess a job and its associated meeting invitations.");
    }
    this.data.job = { ...AVAILABLE_JOB };
    this.data.minutes += 15;
    return this.finish(
      "Congratulations. Your calendar is now culturally aligned. Cascadia Solutions is open.",
      "check-jobs",
    );
  }

  workShift(): ActionResult {
    if (!this.data.job) {
      return this.failure("The lobby has identified you as a person who does not work here yet.");
    }
    if (this.data.activeEvents.includes("snow-day")) {
      return this.failure(
        "Cascadia Solutions is closed for the snow day. Productivity has been rescheduled.",
      );
    }
    if (this.data.daily.workCompleted) {
      return this.failure("You already donated eight hours to strategic adjacency today.");
    }
    if (this.data.minutes >= 12 * 60) {
      return this.failure(
        "The morning shift stopped accepting arrivals at noon. Seattle has preserved your free time without pay.",
      );
    }

    this.data.daily.workCompleted = true;
    this.data.stats.money += 100;
    this.data.energy = Math.max(0, this.data.energy - 35);
    this.data.minutes += 8 * 60;
    return this.finish(
      "You attended three meetings, replied 'Sounds good' seven times, and completed one actual task. Money +$100, Energy -35.",
      "first-shift",
    );
  }

  sleep(): ActionResult {
    this.data.stats.happiness += 1;
    const completedDay = this.data.day;
    const earned = this.data.daily.workCompleted ? "$100" : "$0";
    const coffee = this.data.daily.coffeeOrdered ? "one elaborate coffee" : "no coffee";
    const previousSeason = this.data.season;
    const previousYear = this.data.year;

    this.advanceCalendarOneDay();
    const firstExpansion = completedDay === 1 && this.data.year === 1;
    if (firstExpansion) this.unlockWorldStage(1);

    const seasonAdvanced = previousSeason !== this.data.season;
    const yearAdvanced = previousYear !== this.data.year;
    let recurringText = "";
    if (seasonAdvanced || yearAdvanced) {
      this.data.stats.money -= this.data.rent;
      this.data.seasonUses = {};
      recurringText = ` Seasonal rent: -$${this.data.rent}.`;
    }

    this.data.minutes = 8 * 60;
    this.data.energy = MORNING_ENERGY;
    this.data.carriedItem = null;
    this.data.daily = {
      coffeeOrdered: false,
      workCompleted: false,
      interactionUses: {},
    };
    this.data.prototypeComplete = this.data.totalDays >= 2;
    this.data.activeEvents = [];
    this.data.weather = getDailyWeather(this.data.totalDays, this.data.season);
    this.data.transitDelayMinutes = 0;
    this.data.currentDistrict = "Arrival Block";
    this.opportunities.reset([
      "morning-coffee",
      "first-shift",
      "return-home",
      "see-neighborhood",
    ]);

    const expansionText = firstExpansion
      ? " Overnight, several storefronts that were already visible begin offering slightly more plausible possibilities."
      : "";
    return this.finish(
      `Day ${completedDay}: earned ${earned}, survived ${coffee}, and made it home. Happiness +1.${recurringText}${expansionText}`,
      undefined,
      {
        worldExpanded: firstExpansion,
        seasonAdvanced,
        yearAdvanced,
      },
    );
  }

  private advanceCalendarOneDay(): void {
    this.data.totalDays += 1;
    if (this.data.day >= DAYS_PER_YEAR) {
      this.data.day = 1;
      this.data.year += 1;
      this.data.season = "Spring";
      return;
    }
    this.data.day += 1;
    this.data.season = SEASONS[Math.floor((this.data.day - 1) / DAYS_PER_SEASON)];
  }

  unlockWorldStage(stage: number): void {
    const nextStage = getWorldStage(stage);
    this.data.worldStage = Math.max(this.data.worldStage, nextStage.stage);
    for (const region of nextStage.unlockedRegions) {
      if (!this.data.unlockedRegions.includes(region)) {
        this.data.unlockedRegions.push(region);
      }
    }
    if (
      nextStage.stage >= 1 &&
      !this.data.storyFlags.includes("first-expansion")
    ) {
      this.data.storyFlags.push("first-expansion");
    }
    this.opportunities.refresh(this.data);
    this.emit();
  }

  triggerEvent(eventId: string, force = false): ActionResult {
    const definition = CITY_EVENT_BY_ID[eventId];
    if (!definition) return this.failure("Unknown city event.");
    if (!force && !this.cityEvents.isEligible(definition, this.snapshot())) {
      return this.failure(
        `${definition.name} is not currently eligible or is still on cooldown.`,
      );
    }

    const resolution = definition.resolve(this.snapshot());
    for (const [stat, amount] of Object.entries(resolution.statChanges ?? {})) {
      this.data.stats[stat as keyof PlayerStats] += amount ?? 0;
    }
    this.data.rent += resolution.rentChange ?? 0;
    if (resolution.weather) this.data.weather = resolution.weather;
    this.data.transitDelayMinutes += resolution.transitDelayMinutes ?? 0;
    for (const flag of resolution.storyFlags ?? []) {
      if (!this.data.storyFlags.includes(flag)) this.data.storyFlags.push(flag);
    }
    if (resolution.cityTrend) this.data.cityTrend = resolution.cityTrend;
    if (!this.data.activeEvents.includes(definition.id)) {
      this.data.activeEvents.push(definition.id);
    }
    this.data.eventCooldowns[definition.id] = this.data.totalDays;
    return this.finish(`${definition.name}: ${resolution.message}`);
  }

  triggerTailoredEvent(): ActionResult {
    const selected = this.cityEvents.selectTailored(this.snapshot());
    return selected
      ? this.triggerEvent(selected.id)
      : this.failure("No city event is currently eligible.");
  }

  debugSetTime(minutes: number): void {
    this.data.minutes = Math.max(0, minutes);
    this.emit();
  }

  debugAdvanceDay(): ActionResult {
    return this.sleep();
  }

  debugAdvanceSeason(): void {
    const currentSeason = SEASONS.indexOf(this.data.season);
    if (currentSeason === SEASONS.length - 1) {
      this.data.year += 1;
      this.data.day = 1;
      this.data.season = "Spring";
    } else {
      this.data.day = (currentSeason + 1) * DAYS_PER_SEASON + 1;
      this.data.season = SEASONS[currentSeason + 1];
    }
    this.data.totalDays += DAYS_PER_SEASON;
    this.data.seasonUses = {};
    this.data.weather = getDailyWeather(this.data.totalDays, this.data.season);
    this.emit();
  }

  debugAdvanceYear(): void {
    this.data.year += 1;
    this.data.day = 1;
    this.data.season = "Spring";
    this.data.totalDays += DAYS_PER_YEAR;
    this.data.seasonUses = {};
    this.data.weather = getDailyWeather(this.data.totalDays, this.data.season);
    this.emit();
  }

  debugAddItem(item: string): void {
    if (!this.data.inventory.includes(item)) this.data.inventory.push(item);
    this.emit();
  }

  debugSetHousing(housing: HousingId): void {
    this.data.housing = housing;
    this.emit();
  }

  reset(): Opportunity[] {
    this.data = this.freshSnapshot();
    this.opportunities.reset([
      "morning-coffee",
      "check-jobs",
      "first-shift",
      "return-home",
      "see-neighborhood",
    ]);
    const activated = this.opportunities.refresh(this.data);
    this.emit();
    return activated;
  }

  getEventDefinitions(): CityEventDefinition[] {
    return [...CITY_EVENTS];
  }
}

export function formatTime(totalMinutes: number): string {
  const minutesInDay = ((totalMinutes % 1440) + 1440) % 1440;
  const hours24 = Math.floor(minutesInDay / 60);
  const minutes = minutesInDay % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, "0")} ${suffix}`;
}
