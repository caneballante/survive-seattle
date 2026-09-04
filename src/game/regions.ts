import type { RegionId, WorldBounds } from "./types";

export const MAX_WORLD_WIDTH = 5200;

export interface WorldStageDefinition extends WorldBounds {
  stage: number;
  label: string;
  unlockedRegions: RegionId[];
  westBoundaryLabel: string;
  eastBoundaryLabel: string;
}

export const WORLD_STAGES: WorldStageDefinition[] = [
  {
    stage: 0,
    label: "Arrival Block",
    minX: 1600,
    maxX: 3700,
    unlockedRegions: ["arrival"],
    westBoundaryLabel: "SEATTLE CONTINUES - WATCH THE CLOCK",
    eastBoundaryLabel: "SEATTLE CONTINUES - WATCH THE CLOCK",
  },
  {
    stage: 1,
    label: "Neighborhood Life",
    minX: 760,
    maxX: 4460,
    unlockedRegions: ["arrival", "neighborhood-west", "neighborhood-east"],
    westBoundaryLabel: "SEATTLE CONTINUES - RENT STILL DUE",
    eastBoundaryLabel: "SEATTLE CONTINUES - RENT STILL DUE",
  },
  {
    stage: 2,
    label: "Creative Seattle Preview",
    minX: 260,
    maxX: 4960,
    unlockedRegions: [
      "arrival",
      "neighborhood-west",
      "neighborhood-east",
      "creative-west",
      "creative-east",
    ],
    westBoundaryLabel: "THE SOUND CONTINUES",
    eastBoundaryLabel: "WATERFRONT TRANSFER REQUIRED",
  },
];

export function getWorldStage(stage: number): WorldStageDefinition {
  return WORLD_STAGES[Math.min(Math.max(stage, 0), WORLD_STAGES.length - 1)];
}

export function getWorldBounds(stage: number): WorldBounds {
  const definition = getWorldStage(stage);
  return { minX: definition.minX, maxX: definition.maxX };
}

export function getOpenWorldBounds(): WorldBounds {
  const finalStage = WORLD_STAGES[WORLD_STAGES.length - 1];
  return { minX: finalStage.minX, maxX: finalStage.maxX };
}
