import * as THREE from "three";
import type { AudioManager } from "../audio";
import type { GameEvents } from "../game/events";
import {
  AMBIENT_MINUTES_PER_TICK,
  AMBIENT_TIME_TICK_MS,
  SPRINT_ENERGY_TICK_MS,
  TRAVEL_MINUTES_PER_TICK,
  TRAVEL_TICK_MS,
} from "../game/movement";
import type { SceneController } from "../game/SceneController";
import type { GameState } from "../game/state";
import { STREET_GIG_BEATS, STREET_GIG_BPM } from "../game/gig";
import type { GameSnapshot, GigPerformanceMetrics, LocationId } from "../game/types";
import {
  nextCrowdRollDelay,
  rollCrowd,
  rollDisposition,
  rollGoal,
  type PedestrianDisposition,
  type PedestrianGoal,
  type PedestrianTuning,
  type PedestrianTuningStore,
} from "../game/pedestrians";
import {
  CharacterFactory,
  type CharacterPose,
  type CharacterRig,
  type CharacterVariant,
  type HeldProp,
} from "./CharacterFactory";
import { InteractionIndicator } from "./InteractionIndicator";
import { StreetSectionFactory, type BlockWorld } from "./StreetSectionFactory";
import { TimeOfDaySystem } from "./TimeOfDaySystem";
import { WeatherSystem } from "./WeatherSystem";
import { box, createIcon, createLabel, disposeObject, material } from "./visual";
import { advanceOnGround } from "./pedestrianMotion";
import { moveWithSliding, nearestWithin, normalizedMovement } from "./worldLogic";

type PedestrianActivity =
  | "walking"
  | "running"
  | "chatting"
  | "waiting"
  | "phone"
  | "sitting"
  | "window-shopping"
  | "entering"
  | "inside"
  | "exiting";

type FlyerReaction = "accept" | "decline" | "angry";

interface Pedestrian {
  id: string;
  rig: CharacterRig;
  active: boolean;
  speed: number;
  destination: THREE.Vector3;
  phase: number;
  paused: boolean;
  recruited: boolean;
  accepts: boolean;
  reaction: THREE.Sprite;
  activityIcon: THREE.Sprite;
  inShow: boolean;
  disposition: PedestrianDisposition;
  goal: PedestrianGoal;
  activity: PedestrianActivity;
  activityUntil: number;
  pauseUntil: number;
  partnerId: string | null;
  storeId: LocationId | null;
  completedVisits: number;
  heldProp: HeldProp;
  retiring: boolean;
  urgent: boolean;
  reactionKind: FlyerReaction | null;
  reactionUntil: number;
  responseIcons: Record<FlyerReaction, THREE.Sprite>;
}

interface FocusTarget {
  kind: "location" | "person";
  id: string;
  position: { x: number; z: number };
}

interface PositionTween {
  object: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  start: number;
  duration: number;
  arc: number;
  onComplete?: () => void;
}

interface GigSession {
  startedAt: number;
  beatMs: number;
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
  walkIns: number;
  specialMoves: number;
  powerChordUnlocked: boolean;
  powerChordUsed: boolean;
  root: THREE.Group;
  beatRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  targetRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  sideMarker: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  title: THREE.Mesh;
}

const WALK_SPEED = 3.2;
const RUN_SPEED = 5.3;
const PLAYER_RADIUS = 0.31;
const WORLD_BOUNDS = { minX: -19.2, maxX: 17.8, minZ: -0.72, maxZ: 6.42 };
const PEDESTRIAN_POOL_SIZE = 24;

const PEDESTRIAN_VARIANTS: CharacterVariant[] = [
  { jacket: 0xd1a13c, pants: 0x24343c, skin: 0x8b5639, hair: 0x24201e, hat: "none", accessory: "backpack", height: 0.98, width: 0.92 },
  { jacket: 0x314d68, pants: 0x3b342f, skin: 0xd79a70, hair: 0x38261f, hat: "beanie", accessory: "headphones", height: 1.06 },
  { jacket: 0x687451, pants: 0x2d3b42, skin: 0x9d6849, hair: 0x1f1b1c, hat: "cap", accessory: "bag", height: 0.94, width: 1.06 },
  { jacket: 0x7e4f45, pants: 0x30302f, skin: 0xc98259, hair: 0x5a3928, hat: "none", accessory: "none", posture: 0.08 },
  { jacket: 0x315e5c, pants: 0x4a3b35, skin: 0x6f402f, hair: 0x211a18, hat: "beanie", accessory: "bag", height: 1.1, width: 0.9 },
  { jacket: 0x9a7546, pants: 0x2e4652, skin: 0xe1af86, hair: 0xc07141, hat: "cap", accessory: "backpack", height: 0.9 },
  { jacket: 0x55506d, pants: 0x333c3c, skin: 0x875338, hair: 0x171717, hat: "none", accessory: "headphones", width: 0.95 },
  { jacket: 0x466947, pants: 0x443b35, skin: 0xb97352, hair: 0x33241d, hat: "beanie", accessory: "none", height: 1.04, posture: 0.05 },
  { jacket: 0x356575, pants: 0x30353d, skin: 0xe4b48d, hair: 0x5a3a27, hat: "none", accessory: "bag", height: 0.96 },
  { jacket: 0x8d5b3f, pants: 0x26393b, skin: 0x78432f, hair: 0x191919, hat: "cap", accessory: "backpack", height: 1.08, width: 1.02 },
];

export class ThreeWorld implements SceneController {
  private readonly scene = new THREE.Scene();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.OrthographicCamera;
  private readonly characterFactory = new CharacterFactory();
  private readonly block: BlockWorld;
  private readonly player: CharacterRig;
  private readonly pedestrians: Pedestrian[] = [];
  private readonly indicator = new InteractionIndicator();
  private readonly timeSystem: TimeOfDaySystem;
  private readonly weatherSystem: WeatherSystem;
  private readonly keys = new Set<string>();
  private readonly tweens: PositionTween[] = [];
  private snapshot: Readonly<GameSnapshot>;
  private focus: FocusTarget | null = null;
  private menuOpen = true;
  private touchX = 0;
  private touchZ = 0;
  private touchSprinting = false;
  private lastTime = performance.now();
  private ambientAccumulator = 0;
  private travelAccumulator = 0;
  private sprintAccumulator = 0;
  private movingSpeed = 0;
  private buildingReveal: LocationId | null = null;
  private gig: GigSession | null = null;
  private pedestrianTuning: PedestrianTuning;
  private nextCrowdRollAt = 0;

  constructor(
    private readonly host: HTMLElement,
    private readonly gameState: GameState,
    private readonly gameEvents: GameEvents,
    private readonly audio: AudioManager,
    private readonly pedestrianTuningStore: PedestrianTuningStore,
  ) {
    this.snapshot = gameState.snapshot();
    this.pedestrianTuning = pedestrianTuningStore.snapshot();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(1.7, window.devicePixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.host.replaceChildren(this.renderer.domElement);
    this.renderer.domElement.setAttribute("aria-label", "Playable low-poly Seattle neighborhood");

    this.camera = new THREE.OrthographicCamera(-10, 10, 6, -6, 0.1, 120);
    this.camera.position.set(10, 12, 15);
    this.camera.lookAt(0, 1.2, 0);

    this.block = new StreetSectionFactory().createBlock();
    this.scene.add(this.block.root);
    this.player = this.characterFactory.createPlayer();
    this.player.root.position.set(2.5, this.groundHeightAt(2.5, -0.18), -0.18);
    this.player.root.rotation.y = Math.PI;
    this.scene.add(this.player.root);
    this.scene.add(this.indicator.root);
    this.createPedestrians();
    this.pedestrianTuningStore.subscribe((tuning) => {
      this.pedestrianTuning = {
        ...tuning,
        crowdBands: tuning.crowdBands.map((item) => ({ ...item })),
        dispositions: tuning.dispositions.map((item) => ({ ...item })),
        goals: tuning.goals.map((item) => ({ ...item })),
      };
      const approached = new Set(this.snapshot.gig.approachedPeople);
      const now = performance.now() / 1000;
      this.pedestrians.forEach((person) => {
        if (!person.active || person.inShow || person.activity === "inside" || approached.has(person.id)) return;
        const disposition = rollDisposition(this.pedestrianTuning);
        person.disposition = disposition.disposition;
        person.accepts = disposition.accepts;
        person.speed = this.pedestrianTuning.walkSpeed * (0.9 + (person.phase % 1) * 0.2);
        this.assignNewGoal(person, now);
      });
      this.nextCrowdRollAt = 0;
    });

    this.timeSystem = new TimeOfDaySystem(this.scene, this.snapshot);
    this.timeSystem.scanWindows(this.block.root);
    this.weatherSystem = new WeatherSystem(this.snapshot, this.block.mountain);
    this.scene.add(this.weatherSystem.root);
    this.updateHeldProp();
    this.bindInput();
    this.resize();
    const resizeObserver = new ResizeObserver(() => this.resize());
    resizeObserver.observe(this.host);
    this.host.dataset.renderer = "three";

    this.gameState.subscribe((snapshot) => {
      this.snapshot = snapshot;
      this.timeSystem.setSnapshot(snapshot);
      this.weatherSystem.setSnapshot(snapshot);
      this.updateHeldProp();
      this.pedestrians.forEach((person) => person.recruited = snapshot.gig.recruitedPeople.includes(person.id));
    });
    requestAnimationFrame(this.frame);
  }

  setMenuOpen(open: boolean): void {
    this.menuOpen = open;
    if (open) this.keys.clear();
  }

  setTouchDirection(direction: number): void {
    if (this.gig && direction !== 0) {
      this.setShowSide(direction < 0 ? -1 : 1);
      this.touchX = 0;
      return;
    }
    this.touchX = THREE.MathUtils.clamp(direction, -1, 1);
  }

  setTouchDepth(direction: number): void {
    this.touchZ = THREE.MathUtils.clamp(direction, -1, 1);
  }

  setTouchSprinting(sprinting: boolean): void {
    if (this.gig && sprinting) {
      if (this.gig.powerChordUnlocked && !this.gig.powerChordUsed) this.triggerPowerChord();
      else this.triggerFlourish();
      return;
    }
    this.touchSprinting = sprinting;
  }

  nudgePlayer(direction: number): void {
    if (this.menuOpen) return;
    if (this.gig) return this.setShowSide(direction < 0 ? -1 : 1);
    this.movePlayer(direction * 0.34, 0);
  }

  nudgePlayerDepth(direction: number): void {
    if (this.menuOpen || this.gig) return;
    this.movePlayer(0, direction * 0.34);
  }

  triggerInteraction(): void {
    if (this.menuOpen) return;
    if (this.gig) {
      this.attemptShowHit();
      return;
    }
    if (!this.focus) return;
    if (this.focus.kind === "person") {
      const pedestrian = this.pedestrians.find((person) => person.id === this.focus?.id);
      if (pedestrian) this.offerFlyer(pedestrian);
      return;
    }
    const locationId = this.focus.id as LocationId;
    this.buildingReveal = locationId;
    this.popAt(new THREE.Vector3(this.focus.position.x, 1.2, this.focus.position.z), "◆", "#ffe17a", 0.7);
    window.setTimeout(() => this.gameEvents.emit("interact", { locationId }), 260);
  }

  completeStreetEncounter(_actorId: string): void {
    // Street encounters remain a legacy-renderer feature in this proof of concept.
  }

  returnHome(): void {
    this.player.root.position.set(2.5, this.groundHeightAt(2.5, -0.18), -0.18);
    this.characterFactory.resetLocomotion(this.player);
  }

  beginStreetGig(): void {
    if (this.gig || this.snapshot.gig.phase !== "performing") return;
    this.menuOpen = false;
    this.touchX = 0;
    this.touchZ = 0;
    const stage = new THREE.Vector3(-15.4, this.groundHeightAt(-15.4, -1.8), -1.8);
    this.player.root.position.copy(stage);
    this.characterFactory.resetLocomotion(this.player);
    this.player.root.rotation.y = Math.PI;
    this.characterFactory.setHeldProp(this.player, "guitar");
    this.audio.beginPerformance();

    const recruited = new Set(this.snapshot.gig.recruitedPeople);
    const audience = this.pedestrians.filter((person) => recruited.has(person.id));
    audience.forEach((person, index) => {
      const side = index % 2 === 0 ? -1 : 1;
      person.inShow = true;
      person.paused = true;
      person.rig.root.visible = true;
      const audienceX = stage.x + side * (1.7 + Math.floor(index / 2) * 0.42);
      const audienceZ = stage.z + 1.55 + (index % 3) * 0.34;
      person.active = true;
      person.rig.root.position.set(audienceX, this.groundHeightAt(audienceX, audienceZ), audienceZ);
      person.rig.root.rotation.y = Math.atan2(stage.x - person.rig.root.position.x, stage.z - person.rig.root.position.z);
      this.characterFactory.resetLocomotion(person.rig);
    });

    const root = new THREE.Group();
    root.position.copy(stage);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xf2cd5a, transparent: true, opacity: 0.8, depthWrite: false });
    const beatRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.02, 48), ringMaterial);
    beatRing.rotation.x = -Math.PI / 2;
    beatRing.position.y = 0.07;
    const targetRing = new THREE.Mesh(
      new THREE.RingGeometry(1.03, 1.1, 48),
      new THREE.MeshBasicMaterial({ color: 0x75bdb1, transparent: true, opacity: 0.48, depthWrite: false }),
    );
    targetRing.rotation.x = -Math.PI / 2;
    targetRing.position.y = 0.065;
    const sideMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.38, 0.49, 32, 1, 0, Math.PI),
      new THREE.MeshBasicMaterial({ color: 0xffd45e, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    sideMarker.rotation.x = -Math.PI / 2;
    sideMarker.rotation.z = -Math.PI / 2;
    sideMarker.position.y = 0.08;
    const title = createLabel("SPACE ON GOLD · ← / → CROWD", "#ffe985", "#10282d", 740, 92);
    title.scale.setScalar(0.54);
    title.position.set(0, 3.5, 0);
    root.add(beatRing, targetRing, sideMarker, title);
    this.scene.add(root);
    const openingEnergy = Math.min(66, 30 + this.snapshot.gig.recruitedFans * 5);
    const openingGroove = Math.min(38, 12 + this.snapshot.gig.recruitedFans * 4);
    this.gig = {
      startedAt: performance.now() + 1400,
      beatMs: 60000 / STREET_GIG_BPM,
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
      walkIns: 0,
      specialMoves: 0,
      powerChordUnlocked: false,
      powerChordUsed: false,
      root,
      beatRing,
      targetRing,
      sideMarker,
      title,
    };
    this.gameEvents.emit("focus", { locationId: null, label: "" });
  }

  private readonly frame = (now: number): void => {
    const delta = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    const time = now / 1000;
    this.updateTweens(now);
    this.timeSystem.update(delta);
    this.weatherSystem.update(time, delta);
    this.indicator.update(time);
    if (this.gig) this.updateGig(now, time, delta);
    else this.updateExploration(delta, time);
    this.updateBuildingReveal(delta);
    this.updateCamera(delta);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.frame);
  };

  private updateExploration(delta: number, time: number): void {
    const inputX = (this.keys.has("arrowleft") || this.keys.has("a") ? -1 : 0) +
      (this.keys.has("arrowright") || this.keys.has("d") ? 1 : 0) + this.touchX;
    const inputZ = (this.keys.has("arrowup") || this.keys.has("w") ? -1 : 0) +
      (this.keys.has("arrowdown") || this.keys.has("s") ? 1 : 0) + this.touchZ;
    const movement = normalizedMovement(this.menuOpen ? 0 : THREE.MathUtils.clamp(inputX, -1, 1), this.menuOpen ? 0 : THREE.MathUtils.clamp(inputZ, -1, 1));
    const moving = movement.x !== 0 || movement.z !== 0;
    const wantsRun = moving && (this.keys.has("shift") || this.touchSprinting) && this.snapshot.energy > 0;
    const speed = wantsRun ? RUN_SPEED : WALK_SPEED;
    if (moving) {
      this.movePlayer(movement.x * speed * delta, movement.z * speed * delta);
      const targetRotation = Math.atan2(movement.x, movement.z);
      this.player.root.rotation.y = this.lerpAngle(this.player.root.rotation.y, targetRotation, Math.min(1, delta * 11));
    }
    this.movingSpeed = THREE.MathUtils.lerp(this.movingSpeed, moving ? speed : 0, Math.min(1, delta * 10));
    const playerAnimation = this.characterFactory.animate(this.player, {
      time,
      delta,
      speed: this.movingSpeed,
      running: wantsRun,
      pose: moving ? (wantsRun ? "hurry" : "walk") : "idle",
    });
    if (playerAnimation.footstep) this.audio.play("footstep");
    this.updateClock(delta, moving, wantsRun);
    this.updateCrowdDirector(time);
    this.updatePedestrians(delta, time);
    this.updateFocus();
  }

  private updateClock(delta: number, moving: boolean, sprinting: boolean): void {
    if (!this.menuOpen) {
      this.ambientAccumulator += delta * 1000;
      while (this.ambientAccumulator >= AMBIENT_TIME_TICK_MS) {
        this.ambientAccumulator -= AMBIENT_TIME_TICK_MS;
        this.gameState.advanceTime(AMBIENT_MINUTES_PER_TICK);
      }
    }
    if (moving) {
      this.travelAccumulator += delta * 1000;
      while (this.travelAccumulator >= TRAVEL_TICK_MS) {
        this.travelAccumulator -= TRAVEL_TICK_MS;
        this.gameState.advanceTime(TRAVEL_MINUTES_PER_TICK);
      }
    } else this.travelAccumulator = 0;
    if (sprinting) {
      this.sprintAccumulator += delta * 1000;
      while (this.sprintAccumulator >= SPRINT_ENERGY_TICK_MS) {
        this.sprintAccumulator -= SPRINT_ENERGY_TICK_MS;
        if (!this.gameState.spendEnergy(1)) break;
      }
    } else this.sprintAccumulator = 0;
  }

  private movePlayer(x: number, z: number): void {
    const current = this.player.root.position;
    const next = moveWithSliding(
      { x: current.x, z: current.z },
      { x, z },
      PLAYER_RADIUS,
      this.block.obstacles,
      WORLD_BOUNDS,
    );
    current.x = next.x;
    current.z = next.z;
    current.y = this.groundHeightAt(next.x, next.z);
  }

  private groundHeightAt(x: number, z: number): number {
    const inPark = x >= -18.9 && x <= -12.25 && z >= -4.6 && z <= 0.18;
    if (inPark) {
      const onPerformanceRug = x >= -16.75 && x <= -14.05 && z >= -2.92 && z <= -1.18;
      return onPerformanceRug ? 0.21 : 0.16;
    }
    return z > 0.48 ? 0.055 : 0.11;
  }

  private createPedestrians(): void {
    for (let index = 0; index < PEDESTRIAN_POOL_SIZE; index += 1) {
      const base = PEDESTRIAN_VARIANTS[index % PEDESTRIAN_VARIANTS.length];
      const colorShift = Math.floor(index / PEDESTRIAN_VARIANTS.length) * 0.035;
      const variant: CharacterVariant = {
        ...base,
        jacket: new THREE.Color(base.jacket).offsetHSL((index % 3 - 1) * 0.025, 0, colorShift).getHex(),
        pants: new THREE.Color(base.pants).offsetHSL(0, 0, -colorShift * 0.5).getHex(),
        height: (base.height ?? 1) * (0.96 + (index % 5) * 0.018),
      };
      const rig = this.characterFactory.create(variant);
      rig.root.scale.multiplyScalar(0.78 + (index % 3) * 0.035);
      rig.root.visible = false;

      const reaction = createIcon("♫", "#ffe16b");
      reaction.position.set(0, 2.85, 0);
      reaction.visible = false;
      rig.root.add(reaction);
      const activityIcon = createIcon("•", "#d9ebda");
      activityIcon.position.set(0, 2.78, 0);
      activityIcon.scale.setScalar(0.44);
      activityIcon.visible = false;
      rig.root.add(activityIcon);
      const responseIcons: Record<FlyerReaction, THREE.Sprite> = {
        accept: createIcon("YES ♫", "#ffe16b"),
        decline: createIcon("NO", "#bdd0cb"),
        angry: createIcon("!!", "#ff836e"),
      };
      Object.values(responseIcons).forEach((icon) => {
        icon.position.set(0, 3.08, 0);
        icon.scale.setScalar(0.56);
        icon.visible = false;
        rig.root.add(icon);
      });

      const disposition = rollDisposition(this.pedestrianTuning);
      const person: Pedestrian = {
        id: `neighbor-${index + 1}`,
        rig,
        active: false,
        speed: this.pedestrianTuning.walkSpeed,
        destination: new THREE.Vector3(),
        phase: index * 0.71,
        paused: false,
        recruited: false,
        accepts: disposition.accepts,
        reaction,
        activityIcon,
        inShow: false,
        disposition: disposition.disposition,
        goal: "pass-through",
        activity: "walking",
        activityUntil: 0,
        pauseUntil: 0,
        partnerId: null,
        storeId: null,
        completedVisits: 0,
        heldProp: "none",
        retiring: false,
        urgent: false,
        reactionKind: null,
        reactionUntil: 0,
        responseIcons,
      };
      this.pedestrians.push(person);
      this.scene.add(rig.root);
    }
  }

  private updateCrowdDirector(now: number): void {
    if (now < this.nextCrowdRollAt) return;
    const roll = rollCrowd(this.pedestrianTuning);
    const steady = this.pedestrians.filter((person) => person.active && !person.retiring && !person.inShow);
    if (steady.length < roll.target) {
      const approached = new Set(this.snapshot.gig.approachedPeople);
      const available = this.pedestrians
        .filter((person) => !person.active && !person.inShow)
        .sort((a, b) => Number(approached.has(a.id)) - Number(approached.has(b.id)));
      available.slice(0, roll.target - steady.length).forEach((person) => this.activatePedestrian(person, now));
    } else if (steady.length > roll.target) {
      steady
        .filter((person) => !person.recruited)
        .sort((a, b) => Math.abs(b.rig.root.position.x) - Math.abs(a.rig.root.position.x))
        .slice(0, steady.length - roll.target)
        .forEach((person) => this.retirePedestrian(person));
    }
    this.nextCrowdRollAt = now + nextCrowdRollDelay(this.pedestrianTuning);
    this.gameEvents.emit("crowdChanged", {
      label: roll.band.label,
      target: roll.target,
      active: this.pedestrians.filter((person) => person.active && person.activity !== "inside").length,
    });
  }

  private activatePedestrian(person: Pedestrian, now: number): void {
    const fromLeft = Math.random() < 0.5;
    const z = 0.78 + Math.random() * 4.95;
    const x = fromLeft ? WORLD_BOUNDS.minX + 0.25 : WORLD_BOUNDS.maxX - 0.25;
    person.active = true;
    person.retiring = false;
    person.inShow = false;
    person.partnerId = null;
    person.rig.root.visible = true;
    person.rig.root.position.set(x, this.groundHeightAt(x, z), z);
    person.rig.root.rotation.y = fromLeft ? Math.PI / 2 : -Math.PI / 2;
    person.speed = this.pedestrianTuning.walkSpeed * (0.88 + Math.random() * 0.24);
    person.urgent = Math.random() < 0.14;
    const disposition = rollDisposition(this.pedestrianTuning);
    person.disposition = disposition.disposition;
    person.accepts = disposition.accepts;
    person.reactionKind = null;
    person.reactionUntil = 0;
    person.pauseUntil = 0;
    person.completedVisits = 0;
    person.heldProp = Math.random() < 0.12 ? "umbrella" : "none";
    this.characterFactory.setHeldProp(person.rig, person.heldProp);
    this.setCharacterOpacity(person.rig.root, 1);
    this.characterFactory.resetLocomotion(person.rig);
    this.assignNewGoal(person, now);
  }

  private retirePedestrian(person: Pedestrian): void {
    this.releaseConversation(person);
    person.retiring = true;
    person.goal = "pass-through";
    person.activity = "walking";
    person.urgent = false;
    person.storeId = null;
    const x = person.rig.root.position.x < 0 ? WORLD_BOUNDS.minX - 0.8 : WORLD_BOUNDS.maxX + 0.8;
    const z = THREE.MathUtils.clamp(person.rig.root.position.z, 0.75, 5.8);
    person.destination.set(x, this.groundHeightAt(x, z), z);
  }

  private deactivatePedestrian(person: Pedestrian): void {
    this.releaseConversation(person);
    person.active = false;
    person.retiring = false;
    person.rig.root.visible = false;
    person.activityIcon.visible = false;
    Object.values(person.responseIcons).forEach((icon) => icon.visible = false);
  }

  private assignNewGoal(person: Pedestrian, now: number): void {
    if (!person.active || person.retiring) return;
    this.releaseConversation(person);
    person.goal = rollGoal(this.pedestrianTuning);
    person.urgent = Math.random() < 0.14;
    person.activity = person.urgent ? "running" : "walking";
    person.activityUntil = 0;
    person.storeId = null;
    if (person.heldProp === "phone") {
      person.heldProp = "none";
      this.characterFactory.setHeldProp(person.rig, "none");
    }

    const storeByGoal: Partial<Record<PedestrianGoal, LocationId>> = {
      coffee: "coffee",
      music: "music-store",
      jobs: "job-board",
    };
    const storeId = storeByGoal[person.goal];
    if (storeId) {
      const entrance = this.block.locationPoints.get(storeId);
      if (entrance) {
        person.storeId = storeId;
        person.destination.set(entrance.x, this.groundHeightAt(entrance.x, 0.02), 0.02);
        return;
      }
    }

    if (person.goal === "park") {
      const x = -17.25 + Math.random() * 2.5;
      const z = -0.32 + Math.random() * 0.35;
      person.destination.set(x, this.groundHeightAt(x, z), z);
      return;
    }

    if (person.goal === "chat" && this.reserveConversationPartner(person, now)) return;

    person.goal = "pass-through";
    if (Math.random() < 0.18 && person.heldProp === "none") {
      person.activity = "phone";
      person.heldProp = "phone";
      this.characterFactory.setHeldProp(person.rig, "phone");
    }
    const x = person.rig.root.position.x < 0 ? WORLD_BOUNDS.maxX + 0.55 : WORLD_BOUNDS.minX - 0.55;
    const z = 0.72 + Math.random() * 5.1;
    person.destination.set(x, this.groundHeightAt(x, z), z);
  }

  private reserveConversationPartner(person: Pedestrian, now: number): boolean {
    const candidates = this.pedestrians.filter((candidate) =>
      candidate !== person &&
      candidate.active &&
      !candidate.retiring &&
      !candidate.inShow &&
      candidate.activity !== "inside" &&
      candidate.activity !== "entering" &&
      candidate.activity !== "exiting" &&
      candidate.reactionUntil <= now &&
      !candidate.partnerId,
    );
    if (candidates.length === 0) return false;
    const partner = candidates[Math.floor(Math.random() * candidates.length)];
    const centerX = THREE.MathUtils.clamp((person.rig.root.position.x + partner.rig.root.position.x) / 2, -15, 14);
    const centerZ = THREE.MathUtils.clamp((person.rig.root.position.z + partner.rig.root.position.z) / 2, 0.8, 4.8);
    person.partnerId = partner.id;
    partner.partnerId = person.id;
    person.goal = "chat";
    partner.goal = "chat";
    person.activity = "walking";
    partner.activity = "walking";
    person.urgent = false;
    partner.urgent = false;
    person.destination.set(centerX - 0.48, this.groundHeightAt(centerX - 0.48, centerZ), centerZ);
    partner.destination.set(centerX + 0.48, this.groundHeightAt(centerX + 0.48, centerZ), centerZ);
    return true;
  }

  private releaseConversation(person: Pedestrian): void {
    if (!person.partnerId) return;
    const partner = this.pedestrians.find((candidate) => candidate.id === person.partnerId);
    person.partnerId = null;
    if (partner?.partnerId === person.id) partner.partnerId = null;
  }

  private updatePedestrians(delta: number, time: number): void {
    const now = performance.now() / 1000;
    this.pedestrians.forEach((person, index) => {
      if (!person.active || person.inShow) return;
      const approached = this.snapshot.gig.approachedPeople.includes(person.id);
      person.paused = now < person.pauseUntil;
      let pose: CharacterPose = "idle";
      let movementSpeed = 0;
      let running = false;

      if (person.activity === "inside") {
        person.rig.root.visible = false;
        if (now >= person.activityUntil) this.beginPedestrianExit(person);
        return;
      }

      person.rig.root.visible = true;
      person.activityIcon.visible = false;
      Object.values(person.responseIcons).forEach((icon) => icon.visible = false);
      if (person.reactionKind && now >= person.reactionUntil) person.reactionKind = null;

      if (person.reactionKind && now < person.reactionUntil) {
        pose = person.reactionKind;
        person.responseIcons[person.reactionKind].visible = true;
        const direction = this.player.root.position.clone().sub(person.rig.root.position);
        person.rig.root.rotation.y = this.lerpAngle(person.rig.root.rotation.y, Math.atan2(direction.x, direction.z), Math.min(1, delta * 10));
      } else if (person.paused) {
        const direction = this.player.root.position.clone().sub(person.rig.root.position);
        person.rig.root.rotation.y = this.lerpAngle(person.rig.root.rotation.y, Math.atan2(direction.x, direction.z), Math.min(1, delta * 8));
      } else if (person.activity === "chatting") {
        pose = "talk";
        const partner = this.pedestrians.find((candidate) => candidate.id === person.partnerId);
        if (partner) {
          const direction = partner.rig.root.position.clone().sub(person.rig.root.position);
          person.rig.root.rotation.y = this.lerpAngle(person.rig.root.rotation.y, Math.atan2(direction.x, direction.z), Math.min(1, delta * 6));
        }
        person.activityIcon.visible = Math.sin(time * 2 + person.phase) > -0.15;
        if (now >= person.activityUntil) this.finishConversation(person, now);
      } else if (person.activity === "sitting") {
        pose = "sit";
        if (now >= person.activityUntil) this.assignNewGoal(person, now);
      } else if (person.activity === "window-shopping" || person.activity === "waiting") {
        pose = person.activity === "window-shopping" ? "look" : "wait";
        if (person.goal === "chat") {
          const partner = this.pedestrians.find((candidate) => candidate.id === person.partnerId);
          if (partner) {
            const direction = partner.rig.root.position.clone().sub(person.rig.root.position);
            person.rig.root.rotation.y = this.lerpAngle(person.rig.root.rotation.y, Math.atan2(direction.x, direction.z), Math.min(1, delta * 6));
            if (direction.length() < 1.35) this.startConversation(person, partner, now);
            else if (now >= person.activityUntil) this.assignNewGoal(person, now);
          } else this.assignNewGoal(person, now);
        } else {
          person.rig.root.rotation.y = this.lerpAngle(person.rig.root.rotation.y, Math.PI, Math.min(1, delta * 5));
          if (now >= person.activityUntil) {
            if (person.storeId) this.beginStoreEntry(person);
            else this.assignNewGoal(person, now);
          }
        }
      } else {
        const entering = person.activity === "entering";
        const exiting = person.activity === "exiting";
        let target = person.destination;
        let currentSpeed = entering || exiting ? this.pedestrianTuning.walkSpeed * 0.76 : person.speed;
        running = person.activity === "running" || person.urgent;
        pose = person.activity === "phone" ? "phone" : running ? "hurry" : "walk";

        const canReactToFlyer =
          this.snapshot.gig.phase === "promoting" &&
          !approached &&
          !entering &&
          !exiting &&
          !person.retiring;
        if (canReactToFlyer) {
          const fromPlayer = person.rig.root.position.clone().sub(this.player.root.position);
          fromPlayer.y = 0;
          const distance = fromPlayer.length();
          const away = distance > 0.001 ? fromPlayer.normalize() : new THREE.Vector3(1, 0, 0);
          if (person.disposition === "interested" && distance < this.pedestrianTuning.awarenessRadius) {
            person.activityIcon.visible = true;
            if (distance > 1.3) {
              target = this.player.root.position.clone().addScaledVector(away, 1.12);
              currentSpeed = person.speed * 1.12;
              pose = "walk";
              running = false;
            } else {
              currentSpeed = 0;
              pose = "wait";
              const direction = this.player.root.position.clone().sub(person.rig.root.position);
              person.rig.root.rotation.y = this.lerpAngle(person.rig.root.rotation.y, Math.atan2(direction.x, direction.z), Math.min(1, delta * 8));
            }
          } else if (person.disposition === "avoidant" && distance < this.pedestrianTuning.awarenessRadius * 0.68) {
            target = person.rig.root.position.clone().addScaledVector(away, 3.3);
            target.x = THREE.MathUtils.clamp(target.x, WORLD_BOUNDS.minX + 0.3, WORLD_BOUNDS.maxX - 0.3);
            target.z = THREE.MathUtils.clamp(target.z, 0.65, 6.1);
            currentSpeed = person.speed * 1.35;
            pose = "hurry";
          } else if (person.disposition === "fleeing" && distance < this.pedestrianTuning.awarenessRadius) {
            target = person.rig.root.position.clone().addScaledVector(away, 7);
            target.x = THREE.MathUtils.clamp(target.x, WORLD_BOUNDS.minX + 0.25, WORLD_BOUNDS.maxX - 0.25);
            target.z = THREE.MathUtils.clamp(target.z, 0.6, 6.15);
            currentSpeed = person.speed * this.pedestrianTuning.runMultiplier;
            pose = "hurry";
            running = true;
            person.activityIcon.visible = Math.sin(time * 8) > 0;
          }
        }

        if (running && !entering && !exiting && currentSpeed === person.speed) {
          currentSpeed *= this.pedestrianTuning.runMultiplier;
        }
        if (currentSpeed > 0) {
          const step = advanceOnGround(
            { x: person.rig.root.position.x, z: person.rig.root.position.z },
            { x: target.x, z: target.z },
            currentSpeed * delta,
          );
          person.rig.root.position.set(step.position.x, this.groundHeightAt(step.position.x, step.position.z), step.position.z);
          person.rig.root.rotation.y = this.lerpAngle(person.rig.root.rotation.y, step.heading, Math.min(1, delta * 8));
          movementSpeed = currentSpeed;
          if (entering || exiting) this.updateDoorFade(person);
          if (target === person.destination && step.arrived) this.handlePedestrianArrival(person, now);
        }
      }

      this.characterFactory.animate(person.rig, {
        time: time + person.phase,
        delta,
        speed: person.paused || (person.reactionKind !== null && now < person.reactionUntil) ? 0 : movementSpeed,
        running,
        excitement: person.recruited ? 0.12 : 0,
        pose,
      });
      person.reaction.visible = approached && person.recruited && Math.sin(time * 1.7 + index) > 0.92;
    });
  }

  private startConversation(person: Pedestrian, partner: Pedestrian, now: number): void {
    if (person.activity === "chatting" && partner.activity === "chatting") return;
    const duration = this.pedestrianTuning.conversationSeconds * (0.78 + Math.random() * 0.44);
    [person, partner].forEach((speaker) => {
      speaker.activity = "chatting";
      speaker.activityUntil = now + duration;
      speaker.urgent = false;
    });
  }

  private finishConversation(person: Pedestrian, now: number): void {
    const partner = this.pedestrians.find((candidate) => candidate.id === person.partnerId);
    this.releaseConversation(person);
    [person, partner].forEach((speaker) => {
      if (!speaker || !speaker.active || speaker.activity !== "chatting") return;
      speaker.activityIcon.visible = false;
      this.assignNewGoal(speaker, now);
    });
  }

  private handlePedestrianArrival(person: Pedestrian, now: number): void {
    if (person.retiring) {
      this.deactivatePedestrian(person);
      return;
    }
    if (person.activity === "entering") {
      person.activity = "inside";
      person.activityUntil = now + this.pedestrianTuning.storeVisitSeconds * (0.72 + Math.random() * 0.56);
      person.rig.root.visible = false;
      return;
    }
    if (person.activity === "exiting") {
      this.setCharacterOpacity(person.rig.root, 1);
      person.completedVisits += 1;
      this.assignNewGoal(person, now);
      return;
    }
    if (person.goal === "coffee") {
      this.beginStoreEntry(person);
      return;
    }
    if (person.goal === "music" || person.goal === "jobs") {
      person.activity = person.goal === "music" ? "window-shopping" : "waiting";
      person.activityUntil = now + 1.3 + Math.random() * 1.4;
      return;
    }
    if (person.goal === "park") {
      person.activity = "sitting";
      person.activityUntil = now + this.pedestrianTuning.storeVisitSeconds * (0.8 + Math.random() * 0.7);
      person.rig.root.rotation.y = 0.18;
      return;
    }
    if (person.goal === "chat") {
      person.activity = "waiting";
      person.activityUntil = now + 8;
      const partner = this.pedestrians.find((candidate) => candidate.id === person.partnerId);
      if (partner && person.rig.root.position.distanceTo(partner.rig.root.position) < 1.35) {
        this.startConversation(person, partner, now);
      }
      return;
    }
    this.assignNewGoal(person, now);
  }

  private beginStoreEntry(person: Pedestrian): void {
    if (!person.storeId) return;
    const entrance = this.block.locationPoints.get(person.storeId);
    if (!entrance) return;
    person.activity = "entering";
    person.destination.set(entrance.x, this.groundHeightAt(entrance.x, -1.42), -1.42);
    person.activityIcon.visible = false;
  }

  private beginPedestrianExit(person: Pedestrian): void {
    if (!person.storeId) return this.assignNewGoal(person, performance.now() / 1000);
    const entrance = this.block.locationPoints.get(person.storeId);
    if (!entrance) return;
    person.activity = "exiting";
    person.rig.root.visible = true;
    person.rig.root.position.set(entrance.x, this.groundHeightAt(entrance.x, -1.38), -1.38);
    person.destination.set(entrance.x + (person.phase % 2 ? 0.22 : -0.22), this.groundHeightAt(entrance.x, 0.05), 0.05);
    this.setCharacterOpacity(person.rig.root, 0.08);
    if (person.goal === "coffee") person.heldProp = "coffee";
    else if (person.goal === "music" || person.goal === "jobs") person.heldProp = "paper";
    this.characterFactory.setHeldProp(person.rig, person.heldProp);
    this.characterFactory.resetLocomotion(person.rig);
  }

  private updateDoorFade(person: Pedestrian): void {
    const alpha = THREE.MathUtils.clamp((person.rig.root.position.z + 1.42) / 0.84, 0.08, 1);
    this.setCharacterOpacity(person.rig.root, alpha);
  }

  private setCharacterOpacity(root: THREE.Object3D, opacity: number): void {
    root.traverse((child) => {
      if (child instanceof THREE.Sprite) {
        child.material.opacity = opacity;
        return;
      }
      if (!(child instanceof THREE.Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((item) => {
        item.transparent = opacity < 0.999;
        item.opacity = opacity;
        item.depthWrite = opacity > 0.5;
      });
    });
  }

  private updateFocus(): void {
    const origin = { x: this.player.root.position.x, z: this.player.root.position.z };
    const targets: FocusTarget[] = [];
    this.block.locationPoints.forEach((position, id) => targets.push({ kind: "location", id, position }));
    if (this.snapshot.gig.phase === "promoting" && this.snapshot.gig.flyersRemaining > 0) {
      this.pedestrians
        .filter((person) =>
          person.rig.root.visible &&
          person.activity !== "entering" &&
          person.activity !== "inside" &&
          !this.snapshot.gig.approachedPeople.includes(person.id),
        )
        .forEach((person) => targets.push({
          kind: "person",
          id: person.id,
          position: { x: person.rig.root.position.x, z: person.rig.root.position.z },
        }));
    }
    const next = nearestWithin(origin, targets, 1.6);
    const key = next ? `${next.kind}:${next.id}` : "";
    const oldKey = this.focus ? `${this.focus.kind}:${this.focus.id}` : "";
    this.focus = next;
    if (!next) {
      this.indicator.hide();
      if (oldKey) this.gameEvents.emit("focus", { locationId: null, label: "" });
      return;
    }
    const position = new THREE.Vector3(next.position.x, 0.13, next.position.z);
    this.indicator.show(position);
    if (key === oldKey) return;
    if (next.kind === "person") {
      this.gameEvents.emit("focus", { locationId: null, label: "E / Space · Hand over a flyer" });
    } else {
      this.gameEvents.emit("focus", { locationId: next.id as LocationId, label: `E / Space · ${this.locationLabel(next.id as LocationId)}` });
    }
  }

  private offerFlyer(person: Pedestrian): void {
    if (!person.active || person.activity === "inside") return;
    const result = this.gameState.offerFlyer(person.id, person.accepts);
    if (!result.ok) return;
    const angryChance =
      person.disposition === "fleeing" ? 0.68 :
        person.disposition === "avoidant" ? 0.34 :
          person.disposition === "neutral" ? 0.12 : 0.03;
    person.reactionKind = person.accepts ? "accept" : Math.random() < angryChance ? "angry" : "decline";
    person.reactionUntil = performance.now() / 1000 + 2.15;
    person.paused = true;
    person.pauseUntil = person.reactionUntil;
    person.activityIcon.visible = false;
    const flyer = box(0.25, 0.025, 0.34, 0xf0dc74);
    flyer.rotation.z = 0.16;
    const start = this.player.root.position.clone().add(new THREE.Vector3(0, 1.38, 0));
    const end = person.rig.root.position.clone().add(new THREE.Vector3(0, 1.32, 0));
    flyer.position.copy(start);
    this.scene.add(flyer);
    this.tweens.push({
      object: flyer,
      from: start,
      to: end,
      start: performance.now(),
      duration: 520,
      arc: 0.55,
      onComplete: () => {
        this.scene.remove(flyer);
        disposeObject(flyer);
        person.recruited = person.accepts;
        person.reaction.visible = true;
        person.reaction.material.opacity = 1;
        if (person.accepts) {
          this.popAt(end.clone().add(new THREE.Vector3(0, 1.1, 0)), "♫", "#ffe06b", 1.2);
          this.audio.play("success");
        } else if (person.reactionKind === "angry") {
          this.popAt(end.clone().add(new THREE.Vector3(0, 1.08, 0)), "!!", "#ff836e", 1.15);
          this.audio.play("error");
        } else {
          this.popAt(end.clone().add(new THREE.Vector3(0, 1.05, 0)), "NO", "#bdd0cb", 0.95);
          this.audio.play("ui-click");
        }
      },
    });
    this.player.rightArm.rotation.x = -0.8;
    window.setTimeout(() => this.player.rightArm.rotation.x = 0, 540);
    this.gameEvents.emit("flyerResult", { accepted: person.accepts, message: result.message });
  }

  private updateHeldProp(): void {
    if (this.gig) return this.characterFactory.setHeldProp(this.player, "guitar");
    if (this.snapshot.carriedItem === "coffee") return this.characterFactory.setHeldProp(this.player, "coffee");
    if (this.snapshot.gig.phase === "promoting" && this.snapshot.gig.flyersRemaining > 0) {
      return this.characterFactory.setHeldProp(this.player, "flyers");
    }
    this.characterFactory.setHeldProp(this.player, "none");
  }

  private updateBuildingReveal(delta: number): void {
    this.block.buildings.forEach((building, id) => {
      const distance = this.player.root.position.distanceTo(building.entrance);
      const target = this.buildingReveal === id && distance < 2.9 ? 1 : 0;
      building.reveal = THREE.MathUtils.lerp(building.reveal, target, Math.min(1, delta * 5));
      building.front.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((item) => {
          if (!(item instanceof THREE.Material)) return;
          item.transparent = building.reveal > 0.01;
          item.opacity = 1 - building.reveal * 0.88;
          item.depthWrite = building.reveal < 0.35;
        });
      });
    });
  }

  private updateCamera(delta: number): void {
    const focus = this.gig ? new THREE.Vector3(-15.4, 0, -0.9) : this.player.root.position;
    const followX = THREE.MathUtils.clamp(focus.x, -12.5, 11.5);
    const followZ = THREE.MathUtils.clamp(focus.z, 0.15, 3.2);
    const desired = new THREE.Vector3(followX + 8.4, 11.5, followZ + 13.2);
    this.camera.position.lerp(desired, Math.min(1, delta * 2.1));
    this.camera.lookAt(followX, 1.0, followZ - 1.4);
  }

  private updateGig(now: number, time: number, delta: number): void {
    const gig = this.gig;
    if (!gig) return;
    const elapsed = now - gig.startedAt;
    this.characterFactory.animate(this.player, {
      time,
      delta,
      speed: 0,
      excitement: elapsed > 0 ? 0.34 : 0.08,
      pose: "idle",
    });
    const cycle = elapsed > 0 ? (elapsed / gig.beatMs) % 4 : 0;
    const remaining = cycle >= 3 ? 4 - cycle : 1;
    const scale = cycle >= 3 ? 1 + remaining * 1.8 : cycle < 0.18 ? 1 : 2.6;
    gig.beatRing.scale.setScalar(scale);
    gig.beatRing.material.opacity = cycle >= 3 ? 0.35 + (1 - remaining) * 0.62 : cycle < 0.18 ? 0.95 : 0.14;
    gig.sideMarker.rotation.z = gig.side < 0 ? Math.PI / 2 : -Math.PI / 2;
    if (elapsed < 0) {
      gig.title.scale.setScalar(0.5 + Math.sin(time * 6) * 0.03);
      return;
    }
    const beat = Math.floor(elapsed / gig.beatMs);
    if (beat > gig.lastBeat) {
      for (let next = gig.lastBeat + 1; next <= beat; next += 1) {
        if (next < 0) continue;
        const accent = next > 0 && next % 4 === 0;
        this.audio.playPerformanceCue(accent ? "accent" : "beat");
        gig.targetRing.scale.setScalar(accent ? 1.22 : 1.06);
        gig.leftCrowd = Math.max(0, gig.leftCrowd - (accent ? 2.4 : 0.6));
        gig.rightCrowd = Math.max(0, gig.rightCrowd - (accent ? 2.4 : 0.6));
        if (accent && next <= STREET_GIG_BEATS - 4 && next - 4 >= 4 && !gig.judgedAccents.has(next - 4)) {
          gig.judgedAccents.add(next - 4);
          gig.missed += 1;
          gig.streak = 0;
          gig.groove = Math.max(0, gig.groove - 12);
          this.showJudgement("MISS", "#e58b7e");
          this.audio.playPerformanceCue("miss");
          this.reactAudience(gig.side, -0.25);
        }
        if (accent) {
          this.maybeWalkOut(-1);
          this.maybeWalkOut(1);
        }
      }
      gig.lastBeat = beat;
    }
    gig.targetRing.scale.lerp(new THREE.Vector3(1, 1, 1), 0.18);
    this.pedestrians.filter((person) => person.inShow).forEach((person, index) => {
      const side = person.rig.root.position.x < -15.4 ? -1 : 1;
      const energy = side < 0 ? gig.leftCrowd : gig.rightCrowd;
      this.characterFactory.animate(person.rig, {
        time: time + index * 0.31,
        delta,
        speed: 0,
        excitement: energy / 100,
        pose: "idle",
      });
    });
    if (elapsed >= STREET_GIG_BEATS * gig.beatMs) this.finishGig();
  }

  private attemptShowHit(): void {
    const gig = this.gig;
    if (!gig) return;
    const elapsed = performance.now() - gig.startedAt;
    if (elapsed < 0) return;
    const accentSpan = gig.beatMs * 4;
    const nearest = THREE.MathUtils.clamp(Math.round(elapsed / accentSpan) * 4, 4, STREET_GIG_BEATS - 4);
    const distance = Math.abs(elapsed - nearest * gig.beatMs);
    if (gig.judgedAccents.has(nearest)) return this.showJudgement("HOLD", "#a8c5c4");
    if (distance > 290) {
      gig.groove = Math.max(0, gig.groove - 3);
      gig.streak = 0;
      this.showJudgement(elapsed < nearest * gig.beatMs ? "EARLY" : "LATE", "#e59a8e");
      this.audio.playPerformanceCue("miss");
      return;
    }
    gig.judgedAccents.add(nearest);
    const perfect = distance <= 135;
    gig.groove = Math.min(100, gig.groove + (perfect ? 18 : 11));
    gig.peakGroove = Math.max(gig.peakGroove, gig.groove);
    gig.streak += 1;
    gig.bestStreak = Math.max(gig.bestStreak, gig.streak);
    if (gig.side < 0) {
      gig.leftCrowd = Math.min(100, gig.leftCrowd + (perfect ? 19 : 12));
      gig.rightCrowd = Math.max(0, gig.rightCrowd - 2);
    } else {
      gig.rightCrowd = Math.min(100, gig.rightCrowd + (perfect ? 19 : 12));
      gig.leftCrowd = Math.max(0, gig.leftCrowd - 2);
    }
    if (perfect) {
      gig.perfect += 1;
      if (gig.perfect >= 3) gig.powerChordUnlocked = true;
    } else gig.good += 1;
    this.showJudgement(perfect ? `PERFECT · ${gig.streak}` : `GOOD · ${gig.streak}`, perfect ? "#ffe16b" : "#8ed8c8");
    this.audio.playPerformanceCue(perfect ? "perfect" : "good");
    this.reactAudience(gig.side, perfect ? 0.85 : 0.5);
    this.musicBurst(perfect ? 6 : 3);
    if (perfect) this.dropCoin(gig.side);
    if ([3, 6, 9].includes(gig.streak)) this.attractWalkIn();
  }

  private setShowSide(side: -1 | 1): void {
    if (!this.gig) return;
    this.gig.side = side;
    this.player.root.rotation.y = side < 0 ? -Math.PI / 4 : Math.PI / 4;
    this.player.root.position.x = -15.4 + side * 0.28;
  }

  private triggerFlourish(): void {
    const gig = this.gig;
    if (!gig || gig.groove < 35) {
      if (gig) this.showJudgement("NEED GROOVE", "#cba59c");
      return;
    }
    gig.groove -= 35;
    gig.specialMoves += 1;
    gig.leftCrowd = Math.min(100, gig.leftCrowd + 24);
    gig.rightCrowd = Math.min(100, gig.rightCrowd + 24);
    this.showJudgement("FLOURISH!", "#ffe06c");
    this.audio.playPerformanceCue("flourish");
    this.reactAudience(-1, 1);
    this.reactAudience(1, 1);
    this.dropCoin(gig.side);
    this.musicBurst(10);
  }

  private triggerPowerChord(): void {
    const gig = this.gig;
    if (!gig || !gig.powerChordUnlocked || gig.powerChordUsed) {
      if (gig) this.showJudgement(gig.powerChordUsed ? "CHORD SPENT" : "3 PERFECTS", "#a6b8b8");
      return;
    }
    gig.powerChordUsed = true;
    gig.specialMoves += 1;
    gig.groove = Math.min(100, gig.groove + 18);
    gig.peakGroove = Math.max(gig.peakGroove, gig.groove);
    gig.leftCrowd = Math.min(100, gig.leftCrowd + 28);
    gig.rightCrowd = Math.min(100, gig.rightCrowd + 28);
    this.showJudgement("POWER CHORD!", "#fff3a0");
    this.audio.playPerformanceCue("flourish");
    this.reactAudience(-1, 1.2);
    this.reactAudience(1, 1.2);
    this.attractWalkIn();
    this.dropCoin(-1);
    window.setTimeout(() => this.dropCoin(1), 130);
    this.musicBurst(14);
  }

  private showJudgement(text: string, color: string): void {
    const gig = this.gig;
    if (!gig) return;
    const label = createLabel(text, color, "rgba(15,36,42,.88)", 420, 96);
    label.scale.setScalar(0.52);
    label.position.set(-15.4, 3.25, -1.65);
    label.scale.multiplyScalar(0.6);
    this.scene.add(label);
    const start = label.position.clone();
    this.tweens.push({
      object: label,
      from: start,
      to: start.clone().add(new THREE.Vector3(0, 0.85, 0)),
      start: performance.now(),
      duration: 780,
      arc: 0.15,
      onComplete: () => {
        this.scene.remove(label);
        disposeObject(label);
      },
    });
  }

  private reactAudience(side: -1 | 1, amount: number): void {
    this.pedestrians
      .filter((person) => person.inShow && (person.rig.root.position.x < -15.4 ? -1 : 1) === side)
      .forEach((person, index) => {
        person.reaction.visible = true;
        person.reaction.material.opacity = 1;
        person.rig.body.scale.set(1 + amount * 0.04, 1 + amount * 0.08, 1 + amount * 0.04);
        window.setTimeout(() => {
          person.rig.body.scale.setScalar(1);
          person.reaction.visible = false;
        }, 300 + index * 55);
      });
  }

  private attractWalkIn(): void {
    const gig = this.gig;
    if (!gig || gig.walkIns >= 3) return;
    const candidate = this.pedestrians.find((person) => !person.inShow);
    if (!candidate) return;
    gig.walkIns += 1;
    candidate.inShow = true;
    candidate.active = true;
    candidate.rig.root.visible = true;
    const side: -1 | 1 = gig.leftCrowd <= gig.rightCrowd ? -1 : 1;
    const fromX = -15.4 + side * 5;
    const fromZ = 1.2;
    const toX = -15.4 + side * (2.1 + gig.walkIns * 0.35);
    const toZ = 0.05 + (gig.walkIns % 2) * 0.4;
    const from = new THREE.Vector3(fromX, this.groundHeightAt(fromX, fromZ), fromZ);
    const to = new THREE.Vector3(toX, this.groundHeightAt(toX, toZ), toZ);
    candidate.rig.root.position.copy(from);
    this.characterFactory.resetLocomotion(candidate.rig);
    this.tweens.push({ object: candidate.rig.root, from, to, start: performance.now(), duration: 820, arc: 0.05 });
    this.showJudgement("WALK-IN!", "#ffe06b");
    this.audio.play("notice");
  }

  private maybeWalkOut(side: -1 | 1): void {
    const gig = this.gig;
    if (!gig || gig.lastBeat < 12) return;
    const energy = side < 0 ? gig.leftCrowd : gig.rightCrowd;
    if (energy > 8) return;
    const person = this.pedestrians.find((candidate) => candidate.inShow && (candidate.rig.root.position.x < -15.4 ? -1 : 1) === side);
    if (!person) return;
    person.inShow = false;
    gig.walkouts += 1;
    if (side < 0) gig.leftCrowd = 16;
    else gig.rightCrowd = 16;
    const from = person.rig.root.position.clone();
    const to = from.clone().add(new THREE.Vector3(side * 5, 0, 1.2));
    this.tweens.push({
      object: person.rig.root,
      from,
      to,
      start: performance.now(),
      duration: 1100,
      arc: 0.12,
      onComplete: () => person.rig.root.visible = false,
    });
    this.showJudgement("WALK-OUT", "#ef9b8d");
  }

  private dropCoin(side: -1 | 1): void {
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.045, 12), material(0xf2c84f, 0.3));
    coin.rotation.z = Math.PI / 2;
    const from = new THREE.Vector3(-15.4 + side * 2.1, 1.55, -0.15);
    const to = this.block.caseTarget.clone();
    coin.position.copy(from);
    this.scene.add(coin);
    this.tweens.push({
      object: coin,
      from,
      to,
      start: performance.now(),
      duration: 620,
      arc: 1.25,
      onComplete: () => {
        this.audio.playPerformanceCue("coin");
        coin.position.copy(to);
        coin.scale.setScalar(1.15);
      },
    });
  }

  private musicBurst(count: number): void {
    for (let index = 0; index < count; index += 1) {
      const icon = createIcon(index % 3 ? "♪" : "♫", index % 2 ? "#83d2c2" : "#ffe06b");
      const side = index % 2 ? -1 : 1;
      const from = new THREE.Vector3(-15.4 + side * 0.3, 1.55, -1.7);
      const to = from.clone().add(new THREE.Vector3(side * (0.8 + index * 0.12), 1.4 + (index % 3) * 0.28, 0));
      icon.position.copy(from);
      icon.scale.setScalar(0.38 + (index % 3) * 0.08);
      this.scene.add(icon);
      this.tweens.push({
        object: icon,
        from,
        to,
        start: performance.now() + index * 24,
        duration: 720 + index * 25,
        arc: 0.35,
        onComplete: () => {
          this.scene.remove(icon);
          disposeObject(icon);
        },
      });
    }
  }

  private finishGig(): void {
    const gig = this.gig;
    if (!gig) return;
    const final = STREET_GIG_BEATS - 4;
    if (!gig.judgedAccents.has(final)) gig.missed += 1;
    const metrics: GigPerformanceMetrics = {
      perfect: gig.perfect,
      good: gig.good,
      missed: gig.missed,
      peakGroove: gig.peakGroove,
      leftCrowd: gig.leftCrowd,
      rightCrowd: gig.rightCrowd,
      walkIns: gig.walkIns,
      walkouts: gig.walkouts,
      specialMoves: gig.specialMoves,
      bestStreak: gig.bestStreak,
    };
    this.scene.remove(gig.root);
    disposeObject(gig.root);
    this.gig = null;
    this.audio.endPerformance();
    const action = this.gameState.completeStreetGig(metrics);
    const result = this.gameState.snapshot().gig.lastResult;
    this.characterFactory.setHeldProp(this.player, "none");
    if (!action.ok || !result) return;
    this.musicBurst(12);
    this.gameEvents.emit("gigComplete", { result });
  }

  private updateTweens(now: number): void {
    for (let index = this.tweens.length - 1; index >= 0; index -= 1) {
      const tween = this.tweens[index];
      const raw = (now - tween.start) / tween.duration;
      if (raw < 0) continue;
      const progress = Math.min(1, raw);
      const eased = 1 - (1 - progress) ** 3;
      tween.object.position.lerpVectors(tween.from, tween.to, eased);
      tween.object.position.y += Math.sin(progress * Math.PI) * tween.arc;
      tween.object.rotation.y += 0.08;
      if (progress < 1) continue;
      this.tweens.splice(index, 1);
      tween.onComplete?.();
    }
  }

  private popAt(position: THREE.Vector3, iconText: string, color: string, scale: number): void {
    const icon = createIcon(iconText, color);
    icon.position.copy(position);
    icon.scale.setScalar(scale);
    this.scene.add(icon);
    this.tweens.push({
      object: icon,
      from: position.clone(),
      to: position.clone().add(new THREE.Vector3(0, 1.15, 0)),
      start: performance.now(),
      duration: 680,
      arc: 0.2,
      onComplete: () => {
        this.scene.remove(icon);
        disposeObject(icon);
      },
    });
  }

  private bindInput(): void {
    window.addEventListener("keydown", (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(target?.tagName ?? "")) return;
      const key = event.key.toLowerCase();
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(key)) event.preventDefault();
      if (event.repeat) {
        this.keys.add(key);
        return;
      }
      this.keys.add(key);
      if (this.menuOpen) return;
      if (this.gig) {
        if (key === "arrowleft" || key === "a") this.setShowSide(-1);
        else if (key === "arrowright" || key === "d") this.setShowSide(1);
        else if (key === "shift") this.triggerFlourish();
        else if (key === "e") this.triggerPowerChord();
        else if (key === " ") this.attemptShowHit();
      } else if (key === "e" || key === " ") this.triggerInteraction();
      else if (key === "arrowleft" || key === "a") this.nudgePlayer(-1);
      else if (key === "arrowright" || key === "d") this.nudgePlayer(1);
      else if (key === "arrowup" || key === "w") this.nudgePlayerDepth(-1);
      else if (key === "arrowdown" || key === "s") this.nudgePlayerDepth(1);
    });
    window.addEventListener("keyup", (event) => this.keys.delete(event.key.toLowerCase()));
    window.addEventListener("blur", () => this.keys.clear());
  }

  private resize(): void {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    const vertical = 12.6;
    this.camera.left = -vertical * aspect / 2;
    this.camera.right = vertical * aspect / 2;
    this.camera.top = vertical / 2;
    this.camera.bottom = -vertical / 2;
    this.camera.updateProjectionMatrix();
  }

  private locationLabel(id: LocationId): string {
    if (id === "coffee") return "Drizzle & Steam";
    if (id === "music-store") return "Mossback Music";
    if (id === "apartment") return "Tiny Apartment";
    if (id === "job-board") return "Jobs, Probably";
    if (id === "park") return "Mossy Pocket Park";
    return id;
  }

  private lerpAngle(from: number, to: number, amount: number): number {
    const difference = Math.atan2(Math.sin(to - from), Math.cos(to - from));
    return from + difference * amount;
  }
}
