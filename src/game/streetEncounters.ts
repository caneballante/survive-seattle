import type { GameSnapshot } from "./types";

export type StreetActorKind =
  | "phone-walker"
  | "panhandler"
  | "cyclist"
  | "neighbor";

export type StreetActorBehavior = "patrol" | "intercept";

export interface EncounterEffect {
  minutes?: number;
  money?: number;
  socialStatus?: number;
  happiness?: number;
  energy?: number;
  dropCarriedItem?: boolean;
}

export interface EncounterChoiceDefinition {
  id: string;
  label: string;
  description: string;
  requirements?: {
    money?: number;
    energy?: number;
  };
  effect: EncounterEffect;
  resultText: string;
}

export interface StreetEncounterDefinition {
  id: string;
  name: string;
  kind: StreetActorKind;
  behavior: StreetActorBehavior;
  eyebrow: string;
  description: string;
  activeAfter: number;
  activeBefore: number;
  startOffset: number;
  lane: 0 | 1;
  speed: number;
  direction: -1 | 1;
  triggerDistance: number;
  noticeDistance: number;
  choices: EncounterChoiceDefinition[];
  palette: {
    skin: number;
    coat: number;
    pants: number;
    accent: number;
  };
}

export interface EncounterChoiceAvailability {
  allowed: boolean;
  reasons: string[];
}

export const STREET_ENCOUNTERS: StreetEncounterDefinition[] = [
  {
    id: "phone-walker",
    name: "Phone Walker",
    kind: "phone-walker",
    behavior: "patrol",
    eyebrow: "SIDEWALK TRAFFIC",
    description:
      "A glowing rectangle has assumed temporary control of another pedestrian.",
    activeAfter: 7 * 60,
    activeBefore: 23 * 60,
    startOffset: -260,
    lane: 0,
    speed: 36,
    direction: 1,
    triggerDistance: 34,
    noticeDistance: 0,
    choices: [
      {
        id: "sidestep",
        label: "Untangle and move on",
        description: "Recover from a low-speed collision between two modern lives.",
        effect: { minutes: 8, energy: -3 },
        resultText:
          "You exchange synchronized apologies without either person making eye contact. Time +8 min, Energy -3.",
      },
      {
        id: "make-a-point",
        label: "Make a point about sidewalk awareness",
        description: "Technically correct and socially expensive.",
        effect: { minutes: 5, socialStatus: -1, happiness: -1 },
        resultText:
          "You win the sidewalk argument and lose every other part of it. Status -1, Happiness -1.",
      },
    ],
    palette: { skin: 0xb9795c, coat: 0x56818b, pants: 0x253742, accent: 0xb8edf0 },
  },
  {
    id: "aggressive-panhandler",
    name: "Aggressive Panhandler",
    kind: "panhandler",
    behavior: "intercept",
    eyebrow: "UNPLANNED CONVERSATION",
    description:
      "A stranger steps into your path and turns a request for money into a full-contact sales funnel.",
    activeAfter: 9 * 60,
    activeBefore: 22 * 60,
    startOffset: 360,
    lane: 1,
    speed: 54,
    direction: -1,
    triggerDistance: 42,
    noticeDistance: 190,
    choices: [
      {
        id: "give-five",
        label: "Give $5 and wish them well",
        description: "Money is the fastest available boundary.",
        requirements: { money: 5 },
        effect: { money: -5, minutes: 5, happiness: 1 },
        resultText:
          "The confrontation ends, and you decide generosity was definitely the plan. Money -$5, Happiness +1.",
      },
      {
        id: "firm-no",
        label: "Say no and keep walking",
        description: "Hold the boundary through several follow-up questions.",
        effect: { minutes: 8, energy: -5 },
        resultText:
          "You survive a rapidly escalating series of reasons your first answer was inadequate. Time +8 min, Energy -5.",
      },
      {
        id: "run",
        label: "Run for it",
        description: "Preserve the schedule at the expense of your legs.",
        requirements: { energy: 10 },
        effect: { minutes: 2, energy: -10 },
        resultText: "You accelerate out of the conversation. Time +2 min, Energy -10.",
      },
    ],
    palette: { skin: 0x8f5f48, coat: 0x6f5848, pants: 0x30363a, accent: 0xd2b47c },
  },
  {
    id: "cyclist-pack",
    name: "Committed Bicycle Commuters",
    kind: "cyclist",
    behavior: "patrol",
    eyebrow: "RING RING RING",
    description:
      "A fast-moving committee has reached consensus that the sidewalk is a bike lane.",
    activeAfter: 7 * 60,
    activeBefore: 20 * 60,
    startOffset: 720,
    lane: 1,
    speed: 152,
    direction: -1,
    triggerDistance: 48,
    noticeDistance: 0,
    choices: [
      {
        id: "recover",
        label: "Collect yourself",
        description: "Check limbs, dignity, and anything you were carrying.",
        effect: {
          minutes: 12,
          energy: -8,
          happiness: -1,
          dropCarriedItem: true,
        },
        resultText:
          "The cyclists disappear around the block while you inventory your remaining dignity. Time +12 min, Energy -8, Happiness -1.",
      },
    ],
    palette: { skin: 0xd0a07c, coat: 0xc95c4b, pants: 0x24333d, accent: 0xf4d35e },
  },
  {
    id: "neighborhood-regular",
    name: "Neighborhood Regular",
    kind: "neighbor",
    behavior: "patrol",
    eyebrow: "A FAMILIAR FACE",
    description:
      "Someone from the block recognizes you before you can pretend to check your phone.",
    activeAfter: 7 * 60,
    activeBefore: 13 * 60,
    startOffset: -620,
    lane: 1,
    speed: 24,
    direction: 1,
    triggerDistance: 38,
    noticeDistance: 0,
    choices: [
      {
        id: "chat",
        label: "Stop and chat",
        description: "Spend a little time becoming a person who lives here.",
        effect: { minutes: 10, socialStatus: 1, happiness: 1 },
        resultText:
          "You learn one name and three pieces of building gossip. Status +1, Happiness +1.",
      },
      {
        id: "wave",
        label: "Wave without breaking stride",
        description: "Community, optimized.",
        effect: { minutes: 1 },
        resultText: "You complete a highly efficient unit of neighborliness. Time +1 min.",
      },
    ],
    palette: { skin: 0x6f4938, coat: 0x7b6896, pants: 0x2e3541, accent: 0xf0c96a },
  },
];

export const STREET_ENCOUNTER_BY_ID = Object.fromEntries(
  STREET_ENCOUNTERS.map((encounter) => [encounter.id, encounter]),
) as Record<string, StreetEncounterDefinition>;

export function getEncounterChoiceAvailability(
  snapshot: Readonly<GameSnapshot>,
  choice: EncounterChoiceDefinition,
): EncounterChoiceAvailability {
  const reasons: string[] = [];
  const requirements = choice.requirements ?? {};
  if ((requirements.money ?? 0) > snapshot.stats.money) {
    reasons.push(`Requires $${requirements.money}.`);
  }
  if ((requirements.energy ?? 0) > snapshot.energy) {
    reasons.push(`Requires ${requirements.energy} Energy.`);
  }
  return { allowed: reasons.length === 0, reasons };
}

export function isStreetEncounterActive(
  encounter: StreetEncounterDefinition,
  snapshot: Readonly<GameSnapshot>,
): boolean {
  return (
    snapshot.minutes >= encounter.activeAfter &&
    snapshot.minutes < encounter.activeBefore
  );
}
