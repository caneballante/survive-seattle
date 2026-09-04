import { describe, expect, it } from "vitest";
import { getDailyWeather, weatherLabel } from "./weather";

describe("daily weather", () => {
  it("rotates ordinary spring days through rain, overcast, and clear weather", () => {
    expect(getDailyWeather(1, "Spring")).toBe("rain");
    expect(getDailyWeather(2, "Spring")).toBe("cloudy");
    expect(getDailyWeather(3, "Spring")).toBe("clear");
  });

  it("uses readable weather labels", () => {
    expect(weatherLabel("cloudy")).toBe("Overcast");
    expect(weatherLabel("clear")).toBe("Clear");
  });
});
