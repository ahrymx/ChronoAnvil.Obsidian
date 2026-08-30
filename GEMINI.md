# Almanac Development & Release Workflow

Guidelines and rules for developing, testing, packaging, and archiving `obsidian-almanac-plugin`.

---

## 1. Core Architecture Invariants

* **Styles & CSS Bundle**:
  * Never edit `styles.css` or `dist/ahrymx.almanac/styles.css` directly.
  * Styles are authored in `styles/*.css` and compiled via `node tools/build-css.mjs`.
  * Every `--am-*` custom property read must be defined in `styles/00-tokens.css` (or `SET_FROM_TS`).
  * Tokens defined unconditionally in `00-tokens.css` must NOT carry comma fallbacks on `var()` reads (enforced by `test/tokens.test.ts`).

* **Scaffolding & Assets**:
  * Shipped assets live in `assets/` (e.g. `assets/art/`, `assets/diary.base`).
  * If new files are added, register them in `src/core/scaffold.ts` and `tools/package.mjs`.

---

## 2. Standard Development & Verification Cycle

Always run tests and builds in sequence when making changes:

```bash
# 1. Rebuild styles when editing styles/*.css
node tools/build-css.mjs

# 2. Run TypeScript type check
npx tsc --noEmit

# 3. Run full test suite (must pass 100%)
npm test
```

---

## 3. Testing → Dist → Package → Archive Workflow

When preparing a build or cutting a new version:

### Phase 1: Test & Invariant Verification
```bash
# Run all unit and integration tests
npm test

# Check version alignment across package.json, manifest.json, and versions.json
npm run check:versions
```

### Phase 2: Build & Package (`dist/`)
```bash
# Compiles TS via esbuild, builds CSS, and packages files into dist/ahrymx.almanac/
npm run package
```
* **Packaging Verification**:
  * Validates that `dist/ahrymx.almanac/` contains `main.js`, `manifest.json`, `styles.css`, `LICENSE`, `NOTICE`, and `assets/`.
  * Never manually edit files inside `dist/`.

### Phase 3: Version Bump & Release Archiving
!Only proceed if the reader/prompter has said the testing dist is in a good enough spot to be worthy of archiving.
When releasing a new version:
1. Update `version` in `package.json` and `manifest.json`.
2. Add the release notes section at the top of `CHANGELOG.md`.
3. Run:
```bash
npm run package && npm run archive
```
* **Archive Verification**:
  * Automatically creates:
    * `../almanac-builds/ahrymx.almanac-<version>-plugin.zip`
    * `../almanac-source/almanac-source-<version>.zip`
  * Reads back the generated zips to guarantee integrity (rejects hollow or stale archives).
  * Re-run `npm test` after version bump to ensure version assertion tests pass.
