import type { Season, WeatherMode } from "./types";

const ORDINARY_WEATHER: Record<Season, WeatherMode[]> = {
  Spring: ["rain", "cloudy", "clear", "cloudy", "rain", "clear", "cloudy", "rain"],
  Summer: ["clear", "clear", "cloudy", "clear", "rain", "clear", "cloudy", "clear"],
  Fall: ["rain", "cloudy", "clear", "rain", "cloudy", "rain", "clear", "cloudy"],
  Winter: ["cloudy", "rain", "clear", "cloudy", "rain", "cloudy", "clear", "rain"],
};

export function getDailyWeather(totalDays: number, season: Season): WeatherMode {
  const pattern = ORDINARY_WEATHER[season];
  const index = Math.max(0, totalDays - 1) % pattern.length;
  return pattern[index];
}

export function weatherLabel(weather: WeatherMode): string {
  if (weather === "cloudy") return "Overcast";
  if (weather === "smoke") return "Smoke";
  return weather[0].toUpperCase() + weather.slice(1);
}
