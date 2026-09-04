import type { CityEventDefinition } from "./types";

export const CITY_EVENTS: CityEventDefinition[] = [
  {
    id: "parents-visit",
    name: "Parents Visit",
    category: "personal",
    description: "Your parents have opinions about square footage.",
    cooldownDays: 12,
    eligibility: () => true,
    tailoredScore: (state) => (state.housing === "tiny-apartment" ? 25 : 8),
    resolve: (state) =>
      state.housing === "tiny-apartment"
        ? {
            message:
              "Your parents inspect the tiny apartment, open one closet, and become very quiet. Happiness -2.",
            statChanges: { happiness: -2 },
          }
        : state.housing === "house"
          ? {
              message:
                "Your parents are impressed by the house and immediately identify a load-bearing concern. Happiness +1.",
              statChanges: { happiness: 1 },
            }
          : {
              message:
                "Your parents approve of the apartment, then ask when you plan to buy. No mechanical damage.",
            },
  },
  {
    id: "snow-day",
    name: "Snow Day",
    category: "weather",
    description: "Two inches of snow have placed the city in ceremonial lockdown.",
    cooldownDays: 15,
    eligibility: (state) => state.season === "Winter",
    tailoredScore: (state) => (state.season === "Winter" ? 22 : 0),
    resolve: () => ({
      message:
        "Snow Day: Cascadia Solutions closes, buses become conceptual, and the park becomes unusually delightful.",
      weather: "snow",
      storyFlags: ["snow-day"],
    }),
  },
  {
    id: "rent-increase",
    name: "Rent Increase",
    category: "housing",
    description: "Your landlord has discovered the phrase 'market conditions.'",
    cooldownDays: 15,
    eligibility: () => true,
    tailoredScore: (state) => (state.stats.money > 80 ? 5 : 2),
    resolve: (state) => ({
      message: `Market conditions have personally selected you. Seasonal rent rises from $${state.rent} to $${state.rent + 5}.`,
      rentChange: 5,
    }),
  },
  {
    id: "bridge-closure",
    name: "Bridge Closure",
    category: "transportation",
    description: "A bridge has entered a period of reflective maintenance.",
    cooldownDays: 8,
    eligibility: (state) => state.worldStage >= 1,
    tailoredScore: (state) => (state.storyFlags.includes("visited-rainier-overlook") ? 14 : 6),
    resolve: () => ({
      message: "Bridge closure: transit trips take 30 extra minutes today. The bridge apologizes structurally.",
      transitDelayMinutes: 30,
      storyFlags: ["bridge-closure"],
    }),
  },
  {
    id: "clear-day",
    name: "Beautiful Clear Day",
    category: "weather",
    description: "The Mountain is out. Productivity briefly collapses.",
    cooldownDays: 7,
    eligibility: (state) => !state.activeEvents.includes("smoke-week"),
    tailoredScore: (state) => (state.stats.happiness <= 5 ? 18 : 10),
    resolve: () => ({
      message:
        "The clouds part. Mount Rainier appears and everyone briefly forgives the city. Park walks give +1 extra Happiness.",
      weather: "clear",
      storyFlags: ["clear-day"],
    }),
  },
  {
    id: "smoke-week",
    name: "Smoke Week",
    category: "weather",
    description: "Outdoor air has acquired tasting notes.",
    cooldownDays: 18,
    eligibility: (state) => state.season === "Summer" || state.season === "Fall",
    tailoredScore: (state) => (state.season === "Summer" ? 17 : 8),
    resolve: () => ({
      message:
        "Smoke Week: outdoor locations close for the day. Indoor businesses begin describing filtered air as an amenity.",
      weather: "smoke",
      storyFlags: ["smoke-week"],
    }),
  },
  {
    id: "sporting-event",
    name: "Local Sporting Event",
    category: "civic",
    description: "Every jersey in the region is moving toward the same block.",
    cooldownDays: 5,
    eligibility: (state) => state.worldStage >= 1,
    tailoredScore: (state) => (state.minutes >= 16 * 60 ? 14 : 7),
    resolve: () => ({
      message:
        "Game night: the bar is electric, transit is crowded, and everyone has become a tactical analyst.",
      transitDelayMinutes: 15,
      storyFlags: ["sporting-event"],
    }),
  },
  {
    id: "ideological-trend",
    name: "New Ideological Trend",
    category: "zeitgeist",
    description: "The Mandatory Authenticity Movement has issued voluntary requirements.",
    cooldownDays: 20,
    eligibility: () => true,
    tailoredScore: (state) => (state.stats.socialStatus >= 3 ? 15 : 5),
    resolve: () => ({
      message:
        "Citywide trend: Mandatory Authenticity. Coffee status rewards rise, while convenience-store packaging becomes ethically more expensive.",
      cityTrend: "Mandatory Authenticity",
      storyFlags: ["mandatory-authenticity"],
    }),
  },
];

export const CITY_EVENT_BY_ID = Object.fromEntries(
  CITY_EVENTS.map((event) => [event.id, event]),
) as Record<string, CityEventDefinition>;

export class CityEventManager {
  isEligible(
    definition: CityEventDefinition,
    state: Readonly<import("./types").GameSnapshot>,
  ): boolean {
    const lastDay = state.eventCooldowns[definition.id];
    const cooldownReady =
      lastDay === undefined || state.totalDays - lastDay >= definition.cooldownDays;
    return cooldownReady && definition.eligibility(state);
  }

  eligible(state: Readonly<import("./types").GameSnapshot>): CityEventDefinition[] {
    return CITY_EVENTS.filter((event) => this.isEligible(event, state));
  }

  selectTailored(
    state: Readonly<import("./types").GameSnapshot>,
  ): CityEventDefinition | undefined {
    return this.eligible(state).sort(
      (a, b) => b.tailoredScore(state) - a.tailoredScore(state),
    )[0];
  }
}
