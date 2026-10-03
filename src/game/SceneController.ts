export interface SceneController {
  setMenuOpen(open: boolean): void;
  setTouchDirection(direction: number): void;
  setTouchDepth(direction: number): void;
  setTouchSprinting(sprinting: boolean): void;
  nudgePlayer(direction: number): void;
  nudgePlayerDepth(direction: number): void;
  triggerInteraction(): void;
  beginStreetGig(): void;
  completeStreetEncounter(actorId: string): void;
  returnHome(): void;
}
