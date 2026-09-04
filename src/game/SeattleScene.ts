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
import type { GameSnapshot, LocationId } from "./types";

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

const SIDEWALK_LANES = [STREET_Y - 34, STREET_Y + 2] as const;
const PLAYER_GROUND_Y = SIDEWALK_LANES[1];
const PLAYER_WALK_TEXTURE = "player-walk";
const PLAYER_WALK_ANIMATION = "player-walk-animation";
const PLAYER_BASELINE_OFFSET = 5;
const STREET_CROWD_ENABLED = false;

export class SeattleScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private playerSprite!: Phaser.GameObjects.Sprite;
  private carriedCoffee!: Phaser.GameObjects.Container;
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
    const tapInteract = (event: KeyboardEvent): void => {
      if (!event.repeat) this.triggerInteraction();
    };
    keyboard.on("keydown-E", tapInteract);
    keyboard.on("keydown-SPACE", tapInteract);

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
    this.player = this.add
      .container(
        LOCATION_BY_ID.apartment.x + 10,
        PLAYER_GROUND_Y,
        [shadow, this.playerSprite, this.carriedCoffee],
      )
      .setDepth(26);
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
    this.touchDirection = Phaser.Math.Clamp(direction, -1, 1);
  }

  setTouchSprinting(sprinting: boolean): void {
    this.touchSprinting = sprinting;
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
    const step = this.touchSprinting && this.snapshot.energy > 0 ? 22 : 14;
    this.player.x = Phaser.Math.Clamp(
      this.player.x + Phaser.Math.Clamp(direction, -1, 1) * step,
      this.movementMinX,
      this.movementMaxX,
    );
    this.playFootstep(this.time.now);
  }

  triggerInteraction(): void {
    if (!this.menuOpen && this.focusedLocation) {
      this.gameEvents.emit("interact", { locationId: this.focusedLocation });
    }
  }

  returnHome(): void {
    this.player.x = LOCATION_BY_ID.apartment.x + 10;
    this.player.y = PLAYER_GROUND_Y;
    this.cameras.main.centerOn(this.player.x, GAME_HEIGHT / 2);
  }

  update(time: number, delta: number): void {
    if (!this.player || !this.keys) return;
    this.applyAtmosphere(delta);
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

  private playFootstep(time: number): void {
    if (time - this.lastFootstepAt < 310) return;
    this.audio.play("footstep");
    this.lastFootstepAt = time;
  }

  private updateFocus(): void {
    let nearest: { id: LocationId; distance: number } | null = null;
    for (const location of LOCATIONS.filter(
      (item) => item.interactive && this.gameState.isLocationUnlocked(item.id),
    )) {
      const distance = Math.abs(this.player.x - location.x);
      if (distance <= location.interactionRadius && (!nearest || distance < nearest.distance)) {
        nearest = { id: location.id, distance };
      }
    }

    const nextFocus = nearest?.id ?? null;
    if (nextFocus !== this.focusedLocation) {
      if (this.focusedLocation) {
        this.locationVisuals.get(this.focusedLocation)?.highlight.setVisible(false);
      }
      this.focusedLocation = nextFocus;
      if (nextFocus) this.locationVisuals.get(nextFocus)?.highlight.setVisible(true);
      this.coffeeBubble.setVisible(nextFocus === "coffee" && !this.menuOpen);
      this.gameEvents.emit("focus", {
        locationId: nextFocus,
        label: nextFocus ? `E / SPACE · ${LOCATION_BY_ID[nextFocus].name}` : "",
      });
    }
  }

  private updateOpportunityCues(time: number): void {
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
