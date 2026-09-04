import type { InteractionDefinition } from "./types";

export const INTERACTIONS: InteractionDefinition[] = [
  {
    id: "coffee-order",
    locationId: "coffee",
    displayName: "Order something geographically specific",
    description: "A warm beverage, a small energy reserve, and a minor identity component.",
    costs: { money: 5, minutes: 15 },
    rewards: { socialStatus: 1, energy: 25, carriedItem: "coffee" },
    maximumUsesPerDay: 1,
    resultText:
      "You successfully ordered without asking what any of those words meant. Money -$5, Status +1, Energy +25. You are carrying coffee.",
  },
  {
    id: "coffee-recover",
    locationId: "coffee",
    displayName: "Sit and recover",
    description: "Look thoughtfully through a rainy window.",
    requirements: { money: 4 },
    costs: { money: 4, minutes: 60 },
    rewards: { happiness: 1, energy: 15 },
    maximumUsesPerDay: 1,
    resultText:
      "You stared through the window until the weather became self-care. Happiness +1, Energy +15.",
  },
  {
    id: "cheap-meal",
    locationId: "convenience",
    displayName: "Buy a cheap meal",
    description: "Warm, beige, and legally a meal.",
    requirements: { money: 8 },
    costs: { money: 8, minutes: 30 },
    rewards: { happiness: 1, energy: 20 },
    resultText:
      "The microwave beeped with surprising tenderness. Happiness +1, Energy +20.",
  },
  {
    id: "park-walk",
    locationId: "park",
    displayName: "Take a walk",
    description: "Walk under evergreens and silently rank other people's dogs.",
    costs: { minutes: 60 },
    rewards: { happiness: 1, energy: 5 },
    maximumUsesPerDay: 1,
    resultText:
      "For one full hour, nobody invited you to a meeting. Happiness +1, Energy +5.",
  },
  {
    id: "bar-evening",
    locationId: "bar",
    displayName: "Stop in after work",
    description: "A drink, a snack, and several confident opinions about zoning.",
    requirements: { money: 15, afterMinutes: 17 * 60 },
    costs: { money: 15, minutes: 120 },
    rewards: { socialStatus: 1, happiness: 1 },
    maximumUsesPerDay: 1,
    resultText:
      "You nodded at the correct local references and secured a booth. Status +1, Happiness +1.",
  },
  {
    id: "theater-usher",
    locationId: "theater",
    displayName: "Volunteer as an usher",
    description: "Distribute programs and learn who has strong feelings about aisle seating.",
    costs: { minutes: 180 },
    rewards: { socialStatus: 2 },
    maximumUsesPerSeason: 1,
    resultText:
      "You seated 63 people and redirected one experimental hat. Social Status +2.",
  },
  {
    id: "music-browse",
    locationId: "music-store",
    displayName: "Browse instruments",
    description: "Admire an affordable pick and several unaffordable identities.",
    costs: { minutes: 30 },
    rewards: { storyFlag: "guitar-revealed" },
    resultText:
      "Behind the counter: a battered guitar for $120. It has character, which is retail for scratches.",
  },
  {
    id: "guitar-buy",
    locationId: "music-store",
    displayName: "Buy the battered guitar",
    description: "A future source of happiness, obligations, and cable purchases.",
    requirements: { money: 120, storyFlag: "guitar-revealed" },
    costs: { money: 120 },
    rewards: { item: "guitar", happiness: 2, storyFlag: "owns-guitar" },
    hiddenUntilStoryFlag: "guitar-revealed",
    resultText:
      "You own a guitar. Three future versions of you immediately form a band. Happiness +2.",
  },
  {
    id: "sketchbook-buy",
    locationId: "art-store",
    displayName: "Buy a sketchbook",
    description: "Heavy paper for documenting rain from multiple angles.",
    requirements: { money: 20, socialStatus: 3 },
    costs: { money: 20, minutes: 30 },
    rewards: { item: "sketchbook", happiness: 1, storyFlag: "owns-sketchbook" },
    resultText:
      "The clerk gives a nearly perceptible nod. You own a sketchbook. Happiness +1.",
  },
  {
    id: "transit-trip",
    locationId: "transit",
    displayName: "Ride to Rainier Overlook",
    description: "Preview another district via the region-to-region transit architecture.",
    requirements: { money: 3, storyFlag: "first-expansion" },
    costs: { money: 3, minutes: 30 },
    rewards: { storyFlag: "visited-rainier-overlook" },
    resultText:
      "You ride to Rainier Overlook, admire a placeholder block, and return with transit architecture proven.",
  },
  {
    id: "stay-home",
    locationId: "apartment",
    displayName: "Stay home alone",
    description: "Spend two hours enjoying full control of the thermostat.",
    costs: { minutes: 120 },
    rewards: { happiness: 1, energy: 15 },
    maximumUsesPerDay: 1,
    resultText:
      "Nobody asked where you see yourself in five years. Happiness +1, Energy +15.",
  },
];

export const INTERACTION_BY_ID = Object.fromEntries(
  INTERACTIONS.map((interaction) => [interaction.id, interaction]),
) as Record<string, InteractionDefinition>;
