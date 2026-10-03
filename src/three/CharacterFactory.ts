import * as THREE from "three";
import { crossedFootfall, gaitPhaseForDistance } from "./pedestrianMotion";
import { box, cylinder, material } from "./visual";

export type HeldProp = "none" | "coffee" | "flyers" | "guitar" | "phone" | "umbrella" | "paper";
export type CharacterPose =
  | "idle"
  | "walk"
  | "hurry"
  | "talk"
  | "phone"
  | "sit"
  | "look"
  | "wait"
  | "accept"
  | "decline"
  | "angry";

export interface CharacterVariant {
  jacket: number;
  pants: number;
  skin: number;
  hair: number;
  height?: number;
  width?: number;
  hat?: "beanie" | "cap" | "none";
  accessory?: "backpack" | "bag" | "headphones" | "none";
  posture?: number;
}

interface LocomotionState {
  previousPosition: THREE.Vector3;
  initialized: boolean;
  phase: number;
}

export interface CharacterRig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftElbow: THREE.Group;
  rightElbow: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftKnee: THREE.Group;
  rightKnee: THREE.Group;
  leftFoot: THREE.Group;
  rightFoot: THREE.Group;
  footContacts: THREE.Object3D[];
  props: Record<Exclude<HeldProp, "none">, THREE.Group>;
  variant: CharacterVariant;
  held: HeldProp;
  locomotion: LocomotionState;
}

export interface CharacterAnimationOptions {
  time: number;
  delta: number;
  speed: number;
  running?: boolean;
  excitement?: number;
  pose?: CharacterPose;
}

export interface CharacterAnimationFrame {
  movedDistance: number;
  footstep: boolean;
  phase: number;
}

const PLAYER_VARIANT: CharacterVariant = {
  jacket: 0x466e55,
  pants: 0x283943,
  skin: 0xc8885e,
  hair: 0x2d231f,
  hat: "beanie",
  accessory: "backpack",
};

function shade(color: number, amount: number): number {
  return new THREE.Color(color).offsetHSL(0, 0, amount).getHex();
}

function lowPolySphere(
  radius: number,
  color: number,
  scale: [number, number, number] = [1, 1, 1],
): THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial> {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 7), material(color));
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function lowPolyCapsule(
  radius: number,
  length: number,
  color: number,
  scale: [number, number, number] = [1, 1, 1],
): THREE.Mesh<THREE.CapsuleGeometry, THREE.MeshStandardMaterial> {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 3, 8), material(color));
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export class CharacterFactory {
  createPlayer(): CharacterRig {
    return this.create(PLAYER_VARIANT);
  }

  create(variant: CharacterVariant): CharacterRig {
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.scale.set(variant.width ?? 1, variant.height ?? 1, variant.width ?? 1);
    body.rotation.x = variant.posture ?? 0;
    root.add(body);

    const torso = lowPolyCapsule(0.31, 0.3, variant.jacket, [1, 1.05, 0.62]);
    torso.position.y = 1.4;
    body.add(torso);
    const jacketHem = lowPolyCapsule(0.31, 0.1, shade(variant.jacket, -0.035), [1.06, 0.68, 0.64]);
    jacketHem.position.y = 1.08;
    body.add(jacketHem);
    body.add(box(0.035, 0.68, 0.025, shade(variant.jacket, 0.12), [0, 1.4, 0.225]));
    [-1, 1].forEach((side) => {
      const pocket = box(0.2, 0.12, 0.025, shade(variant.jacket, -0.08), [side * 0.19, 1.2, 0.225]);
      pocket.rotation.z = side * 0.12;
      body.add(pocket);
    });

    const head = new THREE.Group();
    head.position.set(0, 2.02, 0);
    head.add(lowPolySphere(0.3, variant.skin, [0.82, 1, 0.78]));
    const nose = lowPolySphere(0.075, variant.skin, [0.72, 0.68, 1]);
    nose.position.set(0, -0.015, 0.245);
    head.add(nose);
    [-1, 1].forEach((side) => {
      const ear = lowPolySphere(0.07, shade(variant.skin, -0.035), [0.42, 0.9, 0.72]);
      ear.position.set(side * 0.255, 0, 0);
      head.add(ear);
    });
    const hair = new THREE.Mesh(new THREE.DodecahedronGeometry(0.29, 0), material(variant.hair));
    hair.scale.set(0.88, 0.48, 0.86);
    hair.position.set(0, 0.22, -0.025);
    hair.castShadow = true;
    head.add(hair);
    const sideHair = lowPolyCapsule(0.07, 0.19, variant.hair, [0.72, 1, 0.72]);
    sideHair.position.set(-0.205, 0.1, -0.035);
    sideHair.rotation.z = -0.1;
    head.add(sideHair);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x161d20 });
    [-1, 1].forEach((side) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.033, 7, 5), eyeMaterial);
      eye.scale.y = 0.72;
      eye.position.set(side * 0.105, 0.055, 0.245);
      head.add(eye);
      const brow = box(0.085, 0.018, 0.018, shade(variant.hair, -0.08), [side * 0.105, 0.12, 0.25]);
      brow.rotation.z = side * -0.08;
      head.add(brow);
    });
    if (variant.hat === "beanie") {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), material(0x315b47));
      cap.scale.y = 0.82;
      cap.position.y = 0.25;
      cap.castShadow = true;
      head.add(cap);
      head.add(cylinder(0.285, 0.285, 0.1, 0x294c3c, 10).translateY(0.23));
    } else if (variant.hat === "cap") {
      const cap = lowPolySphere(0.3, 0x617365, [1, 0.45, 0.9]);
      cap.position.y = 0.25;
      head.add(cap);
      const brim = lowPolyCapsule(0.08, 0.25, 0x52655a, [1.45, 0.35, 0.9]);
      brim.rotation.x = Math.PI / 2;
      brim.position.set(0, 0.22, 0.27);
      head.add(brim);
    }
    body.add(head);

    const makeArm = (): { shoulder: THREE.Group; elbow: THREE.Group } => {
      const shoulder = new THREE.Group();
      const upper = cylinder(0.105, 0.12, 0.43, variant.jacket, 8);
      upper.position.y = -0.21;
      const elbow = new THREE.Group();
      elbow.position.y = -0.42;
      const lower = cylinder(0.085, 0.1, 0.4, shade(variant.jacket, -0.025), 8);
      lower.position.y = -0.2;
      const hand = lowPolySphere(0.105, variant.skin, [0.86, 1.02, 0.82]);
      hand.position.y = -0.43;
      elbow.add(lower, hand);
      shoulder.add(upper, elbow);
      return { shoulder, elbow };
    };
    const leftArmParts = makeArm();
    const rightArmParts = makeArm();
    const leftArm = leftArmParts.shoulder;
    const rightArm = rightArmParts.shoulder;
    leftArm.position.set(-0.37, 1.69, 0);
    rightArm.position.set(0.37, 1.69, 0);
    leftArm.rotation.z = -0.04;
    rightArm.rotation.z = 0.04;
    body.add(leftArm, rightArm);

    const makeLeg = (): { hip: THREE.Group; knee: THREE.Group; foot: THREE.Group; contacts: THREE.Object3D[] } => {
      const hip = new THREE.Group();
      const upper = cylinder(0.12, 0.135, 0.48, variant.pants, 8);
      upper.position.y = -0.24;
      const knee = new THREE.Group();
      knee.position.y = -0.47;
      const lower = cylinder(0.095, 0.115, 0.45, shade(variant.pants, -0.025), 8);
      lower.position.y = -0.22;
      const foot = new THREE.Group();
      foot.position.set(0, -0.47, 0.08);
      const shoe = lowPolyCapsule(0.12, 0.16, 0x18252b, [1.06, 0.82, 1]);
      shoe.rotation.x = Math.PI / 2;
      shoe.position.z = 0.07;
      foot.add(shoe);
      foot.add(box(0.22, 0.035, 0.34, 0xb8b5a5, [0, -0.115, 0.07]));
      const heelContact = new THREE.Object3D();
      const toeContact = new THREE.Object3D();
      heelContact.position.set(0, -0.134, -0.1);
      toeContact.position.set(0, -0.134, 0.24);
      foot.add(heelContact, toeContact);
      knee.add(lower, foot);
      hip.add(upper, knee);
      return { hip, knee, foot, contacts: [heelContact, toeContact] };
    };
    const leftLegParts = makeLeg();
    const rightLegParts = makeLeg();
    const leftLeg = leftLegParts.hip;
    const rightLeg = rightLegParts.hip;
    leftLeg.position.set(-0.17, 1.0, 0);
    rightLeg.position.set(0.17, 1.0, 0);
    body.add(leftLeg, rightLeg);

    if (variant.accessory === "backpack") {
      const pack = lowPolyCapsule(0.26, 0.25, 0x31463d, [0.92, 1.08, 0.48]);
      pack.position.set(0, 1.42, -0.29);
      body.add(pack);
      body.add(box(0.28, 0.18, 0.08, 0xc17b48, [0, 1.25, -0.49]));
      [-1, 1].forEach((side) => {
        const strap = box(0.055, 0.62, 0.035, 0x22372f, [side * 0.22, 1.45, 0.19]);
        strap.rotation.z = side * 0.08;
        body.add(strap);
      });
    } else if (variant.accessory === "bag") {
      const bag = lowPolyCapsule(0.22, 0.18, 0x875a3e, [0.95, 1, 0.48]);
      bag.position.set(0.48, 1.03, -0.02);
      body.add(bag);
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.025, 6, 20, Math.PI * 1.15), material(0x5e3d2c));
      strap.rotation.set(0, 0.25, -0.65);
      strap.position.set(0.13, 1.4, 0.01);
      body.add(strap);
    } else if (variant.accessory === "headphones") {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.04, 6, 14, Math.PI), material(0x28323a));
      band.rotation.z = Math.PI;
      band.position.y = 0.2;
      head.add(band);
      [-1, 1].forEach((side) => {
        const earCup = lowPolyCapsule(0.08, 0.04, 0x20292f, [0.55, 1, 0.68]);
        earCup.position.set(side * 0.255, 0, 0);
        head.add(earCup);
      });
    }

    const coffee = new THREE.Group();
    const cup = cylinder(0.095, 0.075, 0.3, 0xe8dfcf, 8);
    cup.add(cylinder(0.1, 0.1, 0.045, 0x42342c, 8).translateY(0.17));
    coffee.add(cup);
    coffee.position.set(0.08, -0.44, 0.16);
    rightArmParts.elbow.add(coffee);

    const flyers = new THREE.Group();
    for (let index = 0; index < 4; index += 1) {
      flyers.add(box(0.25, 0.02, 0.34, index % 2 ? 0xf1db70 : 0xdceae3, [0, index * 0.025, 0]));
    }
    flyers.position.set(0.08, -0.45, 0.18);
    rightArmParts.elbow.add(flyers);

    const guitar = new THREE.Group();
    const guitarLower = cylinder(0.22, 0.24, 0.12, 0xa96337, 12);
    guitarLower.rotation.x = Math.PI / 2;
    guitarLower.scale.y = 1.2;
    const guitarUpper = cylinder(0.16, 0.18, 0.12, 0xbe7542, 12);
    guitarUpper.rotation.x = Math.PI / 2;
    guitarUpper.position.y = 0.29;
    guitar.add(guitarLower, guitarUpper, box(0.09, 0.84, 0.08, 0x6f3f2b, [0, 0.75, 0]));
    guitar.rotation.z = -0.45;
    guitar.position.set(0.22, -0.38, 0.3);
    rightArmParts.elbow.add(guitar);

    const phone = new THREE.Group();
    phone.add(box(0.16, 0.28, 0.035, 0x1d272d));
    phone.add(box(0.125, 0.22, 0.012, 0x68a7aa, [0, 0, 0.025]));
    phone.position.set(0.06, -0.46, 0.15);
    phone.rotation.x = -0.38;
    rightArmParts.elbow.add(phone);

    const umbrella = new THREE.Group();
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.28, 12, 1, true), material(0x365b68));
    canopy.rotation.z = Math.PI;
    canopy.position.y = 1.25;
    umbrella.add(canopy, cylinder(0.025, 0.025, 1.65, 0x283439, 6).translateY(0.42));
    umbrella.position.set(0.06, -0.4, 0.08);
    rightArmParts.elbow.add(umbrella);

    const paper = new THREE.Group();
    paper.add(box(0.38, 0.45, 0.025, 0xe8dfc9));
    paper.add(box(0.27, 0.025, 0.012, 0x67777a, [0, 0.1, 0.022]));
    paper.add(box(0.23, 0.025, 0.012, 0x67777a, [0, 0.02, 0.022]));
    paper.position.set(0.06, -0.43, 0.16);
    rightArmParts.elbow.add(paper);

    const props = { coffee, flyers, guitar, phone, umbrella, paper };
    Object.values(props).forEach((prop) => prop.visible = false);
    const rig: CharacterRig = {
      root,
      body,
      head,
      leftArm,
      rightArm,
      leftElbow: leftArmParts.elbow,
      rightElbow: rightArmParts.elbow,
      leftLeg,
      rightLeg,
      leftKnee: leftLegParts.knee,
      rightKnee: rightLegParts.knee,
      leftFoot: leftLegParts.foot,
      rightFoot: rightLegParts.foot,
      footContacts: [...leftLegParts.contacts, ...rightLegParts.contacts],
      props,
      variant,
      held: "none",
      locomotion: { previousPosition: new THREE.Vector3(), initialized: false, phase: 0 },
    };
    root.userData.rig = rig;
    return rig;
  }

  setHeldProp(rig: CharacterRig, held: HeldProp): void {
    rig.held = held;
    Object.entries(rig.props).forEach(([name, prop]) => prop.visible = name === held);
  }

  resetLocomotion(rig: CharacterRig): void {
    rig.locomotion.previousPosition.copy(rig.root.position);
    rig.locomotion.initialized = true;
  }

  animate(rig: CharacterRig, options: CharacterAnimationOptions): CharacterAnimationFrame {
    const { time, delta, speed } = options;
    const running = options.running ?? false;
    const excitement = options.excitement ?? 0;
    const pose = options.pose ?? (speed > 0.03 ? (running ? "hurry" : "walk") : "idle");
    const locomotion = rig.locomotion;
    let movedDistance = 0;
    if (!locomotion.initialized) {
      locomotion.previousPosition.copy(rig.root.position);
      locomotion.initialized = true;
    } else {
      const dx = rig.root.position.x - locomotion.previousPosition.x;
      const dz = rig.root.position.z - locomotion.previousPosition.z;
      const distance = Math.hypot(dx, dz);
      movedDistance = distance > 2.4 ? 0 : distance;
      locomotion.previousPosition.copy(rig.root.position);
    }

    const previousPhase = locomotion.phase;
    locomotion.phase += gaitPhaseForDistance(movedDistance, running ? 1.85 : 1.45);
    const phase = locomotion.phase;
    const isLocomoting = movedDistance > 0.0001 && speed > 0.03;
    const blend = Math.min(1, delta * 12);
    const lerp = (from: number, to: number): number => THREE.MathUtils.lerp(from, to, blend);
    const gaitSwing = isLocomoting ? Math.sin(phase) * (running ? 0.58 : 0.42) : 0;
    const leftSwingLift = isLocomoting ? Math.max(0, Math.sin(phase + Math.PI / 2)) : 0;
    const rightSwingLift = isLocomoting ? Math.max(0, Math.sin(phase - Math.PI / 2)) : 0;
    const bounce = isLocomoting
      ? (1 - Math.cos(phase * 2)) * (running ? 0.035 : 0.022)
      : Math.sin(time * 2.1) * 0.01;

    rig.leftLeg.rotation.x = lerp(rig.leftLeg.rotation.x, gaitSwing);
    rig.rightLeg.rotation.x = lerp(rig.rightLeg.rotation.x, -gaitSwing);
    rig.leftKnee.rotation.x = lerp(rig.leftKnee.rotation.x, leftSwingLift * 0.58);
    rig.rightKnee.rotation.x = lerp(rig.rightKnee.rotation.x, rightSwingLift * 0.58);
    rig.leftFoot.rotation.x = lerp(rig.leftFoot.rotation.x, -gaitSwing * 0.42 - leftSwingLift * 0.18);
    rig.rightFoot.rotation.x = lerp(rig.rightFoot.rotation.x, gaitSwing * 0.42 - rightSwingLift * 0.18);
    rig.leftLeg.position.y = lerp(rig.leftLeg.position.y, 1.0 - bounce + leftSwingLift * 0.035);
    rig.rightLeg.position.y = lerp(rig.rightLeg.position.y, 1.0 - bounce + rightSwingLift * 0.035);

    const heldArm = rig.held === "coffee" || rig.held === "phone" || rig.held === "paper" || rig.held === "umbrella";
    rig.leftArm.rotation.x = lerp(rig.leftArm.rotation.x, isLocomoting ? -gaitSwing * (running ? 0.85 : 0.7) : 0);
    rig.rightArm.rotation.x = lerp(rig.rightArm.rotation.x, heldArm ? -0.48 : isLocomoting ? gaitSwing * (running ? 0.85 : 0.7) : 0);
    rig.leftElbow.rotation.x = lerp(rig.leftElbow.rotation.x, running ? -0.48 : 0);
    rig.rightElbow.rotation.x = lerp(rig.rightElbow.rotation.x, running && !heldArm ? -0.48 : 0);
    rig.leftArm.rotation.z = lerp(rig.leftArm.rotation.z, -0.04);
    rig.rightArm.rotation.z = lerp(rig.rightArm.rotation.z, rig.held === "guitar" ? -0.48 : 0.04);
    rig.head.rotation.x = lerp(rig.head.rotation.x, 0);
    rig.head.rotation.y = lerp(rig.head.rotation.y, isLocomoting ? Math.sin(phase * 0.5) * 0.045 : Math.sin(time * 0.7) * 0.055);
    rig.body.rotation.x = lerp(rig.body.rotation.x, (rig.variant.posture ?? 0) + (running ? 0.13 : 0));
    rig.body.rotation.z = lerp(rig.body.rotation.z, isLocomoting ? Math.sin(phase * 0.5) * 0.032 : Math.sin(time * 1.1) * 0.008);
    rig.body.position.y = lerp(rig.body.position.y, bounce + Math.max(0, Math.sin(time * 7)) * excitement * 0.07);

    if (pose === "talk") {
      rig.leftArm.rotation.x = lerp(rig.leftArm.rotation.x, -0.4 - Math.sin(time * 3.1) * 0.2);
      rig.leftArm.rotation.z = lerp(rig.leftArm.rotation.z, -0.38);
      rig.leftElbow.rotation.x = lerp(rig.leftElbow.rotation.x, -0.65);
      rig.rightElbow.rotation.x = lerp(rig.rightElbow.rotation.x, -0.24 + Math.sin(time * 2.3) * 0.2);
      rig.head.rotation.y = lerp(rig.head.rotation.y, Math.sin(time * 1.9) * 0.12);
      rig.body.position.y += Math.max(0, Math.sin(time * 3.1)) * 0.02;
    } else if (pose === "phone") {
      rig.rightArm.rotation.x = lerp(rig.rightArm.rotation.x, -0.72);
      rig.rightArm.rotation.z = lerp(rig.rightArm.rotation.z, -0.18);
      rig.rightElbow.rotation.x = lerp(rig.rightElbow.rotation.x, -0.76);
      rig.leftArm.rotation.x = lerp(rig.leftArm.rotation.x, -0.35);
      rig.leftElbow.rotation.x = lerp(rig.leftElbow.rotation.x, -0.6);
      rig.head.rotation.x = lerp(rig.head.rotation.x, 0.28);
      rig.body.rotation.x = lerp(rig.body.rotation.x, 0.1);
    } else if (pose === "sit") {
      rig.body.position.y = lerp(rig.body.position.y, -0.43);
      rig.body.rotation.x = lerp(rig.body.rotation.x, -0.08);
      rig.leftLeg.rotation.x = lerp(rig.leftLeg.rotation.x, -1.28);
      rig.rightLeg.rotation.x = lerp(rig.rightLeg.rotation.x, -1.28);
      rig.leftKnee.rotation.x = lerp(rig.leftKnee.rotation.x, 1.12);
      rig.rightKnee.rotation.x = lerp(rig.rightKnee.rotation.x, 1.12);
      rig.leftFoot.rotation.x = lerp(rig.leftFoot.rotation.x, 0.16);
      rig.rightFoot.rotation.x = lerp(rig.rightFoot.rotation.x, 0.16);
      rig.head.rotation.y = lerp(rig.head.rotation.y, Math.sin(time * 0.45) * 0.12);
    } else if (pose === "look") {
      rig.body.rotation.x = lerp(rig.body.rotation.x, 0.13);
      rig.head.rotation.x = lerp(rig.head.rotation.x, -0.08);
      rig.head.rotation.y = lerp(rig.head.rotation.y, Math.sin(time * 0.65) * 0.12);
      rig.leftArm.rotation.x = lerp(rig.leftArm.rotation.x, -0.12);
      rig.rightArm.rotation.x = lerp(rig.rightArm.rotation.x, -0.12);
    } else if (pose === "wait") {
      rig.rightArm.rotation.x = lerp(rig.rightArm.rotation.x, -0.45);
      rig.rightElbow.rotation.x = lerp(rig.rightElbow.rotation.x, -0.72);
      rig.head.rotation.y = lerp(rig.head.rotation.y, 0.35 + Math.sin(time * 1.2) * 0.08);
      rig.leftFoot.rotation.x = lerp(rig.leftFoot.rotation.x, Math.sin(time * 1.8) * 0.06);
    } else if (pose === "accept") {
      rig.head.rotation.x = lerp(rig.head.rotation.x, Math.sin(time * 11) * 0.24 + 0.08);
      rig.body.rotation.x = lerp(rig.body.rotation.x, Math.max(0, Math.sin(time * 5.5)) * 0.08);
      rig.leftArm.rotation.x = lerp(rig.leftArm.rotation.x, -0.55);
      rig.leftElbow.rotation.x = lerp(rig.leftElbow.rotation.x, -0.8);
      rig.body.scale.setScalar(1 + Math.max(0, Math.sin(time * 7)) * 0.035);
    } else if (pose === "decline") {
      rig.head.rotation.y = lerp(rig.head.rotation.y, Math.sin(time * 10) * 0.3);
      rig.body.rotation.x = lerp(rig.body.rotation.x, -0.12);
      rig.leftArm.rotation.x = lerp(rig.leftArm.rotation.x, -0.35);
      rig.leftArm.rotation.z = lerp(rig.leftArm.rotation.z, -0.9);
      rig.leftElbow.rotation.x = lerp(rig.leftElbow.rotation.x, -0.35);
      rig.body.scale.lerp(new THREE.Vector3(1, 1, 1), blend);
    } else if (pose === "angry") {
      rig.head.rotation.y = lerp(rig.head.rotation.y, Math.sin(time * 13) * 0.23);
      rig.head.rotation.x = lerp(rig.head.rotation.x, -0.12);
      rig.leftArm.rotation.z = lerp(rig.leftArm.rotation.z, -2.45 + Math.sin(time * 15) * 0.16);
      rig.leftArm.rotation.x = lerp(rig.leftArm.rotation.x, -0.3);
      rig.leftElbow.rotation.x = lerp(rig.leftElbow.rotation.x, -0.8 + Math.sin(time * 15) * 0.25);
      rig.body.rotation.x = lerp(rig.body.rotation.x, 0.14);
      rig.body.scale.setScalar(1 + Math.max(0, Math.sin(time * 8)) * 0.045);
    } else {
      rig.body.scale.lerp(new THREE.Vector3(1, 1, 1), blend);
    }

    if (pose !== "sit") this.plantFeet(rig);

    return {
      movedDistance,
      footstep: isLocomoting && crossedFootfall(previousPhase, phase),
      phase,
    };
  }

  private plantFeet(rig: CharacterRig): void {
    rig.root.updateWorldMatrix(true, true);
    let lowest = Number.POSITIVE_INFINITY;
    rig.footContacts.forEach((contact) => {
      const local = rig.root.worldToLocal(contact.getWorldPosition(new THREE.Vector3()));
      lowest = Math.min(lowest, local.y);
    });
    if (Number.isFinite(lowest)) {
      rig.body.position.y -= lowest;
      rig.root.updateWorldMatrix(true, true);
    }
  }
}
