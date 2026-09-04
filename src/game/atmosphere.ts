import type { WeatherMode } from "./types";

interface SkyStop {
  minute: number;
  top: number;
  bottom: number;
  cloud: number;
}

export interface AtmosphereSample {
  skyTop: number;
  skyBottom: number;
  cloudColor: number;
  horizonColor: number;
  sunColor: number;
  daylight: number;
  sunset: number;
  night: number;
  windowLights: number;
  mountainVisibility: number;
  cloudiness: number;
}

const SKY_STOPS: SkyStop[] = [
  { minute: 0, top: 0x091426, bottom: 0x273147, cloud: 0x525b6c },
  { minute: 300, top: 0x172742, bottom: 0x755c69, cloud: 0x7d7780 },
  { minute: 405, top: 0x496a84, bottom: 0xe0a374, cloud: 0xd2b3a0 },
  { minute: 510, top: 0x6e92a7, bottom: 0xb9c9c6, cloud: 0xd4dadd },
  { minute: 720, top: 0x6f9cb4, bottom: 0xb8d0d0, cloud: 0xd8e0e1 },
  { minute: 960, top: 0x698ba2, bottom: 0xbfc3b5, cloud: 0xd5d4cc },
  { minute: 1080, top: 0x596e8e, bottom: 0xf0a36d, cloud: 0xe0aa89 },
  { minute: 1170, top: 0x303c67, bottom: 0xd36f62, cloud: 0x9c7180 },
  { minute: 1260, top: 0x162441, bottom: 0x493b52, cloud: 0x55556a },
  { minute: 1440, top: 0x091426, bottom: 0x273147, cloud: 0x525b6c },
];

const WEATHER_TREATMENT: Record<
  WeatherMode,
  { tint: number; amount: number; cloudiness: number; mountain: number }
> = {
  clear: { tint: 0xa5cfe0, amount: 0.05, cloudiness: 0.42, mountain: 0.95 },
  cloudy: { tint: 0x8297a0, amount: 0.16, cloudiness: 0.82, mountain: 0.62 },
  rain: { tint: 0x566b77, amount: 0.3, cloudiness: 1, mountain: 0.34 },
  snow: { tint: 0xc3d0d4, amount: 0.26, cloudiness: 0.88, mountain: 0.58 },
  smoke: { tint: 0xa16e58, amount: 0.4, cloudiness: 0.56, mountain: 0.08 },
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const smoothstep = (start: number, end: number, value: number): number => {
  const amount = clamp01((value - start) / (end - start));
  return amount * amount * (3 - 2 * amount);
};

export const normalizeMinutes = (minutes: number): number =>
  ((minutes % 1440) + 1440) % 1440;

export function mixHexColors(from: number, to: number, amount: number): number {
  const mix = clamp01(amount);
  const fromRed = (from >> 16) & 0xff;
  const fromGreen = (from >> 8) & 0xff;
  const fromBlue = from & 0xff;
  const toRed = (to >> 16) & 0xff;
  const toGreen = (to >> 8) & 0xff;
  const toBlue = to & 0xff;
  const red = Math.round(fromRed + (toRed - fromRed) * mix);
  const green = Math.round(fromGreen + (toGreen - fromGreen) * mix);
  const blue = Math.round(fromBlue + (toBlue - fromBlue) * mix);
  return (red << 16) | (green << 8) | blue;
}

export function sampleAtmosphere(
  minutes: number,
  weather: WeatherMode,
): AtmosphereSample {
  const normalized = normalizeMinutes(minutes);
  const endIndex = SKY_STOPS.findIndex((stop) => stop.minute >= normalized);
  const end = SKY_STOPS[Math.max(1, endIndex)];
  const start = SKY_STOPS[Math.max(0, endIndex - 1)];
  const progress = (normalized - start.minute) / (end.minute - start.minute);
  const treatment = WEATHER_TREATMENT[weather];

  let skyTop = mixHexColors(start.top, end.top, progress);
  let skyBottom = mixHexColors(start.bottom, end.bottom, progress);
  let cloudColor = mixHexColors(start.cloud, end.cloud, progress);
  skyTop = mixHexColors(skyTop, treatment.tint, treatment.amount);
  skyBottom = mixHexColors(skyBottom, treatment.tint, treatment.amount);
  cloudColor = mixHexColors(cloudColor, treatment.tint, treatment.amount * 0.65);

  const daylight =
    smoothstep(330, 465, normalized) * (1 - smoothstep(1140, 1260, normalized));
  const dawn = Math.exp(-Math.pow((normalized - 405) / 82, 2)) * 0.5;
  const sunset = Math.max(
    dawn,
    Math.exp(-Math.pow((normalized - 1110) / 105, 2)),
  );
  const night = 1 - daylight;
  const windowLights = Math.max(
    1 - smoothstep(330, 465, normalized),
    smoothstep(1050, 1220, normalized),
  );

  return {
    skyTop,
    skyBottom,
    cloudColor,
    horizonColor: mixHexColors(skyBottom, 0xff9a61, sunset * 0.48),
    sunColor: mixHexColors(0xffe69a, 0xffaa62, sunset * 0.72),
    daylight,
    sunset,
    night,
    windowLights,
    mountainVisibility: treatment.mountain * (0.28 + daylight * 0.72),
    cloudiness: treatment.cloudiness,
  };
}
