import * as THREE from "three";
import { box, createLabel, cylinder, material, PALETTE } from "./visual";

export class PropFactory {
  createTree(seed = 0): THREE.Group {
    const group = new THREE.Group();
    const trunk = cylinder(0.16, 0.22, 2.3, 0x604637, 7);
    trunk.position.y = 1.15;
    group.add(trunk);
    const greens = [0x426250, 0x4d7057, 0x365a49];
    for (let index = 0; index < 4; index += 1) {
      const crown = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.78 - index * 0.07, 0),
        material(greens[(index + seed) % greens.length]),
      );
      crown.position.set(
        Math.sin(seed * 2.7 + index) * 0.25,
        2.2 + index * 0.38,
        Math.cos(seed + index * 1.7) * 0.2,
      );
      crown.scale.set(1.15, 0.92, 1);
      crown.castShadow = true;
      group.add(crown);
    }
    return group;
  }

  createPlanter(seed = 0): THREE.Group {
    const group = new THREE.Group();
    group.add(box(1.15, 0.55, 0.72, 0x735441, [0, 0.28, 0]));
    group.add(box(1.02, 0.12, 0.62, 0x2e352f, [0, 0.56, 0]));
    for (let index = 0; index < 5; index += 1) {
      const leaf = new THREE.Mesh(
        new THREE.ConeGeometry(0.2, 0.65 + (index % 2) * 0.2, 6),
        material(index % 2 ? 0x5d7856 : 0x41674e),
      );
      leaf.position.set(-0.4 + index * 0.2, 0.88 + (index % 2) * 0.08, Math.sin(seed + index) * 0.16);
      leaf.rotation.z = (index - 2) * 0.08;
      leaf.castShadow = true;
      group.add(leaf);
    }
    return group;
  }

  createBench(): THREE.Group {
    const group = new THREE.Group();
    [-0.42, 0.42].forEach((x) => {
      group.add(box(0.12, 0.68, 0.12, 0x2c3436, [x, 0.34, 0]));
    });
    for (let index = 0; index < 3; index += 1) {
      group.add(box(1.25, 0.12, 0.22, 0x7c5237, [0, 0.66 + index * 0.24, 0.18]));
    }
    group.add(box(1.25, 0.12, 0.48, 0x835a3c, [0, 0.65, -0.13]));
    return group;
  }

  createStreetlight(): THREE.Group {
    const group = new THREE.Group();
    group.add(cylinder(0.08, 0.12, 3.4, 0x253238, 8).translateY(1.7));
    group.add(box(0.16, 0.18, 0.9, 0x253238, [0.36, 3.24, 0]));
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.25, 8), material(0x26343a));
    shade.rotation.z = Math.PI;
    shade.position.set(0.72, 3.05, 0);
    group.add(shade);
    const bulbMaterial = new THREE.MeshStandardMaterial({
      color: PALETTE.window,
      emissive: PALETTE.window,
      emissiveIntensity: 0,
      roughness: 0.5,
    });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), bulbMaterial);
    bulb.position.set(0.72, 2.92, 0);
    bulb.userData.windowLight = true;
    group.add(bulb);
    return group;
  }

  createTrashCan(): THREE.Group {
    const group = new THREE.Group();
    group.add(cylinder(0.32, 0.29, 0.72, 0x35464a, 10).translateY(0.36));
    group.add(cylinder(0.35, 0.35, 0.08, 0x233239, 10).translateY(0.75));
    for (let index = 0; index < 6; index += 1) {
      group.add(box(0.025, 0.55, 0.34, 0x536267, [Math.cos(index) * 0.12, 0.37, Math.sin(index) * 0.12]));
    }
    return group;
  }

  createUtilityPole(): THREE.Group {
    const group = new THREE.Group();
    group.add(cylinder(0.12, 0.16, 4.5, 0x514136, 8).translateY(2.25));
    group.add(box(1.2, 0.13, 0.14, 0x3c3430, [0, 3.92, 0]));
    [-0.46, 0.46].forEach((x) => {
      const insulator = cylinder(0.07, 0.09, 0.18, 0x89a49d, 8);
      insulator.position.set(x, 4.09, 0);
      group.add(insulator);
    });
    const poster = createLabel("SHOW 8PM", "#1b2d34", "#e7c55a", 220, 110);
    poster.scale.setScalar(0.42);
    poster.position.set(0, 1.62, 0.17);
    group.add(poster);
    return group;
  }

  createPuddle(width = 1.4, depth = 0.7): THREE.Mesh {
    const geometry = new THREE.CircleGeometry(0.5, 16);
    geometry.scale(width, depth, 1);
    const puddle = new THREE.Mesh(
      geometry,
      new THREE.MeshPhysicalMaterial({
        color: 0x66818b,
        transparent: true,
        opacity: 0.48,
        roughness: 0.18,
        metalness: 0.1,
        clearcoat: 0.8,
      }),
    );
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.y = 0.018;
    puddle.receiveShadow = true;
    return puddle;
  }

  createGuitarCase(): THREE.Group {
    const group = new THREE.Group();
    const caseBody = box(0.54, 0.12, 1.25, 0x2b2522, [0, 0.07, 0]);
    group.add(caseBody);
    const lining = box(0.44, 0.025, 1.12, 0x8a4035, [0, 0.145, 0]);
    lining.material.roughness = 1;
    group.add(lining);
    return group;
  }
}
