# Backlog — aster-weather

One row per bug or gap, logged the moment it is found. Fixed at the end of the stage that
found it, each with a test, unless it breaks a required check (then it is fixed at once).

| id | date | where | what | repro | severity | status |
|---|---|---|---|---|---|---|
| B-001 | 2026-11-27 | `src/cache.ts` `get()` and `getWithMeta()`, through `bindOnError` | A consumer's `onError` that throws makes the engine reject. That breaks "the engine never throws" (CLAUDE.md §3 rule 6). It predates the new engine. | Pass `onError: () => { throw new Error("x") }` and make the fetch fail twice. | High | Open — fix before `v0.8.0` |
| B-002 | 2026-11-27 | `src/nws/hourly.ts`, and each later fetcher | When the point lookup fails (not a 404), the fetcher returns `null` without trying the last-good store. | Cold cache, `/points` answers 500, the store holds a one-hour-old reading: the answer is `null`. | Medium | Open — fix before `v0.8.0` |
| B-003 | 2026-11-27 | `src/nws/hourly.ts` | When the grid request fails, the hourly result is cached for the full hour with its grid fields `null`. A grid that recovers inside that hour is not seen. | Grid answers 500 on the first load, then recovers. | Medium | Open — fix before `v0.8.0` |
| B-004 | 2026-11-27 | `docs/superpowers/specs/2026-11-27-proposed-icon-art.mjs` | The proposed tornado icon's funnel is mostly hidden behind its cloud. | Open the approved mock-up. | Low | Open — `v0.9.0` |
| B-005 | 2026-11-27 | `src/icons/` | The 3:1 contrast rule is documented but no test computes it. | Read `src/__tests__/icons.test.tsx`. | Medium | Open — `v0.9.0` (in the design) |
