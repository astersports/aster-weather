/**
 * SSR-safe `prefers-reduced-motion` hook (WX-P2-9).
 *
 * Returns TRUE (motion reduced) during SSR and on the first client render, so
 * server output and reduced-motion users get the static art with ZERO
 * animation nodes. After mount it reads the media query and subscribes to
 * changes, flipping to FALSE when the user allows motion.
 */
import * as React from "react";
export function usePrefersReducedMotion() {
    const [reduced, setReduced] = React.useState(true);
    React.useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
            return;
        }
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        const update = () => setReduced(mq.matches);
        update();
        if (typeof mq.addEventListener === "function") {
            mq.addEventListener("change", update);
            return () => mq.removeEventListener("change", update);
        }
        // Older Safari
        mq.addListener(update);
        return () => mq.removeListener(update);
    }, []);
    return reduced;
}
//# sourceMappingURL=usePrefersReducedMotion.js.map