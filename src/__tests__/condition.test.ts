import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  NWS_ICON_CONDITION,
  conditionFromNwsIcon,
  conditionLabel,
  isPrecipitation,
  type Condition,
} from "../condition.js";

const iconsFixture = JSON.parse(
  readFileSync(new URL("./fixtures/nws/icons.json", import.meta.url), "utf8"),
) as { icons: Record<string, unknown> };

const ICON = (path: string) => `https://api.weather.gov/icons/land/${path}?size=medium`;

// Worst-last order from the plan. Index = severity rank.
const ORDER: Condition[] = [
  "clear", "mostly-clear", "partly-cloudy", "mostly-cloudy", "overcast",
  "haze", "smoke", "dust", "hot", "cold", "fog", "drizzle", "light-rain",
  "rain", "heavy-rain", "light-snow", "snow", "heavy-snow", "wintry-mix",
  "sleet", "freezing-rain", "blizzard", "thunderstorm", "tropical-storm", "tornado",
];

// One NWS keyword per condition that NWS publishes.
const REPRESENTATIVE: Partial<Record<Condition, string>> = {
  clear: "skc", "mostly-clear": "few", "partly-cloudy": "sct", "mostly-cloudy": "bkn",
  overcast: "ovc", haze: "haze", smoke: "smoke", dust: "dust", hot: "hot", cold: "cold",
  fog: "fog", "light-rain": "rain_showers", rain: "rain", snow: "snow", "wintry-mix": "rain_snow",
  sleet: "sleet", "freezing-rain": "fzra", blizzard: "blizzard", thunderstorm: "tsra",
  "tropical-storm": "tropical_storm", tornado: "tornado",
};

describe("NWS keyword table", () => {
  it("maps exactly the plan's keywords to conditions", () => {
    expect(NWS_ICON_CONDITION).toEqual({
      skc: "clear", few: "mostly-clear", sct: "partly-cloudy", bkn: "mostly-cloudy",
      ovc: "overcast", fog: "fog", rain: "rain", rain_showers: "light-rain",
      rain_showers_hi: "light-rain", tsra: "thunderstorm", tsra_sct: "thunderstorm",
      tsra_hi: "thunderstorm", snow: "snow", rain_snow: "wintry-mix", sleet: "sleet",
      rain_sleet: "sleet", snow_sleet: "sleet", fzra: "freezing-rain",
      rain_fzra: "freezing-rain", snow_fzra: "freezing-rain", blizzard: "blizzard",
      haze: "haze", smoke: "smoke", dust: "dust", hot: "hot", cold: "cold",
      tornado: "tornado", hurricane: "tropical-storm", tropical_storm: "tropical-storm",
    });
  });
});

describe("conditionFromNwsIcon", () => {
  it("resolves every keyword in the recorded NWS list (34)", () => {
    const keys = Object.keys(iconsFixture.icons);
    expect(keys).toHaveLength(34);
    for (const k of keys) {
      const r = conditionFromNwsIcon(`https://api.weather.gov/icons/land/day/${k}?size=small`);
      expect(r.condition, k).not.toBeNull();
    }
  });

  it("sets windy for wind_ keywords and maps the sky state", () => {
    for (const k of Object.keys(iconsFixture.icons).filter((k) => k.startsWith("wind_"))) {
      const plain = k.slice("wind_".length);
      const r = conditionFromNwsIcon(`https://api.weather.gov/icons/land/night/${k}?size=small`);
      expect(r.windy, k).toBe(true);
      expect(r.condition, k).toBe(conditionFromNwsIcon(`https://api.weather.gov/icons/land/night/${plain}?size=small`).condition);
    }
  });

  it("reads a plain sky state by day", () => {
    expect(conditionFromNwsIcon(ICON("day/bkn"))).toEqual({
      condition: "mostly-cloudy", windy: false, isDay: true,
    });
  });

  it("reads a windy sky state by night", () => {
    expect(conditionFromNwsIcon(ICON("night/wind_few"))).toEqual({
      condition: "mostly-clear", windy: true, isDay: false,
    });
  });

  it("gives the worse of two keywords (rain over rain_showers)", () => {
    expect(conditionFromNwsIcon(ICON("day/rain,60/rain_showers,40")).condition).toBe("rain");
  });

  it("gives the worse of two keywords (light rain over mostly cloudy)", () => {
    expect(conditionFromNwsIcon(ICON("night/rain_showers,30/bkn")).condition).toBe("light-rain");
  });

  it("returns all-null for a value that is not a URL", () => {
    expect(conditionFromNwsIcon("not a url")).toEqual({ condition: null, windy: false, isDay: null });
  });

  it("returns all-null for non-string input", () => {
    expect(conditionFromNwsIcon(undefined)).toEqual({ condition: null, windy: false, isDay: null });
    expect(conditionFromNwsIcon(null)).toEqual({ condition: null, windy: false, isDay: null });
    expect(conditionFromNwsIcon(42)).toEqual({ condition: null, windy: false, isDay: null });
  });

  it("gives a null condition for an unknown keyword but keeps the time of day", () => {
    expect(conditionFromNwsIcon(ICON("day/some_new_word"))).toEqual({
      condition: null, windy: false, isDay: true,
    });
  });
});

describe("worse-of-two order", () => {
  // Only conditions with an NWS keyword take part in the pairwise check.
  const withKeywords = ORDER.filter((c) => REPRESENTATIVE[c] !== undefined);

  it("pins the order: for each adjacent pair with NWS keywords, the later one wins", () => {
    for (let i = 0; i + 1 < withKeywords.length; i++) {
      const worse = withKeywords[i + 1]!;
      const milder = withKeywords[i]!;
      const url = ICON(`day/${REPRESENTATIVE[milder]},50/${REPRESENTATIVE[worse]},50`);
      expect(conditionFromNwsIcon(url).condition, `${milder} vs ${worse}`).toBe(worse);
    }
  });

  it("pins the worked examples from the plan", () => {
    expect(conditionFromNwsIcon(ICON("day/rain,50/tsra,50")).condition).toBe("thunderstorm");
    expect(conditionFromNwsIcon(ICON("day/sct/fog")).condition).toBe("fog");
    expect(conditionFromNwsIcon(ICON("day/snow/sleet")).condition).toBe("sleet");
    expect(conditionFromNwsIcon(ICON("day/few/haze")).condition).toBe("haze");
  });
});

describe("conditionLabel", () => {
  const plainKeys = Object.values(NWS_ICON_CONDITION);
  const iconKeys: Condition[] = [
    "clear", "mostly-clear", "partly-cloudy", "overcast", "fog", "drizzle", "light-rain",
    "rain", "freezing-rain", "heavy-rain", "light-snow", "snow", "heavy-snow", "thunderstorm",
  ];

  it("labels every NWS-table value and all 14 WeatherIconKey values", () => {
    for (const c of [...plainKeys, ...iconKeys]) {
      const label = conditionLabel(c);
      expect(label, c).toEqual(expect.any(String));
      expect(label.length, c).toBeGreaterThan(0);
    }
  });

  it("uses the plan's labels for the three named conditions", () => {
    expect(conditionLabel("hot")).toBe("Extreme heat");
    expect(conditionLabel("cold")).toBe("Extreme cold");
    expect(conditionLabel("mostly-cloudy")).toBe("Mostly cloudy");
  });
});

describe("isPrecipitation", () => {
  it("is true from drizzle through thunderstorm, and for tropical-storm", () => {
    const precip: Condition[] = [
      "drizzle", "light-rain", "rain", "heavy-rain", "light-snow", "snow", "heavy-snow",
      "wintry-mix", "sleet", "freezing-rain", "blizzard", "thunderstorm", "tropical-storm",
    ];
    for (const c of precip) expect(isPrecipitation(c), c).toBe(true);
  });

  it("is false for dry or unknown conditions", () => {
    const dry: Array<Condition | null> = [
      null, "clear", "mostly-clear", "partly-cloudy", "mostly-cloudy", "overcast",
      "haze", "smoke", "dust", "hot", "cold", "fog", "tornado",
    ];
    for (const c of dry) expect(isPrecipitation(c), String(c)).toBe(false);
  });
});
