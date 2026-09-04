export type LocationId =
  | "apartment"
  | "coffee"
  | "convenience"
  | "job-board"
  | "workplace"
  | "transit"
  | "park"
  | "bar"
  | "music-store"
  | "theater"
  | "art-store"
  | "laundromat";

export type RegionId =
  | "arrival"
  | "neighborhood-west"
  | "neighborhood-east"
  | "creative-west"
  | "creative-east";

export type Season = "Spring" | "Summer" | "Fall" | "Winter";
export type HousingId = "tiny-apartment" | "better-apartment" | "house";
export type WeatherMode = "rain" | "cloudy" | "clear" | "snow" | "smoke";
export type LocationRarity = 1 | 2 | 3 | 4 | 5;
export type CarriedItem = "coffee" | null;

export interface LocationDefinition {
  id: LocationId;
  name: string;
  x: number;
  interactionRadius: number;
  interactive: boolean;
  sign: string;
  kind: "home" | "shop" | "board" | "work" | "decorative";
  description: string;
  regionId: RegionId;
  rarity: LocationRarity;
  interactionIds: string[];
  outdoor?: boolean;
  eventIds?: string[];
}

export interface PlayerStats {
  money: number;
  socialStatus: number;
  happiness: number;
}

export interface DailyFlags {
  coffeeOrdered: boolean;
  workCompleted: boolean;
  interactionUses: Record<string, number>;
}

export interface Job {
  title: string;
  employer: string;
  description: string;
}

export interface GameSnapshot {
  day: number;
  season: Season;
  year: number;
  totalDays: number;
  minutes: number;
  stats: PlayerStats;
  energy: number;
  carriedItem: CarriedItem;
  daily: DailyFlags;
  seasonUses: Record<string, number>;
  job: Job | null;
  prototypeComplete: boolean;
  inventory: string[];
  housing: HousingId;
  storyFlags: string[];
  unlockedRegions: RegionId[];
  worldStage: number;
  rent: number;
  activeEvents: string[];
  eventCooldowns: Record<string, number>;
  cityTrend: string | null;
  weather: WeatherMode;
  transitDelayMinutes: number;
  currentDistrict: string;
  relationshipStrength: number;
  familyMembers: number;
}

export type OpportunityStatus = "inactive" | "active" | "completed";

export interface OpportunityDefinition {
  id: string;
  title: string;
  targetLocationId: LocationId;
  description?: string;
  priority: number;
  trigger: (state: Readonly<GameSnapshot>) => boolean;
}

export interface Opportunity extends OpportunityDefinition {
  status: OpportunityStatus;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  activated: Opportunity[];
  worldExpanded?: boolean;
  seasonAdvanced?: boolean;
  yearAdvanced?: boolean;
}

export interface InteractionRequirements {
  money?: number;
  socialStatus?: number;
  happiness?: number;
  energy?: number;
  job?: boolean;
  housing?: HousingId;
  relationship?: boolean;
  family?: boolean;
  item?: string;
  storyFlag?: string;
  region?: RegionId;
  afterMinutes?: number;
  beforeMinutes?: number;
}

export interface InteractionCosts {
  minutes?: number;
  money?: number;
  socialStatus?: number;
  happiness?: number;
  energy?: number;
}

export interface InteractionRewards {
  money?: number;
  socialStatus?: number;
  happiness?: number;
  energy?: number;
  carriedItem?: Exclude<CarriedItem, null>;
  item?: string;
  storyFlag?: string;
  jobTitle?: string;
  promotion?: string;
  relationshipEffect?: number;
  housing?: HousingId;
  opportunityId?: string;
  eventId?: string;
}

export interface InteractionDefinition {
  id: string;
  locationId: LocationId;
  displayName: string;
  description: string;
  requirements?: InteractionRequirements;
  costs?: InteractionCosts;
  rewards?: InteractionRewards;
  maximumUsesPerDay?: number;
  maximumUsesPerSeason?: number;
  chanceOfSuccess?: number;
  failureResult?: string;
  resultText: string;
  hiddenUntilStoryFlag?: string;
}

export interface InteractionAvailability {
  allowed: boolean;
  reasons: string[];
}

export type EventCategory =
  | "personal"
  | "weather"
  | "housing"
  | "transportation"
  | "civic"
  | "zeitgeist";

export interface EventResolution {
  message: string;
  statChanges?: Partial<PlayerStats>;
  rentChange?: number;
  weather?: WeatherMode;
  transitDelayMinutes?: number;
  storyFlags?: string[];
  cityTrend?: string;
}

export interface CityEventDefinition {
  id: string;
  name: string;
  category: EventCategory;
  description: string;
  cooldownDays: number;
  eligibility: (state: Readonly<GameSnapshot>) => boolean;
  tailoredScore: (state: Readonly<GameSnapshot>) => number;
  resolve: (state: Readonly<GameSnapshot>) => EventResolution;
}

export interface WorldBounds {
  minX: number;
  maxX: number;
}
