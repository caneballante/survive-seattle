import * as THREE from "three";
import { createIcon } from "./visual";

export class InteractionIndicator {
  readonly root = new THREE.Group();
  private readonly ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly icon = createIcon("E");

  constructor() {
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.48, 0.58, 32),
      new THREE.MeshBasicMaterial({ color: 0xe8cf77, transparent: true, opacity: 0.58, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;
    this.icon.position.y = 2.7;
    this.root.add(this.ring, this.icon);
    this.root.visible = false;
  }

  show(position: THREE.Vector3): void {
    this.root.position.copy(position);
    this.root.position.y = 0.13;
    this.root.visible = true;
  }

  hide(): void {
    this.root.visible = false;
  }

  update(time: number): void {
    if (!this.root.visible) return;
    const pulse = 1 + Math.sin(time * 3.5) * 0.09;
    this.ring.scale.setScalar(pulse);
    this.ring.material.opacity = 0.46 + Math.sin(time * 3.5) * 0.14;
    this.icon.position.y = 2.62 + Math.sin(time * 2.8) * 0.12;
  }
}
