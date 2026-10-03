import type {
  GigPerformanceMetrics,
  GigProgress,
  GigResult,
} from "./types";

export const STREET_GIG_TIME = 20 * 60;
export const STREET_GIG_FLYERS = 10;
export const STREET_GIG_TARGET_FANS = 6;
export const STREET_GIG_BPM = 96;
export const STREET_GIG_BEATS = 48;

export function createFreshGig(): GigProgress {
  return {
    phase: "unbooked",
    showDay: null,
    showTime: STREET_GIG_TIME,
    flyersRemaining: 0,
    targetFans: STREET_GIG_TARGET_FANS,
    recruitedFans: 0,
    approachedPeople: [],
    recruitedPeople: [],
    lifetimeFans: 0,
    showsPlayed: 0,
    lastResult: null,
  };
}

export function scoreStreetGig(
  recruitedFans: number,
  targetFans: number,
  metrics: GigPerformanceMetrics,
): GigResult {
  const attempts = Math.max(1, metrics.perfect + metrics.good + metrics.missed);
  const timing = (metrics.perfect + metrics.good * 0.62) / attempts;
  const crowdAverage = (metrics.leftCrowd + metrics.rightCrowd) / 2;
  const crowdCare = Math.min(
    1,
    (Math.min(metrics.leftCrowd, metrics.rightCrowd) * 0.65 + crowdAverage * 0.35) / 100,
  );
  const groove = Math.min(1, metrics.peakGroove / 100);
  const showmanship = Math.min(1, metrics.specialMoves / 2);
  const performance = Math.min(
    1,
    timing * 0.55 + crowdCare * 0.25 + groove * 0.12 + showmanship * 0.08,
  );
  const retainedPromised = Math.max(0, recruitedFans - metrics.walkouts);
  const attendance = retainedPromised + metrics.walkIns;
  const preparedness = Math.min(1, recruitedFans / Math.max(1, targetFans));
  const score = Math.round((performance * 0.72 + preparedness * 0.28) * 100);
  const fansGained = Math.min(
    attendance,
    Math.max(
      0,
      Math.round(retainedPromised * (0.25 + performance * 0.65)) + metrics.walkIns,
    ),
  );
  const tips = Math.max(0, Math.round(attendance * (0.45 + performance * 1.55)));

  const rating: GigResult["rating"] =
    score >= 88
      ? "Unforgettable"
      : score >= 70
        ? "Electric"
        : score >= 46
          ? "Scrappy"
          : "Rough";
  const socialStatusChange = score >= 82 ? 2 : score >= 55 ? 1 : score < 25 ? -1 : 0;
  const happinessChange = score >= 45 ? 2 : -1;
  const summary = `${rating} street set. ${attendance} ${attendance === 1 ? "person" : "people"} stopped, ${fansGained} became real fans, and the guitar case collected $${tips}.`;
  const breakdown = `${metrics.perfect} perfect · ${metrics.good} good · ${metrics.missed} missed · best streak ${metrics.bestStreak}. Crowd finished L${Math.round(metrics.leftCrowd)} / R${Math.round(metrics.rightCrowd)}; ${metrics.walkIns} joined and ${metrics.walkouts} left early.`;

  return {
    score,
    rating,
    attendance,
    tips,
    fansGained,
    socialStatusChange,
    happinessChange,
    summary,
    breakdown,
  };
}

export function missedStreetGig(): GigResult {
  return {
    score: 0,
    rating: "No-show",
    attendance: 0,
    tips: 0,
    fansGained: 0,
    socialStatusChange: -1,
    happinessChange: -2,
    summary: "The appointed hour arrived, the park remained quiet, and Seattle moved on. Status -1, Happiness -2.",
    breakdown: "No beats played · no crowd · no tips.",
  };
}
