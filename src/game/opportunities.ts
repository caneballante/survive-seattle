import type {
  GameSnapshot,
  Opportunity,
  OpportunityDefinition,
  OpportunityStatus,
} from "./types";

export const OPPORTUNITY_DEFINITIONS: OpportunityDefinition[] = [
  {
    id: "morning-coffee",
    title: "Find coffee",
    targetLocationId: "coffee",
    description: "Acquire something warm and unnecessarily specific.",
    priority: 100,
    trigger: (state) => !state.daily.coffeeOrdered,
  },
  {
    id: "check-jobs",
    title: "Find work",
    targetLocationId: "job-board",
    description: "Inspect the neighborhood job board.",
    priority: 90,
    trigger: (state) => state.job === null,
  },
  {
    id: "first-shift",
    title: "New job",
    targetLocationId: "workplace",
    description: "Cascadia Solutions is expecting you, more or less.",
    priority: 110,
    trigger: (state) => state.job !== null && !state.daily.workCompleted,
  },
  {
    id: "return-home",
    title: "Home",
    targetLocationId: "apartment",
    description: "It is getting late. Return to your tiny rectangle.",
    priority: 120,
    trigger: (state) => state.daily.workCompleted,
  },
  {
    id: "see-neighborhood",
    title: "See More of the Neighborhood",
    targetLocationId: "park",
    description:
      "The street was always visible. After one survived day, revisit what might now be possible.",
    priority: 140,
    trigger: (state) =>
      state.worldStage >= 1 && !state.storyFlags.includes("explored-neighborhood"),
  },
];

export class OpportunityManager {
  private readonly opportunities: Opportunity[];

  constructor(definitions: OpportunityDefinition[] = OPPORTUNITY_DEFINITIONS) {
    this.opportunities = definitions.map((definition) => ({
      ...definition,
      status: "inactive" as OpportunityStatus,
    }));
  }

  refresh(state: Readonly<GameSnapshot>): Opportunity[] {
    const activated: Opportunity[] = [];

    for (const opportunity of this.opportunities) {
      if (opportunity.status === "completed") continue;
      const shouldBeActive = opportunity.trigger(state);
      if (shouldBeActive && opportunity.status !== "active") {
        opportunity.status = "active";
        activated.push({ ...opportunity });
      } else if (!shouldBeActive && opportunity.status === "active") {
        opportunity.status = "inactive";
      }
    }

    return activated;
  }

  complete(id: string): void {
    const opportunity = this.opportunities.find((item) => item.id === id);
    if (opportunity) opportunity.status = "completed";
  }

  reset(ids: string[]): void {
    for (const opportunity of this.opportunities) {
      if (ids.includes(opportunity.id)) opportunity.status = "inactive";
    }
  }

  active(): Opportunity[] {
    return this.opportunities
      .filter((opportunity) => opportunity.status === "active")
      .sort((a, b) => b.priority - a.priority)
      .map((opportunity) => ({ ...opportunity }));
  }

  get(id: string): Opportunity | undefined {
    const opportunity = this.opportunities.find((item) => item.id === id);
    return opportunity ? { ...opportunity } : undefined;
  }
}
