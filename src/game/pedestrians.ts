export type CrowdBandId = "empty" | "almost-empty" | "few" | "busy" | "packed";

export type PedestrianDisposition = "interested" | "neutral" | "avoidant" | "fleeing";

export type PedestrianGoal = "coffee" | "music" | "jobs" | "park" | "chat" | "pass-through";

export interface CrowdBandTuning {
  id: CrowdBandId;
  label: string;
  weight: number;
  minPeople: number;
  maxPeople: number;
}

export interface DispositionTuning {
  id: PedestrianDisposition;
  label: string;
  weight: number;
  acceptancePercent: number;
}

export interface GoalTuning {
  id: PedestrianGoal;
  label: string;
  weight: number;
}

export interface PedestrianTuning {
  crowdIntervalSeconds: number;
  storeVisitSeconds: number;
  conversationSeconds: number;
  walkSpeed: number;
  runMultiplier: number;
  awarenessRadius: number;
  crowdBands: CrowdBandTuning[];
  dispositions: DispositionTuning[];
  goals: GoalTuning[];
}

export interface CrowdRoll {
  band: CrowdBandTuning;
  target: number;
}

export const DEFAULT_PEDESTRIAN_TUNING: PedestrianTuning = {
  crowdIntervalSeconds: 60,
  storeVisitSeconds: 7,
  conversationSeconds: 6,
  walkSpeed: 1.85,
  runMultiplier: 2.05,
  awarenessRadius: 5.2,
  crowdBands: [
    { id: "empty", label: "No one", weight: 5, minPeople: 0, maxPeople: 0 },
    { id: "almost-empty", label: "Almost no one", weight: 10, minPeople: 1, maxPeople: 2 },
    { id: "few", label: "Just a few", weight: 60, minPeople: 3, maxPeople: 6 },
    { id: "busy", label: "Fairly crowded", weight: 20, minPeople: 7, maxPeople: 11 },
    { id: "packed", label: "Totally crowded", weight: 5, minPeople: 12, maxPeople: 18 },
  ],
  dispositions: [
    { id: "interested", label: "Comes to you", weight: 12, acceptancePercent: 90 },
    { id: "neutral", label: "Must interrupt", weight: 58, acceptancePercent: 68 },
    { id: "avoidant", label: "Slightly avoids", weight: 22, acceptancePercent: 42 },
    { id: "fleeing", label: "Runs away", weight: 8, acceptancePercent: 18 },
  ],
  goals: [
    { id: "coffee", label: "Get coffee", weight: 20 },
    { id: "music", label: "Browse music shop", weight: 14 },
    { id: "jobs", label: "Check job board", weight: 12 },
    { id: "park", label: "Take a park break", weight: 14 },
    { id: "chat", label: "Talk to someone", weight: 20 },
    { id: "pass-through", label: "Cross the block", weight: 20 },
  ],
};

const CROWD_IDS: CrowdBandId[] = ["empty", "almost-empty", "few", "busy", "packed"];
const DISPOSITION_IDS: PedestrianDisposition[] = ["interested", "neutral", "avoidant", "fleeing"];
const GOAL_IDS: PedestrianGoal[] = ["coffee", "music", "jobs", "park", "chat", "pass-through"];

function finite(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function byId<T extends { id: string }>(items: T[] | undefined, id: string): T | undefined {
  return items?.find((item) => item?.id === id);
}

export function clonePedestrianTuning(tuning: PedestrianTuning): PedestrianTuning {
  return {
    ...tuning,
    crowdBands: tuning.crowdBands.map((item) => ({ ...item })),
    dispositions: tuning.dispositions.map((item) => ({ ...item })),
    goals: tuning.goals.map((item) => ({ ...item })),
  };
}

export function sanitizePedestrianTuning(value: Partial<PedestrianTuning> | null | undefined): PedestrianTuning {
  const defaults = DEFAULT_PEDESTRIAN_TUNING;
  return {
    crowdIntervalSeconds: finite(value?.crowdIntervalSeconds, defaults.crowdIntervalSeconds, 10, 300),
    storeVisitSeconds: finite(value?.storeVisitSeconds, defaults.storeVisitSeconds, 2, 45),
    conversationSeconds: finite(value?.conversationSeconds, defaults.conversationSeconds, 2, 30),
    walkSpeed: finite(value?.walkSpeed, defaults.walkSpeed, 0.45, 3),
    runMultiplier: finite(value?.runMultiplier, defaults.runMultiplier, 1.15, 4),
    awarenessRadius: finite(value?.awarenessRadius, defaults.awarenessRadius, 1.5, 10),
    crowdBands: CROWD_IDS.map((id) => {
      const fallback = byId(defaults.crowdBands, id)!;
      const candidate = byId(value?.crowdBands, id);
      const minPeople = Math.round(finite(candidate?.minPeople, fallback.minPeople, 0, 24));
      const maxPeople = Math.round(finite(candidate?.maxPeople, fallback.maxPeople, minPeople, 24));
      return {
        ...fallback,
        weight: finite(candidate?.weight, fallback.weight, 0, 100),
        minPeople,
        maxPeople,
      };
    }),
    dispositions: DISPOSITION_IDS.map((id) => {
      const fallback = byId(defaults.dispositions, id)!;
      const candidate = byId(value?.dispositions, id);
      return {
        ...fallback,
        weight: finite(candidate?.weight, fallback.weight, 0, 100),
        acceptancePercent: finite(candidate?.acceptancePercent, fallback.acceptancePercent, 0, 100),
      };
    }),
    goals: GOAL_IDS.map((id) => {
      const fallback = byId(defaults.goals, id)!;
      const candidate = byId(value?.goals, id);
      return { ...fallback, weight: finite(candidate?.weight, fallback.weight, 0, 100) };
    }),
  };
}

export function pickWeighted<T extends { weight: number }>(items: T[], random = Math.random): T {
  if (items.length === 0) throw new Error("Cannot select from an empty weighted list.");
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (total <= 0) return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
  let cursor = random() * total;
  for (const item of items) {
    cursor -= Math.max(0, item.weight);
    if (cursor < 0) return item;
  }
  return items[items.length - 1];
}

export function rollCrowd(tuning: PedestrianTuning, random = Math.random): CrowdRoll {
  const band = pickWeighted(tuning.crowdBands, random);
  const span = Math.max(0, band.maxPeople - band.minPeople);
  return { band, target: band.minPeople + Math.floor(random() * (span + 1)) };
}

export function rollDisposition(
  tuning: PedestrianTuning,
  random = Math.random,
): { disposition: PedestrianDisposition; accepts: boolean } {
  const choice = pickWeighted(tuning.dispositions, random);
  return {
    disposition: choice.id,
    accepts: random() * 100 < choice.acceptancePercent,
  };
}

export function rollGoal(tuning: PedestrianTuning, random = Math.random): PedestrianGoal {
  return pickWeighted(tuning.goals, random).id;
}

export function nextCrowdRollDelay(tuning: PedestrianTuning, random = Math.random): number {
  return tuning.crowdIntervalSeconds * (0.72 + random() * 0.56);
}

export function percentageTotal(items: Array<{ weight: number }>): number {
  return items.reduce((sum, item) => sum + item.weight, 0);
}

export function expectedAcceptancesPerTen(items: DispositionTuning[]): number {
  const total = percentageTotal(items);
  if (total <= 0) return 0;
  return items.reduce((sum, item) => sum + item.weight * item.acceptancePercent / 100, 0) / total * 10;
}

export class PedestrianTuningStore {
  private tuning: PedestrianTuning;
  private readonly listeners = new Set<(tuning: Readonly<PedestrianTuning>) => void>();
  private readonly storageKey = "survive-seattle-pedestrian-tuning";

  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null = null) {
    let saved: Partial<PedestrianTuning> | null = null;
    try {
      const raw = this.storage?.getItem(this.storageKey);
      if (raw) saved = JSON.parse(raw) as Partial<PedestrianTuning>;
    } catch {
      saved = null;
    }
    this.tuning = sanitizePedestrianTuning(saved);
  }

  snapshot(): PedestrianTuning {
    return clonePedestrianTuning(this.tuning);
  }

  replace(value: Partial<PedestrianTuning>): void {
    this.tuning = sanitizePedestrianTuning(value);
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify(this.tuning));
    } catch {
      // Tuning still works for this session if browser storage is unavailable.
    }
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  reset(): void {
    this.tuning = clonePedestrianTuning(DEFAULT_PEDESTRIAN_TUNING);
    try {
      this.storage?.removeItem(this.storageKey);
    } catch {
      // Ignore unavailable browser storage.
    }
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  subscribe(listener: (tuning: Readonly<PedestrianTuning>) => void): () => void {
    listener(this.snapshot());
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
