import { describe, expect, it } from "vitest";
import {
  mixHexColors,
  normalizeMinutes,
  sampleAtmosphere,
} from "./atmosphere";

const luminance = (color: number): number =>
  ((color >> 16) & 0xff) * 0.2126 +
  ((color >> 8) & 0xff) * 0.7152 +
  (color & 0xff) * 0.0722;

describe("Seattle atmosphere", () => {
  it("wraps time cleanly across midnight", () => {
    expect(normalizeMinutes(1500)).toBe(60);
    expect(normalizeMinutes(-60)).toBe(1380);
    expect(sampleAtmosphere(0, "clear").skyTop).toBe(
      sampleAtmosphere(1440, "clear").skyTop,
    );
  });

  it("makes midday brighter than midnight", () => {
    const noon = sampleAtmosphere(12 * 60, "clear");
    const midnight = sampleAtmosphere(0, "clear");
    expect(luminance(noon.skyBottom)).toBeGreaterThan(
      luminance(midnight.skyBottom),
    );
    expect(noon.daylight).toBeGreaterThan(midnight.daylight);
  });

  it("gives dusk a strong sunset and illuminated windows", () => {
    const morning = sampleAtmosphere(9 * 60, "clear");
    const dusk = sampleAtmosphere(18.5 * 60, "clear");
    expect(dusk.sunset).toBeGreaterThan(morning.sunset);
    expect(dusk.windowLights).toBeGreaterThan(morning.windowLights);
  });

  it("lets weather control Rainier visibility", () => {
    const clear = sampleAtmosphere(12 * 60, "clear");
    const cloudy = sampleAtmosphere(12 * 60, "cloudy");
    const rain = sampleAtmosphere(12 * 60, "rain");
    const smoke = sampleAtmosphere(12 * 60, "smoke");
    expect(clear.mountainVisibility).toBeGreaterThan(cloudy.mountainVisibility);
    expect(cloudy.mountainVisibility).toBeGreaterThan(rain.mountainVisibility);
    expect(clear.mountainVisibility).toBeGreaterThan(rain.mountainVisibility);
    expect(rain.mountainVisibility).toBeGreaterThan(smoke.mountainVisibility);
  });

  it("interpolates RGB colors predictably", () => {
    expect(mixHexColors(0x000000, 0xffffff, 0.5)).toBe(0x808080);
  });
});
