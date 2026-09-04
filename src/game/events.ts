import type { GameSnapshot, LocationId, Opportunity } from "./types";
import type { TargetDirection } from "./direction";

export interface GameEventMap {
  focus: { locationId: LocationId | null; label: string };
  interact: { locationId: LocationId };
  streetEncounter: { actorId: string; encounterId: string };
  cue: {
    opportunity: Opportunity | null;
    direction: TargetDirection | null;
  };
  snapshot: Readonly<GameSnapshot>;
}

type Handler<T> = (payload: T) => void;

export class GameEvents {
  private readonly handlers = new Map<keyof GameEventMap, Set<Handler<never>>>();

  on<K extends keyof GameEventMap>(event: K, handler: Handler<GameEventMap[K]>): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)?.add(handler as Handler<never>);
    return () => this.handlers.get(event)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof GameEventMap>(event: K, payload: GameEventMap[K]): void {
    this.handlers.get(event)?.forEach((handler) => handler(payload as never));
  }
}
