import * as THREE from "three";
import { sampleAtmosphere } from "../game/atmosphere";
import type { GameSnapshot } from "../game/types";
import { material } from "./visual";

export class TimeOfDaySystem {
  private readonly hemisphere = new THREE.HemisphereLight(0xa8c9d0, 0x263334, 1.1);
  private readonly sunLight = new THREE.DirectionalLight(0xffd69a, 2.3);
  private readonly sun = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 10), material(0xffd373, 0.3));
  private windowMaterials: THREE.MeshStandardMaterial[] = [];
  private snapshot: Readonly<GameSnapshot>;

  constructor(private readonly scene: THREE.Scene, snapshot: Readonly<GameSnapshot>) {
    this.snapshot = snapshot;
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.left = -24;
    this.sunLight.shadow.camera.right = 24;
    this.sunLight.shadow.camera.top = 18;
    this.sunLight.shadow.camera.bottom = -18;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.hemisphere, this.sunLight, this.sun);
    this.scene.fog = new THREE.FogExp2(0x758c93, 0.018);
  }

  scanWindows(root: THREE.Object3D): void {
    const set = new Set<THREE.MeshStandardMaterial>();
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.userData.windowLight) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((item) => {
        if (item instanceof THREE.MeshStandardMaterial) set.add(item);
      });
    });
    this.windowMaterials = [...set];
  }

  setSnapshot(snapshot: Readonly<GameSnapshot>): void {
    this.snapshot = snapshot;
  }

  update(_delta: number): void {
    const sample = sampleAtmosphere(this.snapshot.minutes, this.snapshot.weather);
    this.scene.background = new THREE.Color(sample.skyTop).lerp(new THREE.Color(sample.skyBottom), 0.38);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.setHex(sample.horizonColor);
      this.scene.fog.density = 0.012 + (1 - sample.mountainVisibility) * 0.019;
    }
    this.hemisphere.color.setHex(sample.skyBottom);
    this.hemisphere.groundColor.setHex(0x253235);
    this.hemisphere.intensity = 0.3 + sample.daylight * 1.05;
    const dayProgress = ((this.snapshot.minutes - 360) / 900) * Math.PI;
    const altitude = Math.max(-0.16, Math.sin(dayProgress));
    this.sun.position.set(Math.cos(dayProgress) * 20, 4 + altitude * 17, -14 + Math.sin(dayProgress) * 5);
    this.sun.material.color.setHex(sample.sunColor);
    this.sun.material.emissive.setHex(sample.sunColor);
    this.sun.material.emissiveIntensity = 0.65 + sample.sunset;
    this.sunLight.position.copy(this.sun.position);
    this.sunLight.color.setHex(sample.sunColor);
    this.sunLight.intensity = 0.25 + sample.daylight * 2.5 + sample.sunset * 0.75;
    this.windowMaterials.forEach((window) => {
      window.emissiveIntensity = 0.08 + sample.windowLights * 1.7;
    });
  }
}
