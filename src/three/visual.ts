import * as THREE from "three";

export const PALETTE = {
  ink: 0x14232b,
  pavement: 0x3d4a4d,
  sidewalk: 0x6e7772,
  cream: 0xf2e7c6,
  gold: 0xe8bd52,
  teal: 0x4d918b,
  moss: 0x55715b,
  brick: 0x70483e,
  rain: 0x90c4cf,
  window: 0xf1b861,
} as const;

export function material(color: number, roughness = 0.82): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.04, flatShading: true });
}

export function box(
  width: number,
  height: number,
  depth: number,
  color: number,
  position: [number, number, number] = [0, 0, 0],
): THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth, 1, 1, 1), material(color));
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function cylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  color: number,
  segments = 8,
): THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial> {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material(color),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createLabel(
  text: string,
  foreground = "#f4ead0",
  background = "#183037",
  width = 512,
  height = 96,
): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas label unavailable");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(255,255,255,.22)";
  context.lineWidth = 8;
  context.strokeRect(5, 5, width - 10, height - 10);
  context.fillStyle = foreground;
  context.font = `900 ${Math.round(height * 0.42)}px Arial Black, Arial`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, width / 2, height / 2 + 2, width - 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(width / 96, height / 96),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide }),
  );
  plane.renderOrder = 4;
  return plane;
}

export function createIcon(text: string, color = "#ffe178"): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas icon unavailable");
  context.font = "900 82px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineWidth = 13;
  context.strokeStyle = "rgba(13,30,36,.9)";
  context.strokeText(text, 64, 67);
  context.fillStyle = color;
  context.fillText(text, 64, 67);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false }));
  sprite.scale.setScalar(0.8);
  sprite.renderOrder = 20;
  return sprite;
}

export function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Sprite)) return;
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((item) => {
      const withMap = item as THREE.Material & { map?: THREE.Texture };
      withMap.map?.dispose();
      item.dispose();
    });
  });
}
