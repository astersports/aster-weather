#!/usr/bin/env node
// Ported from aster-studio's scripts/dependency-gate.mjs (aster-studio #67), itself ported from the
// estate kit — astersports/aster-io kit/files/scripts/estate/dependency-gate.mjs (the 2026-10-04
// directive-aligned version). Kept at this repo's own path so the `dependency-gate` job, its CI
// wiring and CODEOWNERS entry stay where they were. Local differences, all additive (detection is
// never narrowed by the port): the WATCHLIST carries `@aster/tokens` as aster-studio's does (inert
// here — this repo pins neither watched package); the flagged listing is also written to the job's
// step summary; and this repo's own two earlier hardenings are kept — the broader auth patterns
// (WX-P2-17) and the report on any version change neither side of which parses as semver (WX-P3-17).
//
// Supply-chain faucet gate — estate policy, aster-io docs/AUTOMATION_CHARTER.md.
//
// Inspects and reports major, sensitive and watchlisted changes. Eligibility now
// depends on automated tests and blocking reviews, never a manual approval label.
// Package and lockfile parsing remain fail-closed in CI.
//
// Scans the RESOLVED DEPENDENCY TREE (the lockfile — direct AND transitive),
// not just package.json, because the founding example (`cookie 1→2`) is a
// TRANSITIVE dep: it moves the lockfile with package.json untouched. The
// package.json diff is kept as a belt. No install — the lockfile is parsed as
// data. Handles npm (package-lock.json v3) and pnpm (pnpm-lock.yaml v9),
// auto-detected by content.
//
// Env: BASE_PKG, HEAD_PKG (package.json paths), BASE_LOCK, HEAD_LOCK (lockfile paths).
//      In CI (GITHUB_ACTIONS === 'true'), BASE_PKG/HEAD_PKG must resolve: an unset, unreadable,
//      or malformed package.json FAILS CLOSED (AP #65) rather than silently reading as "no
//      dependencies" — an explicit '{}' file (what CI writes when a side has no package.json
//      yet, aster-sports ci.yml:464 / aster-io ci.yml:120) is a STATED fact and stays legitimate.
//      A lockfile may be legitimately ABSENT only when that (now-known) side's package.json
//      declares no dependencies (first commit). Otherwise an unset, unreadable, empty, or
//      unparseable lockfile also FAILS CLOSED instead of silently reading as an empty tree — a
//      wrong-named lockfile (e.g. package-lock.json in a pnpm repo) must not shrink the gate to
//      the package.json belt alone. Outside CI the script keeps today's lenient behaviour and
//      warns that the result is not a CI verdict.

import { appendFileSync, readFileSync } from 'node:fs';

// Money / child / auth-adjacent surface. Matched against dependency NAMES.
// Append-only + commented; adding a new sensitive lib is itself a
// CODEOWNERS-reviewed change (P1-B).
const SENSITIVE = [
  /^stripe$/, /^@stripe\//,                        // money — Stripe SDK
  /^@supabase\//, /supabase-js/,                   // data/RLS (child) + auth
  /(^|[-_/])cookie($|[-_/])/,                       // session cookies (cookie 1→2)
  /session/i,                                       // *-session stores
  // auth / oauth libs. WX-P2-17: broadened so @auth/core, auth0, @clerk, lucia,
  // and express-openid-connect can't slip past a minor/patch bump or a net-new add.
  /(^|[-_/])auth\d*($|[-_/])/i, /^@auth\//i, /oauth/i, /openid/i,
  /@clerk\//i, /(^|[-_/])lucia($|[-_/])/i,
  /^jose$/, /jsonwebtoken/, /(^|[-_/])jwt($|[-_/])/i, // token signing/verify
  /passport/i, /bcrypt/i, /argon2/i,               // credential / password hashing
];
const isSensitive = (name) => SENSITIVE.some((re) => re.test(name));

// Cross-repo pinned deps (`@aster/tokens`, `@aster/weather`). DELIBERATE POLICY (operator-ratified
// 2026-07-20): ANY change — at ANY semver level, incl. a patch — is reported for substantive review.
// The kit narrowed its list to weather on 2026-09-12 because the five consuming repos own their own
// token copies; aster-studio's port keeps `@aster/tokens` because it pins it; this repo pins neither, so the list
// is inert here and kept identical (reporting only — it no longer fails the check). Semver level is the publisher's claim about
// intent, not a bound on blast radius, and the publisher is us. This is NOT a workaround for a
// parser gap (parsePnpm now reads the real semver) — it is an intentional force-report that sits
// on top of `isMajorBump` for these lanes.
const WATCHLIST = [/^@aster\/tokens$/, /^@aster\/weather$/];
const isWatched = (name) => WATCHLIST.some((re) => re.test(name));

// Defensive backstop (AP #65 fail-closed): a github/tarball/git pin whose resolved version STILL
// can't be semver-parsed — rare now that parsePnpm() reads pnpm's nested `version:` field, but if a
// lockfile ever yields an unparseable version for a changed github pin, report it for substantive review. Not the primary mechanism (that's isMajorBump on the now-real semver + the watchlist above).
// Deliberately STRICT: fires if ANY representation of the pin (the lockfile's resolved semver, OR
// package.json's declared range) is unparseable and github/tarball-shaped. A github-pinned dep's
// package.json spec (`github:org/repo#<sha>`) is unparseable BY CONSTRUCTION, so this also fires on
// an ORDINARY add or SHA-only change of any github-pinned dep, not just the genuine "lockfile lost
// its nested version:" blind spot — that is intentional fail-closed coverage for FUTURE github-pinned
// deps (AP #65), not a bug. The one carve-out is a pure REMOVAL (see below): dropping a dependency
// cannot bring in unreviewed code, so this must not fail-closed on the way out.
const isUnparseableGithubPin = (set) =>
  !!set && [...set].some((v) => partsOf(v) === null && /github:|codeload\.github|git\+|\/tar\.gz\//.test(String(v)));

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
// Status (AP #65 fail-closed in CI): 'unset' — the env VARIABLE itself is unset; 'unreadable' —
// set, but the file could not be read; 'malformed' — read, but not valid JSON; 'ok' — valid JSON.
// An explicit '{}' file — the shape CI writes for "the base branch has no package.json yet"
// (aster-sports ci.yml:464, aster-io ci.yml:120) — is 'ok' with an empty map: a STATED fact,
// unlike an unset variable or a missing file, which are UNKNOWN and must not read the same way.
const loadPkg = (path) => {
  if (!path) return { status: 'unset', map: new Map() };
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    return { status: 'unreadable', code: error.code, map: new Map() };
  }
  let j;
  try {
    j = JSON.parse(raw);
  } catch {
    return { status: 'malformed', map: new Map() };
  }
  const map = new Map();
  for (const block of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [n, v] of Object.entries(j[block] || {})) addVer(map, n, v);
  }
  return { status: 'ok', map };
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

// pnpm-lock.yaml v9: the top-level `packages:` block lists every resolved package as a
// `name@version:` key. For a github/tarball-pinned dep the key's version segment is a tarball URL
// (`…/tar.gz/<sha>`) — NOT a semver — BUT pnpm ALSO writes the real semver as a nested `version:`
// field inside each block (verified: `@aster/tokens` → `version: 0.3.1` sits right under the key).
// We prefer that nested semver so isMajorBump() works generically for github pins (this is the root
// fix for the pnpm blind spot); the key's URL is only the fallback when no nested version exists.
const parsePnpm = (raw) => {
  const map = new Map();
  let inPackages = false;
  let name = null, ver = null;                 // the package block currently being read
  const flush = () => { if (name) addVer(map, name, ver); name = null; ver = null; };
  for (const line of raw.split('\n')) {
    if (/^[A-Za-z']/.test(line)) {             // a top-level key (col 0) — ends any open block
      flush();
      inPackages = /^packages:\s*$/.test(line);
      continue;
    }
    if (!inPackages) continue;
    if (/^ {2}\S/.test(line) && /:\s*$/.test(line)) {   // a package key at exactly 2-space indent
      flush();
      const nv = splitNV(line.trim().replace(/:\s*$/, ''));
      name = nv ? nv.name : null;
      ver = nv ? nv.ver : null;                // fallback = the key's version segment (may be a URL)
      continue;
    }
    // the nested `version:` field pnpm writes for every package — the real semver, even for a
    // github/tarball pin — preferred over the key's URL so the bump size is knowable.
    const m = name && line.match(/^ {4}version:\s*(\S+)/);
    if (m) ver = m[1];
  }
  flush();
  return map;
};

// Lockfile status (I-2, AP #65 fail-closed in CI): 'unset' — the env VARIABLE itself is unset
// (distinct from a var pointing at a real, readable, empty file, which stays 'empty' and is the
// legitimate first-commit shape); 'unreadable' — set, but the file could not be read (wrong name,
// wrong repo, ENOENT, EACCES, ...); 'empty' — read, but blank; 'unparseable' — non-blank content
// that yields zero packages under either the npm or the pnpm reader (a wrong-format file sitting
// at the wrong path); 'ok' — parsed at least one package.
const loadLock = (path) => {
  if (!path) return { status: 'unset', map: new Map() };
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    return { status: 'unreadable', code: error.code, map: new Map() };
  }
  if (!raw.trim()) return { status: 'empty', map: new Map() };
  const map = raw.trimStart().startsWith('{') ? parseNpm(raw) : parsePnpm(raw);
  return map.size ? { status: 'ok', map } : { status: 'unparseable', map };
};

// --- comparison -----------------------------------------------------------
// Merge lockfile (primary, resolved tree) + package.json (belt) into one map.
const buildMap = (pkgMap, lockMap) => {
  const map = new Map(lockMap);
  for (const [n, vers] of pkgMap) for (const v of vers) addVer(map, n, v);
  return map;
};

const fail = (message) => {
  console.log(`::error::${message}`);
  process.exit(1);
};

const basePkg = loadPkg(process.env.BASE_PKG);
const headPkg = loadPkg(process.env.HEAD_PKG);
const baseLock = loadLock(process.env.BASE_LOCK);
const headLock = loadLock(process.env.HEAD_LOCK);

const inCI = process.env.GITHUB_ACTIONS === 'true';
if (!inCI) {
  console.log('dependency-gate: warning — GITHUB_ACTIONS is not "true" (running outside CI); this result is not a CI verdict.');
} else {
  // We must first KNOW each side's package.json (an unset/unreadable/malformed one is a hole of
  // its own — the same class as an unset lockfile — because "no dependencies" and "unknown" must
  // not read the same way). Checked before the lockfile requirement below, which depends on it.
  const pkgProblem = (varName, pkg, path) => {
    if (pkg.status === 'ok') return null;
    const fix = `Fix this repo's .github/ci.yml wiring: set ${varName} to this side's ` +
      "package.json (an explicit '{}' file is the legitimate first-commit signal when that side has none).";
    if (pkg.status === 'unset') return `dependency-gate: ${varName} is unset. Refusing to treat an unknown package.json as having no dependencies (AP #65). ${fix}`;
    if (pkg.status === 'unreadable') return `dependency-gate: ${varName}=${path} could not be read (${pkg.code}). ${fix}`;
    return `dependency-gate: ${varName}=${path} could not be parsed as JSON. ${fix}`;
  };
  const headPkgProblem = pkgProblem('HEAD_PKG', headPkg, process.env.HEAD_PKG);
  if (headPkgProblem) fail(headPkgProblem);
  const basePkgProblem = pkgProblem('BASE_PKG', basePkg, process.env.BASE_PKG);
  if (basePkgProblem) fail(basePkgProblem);

  // Only a side whose package.json actually declares dependencies requires a parseable lockfile —
  // that keeps the first-commit case (no package.json / no deps yet) working exactly as today.
  const lockProblem = (varName, sidePkg, lock, path) => {
    if (sidePkg.map.size === 0 || lock.status === 'ok') return null;
    const side = varName === 'HEAD_LOCK' ? 'head' : 'base';
    const fix = `Fix this repo's .github/ci.yml wiring: set ${varName} to this repo's real ` +
      'lockfile (e.g. pnpm-lock.yaml for a pnpm repo, package-lock.json for npm).';
    if (lock.status === 'unset') return `dependency-gate: ${varName} is unset, but the ${side} package.json declares dependencies. Refusing to treat an unknown lockfile as having none (AP #65). ${fix}`;
    if (lock.status === 'unreadable') return `dependency-gate: ${varName}=${path} could not be read (${lock.code}), but the ${side} package.json declares dependencies. ${fix}`;
    if (lock.status === 'empty') return `dependency-gate: ${varName}=${path} is empty, but the ${side} package.json declares dependencies — this is not the first-commit case. ${fix}`;
    return `dependency-gate: ${varName}=${path} could not be parsed as an npm or pnpm lockfile, but the ${side} package.json declares dependencies. ${fix}`;
  };
  const headProblem = lockProblem('HEAD_LOCK', headPkg, headLock, process.env.HEAD_LOCK);
  if (headProblem) fail(headProblem);
  const baseProblem = lockProblem('BASE_LOCK', basePkg, baseLock, process.env.BASE_LOCK);
  if (baseProblem) fail(baseProblem);
}

const base = buildMap(basePkg.map, baseLock.map);
const head = buildMap(headPkg.map, headLock.map);

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
  // BELT — a watchlisted cross-repo pinned dep (@aster/tokens, @aster/weather): ANY change is reported.
  if (isWatched(name) && changed) reasons.push('watchlisted cross-repo pinned dep changed');
  // SUSPENDERS — fail-closed on an unparseable github/tarball pin that changed (the pnpm blind spot,
  // and — by construction — every github-pinned dep's package.json range). Only if nothing above
  // already caught it: this is the catch-all so no github-pinned add/bump/SHA-change defaults open.
  // EXEMPT a pure removal — the package is absent on the head side entirely: removing a dependency
  // cannot bring in unreviewed code, so an unparseable pin going OUT doesn't need the human gate.
  // This exemption is SUSPENDERS-only: BELT (watchlist) and SENSITIVE above are untouched by it, so
  // removing @aster/tokens or @aster/weather, or any money/child/auth-adjacent package, is still reported.
  const isPureRemoval = !h || h.size === 0;
  if (changed && !reasons.length && !isPureRemoval && (isUnparseableGithubPin(b) || isUnparseableGithubPin(h))) {
    reasons.push('github/tarball pin changed — resolved version unparseable to semver, opaque pin requires substantive review (AP #65)');
  }
  // WX-P3-17 (local, kept from this repo's earlier gate): a version change where either side is an
  // unparseable specifier that SUSPENDERS does not already name (dist-tag, workspace:/file:, a bare
  // git ref) cannot be proven a safe bump — report it for substantive review. Last, so the more
  // specific reasons above win; never on an add or a removal (only when both sides are present).
  if (changed && !reasons.length && b && b.size && h && h.size) {
    const bMax = maxVer(b), hMax = maxVer(h);
    if (!partsOf(bMax) || !partsOf(hMax)) reasons.push(`unparseable version change ${bMax} → ${hMax}`);
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
console.log('Dependency changes requiring substantive review (resolved tree — direct + transitive):');
// EVERY FIELD ENCODED, because every one of them comes out of the PR's own files. `name` is
// an OBJECT KEY from head package.json (loadPkg) or a node_modules path from the lockfile
// (parseNpm) — and a JSON key carries a literal newline through a \n escape, which
// Object.entries hands straight on. `from`/`to` are version strings from the same files, put
// through maxVer, which filters nothing: cmp returns 0 for anything unparseable, so the
// reduce keeps the string as written. `reasons` embeds those same strings in `major bump
// ${bMax} → ${hMax}`, so encoding the outer two and not the list would leave the hole open.
//
// Unencoded, a newline inside any of them ends this log line early and puts what follows at
// COLUMN 0, where the Actions runner executes `::error::` or `::stop-commands::` as a
// workflow command. A plain major bump is enough to reach this line — no need to match
// SENSITIVE — so the whole primitive is one crafted dependency name away.
//
// The encoded listing remains part of dependency inspection even though manual labels
// no longer control its exit. Log-injection regressions exercise all four fields.
const lines = flagged.map((f) =>
  `  • ${JSON.stringify(f.name)}  ${JSON.stringify(f.from)} → ${JSON.stringify(f.to)}   [${f.reasons.map((r) => JSON.stringify(r)).join('; ')}]`);
for (const line of lines) console.log(line);

// Step summary (local addition): the same encoded lines, inside a code fence longer than any
// backtick run they contain, so a crafted name cannot close the fence and render as markdown.
// The summary is never parsed for workflow commands; a write failure must not change the verdict.
if (process.env.GITHUB_STEP_SUMMARY) {
  const longest = Math.max(2, ...lines.map((l) => Math.max(0, ...(l.match(/`+/g) || []).map((m) => m.length))));
  const fence = '`'.repeat(longest + 1);
  const md = [
    '### dependency-gate — changes requiring substantive review',
    '',
    `${flagged.length} major, money/child/auth-adjacent, watchlisted or opaque-pin change(s) in the resolved tree (direct + transitive). Reported, not blocking: required tests and blocking reviews remain authoritative (2026-10-04 directive).`,
    '',
    fence,
    ...lines,
    fence,
    '',
  ].join('\n');
  try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, md); } catch (error) {
    console.log(`dependency-gate: warning — could not write the step summary (${error.code || error.message}); the job log above is the record.`);
  }
}

console.log('\ndependency-gate: PASS — resolved dependency changes inspected under automated policy; required tests and blocking reviews remain authoritative.');
process.exit(0);
