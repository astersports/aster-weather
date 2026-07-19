/**
 * Sky icon system — the glossy, dimensional weather art.
 *
 * Ported verbatim from the ratified reference `aster-weather-sky.html`
 * (ICON_SYSTEM_SKY_BUILD_SPEC, 2026-07-18): volumetric cloud bodies with a soft
 * inner bloom, a sun with corona + specular, a crescent moon with twinkling
 * stars, teardrops with a specular hit, six-fold crystals, and a lightning bolt
 * with a glow bloom. Each builder returns SVG innerHTML for a 0 0 64 64 viewBox.
 *
 * `uid` prefixes every gradient / clip / filter id so two icons never collide on
 * a page (WX-P3-9). `animate` toggles the `aw-*` motion classes (see skyStyles);
 * when false the art renders static (bloom resolves to a dim frame).
 */
import type { SkyCondition } from "./skyTints.js";
export type WeatherArtFn = (uid: string, animate: boolean) => string;
export declare const WEATHER_ART: Record<SkyCondition, WeatherArtFn>;
//# sourceMappingURL=weatherArt.d.ts.map