import * as THREE from "three";
import type { LocationId } from "../game/types";
import { BuildingFactory, type BuildingVisual } from "./BuildingFactory";
import { PropFactory } from "./PropFactory";
import { box, createLabel, cylinder, material, PALETTE } from "./visual";

export interface WorldObstacle {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface BlockWorld {
  root: THREE.Group;
  buildings: Map<LocationId, BuildingVisual>;
  locationPoints: Map<LocationId, THREE.Vector3>;
  obstacles: WorldObstacle[];
  mountain: THREE.Group;
  performanceArea: THREE.Group;
  caseTarget: THREE.Vector3;
}

export class StreetSectionFactory {
  private readonly buildings = new BuildingFactory();
  private readonly props = new PropFactory();

  createBlock(): BlockWorld {
    const root = new THREE.Group();
    const buildingMap = new Map<LocationId, BuildingVisual>();
    const points = new Map<LocationId, THREE.Vector3>();
    const obstacles: WorldObstacle[] = [];

    const ground = box(42, 0.22, 22, 0x314044, [0, -0.14, 0]);
    ground.receiveShadow = true;
    root.add(ground);
    root.add(box(42, 0.18, 5.1, PALETTE.sidewalk, [0, 0.02, -2.15]));
    root.add(box(42, 0.15, 6.7, PALETTE.pavement, [0, -0.02, 3.75]));
    root.add(box(42, 0.2, 0.28, 0xa9a99a, [0, 0.09, 0.48]));
    root.add(box(42, 0.2, 0.28, 0x9a9b8e, [0, 0.09, 7.02]));

    for (let index = 0; index < 8; index += 1) {
      root.add(box(1.7, 0.012, 0.13, 0x9b9c8b, [-17 + index * 5, 0.08, 3.72]));
    }
    for (let index = 0; index < 7; index += 1) {
      root.add(box(0.72, 0.03, 1.04, 0xe8e4d2, [15.8, 0.1, 1.1 + index * 0.82]));
    }
    for (let index = 0; index < 6; index += 1) {
      root.add(box(0.02, 0.025, 5.1, 0x555e5e, [-18 + index * 7.2, 0.125, -2.15]));
    }

    this.addBuilding(root, buildingMap, points, obstacles, -9.8, {
      id: "music-store",
      width: 5.2,
      height: 3.6,
      depth: 3.2,
      floors: 2,
      facade: 0x5b4038,
      trim: 0x292f31,
      sign: "MOSSBACK MUSIC",
      kind: "music",
      awning: 0x7b463a,
    });
    this.addBuilding(root, buildingMap, points, obstacles, -3.8, {
      id: "coffee",
      width: 5.6,
      height: 3.5,
      depth: 3.4,
      floors: 1,
      facade: 0x385951,
      trim: 0x1c3031,
      sign: "DRIZZLE & STEAM",
      kind: "coffee",
      awning: 0xc28b50,
    });
    this.addBuilding(root, buildingMap, points, obstacles, 2.5, {
      id: "apartment",
      width: 5.4,
      height: 3.7,
      depth: 3.5,
      floors: 3,
      facade: 0x536066,
      trim: 0x27363c,
      sign: "TINY APARTMENT",
      kind: "apartment",
      awning: 0x97704a,
    });
    this.addBuilding(root, buildingMap, points, obstacles, 8.4, {
      id: "job-board",
      width: 5.2,
      height: 3.5,
      depth: 3.3,
      floors: 2,
      facade: 0x655748,
      trim: 0x303633,
      sign: "JOBS, PROBABLY",
      kind: "jobs",
    });

    const park = this.createPark();
    park.position.set(-15.6, 0, -2.2);
    root.add(park);
    points.set("park", new THREE.Vector3(-15.4, 0, -0.05));
    obstacles.push({ minX: -18.2, maxX: -17, minZ: -3.8, maxZ: -2.5 });

    const neighboringFacade = box(6.2, 5.8, 3.6, 0x475459, [14.4, 2.88, -4.5]);
    root.add(neighboringFacade);
    const fadedSign = createLabel("MORE CITY →", "#9fb3ae", "#37484b", 430, 82);
    fadedSign.position.set(14.4, 3.15, -2.68);
    root.add(fadedSign);

    [-12.5, -6.6, 0.2, 6.1, 11.8].forEach((x, index) => {
      const streetlight = this.props.createStreetlight();
      streetlight.position.set(x, 0.12, 0.18);
      if (index % 2) streetlight.rotation.y = Math.PI;
      root.add(streetlight);
    });
    [-7.1, 5.8].forEach((x, index) => {
      const planter = this.props.createPlanter(index);
      planter.position.set(x, 0.12, -0.12);
      root.add(planter);
      obstacles.push({ minX: x - 0.65, maxX: x + 0.65, minZ: -0.52, maxZ: 0.3 });
    });
    const trash = this.props.createTrashCan();
    trash.position.set(10.9, 0.12, -0.28);
    root.add(trash);
    obstacles.push({ minX: 10.5, maxX: 11.3, minZ: -0.7, maxZ: 0.1 });
    const pole = this.props.createUtilityPole();
    pole.position.set(12.8, 0.12, -0.1);
    root.add(pole);

    [[-5.5, 2.4, 1.5, 0.72], [2.1, 4.8, 2, 0.8], [10.2, 2.1, 1.2, 0.55], [-13.2, 5.7, 1.8, 0.62]].forEach(
      ([x, z, w, d], index) => {
        const puddle = this.props.createPuddle(w, d);
        puddle.position.set(x, 0.11, z);
        puddle.rotation.z = index * 0.5;
        root.add(puddle);
      },
    );

    const { skyline, mountain } = this.createHorizon();
    root.add(skyline, mountain);
    const performanceArea = park.getObjectByName("performance-area") as THREE.Group;
    const caseTarget = new THREE.Vector3(-15.4, 0.22, -1.2);
    return { root, buildings: buildingMap, locationPoints: points, obstacles, mountain, performanceArea, caseTarget };
  }

  private addBuilding(
    root: THREE.Group,
    buildingMap: Map<LocationId, BuildingVisual>,
    points: Map<LocationId, THREE.Vector3>,
    obstacles: WorldObstacle[],
    x: number,
    options: Parameters<BuildingFactory["create"]>[0],
  ): void {
    const building = this.buildings.create(options);
    building.root.position.set(x, 0.12, -4.6);
    building.entrance.set(x, 0, -0.65);
    root.add(building.root);
    buildingMap.set(options.id, building);
    points.set(options.id, building.entrance.clone());
    obstacles.push({
      minX: x - options.width / 2 - 0.1,
      maxX: x + options.width / 2 + 0.1,
      minZ: -7.8,
      maxZ: -1.05,
    });
  }

  private createPark(): THREE.Group {
    const park = new THREE.Group();
    park.add(box(6.5, 0.16, 4.7, 0x526550, [0, 0.08, 0]));
    const border = box(6.7, 0.3, 0.2, 0x4d5551, [0, 0.15, 2.35]);
    park.add(border);
    [-2.25, 1.85].forEach((x, index) => {
      const tree = this.props.createTree(index + 4);
      tree.position.set(x, 0.16, -1.1 + index * 0.15);
      park.add(tree);
    });
    const bench = this.props.createBench();
    bench.position.set(-2.1, 0.16, 1.15);
    bench.rotation.y = 0.15;
    park.add(bench);
    const performance = new THREE.Group();
    performance.name = "performance-area";
    performance.position.set(0.2, 0.17, 0.15);
    const rug = box(2.65, 0.035, 1.7, 0x6d3e3f, [0, 0.02, 0]);
    rug.material.roughness = 1;
    performance.add(rug);
    for (let index = 0; index < 5; index += 1) {
      performance.add(box(0.12, 0.04, 1.68, index % 2 ? 0xd4a953 : 0x416c65, [-1.1 + index * 0.55, 0.045, 0]));
    }
    const caseGroup = this.props.createGuitarCase();
    caseGroup.position.set(0, 0.04, 1.15);
    performance.add(caseGroup);
    const sign = createLabel("MOSSY POCKET PARK", "#deeadc", "#315342", 450, 76);
    sign.scale.setScalar(0.62);
    sign.position.set(0, 2.15, -2.18);
    performance.add(sign);
    park.add(performance);
    return park;
  }

  private createHorizon(): { skyline: THREE.Group; mountain: THREE.Group } {
    const skyline = new THREE.Group();
    skyline.position.set(0, 0, -15);
    const colors = [0x42545e, 0x50616a, 0x394d59];
    for (let index = 0; index < 18; index += 1) {
      const height = 2.8 + ((index * 7) % 6) * 0.55;
      const building = box(1.8 + (index % 3) * 0.35, height, 1.8, colors[index % colors.length], [
        -21 + index * 2.5,
        height / 2,
        (index % 3) * 0.6,
      ]);
      skyline.add(building);
      for (let floor = 0; floor < Math.floor(height / 0.75); floor += 1) {
        if ((floor + index) % 2) continue;
        const window = box(0.18, 0.18, 0.04, 0xd3a158, [
          -21 + index * 2.5,
          0.55 + floor * 0.72,
          0.94 + (index % 3) * 0.6,
        ]);
        window.material.emissive.setHex(0xf1b861);
        window.material.emissiveIntensity = 0;
        window.userData.windowLight = true;
        skyline.add(window);
      }
    }
    const needle = new THREE.Group();
    needle.position.set(-3.2, 0, 1.2);
    needle.add(cylinder(0.09, 0.13, 6.5, 0x66757a, 8).translateY(3.25));
    const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.0, 0.34, 16), material(0x738186));
    saucer.position.y = 5.6;
    needle.add(saucer);
    skyline.add(needle);

    const mountain = new THREE.Group();
    mountain.position.set(9.2, 1.3, -18);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(5.4, 6.8, 9), material(0x8da4a4));
    cone.scale.z = 0.45;
    cone.rotation.y = 0.15;
    cone.position.y = 3.1;
    mountain.add(cone);
    const snow = new THREE.Mesh(new THREE.ConeGeometry(2.7, 2.9, 9), material(0xd8dfd9));
    snow.scale.z = 0.46;
    snow.rotation.y = 0.15;
    snow.position.y = 5.05;
    mountain.add(snow);
    mountain.traverse((child) => child.renderOrder = -2);
    return { skyline, mountain };
  }
}
