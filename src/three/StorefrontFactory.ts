import * as THREE from "three";
import { box, createLabel, material, PALETTE } from "./visual";

export interface StorefrontOptions {
  width: number;
  height: number;
  facade: number;
  trim: number;
  sign: string;
  signBackground?: string;
  awning?: number;
}

export class StorefrontFactory {
  create(options: StorefrontOptions): { facade: THREE.Group; windows: THREE.Mesh[]; door: THREE.Group } {
    const facade = new THREE.Group();
    const windows: THREE.Mesh[] = [];
    const { width, height } = options;
    facade.add(box(width, height, 0.28, options.facade, [0, height / 2, 0]));

    const openingY = height * 0.43;
    const windowMaterial = new THREE.MeshStandardMaterial({
      color: 0x8eadae,
      emissive: PALETTE.window,
      emissiveIntensity: 0.16,
      roughness: 0.25,
      transparent: true,
      opacity: 0.78,
    });
    [-1, 1].forEach((side) => {
      const pane = new THREE.Mesh(new THREE.BoxGeometry(width * 0.27, height * 0.42, 0.06), windowMaterial.clone());
      pane.position.set(side * width * 0.27, openingY, 0.18);
      pane.userData.windowLight = true;
      pane.castShadow = false;
      windows.push(pane);
      facade.add(pane);
      facade.add(box(0.07, height * 0.44, 0.09, options.trim, [side * width * 0.27, openingY, 0.22]));
      facade.add(box(width * 0.29, 0.07, 0.09, options.trim, [side * width * 0.27, openingY, 0.22]));
    });

    const door = new THREE.Group();
    door.position.set(0, height * 0.27, 0.2);
    door.add(box(width * 0.18, height * 0.54, 0.09, 0x31454a));
    const doorGlass = box(width * 0.135, height * 0.31, 0.04, 0x86a6a8, [0, height * 0.075, 0.07]);
    doorGlass.material.transparent = true;
    doorGlass.material.opacity = 0.72;
    door.add(doorGlass);
    door.add(box(0.05, 0.05, 0.08, 0xe1bd64, [width * 0.055, -height * 0.1, 0.09]));
    facade.add(door);

    const sign = createLabel(
      options.sign,
      "#f1e9d2",
      options.signBackground ?? "#183137",
      520,
      92,
    );
    sign.scale.setScalar(Math.min(1, width / 6));
    sign.position.set(0, height * 0.82, 0.2);
    facade.add(sign);

    if (options.awning) {
      const awning = new THREE.Group();
      for (let index = 0; index < 8; index += 1) {
        const stripe = box(width / 8, 0.16, 0.72, index % 2 ? options.awning : options.trim);
        stripe.position.set(-width / 2 + width / 16 + index * width / 8, height * 0.68, 0.42);
        stripe.rotation.x = -0.18;
        awning.add(stripe);
      }
      facade.add(awning);
    }

    const cornice = box(width + 0.24, 0.2, 0.42, options.trim, [0, height - 0.08, 0.02]);
    facade.add(cornice);
    return { facade, windows, door };
  }

  createWindowDisplay(kind: "coffee" | "music" | "apartment" | "jobs"): THREE.Group {
    const group = new THREE.Group();
    if (kind === "coffee") {
      const table = box(1.5, 0.12, 0.55, 0x805b3c, [0, 0.65, 0]);
      group.add(table, box(0.12, 0.65, 0.12, 0x503c30, [-0.5, 0.32, 0]));
      group.add(box(0.12, 0.65, 0.12, 0x503c30, [0.5, 0.32, 0]));
      [-0.45, 0, 0.45].forEach((x, index) => {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.085, 0.26, 8), material(index === 1 ? 0xe2c364 : 0xeee4d3));
        cup.position.set(x, 0.84, 0);
        group.add(cup);
      });
    } else if (kind === "music") {
      [-0.55, 0.45].forEach((x, index) => {
        const guitar = new THREE.Group();
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), material(index ? 0x48727a : 0xb2673e));
        body.scale.set(0.78, 1, 0.22);
        guitar.add(body, box(0.09, 0.88, 0.08, 0x68442f, [0, 0.65, 0]));
        guitar.position.set(x, 0.72, 0);
        guitar.rotation.z = index ? 0.16 : -0.12;
        group.add(guitar);
      });
    } else if (kind === "apartment") {
      group.add(box(1.4, 0.56, 0.7, 0x69665a, [0, 0.3, 0]));
      group.add(box(0.7, 0.14, 0.55, 0x9a7654, [0.15, 0.72, 0]));
    } else {
      const board = box(1.85, 1.25, 0.12, 0x8d6a48, [0, 0.78, 0]);
      group.add(board);
      for (let index = 0; index < 8; index += 1) {
        const paper = box(0.35, 0.32, 0.02, index % 3 === 0 ? 0xe6cf75 : 0xe5dfca, [
          -0.6 + (index % 3) * 0.6,
          0.48 + Math.floor(index / 3) * 0.38,
          0.08,
        ]);
        paper.rotation.z = (index % 2 ? -1 : 1) * 0.04;
        group.add(paper);
      }
    }
    return group;
  }
}
