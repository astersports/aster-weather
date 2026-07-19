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
const CLOUD = "M20 46 C12.6 46 7 40.6 7 34 C7 27.9 11.7 22.8 17.8 22.1 C19.6 15.3 25.8 10.4 33 10.4 " +
    "C40.4 10.4 46.6 15.5 48.3 22.3 C54 23.1 58 27.9 58 33.9 C58 40.6 52.6 46 45.4 46 Z";
function cloud(id, dx, dy, sc, cls, dark, al) {
    const s = dark ? { a: "#B4C2D6", b: "#8D9DB6", c: "#65758F" } : { a: "#FDFEFF", b: "#E1E9F5", c: "#B3C2D8" };
    return (`<defs><linearGradient id="cg${id}" x1=".15" y1="0" x2=".55" y2="1">` +
        `<stop offset="0%" stop-color="${s.a}"/><stop offset="50%" stop-color="${s.b}"/><stop offset="100%" stop-color="${s.c}"/></linearGradient>` +
        `<clipPath id="cc${id}"><path d="${CLOUD}"/></clipPath>` +
        `<filter id="cs${id}" x="-25%" y="-25%" width="150%" height="160%">` +
        `<feDropShadow dx="0" dy="1.4" stdDeviation="1.5" flood-color="#050B16" flood-opacity=".38"/></filter>` +
        `<filter id="cb${id}"><feGaussianBlur stdDeviation="2.2"/></filter></defs>` +
        `<g class="${cls}" transform="translate(${dx},${dy}) scale(${sc})" opacity="${al == null ? 1 : al}">` +
        `<g filter="url(#cs${id})"><path d="${CLOUD}" fill="url(#cg${id})"/>` +
        `<g clip-path="url(#cc${id})">` +
        `<ellipse cx="34" cy="51" rx="30" ry="11" fill="${s.c}" opacity=".75" filter="url(#cb${id})"/>` +
        `<ellipse cx="26" cy="17.5" rx="13" ry="5.6" fill="#fff" opacity=".85" filter="url(#cb${id})"/></g></g></g>`);
}
function sun(id, cx, cy, r, a, rays = true) {
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
    return (`<defs><radialGradient id="sd${id}" cx="34%" cy="28%">` +
        `<stop offset="0%" stop-color="#FFF8DA"/><stop offset="45%" stop-color="#FFCE48"/>` +
        `<stop offset="100%" stop-color="#F09010"/></radialGradient>` +
        `<radialGradient id="sc${id}"><stop offset="0%" stop-color="#FFD86E" stop-opacity=".8"/>` +
        `<stop offset="100%" stop-color="#FFB020" stop-opacity="0"/></radialGradient></defs>` +
        `<circle cx="${cx}" cy="${cy}" r="${r * 2.05}" fill="url(#sc${id})" class="${a ? "aw-corona" : ""}" style="transform-origin:${cx}px ${cy}px${a ? "" : ";opacity:.5"}"/>` +
        `<g class="${a ? "aw-breathe" : ""}" style="transform-origin:${cx}px ${cy}px">${ry}` +
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#sd${id})"/>` +
        `<ellipse cx="${cx - r * 0.32}" cy="${cy - r * 0.4}" rx="${r * 0.36}" ry="${r * 0.24}" fill="#FFFDF0" opacity=".6"/></g>`);
}
function moon(id, cx, cy, r, a) {
    const d = `M ${cx + r * 0.36} ${cy - r} a ${r} ${r} 0 1 0 ${r * 0.02} ${2 * r}` +
        ` a ${r * 1.08} ${r * 1.08} 0 1 1 ${-r * 0.02} ${-2 * r} Z`;
    let st = "";
    [[cx + r * 1.35, cy - r * 1, 1.5], [cx + r * 1.85, cy - r * 0.28, 1.05], [cx + r * 1.2, cy + r * 0.42, 0.9]].forEach((p, i) => {
        st += `<circle cx="${p[0]}" cy="${p[1]}" r="${p[2]}" fill="#FFF0BC" class="${a ? "aw-twinkle" : ""}" style="animation-delay:${i * 0.8}s"/>`;
    });
    return (`<defs><linearGradient id="mg${id}" x1=".2" y1="0" x2=".8" y2="1">` +
        `<stop offset="0%" stop-color="#FFF6D8"/><stop offset="55%" stop-color="#FFDD86"/>` +
        `<stop offset="100%" stop-color="#D89F32"/></linearGradient>` +
        `<radialGradient id="mh${id}"><stop offset="0%" stop-color="#FFE6A6" stop-opacity=".4"/>` +
        `<stop offset="100%" stop-color="#FFE6A6" stop-opacity="0"/></radialGradient></defs>` +
        `<circle cx="${cx}" cy="${cy}" r="${r * 1.9}" fill="url(#mh${id})" class="${a ? "aw-corona" : ""}" style="transform-origin:${cx}px ${cy}px${a ? "" : ";opacity:.5"}"/>` +
        `<path d="${d}" fill="url(#mg${id})"/>${st}`);
}
function drops(id, xs, y, h, w, a, sp) {
    let o = `<defs><linearGradient id="dg${id}" x1="0" y1="0" x2=".3" y2="1">` +
        `<stop offset="0%" stop-color="#DCEEFF"/><stop offset="45%" stop-color="#8FC4F0"/>` +
        `<stop offset="100%" stop-color="#5591CE"/></linearGradient></defs>`;
    xs.forEach((x, i) => {
        const d = `M ${x} ${y} C ${x + w} ${y + h * 0.55} ${x + w} ${y + h} ${x} ${y + h}` +
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
function bolt(id, a) {
    const d = "M35 40 L27 53 L32.6 53 L29.5 63 L40.5 48.5 L34.6 48.5 L38.2 40 Z";
    return (`<defs><linearGradient id="bg${id}" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0%" stop-color="#FFF3B4"/><stop offset="50%" stop-color="#FFC72E"/>` +
        `<stop offset="100%" stop-color="#EE8B0C"/></linearGradient>` +
        `<filter id="bb${id}" x="-95%" y="-95%" width="290%" height="290%"><feGaussianBlur stdDeviation="3.8"/></filter></defs>` +
        `<path d="${d}" fill="#FFE47E" filter="url(#bb${id})" class="${a ? "aw-bloom" : ""}"${a ? "" : ' style="opacity:.16"'}/>` +
        `<path d="${d}" fill="url(#bg${id})" class="${a ? "aw-flash" : ""}"/>`);
}
function fogBars(a) {
    let b = "";
    [0, 1, 2].forEach((i) => {
        b += `<rect x="10" y="${46 + i * 6}" width="44" height="3.4" rx="1.7" fill="#C3D2E6" opacity="${0.9 - i * 0.24}" class="${a ? "aw-slide" : ""}" style="animation-delay:${i * 0.6}s"/>`;
    });
    return b;
}
const dr = (a) => (a ? "aw-drift" : "");
export const WEATHER_ART = {
    "clear": (id, a) => sun(id, 32, 32, 13, a),
    "mostly-clear": (id, a) => sun(id, 25, 24, 10, a) + cloud(id, 12, 14, 0.62, dr(a), false, 1),
    "partly-cloudy": (id, a) => sun(id, 23, 22, 10, a) + cloud(id, 7, 12, 0.78, dr(a), false, 1),
    "overcast": (id, a) => cloud(id + "u", 2, 2, 0.68, dr(a), true, 0.9) + cloud(id, 5, 10, 0.86, dr(a), false, 1),
    "fog": (id, a) => cloud(id, 4, -3, 0.84, dr(a), false, 1) + fogBars(a),
    "drizzle": (id, a) => cloud(id, 4, -5, 0.84, dr(a), false, 1) + drops(id, [25, 33, 41], 48, 5, 1.4, a, "aw-fall-slow"),
    "light-rain": (id, a) => cloud(id, 4, -5, 0.84, dr(a), false, 1) + drops(id, [24, 33, 42], 48, 7, 1.9, a, ""),
    "rain": (id, a) => cloud(id, 4, -5, 0.84, dr(a), false, 1) + drops(id, [21, 29, 37, 45], 48, 8, 2.1, a, ""),
    "heavy-rain": (id, a) => cloud(id, 4, -6, 0.88, dr(a), true, 1) + drops(id, [19, 26, 33, 40, 47], 48, 9.5, 2.3, a, "aw-fall-fast"),
    "thunderstorm": (id, a) => cloud(id, 4, -7, 0.88, dr(a), true, 1) + bolt(id, a),
    "freezing-rain": (id, a) => cloud(id, 4, -5, 0.84, dr(a), false, 1) + drops(id, [23, 41], 48, 7.5, 2, a, "") + flake(id, 32, 54, 4.4, a, 0.4, 1.9),
    "light-snow": (id, a) => cloud(id, 4, -5, 0.84, dr(a), false, 1) + flake(id + "a", 26, 53, 4.8, a, 0, 2) + flake(id + "b", 41, 55, 4, a, 1.4, 1.8),
    "snow": (id, a) => cloud(id, 4, -5, 0.84, dr(a), false, 1) + flake(id + "a", 23, 53, 5.2, a, 0, 2.1) + flake(id + "b", 34, 56, 4.6, a, 1.2, 2) + flake(id + "c", 45, 52, 4.9, a, 2.3, 2),
    "heavy-snow": (id, a) => cloud(id, 4, -6, 0.88, dr(a), true, 1) + flake(id + "a", 20, 53, 5.4, a, 0, 2.2) + flake(id + "b", 32, 56, 5, a, 0.9, 2.1) + flake(id + "c", 45, 53, 5.2, a, 1.9, 2.2) + flake(id + "d", 37, 47, 3.6, a, 2.7, 1.7),
    "clear-night": (id, a) => moon(id, 29, 32, 12.5, a),
    "partly-cloudy-night": (id, a) => moon(id, 24, 22, 10, a) + cloud(id, 7, 12, 0.78, dr(a), false, 1),
    "snow-night": (id, a) => moon(id, 23, 19, 8.5, a) + cloud(id, 7, 5, 0.78, dr(a), false, 1) + flake(id + "a", 25, 53, 4.6, a, 0, 1.9) + flake(id + "b", 40, 55, 4, a, 1.3, 1.8),
};
//# sourceMappingURL=weatherArt.js.map