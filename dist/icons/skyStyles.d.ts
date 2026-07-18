/**
 * Sky icon system — the ambient-motion stylesheet.
 *
 * Motion mechanism (CC refinement, flagged for the architect): the approved
 * reference animates with CSS keyframes, and SkyPanel is a <div> (its storm
 * flash can't be SMIL) — so BOTH the icons and the panel share ONE injected
 * stylesheet rather than per-SVG SMIL. It is injected into <head> exactly once,
 * client-side. Keyframes are ported verbatim from `aster-weather-sky.html`; the
 * per-element transform-origin (for the scaling sun/corona/flake) is set inline
 * in the art, exactly as in the approved reference, so the classes stay plain.
 *
 * Reduced motion is honored two ways: (1) the `@media (prefers-reduced-motion:
 * reduce)` block here disables every animation and resolves the flash/bloom to a
 * dim static frame — SSR-safe, no JS needed; (2) `animate={false}` on a component
 * omits the animation classes entirely. Per-instance ids come from React `useId`.
 */
export declare const SKY_STYLE_ID = "aster-weather-sky-motion";
export declare const SKY_KEYFRAMES = "\n.aw-drift{animation:aw-drift 13s ease-in-out infinite}\n@keyframes aw-drift{0%,100%{transform:translateX(0)}50%{transform:translateX(1.8px)}}\n.aw-breathe{animation:aw-breathe 7s ease-in-out infinite}\n@keyframes aw-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.045)}}\n.aw-corona{animation:aw-corona 5.5s ease-in-out infinite}\n@keyframes aw-corona{0%,100%{opacity:.45;transform:scale(1)}50%{opacity:.78;transform:scale(1.09)}}\n.aw-fall{animation:aw-fall 1.05s linear infinite}\n@keyframes aw-fall{0%{transform:translateY(-5px);opacity:0}22%{opacity:1}76%{opacity:1}100%{transform:translateY(12px);opacity:0}}\n.aw-fall-fast{animation-duration:.7s}.aw-fall-slow{animation-duration:1.6s}\n.aw-tumble{animation:aw-tumble 3.6s linear infinite}\n@keyframes aw-tumble{0%{transform:translateY(-4px) rotate(0);opacity:0}18%{opacity:1}78%{opacity:1}100%{transform:translateY(13px) rotate(190deg);opacity:0}}\n.aw-flash{animation:aw-flash 3.2s steps(1,end) infinite}\n@keyframes aw-flash{0%,70%{opacity:.92}72%{opacity:1}75%{opacity:.5}78%{opacity:1}84%,100%{opacity:.92}}\n.aw-bloom{animation:aw-bloom 3.2s steps(1,end) infinite}\n@keyframes aw-bloom{0%,70%{opacity:0}72%{opacity:.9}80%{opacity:.15}86%,100%{opacity:0}}\n.aw-skyflash{animation:aw-skyflash 3.2s steps(1,end) infinite}\n@keyframes aw-skyflash{0%,70%{opacity:0}72%{opacity:.3}78%{opacity:.06}84%,100%{opacity:0}}\n.aw-slide{animation:aw-slide 9s ease-in-out infinite}\n@keyframes aw-slide{0%,100%{transform:translateX(-3px)}50%{transform:translateX(3px)}}\n.aw-twinkle{animation:aw-twinkle 4.5s ease-in-out infinite}\n@keyframes aw-twinkle{0%,100%{opacity:.35}50%{opacity:1}}\n@media (prefers-reduced-motion:reduce){\n.aw-drift,.aw-breathe,.aw-corona,.aw-fall,.aw-tumble,.aw-flash,.aw-bloom,.aw-slide,.aw-twinkle,.aw-skyflash{animation:none!important}\n.aw-bloom,.aw-skyflash{opacity:.16!important}\n}\n";
/**
 * Inject the stylesheet once, client-side. No-op on the server and after the
 * first call. Called on mount by WeatherIcon + SkyPanel.
 */
export declare function ensureSkyStyles(): void;
//# sourceMappingURL=skyStyles.d.ts.map