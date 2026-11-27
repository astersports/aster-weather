// PROPOSED icon art for the 2026-11-27 weather-service design (reference only, not shipped).
// The 17 shipped Sky icons come from dist/; the new conditions below are drawn in the same language.
import { WEATHER_ART } from "../../../dist/icons/weatherArt.js";
import { SKY_TINTS } from "../../../dist/icons/skyTints.js";
import { SKY_KEYFRAMES } from "../../../dist/icons/skyStyles.js";

export { SKY_KEYFRAMES };

const CLOUD =
  "M20 46 C12.6 46 7 40.6 7 34 C7 27.9 11.7 22.8 17.8 22.1 C19.6 15.3 25.8 10.4 33 10.4 " +
  "C40.4 10.4 46.6 15.5 48.3 22.3 C54 23.1 58 27.9 58 33.9 C58 40.6 52.6 46 45.4 46 Z";

function cloud(id, dx, dy, sc, cls, dark, al) {
  const s = dark ? { a: "#B4C2D6", b: "#8D9DB6", c: "#65758F" } : { a: "#FDFEFF", b: "#E1E9F5", c: "#B3C2D8" };
  return (
    `<defs><linearGradient id="cg${id}" x1=".15" y1="0" x2=".55" y2="1">` +
    `<stop offset="0%" stop-color="${s.a}"/><stop offset="50%" stop-color="${s.b}"/><stop offset="100%" stop-color="${s.c}"/></linearGradient>` +
    `<clipPath id="cc${id}"><path d="${CLOUD}"/></clipPath>` +
    `<filter id="cs${id}" x="-25%" y="-25%" width="150%" height="160%">` +
    `<feDropShadow dx="0" dy="1.4" stdDeviation="1.5" flood-color="#050B16" flood-opacity=".38"/></filter>` +
    `<filter id="cb${id}"><feGaussianBlur stdDeviation="2.2"/></filter></defs>` +
    `<g class="${cls}" transform="translate(${dx},${dy}) scale(${sc})" opacity="${al == null ? 1 : al}">` +
    `<g filter="url(#cs${id})"><path d="${CLOUD}" fill="url(#cg${id})"/>` +
    `<g clip-path="url(#cc${id})">` +
    `<ellipse cx="34" cy="51" rx="30" ry="11" fill="${s.c}" opacity=".75" filter="url(#cb${id})"/>` +
    `<ellipse cx="26" cy="17.5" rx="13" ry="5.6" fill="#fff" opacity=".85" filter="url(#cb${id})"/></g></g></g>`
  );
}

function sun(id, cx, cy, r, a, rays = true, core = ["#FFF8DA", "#FFCE48", "#F09010"]) {
  let ry = "";
  if (rays) {
    for (let i = 0; i < 8; i++) {
      const ang = (i * 45 * Math.PI) / 180;
      ry +=
        `<line x1="${(cx + Math.cos(ang) * (r + 3.2)).toFixed(1)}" y1="${(cy + Math.sin(ang) * (r + 3.2)).toFixed(1)}"` +
        ` x2="${(cx + Math.cos(ang) * (r + 7.8)).toFixed(1)}" y2="${(cy + Math.sin(ang) * (r + 7.8)).toFixed(1)}"` +
        ` stroke="#FFCB40" stroke-width="3.2" stroke-linecap="round"/>`;
    }
  }
  return (
    `<defs><radialGradient id="sd${id}" cx="34%" cy="28%">` +
    `<stop offset="0%" stop-color="${core[0]}"/><stop offset="45%" stop-color="${core[1]}"/>` +
    `<stop offset="100%" stop-color="${core[2]}"/></radialGradient>` +
    `<radialGradient id="sc${id}"><stop offset="0%" stop-color="#FFD86E" stop-opacity=".8"/>` +
    `<stop offset="100%" stop-color="#FFB020" stop-opacity="0"/></radialGradient></defs>` +
    `<circle cx="${cx}" cy="${cy}" r="${r * 2.05}" fill="url(#sc${id})" class="${a ? "aw-corona" : ""}" style="transform-origin:${cx}px ${cy}px${a ? "" : ";opacity:.5"}"/>` +
    `<g class="${a ? "aw-breathe" : ""}" style="transform-origin:${cx}px ${cy}px">${ry}` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#sd${id})"/>` +
    `<ellipse cx="${cx - r * 0.32}" cy="${cy - r * 0.4}" rx="${r * 0.36}" ry="${r * 0.24}" fill="#FFFDF0" opacity=".6"/></g>`
  );
}

function moon(id, cx, cy, r, a) {
  const d =
    `M ${cx + r * 0.36} ${cy - r} a ${r} ${r} 0 1 0 ${r * 0.02} ${2 * r}` +
    ` a ${r * 1.08} ${r * 1.08} 0 1 1 ${-r * 0.02} ${-2 * r} Z`;
  let st = "";
  [[cx + r * 1.35, cy - r * 1, 1.5], [cx + r * 1.85, cy - r * 0.28, 1.05], [cx + r * 1.2, cy + r * 0.42, 0.9]].forEach((p, i) => {
    st += `<circle cx="${p[0]}" cy="${p[1]}" r="${p[2]}" fill="#FFF0BC" class="${a ? "aw-twinkle" : ""}" style="animation-delay:${i * 0.8}s"/>`;
  });
  return (
    `<defs><linearGradient id="mg${id}" x1=".2" y1="0" x2=".8" y2="1">` +
    `<stop offset="0%" stop-color="#FFF6D8"/><stop offset="55%" stop-color="#FFDD86"/>` +
    `<stop offset="100%" stop-color="#D89F32"/></linearGradient>` +
    `<radialGradient id="mh${id}"><stop offset="0%" stop-color="#FFE6A6" stop-opacity=".4"/>` +
    `<stop offset="100%" stop-color="#FFE6A6" stop-opacity="0"/></radialGradient></defs>` +
    `<circle cx="${cx}" cy="${cy}" r="${r * 1.9}" fill="url(#mh${id})" class="${a ? "aw-corona" : ""}" style="transform-origin:${cx}px ${cy}px${a ? "" : ";opacity:.5"}"/>` +
    `<path d="${d}" fill="url(#mg${id})"/>${st}`
  );
}

function drops(id, xs, y, h, w, a, sp) {
  let o =
    `<defs><linearGradient id="dg${id}" x1="0" y1="0" x2=".3" y2="1">` +
    `<stop offset="0%" stop-color="#DCEEFF"/><stop offset="45%" stop-color="#8FC4F0"/>` +
    `<stop offset="100%" stop-color="#5591CE"/></linearGradient></defs>`;
  xs.forEach((x, i) => {
    const d =
      `M ${x} ${y} C ${x + w} ${y + h * 0.55} ${x + w} ${y + h} ${x} ${y + h}` +
      ` C ${x - w} ${y + h} ${x - w} ${y + h * 0.55} ${x} ${y} Z`;
    o +=
      `<g class="${a ? "aw-fall " + sp : ""}" style="animation-delay:${(i * 0.2).toFixed(2)}s">` +
      `<path d="${d}" fill="url(#dg${id})"/>` +
      `<ellipse cx="${x - w * 0.28}" cy="${y + h * 0.7}" rx="${w * 0.26}" ry="${h * 0.12}" fill="#fff" opacity=".7"/></g>`;
  });
  return o;
}

function flake(id, x, y, r, a, dl, w) {
  let o = "";
  for (let i = 0; i < 3; i++) {
    const ang = (i * 60 * Math.PI) / 180;
    const dx = Math.cos(ang) * r;
    const dy = Math.sin(ang) * r;
    o +=
      `<line x1="${(x - dx).toFixed(1)}" y1="${(y - dy).toFixed(1)}" x2="${(x + dx).toFixed(1)}" y2="${(y + dy).toFixed(1)}"` +
      ` stroke="#F2F8FF" stroke-width="${w}" stroke-linecap="round"/>`;
  }
  o += `<circle cx="${x}" cy="${y}" r="${r * 0.24}" fill="#fff"/>`;
  return `<g class="${a ? "aw-tumble" : ""}" style="transform-origin:${x}px ${y}px;animation-delay:${dl}s">${o}</g>`;
}

// ---------- proposed primitives ----------
export const MARK = { wind: "#DCE8F6", haze: "#EBDDBE", smoke: "#CFC6BA", dust: "#EBCB93", shimmer: "#FFB86B", ice: "#CFE6FA", funnel: "#C3CEDC", spiral: "#F1F6FC", smokeSun: "#FFA75A" };

function wind(a, y0 = 49, color = MARK.wind) {
  const c = a ? "aw-slide" : "";
  return (
    `<g fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round">` +
    `<path class="${c}" d="M9 ${y0}h26a4.2 4.2 0 1 0-4.2-4.2"/>` +
    `<path class="${c}" style="animation-delay:.9s" d="M15 ${y0 + 6}h30a3.8 3.8 0 1 1-3.8 3.8"/>` +
    `<path class="${c}" style="animation-delay:1.8s" d="M7 ${y0 + 11.5}h17"/></g>`
  );
}

function pellets(id, pts, a) {
  let o =
    `<defs><radialGradient id="pg${id}" cx="35%" cy="30%"><stop offset="0%" stop-color="#FFFFFF"/>` +
    `<stop offset="60%" stop-color="${MARK.ice}"/><stop offset="100%" stop-color="#8DB9E2"/></radialGradient></defs>`;
  pts.forEach((p, i) => {
    o += `<g class="${a ? "aw-fall" : ""}" style="animation-delay:${(i * 0.17).toFixed(2)}s"><circle cx="${p[0]}" cy="${p[1]}" r="${p[2]}" fill="url(#pg${id})" stroke="#EAF4FF" stroke-width=".5"/></g>`;
  });
  return o;
}

function bars(a, ys, color, x = 9, w = 46) {
  return ys
    .map((y, i) => `<rect x="${x + i * 2}" y="${y}" width="${w - i * 4}" height="3.6" rx="1.8" fill="${color}" opacity="${(0.94 - i * 0.19).toFixed(2)}" class="${a ? "aw-slide" : ""}" style="animation-delay:${i * 0.6}s"/>`)
    .join("");
}

function waves(a, ys, color, width, x0 = 6, seg = 14, amp = 5, n = 4) {
  return ys
    .map((y, i) => {
      let d = `M${x0} ${y} q${seg / 2} ${-amp} ${seg} 0`;
      for (let k = 1; k < n; k++) d += ` t${seg} 0`;
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" opacity="${(0.95 - i * 0.2).toFixed(2)}" class="${a ? "aw-slide" : ""}" style="animation-delay:${i * 0.7}s"/>`;
    })
    .join("");
}

function crystal(a) {
  let o = `<defs><radialGradient id="cgl"><stop offset="0%" stop-color="#BFE3FF" stop-opacity=".45"/><stop offset="100%" stop-color="#BFE3FF" stop-opacity="0"/></radialGradient></defs>`;
  o += `<circle cx="32" cy="32" r="26" fill="url(#cgl)"/>`;
  let arms = "";
  for (let i = 0; i < 6; i++) {
    arms +=
      `<g transform="rotate(${i * 60} 32 32)"><line x1="32" y1="32" x2="32" y2="14.5" stroke="#EAF6FF" stroke-width="3" stroke-linecap="round"/>` +
      `<path d="M27.6 19.6 L32 23.6 L36.4 19.6" fill="none" stroke="#EAF6FF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  }
  o += `<g class="${a ? "aw-breathe" : ""}" style="transform-origin:32px 32px">${arms}<circle cx="32" cy="32" r="3.2" fill="#fff"/></g>`;
  o += `<circle cx="51" cy="13" r="1.5" fill="#EAF6FF" class="${a ? "aw-twinkle" : ""}"/><circle cx="12" cy="50" r="1.2" fill="#EAF6FF" class="${a ? "aw-twinkle" : ""}" style="animation-delay:1.3s"/>`;
  return o;
}

function funnel(id, a) {
  return (
    `<defs><linearGradient id="tg${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#E6ECF4"/><stop offset="100%" stop-color="#93A3BA"/></linearGradient></defs>` +
    `<g class="${a ? "aw-drift" : ""}">` +
    `<path d="M16 17 H50 C48 27 42 31 40 38 C38 44.5 39 50 34.5 61 C33.2 53 30.6 46.5 28.8 40 C27 33 19.5 27.5 16 17 Z" fill="url(#tg${id})"/>` +
    `<path d="M20.5 25.5 Q33 30 45.8 25.5" fill="none" stroke="#6F7F99" stroke-width="1.6" stroke-linecap="round"/>` +
    `<path d="M26 33.5 Q33.5 37 41.4 33.5" fill="none" stroke="#6F7F99" stroke-width="1.6" stroke-linecap="round"/>` +
    `<path d="M29.4 42 Q34 44.6 38.8 42" fill="none" stroke="#6F7F99" stroke-width="1.5" stroke-linecap="round"/>` +
    `<path d="M31.6 50 Q34.4 51.8 37 50" fill="none" stroke="#6F7F99" stroke-width="1.4" stroke-linecap="round"/></g>` +
    `<circle cx="25.5" cy="60.5" r="1.4" fill="${MARK.funnel}"/><circle cx="42" cy="61" r="1.2" fill="${MARK.funnel}"/><circle cx="21" cy="57" r="1" fill="${MARK.funnel}"/><circle cx="46" cy="57.5" r=".9" fill="${MARK.funnel}"/>`
  );
}

function spiral(a) {
  const s = MARK.spiral;
  return (
    `<defs><radialGradient id="hgl"><stop offset="0%" stop-color="#CFE2F4" stop-opacity=".35"/><stop offset="100%" stop-color="#CFE2F4" stop-opacity="0"/></radialGradient></defs>` +
    `<circle cx="32" cy="32" r="27" fill="url(#hgl)"/>` +
    `<g class="${a ? "aw-breathe" : ""}" style="transform-origin:32px 32px" fill="none" stroke-linecap="round">` +
    `<path d="M11 31 A21 21 0 0 1 31 11" stroke="#AFC3DA" stroke-width="2.2" opacity=".7"/>` +
    `<path d="M53 33 A21 21 0 0 1 33 53" stroke="#AFC3DA" stroke-width="2.2" opacity=".7"/>` +
    `<circle cx="32" cy="32" r="7.6" stroke="${s}" stroke-width="4.8"/>` +
    `<path d="M38.4 27.6 C46.5 25.8 50.5 17.5 46.2 8.8" stroke="${s}" stroke-width="4.8"/>` +
    `<path d="M25.6 36.4 C17.5 38.2 13.5 46.5 17.8 55.2" stroke="${s}" stroke-width="4.8"/></g>`
  );
}

const dr = (a) => (a ? "aw-drift" : "");

// Proposed new conditions (day art unless the key says night).
export const NEW_ART = {
  "mostly-cloudy": (id, a) => sun(id, 21, 19, 8.5, a) + cloud(id, 4, 9, 0.9, dr(a), false, 1),
  "wintry-mix": (id, a) => cloud(id, 4, -5, 0.84, dr(a), false, 1) + drops(id, [22], 48, 7.5, 2, a, "") + flake(id + "a", 34, 54, 4.4, a, 0.4, 1.9) + flake(id + "b", 46, 51, 3.6, a, 1.5, 1.7),
  "sleet": (id, a) => cloud(id, 4, -5, 0.84, dr(a), false, 1) + pellets(id, [[21, 50, 2.3], [29, 55, 2.6], [37, 50, 2.2], [44, 56, 2.5], [34, 60, 1.9]], a),
  "blizzard": (id, a) => cloud(id, 4, -8, 0.88, dr(a), true, 1) + flake(id + "a", 21, 46, 4.6, a, 0, 2) + flake(id + "b", 35, 49, 5, a, 0.9, 2.1) + flake(id + "c", 48, 45, 4.2, a, 1.9, 1.9) +
    `<g fill="none" stroke="${MARK.wind}" stroke-width="2.4" stroke-linecap="round"><path class="${a ? "aw-slide" : ""}" d="M8 57.5h29a3 3 0 1 0-3-3"/><path class="${a ? "aw-slide" : ""}" style="animation-delay:1s" d="M40 61.5h16"/></g>`,
  "haze": (id, a) => sun(id, 32, 26, 12, a, false, ["#FFF6DC", "#FFDF94", "#F2B95A"]) + bars(a, [30, 37.5, 45], MARK.haze),
  "smoke": (id, a) =>
    `<defs><radialGradient id="ss${id}"><stop offset="0%" stop-color="#FFC08A"/><stop offset="100%" stop-color="${MARK.smokeSun}"/></radialGradient></defs>` +
    `<circle cx="44" cy="18" r="15" fill="${MARK.smokeSun}" opacity=".18"/><circle cx="44" cy="18" r="8" fill="url(#ss${id})"/>` + waves(a, [31, 41.5, 52], MARK.smoke, 4.2),
  "dust": (id, a) => sun(id, 45, 17, 8, a, false, ["#FFF3D6", "#F6D592", "#DDA85A"]) + wind(a, 40, MARK.dust) +
    [[14, 34, 1.3], [26, 31, 1], [52, 38, 1.2], [40, 60, 1.1], [56, 52, 1], [30, 58, 0.9]].map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="${p[2]}" fill="#F3DDB0"/>`).join(""),
  "hot": (id, a) => sun(id, 32, 25, 12.5, a) + waves(a, [50, 55.5, 61], MARK.shimmer, 2.4, 14, 9, 3.2, 4),
  "cold": (id, a) => crystal(a),
  "tornado": (id, a) => funnel(id, a) + cloud(id, 8.5, -13, 0.74, dr(a), true, 1),
  "tropical-storm": (id, a) => spiral(a),
  "mostly-clear-night": (id, a) => moon(id, 25, 24, 10, a) + cloud(id, 12, 14, 0.62, dr(a), false, 1),
  "mostly-cloudy-night": (id, a) => moon(id, 21, 18, 8.5, a) + cloud(id, 4, 9, 0.9, dr(a), false, 1),
};

export const NEW_TINTS = {
  "mostly-cloudy": ["#41678F", "#284B74"],
  "wintry-mix": ["#3B5A78", "#22394F"],
  "sleet": ["#38566F", "#20364A"],
  "blizzard": ["#32485F", "#182535"],
  "haze": ["#51647A", "#34465A"],
  "smoke": ["#4B4E57", "#2A2D34"],
  "dust": ["#5E5444", "#3A3329"],
  "hot": ["#874A2C", "#55291F"],
  "cold": ["#2C5F8A", "#143250"],
  "tornado": ["#2B3B3F", "#12191C"],
  "tropical-storm": ["#234450", "#0F1E26"],
  "mostly-clear-night": ["#1D3154", "#0C1424"],
  "mostly-cloudy-night": ["#1B2C49", "#0B1220"],
};

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
export function mix(a, b, t) { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); }
export function luminance(h) { const [r, g, b] = hex(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
export function contrast(a, b) { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); }

export const ALL_TINTS = { ...SKY_TINTS, ...NEW_TINTS };
const NIGHT_OF = { "clear": "clear-night", "mostly-clear": "mostly-clear-night", "partly-cloudy": "partly-cloudy-night", "mostly-cloudy": "mostly-cloudy-night", "light-snow": "snow-night", "snow": "snow-night", "heavy-snow": "snow-night" };

/** Resolve (condition, isDay) to art key + tint, with a darker night sky for every condition. */
export function resolve(cond, isDay = true) {
  if (isDay) return { key: cond, tint: ALL_TINTS[cond] };
  const nk = NIGHT_OF[cond];
  if (nk) return { key: nk, tint: ALL_TINTS[nk] };
  const d = ALL_TINTS[cond];
  return { key: cond, tint: [mix(d[0], "#050A14", 0.42), mix(d[1], "#050A14", 0.42)] };
}

let seq = 0;
const DRY = new Set(["clear", "mostly-clear", "partly-cloudy", "mostly-cloudy", "overcast", "clear-night", "mostly-clear-night", "partly-cloudy-night", "mostly-cloudy-night"]);

/** Inner SVG markup for a condition. `windy` applies only to dry skies. */
export function artFor(cond, { isDay = true, animate = true, windy = false } = {}) {
  const { key } = resolve(cond, isDay);
  const fn = WEATHER_ART[key] ?? NEW_ART[key];
  const id = "m" + (seq++).toString(36);
  const base = fn(id, animate);
  if (windy && DRY.has(key)) return `<g transform="translate(7,-3) scale(.78)">${base}</g>` + wind(animate, 49);
  return base;
}

export function skyIcon(cond, opts = {}) {
  const { tint } = resolve(cond, opts.isDay ?? true);
  const title = opts.title ? `<title>${opts.title}</title>` : "";
  const a11y = opts.title ? `role="img" aria-label="${opts.title}"` : `aria-hidden="true"`;
  return `<span class="sky ${opts.cls ?? ""}" style="background:linear-gradient(168deg,${tint[0]} 0%,${tint[1]} 100%)"><svg viewBox="0 0 64 64" preserveAspectRatio="xMidYMid meet" ${a11y}>${title}${artFor(cond, opts)}</svg></span>`;
}

/** Marks each proposed condition draws, for the contrast check (hardest mark colours). */
export const NEW_MARKS = {
  "mostly-cloudy": ["#FFCB40", "#B3C2D8"],
  "wintry-mix": ["#8FC4F0", "#F2F8FF"],
  "sleet": [MARK.ice],
  "blizzard": ["#F2F8FF", MARK.wind, "#8D9DB6"],
  "haze": ["#FFDF94", MARK.haze],
  "smoke": [MARK.smokeSun, MARK.smoke],
  "dust": ["#F6D592", MARK.dust],
  "hot": ["#FFCB40", MARK.shimmer],
  "cold": ["#EAF6FF"],
  "tornado": [MARK.funnel, "#8D9DB6"],
  "tropical-storm": [MARK.spiral],
  "mostly-clear-night": ["#FFDD86", "#B3C2D8"],
  "mostly-cloudy-night": ["#FFDD86", "#B3C2D8"],
};
