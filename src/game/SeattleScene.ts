import Phaser from "phaser";
import playerWalkUrl from "../../assets/walk01.png";
import { AudioManager } from "../audio";
import {
  mixHexColors,
  normalizeMinutes,
  sampleAtmosphere,
} from "./atmosphere";
import { getTargetDirection } from "./direction";
import { GameEvents } from "./events";
import { STREET_GIG_BEATS, STREET_GIG_BPM } from "./gig";
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  LOCATIONS,
  LOCATION_BY_ID,
  STREET_Y,
  WORLD_WIDTH,
} from "./locations";
import {
  AMBIENT_MINUTES_PER_TICK,
  AMBIENT_TIME_TICK_MS,
  SPRINT_ENERGY_TICK_MS,
  SPRINT_SPEED,
  TRAVEL_MINUTES_PER_TICK,
  TRAVEL_TICK_MS,
  WALK_SPEED,
} from "./movement";
import { GameState } from "./state";
import { getOpenWorldBounds, getWorldStage } from "./regions";
import {
  isStreetEncounterActive,
  STREET_ENCOUNTERS,
  type StreetEncounterDefinition,
} from "./streetEncounters";
import type {
  GameSnapshot,
  GigPerformanceMetrics,
  LocationId,
} from "./types";

interface LocationVisual {
  container: Phaser.GameObjects.Container;
  highlight: Phaser.GameObjects.Container;
  markerY: number;
  door?: Phaser.GameObjects.Rectangle;
  sign?: Phaser.GameObjects.Text;
}

interface CloudLayer {
  container: Phaser.GameObjects.Container;
  blocks: Phaser.GameObjects.Rectangle[];
  speed: number;
  wrapDistance: number;
  baseAlpha: number;
}

interface StreetActorVisual {
  id: string;
  definition: StreetEncounterDefinition;
  container: Phaser.GameObjects.Container;
  leftLeg?: Phaser.GameObjects.Rectangle;
  rightLeg?: Phaser.GameObjects.Rectangle;
  accessory?: Phaser.GameObjects.GameObject;
  wheels?: Phaser.GameObjects.Arc[];
  warning?: Phaser.GameObjects.Text;
  direction: -1 | 1;
  lane: 0 | 1;
  phase: number;
  resolved: boolean;
  engaging: boolean;
}

interface FlyerProspectVisual {
  id: string;
  container: Phaser.GameObjects.Container;
  figure: Phaser.GameObjects.Container;
  leftLeg: Phaser.GameObjects.Rectangle;
  rightLeg: Phaser.GameObjects.Rectangle;
  reaction: Phaser.GameObjects.Text;
  musicBadge: Phaser.GameObjects.Container;
  direction: -1 | 1;
  speed: number;
  phase: number;
  acceptsFlyer: boolean;
}

interface StreetGigVenueVisual {
  container: Phaser.GameObjects.Container;
  lights: Phaser.GameObjects.Arc[];
  caseCoins: Phaser.GameObjects.Arc[];
}

interface StreetGigSession {
  startedAt: number;
  beatMs: number;
  totalBeats: number;
  lastBeat: number;
  judgedAccents: Set<number>;
  groove: number;
  peakGroove: number;
  leftCrowd: number;
  rightCrowd: number;
  side: -1 | 1;
  perfect: number;
  good: number;
  missed: number;
  streak: number;
  bestStreak: number;
  walkouts: number;
  specialMoves: number;
  tipCoins: number;
  powerChordUnlocked: boolean;
  powerChordUsed: boolean;
  walkInIds: Set<string>;
  walkedOutIds: Set<string>;
  accentResults: Map<number, "perfect" | "good" | "missed">;
  hud: Phaser.GameObjects.Container;
  grooveFill: Phaser.GameObjects.Rectangle;
  leftFill: Phaser.GameObjects.Rectangle;
  rightFill: Phaser.GameObjects.Rectangle;
  beatRing: Phaser.GameObjects.Arc;
  beatTarget: Phaser.GameObjects.Arc;
  beatCountdown: Phaser.GameObjects.Text;
  accentPips: Phaser.GameObjects.Rectangle[];
  scoreText: Phaser.GameObjects.Text;
  moveText: Phaser.GameObjects.Text;
  judgement: Phaser.GameObjects.Text;
}

const SIDEWALK_LANES = [STREET_Y - 34, STREET_Y + 2] as const;
const PLAYER_GROUND_Y = SIDEWALK_LANES[1];
const PLAYER_WALK_TEXTURE = "player-walk";
const PLAYER_WALK_ANIMATION = "player-walk-animation";
const PLAYER_BASELINE_OFFSET = 5;
const STREET_CROWD_ENABLED = false;
const FLYER_INTERACTION_DISTANCE = 72;
const STREET_GIG_X = 920;

export class SeattleScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private playerSprite!: Phaser.GameObjects.Sprite;
  private carriedCoffee!: Phaser.GameObjects.Container;
  private carriedFlyers!: Phaser.GameObjects.Container;
  private performanceGuitar!: Phaser.GameObjects.Container;
  private skyBands: Phaser.GameObjects.Rectangle[] = [];
  private horizonGlow!: Phaser.GameObjects.Ellipse;
  private sun!: Phaser.GameObjects.Arc;
  private moon!: Phaser.GameObjects.Arc;
  private moonShadow!: Phaser.GameObjects.Arc;
  private stars!: Phaser.GameObjects.Group;
  private cloudLayers: CloudLayer[] = [];
  private lighting!: Phaser.GameObjects.Rectangle;
  private rain!: Phaser.GameObjects.Graphics;
  private mountain!: Phaser.GameObjects.Container;
  private cityWindowLights!: Phaser.GameObjects.Group;
  private westBarrier!: Phaser.GameObjects.Container;
  private eastBarrier!: Phaser.GameObjects.Container;
  private streetGlow!: Phaser.GameObjects.Group;
  private shopWindowLights!: Phaser.GameObjects.Group;
  private streetReflections!: Phaser.GameObjects.Group;
  private puddleHighlights!: Phaser.GameObjects.Group;
  private wetStreetSheen!: Phaser.GameObjects.Rectangle;
  private keys!: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    sprint: Phaser.Input.Keyboard.Key;
    interact: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key;
  };
  private locationVisuals = new Map<LocationId, LocationVisual>();
  private opportunityMarkers = new Map<string, Phaser.GameObjects.Container>();
  private coffeeBubble!: Phaser.GameObjects.Text;
  private snapshot: Readonly<GameSnapshot>;
  private focusedLocation: LocationId | null = null;
  private menuOpen = true;
  private touchDirection = 0;
  private touchSprinting = false;
  private sprintEnergyAccumulator = 0;
  private ambientTimeAccumulator = 0;
  private travelTimeAccumulator = 0;
  private streetActors: StreetActorVisual[] = [];
  private flyerProspects: FlyerProspectVisual[] = [];
  private focusedProspect: FlyerProspectVisual | null = null;
  private focusKey = "";
  private gigVenue!: StreetGigVenueVisual;
  private gigSession: StreetGigSession | null = null;
  private crowdDay = -1;
  private lastCueKey = "";
  private renderedWorldStage = -1;
  private movementMinX = 0;
  private movementMaxX = WORLD_WIDTH;
  private lastFootstepAt = -Infinity;
  private atmosphereMinutes: number;
  private atmosphereTargetMinutes: number;
  private atmosphereSnapshotMinutes: number;
  private atmosphereDay: number;
  private unsubscribeState?: () => void;

  constructor(
    private readonly gameState: GameState,
    private readonly gameEvents: GameEvents,
    private readonly audio: AudioManager,
  ) {
    super("SeattleScene");
    this.snapshot = gameState.snapshot();
    this.atmosphereMinutes =
      this.snapshot.totalDays * 1440 + this.snapshot.minutes;
    this.atmosphereTargetMinutes = this.atmosphereMinutes;
    this.atmosphereSnapshotMinutes = this.snapshot.minutes;
    this.atmosphereDay = this.snapshot.totalDays;
  }

  preload(): void {
    this.load.spritesheet(PLAYER_WALK_TEXTURE, playerWalkUrl, {
      frameWidth: 64,
      frameHeight: 96,
    });
  }

  create(): void {
    const startingBounds = getOpenWorldBounds();
    this.movementMinX = startingBounds.minX;
    this.movementMaxX = startingBounds.maxX;
    this.cameras.main.setBounds(
      startingBounds.minX,
      0,
      startingBounds.maxX - startingBounds.minX,
      GAME_HEIGHT,
    );
    this.createBackground();
    this.createStreet();
    LOCATIONS.forEach((location, index) => this.createLocation(location.id, index));
    this.createExpansionBarriers();
    this.createStreetLights();
    this.createPlayer();
    this.createStreetGigVenue();
    this.createFlyerCrowd();
    if (STREET_CROWD_ENABLED) this.createStreetCrowd();
    this.createRain();
    this.createLighting();
    this.createOpportunityMarkers();

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error("Keyboard input unavailable");
    this.keys = {
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      a: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      d: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      sprint: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
      interact: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      space: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
    };
    const tapMove = (direction: number, event: KeyboardEvent): void => {
      if (!event.repeat) this.nudgePlayer(direction);
    };
    keyboard.on("keydown-LEFT", (event: KeyboardEvent) => tapMove(-1, event));
    keyboard.on("keydown-A", (event: KeyboardEvent) => tapMove(-1, event));
    keyboard.on("keydown-RIGHT", (event: KeyboardEvent) => tapMove(1, event));
    keyboard.on("keydown-D", (event: KeyboardEvent) => tapMove(1, event));
    keyboard.on("keydown-E", (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (this.gigSession) this.triggerPowerChord();
      else this.triggerInteraction();
    });
    keyboard.on("keydown-SPACE", (event: KeyboardEvent) => {
      if (!event.repeat) this.triggerInteraction();
    });
    keyboard.on("keydown-SHIFT", (event: KeyboardEvent) => {
      if (!event.repeat && this.gigSession) this.triggerFlourish();
    });

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08, 0, 40);
    this.unsubscribeState = this.gameState.subscribe((snapshot) => {
      this.snapshot = snapshot;
      this.updateWorldState();
    });
    this.gameEvents.on("snapshot", (snapshot) => {
      this.snapshot = snapshot;
      this.updateWorldState();
    });
    this.updateWorldState();
  }

  private createBackground(): void {
    const bandHeight = Math.ceil(GAME_HEIGHT / 12) + 1;
    for (let index = 0; index < 12; index += 1) {
      this.skyBands.push(
        this.add
          .rectangle(0, index * bandHeight, GAME_WIDTH, bandHeight, 0x6f91a3)
          .setOrigin(0)
          .setScrollFactor(0)
          .setDepth(-60),
      );
    }

    this.horizonGlow = this.add
      .ellipse(GAME_WIDTH / 2, 330, 980, 280, 0xffa367, 0)
      .setScrollFactor(0)
      .setDepth(-58)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.stars = this.add.group();
    for (let index = 0; index < 54; index += 1) {
      const x = 18 + ((index * 173) % (GAME_WIDTH - 36));
      const y = 20 + ((index * 67) % 260);
      const size = index % 9 === 0 ? 3 : index % 3 === 0 ? 2 : 1;
      const star = this.add
        .rectangle(x, y, size, size, index % 7 === 0 ? 0xffe6ab : 0xd9ebef)
        .setScrollFactor(0)
        .setDepth(-57);
      this.stars.add(star);
    }

    this.sun = this.add
      .circle(90, 270, 27, 0xffdfa0)
      .setScrollFactor(0)
      .setDepth(-56);
    this.moon = this.add
      .circle(840, 130, 20, 0xdce6dd)
      .setScrollFactor(0)
      .setDepth(-56);
    this.moonShadow = this.add
      .circle(847, 123, 17, 0x17243e)
      .setScrollFactor(0)
      .setDepth(-55)
      .setData("moon-shadow", true);

    this.createCloudLayer(0.035, -52, 86, 4.5, 0.48, 0.72);
    this.createCloudLayer(0.085, -45, 130, 8, 0.72, 1);

    const farHills = this.add.graphics().setScrollFactor(0.08).setDepth(-41);
    farHills.fillStyle(0x6c8790, 0.78);
    farHills.beginPath();
    farHills.moveTo(-400, 365);
    for (let x = -400; x <= WORLD_WIDTH + 500; x += 230) {
      farHills.lineTo(x + 110, 275 - ((Math.abs(x) / 230) % 3) * 20);
      farHills.lineTo(x + 230, 365);
    }
    farHills.closePath();
    farHills.fillPath();

    this.createMountRainier();

    const hills = this.add.graphics().setScrollFactor(0.14).setDepth(-33);
    hills.fillStyle(0x526e78, 1);
    hills.beginPath();
    hills.moveTo(-300, 370);
    for (let x = -300; x <= WORLD_WIDTH + 500; x += 180) {
      hills.lineTo(x + 90, 292 - ((Math.abs(x) / 180) % 3) * 24);
      hills.lineTo(x + 180, 370);
    }
    hills.closePath();
    hills.fillPath();

    const skyline = this.add.graphics().setScrollFactor(0.28).setDepth(-29);
    this.cityWindowLights = this.add.group();
    for (let index = 0, x = -200; x < WORLD_WIDTH + 500; index += 1, x += 102) {
      const height = 72 + (index % 5) * 18;
      const width = 70 + (index % 2) * 12;
      skyline.fillStyle(index % 3 === 0 ? 0x304e5c : 0x385765, 1);
      skyline.fillRect(x, 370 - height, width, height);
      skyline.fillStyle(0x253e49, 1);
      skyline.fillRect(x + width - 7, 370 - height - 9, 7, 9);
      for (let row = 0; row < 3; row += 1) {
        for (let column = 0; column < 3; column += 1) {
          if ((index + row + column) % 4 === 0) continue;
          const light = this.add
            .rectangle(
              x + 14 + column * 18,
              370 - height + 19 + row * 18,
              6,
              7,
              (index + column) % 3 === 0 ? 0xffcf75 : 0x9ed1d1,
            )
            .setScrollFactor(0.28)
            .setDepth(-28);
          this.cityWindowLights.add(light);
        }
      }
    }

    const needle = this.add.graphics().setScrollFactor(0.28).setDepth(-27);
    needle.fillStyle(0x263f4b, 1);
    needle.fillRect(1168, 228, 8, 142);
    needle.fillTriangle(1156, 370, 1188, 370, 1172, 270);
    needle.fillRect(1126, 244, 92, 9);
    needle.fillRect(1141, 234, 62, 8);
    needle.fillRect(1169, 190, 6, 47);
    needle.fillTriangle(1169, 191, 1175, 191, 1172, 164);

    this.applyAtmosphere(0);
  }

  private createCloudLayer(
    scrollFactor: number,
    depth: number,
    baseY: number,
    speed: number,
    baseAlpha: number,
    scale: number,
  ): void {
    const container = this.add
      .container(0, 0)
      .setScrollFactor(scrollFactor)
      .setDepth(depth);
    const blocks: Phaser.GameObjects.Rectangle[] = [];
    const wrapDistance = 1120;
    for (
      let clusterIndex = -4, x = -wrapDistance;
      x < WORLD_WIDTH + wrapDistance;
      clusterIndex += 1, x += 280
    ) {
      const y = baseY + ((Math.abs(clusterIndex * 47) % 5) - 2) * 12;
      const width = (150 + (Math.abs(clusterIndex) % 3) * 34) * scale;
      const pieces = [
        { x: 0, y: 18, width, height: 24 },
        { x: width * 0.16, y: 2, width: width * 0.48, height: 26 },
        { x: width * 0.48, y: 9, width: width * 0.4, height: 23 },
        { x: width * 0.28, y: -10, width: width * 0.28, height: 20 },
        { x: width * 0.04, y: 40, width: width * 0.82, height: 7 },
      ];
      pieces.forEach((piece) => {
        const block = this.add
          .rectangle(
            Math.round(x + piece.x),
            Math.round(y + piece.y),
            Math.round(piece.width),
            Math.round(piece.height),
            0xd6e0e4,
          )
          .setOrigin(0);
        blocks.push(block);
        container.add(block);
      });
    }
    this.cloudLayers.push({
      container,
      blocks,
      speed,
      wrapDistance,
      baseAlpha,
    });
  }

  private createMountRainier(): void {
    const haze = this.add.ellipse(0, -36, 850, 118, 0xc3d0d0, 0.22);
    const silhouette = this.add.graphics();
    silhouette.fillStyle(0x718993, 1);
    silhouette.fillPoints(
      [
        new Phaser.Geom.Point(-390, 0),
        new Phaser.Geom.Point(-300, -42),
        new Phaser.Geom.Point(-235, -88),
        new Phaser.Geom.Point(-170, -142),
        new Phaser.Geom.Point(-118, -202),
        new Phaser.Geom.Point(-72, -242),
        new Phaser.Geom.Point(-28, -309),
        new Phaser.Geom.Point(0, -326),
        new Phaser.Geom.Point(38, -287),
        new Phaser.Geom.Point(82, -230),
        new Phaser.Geom.Point(132, -188),
        new Phaser.Geom.Point(188, -126),
        new Phaser.Geom.Point(262, -72),
        new Phaser.Geom.Point(390, 0),
      ],
      true,
    );
    silhouette.fillStyle(0x607b87, 1);
    silhouette.fillPoints(
      [
        new Phaser.Geom.Point(0, -326),
        new Phaser.Geom.Point(38, -287),
        new Phaser.Geom.Point(82, -230),
        new Phaser.Geom.Point(132, -188),
        new Phaser.Geom.Point(188, -126),
        new Phaser.Geom.Point(262, -72),
        new Phaser.Geom.Point(390, 0),
        new Phaser.Geom.Point(88, 0),
        new Phaser.Geom.Point(45, -118),
      ],
      true,
    );

    const snow = this.add.graphics();
    snow.fillStyle(0xe7edeb, 1);
    snow.fillPoints(
      [
        new Phaser.Geom.Point(-150, -160),
        new Phaser.Geom.Point(-118, -202),
        new Phaser.Geom.Point(-72, -242),
        new Phaser.Geom.Point(-28, -309),
        new Phaser.Geom.Point(0, -326),
        new Phaser.Geom.Point(38, -287),
        new Phaser.Geom.Point(82, -230),
        new Phaser.Geom.Point(118, -198),
        new Phaser.Geom.Point(82, -206),
        new Phaser.Geom.Point(56, -183),
        new Phaser.Geom.Point(34, -205),
        new Phaser.Geom.Point(10, -178),
        new Phaser.Geom.Point(-16, -202),
        new Phaser.Geom.Point(-42, -172),
        new Phaser.Geom.Point(-72, -188),
        new Phaser.Geom.Point(-103, -150),
      ],
      true,
    );
    snow.fillStyle(0xb8cbd0, 0.92);
    snow.fillPoints(
      [
        new Phaser.Geom.Point(-28, -309),
        new Phaser.Geom.Point(0, -326),
        new Phaser.Geom.Point(38, -287),
        new Phaser.Geom.Point(82, -230),
        new Phaser.Geom.Point(56, -183),
        new Phaser.Geom.Point(34, -205),
        new Phaser.Geom.Point(15, -178),
      ],
      true,
    );
    snow.fillStyle(0xd5e1e1, 0.92);
    snow.fillPoints(
      [
        new Phaser.Geom.Point(-76, -238),
        new Phaser.Geom.Point(-46, -263),
        new Phaser.Geom.Point(-56, -190),
        new Phaser.Geom.Point(-84, -152),
        new Phaser.Geom.Point(-71, -213),
      ],
      true,
    );

    const ridges = this.add.graphics();
    ridges.lineStyle(3, 0x526e7a, 0.45);
    ridges.lineBetween(-117, -198, -188, -80);
    ridges.lineBetween(-50, -170, -104, -53);
    ridges.lineBetween(72, -165, 134, -66);
    ridges.lineBetween(132, -126, 228, -36);

    const treeLine = this.add.graphics();
    treeLine.fillStyle(0x3f6265, 1);
    for (let x = -390; x <= 390; x += 18) {
      const height = 22 + (Math.abs(x * 7) % 22);
      treeLine.fillTriangle(x - 10, 0, x, -height, x + 10, 0);
    }

    this.mountain = this.add
      .container(720, 365, [haze, silhouette, snow, ridges, treeLine])
      .setScrollFactor(0.08)
      .setDepth(-38);
  }

  private createStreet(): void {
    this.shopWindowLights = this.add.group();
    this.streetReflections = this.add.group();
    this.puddleHighlights = this.add.group();

    this.add
      .rectangle(0, STREET_Y - 12, WORLD_WIDTH, 54, 0x697278)
      .setOrigin(0)
      .setDepth(-5);
    this.add
      .rectangle(0, STREET_Y + 37, WORLD_WIDTH, 8, 0xb0aba0)
      .setOrigin(0)
      .setDepth(-3);
    this.add
      .rectangle(0, STREET_Y + 42, WORLD_WIDTH, 122, 0x19262e)
      .setOrigin(0)
      .setDepth(-4);
    this.wetStreetSheen = this.add
      .rectangle(0, STREET_Y + 45, WORLD_WIDTH, 112, 0x5b8a96, 0.16)
      .setOrigin(0)
      .setDepth(-2)
      .setBlendMode(Phaser.BlendModes.SCREEN);
    this.add
      .rectangle(0, STREET_Y + 58, WORLD_WIDTH, 3, 0x9bbbc4, 0.18)
      .setOrigin(0)
      .setDepth(-1);
    this.add
      .rectangle(0, STREET_Y + 108, WORLD_WIDTH, 3, 0xcbd7d5, 0.28)
      .setOrigin(0)
      .setDepth(-1);

    const sidewalkDetails = this.add.graphics().setDepth(-3);
    sidewalkDetails.lineStyle(2, 0x3d4a50, 0.32);
    for (let x = 32; x < WORLD_WIDTH; x += 92) {
      sidewalkDetails.lineBetween(x, STREET_Y - 12, x - 8, STREET_Y + 39);
    }
    sidewalkDetails.lineStyle(1, 0x293940, 0.46);
    for (let x = 140; x < WORLD_WIDTH; x += 310) {
      sidewalkDetails.beginPath();
      sidewalkDetails.moveTo(x, STREET_Y + 4);
      sidewalkDetails.lineTo(x + 18, STREET_Y + 13);
      sidewalkDetails.lineTo(x + 8, STREET_Y + 27);
      sidewalkDetails.lineTo(x + 28, STREET_Y + 37);
      sidewalkDetails.strokePath();
    }

    for (let x = 40; x < WORLD_WIDTH; x += 130) {
      this.add.rectangle(x, STREET_Y + 83, 64, 4, 0xd7d6ae, 0.22).setDepth(0);
    }

    for (let x = 90; x < WORLD_WIDTH; x += 270) {
      const sidewalkPuddle = this.add
        .ellipse(x, STREET_Y + 27, 100, 8, 0x84bbc7, 0.2)
        .setDepth(0);
      const roadPuddle = this.add
        .ellipse(x + 75, STREET_Y + 98, 82, 7, 0x8cb8c0, 0.24)
        .setDepth(1);
      const glint = this.add
        .rectangle(x + 62, STREET_Y + 96, 36, 2, 0xd8e8e6, 0.25)
        .setDepth(2);
      this.puddleHighlights.addMultiple([sidewalkPuddle, roadPuddle, glint]);
    }

    const gutterDebris = this.add.graphics().setDepth(1);
    for (let x = 210; x < WORLD_WIDTH; x += 470) {
      gutterDebris.fillStyle(x % 3 === 0 ? 0xb7804e : 0x73583d, 0.7);
      gutterDebris.fillTriangle(
        x,
        STREET_Y + 43,
        x + 9,
        STREET_Y + 39,
        x + 13,
        STREET_Y + 46,
      );
    }
  }

  private createLocation(id: LocationId, index: number): void {
    const location = LOCATION_BY_ID[id];
    const palette = [0x385467, 0x75584f, 0x415f5c, 0x6e6750, 0x4d516b, 0x3e5d70, 0x79594d];
    const facadeColor = palette[index % palette.length];
    const buildingWidth =
      location.id === "park"
        ? 280
        : location.kind === "board"
          ? 150
          : location.kind === "work"
            ? 290
            : 245;
    const buildingHeight =
      location.id === "park"
        ? 130
        : location.kind === "board"
          ? 126
          : location.kind === "work"
            ? 270
            : 205 + (index % 2) * 35;
    const baseY = STREET_Y - 12;
    const container = this.add.container(location.x, baseY).setDepth(2);

    if (location.id === "park") {
      const grass = this.add.rectangle(0, 0, buildingWidth, 38, 0x426b55).setOrigin(0.5, 1);
      const bench = this.add.rectangle(0, -25, 85, 12, 0x74533c);
      const benchLegA = this.add.rectangle(-30, -8, 7, 34, 0x3c3930);
      const benchLegB = this.add.rectangle(30, -8, 7, 34, 0x3c3930);
      const trees = [-92, 88].flatMap((x) => [
        this.add.rectangle(x, -45, 14, 100, 0x493b2f),
        this.add.circle(x, -112, 58, 0x315b49),
        this.add.circle(x - 30, -85, 40, 0x3b7056),
      ]);
      container.add([grass, bench, benchLegA, benchLegB, ...trees]);
    } else if (location.kind === "board") {
      const posts = this.add.rectangle(-55, 0, 10, 108, 0x4a3528).setOrigin(0.5, 1);
      const posts2 = this.add.rectangle(55, 0, 10, 108, 0x4a3528).setOrigin(0.5, 1);
      const board = this.add.rectangle(0, -100, buildingWidth, 118, 0x9b774d);
      board.setStrokeStyle(7, 0x4a3528);
      const papers = [-45, 0, 45].map((x, paperIndex) =>
        this.add
          .rectangle(x, -104 + (paperIndex % 2) * 10, 36, 56, 0xe6e2cf)
          .setAngle(paperIndex * 3 - 3),
      );
      container.add([posts, posts2, board, ...papers]);
    } else {
      const body = this.add
        .rectangle(0, 0, buildingWidth, buildingHeight, facadeColor)
        .setOrigin(0.5, 1);
      body.setStrokeStyle(5, 0x22323b);
      container.add(body);

      const masonry = this.add.graphics();
      const mortarColor = mixHexColors(facadeColor, 0x17262d, 0.42);
      masonry.lineStyle(1, mortarColor, 0.46);
      for (let y = -buildingHeight + 16; y < -8; y += 18) {
        masonry.lineBetween(-buildingWidth / 2 + 4, y, buildingWidth / 2 - 4, y);
        const row = Math.floor((y + buildingHeight) / 18);
        for (
          let x = -buildingWidth / 2 + (row % 2 === 0 ? 22 : 2);
          x < buildingWidth / 2 - 4;
          x += 42
        ) {
          masonry.lineBetween(x, y, x, y + 18);
        }
      }
      const roofCap = this.add
        .rectangle(0, -buildingHeight + 3, buildingWidth + 12, 10, 0x263840)
        .setStrokeStyle(2, 0x17242b);
      const foundation = this.add.rectangle(0, -5, buildingWidth - 8, 9, 0x23343a);
      container.add([masonry, roofCap, foundation]);

      for (let row = 0; row < 2; row += 1) {
        for (let column = -1; column <= 1; column += 1) {
          const window = this.add.rectangle(
            column * 65,
            -buildingHeight + 58 + row * 58,
            36,
            34,
            0x91b6bd,
            0.78,
          );
          window.setStrokeStyle(4, 0x243d48);
          window.setData("window", true);
          container.add(window);
          const warmPane = this.add
            .rectangle(
              column * 65,
              -buildingHeight + 58 + row * 58,
              25,
              23,
              0xf0b35f,
              0,
            )
            .setData("base-alpha", (row + column + index) % 3 === 0 ? 0.86 : 0.58);
          container.add(warmPane);
          this.shopWindowLights.add(warmPane);
        }
      }

      const drainpipe = this.add
        .rectangle(buildingWidth / 2 - 13, -buildingHeight / 2, 6, buildingHeight - 20, 0x263840)
        .setStrokeStyle(1, 0x18262c);
      const utilityBox = this.add
        .rectangle(-buildingWidth / 2 + 20, -34, 23, 29, 0x607176)
        .setStrokeStyle(2, 0x26373e);
      container.add([drainpipe, utilityBox]);
    }

    const signY = location.kind === "board" ? -158 : -Math.min(buildingHeight - 28, 154);
    const sign = this.add
      .text(0, signY, location.sign, {
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: location.kind === "work" ? "17px" : "15px",
        color: "#f3f0d0",
        backgroundColor: "#14242f",
        padding: { x: 10, y: 6 },
        align: "center",
      })
      .setOrigin(0.5);
    container.add(sign);

    const sublabels: Partial<Record<LocationId, string>> = {
      coffee: "COFFEE · CHAI · DOOM",
      apartment: "LIVE SMALL · DREAM BIG(ISH)",
      "job-board": "CAREERS · GIGS · HOPE",
      workplace: "ALIGNMENT ON EVERY FLOOR",
      convenience: "HOT FOOD · COLD LIGHTING",
      "music-store": "USED INSTRUMENTS · NEW IDENTITIES",
      "art-store": "ARCHIVAL PAPER · VISIBLE JUDGMENT",
      bar: "FRIES · ZONING · OPINIONS",
      theater: "PLAYS · LEAKS · COMMUNITY",
    };
    const sublabel = sublabels[location.id];
    if (sublabel && location.kind !== "board") {
      container.add(
        this.add
          .text(0, signY + 28, sublabel, {
            fontFamily: "Arial, sans-serif",
            fontSize: "7px",
            color: "#b9d0cc",
            backgroundColor: "#14242f",
            padding: { x: 5, y: 2 },
            letterSpacing: 1,
          })
          .setOrigin(0.5),
      );
    }

    if (
      location.kind === "shop" ||
      location.kind === "work" ||
      location.id === "convenience"
    ) {
      for (const side of [-1, 1]) {
        const paneX = side * (buildingWidth / 2 - 55);
        const shopWindow = this.add
          .rectangle(paneX, -54, 67, 78, 0x19313a, 0.96)
          .setStrokeStyle(4, 0x263e46);
        const interiorGlow = this.add
          .rectangle(paneX, -54, 57, 68, 0xf2b45d, 0)
          .setData("base-alpha", side < 0 ? 0.82 : 0.66);
        const shelf = this.add.rectangle(paneX, -36, 54, 5, 0x6a4b34);
        const objects = [-17, 0, 17].map((offset, objectIndex) =>
          this.add.rectangle(
            paneX + offset,
            -48 - (objectIndex % 2) * 8,
            8 + objectIndex * 2,
            16 + (objectIndex % 2) * 7,
            [0x537d70, 0xb5764f, 0xd1b26c][objectIndex],
          ),
        );
        container.add([shopWindow, interiorGlow, shelf, ...objects]);
        this.shopWindowLights.add(interiorGlow);
      }
    }

    let door: Phaser.GameObjects.Rectangle | undefined;
    if (location.kind !== "board" && location.id !== "park") {
      door = this.add
        .rectangle(0, -2, 54, 82, location.kind === "work" ? 0x27333a : 0x252b31)
        .setOrigin(0.5, 1);
      door.setStrokeStyle(4, 0x131a20);
      container.add(door);
    }

    if (location.id === "coffee") {
      const awning = this.add.rectangle(0, -91, 225, 24, 0xc4d1cc);
      for (let stripe = -5; stripe <= 5; stripe += 2) {
        container.add(this.add.rectangle(stripe * 20, -91, 20, 24, 0x5a7780));
      }
      container.add(awning);
      container.bringToTop(awning);
      const employee = this.add.container(50, -50);
      employee.add([
        this.add.circle(0, -28, 12, 0xc88f68),
        this.add.rectangle(0, 1, 30, 45, 0x5f3e36),
        this.add.rectangle(0, -13, 38, 9, 0xc5a06e),
      ]);
      container.add(employee);
      const sidewalkBoard = this.add
        .rectangle(-88, 1, 48, 58, 0x26383d)
        .setOrigin(0.5, 1)
        .setStrokeStyle(3, 0xd1b269);
      const boardCopy = this.add
        .text(-88, -29, "MORE\nCAFFEINE\nLESS\nDESPAIR", {
          fontFamily: "Arial Black, Arial, sans-serif",
          fontSize: "7px",
          color: "#f1dfaa",
          align: "center",
          lineSpacing: -1,
        })
        .setOrigin(0.5);
      const steamA = this.add
        .text(72, -76, "~", {
          fontFamily: "Georgia, serif",
          fontSize: "20px",
          color: "#e8efe7",
        })
        .setOrigin(0.5)
        .setAlpha(0.7);
      container.add([sidewalkBoard, boardCopy, steamA]);
      this.tweens.add({
        targets: steamA,
        y: steamA.y - 12,
        alpha: 0.12,
        duration: 1450,
        yoyo: true,
        repeat: -1,
        ease: "Sine.InOut",
      });
      this.coffeeBubble = this.add
        .text(location.x + 55, baseY - 192, "Morning! Coffee for your\nemotional-support commute?", {
          fontFamily: "Arial, sans-serif",
          fontSize: "14px",
          color: "#13212a",
          backgroundColor: "#f6f2de",
          padding: { x: 10, y: 8 },
          align: "center",
        })
        .setOrigin(0.5, 1)
        .setDepth(35)
        .setVisible(false);
    }

    if (location.id === "music-store") {
      const display = this.add
        .rectangle(68, -70, 82, 102, 0x1b2b33, 0.9)
        .setStrokeStyle(4, 0x91b6bd);
      const guitarNeck = this.add.rectangle(68, -89, 7, 48, 0xb88350).setAngle(8);
      const guitarBodyA = this.add.circle(65, -55, 17, 0xd49a52).setStrokeStyle(3, 0x493426);
      const guitarBodyB = this.add.circle(72, -47, 14, 0xd49a52).setStrokeStyle(3, 0x493426);
      const guitarHole = this.add.circle(67, -54, 5, 0x3e2c26);
      const price = this.add
        .text(68, -119, "$120 / SOMEDAY", {
          fontFamily: "Arial Black, Arial, sans-serif",
          fontSize: "8px",
          color: "#f4d66e",
          backgroundColor: "#1b2b33",
          padding: { x: 3, y: 2 },
        })
        .setOrigin(0.5);
      container.add([display, guitarNeck, guitarBodyA, guitarBodyB, guitarHole, price]);
    }

    if (location.id === "art-store") {
      const display = this.add
        .rectangle(-68, -72, 78, 98, 0x23333b, 0.92)
        .setStrokeStyle(4, 0x91b6bd);
      const canvas = this.add
        .rectangle(-68, -75, 48, 58, 0xeee6ce)
        .setStrokeStyle(4, 0x5e4432)
        .setAngle(-3);
      const paint = this.add.graphics();
      paint.fillStyle(0x5c8d8a, 1);
      paint.fillTriangle(-87, -54, -70, -93, -50, -54);
      paint.fillStyle(0xd7975f, 1);
      paint.fillCircle(-57, -86, 8);
      const placard = this.add
        .text(-68, -119, "STATUS 3", {
          fontFamily: "Arial Black, Arial, sans-serif",
          fontSize: "8px",
          color: "#f4d66e",
          backgroundColor: "#1b2b33",
          padding: { x: 3, y: 2 },
        })
        .setOrigin(0.5);
      container.add([display, canvas, paint, placard]);
    }

    if (location.id === "apartment") {
      const stoopLight = this.add.circle(0, -101, 8, 0xf0c66d);
      const stoopGlow = this.add
        .circle(0, -101, 28, 0xf0b05d, 0)
        .setData("base-alpha", 0.72);
      const planter = this.add.rectangle(76, -12, 28, 24, 0x73503b).setStrokeStyle(2, 0x3c3029);
      const plant = this.add.graphics();
      plant.fillStyle(0x4c7358, 1);
      plant.fillTriangle(68, -23, 76, -55, 81, -23);
      plant.fillTriangle(77, -23, 91, -47, 88, -23);
      container.add([stoopGlow, stoopLight, planter, plant]);
      this.shopWindowLights.add(stoopGlow);
    }

    this.createStreetReflection(location.x, buildingWidth, facadeColor, location.id);

    const thresholdGlow = this.add
      .ellipse(0, 0, Math.min(92, buildingWidth * 0.42), 12, 0x9fc9c1, 0.22)
      .setBlendMode(Phaser.BlendModes.ADD);
    const doorwayWash = this.add
      .ellipse(0, -30, Math.min(70, buildingWidth * 0.34), 76, 0xb9d7cc, 0.045)
      .setBlendMode(Phaser.BlendModes.ADD);
    const thresholdLine = this.add
      .rectangle(0, -1, Math.min(44, buildingWidth * 0.22), 2, 0xc3dbd4, 0.48);
    const highlight = this.add
      .container(location.x, baseY + 1, [doorwayWash, thresholdGlow, thresholdLine])
      .setDepth(16)
      .setAlpha(0.72)
      .setVisible(false);
    this.tweens.add({
      targets: highlight,
      alpha: 0.48,
      scaleX: 1.06,
      duration: 1100,
      ease: "Sine.InOut",
      yoyo: true,
      repeat: -1,
    });

    this.locationVisuals.set(id, {
      container,
      highlight,
      markerY: baseY - (location.kind === "board" ? 198 : buildingHeight + 30),
      door,
      sign,
    });
  }

  private createStreetReflection(
    x: number,
    width: number,
    facadeColor: number,
    locationId: LocationId,
  ): void {
    if (locationId === "park") return;
    const coolReflection = mixHexColors(facadeColor, 0x5f8e98, 0.44);
    const facadeFragments: Phaser.GameObjects.Rectangle[] = [];
    const fragmentCount = Math.max(3, Math.floor(width / 42));
    for (let index = 0; index < fragmentCount; index += 1) {
      const offset = -width / 2 + 24 + index * (width - 48) / Math.max(1, fragmentCount - 1);
      const height = 24 + ((index * 17 + locationId.length * 7) % 48);
      facadeFragments.push(
        this.add
          .rectangle(offset, height / 2, 15 + (index % 2) * 9, height, coolReflection, 0.24)
          .setOrigin(0.5, 0),
      );
    }
    const facadeReflection = this.add
      .container(x, STREET_Y + 46, facadeFragments)
      .setDepth(1)
      .setAlpha(0.18)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setData("reflection-kind", "facade")
      .setData("base-alpha", 0.22);
    this.streetReflections.add(facadeReflection);

    const warmFragments = [-1, 1].map((side, index) =>
      this.add
        .rectangle(side * Math.min(68, width * 0.28), 0, 17 + index * 5, 52 - index * 13, 0xf2a94e, 0.38)
        .setOrigin(0.5, 0),
    );
    const warmReflection = this.add
      .container(x, STREET_Y + 47, warmFragments)
      .setDepth(2)
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setData("reflection-kind", "warm")
      .setData("base-alpha", 0.68);
    this.streetReflections.add(warmReflection);
  }

  private createStreetLights(): void {
    this.streetGlow = this.add.group();
    for (const x of [520, 1040, 1580, 2070, 2650, 3300, 3820, 4380, 4860]) {
      this.add.rectangle(x, STREET_Y, 7, 145, 0x27363e).setOrigin(0.5, 1).setDepth(10);
      this.add.rectangle(x + 18, STREET_Y - 137, 42, 7, 0x27363e).setDepth(10);
      this.add.circle(x + 37, STREET_Y - 133, 10, 0xf7dd8d).setDepth(11);
      const glow = this.add.circle(x + 37, STREET_Y - 132, 42, 0xffda78, 0).setDepth(9);
      this.streetGlow.add(glow);
      const lampReflection = this.add
        .rectangle(x + 37, STREET_Y + 47, 13, 76, 0xf0b849, 0.42)
        .setOrigin(0.5, 0)
        .setDepth(2)
        .setAlpha(0)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setData("reflection-kind", "warm")
        .setData("base-alpha", 0.82);
      this.streetReflections.add(lampReflection);
    }
  }

  private createExpansionBarriers(): void {
    const makeBarrier = (direction: "west" | "east"): Phaser.GameObjects.Container => {
      const fence = this.add.graphics();
      fence.lineStyle(6, 0xd6a847, 1);
      for (let offset = -86; offset <= 86; offset += 28) {
        fence.lineBetween(offset, 0, offset + 42, -92);
      }
      fence.lineStyle(5, 0x28353b, 1);
      fence.strokeRect(-104, -98, 208, 98);
      const cones = [-78, 78].map((x) =>
        this.add.triangle(x, 0, -15, 0, 0, -48, 15, 0, 0xe9823f).setOrigin(0.5, 1),
      );
      const sign = this.add
        .text(0, -120, direction === "west" ? "WEST BLOCK CLOSED" : "EAST BLOCK CLOSED", {
          fontFamily: "Arial Black, Arial, sans-serif",
          fontSize: "13px",
          color: "#19262d",
          backgroundColor: "#f0ce68",
          padding: { x: 9, y: 6 },
          align: "center",
        })
        .setOrigin(0.5)
        .setData("boundary-sign", true);
      return this.add.container(0, STREET_Y + 7, [fence, ...cones, sign]).setDepth(28);
    };
    this.westBarrier = makeBarrier("west");
    this.eastBarrier = makeBarrier("east");
  }

  private createPlayer(): void {
    if (!this.anims.exists(PLAYER_WALK_ANIMATION)) {
      this.anims.create({
        key: PLAYER_WALK_ANIMATION,
        frames: this.anims.generateFrameNumbers(PLAYER_WALK_TEXTURE, {
          start: 0,
          end: 7,
        }),
        frameRate: 10,
        repeat: -1,
      });
    }

    const shadow = this.add.ellipse(0, -3, 34, 8, 0x111a20, 0.24);
    this.playerSprite = this.add
      .sprite(0, PLAYER_BASELINE_OFFSET, PLAYER_WALK_TEXTURE, 0)
      .setOrigin(0.5, 1);
    const cupBody = this.add
      .rectangle(20, -49, 12, 18, 0xf1e4c4)
      .setStrokeStyle(2, 0x283740);
    const cupLid = this.add.rectangle(20, -59, 15, 4, 0x283740);
    const cupSleeve = this.add.rectangle(20, -48, 12, 6, 0x9d6f4c);
    this.carriedCoffee = this.add
      .container(0, PLAYER_BASELINE_OFFSET, [cupBody, cupLid, cupSleeve])
      .setVisible(this.snapshot.carriedItem === "coffee");
    const flyerShadow = this.add.rectangle(22, -43, 18, 25, 0x1a2830, 0.42);
    const flyerBack = this.add
      .rectangle(20, -46, 18, 25, 0xded6ba)
      .setStrokeStyle(1, 0x26363c)
      .setAngle(-7);
    const flyerFront = this.add
      .rectangle(23, -49, 18, 25, 0xf4e8bd)
      .setStrokeStyle(2, 0x26363c)
      .setAngle(5);
    const flyerInk = this.add.rectangle(23, -49, 10, 3, 0xc25145).setAngle(5);
    this.carriedFlyers = this.add
      .container(0, PLAYER_BASELINE_OFFSET, [flyerShadow, flyerBack, flyerFront, flyerInk])
      .setVisible(false);

    const guitarNeck = this.add
      .rectangle(10, -67, 7, 53, 0xb77a43)
      .setStrokeStyle(2, 0x2b2523)
      .setAngle(-18);
    const guitarBodyA = this.add
      .circle(0, -39, 17, 0xd28a3e)
      .setStrokeStyle(3, 0x372722);
    const guitarBodyB = this.add
      .circle(13, -34, 15, 0xc87538)
      .setStrokeStyle(3, 0x372722);
    const guitarHole = this.add.circle(7, -38, 5, 0x3a2925);
    const guitarPickguard = this.add
      .triangle(13, -38, -3, -4, 8, 2, 2, 13, 0x342a28, 0.82)
      .setAngle(-16);
    this.performanceGuitar = this.add
      .container(0, PLAYER_BASELINE_OFFSET, [
        guitarNeck,
        guitarBodyA,
        guitarBodyB,
        guitarHole,
        guitarPickguard,
      ])
      .setVisible(false);
    this.player = this.add
      .container(
        LOCATION_BY_ID.apartment.x + 10,
        PLAYER_GROUND_Y,
        [
          shadow,
          this.playerSprite,
          this.carriedCoffee,
          this.carriedFlyers,
          this.performanceGuitar,
        ],
      )
      .setDepth(26);
  }

  private createStreetGigVenue(): void {
    const children: Phaser.GameObjects.GameObject[] = [];
    const rug = this.add
      .rectangle(0, 4, 220, 25, 0x6d3d45, 0.92)
      .setOrigin(0.5, 1)
      .setStrokeStyle(3, 0x30272b);
    const rugPattern = this.add.graphics();
    rugPattern.lineStyle(2, 0xd0935c, 0.62);
    for (let x = -92; x <= 92; x += 23) rugPattern.lineBetween(x, -17, x + 12, 1);

    const amp = this.add
      .rectangle(-76, -28, 52, 58, 0x202a2e)
      .setOrigin(0.5, 1)
      .setStrokeStyle(4, 0x10171b);
    const ampCloth = this.add.rectangle(-76, -47, 39, 31, 0x4d5b58).setStrokeStyle(2, 0x151e22);
    const ampKnobs = [-89, -80, -71, -62].map((x) => this.add.circle(x, -72, 2, 0xe3bd67));

    const micStand = this.add.rectangle(60, -46, 4, 92, 0x29383d).setOrigin(0.5, 1);
    const micArm = this.add.rectangle(48, -88, 31, 4, 0x29383d).setAngle(-8);
    const mic = this.add.rectangle(32, -92, 13, 7, 0x111b20).setAngle(-8);

    const caseBottom = this.add
      .ellipse(88, 1, 74, 18, 0x231c1c)
      .setOrigin(0.5, 1)
      .setStrokeStyle(3, 0x8b5c3d);
    const caseLining = this.add.ellipse(88, -5, 58, 10, 0x7f3737).setOrigin(0.5, 1);
    const caseCoins = Array.from({ length: 14 }, (_, index) =>
      this.add
        .circle(65 + (index * 13) % 47, -7 - (index % 3) * 2, 3, 0xf0cc55)
        .setStrokeStyle(1, 0x6b5221)
        .setAlpha(0),
    );

    const leftPole = this.add.rectangle(-128, -78, 5, 156, 0x29393d).setOrigin(0.5, 1);
    const rightPole = this.add.rectangle(128, -78, 5, 156, 0x29393d).setOrigin(0.5, 1);
    const wire = this.add.graphics();
    wire.lineStyle(2, 0x202b30, 0.95);
    wire.beginPath();
    wire.moveTo(-128, -153);
    wire.lineTo(0, -133);
    wire.lineTo(128, -153);
    wire.strokePath();
    const lights = Array.from({ length: 9 }, (_, index) => {
      const x = -112 + index * 28;
      const y = -148 + Math.abs(4 - index) * 4.5;
      return this.add.circle(x, y, 5, index % 2 === 0 ? 0xffd66d : 0xf18b6d, 0.34);
    });
    const poster = this.add
      .text(0, -178, "TONIGHT · 8 PM\nFIRST SHOW / FREE / PROBABLY LOUD", {
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: "10px",
        color: "#17252b",
        backgroundColor: "#e6c664",
        padding: { x: 9, y: 6 },
        align: "center",
        lineSpacing: 2,
      })
      .setOrigin(0.5)
      .setAngle(-1);

    children.push(
      rug,
      rugPattern,
      amp,
      ampCloth,
      ...ampKnobs,
      micStand,
      micArm,
      mic,
      caseBottom,
      caseLining,
      ...caseCoins,
      leftPole,
      rightPole,
      wire,
      ...lights,
      poster,
    );
    const container = this.add
      .container(STREET_GIG_X, PLAYER_GROUND_Y, children)
      .setDepth(19)
      .setVisible(false);
    this.gigVenue = { container, lights, caseCoins };

    this.tweens.add({
      targets: lights,
      alpha: { from: 0.28, to: 0.9 },
      duration: 820,
      yoyo: true,
      repeat: -1,
      stagger: 85,
      ease: "Sine.InOut",
    });
  }

  private createFlyerCrowd(): void {
    const positions = [
      1080, 1280, 1490, 1730, 1960, 2210, 2740,
      2960, 3190, 3430, 3680, 3940, 4200, 4440,
    ];
    const acceptance = [true, false, true, true, false, true, true, false, true, true, false, true, false, true];
    this.flyerProspects = positions.map((x, index) =>
      this.createFlyerProspect(index, x, acceptance[index]),
    );
  }

  private createFlyerProspect(
    index: number,
    x: number,
    acceptsFlyer: boolean,
  ): FlyerProspectVisual {
    const skins = [0x8a5d46, 0xc58d69, 0x684637, 0xd2a27f, 0x9d6a50];
    const coats = [0x476a61, 0x9f5b49, 0x405f78, 0x77614d, 0x665477, 0xb18b3e];
    const accents = [0xe1bd54, 0x72a9a3, 0xca725a, 0x8fbd73, 0xb68aba];
    const skin = skins[index % skins.length];
    const coat = coats[index % coats.length];
    const accent = accents[index % accents.length];
    const pants = index % 3 === 0 ? 0x26343d : index % 3 === 1 ? 0x403a3a : 0x283a36;
    const direction = (index % 2 === 0 ? 1 : -1) as -1 | 1;

    const shadow = this.add.ellipse(0, 3, 36, 9, 0x11191d, 0.25);
    const leftLeg = this.add.rectangle(-7, -25, 8, 29, pants).setOrigin(0.5, 0).setStrokeStyle(1, 0x182329);
    const rightLeg = this.add.rectangle(7, -25, 8, 29, pants).setOrigin(0.5, 0).setStrokeStyle(1, 0x182329);
    const leftShoe = this.add.rectangle(-9, 2, 13, 5, 0x172126).setOrigin(0.5, 1);
    const rightShoe = this.add.rectangle(9, 2, 13, 5, 0x172126).setOrigin(0.5, 1);
    const torso = this.add
      .rectangle(0, -50, 29 + (index % 2) * 3, 47, coat)
      .setStrokeStyle(2, 0x17252b);
    const jacketShade = this.add.rectangle(-9, -48, 7, 39, Phaser.Display.Color.ValueToColor(coat).darken(22).color, 0.7);
    const zipper = this.add.rectangle(2, -50, 2, 37, accent, 0.7);
    const arm = this.add.rectangle(16, -49, 9, 35, coat).setStrokeStyle(2, 0x17252b).setAngle(-10);
    const hand = this.add.circle(19, -32, 5, skin).setStrokeStyle(1, 0x3b2a25);
    const head = this.add.circle(1, -83, 14, skin).setStrokeStyle(2, 0x17252b);
    const nose = this.add.rectangle(15, -82, 5, 4, skin).setStrokeStyle(1, 0x3b2a25);
    const hair = this.add.arc(0, -88, 16, 184, 358, false, index % 4 === 0 ? 0x241f1e : 0x44342d).setStrokeStyle(2, 0x17252b);
    const eye = this.add.rectangle(10, -86, 2, 2, 0x151a1d);
    const figureChildren: Phaser.GameObjects.GameObject[] = [
      shadow,
      leftLeg,
      rightLeg,
      leftShoe,
      rightShoe,
      torso,
      jacketShade,
      zipper,
      arm,
      hand,
      head,
      nose,
      hair,
      eye,
    ];

    if (index % 4 === 0) {
      figureChildren.push(
        this.add.rectangle(0, -96, 27, 10, accent).setStrokeStyle(2, 0x17252b),
        this.add.rectangle(-5, -104, 17, 8, accent).setStrokeStyle(2, 0x17252b),
      );
    } else if (index % 4 === 1) {
      const tote = this.add.rectangle(-18, -39, 20, 27, accent).setStrokeStyle(2, 0x273138);
      const strap = this.add.graphics();
      strap.lineStyle(3, 0x273138, 1);
      strap.arc(-9, -56, 15, Phaser.Math.DegToRad(100), Phaser.Math.DegToRad(245));
      figureChildren.push(tote, strap);
    } else if (index % 4 === 2) {
      figureChildren.push(
        this.add.arc(1, -84, 18, 105, 255, false, 0x202a31).setStrokeStyle(3, accent),
        this.add.rectangle(18, -84, 5, 14, accent).setStrokeStyle(1, 0x17252b),
      );
    } else {
      figureChildren.push(this.add.rectangle(0, -67, 31, 7, accent).setAngle(8));
    }

    const figure = this.add.container(0, 0, figureChildren).setScale(direction, 1);
    const reaction = this.add
      .text(0, -119, acceptsFlyer ? "♪ I'M IN" : "NO, THANKS", {
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: "9px",
        color: acceptsFlyer ? "#15302f" : "#442529",
        backgroundColor: acceptsFlyer ? "#9de1c7" : "#f0b3a3",
        padding: { x: 6, y: 4 },
      })
      .setOrigin(0.5)
      .setVisible(false);
    const badgeGlow = this.add.circle(0, -112, 15, 0xf3d469, 0.25);
    const badgeDisc = this.add.circle(0, -112, 10, 0x18323a).setStrokeStyle(2, 0xf3d469);
    const badgeNote = this.add.text(0, -113, "♪", {
      fontFamily: "Georgia, serif",
      fontSize: "16px",
      color: "#ffe17a",
    }).setOrigin(0.5);
    const musicBadge = this.add.container(0, 0, [badgeGlow, badgeDisc, badgeNote]).setVisible(false);
    const container = this.add
      .container(x, PLAYER_GROUND_Y, [figure, reaction, musicBadge])
      .setDepth(25)
      .setVisible(false);

    return {
      id: `prospect-${index + 1}`,
      container,
      figure,
      leftLeg,
      rightLeg,
      reaction,
      musicBadge,
      direction,
      speed: 15 + (index % 5) * 3,
      phase: index * 517,
      acceptsFlyer,
    };
  }

  private createStreetCrowd(): void {
    this.streetActors = STREET_ENCOUNTERS.map((definition, index) =>
      this.createStreetActor(definition, index),
    );
    this.crowdDay = this.snapshot.totalDays;
  }

  private createStreetActor(
    definition: StreetEncounterDefinition,
    index: number,
  ): StreetActorVisual {
    const palette = definition.palette;
    const children: Phaser.GameObjects.GameObject[] = [];
    let leftLeg: Phaser.GameObjects.Rectangle | undefined;
    let rightLeg: Phaser.GameObjects.Rectangle | undefined;
    let accessory: Phaser.GameObjects.GameObject | undefined;
    let wheels: Phaser.GameObjects.Arc[] | undefined;
    let warning: Phaser.GameObjects.Text | undefined;

    const shadow = this.add.ellipse(0, 8, definition.kind === "cyclist" ? 70 : 38, 12, 0x111a20, 0.26);
    children.push(shadow);

    if (definition.kind === "cyclist") {
      const rearWheel = this.add.circle(-23, -7, 14, 0x152029, 0).setStrokeStyle(4, 0x27353e);
      const frontWheel = this.add.circle(24, -7, 14, 0x152029, 0).setStrokeStyle(4, 0x27353e);
      const frame = this.add.graphics();
      frame.lineStyle(4, palette.accent, 1);
      frame.lineBetween(-23, -7, -5, -30);
      frame.lineBetween(-5, -30, 9, -7);
      frame.lineBetween(9, -7, -23, -7);
      frame.lineBetween(-5, -30, 24, -7);
      const riderBody = this.add.rectangle(-5, -51, 24, 32, palette.coat).setStrokeStyle(2, 0x18232a);
      const riderHead = this.add.circle(-5, -78, 11, palette.skin).setStrokeStyle(2, 0x18232a);
      const helmet = this.add.arc(-5, -82, 14, 185, 355, false, palette.accent).setStrokeStyle(2, 0x18232a);
      leftLeg = this.add.rectangle(-9, -34, 7, 27, palette.pants).setOrigin(0.5, 0);
      rightLeg = this.add.rectangle(4, -34, 7, 27, palette.pants).setOrigin(0.5, 0);
      wheels = [rearWheel, frontWheel];
      warning = this.add
        .text(0, -111, "RING RING", {
          fontFamily: "Arial Black, Arial, sans-serif",
          fontSize: "11px",
          color: "#17232a",
          backgroundColor: "#f7d966",
          padding: { x: 5, y: 3 },
        })
        .setOrigin(0.5)
        .setVisible(false);
      children.push(rearWheel, frontWheel, frame, leftLeg, rightLeg, riderBody, riderHead, helmet, warning);
    } else {
      leftLeg = this.add.rectangle(-7, -9, 8, 27, palette.pants).setOrigin(0.5, 0);
      rightLeg = this.add.rectangle(7, -9, 8, 27, palette.pants).setOrigin(0.5, 0);
      const body = this.add.rectangle(0, -38, 27, 43, palette.coat).setStrokeStyle(2, 0x18232a);
      const head = this.add.circle(0, -69, 13, palette.skin).setStrokeStyle(2, 0x18232a);
      const hair = this.add.arc(0, -73, 15, 185, 355, false, palette.pants).setStrokeStyle(2, 0x18232a);
      children.push(leftLeg, rightLeg, body, head, hair);

      if (definition.kind === "phone-walker") {
        const phoneGlow = this.add.rectangle(15, -47, 13, 22, palette.accent, 0.2);
        const phone = this.add.rectangle(15, -47, 8, 15, palette.accent).setStrokeStyle(2, 0x17232b);
        accessory = this.add.container(0, 0, [phoneGlow, phone]);
        children.push(accessory);
      }
      if (definition.kind === "panhandler") {
        const board = this.add.rectangle(19, -42, 28, 22, palette.accent).setStrokeStyle(2, 0x4f3e31);
        const boardText = this.add
          .text(19, -42, "ASK", {
            fontFamily: "Arial Black, Arial, sans-serif",
            fontSize: "8px",
            color: "#4b392d",
          })
          .setOrigin(0.5);
        accessory = this.add.container(0, 0, [board, boardText]);
        warning = this.add
          .text(0, -101, "HEY!", {
            fontFamily: "Arial Black, Arial, sans-serif",
            fontSize: "11px",
            color: "#fff4d4",
            backgroundColor: "#9d4d3f",
            padding: { x: 5, y: 3 },
          })
          .setOrigin(0.5)
          .setVisible(false);
        children.push(accessory, warning);
      }
      if (definition.kind === "neighbor") {
        const beanie = this.add.rectangle(0, -80, 22, 9, palette.accent).setStrokeStyle(2, 0x18232a);
        const tinyCup = this.add.rectangle(17, -45, 10, 15, 0xe8dec5).setStrokeStyle(2, 0x18232a);
        accessory = this.add.container(0, 0, [beanie, tinyCup]);
        children.push(accessory);
      }
    }

    const lane = definition.lane;
    const container = this.add
      .container(
        LOCATION_BY_ID.apartment.x + definition.startOffset,
        SIDEWALK_LANES[lane],
        children,
      )
      .setDepth(23 + lane * 4);

    return {
      id: `${definition.id}-${index}`,
      definition,
      container,
      leftLeg,
      rightLeg,
      accessory,
      wheels,
      warning,
      direction: definition.direction,
      lane,
      phase: index * 830,
      resolved: false,
      engaging: false,
    };
  }

  private resetStreetCrowd(): void {
    this.crowdDay = this.snapshot.totalDays;
    this.streetActors.forEach((actor, index) => {
      actor.resolved = false;
      actor.engaging = false;
      actor.direction = actor.definition.direction;
      actor.lane = actor.definition.lane;
      actor.container
        .setPosition(
          LOCATION_BY_ID.apartment.x + actor.definition.startOffset + index * 18,
          SIDEWALK_LANES[actor.lane],
        )
        .setAlpha(1);
      actor.warning?.setVisible(false);
    });
  }

  private createRain(): void {
    this.rain = this.add.graphics().setScrollFactor(0).setDepth(32);
    this.rain.lineStyle(1.5, 0xd7edf5, 0.38);
    for (let index = 0; index < 85; index += 1) {
      const x = (index * 137) % GAME_WIDTH;
      const y = (index * 83) % GAME_HEIGHT;
      this.rain.lineBetween(x, y, x - 7, y + 17);
    }
    this.tweens.add({
      targets: this.rain,
      x: -10,
      y: 24,
      duration: 620,
      repeat: -1,
      onRepeat: () => this.rain.setPosition(0, 0),
    });
  }

  private createLighting(): void {
    this.lighting = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x10183d, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(40)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
  }

  private createOpportunityMarkers(): void {
    for (const definition of this.gameState.opportunities.active()) {
      this.ensureOpportunityMarker(definition.id, definition.targetLocationId);
    }
  }

  private ensureOpportunityMarker(id: string, targetId: LocationId): Phaser.GameObjects.Container {
    const existing = this.opportunityMarkers.get(id);
    if (existing) return existing;
    const visual = this.locationVisuals.get(targetId);
    const target = LOCATION_BY_ID[targetId];
    const glow = this.add.circle(0, 0, 17, 0xffda69, 0.26);
    const diamond = this.add
      .rectangle(0, 0, 15, 15, 0xffe07a)
      .setAngle(45)
      .setStrokeStyle(3, 0x192a33);
    const marker = this.add
      .container(target.x, visual?.markerY ?? STREET_Y - 220, [glow, diamond])
      .setDepth(55)
      .setVisible(false);
    this.opportunityMarkers.set(id, marker);
    return marker;
  }

  private updateWorldState(): void {
    this.queueAtmosphereTransition();
    if (this.crowdDay !== this.snapshot.totalDays) this.resetStreetCrowd();
    const stage = getWorldStage(this.snapshot.worldStage);
    const bounds = getOpenWorldBounds();
    this.movementMinX = bounds.minX + 45;
    this.movementMaxX = bounds.maxX - 45;
    this.cameras.main.setBounds(
      bounds.minX,
      0,
      bounds.maxX - bounds.minX,
      GAME_HEIGHT,
    );

    if (this.renderedWorldStage !== stage.stage) {
      const animate = this.renderedWorldStage >= 0;
      this.renderedWorldStage = stage.stage;
      const westSign = this.westBarrier
        ?.getAll()
        .find((item) => item.getData("boundary-sign")) as Phaser.GameObjects.Text | undefined;
      const eastSign = this.eastBarrier
        ?.getAll()
        .find((item) => item.getData("boundary-sign")) as Phaser.GameObjects.Text | undefined;
      westSign?.setText(stage.westBoundaryLabel);
      eastSign?.setText(stage.eastBoundaryLabel);
      if (animate) {
        this.audio.play("expansion");
        this.tweens.add({
          targets: this.westBarrier,
          x: bounds.minX + 70,
          duration: 1100,
          ease: "Cubic.Out",
        });
        this.tweens.add({
          targets: this.eastBarrier,
          x: bounds.maxX - 70,
          duration: 1100,
          ease: "Cubic.Out",
        });
      } else {
        this.westBarrier?.setX(bounds.minX + 70);
        this.eastBarrier?.setX(bounds.maxX - 70);
      }
    }

    for (const location of LOCATIONS) {
      const unlocked = this.gameState.isLocationUnlocked(location.id);
      const visual = this.locationVisuals.get(location.id);
      if (!visual) continue;
      const wasVisible = visual.container.visible;
      visual.container.setVisible(unlocked);
      visual.highlight.setVisible(
        unlocked && this.focusedLocation === location.id,
      );
      if (unlocked && !wasVisible && this.renderedWorldStage > 0) {
        visual.container.setAlpha(0);
        this.tweens.add({
          targets: visual.container,
          alpha: 1,
          duration: 700,
          delay: Math.abs(location.x - LOCATION_BY_ID.apartment.x) * 0.12,
        });
      }
    }

    const workplace = this.locationVisuals.get("workplace");
    if (workplace?.door && workplace.sign) {
      const unlocked = this.snapshot.job !== null;
      workplace.door.setFillStyle(unlocked ? 0xe1c86d : 0x27333a);
      workplace.door.setStrokeStyle(4, unlocked ? 0xffed9c : 0x131a20);
      workplace.sign.setColor(unlocked ? "#fff2a8" : "#87929a");
      workplace.container.setAlpha(unlocked ? 1 : 0.74);
    }

    this.rain?.setVisible(
      this.snapshot.weather === "rain" || this.snapshot.weather === "snow",
    );
    this.rain?.setAlpha(this.snapshot.weather === "snow" ? 0.85 : 1);
    this.carriedCoffee?.setVisible(this.snapshot.carriedItem === "coffee");
    this.carriedFlyers?.setVisible(
      this.snapshot.gig.phase === "promoting" &&
        this.snapshot.gig.flyersRemaining > 0,
    );
    this.performanceGuitar?.setVisible(this.snapshot.gig.phase === "performing");
    this.gigVenue?.container.setVisible(this.snapshot.gig.phase !== "unbooked");
    if (this.gigVenue && this.snapshot.gig.phase === "complete") {
      const tips = this.snapshot.gig.lastResult?.tips ?? 0;
      this.gigVenue.caseCoins.forEach((coin, index) =>
        coin.setAlpha(index < Math.min(tips, this.gigVenue.caseCoins.length) ? 1 : 0),
      );
    }
    const approached = new Set(this.snapshot.gig.approachedPeople);
    const recruited = new Set(this.snapshot.gig.recruitedPeople);
    this.flyerProspects.forEach((prospect) => {
      prospect.musicBadge.setVisible(
        recruited.has(prospect.id) && this.snapshot.gig.phase === "promoting",
      );
      if (!approached.has(prospect.id)) prospect.reaction.setVisible(false);
    });

    const activeIds = new Set(this.gameState.opportunities.active().map((item) => item.id));
    this.opportunityMarkers.forEach((marker, id) => {
      if (!activeIds.has(id)) marker.setVisible(false);
    });
  }

  private queueAtmosphereTransition(): void {
    if (
      this.atmosphereSnapshotMinutes === this.snapshot.minutes &&
      this.atmosphereDay === this.snapshot.totalDays
    ) {
      return;
    }
    this.atmosphereSnapshotMinutes = this.snapshot.minutes;
    this.atmosphereDay = this.snapshot.totalDays;
    this.atmosphereTargetMinutes =
      this.snapshot.totalDays * 1440 + this.snapshot.minutes;
  }

  private applyAtmosphere(delta: number): void {
    const distance = this.atmosphereTargetMinutes - this.atmosphereMinutes;
    if (Math.abs(distance) > 0.05) {
      const transitionTime = Math.abs(distance) > 180 ? 1450 : 850;
      const progress = 1 - Math.exp(-delta / transitionTime);
      this.atmosphereMinutes += distance * progress;
    } else {
      this.atmosphereMinutes = this.atmosphereTargetMinutes;
    }

    const minutes = normalizeMinutes(this.atmosphereMinutes);
    const atmosphere = sampleAtmosphere(minutes, this.snapshot.weather);
    const lastBand = Math.max(1, this.skyBands.length - 1);
    this.skyBands.forEach((band, index) => {
      band.setFillStyle(
        mixHexColors(atmosphere.skyTop, atmosphere.skyBottom, index / lastBand),
      );
    });

    this.horizonGlow
      ?.setFillStyle(atmosphere.horizonColor)
      .setAlpha(atmosphere.sunset * 0.56);

    const sunProgress = Phaser.Math.Clamp((minutes - 330) / 930, 0, 1);
    const sunX = 58 + sunProgress * (GAME_WIDTH - 116);
    const sunY = 344 - Math.sin(sunProgress * Math.PI) * 274;
    this.sun
      ?.setPosition(sunX, sunY)
      .setFillStyle(atmosphere.sunColor)
      .setAlpha(atmosphere.daylight * (this.snapshot.weather === "smoke" ? 0.48 : 0.94));

    const moonMinutes = minutes < 480 ? minutes + 1440 : minutes;
    const moonProgress = Phaser.Math.Clamp((moonMinutes - 1140) / 780, 0, 1);
    const moonX = 48 + moonProgress * (GAME_WIDTH - 96);
    const moonY = 330 - Math.sin(moonProgress * Math.PI) * 252;
    const moonAlpha =
      atmosphere.night *
      (this.snapshot.weather === "clear" ? 0.86 : this.snapshot.weather === "smoke" ? 0.3 : 0.46);
    this.moon?.setPosition(moonX, moonY).setAlpha(moonAlpha);
    this.moonShadow
      ?.setPosition(moonX + 7, moonY - 7)
      .setFillStyle(atmosphere.skyTop)
      .setAlpha(moonAlpha);

    const starAlpha =
      atmosphere.night *
      (this.snapshot.weather === "clear" ? 0.9 : this.snapshot.weather === "smoke" ? 0.16 : 0.24);
    this.stars?.getChildren().forEach((star, index) => {
      (star as Phaser.GameObjects.Rectangle).setAlpha(
        starAlpha * (0.58 + ((index * 29) % 42) / 100),
      );
    });

    this.cloudLayers.forEach((layer, layerIndex) => {
      layer.container.x -= (layer.speed * delta) / 1000;
      if (layer.container.x <= -layer.wrapDistance) {
        layer.container.x += layer.wrapDistance;
      }
      layer.container.setAlpha(
        layer.baseAlpha * atmosphere.cloudiness * (layerIndex === 0 ? 0.84 : 1),
      );
      layer.blocks.forEach((block, blockIndex) => {
        block.setFillStyle(
          mixHexColors(
            atmosphere.cloudColor,
            atmosphere.skyBottom,
            ((blockIndex + layerIndex) % 5) * 0.035,
          ),
        );
      });
    });

    this.mountain?.setAlpha(atmosphere.mountainVisibility);
    this.cityWindowLights?.getChildren().forEach((light, index) => {
      (light as Phaser.GameObjects.Rectangle).setAlpha(
        atmosphere.windowLights * (index % 5 === 0 ? 0.58 : 0.9),
      );
    });
    this.streetGlow?.getChildren().forEach((child) => {
      (child as Phaser.GameObjects.Arc).setAlpha(
        atmosphere.windowLights * 0.48 + atmosphere.sunset * 0.08,
      );
    });

    const wetness =
      this.snapshot.weather === "rain"
        ? 1
        : this.snapshot.weather === "cloudy"
          ? 0.52
          : this.snapshot.weather === "snow"
            ? 0.38
            : this.snapshot.weather === "smoke"
              ? 0.16
              : 0.24;
    const shimmer = 0.94 + Math.sin(this.time.now / 620) * 0.06;

    this.wetStreetSheen?.setAlpha(
      (0.04 + wetness * 0.18 + atmosphere.windowLights * 0.05) * shimmer,
    );

    this.puddleHighlights?.getChildren().forEach((highlight, index) => {
      const shape = highlight as Phaser.GameObjects.Shape;
      shape.setAlpha(
        wetness *
          (0.12 + atmosphere.daylight * 0.12 + atmosphere.windowLights * 0.18) *
          (0.88 + Math.sin(this.time.now / 520 + index) * 0.12),
      );
    });

    this.shopWindowLights?.getChildren().forEach((window) => {
      const light = window as Phaser.GameObjects.Shape;
      const baseAlpha = Number(light.getData("base-alpha") ?? 0.6);
      light.setAlpha(
        baseAlpha *
          (0.18 + atmosphere.windowLights * 0.82 + atmosphere.sunset * 0.18),
      );
    });

    this.streetReflections?.getChildren().forEach((reflection, index) => {
      const reflectedObject = reflection as
        | Phaser.GameObjects.Container
        | Phaser.GameObjects.Rectangle;
      const baseAlpha = Number(reflectedObject.getData("base-alpha") ?? 0.2);
      const kind = reflectedObject.getData("reflection-kind");
      const lightFactor =
        kind === "warm"
          ? atmosphere.windowLights * 0.9 + atmosphere.sunset * 0.2
          : 0.14 +
            atmosphere.daylight * 0.12 +
            atmosphere.windowLights * 0.16;
      reflectedObject.setAlpha(
        baseAlpha *
          wetness *
          lightFactor *
          (0.92 + Math.sin(this.time.now / 700 + index * 0.7) * 0.08),
      );
    });

    this.lighting?.setAlpha(
      0.025 +
        atmosphere.night * 0.36 +
        (this.snapshot.weather === "rain" ? 0.055 : 0),
    );
  }

  setMenuOpen(open: boolean): void {
    this.menuOpen = open;
    if (!open) {
      this.streetActors.forEach((actor) => {
        if (!actor.resolved) actor.engaging = false;
      });
    }
  }

  setTouchDirection(direction: number): void {
    if (this.gigSession && direction !== 0) {
      this.setShowSide(direction < 0 ? -1 : 1);
      this.touchDirection = 0;
      return;
    }
    this.touchDirection = Phaser.Math.Clamp(direction, -1, 1);
  }

  setTouchDepth(_direction: number): void {
    // The legacy side-scrolling renderer intentionally has no depth axis.
  }

  setTouchSprinting(sprinting: boolean): void {
    if (this.gigSession) {
      if (sprinting) {
        if (this.gigSession.powerChordUnlocked && !this.gigSession.powerChordUsed) {
          this.triggerPowerChord();
        } else {
          this.triggerFlourish();
        }
      }
      this.touchSprinting = false;
      return;
    }
    this.touchSprinting = sprinting;
  }

  beginStreetGig(): void {
    if (this.gigSession || this.snapshot.gig.phase !== "performing") return;
    this.menuOpen = false;
    this.touchDirection = 0;
    this.touchSprinting = false;
    this.player.x = STREET_GIG_X;
    this.player.y = PLAYER_GROUND_Y;
    this.player.scaleX = 1;
    this.playerSprite.stop();
    this.playerSprite.setFrame(0);
    this.carriedCoffee.setVisible(false);
    this.carriedFlyers.setVisible(false);
    this.performanceGuitar.setVisible(true);
    this.cameras.main.centerOn(STREET_GIG_X, GAME_HEIGHT / 2);
    this.audio.beginPerformance();
    this.gigVenue.caseCoins.forEach((coin) => coin.setAlpha(0));

    const recruited = new Set(this.snapshot.gig.recruitedPeople);
    const audienceOffsets = [-208, 198, -168, 160, -128, 122, -90, 88, -238, 230];
    let audienceIndex = 0;
    this.flyerProspects.forEach((prospect) => {
      prospect.reaction.setVisible(false);
      prospect.musicBadge.setVisible(false);
      if (!recruited.has(prospect.id)) {
        prospect.container.setVisible(false);
        return;
      }
      const offset = audienceOffsets[audienceIndex] ?? (audienceIndex % 2 === 0 ? -260 : 260);
      audienceIndex += 1;
      prospect.container
        .setVisible(true)
        .setAlpha(1)
        .setPosition(STREET_GIG_X + offset, PLAYER_GROUND_Y + 4 + (audienceIndex % 2) * 7)
        .setDepth(27 + (audienceIndex % 2));
      prospect.figure.setScale(offset < 0 ? 1 : -1, 1).setAlpha(1);
    });

    const panel = this.add
      .rectangle(GAME_WIDTH / 2, 120, 660, 102, 0x081820, 0.94)
      .setStrokeStyle(2, 0xd9c56d)
      .setScrollFactor(0);
    const title = this.add
      .text(GAME_WIDTH / 2, 78, "WATCH THE RING · HIT SPACE WHEN IT CLOSES", {
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: "12px",
        color: "#f8e18a",
        letterSpacing: 1,
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    const grooveBack = this.add.rectangle(GAME_WIDTH / 2 - 78, 101, 156, 10, 0x18323b).setOrigin(0, 0.5).setScrollFactor(0);
    const grooveFill = this.add.rectangle(GAME_WIDTH / 2 - 78, 101, 1, 8, 0xf2c95c).setOrigin(0, 0.5).setScrollFactor(0);
    const grooveLabel = this.add.text(GAME_WIDTH / 2, 113, "GROOVE", {
      fontFamily: "Arial Black, Arial, sans-serif",
      fontSize: "8px",
      color: "#e7dba8",
    }).setOrigin(0.5).setScrollFactor(0);
    const leftBack = this.add.rectangle(GAME_WIDTH / 2 - 288, 101, 126, 10, 0x18323b).setOrigin(0, 0.5).setScrollFactor(0);
    const leftFill = this.add.rectangle(GAME_WIDTH / 2 - 288, 101, 1, 8, 0x70b9ad).setOrigin(0, 0.5).setScrollFactor(0);
    const leftLabel = this.add.text(GAME_WIDTH / 2 - 225, 113, "← LEFT CROWD", {
      fontFamily: "Arial Black, Arial, sans-serif",
      fontSize: "8px",
      color: "#b9d8d2",
    }).setOrigin(0.5).setScrollFactor(0);
    const rightBack = this.add.rectangle(GAME_WIDTH / 2 + 162, 101, 126, 10, 0x18323b).setOrigin(0, 0.5).setScrollFactor(0);
    const rightFill = this.add.rectangle(GAME_WIDTH / 2 + 162, 101, 1, 8, 0xe5846f).setOrigin(0, 0.5).setScrollFactor(0);
    const rightLabel = this.add.text(GAME_WIDTH / 2 + 225, 113, "RIGHT CROWD →", {
      fontFamily: "Arial Black, Arial, sans-serif",
      fontSize: "8px",
      color: "#e8b3a6",
    }).setOrigin(0.5).setScrollFactor(0);
    const accentPips = Array.from({ length: STREET_GIG_BEATS / 4 - 1 }, (_, index) =>
      this.add
        .rectangle(GAME_WIDTH / 2 - 100 + index * 20, 132, 13, 7, 0x24434a)
        .setStrokeStyle(1, 0x56767a)
        .setScrollFactor(0),
    );
    const scoreText = this.add.text(GAME_WIDTH / 2 - 300, 147, "0 PERFECT · 0 GOOD · 0 MISS · STREAK 0", {
      fontFamily: "Arial Black, Arial, sans-serif",
      fontSize: "8px",
      color: "#d8e2d9",
    }).setOrigin(0, 0.5).setScrollFactor(0);
    const moveText = this.add.text(GAME_WIDTH / 2 + 300, 147, "SHIFT FLOURISH · 35 GROOVE  |  E POWER CHORD · 3 PERFECTS", {
      fontFamily: "Arial Black, Arial, sans-serif",
      fontSize: "8px",
      color: "#8fa7a8",
    }).setOrigin(1, 0.5).setScrollFactor(0);
    const hud = this.add
      .container(0, 0, [
        panel,
        title,
        grooveBack,
        grooveFill,
        grooveLabel,
        leftBack,
        leftFill,
        leftLabel,
        rightBack,
        rightFill,
        rightLabel,
        ...accentPips,
        scoreText,
        moveText,
      ])
      .setDepth(80);

    const beatTarget = this.add
      .circle(STREET_GIG_X, PLAYER_GROUND_Y - 57, 30, 0xf5d86a, 0.08)
      .setStrokeStyle(3, 0xf5d86a, 0.7)
      .setDepth(41);
    const beatRing = this.add
      .circle(STREET_GIG_X, PLAYER_GROUND_Y - 57, 30, 0xf5d86a, 0)
      .setStrokeStyle(5, 0xf5d86a, 1)
      .setDepth(42)
      .setScale(2.5)
      .setAlpha(0.18);
    const beatCountdown = this.add
      .text(STREET_GIG_X, PLAYER_GROUND_Y - 57, "3", {
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: "19px",
        color: "#f9e69a",
      })
      .setOrigin(0.5)
      .setDepth(43);
    const judgement = this.add
      .text(STREET_GIG_X, PLAYER_GROUND_Y - 142, "GET READY", {
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: "18px",
        color: "#ffe077",
        backgroundColor: "#132730",
        padding: { x: 9, y: 5 },
      })
      .setOrigin(0.5)
      .setDepth(44);

    const openingEnergy = Math.min(66, 30 + this.snapshot.gig.recruitedFans * 5);
    const openingGroove = Math.min(38, 12 + this.snapshot.gig.recruitedFans * 4);
    this.gigSession = {
      startedAt: this.time.now + 1400,
      beatMs: 60000 / STREET_GIG_BPM,
      totalBeats: STREET_GIG_BEATS,
      lastBeat: -1,
      judgedAccents: new Set(),
      groove: openingGroove,
      peakGroove: openingGroove,
      leftCrowd: openingEnergy,
      rightCrowd: openingEnergy,
      side: 1,
      perfect: 0,
      good: 0,
      missed: 0,
      streak: 0,
      bestStreak: 0,
      walkouts: 0,
      specialMoves: 0,
      tipCoins: 0,
      powerChordUnlocked: false,
      powerChordUsed: false,
      walkInIds: new Set(),
      walkedOutIds: new Set(),
      accentResults: new Map(),
      hud,
      grooveFill,
      leftFill,
      rightFill,
      beatRing,
      beatTarget,
      beatCountdown,
      accentPips,
      scoreText,
      moveText,
      judgement,
    };
    this.updateShowMeters();
    this.gameEvents.emit("focus", { locationId: null, label: "" });
  }

  triggerFlourish(): void {
    const session = this.gigSession;
    if (!session || session.groove < 35) {
      if (session) this.showJudgement("NEED 35 GROOVE", "#d6aaa0");
      return;
    }
    session.groove -= 35;
    session.specialMoves += 1;
    session.leftCrowd = Math.min(100, session.leftCrowd + 24);
    session.rightCrowd = Math.min(100, session.rightCrowd + 24);
    this.showJudgement("FLOURISH!", "#ffdf72");
    this.audio.playPerformanceCue("flourish");
    this.reactAudience(-1, "flourish");
    this.reactAudience(1, "flourish");
    this.dropTipCoin(session.side);
    this.tweens.add({
      targets: this.performanceGuitar,
      angle: { from: -12, to: 13 },
      scale: { from: 1.12, to: 1 },
      duration: 260,
      yoyo: true,
      ease: "Back.Out",
    });
    this.emitMusicBurst(8, 0xf6cf61);
    this.updateShowMeters();
  }

  triggerPowerChord(): void {
    const session = this.gigSession;
    if (!session) return;
    if (!session.powerChordUnlocked) {
      this.showJudgement(`${Math.max(0, 3 - session.perfect)} PERFECTS TO UNLOCK`, "#9bb2b2");
      return;
    }
    if (session.powerChordUsed) {
      this.showJudgement("POWER CHORD SPENT", "#9bb2b2");
      return;
    }

    session.powerChordUsed = true;
    session.specialMoves += 1;
    session.groove = Math.min(100, session.groove + 18);
    session.peakGroove = Math.max(session.peakGroove, session.groove);
    session.leftCrowd = Math.min(100, session.leftCrowd + 28);
    session.rightCrowd = Math.min(100, session.rightCrowd + 28);
    this.showJudgement("POWER CHORD!", "#fff19a");
    this.audio.playPerformanceCue("flourish");
    this.reactAudience(-1, "flourish");
    this.reactAudience(1, "flourish");
    this.attractWalkIn();
    this.dropTipCoin(-1);
    this.time.delayedCall(120, () => this.dropTipCoin(1));
    this.emitMusicBurst(14, 0xffe577);
    this.cameras.main.shake(180, 0.004);
    this.tweens.add({
      targets: this.performanceGuitar,
      angle: { from: -18, to: 18 },
      scale: { from: 1.25, to: 1 },
      duration: 360,
      yoyo: true,
      ease: "Back.Out",
    });
    this.updateShowMeters();
  }

  completeStreetEncounter(actorId: string): void {
    const actor = this.streetActors.find((item) => item.id === actorId);
    if (!actor) return;
    actor.resolved = true;
    actor.engaging = false;
    actor.warning?.setVisible(false);
    this.tweens.add({
      targets: actor.container,
      alpha: 0,
      duration: 320,
      ease: "Quad.Out",
      onComplete: () => {
        const bounds = getOpenWorldBounds();
        const reentryDistance = Math.max(520, this.cameras.main.width * 0.7);
        actor.container.x = Phaser.Math.Clamp(
          this.player.x - actor.direction * reentryDistance,
          bounds.minX + 85,
          bounds.maxX - 85,
        );
        this.tweens.add({
          targets: actor.container,
          alpha: 0.86,
          duration: 650,
          delay: 1200,
          ease: "Sine.Out",
        });
      },
    });
  }

  nudgePlayer(direction: number): void {
    if (this.menuOpen) return;
    if (this.gigSession) {
      this.setShowSide(direction < 0 ? -1 : 1);
      return;
    }
    const step = this.touchSprinting && this.snapshot.energy > 0 ? 22 : 14;
    this.player.x = Phaser.Math.Clamp(
      this.player.x + Phaser.Math.Clamp(direction, -1, 1) * step,
      this.movementMinX,
      this.movementMaxX,
    );
    this.playFootstep(this.time.now);
  }

  nudgePlayerDepth(_direction: number): void {
    // The legacy side-scrolling renderer intentionally has no depth axis.
  }

  triggerInteraction(): void {
    if (this.menuOpen) return;
    if (this.gigSession) {
      this.attemptShowHit();
      return;
    }
    if (this.focusedProspect) {
      this.offerFlyer(this.focusedProspect);
      return;
    }
    if (this.focusedLocation) {
      this.gameEvents.emit("interact", { locationId: this.focusedLocation });
    }
  }

  private offerFlyer(prospect: FlyerProspectVisual): void {
    const result = this.gameState.offerFlyer(prospect.id, prospect.acceptsFlyer);
    if (!result.ok) {
      this.gameEvents.emit("flyerResult", {
        accepted: false,
        message: result.message,
      });
      return;
    }

    const startX = this.player.x + (prospect.container.x < this.player.x ? -20 : 20);
    const flyer = this.add
      .rectangle(startX, PLAYER_GROUND_Y - 51, 18, 25, 0xf3e5b4)
      .setStrokeStyle(2, 0x26363c)
      .setDepth(46)
      .setAngle(prospect.container.x < this.player.x ? -12 : 12);
    const ink = this.add
      .rectangle(startX, PLAYER_GROUND_Y - 54, 10, 3, 0xc55849)
      .setDepth(47);
    this.tweens.add({
      targets: [flyer, ink],
      x: prospect.container.x,
      y: PLAYER_GROUND_Y - 49,
      angle: 0,
      duration: 300,
      ease: "Quad.Out",
      onComplete: () => {
        flyer.destroy();
        ink.destroy();
        prospect.reaction.setVisible(true).setAlpha(1).setY(-119);
        if (prospect.acceptsFlyer) {
          prospect.musicBadge.setVisible(true).setScale(0.4);
          this.tweens.add({
            targets: prospect.musicBadge,
            scale: 1,
            duration: 420,
            ease: "Back.Out",
          });
        }
        this.tweens.add({
          targets: prospect.reaction,
          y: -130,
          alpha: 0,
          delay: 850,
          duration: 520,
          onComplete: () => prospect.reaction.setVisible(false),
        });
      },
    });
    this.gameEvents.emit("flyerResult", {
      accepted: prospect.acceptsFlyer,
      message: result.message,
    });
  }

  private setShowSide(side: -1 | 1): void {
    const session = this.gigSession;
    if (!session) return;
    session.side = side;
    this.player.scaleX = side;
    const targetX = STREET_GIG_X + side * 30;
    this.tweens.add({
      targets: this.player,
      x: targetX,
      duration: 150,
      ease: "Sine.Out",
    });
    this.updateShowMeters();
  }

  private attemptShowHit(): void {
    const session = this.gigSession;
    if (!session) return;
    const elapsed = this.time.now - session.startedAt;
    if (elapsed < 0) return;
    const accentSpan = session.beatMs * 4;
    const nearestAccent = Phaser.Math.Clamp(
      Math.round(elapsed / accentSpan) * 4,
      4,
      session.totalBeats - 4,
    );
    const distance = Math.abs(elapsed - nearestAccent * session.beatMs);
    if (session.judgedAccents.has(nearestAccent)) {
      this.showJudgement("HOLD...", "#a8c5c4");
      return;
    }
    if (distance > 290) {
      session.groove = Math.max(0, session.groove - 3);
      session.streak = 0;
      this.showJudgement(
        elapsed < nearestAccent * session.beatMs ? "TOO EARLY · WATCH THE RING" : "TOO LATE",
        "#e69a8d",
      );
      this.audio.playPerformanceCue("miss");
      this.cameras.main.shake(70, 0.0015);
      this.updateShowMeters();
      return;
    }

    session.judgedAccents.add(nearestAccent);
    const perfect = distance <= 135;
    const gain = perfect ? 18 : 11;
    session.groove = Math.min(100, session.groove + gain);
    session.peakGroove = Math.max(session.peakGroove, session.groove);
    session.streak += 1;
    session.bestStreak = Math.max(session.bestStreak, session.streak);
    if (session.side < 0) {
      session.leftCrowd = Math.min(100, session.leftCrowd + (perfect ? 19 : 12));
      session.rightCrowd = Math.max(0, session.rightCrowd - 2);
    } else {
      session.rightCrowd = Math.min(100, session.rightCrowd + (perfect ? 19 : 12));
      session.leftCrowd = Math.max(0, session.leftCrowd - 2);
    }
    if (perfect) {
      session.perfect += 1;
      if (session.perfect >= 3 && !session.powerChordUnlocked) {
        session.powerChordUnlocked = true;
        this.time.delayedCall(420, () => this.showJudgement("POWER CHORD UNLOCKED · E", "#fff19a"));
      }
    } else {
      session.good += 1;
    }
    this.setAccentResult(nearestAccent, perfect ? "perfect" : "good");
    this.showJudgement(
      perfect ? `PERFECT! · ${session.streak} STREAK` : `GOOD · ${session.streak} STREAK`,
      perfect ? "#ffe36f" : "#91d9c8",
    );
    this.audio.playPerformanceCue(perfect ? "perfect" : "good");
    this.reactAudience(session.side, perfect ? "perfect" : "good");
    if (perfect) {
      this.dropTipCoin(session.side);
      this.cameras.main.shake(70, 0.0015);
    }
    if ([3, 6, 9].includes(session.streak)) this.attractWalkIn();
    this.emitMusicBurst(perfect ? 6 : 3, perfect ? 0xf6d25f : 0x75c5b6);
    this.tweens.add({
      targets: this.performanceGuitar,
      angle: session.side * (perfect ? 8 : 4),
      duration: 90,
      yoyo: true,
      ease: "Quad.Out",
    });
    this.updateShowMeters();
  }

  private showJudgement(text: string, color: string): void {
    const judgement = this.gigSession?.judgement;
    if (!judgement) return;
    judgement.setText(text).setColor(color).setAlpha(1).setScale(0.75).setY(PLAYER_GROUND_Y - 142);
    this.tweens.killTweensOf(judgement);
    this.tweens.add({
      targets: judgement,
      scale: 1,
      y: PLAYER_GROUND_Y - 154,
      duration: 220,
      ease: "Back.Out",
      onComplete: () => {
        this.tweens.add({
          targets: judgement,
          alpha: 0,
          delay: 340,
          duration: 260,
        });
      },
    });
  }

  private setAccentResult(accent: number, result: "perfect" | "good" | "missed"): void {
    const session = this.gigSession;
    if (!session) return;
    session.accentResults.set(accent, result);
    const pip = session.accentPips[accent / 4 - 1];
    if (!pip) return;
    const color = result === "perfect" ? 0xffdf65 : result === "good" ? 0x7bd0c0 : 0xd46f62;
    pip.setFillStyle(color).setStrokeStyle(2, color).setAlpha(1).setScale(1.2);
    this.tweens.add({ targets: pip, scale: 1, duration: 180, ease: "Back.Out" });
  }

  private liveAudience(): FlyerProspectVisual[] {
    const session = this.gigSession;
    if (!session) return [];
    const recruited = new Set(this.snapshot.gig.recruitedPeople);
    return this.flyerProspects.filter(
      (prospect) =>
        (recruited.has(prospect.id) || session.walkInIds.has(prospect.id)) &&
        !session.walkedOutIds.has(prospect.id),
    );
  }

  private reactAudience(side: -1 | 1, reaction: "good" | "perfect" | "flourish" | "miss"): void {
    const text =
      reaction === "flourish" ? "★!" : reaction === "perfect" ? "★" : reaction === "miss" ? "…" : "!";
    const color = reaction === "miss" ? "#d69a8e" : reaction === "good" ? "#91d9c8" : "#ffe36f";
    this.liveAudience()
      .filter((prospect) => (prospect.container.x < STREET_GIG_X ? -1 : 1) === side)
      .forEach((prospect, index) => {
        this.tweens.killTweensOf(prospect.reaction);
        prospect.reaction
          .setText(text)
          .setColor(color)
          .setVisible(true)
          .setAlpha(1)
          .setY(-120 - (index % 2) * 6);
        this.tweens.add({
          targets: prospect.reaction,
          y: prospect.reaction.y - 15,
          alpha: 0,
          duration: 620,
          delay: index * 45,
          ease: "Quad.Out",
          onComplete: () => prospect.reaction.setVisible(false),
        });
        this.tweens.add({
          targets: prospect.figure,
          scaleY: reaction === "flourish" ? 1.16 : reaction === "miss" ? 0.94 : 1.1,
          duration: 100,
          yoyo: true,
          ease: "Back.Out",
        });
      });
  }

  private attractWalkIn(): void {
    const session = this.gigSession;
    if (!session || session.walkInIds.size >= 3) return;
    const recruited = new Set(this.snapshot.gig.recruitedPeople);
    const prospect = this.flyerProspects.find(
      (candidate) =>
        !recruited.has(candidate.id) &&
        !session.walkInIds.has(candidate.id) &&
        !session.walkedOutIds.has(candidate.id),
    );
    if (!prospect) return;
    const side: -1 | 1 = session.leftCrowd <= session.rightCrowd ? -1 : 1;
    session.walkInIds.add(prospect.id);
    const destinationX = STREET_GIG_X + side * (225 - session.walkInIds.size * 13);
    prospect.container
      .setVisible(true)
      .setAlpha(0)
      .setPosition(destinationX + side * 55, PLAYER_GROUND_Y + 10 + (session.walkInIds.size % 2) * 6)
      .setDepth(27 + (session.walkInIds.size % 2));
    prospect.figure.setScale(side < 0 ? 1 : -1, 1);
    prospect.reaction.setText("♫").setColor("#ffe36f").setVisible(true).setAlpha(1);
    this.tweens.add({
      targets: prospect.container,
      x: destinationX,
      alpha: 1,
      duration: 520,
      ease: "Back.Out",
    });
    this.tweens.add({
      targets: prospect.reaction,
      y: -138,
      alpha: 0,
      duration: 800,
      onComplete: () => prospect.reaction.setVisible(false),
    });
    this.time.delayedCall(180, () => this.showJudgement("A WALK-IN JOINS!", "#ffe36f"));
    this.audio.play("notice");
  }

  private maybeWalkOut(side: -1 | 1): void {
    const session = this.gigSession;
    if (!session || session.lastBeat < 12) return;
    const energy = side < 0 ? session.leftCrowd : session.rightCrowd;
    if (energy > 8) return;
    const recruited = new Set(this.snapshot.gig.recruitedPeople);
    const prospect = this.liveAudience().find(
      (candidate) =>
        recruited.has(candidate.id) &&
        (candidate.container.x < STREET_GIG_X ? -1 : 1) === side,
    );
    if (!prospect) return;

    session.walkedOutIds.add(prospect.id);
    session.walkouts += 1;
    session.streak = 0;
    if (side < 0) session.leftCrowd = 16;
    else session.rightCrowd = 16;
    prospect.reaction.setText("NOPE").setColor("#ef9b8d").setVisible(true).setAlpha(1);
    this.tweens.add({
      targets: prospect.container,
      x: prospect.container.x + side * 170,
      alpha: 0,
      duration: 900,
      ease: "Quad.In",
      onComplete: () => prospect.container.setVisible(false),
    });
    this.showJudgement(`${side < 0 ? "LEFT" : "RIGHT"} SIDE LOST SOMEONE`, "#ef9b8d");
    this.audio.playPerformanceCue("miss");
  }

  private dropTipCoin(side: -1 | 1): void {
    const session = this.gigSession;
    if (!session || session.tipCoins >= this.gigVenue.caseCoins.length) return;
    const target = this.gigVenue.caseCoins[session.tipCoins];
    session.tipCoins += 1;
    const coin = this.add
      .circle(STREET_GIG_X + side * 155, PLAYER_GROUND_Y - 82, 5, 0xf4d260)
      .setStrokeStyle(2, 0x684d20)
      .setDepth(48);
    this.tweens.add({
      targets: coin,
      x: STREET_GIG_X + target.x,
      y: PLAYER_GROUND_Y + target.y,
      angle: side * 540,
      duration: 520,
      ease: "Bounce.In",
      onComplete: () => {
        target.setAlpha(1);
        coin.destroy();
        this.audio.playPerformanceCue("coin");
      },
    });
  }

  private emitMusicBurst(count: number, color: number): void {
    for (let index = 0; index < count; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const note = this.add
        .text(STREET_GIG_X + side * (10 + index * 4), PLAYER_GROUND_Y - 76, index % 3 === 0 ? "♫" : "♪", {
          fontFamily: "Georgia, serif",
          fontSize: `${15 + (index % 3) * 3}px`,
          color: `#${color.toString(16).padStart(6, "0")}`,
        })
        .setOrigin(0.5)
        .setDepth(43);
      this.tweens.add({
        targets: note,
        x: note.x + side * (46 + index * 10),
        y: note.y - 48 - (index % 3) * 14,
        alpha: 0,
        angle: side * 18,
        duration: 720 + index * 45,
        ease: "Quad.Out",
        onComplete: () => note.destroy(),
      });
    }
  }

  private updateShowMeters(): void {
    const session = this.gigSession;
    if (!session) return;
    session.grooveFill.displayWidth = Math.max(1, 156 * session.groove / 100);
    session.leftFill.displayWidth = Math.max(1, 126 * session.leftCrowd / 100);
    session.rightFill.displayWidth = Math.max(1, 126 * session.rightCrowd / 100);
    session.leftFill.setFillStyle(
      session.leftCrowd < 20 ? 0xd96e61 : session.side < 0 ? 0xa7eadc : 0x548e89,
    );
    session.rightFill.setFillStyle(
      session.rightCrowd < 20 ? 0xd96e61 : session.side > 0 ? 0xffa18d : 0xa0584c,
    );
    session.scoreText.setText(
      `${session.perfect} PERFECT · ${session.good} GOOD · ${session.missed} MISS · STREAK ${session.streak}`,
    );
    if (session.powerChordUnlocked && !session.powerChordUsed) {
      session.moveText.setText("E POWER CHORD READY!  |  SHIFT FLOURISH · 35").setColor("#ffe36f");
    } else if (session.groove >= 35) {
      session.moveText
        .setText(`SHIFT FLOURISH READY!  |  ${session.powerChordUsed ? "POWER CHORD SPENT" : "E POWER CHORD · 3 PERFECTS"}`)
        .setColor("#91d9c8");
    } else {
      session.moveText
        .setText(
          `SHIFT FLOURISH · ${Math.ceil(Math.max(0, 35 - session.groove))} MORE GROOVE  |  ${session.powerChordUsed ? "POWER CHORD SPENT" : "E POWER CHORD · 3 PERFECTS"}`,
        )
        .setColor("#8fa7a8");
    }
  }

  private pulseShowBeat(accent: boolean, beat: number): void {
    const session = this.gigSession;
    if (!session) return;
    session.beatTarget
      .setStrokeStyle(accent ? 6 : 3, accent ? 0xffda62 : 0x79b8b0, accent ? 1 : 0.58)
      .setScale(accent ? 0.82 : 0.94)
      .setAlpha(1);
    this.tweens.killTweensOf(session.beatTarget);
    this.tweens.add({
      targets: session.beatTarget,
      scale: 1,
      alpha: accent ? 0.72 : 0.38,
      duration: accent ? 220 : 160,
      ease: "Back.Out",
    });
    session.beatCountdown
      .setText(accent ? "HIT!" : beat === 0 ? "READY" : String(4 - (beat % 4)))
      .setColor(accent ? "#ffe36f" : "#b7d6d1")
      .setScale(accent ? 1.3 : 0.9)
      .setAlpha(1);
    this.tweens.add({
      targets: session.beatCountdown,
      scale: 1,
      duration: 150,
      ease: "Back.Out",
    });
    if (accent) {
      const pip = session.accentPips[beat / 4 - 1];
      pip?.setStrokeStyle(2, 0xffdf65).setScale(1.25);
      if (pip) this.tweens.add({ targets: pip, scale: 1, duration: 220, ease: "Back.Out" });
    }
    this.audio.playPerformanceCue(accent ? "accent" : "beat");
    this.gigVenue.lights.forEach((light, index) => {
      light.setAlpha(accent && index % 2 === 0 ? 1 : 0.58);
    });
  }

  private updateBeatCue(elapsed: number): void {
    const session = this.gigSession;
    if (!session || elapsed < 0) return;
    const beatPosition = elapsed / session.beatMs;
    const cycle = beatPosition % 4;
    const distanceFromAccent = Math.min(cycle, 4 - cycle);
    const finalBeatApproach = cycle >= 3;
    if (finalBeatApproach) {
      const remaining = 4 - cycle;
      session.beatRing
        .setScale(1 + remaining * 1.6)
        .setAlpha(0.35 + (1 - remaining) * 0.65)
        .setStrokeStyle(5, 0xffdf65, 1);
    } else if (distanceFromAccent < 0.2) {
      session.beatRing.setScale(1).setAlpha(0.95).setStrokeStyle(6, 0xffdf65, 1);
    } else {
      session.beatRing.setScale(2.5).setAlpha(0.12).setStrokeStyle(3, 0x79b8b0, 0.55);
    }
  }

  private updateStreetGig(time: number): void {
    const session = this.gigSession;
    if (!session) return;
    const elapsed = time - session.startedAt;
    if (elapsed < 0) {
      const count = Math.max(1, Math.ceil(-elapsed / 470));
      session.beatCountdown.setText(String(count)).setColor("#ffe36f");
      return;
    }
    this.updateBeatCue(elapsed);
    const beat = Math.floor(elapsed / session.beatMs);
    if (beat > session.lastBeat) {
      for (let nextBeat = session.lastBeat + 1; nextBeat <= beat; nextBeat += 1) {
        if (nextBeat < 0) continue;
        const accent = nextBeat > 0 && nextBeat % 4 === 0;
        this.pulseShowBeat(accent, nextBeat);
        session.leftCrowd = Math.max(0, session.leftCrowd - (accent ? 2.4 : 0.6));
        session.rightCrowd = Math.max(0, session.rightCrowd - (accent ? 2.4 : 0.6));
        if (
          accent &&
          nextBeat <= session.totalBeats - 4 &&
          !session.judgedAccents.has(nextBeat - 4) &&
          nextBeat - 4 >= 4
        ) {
          session.judgedAccents.add(nextBeat - 4);
          session.missed += 1;
          session.streak = 0;
          session.groove = Math.max(0, session.groove - 12);
          this.setAccentResult(nextBeat - 4, "missed");
          this.showJudgement("MISSED · CROWD IS COOLING", "#d9897a");
          this.audio.playPerformanceCue("miss");
          this.reactAudience(session.side, "miss");
        }
        if (accent) {
          this.maybeWalkOut(-1);
          this.maybeWalkOut(1);
        }
      }
      session.lastBeat = beat;
      this.updateShowMeters();
    }

    this.liveAudience().forEach((prospect, index) => {
      const onLeft = prospect.container.x < STREET_GIG_X;
      const energy = onLeft ? session.leftCrowd : session.rightCrowd;
      const bounce = Math.sin(time / Math.max(95, 240 - energy) + index) * (2 + energy / 24);
      prospect.figure.y = Math.min(0, bounce);
      prospect.figure.setAlpha(0.58 + energy / 240);
      prospect.leftLeg.setAngle(Math.sin(time / 150 + index) * (energy / 12));
      prospect.rightLeg.setAngle(-prospect.leftLeg.angle);
    });

    if (elapsed >= session.totalBeats * session.beatMs) this.finishStreetGig();
  }

  private finishStreetGig(): void {
    const session = this.gigSession;
    if (!session) return;
    const finalAccent = session.totalBeats - 4;
    if (!session.judgedAccents.has(finalAccent)) {
      session.missed += 1;
      this.setAccentResult(finalAccent, "missed");
    }
    const metrics: GigPerformanceMetrics = {
      perfect: session.perfect,
      good: session.good,
      missed: session.missed,
      peakGroove: session.peakGroove,
      leftCrowd: session.leftCrowd,
      rightCrowd: session.rightCrowd,
      walkIns: session.walkInIds.size,
      walkouts: session.walkouts,
      specialMoves: session.specialMoves,
      bestStreak: session.bestStreak,
    };
    session.hud.destroy(true);
    session.beatRing.destroy();
    session.beatTarget.destroy();
    session.beatCountdown.destroy();
    session.judgement.destroy();
    this.flyerProspects.forEach((prospect) => prospect.figure.setAlpha(1));
    this.gigSession = null;
    this.audio.endPerformance();
    const result = this.gameState.completeStreetGig(metrics);
    const gigResult = this.gameState.snapshot().gig.lastResult;
    if (!result.ok || !gigResult) return;
    this.performanceGuitar.setVisible(false);
    this.gigVenue.caseCoins.forEach((coin, index) => {
      if (index >= Math.min(gigResult.tips, this.gigVenue.caseCoins.length)) return;
      coin.setAlpha(0).setY(coin.y - 25);
      this.tweens.add({
        targets: coin,
        alpha: 1,
        y: coin.y + 25,
        duration: 360,
        delay: index * 75,
        ease: "Bounce.Out",
      });
    });
    this.emitMusicBurst(10, gigResult.score >= 55 ? 0xf6d25f : 0x8a9ca0);
    this.gameEvents.emit("gigComplete", { result: gigResult });
  }

  returnHome(): void {
    this.player.x = LOCATION_BY_ID.apartment.x + 10;
    this.player.y = PLAYER_GROUND_Y;
    this.cameras.main.centerOn(this.player.x, GAME_HEIGHT / 2);
  }

  update(time: number, delta: number): void {
    if (!this.player || !this.keys) return;
    this.applyAtmosphere(delta);
    if (this.gigSession) {
      this.updateStreetGig(time);
      return;
    }
    const keyboardDirection =
      (this.keys.left.isDown || this.keys.a.isDown ? -1 : 0) +
      (this.keys.right.isDown || this.keys.d.isDown ? 1 : 0);
    const direction = this.menuOpen ? 0 : Phaser.Math.Clamp(keyboardDirection + this.touchDirection, -1, 1);
    const wantsToSprint =
      direction !== 0 &&
      !this.menuOpen &&
      (this.keys.sprint.isDown || this.touchSprinting);
    let sprinting = wantsToSprint && this.snapshot.energy > 0;

    if (sprinting) {
      this.sprintEnergyAccumulator += delta;
      while (this.sprintEnergyAccumulator >= SPRINT_ENERGY_TICK_MS) {
        this.sprintEnergyAccumulator -= SPRINT_ENERGY_TICK_MS;
        if (!this.gameState.spendEnergy(1)) {
          sprinting = false;
          break;
        }
      }
    } else {
      this.sprintEnergyAccumulator = 0;
    }

    let elapsedGameMinutes = 0;
    if (!this.menuOpen) {
      this.ambientTimeAccumulator += Math.min(delta, 250);
      const ambientTicks = Math.floor(
        this.ambientTimeAccumulator / AMBIENT_TIME_TICK_MS,
      );
      if (ambientTicks > 0) {
        this.ambientTimeAccumulator -= ambientTicks * AMBIENT_TIME_TICK_MS;
        elapsedGameMinutes += ambientTicks * AMBIENT_MINUTES_PER_TICK;
      }
    } else {
      this.ambientTimeAccumulator = 0;
    }

    if (direction !== 0 && !this.menuOpen) {
      this.travelTimeAccumulator += delta;
      const travelTicks = Math.floor(
        this.travelTimeAccumulator / TRAVEL_TICK_MS,
      );
      if (travelTicks > 0) {
        this.travelTimeAccumulator -= travelTicks * TRAVEL_TICK_MS;
        elapsedGameMinutes += travelTicks * TRAVEL_MINUTES_PER_TICK;
      }
    } else {
      this.travelTimeAccumulator = 0;
    }
    if (elapsedGameMinutes > 0) {
      this.gameState.advanceTime(elapsedGameMinutes);
    }

    if (direction !== 0) {
      const movementSpeed = sprinting ? SPRINT_SPEED : WALK_SPEED;
      this.player.x = Phaser.Math.Clamp(
        this.player.x + direction * movementSpeed * delta,
        this.movementMinX,
        this.movementMaxX,
      );
      this.player.scaleX = direction < 0 ? -1 : 1;
      this.playerSprite.anims.timeScale = sprinting ? 1.35 : 1;
      this.playerSprite.play(PLAYER_WALK_ANIMATION, true);
      this.player.y = PLAYER_GROUND_Y;
      this.playFootstep(time);
    } else {
      this.playerSprite.stop();
      this.playerSprite.setFrame(0);
      this.player.y = PLAYER_GROUND_Y;
    }
    this.player.setDepth(27);

    if (
      !this.menuOpen &&
      (Phaser.Input.Keyboard.JustDown(this.keys.interact) ||
        Phaser.Input.Keyboard.JustDown(this.keys.space))
    ) {
      this.triggerInteraction();
    }

    this.updateFlyerCrowd(time, delta);
    this.updateStreetCrowd(time, delta);
    this.updateFocus();
    this.updateOpportunityCues(time);
  }

  private updateStreetCrowd(time: number, delta: number): void {
    const bounds = getOpenWorldBounds();

    for (const actor of this.streetActors) {
      const active = isStreetEncounterActive(actor.definition, this.snapshot);
      actor.container.setVisible(active);
      if (!active) {
        actor.warning?.setVisible(false);
        continue;
      }

      if (actor.definition.kind === "phone-walker") {
        const lanePhase = Math.floor((time + actor.phase) / 5200) % 2;
        actor.lane = lanePhase === 0 ? actor.definition.lane : actor.definition.lane === 0 ? 1 : 0;
      }
      actor.container.y = Phaser.Math.Linear(
        actor.container.y,
        SIDEWALK_LANES[actor.lane],
        Math.min(1, delta * 0.006),
      );
      actor.container.setDepth(22 + actor.lane * 4);

      const distanceX = this.player.x - actor.container.x;
      const sameLane = Math.abs(this.player.y - actor.container.y) < 23;
      if (!this.menuOpen) {
        if (
          !actor.resolved &&
          actor.definition.behavior === "intercept" &&
          sameLane &&
          Math.abs(distanceX) < actor.definition.noticeDistance
        ) {
          actor.direction = distanceX < 0 ? -1 : 1;
          actor.container.x += actor.direction * actor.definition.speed * (delta / 1000);
        } else if (actor.definition.behavior === "patrol" || actor.resolved) {
          actor.container.x += actor.direction * actor.definition.speed * (delta / 1000);
        }
      }

      const wrapPadding = 85;
      if (actor.container.x < bounds.minX + wrapPadding) {
        actor.container.x = bounds.maxX - wrapPadding;
      } else if (actor.container.x > bounds.maxX - wrapPadding) {
        actor.container.x = bounds.minX + wrapPadding;
      }

      const walking = !this.menuOpen && actor.definition.speed > 0;
      const stride = walking ? Math.sin((time + actor.phase) / (actor.definition.kind === "cyclist" ? 45 : 105)) * 13 : 0;
      actor.leftLeg?.setAngle(stride);
      actor.rightLeg?.setAngle(-stride);
      actor.wheels?.forEach((wheel, index) =>
        wheel.setAngle((time / 4) * actor.direction + index * 18),
      );

      const currentDistance = Math.abs(this.player.x - actor.container.x);
      const shouldWarn =
        !actor.resolved &&
        sameLane &&
        (actor.definition.kind === "cyclist"
          ? currentDistance < 260
          : actor.definition.kind === "panhandler" &&
            currentDistance < actor.definition.noticeDistance);
      actor.warning?.setVisible(Boolean(shouldWarn && !this.menuOpen));

      if (
        !this.menuOpen &&
        !actor.resolved &&
        !actor.engaging &&
        sameLane &&
        currentDistance < actor.definition.triggerDistance
      ) {
        actor.engaging = true;
        this.gameEvents.emit("streetEncounter", {
          actorId: actor.id,
          encounterId: actor.definition.id,
        });
      }
    }
  }

  private updateFlyerCrowd(time: number, delta: number): void {
    const phase = this.snapshot.gig.phase;
    const approached = new Set(this.snapshot.gig.approachedPeople);
    const recruited = new Set(this.snapshot.gig.recruitedPeople);
    const bounds = getOpenWorldBounds();

    this.flyerProspects.forEach((prospect, index) => {
      if (phase === "unbooked") {
        prospect.container.setVisible(false);
        return;
      }
      if (phase === "complete") {
        prospect.container.setVisible(recruited.has(prospect.id));
        prospect.leftLeg.setAngle(0);
        prospect.rightLeg.setAngle(0);
        return;
      }
      if (phase !== "promoting") return;

      prospect.container.setVisible(true);
      const slowedByFlyer = approached.has(prospect.id) ? 0.58 : 1;
      const waitingForPitch = this.focusedProspect?.id === prospect.id;
      if (!this.menuOpen && !waitingForPitch) {
        prospect.container.x +=
          prospect.direction * prospect.speed * slowedByFlyer * (delta / 1000);
      }
      if (prospect.container.x < bounds.minX + 100) {
        prospect.container.x = bounds.maxX - 100;
      } else if (prospect.container.x > bounds.maxX - 100) {
        prospect.container.x = bounds.minX + 100;
      }
      prospect.figure.setScale(prospect.direction, 1);
      const stride = this.menuOpen || waitingForPitch
        ? 0
        : Math.sin((time + prospect.phase) / 118) * 11 * slowedByFlyer;
      prospect.leftLeg.setAngle(stride);
      prospect.rightLeg.setAngle(-stride);
      prospect.figure.y = Math.abs(Math.sin((time + prospect.phase) / 236)) * -1.5;
      prospect.container.setDepth(25 + (index % 2));
    });
  }

  private playFootstep(time: number): void {
    if (time - this.lastFootstepAt < 310) return;
    this.audio.play("footstep");
    this.lastFootstepAt = time;
  }

  private updateFocus(): void {
    let nearestProspect: { prospect: FlyerProspectVisual; distance: number } | null = null;
    if (
      this.snapshot.gig.phase === "promoting" &&
      this.snapshot.gig.flyersRemaining > 0
    ) {
      const approached = new Set(this.snapshot.gig.approachedPeople);
      for (const prospect of this.flyerProspects) {
        if (!prospect.container.visible || approached.has(prospect.id)) continue;
        const distance = Math.abs(this.player.x - prospect.container.x);
        if (
          distance <= FLYER_INTERACTION_DISTANCE &&
          (!nearestProspect || distance < nearestProspect.distance)
        ) {
          nearestProspect = { prospect, distance };
        }
      }
    }

    let nearest: { id: LocationId; distance: number } | null = null;
    if (!nearestProspect) {
      for (const location of LOCATIONS.filter(
        (item) => item.interactive && this.gameState.isLocationUnlocked(item.id),
      )) {
        const distance = Math.abs(this.player.x - location.x);
        if (distance <= location.interactionRadius && (!nearest || distance < nearest.distance)) {
          nearest = { id: location.id, distance };
        }
      }
    }

    const nextFocus = nearest?.id ?? null;
    const nextProspect = nearestProspect?.prospect ?? null;
    const nextKey = nextProspect ? `prospect:${nextProspect.id}` : nextFocus ?? "none";
    if (nextKey !== this.focusKey) {
      if (this.focusedLocation) {
        this.locationVisuals.get(this.focusedLocation)?.highlight.setVisible(false);
      }
      this.focusKey = nextKey;
      this.focusedLocation = nextFocus;
      this.focusedProspect = nextProspect;
      if (nextFocus) this.locationVisuals.get(nextFocus)?.highlight.setVisible(true);
      this.coffeeBubble.setVisible(nextFocus === "coffee" && !this.menuOpen);
      this.gameEvents.emit("focus", {
        locationId: nextFocus,
        label: nextProspect
          ? "E / SPACE · HAND OVER A FLYER"
          : nextFocus
            ? `E / SPACE · ${LOCATION_BY_ID[nextFocus].name}`
            : "",
      });
    }
  }

  private updateOpportunityCues(time: number): void {
    if (this.snapshot.gig.phase === "promoting" || this.snapshot.gig.phase === "performing") {
      this.opportunityMarkers.forEach((marker) => marker.setVisible(false));
      if (this.lastCueKey !== "gig") {
        this.lastCueKey = "gig";
        this.gameEvents.emit("cue", { opportunity: null, direction: null });
      }
      return;
    }

    const active = this.gameState.opportunities.active();
    const selected = active[0] ?? null;
    if (selected) {
      const target = LOCATION_BY_ID[selected.targetLocationId];
      const direction = getTargetDirection(
        target.x,
        this.cameras.main.worldView.x,
        this.cameras.main.width,
      );

      active.forEach((opportunity, index) => {
        const marker = this.ensureOpportunityMarker(
          opportunity.id,
          opportunity.targetLocationId,
        );
        const targetDirection = getTargetDirection(
          LOCATION_BY_ID[opportunity.targetLocationId].x,
          this.cameras.main.worldView.x,
          this.cameras.main.width,
        );
        marker.setVisible(targetDirection === "visible");
        marker.y =
          (this.locationVisuals.get(opportunity.targetLocationId)?.markerY ?? 200) +
          Math.sin(time / 240 + index) * 8;
        marker.setScale(1 + Math.sin(time / 180 + index) * 0.08);
      });

      const cueKey = `${selected.id}:${direction}`;
      if (cueKey !== this.lastCueKey) {
        this.lastCueKey = cueKey;
        this.gameEvents.emit("cue", { opportunity: selected, direction });
      }
      return;
    }

    if (this.lastCueKey !== "none") {
      this.lastCueKey = "none";
      this.gameEvents.emit("cue", { opportunity: null, direction: null });
    }
  }

  shutdown(): void {
    this.unsubscribeState?.();
  }
}
