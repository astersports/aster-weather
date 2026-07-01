#!/usr/bin/env node
// Supply-chain faucet gate — CLAUDE.md Phase 0.0 / docs/PLAN_ON_TRUTH_2026-07-01.
//
// Fails a PR (forcing a human) when a dependency change is EITHER:
//   (a) a MAJOR-version bump (any package), OR
//   (b) ANY change (major OR minor OR patch, add/remove) to a
//       money / child / auth-adjacent package.
// Everything else (minor/patch to non-sensitive deps) PASSES and stays
// eligible for auto-merge — so the good part of the faucet keeps flowing.
//
// Gate by what the dependency TOUCHES, not the version-jump size. A human
// owner releases a gated PR by applying the `dep-review-approved` label
// (a real, auditable human sign-off — not a PR-body token, per the AP #45
// lesson that body-text exemptions drift).
//
// Env: BASE_PKG (path to base package.json), HEAD_PKG (path to head
//      package.json), LABELS (comma-joined PR label names).

import { readFileSync } from 'node:fs';

// Money / child / auth-adjacent surface. Matched against dependency NAMES.
// supabase-js sits on the data/RLS path (child data) AND the auth path, so
// any bump to it is reviewed. Keep this list append-only + commented.
const SENSITIVE = [
  /^stripe$/, /^@stripe\//,                       // money — Stripe SDK
  /^@supabase\//, /supabase-js/,                  // data/RLS (child) + auth
  /(^|[-_/])cookie($|[-_/])/,                      // session cookies (cookie 1→2)
  /session/i,                                      // *-session stores
  /(^|[-_/])auth($|[-_/])/i, /oauth/i,             // auth / oauth libs
  /^jose$/, /jsonwebtoken/, /(^|[-_/])jwt($|[-_/])/i, // token signing/verify
  /passport/i, /bcrypt/i, /argon2/i,              // credential / password hashing
];

const isSensitive = (name) => SENSITIVE.some((re) => re.test(name));

// Major from a range string: strip leading ^ ~ >= etc., take the first int.
// "^4.1.9" -> 4 · "10.0.1" -> 10 · "*"/"workspace:*"/git-url -> null (no major test).
const majorOf = (v) => {
  const m = String(v).replace(/^[^\d]*/, '').match(/^(\d+)/);
  return m ? Number(m[1]) : null;
};

const readDeps = (p) => {
  const j = JSON.parse(readFileSync(p, 'utf8'));
  return {
    ...(j.dependencies || {}),
    ...(j.devDependencies || {}),
    ...(j.optionalDependencies || {}),
  };
};

const base = readDeps(process.env.BASE_PKG);
const head = readDeps(process.env.HEAD_PKG);
const labels = (process.env.LABELS || '').split(',').map((s) => s.trim());
const OVERRIDE = 'dep-review-approved';

const flagged = [];
for (const name of new Set([...Object.keys(base), ...Object.keys(head)])) {
  const b = base[name];
  const h = head[name];
  if (b === h) continue; // unchanged
  const reasons = [];
  if (isSensitive(name)) reasons.push('money/child/auth-adjacent');
  if (b !== undefined && h !== undefined) {
    const bm = majorOf(b);
    const hm = majorOf(h);
    if (bm !== null && hm !== null && hm > bm) reasons.push(`major bump ${b} → ${h}`);
  }
  if (reasons.length) {
    flagged.push({ name, from: b ?? '(added)', to: h ?? '(removed)', reasons });
  }
}

if (flagged.length === 0) {
  console.log('dependency-gate: PASS — no major or money/child/auth-adjacent dependency change.');
  process.exit(0);
}

console.log('Dependency changes that require a human owner:');
for (const f of flagged) {
  console.log(`  • ${f.name}  ${f.from} → ${f.to}   [${f.reasons.join('; ')}]`);
}

if (labels.includes(OVERRIDE)) {
  console.log(`\ndependency-gate: PASS — released by the '${OVERRIDE}' label (human sign-off recorded).`);
  process.exit(0);
}

console.log(
  `\n::error::Supply-chain faucet gate — this PR changes a major-version or ` +
    `money/child/auth-adjacent dependency and must NOT auto-merge on green. ` +
    `A human owner reviews it, then applies the '${OVERRIDE}' label to release it. ` +
    `(CLAUDE.md Phase 0.0 / PLAN_ON_TRUTH: gate by what the dependency touches, not the version-jump size.)`
);
process.exit(1);
