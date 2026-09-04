export const WALK_SPEED = 0.24;
export const SPRINT_SPEED = 0.4;
export const AMBIENT_TIME_TICK_MS = 1500;
export const AMBIENT_MINUTES_PER_TICK = 1;
export const TRAVEL_TICK_MS = 1000;
export const TRAVEL_MINUTES_PER_TICK = 2;
export const SPRINT_ENERGY_TICK_MS = 250;

export function ambientMinutesForElapsed(milliseconds: number): number {
  return (
    Math.floor(Math.max(0, milliseconds) / AMBIENT_TIME_TICK_MS) *
    AMBIENT_MINUTES_PER_TICK
  );
}

export function travelMinutesForElapsed(milliseconds: number): number {
  return (
    Math.floor(Math.max(0, milliseconds) / TRAVEL_TICK_MS) *
    TRAVEL_MINUTES_PER_TICK
  );
}
