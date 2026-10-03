export interface GroundPoint {
  x: number;
  z: number;
}

export interface GroundStep {
  position: GroundPoint;
  distance: number;
  arrived: boolean;
  heading: number;
}

export function advanceOnGround(
  current: GroundPoint,
  destination: GroundPoint,
  maximumDistance: number,
): GroundStep {
  const dx = destination.x - current.x;
  const dz = destination.z - current.z;
  const remaining = Math.hypot(dx, dz);
  const heading = remaining > 0.0001 ? Math.atan2(dx, dz) : 0;
  if (remaining <= maximumDistance || remaining <= 0.0001) {
    return {
      position: { ...destination },
      distance: remaining,
      arrived: true,
      heading,
    };
  }
  const amount = maximumDistance / remaining;
  return {
    position: {
      x: current.x + dx * amount,
      z: current.z + dz * amount,
    },
    distance: maximumDistance,
    arrived: false,
    heading,
  };
}

export function gaitPhaseForDistance(distance: number, fullStrideLength: number): number {
  if (fullStrideLength <= 0) return 0;
  return (Math.max(0, distance) / fullStrideLength) * Math.PI * 2;
}

export function crossedFootfall(previousPhase: number, nextPhase: number): boolean {
  return Math.floor(previousPhase / Math.PI) < Math.floor(nextPhase / Math.PI);
}
