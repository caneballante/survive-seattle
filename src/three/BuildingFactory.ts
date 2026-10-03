import * as THREE from "three";
import type { LocationId } from "../game/types";
import { PropFactory } from "./PropFactory";
import { StorefrontFactory } from "./StorefrontFactory";
import { box, createLabel, material } from "./visual";

export interface BuildingVisual {
  id: LocationId;
  root: THREE.Group;
  front: THREE.Group;
  interior: THREE.Group;
  entrance: THREE.Vector3;
  width: number;
  reveal: number;
}

interface BuildingOptions {
  id: LocationId;
  width: number;
  height: number;
  depth: number;
  floors: number;
  facade: number;
  trim: number;
  sign: string;
  kind: "coffee" | "music" | "apartment" | "jobs";
  awning?: number;
}

export class BuildingFactory {
  private readonly storefronts = new StorefrontFactory();
  private readonly props = new PropFactory();

  create(options: BuildingOptions): BuildingVisual {
    const root = new THREE.Group();
    const front = new THREE.Group();
    const interior = new THREE.Group();
    const { width, height, depth } = options;

    const shellHeight = height + Math.max(0, options.floors - 1) * 1.25;
    root.add(box(width, shellHeight, depth, options.facade, [0, shellHeight / 2, -depth / 2]));
    const roof = box(width + 0.28, 0.24, depth + 0.3, options.trim, [0, shellHeight + 0.08, -depth / 2]);
    root.add(roof);
    const vent = box(0.75, 0.42, 0.7, 0x4f5b58, [width * 0.22, shellHeight + 0.35, -depth * 0.57]);
    root.add(vent);
    if (options.floors > 1) {
      for (let floor = 1; floor < options.floors; floor += 1) {
        for (let index = 0; index < Math.max(2, Math.floor(width / 1.5)); index += 1) {
          const window = box(0.68, 0.62, 0.05, 0x789294, [
            -width / 2 + 0.7 + index * ((width - 1.4) / Math.max(1, Math.floor(width / 1.5) - 1)),
            height + (floor - 0.5) * 1.2,
            0.02,
          ]);
          window.material.emissive.setHex(0xf0b65c);
          window.material.emissiveIntensity = 0.08;
          window.userData.windowLight = true;
          front.add(window);
        }
      }
    }

    const store = this.storefronts.create({
      width,
      height,
      facade: options.facade,
      trim: options.trim,
      sign: options.sign,
      awning: options.awning,
      signBackground: options.kind === "music" ? "#56352f" : options.kind === "coffee" ? "#24473e" : "#20343c",
    });
    front.add(store.facade);
    root.add(front);

    interior.position.set(0, 0, -0.48);
    interior.add(box(width - 0.5, 0.08, depth - 0.45, 0x504a3f, [0, 0.05, -depth * 0.3]));
    const display = this.storefronts.createWindowDisplay(options.kind);
    display.position.set(options.kind === "music" ? -0.8 : 0.8, 0, -0.12);
    interior.add(display);
    if (options.kind === "coffee") this.decorateCoffee(interior, width, depth);
    if (options.kind === "music") this.decorateMusic(interior, width, depth);
    if (options.kind === "apartment") this.decorateApartment(interior);
    if (options.kind === "jobs") this.decorateJobs(interior);
    root.add(interior);

    return {
      id: options.id,
      root,
      front,
      interior,
      entrance: new THREE.Vector3(0, 0, 1.25),
      width,
      reveal: 0,
    };
  }

  private decorateCoffee(interior: THREE.Group, width: number, depth: number): void {
    interior.add(box(width * 0.64, 0.72, 0.58, 0x624631, [0, 0.36, -depth * 0.55]));
    interior.add(box(width * 0.64, 0.08, 0.68, 0xb27a4a, [0, 0.75, -depth * 0.55]));
    const espresso = box(0.65, 0.42, 0.35, 0x7b8682, [-0.65, 1.0, -depth * 0.52]);
    interior.add(espresso);
    for (let index = 0; index < 4; index += 1) {
      const lamp = new THREE.PointLight(0xffc36b, 0.36, 3.2);
      lamp.position.set(-width * 0.33 + index * width * 0.22, 2.2, -depth * 0.45);
      interior.add(lamp);
    }
    const menu = createLabel("ESPRESSO · DRIP · OAT", "#eee7cc", "#263734", 500, 120);
    menu.scale.setScalar(0.5);
    menu.position.set(0, 1.7, -depth + 0.22);
    interior.add(menu);
    const planter = this.props.createPlanter(4);
    planter.scale.setScalar(0.62);
    planter.position.set(width * 0.38, 0, -depth * 0.55);
    interior.add(planter);
  }

  private decorateMusic(interior: THREE.Group, width: number, depth: number): void {
    const back = box(width - 0.6, 1.7, 0.12, 0x3f302a, [0, 1.2, -depth + 0.25]);
    interior.add(back);
    for (let index = 0; index < 5; index += 1) {
      const guitar = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 7), material(index % 2 ? 0x4f7372 : 0xaa613d));
      body.scale.set(0.72, 1, 0.22);
      guitar.add(body, box(0.075, 0.75, 0.07, 0x725039, [0, 0.56, 0]));
      guitar.position.set(-width * 0.34 + index * width * 0.17, 0.78, -depth + 0.12);
      interior.add(guitar);
    }
    const amp = box(0.8, 0.8, 0.5, 0x222a2b, [width * 0.3, 0.42, -depth * 0.45]);
    amp.add(new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.035, 6, 16), material(0x7e8580)));
    interior.add(amp);
    const lamp = new THREE.PointLight(0xffaa67, 0.48, 4);
    lamp.position.set(0, 2.3, -depth * 0.45);
    interior.add(lamp);
  }

  private decorateApartment(interior: THREE.Group): void {
    const sofa = box(1.6, 0.62, 0.72, 0x566c68, [-0.8, 0.33, -1.25]);
    interior.add(sofa, box(1.6, 0.62, 0.18, 0x4d625f, [-0.8, 0.66, -1.56]));
    const lamp = new THREE.PointLight(0xffb95e, 0.4, 3.5);
    lamp.position.set(1.1, 1.8, -1.3);
    interior.add(lamp);
  }

  private decorateJobs(interior: THREE.Group): void {
    const board = this.storefronts.createWindowDisplay("jobs");
    board.position.set(0, 0.2, -1.3);
    interior.add(board);
  }
}
