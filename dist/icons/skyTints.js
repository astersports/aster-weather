/**
 * Sky icon system — condition → sky tint (ICON_SYSTEM_SKY_BUILD_SPEC §3, §5).
 *
 * THE CONTRAST RULE (measured, non-negotiable): EVERY gradient stop — not just
 * the floor — must clear WCAG 1.4.11's 3:1 against the elements that condition
 * renders. #2E5A8C is the reference floor (white cloud 7.1:1, gold sun 4.7:1,
 * raindrop 3.29:1 — the binding element); a condition's lighter TOP stop gives
 * less contrast, so it is checked too. Gold-sun-on-mid-blue is the hardest pair
 * (WX-S2: `clear` began at #4E80B4 where the sun was 2.74:1 — corrected to
 * #446FA0, 3.44:1). The panel travels with the component (SkyPanel), so a cream
 * page and a navy app get identical, guaranteed contrast from ONE palette — no
 * theme fork.
 *
 * Refinement on the spec's §6 (flagged for the architect): SKY_TINTS is keyed by
 * `SkyCondition` (17), NOT `WeatherIconKey` (14) — the three night variants carry
 * distinct, darker tints (clear #446FA0 by day vs #1E3358 at night), so they need
 * their own keys. Components take the engine-native `WeatherIconKey` + `isDay`
 * and resolve to a `SkyCondition` via `skyConditionFor`.
 */
/** Every SkyCondition, in canonical order (drives the exhaustiveness test). */
export const SKY_CONDITIONS = [
    "clear", "mostly-clear", "partly-cloudy", "overcast", "fog", "drizzle",
    "light-rain", "rain", "heavy-rain", "thunderstorm", "freezing-rain",
    "light-snow", "snow", "heavy-snow",
    "clear-night", "partly-cloudy-night", "snow-night",
];
/**
 * condition → [from, to] gradient stops (rendered at 168°). Every stop is verified
 * to clear 3:1 for the elements it renders; storm + night are darkest by physics.
 * Typed Record so a new SkyCondition fails to compile until it has a tint.
 */
export const SKY_TINTS = {
    "clear": ["#446FA0", "#2E5A8C"],
    "mostly-clear": ["#4877AA", "#2C5585"],
    "partly-cloudy": ["#456F9F", "#2A4E7B"],
    "overcast": ["#3C5C7E", "#243F5A"],
    "fog": ["#405E78", "#273F52"],
    "drizzle": ["#375A76", "#213B51"],
    "light-rain": ["#33566F", "#1E374B"],
    "rain": ["#2E4F66", "#1A3143"],
    "heavy-rain": ["#28414F", "#151F2A"],
    "thunderstorm": ["#243747", "#111A24"],
    "freezing-rain": ["#3A5876", "#22384F"],
    "light-snow": ["#42607F", "#273F58"],
    "snow": ["#3D5A78", "#243A52"],
    "heavy-snow": ["#37506B", "#1F3147"],
    "clear-night": ["#1E3358", "#0D1526"],
    "partly-cloudy-night": ["#1C2F51", "#0C1423"],
    "snow-night": ["#22385C", "#0F1829"],
};
/** The measured contrast floor. Panels are never lighter than this. */
export const SKY_FLOOR = "#2E5A8C";
/**
 * Resolve the engine's WMO icon key (+ whether it is daytime) to the 17-key
 * render vocabulary. Night art exists only for clear / partly-cloudy / snow;
 * every other condition looks the same after dark (on its already-dark sky).
 */
export function skyConditionFor(icon, isDay = true) {
    if (isDay)
        return icon;
    switch (icon) {
        case "clear":
        case "mostly-clear":
            return "clear-night";
        case "partly-cloudy":
            return "partly-cloudy-night";
        case "light-snow":
        case "snow":
        case "heavy-snow":
            return "snow-night";
        default:
            return icon;
    }
}
/** The CSS `background` value for a condition's sky (168° gradient). */
export function skyGradient(cond) {
    const [from, to] = SKY_TINTS[cond] ?? SKY_TINTS.clear;
    return `linear-gradient(168deg, ${from} 0%, ${to} 100%)`;
}
/** The 14 WMO-routable keys — the WMO map ↔ dispatcher parity set (WX-P2-22). */
export const ROUTED_ICON_KEYS = new Set([
    "clear", "mostly-clear", "partly-cloudy", "overcast", "fog", "drizzle",
    "light-rain", "rain", "freezing-rain", "heavy-rain",
    "light-snow", "snow", "heavy-snow", "thunderstorm",
]);
//# sourceMappingURL=skyTints.js.map