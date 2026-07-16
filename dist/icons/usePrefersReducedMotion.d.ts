/**
 * SSR-safe `prefers-reduced-motion` hook (WX-P2-9).
 *
 * Returns TRUE (motion reduced) during SSR and on the first client render, so
 * server output and reduced-motion users get the static art with ZERO
 * animation nodes. After mount it reads the media query and subscribes to
 * changes, flipping to FALSE when the user allows motion.
 */
export declare function usePrefersReducedMotion(): boolean;
//# sourceMappingURL=usePrefersReducedMotion.d.ts.map