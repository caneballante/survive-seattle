import * as THREE from "three";
import { sampleAtmosphere } from "../game/atmosphere";
import type { GameSnapshot } from "../game/types";
import { material } from "./visual";

interface Cloud {
  root: THREE.Group;
  speed: number;
  baseX: number;
  depth: number;
}

export class WeatherSystem {
  readonly root = new THREE.Group();
  private readonly clouds: Cloud[] = [];
  private readonly rain: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private snapshot: Readonly<GameSnapshot>;

  constructor(snapshot: Readonly<GameSnapshot>, private readonly mountain: THREE.Group) {
    this.snapshot = snapshot;
    for (let index = 0; index < 11; index += 1) {
      const cloud = new THREE.Group();
      const color = 0xb4c0c1;
      for (let puff = 0; puff < 5; puff += 1) {
        const piece = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75 + (puff % 3) * 0.25, 0), material(color, 1));
        piece.scale.y = 0.55;
        piece.position.set(puff * 0.75, Math.sin(puff * 2.3) * 0.25, Math.cos(puff) * 0.22);
        piece.castShadow = false;
        cloud.add(piece);
      }
      const depth = -9 - (index % 3) * 4;
      const baseX = -23 + index * 5;
      cloud.position.set(baseX, 9 + (index % 3) * 1.5, depth);
      cloud.scale.setScalar(0.75 + (index % 3) * 0.18);
      this.clouds.push({ root: cloud, speed: 0.15 + (index % 3) * 0.08, baseX, depth });
      this.root.add(cloud);
    }

    const positions = new Float32Array(560 * 3);
    for (let index = 0; index < 560; index += 1) {
      positions[index * 3] = -22 + Math.random() * 44;
      positions[index * 3 + 1] = 1 + Math.random() * 15;
      positions[index * 3 + 2] = -7 + Math.random() * 17;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.rain = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color: 0xb7dce4, size: 0.06, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    this.rain.visible = false;
    this.root.add(this.rain);
  }

  setSnapshot(snapshot: Readonly<GameSnapshot>): void {
    this.snapshot = snapshot;
  }

  update(time: number, delta: number): void {
    const atmosphere = sampleAtmosphere(this.snapshot.minutes, this.snapshot.weather);
    this.clouds.forEach((cloud, index) => {
      cloud.root.position.x = cloud.baseX + ((time * cloud.speed + index * 7) % 54);
      if (cloud.root.position.x > 28) cloud.root.position.x -= 54;
      cloud.root.position.z = cloud.depth + Math.sin(time * 0.08 + index) * 0.2;
      cloud.root.visible = index / this.clouds.length < Math.max(0.22, atmosphere.cloudiness);
      cloud.root.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.color.setHex(atmosphere.cloudColor);
        }
      });
    });

    const rainPulse = Math.sin(time * 0.075) + Math.sin(time * 0.019 + 1.3);
    const shouldRain = this.snapshot.weather === "rain" && rainPulse > -0.35;
    this.rain.visible = shouldRain;
    if (shouldRain) {
      const positions = this.rain.geometry.attributes.position as THREE.BufferAttribute;
      for (let index = 0; index < positions.count; index += 1) {
        let y = positions.getY(index) - delta * (7 + (index % 5));
        let x = positions.getX(index) + delta * 0.8;
        if (y < 0.15) y = 9 + (index % 7);
        if (x > 23) x = -23;
        positions.setXYZ(index, x, y, positions.getZ(index));
      }
      positions.needsUpdate = true;
    }
    this.mountain.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshStandardMaterial)) return;
      child.material.transparent = true;
      child.material.opacity = 0.2 + atmosphere.mountainVisibility * 0.8;
    });
  }
}
