export interface Point2 {
  x: number;
  z: number;
}

export interface Rect2 {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function normalizedMovement(x: number, z: number): Point2 {
  const length = Math.hypot(x, z);
  if (length <= 1) return { x, z };
  return { x: x / length, z: z / length };
}

export function canOccupy(point: Point2, radius: number, obstacles: readonly Rect2[]): boolean {
  return !obstacles.some(
    (obstacle) =>
      point.x + radius > obstacle.minX &&
      point.x - radius < obstacle.maxX &&
      point.z + radius > obstacle.minZ &&
      point.z - radius < obstacle.maxZ,
  );
}

export function moveWithSliding(
  start: Point2,
  movement: Point2,
  radius: number,
  obstacles: readonly Rect2[],
  bounds: Rect2,
): Point2 {
  const clamped = (point: Point2): Point2 => ({
    x: Math.max(bounds.minX, Math.min(bounds.maxX, point.x)),
    z: Math.max(bounds.minZ, Math.min(bounds.maxZ, point.z)),
  });
  const full = clamped({ x: start.x + movement.x, z: start.z + movement.z });
  if (canOccupy(full, radius, obstacles)) return full;
  const xOnly = clamped({ x: start.x + movement.x, z: start.z });
  if (canOccupy(xOnly, radius, obstacles)) return xOnly;
  const zOnly = clamped({ x: start.x, z: start.z + movement.z });
  if (canOccupy(zOnly, radius, obstacles)) return zOnly;
  return start;
}

export function nearestWithin<T extends { position: Point2 }>(
  origin: Point2,
  items: readonly T[],
  radius: number,
): T | null {
  let closest: T | null = null;
  let best = radius * radius;
  items.forEach((item) => {
    const distance = (item.position.x - origin.x) ** 2 + (item.position.z - origin.z) ** 2;
    if (distance >= best) return;
    best = distance;
    closest = item;
  });
  return closest;
}
