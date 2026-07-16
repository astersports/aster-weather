import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Utility icons — wind + droplet. Not routed by the weather dispatcher; a
 * severe-wind or humidity surface imports them directly.
 *
 * WX-P3-12: default size normalized to w-4 h-4 (via IconSvg) and WindIcon now
 * carries the shared gradient-stroke treatment like its siblings.
 */
import { IconSvg, useGradientId } from "./iconBase.js";
export function WindIcon({ className, decorative = true, label }) {
    const uid = useGradientId();
    return (_jsxs(IconSvg, { className: className, decorative: decorative, label: label, children: [_jsx("defs", { children: _jsxs("linearGradient", { id: `${uid}-windGrad`, x1: "0%", y1: "0%", x2: "100%", y2: "100%", children: [_jsx("stop", { offset: "0%", stopColor: "#90A4AE" }), _jsx("stop", { offset: "100%", stopColor: "#546E7A" })] }) }), _jsx("path", { d: "M3 8h10a2 2 0 1 0-2-2", stroke: `url(#${uid}-windGrad)`, strokeWidth: "1.8", strokeLinecap: "round" }), _jsx("path", { d: "M3 12h14a2.5 2.5 0 1 1-2.5 2.5", stroke: `url(#${uid}-windGrad)`, strokeWidth: "1.8", strokeLinecap: "round" }), _jsx("path", { d: "M3 16h7a2 2 0 1 1-2 2", stroke: `url(#${uid}-windGrad)`, strokeWidth: "1.8", strokeLinecap: "round" })] }));
}
export function DropletIcon({ className, decorative = true, label }) {
    const uid = useGradientId();
    return (_jsxs(IconSvg, { className: className, decorative: decorative, label: label, children: [_jsx("defs", { children: _jsxs("linearGradient", { id: `${uid}-dropGrad`, x1: "0%", y1: "0%", x2: "0%", y2: "100%", children: [_jsx("stop", { offset: "0%", stopColor: "#64B5F6" }), _jsx("stop", { offset: "100%", stopColor: "#1565C0" })] }) }), _jsx("path", { d: "M12 2.5c0 0-6 7.5-6 12a6 6 0 0 0 12 0c0-4.5-6-12-6-12z", fill: `url(#${uid}-dropGrad)` })] }));
}
//# sourceMappingURL=UtilityIcons.js.map