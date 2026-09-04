export type TargetDirection = "left" | "right" | "visible";

export function getTargetDirection(
  targetX: number,
  cameraLeft: number,
  cameraWidth: number,
  edgePadding = 72,
): TargetDirection {
  const visibleLeft = cameraLeft + edgePadding;
  const visibleRight = cameraLeft + cameraWidth - edgePadding;
  if (targetX < visibleLeft) return "left";
  if (targetX > visibleRight) return "right";
  return "visible";
}
