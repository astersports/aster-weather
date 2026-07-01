#!/usr/bin/env node
// Supply-chain faucet gate — CLAUDE.md Phase 0.0 / docs/PLAN_ON_TRUTH_2026-07-01.
//
// Fails a PR (forcing a human) when a dependency change is EITHER:
//   (a) a MAJOR-version bump (any package; 0.x minor counts as major per semver), OR
//   (b) ANY change (add/remove/version) to a money/child/auth-adjacent package.
// Everything else (minor/patch to non-sensitive deps) PASSES and stays
// eligible for auto-merge — so the good part of the faucet keeps flowing.
//
// Scans the RESOLVED DEPENDENCY TREE (the lockfile — direct AND transitive),
// not just package.json, because the founding example (`cookie 1→2`) is a
// TRANSITIVE dep: it moves the lockfile with package.json untouched. The
// package.json diff is kept as a belt. No install — the lockfile is parsed as
// data. Handles npm (package-lock.json v3) and pnpm (pnpm-lock.yaml v9),
// auto-detected by content.
//
// Gate by what the dependency TOUCHES, not the version-jump size. A human owner
// releases a gated PR by applying the `dep-review-approved` label (a real,
// auditable human sign-off — its integrity is enforced by the label-integrity
// workflow, not by this script).
//
// Env: BASE_PKG, HEAD_PKG (package.json paths), BASE_LOCK, HEAD_LOCK (lockfile
//      paths; may be empty on first commit), LABELS (comma-joined PR labels).

import { readFileSync } from 'node:fs';

// Money / child / auth-adjacent surface. Matched against dependency NAMES.
// Append-only + commented; adding a new sensitive lib is itself a
// CODEOWNERS-reviewed change (P1-B).
const SENSITIVE = [
  /^stripe$/, /^@stripe\//,                        // money — Stripe SDK
  /^@supabase\//, /supabase-js/,                   // data/RLS (child) + auth
  /(^|[-_/])cookie($|[-_/])/,                       // session cookies (cookie 1→2)
  /session/i,                                       // *-session stores
  /(^|[-_/])auth($|[-_/])/i, /oauth/i,              // auth / oauth libs
  /^jose$/, /jsonwebtoken/, /(^|[-_/])jwt($|[-_/])/i, // token signing/verify
  /passport/i, /bcrypt/i, /argon2/i,               // credential / password hashing
];
const isSensitive = (name) => SENSITIVE.some((re) => re.test(name));

const read = (p) => {
  try { return p ? readFileSync(p, 'utf8') : ''; } catch { return ''; }
};

// --- semver helpers -------------------------------------------------------
const partsOf = (v) => {
  const m = String(v).replace(/^[^\d]*/, '').match(/^(\d+)\.(\d+)?\.?(\d+)?/);
  return m ? [Number(m[1]), Number(m[2] || 0), Number(m[3] || 0)] : null;
};
const cmp = (a, b) => {
  const pa = partsOf(a), pb = partsOf(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
};
// P2: under semver, a 0.x minor bump (0.4→0.5) is breaking → treat as major.
const isMajorBump = (b, h) => {
  const pb = partsOf(b), ph = partsOf(h);
  if (!pb || !ph) return false;
  if (ph[0] > pb[0]) return true;
  if (pb[0] === 0 && ph[0] === 0 && ph[1] > pb[1]) return true;
  return false;
};
const maxVer = (set) => [...set].reduce((m, v) => (m && cmp(m, v) >= 0 ? m : v), null);

// --- dependency-map builders ---------------------------------------------
// name -> Set(resolved versions present in the tree)
const addVer = (map, name, ver) => {
  if (!name || !ver) return;
  if (!map.has(name)) map.set(name, new Set());
  map.get(name).add(String(ver));
};

// package.json: direct declared ranges (the belt).
const readPkg = (path) => {
  const map = new Map();
  const raw = read(path);
  if (!raw.trim()) return map;
  let j; try { j = JSON.parse(raw); } catch { return map; }
  for (const block of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [n, v] of Object.entries(j[block] || {})) addVer(map, n, v);
  }
  return map;
};

// npm package-lock.json v3: iterate the `packages` map; key node_modules/<name>.
const parseNpm = (raw) => {
  const map = new Map();
  let j; try { j = JSON.parse(raw); } catch { return map; }
  for (const [key, node] of Object.entries(j.packages || {})) {
    if (!key) continue; // "" is the root project
    const at = key.lastIndexOf('node_modules/');
    const name = at >= 0 ? key.slice(at + 'node_modules/'.length) : key;
    addVer(map, name, node && node.version);
  }
  // v2/legacy fallback: the flat `dependencies` tree, if present.
  const walk = (deps) => {
    for (const [n, node] of Object.entries(deps || {})) {
      addVer(map, n, node && node.version);
      if (node && node.dependencies) walk(node.dependencies);
    }
  };
  if (map.size === 0) walk(j.dependencies);
  return map;
};

// name@version → {name, ver}; strips quotes + any (peer) suffix. Handles scopes.
const splitNV = (key) => {
  let k = key.replace(/^['"]|['"]$/g, '').replace(/\(.*\)\s*$/, '').trim();
  const at = k.lastIndexOf('@');
  if (at <= 0) return null; // no version, or leading-@ scope only
  return { name: k.slice(0, at), ver: k.slice(at + 1) };
};

// pnpm-lock.yaml v9: the top-level `packages:` block lists every resolved
// package as a `name@version:` key. Parse those keys (data, not YAML semantics).
const parsePnpm = (raw) => {
  const map = new Map();
  let inPackages = false;
  for (const line of raw.split('\n')) {
    if (/^[A-Za-z']/.test(line)) {           // a top-level key (col 0)
      inPackages = /^packages:\s*$/.test(line);
      continue;
    }
    if (!inPackages) continue;
    // package keys sit at exactly 2-space indent and end with ':'
    if (/^ {2}\S/.test(line) && /:\s*$/.test(line)) {
      const key = line.trim().replace(/:\s*$/, '');
      const nv = splitNV(key);
      if (nv) addVer(map, nv.name, nv.ver);
    }
  }
  return map;
};

const parseLock = (path) => {
  const raw = read(path);
  if (!raw.trim()) return new Map();
  return raw.trimStart().startsWith('{') ? parseNpm(raw) : parsePnpm(raw);
};

// --- comparison -----------------------------------------------------------
// Merge lockfile (primary, resolved tree) + package.json (belt) into one map.
const buildMap = (pkgPath, lockPath) => {
  const map = parseLock(lockPath);
  for (const [n, vers] of readPkg(pkgPath)) for (const v of vers) addVer(map, n, v);
  return map;
};

const base = buildMap(process.env.BASE_PKG, process.env.BASE_LOCK);
const head = buildMap(process.env.HEAD_PKG, process.env.HEAD_LOCK);
const labels = (process.env.LABELS || '').split(',').map((s) => s.trim());
const OVERRIDE = 'dep-review-approved';

const sameSet = (a, b) => a && b && a.size === b.size && [...a].every((v) => b.has(v));

const flagged = [];
for (const name of new Set([...base.keys(), ...head.keys()])) {
  const b = base.get(name);
  const h = head.get(name);
  if (sameSet(b, h)) continue; // unchanged
  const reasons = [];
  const changed = !sameSet(b, h);
  if (isSensitive(name) && changed) reasons.push('money/child/auth-adjacent');
  // Major bump: only when both sides present (added packages aren't "bumps").
  if (b && b.size && h && h.size) {
    const bMax = maxVer(b), hMax = maxVer(h);
    if (isMajorBump(bMax, hMax)) reasons.push(`major bump ${bMax} → ${hMax}`);
  }
  if (reasons.length) {
    const from = b && b.size ? maxVer(b) : '(added)';
    const to = h && h.size ? maxVer(h) : '(removed)';
    flagged.push({ name, from, to, reasons });
  }
}

if (flagged.length === 0) {
  console.log('dependency-gate: PASS — no major or money/child/auth-adjacent dependency change (resolved tree).');
  process.exit(0);
}

flagged.sort((a, b) => a.name.localeCompare(b.name));
console.log('Dependency changes that require a human owner (resolved tree — direct + transitive):');
for (const f of flagged) console.log(`  • ${f.name}  ${f.from} → ${f.to}   [${f.reasons.join('; ')}]`);

if (labels.includes(OVERRIDE)) {
  console.log(`\ndependency-gate: PASS — released by the '${OVERRIDE}' label (human sign-off recorded).`);
  process.exit(0);
}

console.log(
  `\n::error::Supply-chain faucet gate — this PR changes a major-version or ` +
    `money/child/auth-adjacent dependency (direct OR transitive) and must NOT auto-merge ` +
    `on green. A human owner reviews it, then applies the '${OVERRIDE}' label to release it. ` +
    `(CLAUDE.md Phase 0.0 / PLAN_ON_TRUTH: gate by what the dependency touches, not the version-jump size.)`
);
process.exit(1);
