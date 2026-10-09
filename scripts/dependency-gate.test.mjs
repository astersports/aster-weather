/**
 * Regression test for scripts/dependency-gate.mjs — ported from aster-studio (#67), itself ported
 * from the estate kit (astersports/aster-io kit/files/scripts/estate/dependency-gate.test.mjs) with
 * these local differences: `@aster/tokens` stays on the WATCHLIST as in aster-studio's port, the
 * flagged listing is also written to GITHUB_STEP_SUMMARY, and this repo's own WX-P2-17 (broader
 * auth patterns) and WX-P3-17 (unparseable version change) detections are kept and pinned below.
 *
 * Contract (2026-10-04 owner directive): sensitive, major, watchlisted and opaque-pin changes
 * are still DETECTED and REPORTED, and the check PASSES — no manual `dep-review-approved` label
 * releases it, because none is required. Malformed / missing CI inputs still FAIL CLOSED (AP #65).
 * The gate is a run-to-exit script (not importable); driven as a subprocess with fixture env.
 * Run: `node --test scripts/dependency-gate.test.mjs`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GATE = fileURLToPath(new URL('./dependency-gate.mjs', import.meta.url));
const TOK_URL = (sha) => `https://codeload.github.com/astersports/aster-tokens/tar.gz/${sha}`;
const WEATHER_URL = (sha) => `https://codeload.github.com/astersports/aster-weather/tar.gz/${sha}`;
const OTHER_URL = (sha) => `https://codeload.github.com/someorg/somelib/tar.gz/${sha}`;
const ACME_URL = (sha) => `https://codeload.github.com/acme/x/tar.gz/${sha}`;
const A = 'a'.repeat(40), B = 'b'.repeat(40);

// A real pnpm-lock v9 package block: `name@<keyVer>:` key (a tarball URL for github pins) PLUS the
// nested `version:` semver pnpm actually writes. Model both — the nested field is the point.
const pkg = (name, keyVer, semver) =>
  `  '${name}@${keyVer}':\n    resolution: {tarball: ${keyVer}}\n    version: ${semver}\n`;
const pnpmLock = (...blocks) => `lockfileVersion: '9.0'\n\npackages:\n\n${blocks.join('\n')}`;
// npm package-lock.json v3 shape — the format aster-sports (and today's non-pnpm repos) use.
const npmLock = (pkgs) => JSON.stringify({
  lockfileVersion: 3,
  packages: {
    '': {},
    ...Object.fromEntries(Object.entries(pkgs).map(([name, version]) => [`node_modules/${name}`, { version }])),
  },
});
const pkgJson = (dep, spec) => JSON.stringify({ dependencies: { [dep]: spec } });
const emptyPkgJson = () => JSON.stringify({ dependencies: {} });
// The EXACT literal content CI writes for "this side has no package.json yet" (aster-sports
// ci.yml:464 / aster-io ci.yml:120: `echo '{}' > .../base-package.json`) — a stated fact, not an
// absence.
const literalEmptyPkgJson = () => '{}';

// ci: true sets GITHUB_ACTIONS=true (the fail-closed path); false/undefined always deletes it, so
// a test's outcome never depends on whether the SUITE ITSELF happens to be running inside real CI.
// basePkg/headPkg/baseLock/headLock: undefined leaves the var UNSET · null points it at a file
// that does not exist (a wrong lockfile/package.json name resolves the same way) · a string is
// written to a file and the var points at it (may itself be non-lockfile / non-JSON content, to
// model a wrong-TYPE or malformed file that exists).
function runGate({ basePkg, headPkg, baseLock, headLock, labels = '', ci = false, summary = false }) {
  const dir = mkdtempSync(join(tmpdir(), 'depgate-'));
  const w = (n, c) => { const p = join(dir, n); writeFileSync(p, c); return p; };
  const env = { ...process.env, LABELS: labels };
  delete env.BASE_PKG; delete env.HEAD_PKG; delete env.BASE_LOCK; delete env.HEAD_LOCK;
  delete env.GITHUB_ACTIONS; delete env.GITHUB_STEP_SUMMARY;
  if (ci) env.GITHUB_ACTIONS = 'true';
  const summaryPath = join(dir, 'step-summary.md');
  if (summary) { writeFileSync(summaryPath, ''); env.GITHUB_STEP_SUMMARY = summaryPath; }
  if (basePkg !== undefined) env.BASE_PKG = basePkg === null ? join(dir, 'missing-base.pkg.json') : w('base.pkg.json', basePkg);
  if (headPkg !== undefined) env.HEAD_PKG = headPkg === null ? join(dir, 'missing-head.pkg.json') : w('head.pkg.json', headPkg);
  if (baseLock !== undefined) env.BASE_LOCK = baseLock === null ? join(dir, 'missing-base.lock.yaml') : w('base.lock.yaml', baseLock);
  if (headLock !== undefined) env.HEAD_LOCK = headLock === null ? join(dir, 'missing-head.lock.yaml') : w('head.lock.yaml', headLock);
  const r = spawnSync('node', [GATE], { env, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}`, summary: summary ? readFileSync(summaryPath, 'utf8') : '' };
}

test('WATCHLIST policy — a @aster/weather PATCH bump (github pin) is reported at any semver level', () => {
  const r = runGate({
    baseLock: pnpmLock(pkg('@aster/weather', WEATHER_URL(A), '0.3.0')),
    headLock: pnpmLock(pkg('@aster/weather', WEATHER_URL(B), '0.3.1')), // a PATCH per semver
  });
  assert.equal(r.code, 0, 'classified changes pass automated policy without labels');
  assert.match(r.out, /watchlisted cross-repo pinned dep changed/);
});

test('WATCHLIST — legacy dep-review-approved label does not change inspection', () => {
  const r = runGate({
    baseLock: pnpmLock(pkg('@aster/weather', WEATHER_URL(A), '0.3.0')),
    headLock: pnpmLock(pkg('@aster/weather', WEATHER_URL(B), '0.3.1')),
    labels: 'dep-review-approved',
  });
  assert.equal(r.code, 0);
  assert.match(r.out, /automated policy/);
});

test('WATCHLIST — a @aster/weather REMOVAL remains reported (BELT is untouched by the SUSPENDERS removal exemption)', () => {
  const r = runGate({
    baseLock: pnpmLock(pkg('@aster/weather', WEATHER_URL(A), '0.3.0')),
    headLock: pnpmLock(),
  });
  assert.equal(r.code, 0, 'the SUSPENDERS removal exemption does not touch BELT — weather remains reported when removed');
  assert.match(r.out, /watchlisted cross-repo pinned dep changed/);
});

test('WATCHLIST — a @aster/weather REMOVAL is legacy dep-review-approved label does not change inspection', () => {
  const r = runGate({
    baseLock: pnpmLock(pkg('@aster/weather', WEATHER_URL(A), '0.3.0')),
    headLock: pnpmLock(),
    labels: 'dep-review-approved',
  });
  assert.equal(r.code, 0);
  assert.match(r.out, /automated policy/);
});

test('WATCHLIST (local) — a @aster/tokens PATCH bump via the LOCKFILE is still reported here, and passes', () => {
  // The kit dropped @aster/tokens from its watchlist on 2026-09-12; aster-studio's port (which this
  // file mirrors) keeps it, so detection is NOT narrowed. Reported, not blocking.
  const r = runGate({
    baseLock: pnpmLock(pkg('@aster/tokens', TOK_URL(A), '0.3.0')),
    headLock: pnpmLock(pkg('@aster/tokens', TOK_URL(B), '0.3.1')), // a PATCH per semver
  });
  assert.equal(r.code, 0, 'classified changes pass automated policy without labels');
  assert.match(r.out, /"@aster\/tokens"/);
  assert.match(r.out, /watchlisted cross-repo pinned dep changed/);
  assert.doesNotMatch(r.out, /::error::/);
});

test('WATCHLIST (local) — a @aster/tokens REMOVAL is still reported (BELT is untouched by the SUSPENDERS removal exemption)', () => {
  const r = runGate({
    basePkg: pkgJson('@aster/tokens', `github:astersports/aster-tokens#${A}`),
    headPkg: emptyPkgJson(),
    baseLock: pnpmLock(pkg('@aster/tokens', TOK_URL(A), '0.5.0')),
    headLock: pnpmLock(),
  });
  assert.equal(r.code, 0);
  assert.match(r.out, /watchlisted cross-repo pinned dep changed/);
  assert.doesNotMatch(r.out, /opaque pin/, 'a pure removal never trips SUSPENDERS');
});

test('SUSPENDERS still fires — a non-watchlisted github pin SHA change at the SAME version (BASE_PKG/HEAD_PKG set) is reported', () => {
  // Not a removal — the package is still present on the head side, just re-pinned to a new sha at
  // the same declared version. (The kit runs this case on @aster/tokens; here tokens is caught by
  // the WATCHLIST first, so a non-watchlisted pin exercises SUSPENDERS itself.)
  const r = runGate({
    basePkg: pkgJson('@acme/x', `github:acme/x#${A}`),
    headPkg: pkgJson('@acme/x', `github:acme/x#${B}`),
    baseLock: pnpmLock(pkg('@acme/x', ACME_URL(A), '0.3.0')),
    headLock: pnpmLock(pkg('@acme/x', ACME_URL(B), '0.3.0')), // same version — only the sha changed
  });
  assert.equal(r.code, 0, 'a non-removal change remains reported via SUSPENDERS — only a pure removal is exempt');
  assert.match(r.out, /unparseable to semver, opaque pin requires substantive review/);
});

test('SUSPENDERS still fires — a NEWLY ADDED github-pinned dep is reported (fail-closed coverage for FUTURE github deps, AP #65)', () => {
  const r = runGate({
    basePkg: emptyPkgJson(),
    headPkg: pkgJson('@acme/x', `github:acme/x#${A}`),
    baseLock: pnpmLock(),
    headLock: pnpmLock(pkg('@acme/x', ACME_URL(A), '1.2.3')),
  });
  assert.equal(r.code, 0, 'an ADD is not a removal, so the exemption does not apply');
  assert.match(r.out, /unparseable to semver, opaque pin requires substantive review/);
});

test('GENUINE BLIND SPOT — a github pin whose lockfile block has NO nested version: is reported (AP #65)', () => {
  const blockNoVersion = (name, keyVer) => `  '${name}@${keyVer}':\n    resolution: {tarball: ${keyVer}}\n`;
  const r = runGate({
    baseLock: pnpmLock(blockNoVersion('somelib', OTHER_URL(A))),
    headLock: pnpmLock(blockNoVersion('somelib', OTHER_URL(B))),
  });
  assert.equal(r.code, 0, 'with no parseable version anywhere for this pin, the backstop must still fire');
  assert.match(r.out, /unparseable to semver, opaque pin requires substantive review/);
});

test('ROOT FIX — a NON-watchlisted github pin MAJOR bump is reported via isMajorBump on the NESTED semver (not the URL)', () => {
  const r = runGate({
    baseLock: pnpmLock(pkg('somelib', OTHER_URL(A), '1.0.0')),
    headLock: pnpmLock(pkg('somelib', OTHER_URL(B), '2.0.0')),
  });
  assert.equal(r.code, 0);
  // The reason names the REAL semvers — proof parsePnpm read the nested `version:`, not the tarball URL.
  assert.match(r.out, /major bump 1\.0\.0 → 2\.0\.0/, 'must report the real semver bump, not a URL / "unparseable"');
});

test('ROOT FIX / PRECISION — a NON-watchlisted github pin PATCH bump AUTO-GREENS (the old code fail-closed-gated this)', () => {
  const r = runGate({
    baseLock: pnpmLock(pkg('somelib', OTHER_URL(A), '1.2.0')),
    headLock: pnpmLock(pkg('somelib', OTHER_URL(B), '1.2.1')), // PATCH — knowable now, should NOT gate
  });
  assert.equal(r.code, 0, 'precise isMajorBump: a non-watchlisted github patch bump must auto-green');
  assert.match(r.out, /PASS — no major/);
});

test('NO FALSE-POSITIVE — a normal registry dep patch bump does NOT gate', () => {
  const r = runGate({
    baseLock: pnpmLock(pkg('left-pad', '1.3.0', '1.3.0')),
    headLock: pnpmLock(pkg('left-pad', '1.3.1', '1.3.1')),
  });
  assert.equal(r.code, 0);
  assert.match(r.out, /PASS — no major/);
});

test('NO-OP — identical base and head passes', () => {
  const lock = pnpmLock(pkg('@aster/weather', WEATHER_URL(A), '0.3.0'));
  const r = runGate({ baseLock: lock, headLock: lock });
  assert.equal(r.code, 0);
  assert.match(r.out, /PASS — no major/);
});

// --- I-2: an unset, unreadable, empty, or unparseable lockfile must fail closed in CI ---

test('CI: HEAD_LOCK unset, with head deps declared, fails closed and names the variable and ci.yml', () => {
  const r = runGate({
    ci: true,
    basePkg: pkgJson('left-pad', '^1.3.0'),
    headPkg: pkgJson('left-pad', '^1.3.0'),
    baseLock: pnpmLock(pkg('left-pad', '1.3.0', '1.3.0')),
    // headLock intentionally omitted — HEAD_LOCK stays unset
  });
  assert.equal(r.code, 1);
  assert.match(r.out, /HEAD_LOCK is unset/);
  assert.match(r.out, /ci\.yml/);
});

test('CI: HEAD_LOCK pointing at a NONEXISTENT file (a wrong lockfile name in ci.yml), head deps declared, fails closed', () => {
  const r = runGate({
    ci: true,
    basePkg: pkgJson('left-pad', '^1.3.0'),
    headPkg: pkgJson('left-pad', '^1.3.0'),
    baseLock: pnpmLock(pkg('left-pad', '1.3.0', '1.3.0')),
    headLock: null, // env points at a file that does not exist
  });
  assert.equal(r.code, 1);
  assert.match(r.out, /HEAD_LOCK=.*could not be read/);
  assert.match(r.out, /ci\.yml/);
});

test('CI: HEAD_LOCK pointing at a file that EXISTS but is not a parseable npm/pnpm lockfile, head deps declared, fails closed', () => {
  const r = runGate({
    ci: true,
    basePkg: pkgJson('left-pad', '^1.3.0'),
    headPkg: pkgJson('left-pad', '^1.3.0'),
    baseLock: pnpmLock(pkg('left-pad', '1.3.0', '1.3.0')),
    headLock: 'this is not a lockfile of either format\njust some other file\n',
  });
  assert.equal(r.code, 1);
  assert.match(r.out, /HEAD_LOCK=.*could not be parsed as an npm or pnpm lockfile/);
  assert.match(r.out, /ci\.yml/);
});

test('CI: BASE_LOCK unset, with base deps declared, also fails closed (symmetric with HEAD_LOCK)', () => {
  const r = runGate({
    ci: true,
    basePkg: pkgJson('left-pad', '^1.3.0'),
    headPkg: pkgJson('left-pad', '^1.3.0'),
    headLock: pnpmLock(pkg('left-pad', '1.3.0', '1.3.0')),
    // baseLock intentionally omitted — BASE_LOCK stays unset
  });
  assert.equal(r.code, 1);
  assert.match(r.out, /BASE_LOCK is unset/);
  assert.match(r.out, /ci\.yml/);
});

test('CI: HEAD_LOCK EMPTY, with head deps declared, fails closed (not the first-commit case)', () => {
  const r = runGate({
    ci: true,
    basePkg: pkgJson('left-pad', '^1.3.0'),
    headPkg: pkgJson('left-pad', '^1.3.0'),
    baseLock: pnpmLock(pkg('left-pad', '1.3.0', '1.3.0')),
    headLock: '',
  });
  assert.equal(r.code, 1);
  assert.match(r.out, /HEAD_LOCK=.*is empty/);
  assert.match(r.out, /not the first-commit case/);
});

// --- fix round 1 on #278: BASE_PKG/HEAD_PKG must also fail closed in CI ---
// The swallow-all read() turned an unset or unreadable package.json into '', read as "no
// dependencies" — the same hole this PR closes for lockfiles. An explicit '{}' file (what CI
// writes when a side has no package.json yet — aster-sports ci.yml:464, aster-io ci.yml:120)
// is a STATED fact and stays legitimate; an unset variable or a missing file is not.

test('CI: HEAD_PKG unset fails closed, naming the variable and ci.yml', () => {
  const r = runGate({
    ci: true,
    basePkg: literalEmptyPkgJson(),
    baseLock: pnpmLock(),
    // headPkg intentionally omitted — HEAD_PKG stays unset
  });
  assert.equal(r.code, 1);
  assert.match(r.out, /HEAD_PKG is unset/);
  assert.match(r.out, /ci\.yml/);
});

test('CI: BASE_PKG unset fails closed, naming the variable and ci.yml', () => {
  const r = runGate({
    ci: true,
    headPkg: literalEmptyPkgJson(),
    headLock: pnpmLock(),
    // basePkg intentionally omitted — BASE_PKG stays unset
  });
  assert.equal(r.code, 1);
  assert.match(r.out, /BASE_PKG is unset/);
  assert.match(r.out, /ci\.yml/);
});

test('CI: HEAD_PKG pointing at a MISSING file fails closed', () => {
  const r = runGate({
    ci: true,
    basePkg: literalEmptyPkgJson(),
    baseLock: pnpmLock(),
    headPkg: null, // env points at a file that does not exist
  });
  assert.equal(r.code, 1);
  assert.match(r.out, /HEAD_PKG=.*could not be read/);
  assert.match(r.out, /ci\.yml/);
});

test("CI: BASE_PKG = a literal '{}' file (the shape ci.yml writes for the first-commit case) still passes as today", () => {
  const r = runGate({
    ci: true,
    basePkg: literalEmptyPkgJson(),
    // baseLock intentionally omitted — base has no dependencies, so no lockfile is required
    headPkg: pkgJson('left-pad', '^1.3.0'),
    headLock: pnpmLock(pkg('left-pad', '1.3.0', '1.3.0')),
  });
  assert.equal(r.code, 0);
  assert.match(r.out, /PASS — no major/);
});

test('CI: the review\'s founding case — a transitive cookie 1.1.1 → 9.0.0 bump (npm lockfile), correctly wired, remains reported as today', () => {
  // Direct deps present on BOTH sides (so the new fail-closed check actually engages and passes
  // through, status 'ok' either side) — cookie itself is TRANSITIVE, present only in the lockfile.
  const r = runGate({
    ci: true,
    basePkg: pkgJson('left-pad', '^1.3.0'),
    headPkg: pkgJson('left-pad', '^1.3.0'),
    baseLock: npmLock({ 'left-pad': '1.3.0', cookie: '1.1.1' }),
    headLock: npmLock({ 'left-pad': '1.3.0', cookie: '9.0.0' }),
  });
  assert.equal(r.code, 0);
  assert.match(r.out, /cookie/);
  assert.match(r.out, /money\/child\/auth-adjacent/);
});

test('CI: the first-commit case (base has no package.json, written as a literal {} by ci.yml, so BASE_LOCK may stay unset) still works', () => {
  const r = runGate({
    ci: true,
    basePkg: literalEmptyPkgJson(), // the exact shape ci.yml writes: echo '{}' > base-package.json
    // baseLock intentionally omitted — base declares no dependencies, nothing to require a lockfile for
    headPkg: pkgJson('left-pad', '^1.3.0'),
    headLock: pnpmLock(pkg('left-pad', '1.3.0', '1.3.0')),
  });
  assert.equal(r.code, 0);
  assert.match(r.out, /PASS — no major/);
});

test('outside CI (GITHUB_ACTIONS unset), the same missing/unreadable/wrong-type HEAD_LOCK cases keep old behaviour and warn', () => {
  const unset = runGate({ ci: false, headPkg: pkgJson('left-pad', '^1.3.0'), baseLock: pnpmLock(pkg('left-pad', '1.3.0', '1.3.0')) });
  assert.equal(unset.code, 0, 'HEAD_LOCK unset outside CI silently reads as no lockfile, as today');
  assert.match(unset.out, /warning.*running outside CI/i);

  const missing = runGate({ ci: false, headPkg: pkgJson('left-pad', '^1.3.0'), baseLock: pnpmLock(pkg('left-pad', '1.3.0', '1.3.0')), headLock: null });
  assert.equal(missing.code, 0, 'a nonexistent HEAD_LOCK outside CI silently reads as no lockfile, as today');
  assert.match(missing.out, /warning.*running outside CI/i);

  const wrongType = runGate({ ci: false, headPkg: pkgJson('left-pad', '^1.3.0'), baseLock: pnpmLock(pkg('left-pad', '1.3.0', '1.3.0')), headLock: 'not a lockfile\n' });
  assert.equal(wrongType.code, 0, 'an unparseable HEAD_LOCK outside CI silently reads as no lockfile, as today');
  assert.match(wrongType.out, /warning.*running outside CI/i);
});

test('unlabeled sensitive transitive major bump is inspected and passes automated policy', () => {
  const r = runGate({ ci: true, basePkg: pkgJson('left-pad', '^1.3.0'), headPkg: pkgJson('left-pad', '^1.3.0'),
    baseLock: npmLock({ 'left-pad': '1.3.0', cookie: '1.1.1' }), headLock: npmLock({ 'left-pad': '1.3.0', cookie: '9.0.0' }) });
  assert.equal(r.code, 0);
  assert.match(r.out, /cookie/);
  assert.match(r.out, /major bump 1.1.1/);
  assert.match(r.out, /money\/child\/auth-adjacent/);
  assert.match(r.out, /automated policy/);
  assert.doesNotMatch(r.out, /released by.*label|applies.*label/);
});

// --- local additions -----------------------------------------------------------------------

test('every flagged category passes with NO label — the 2026-10-04 directive (sensitive add, major, watchlist, opaque pin together)', () => {
  const r = runGate({
    ci: true,
    basePkg: JSON.stringify({ dependencies: { express: '^4.0.0', '@aster/tokens': `github:astersports/aster-tokens#${A}` } }),
    headPkg: JSON.stringify({ dependencies: { express: '^5.0.0', stripe: '^18.0.0', '@aster/tokens': `github:astersports/aster-tokens#${B}`, '@acme/x': `github:acme/x#${A}` } }),
    baseLock: pnpmLock(pkg('express', '4.21.2', '4.21.2'), pkg('@aster/tokens', TOK_URL(A), '0.5.0')),
    headLock: pnpmLock(pkg('express', '5.1.0', '5.1.0'), pkg('stripe', '18.0.0', '18.0.0'),
      pkg('@aster/tokens', TOK_URL(B), '0.5.0'), pkg('@acme/x', ACME_URL(A), '1.0.0')),
  });
  assert.equal(r.code, 0, 'no manual label is required for any category');
  assert.match(r.out, /"express".*major bump/);
  assert.match(r.out, /"stripe".*money\/child\/auth-adjacent/);
  assert.match(r.out, /"@aster\/tokens".*watchlisted cross-repo pinned dep changed/);
  assert.match(r.out, /"@acme\/x".*opaque pin requires substantive review/);
  assert.match(r.out, /automated policy/);
  assert.doesNotMatch(r.out, /::error::|dep-review-approved|applies.*label/);
});

test('WX-P2-17 (local) — the broader auth patterns are still detected and reported (no label, passes)', () => {
  for (const name of ['@auth/core', 'auth0', '@clerk/clerk-js', 'lucia', 'express-openid-connect']) {
    const r = runGate({ baseLock: pnpmLock(), headLock: pnpmLock(pkg(name, '1.0.0', '1.0.0')) });
    assert.equal(r.code, 0, `${name}: classified changes pass automated policy without labels`);
    assert.match(r.out, new RegExp(`${JSON.stringify(name).replace(/[/]/g, '\\/')}.*money\\/child\\/auth-adjacent`), `${name}: ${r.out}`);
  }
});

test('WX-P3-17 (local) — a version change to an unparseable specifier (dist-tag / workspace:) is reported, and passes', () => {
  const r = runGate({ basePkg: pkgJson('left-pad', 'latest'), headPkg: pkgJson('left-pad', 'workspace:*') });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /unparseable version change latest → workspace:\*/);
  assert.match(r.out, /automated policy/);
});

test('step summary — a flagged change is written to GITHUB_STEP_SUMMARY with the same encoded lines', () => {
  const r = runGate({
    baseLock: npmLock({ cookie: '1.1.1' }),
    headLock: npmLock({ cookie: '9.0.0' }),
    summary: true,
  });
  assert.equal(r.code, 0);
  assert.match(r.summary, /### dependency-gate/);
  assert.match(r.summary, /"cookie"\s+"1\.1\.1" → "9\.0\.0"/);
  assert.match(r.summary, /money\/child\/auth-adjacent/);
  assert.match(r.summary, /Reported, not blocking/);
});

test('step summary — a backtick run in a crafted name cannot close the code fence', () => {
  const evil = 'x```y';
  const r = runGate({
    basePkg: JSON.stringify({ dependencies: { [evil]: '1.0.0' } }),
    headPkg: JSON.stringify({ dependencies: { [evil]: '2.0.0' } }),
    summary: true,
  });
  assert.equal(r.code, 0);
  const fences = r.summary.split('\n').filter((l) => /^`{3,}$/.test(l));
  assert.equal(fences.length, 2, 'exactly one opening and one closing fence');
  assert.ok(fences[0].length > 3, 'the fence is longer than the longest backtick run in the content');
});

test('log injection — a newline in a dependency NAME or VERSION cannot reach column 0', () => {
  const EVIL_NAME = 'innocuous\n::error::forged-name';
  const lock = (v) => JSON.stringify({ lockfileVersion: 3, packages: {
    '': {}, [`node_modules/${EVIL_NAME}`]: { version: v }, 'node_modules/plain': { version: v },
  } });
  const r = runGate({
    ci: true,
    basePkg: JSON.stringify({ dependencies: { [EVIL_NAME]: '1.0.0', plain: '1.0.0' } }),
    headPkg: JSON.stringify({ dependencies: { [EVIL_NAME]: '2.0.0', plain: '2.0.0\n::error::forged-version' } }),
    baseLock: lock('1.0.0'),
    headLock: lock('2.0.0'),
  });
  assert.match(r.out, /requiring substantive review/, 'the gate must have reached its flagged listing');
  const forged = r.out.split('\n').filter((l) => l.startsWith('::'));
  assert.deepEqual(forged, [], `a workflow command reached column 0:\n${r.out}`);
});

test("this repo's REAL package.json + pnpm-lock.yaml parse cleanly under the CI fail-closed path", () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const realPkg = readFileSync(join(root, 'package.json'), 'utf8');
  const realLock = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8');
  const r = runGate({ ci: true, basePkg: realPkg, headPkg: realPkg, baseLock: realLock, headLock: realLock });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /PASS — no major/);
});
