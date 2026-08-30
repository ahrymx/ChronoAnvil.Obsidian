# ChronoAnvil Development & Release Workflow

Guidelines and rules for developing, testing, packaging, and archiving `obsidian-chronoanvil-plugin`.

---

## 1. Core Architecture Invariants

* **Styles & CSS Bundle**:
  * Never edit `styles.css` or `dist/chronoanvil/styles.css` directly.
  * Styles are authored in `styles/*.css` and compiled via `node tools/build-css.mjs`.
  * The build STRIPS COMMENTS from the shipped stylesheet — write as much prose
    in `styles/` as a rule deserves, none of it reaches a user's vault. A comment
    that must ship says so with `/*!`, the same convention esbuild applies to
    `main.js`. `test/css-build.test.ts` asserts the strip changes nothing else.
  * A comment delimiter inside a CSS string (`content: "/*"`, a data URI holding
    `*/`) would cut the stylesheet in the wrong place — the stripper does not
    tokenise strings. `test/css-build.test.ts` fails if one appears.
  * Every `--ca-*` custom property read must be defined in `styles/00-tokens.css` (or `SET_FROM_TS`).
  * Tokens defined unconditionally in `00-tokens.css` must NOT carry comma fallbacks on `var()` reads (enforced by `test/tokens.test.ts`).
  * Every class this plugin defines or applies sits under the `ca-` prefix (`is-` and `has-` state suffixes excepted). Enforced by `test/css-namespace.test.ts`, which sweeps both stylesheet selectors and TS string literals. Obsidian host classes and `almanac-wide` are the only allowed unprefixed classes.

* **Scaffolding & Assets**:
  * Shipped assets live in `assets/` (e.g. `assets/diary.base`).
  * Never edit `generated/bundled-assets.ts` directly. It is compiled from
    `assets/` by `node tools/build-assets.mjs` and is gitignored, exactly like
    `styles.css`.
  * `assets/` is compiled INTO `main.js`, and `scaffold.ts` reads the notes from
    the bundle rather than from the plugin folder. This is not an optimisation:
    Obsidian's community installer writes `manifest.json`, `main.js` and
    `styles.css` and creates no subdirectories, so an asset read from disk at
    runtime does not exist for anyone who installed from the store.
  * If new files are added, register them in `src/core/scaffold.ts` and
    `tools/package.mjs`, and give them an extension listed in `TEXT` in
    `tools/build-assets.mjs` — an unlisted extension is skipped silently.
    `test/bundled-assets.test.ts` fails if any of that is missed.

* **Third-Party Code & YAML**:
  * The plugin bundles NO YAML parser. Read and write YAML with Obsidian's
    `parseYaml` / `stringifyYaml`. `js-yaml` is a devDependency — it backs the
    stub's YAML and is an oracle in `test/seed-vault.test.ts`; importing it from
    `src/` fails `test/obsidian-yaml.test.ts`.
  * `stringifyYaml` takes no options, so line folding is Obsidian's choice.
    Nothing may depend on it — `test/obsidian-yaml.test.ts` runs `Diary.base`
    through both line widths.
  * Adding or removing a runtime dependency means editing `NOTICE` **and** the
    banner in `esbuild.config.mjs` in the same commit. Both ship, and the banner
    is the only notice a community-store install carries. Checked against the
    lockfile's production closure by `test/obsidian-yaml.test.ts`.

* **Product Name**:
  * The name is `manifest.json`'s — every other file agrees with it, and
    `test/product-name.test.ts` derives its expectations from there rather than
    hard-coding a spelling.
  * A rename must reach `LICENSE` and `NOTICE`. They were missed by the last
    one and sat stating an attribution string the README contradicted, which is
    a licence term rather than a typo.
  * `Almanac` stays where it is HISTORY — releases through 4.84 went out under
    it, so the section 7 naming clause covers it and `tools/migrate-vault.mjs`
    still reads its tokens. It must never be the current name.
  * `tools/migrate-vault.mjs` carries `PRERELEASE_RULES` for a name that was
    never released. Delete that array, its `FILE_RENAMES` entries and the
    `chronoforge` plugin-folder id once the development vaults are migrated.

* **Obsidian Review Checklist** (`test/review-checklist.test.ts` holds all of it):
  * No command declares a `hotkeys` default. Claiming a binding in every vault
    that installs this is the reader's choice to make, not ours — the README's
    **Keyboard** section points at Settings → Hotkeys instead.
  * The settings tab draws no heading carrying the plugin name, and no
    `setHeading()`. Obsidian already prints "ChronoAnvil" above the tab body.
    Modals keep their `h3` titles — those name the modal, which nothing else on
    screen does.
  * A `document` or `window` listener must have a matching `removeEventListener`
    or `{ once: true }`, IN THE SAME FILE. Ordinary element listeners are not
    this problem and are not swept — a listener on a node the render child owns
    dies with the node.
  * The globals `app` and `moment` are lint errors (`no-restricted-globals` in
    `eslint.config.mjs`). Use `this.app` / an injected `App`, and Obsidian's
    `moment` import. Grep cannot answer this question — nearly every file here
    binds a local named `app` — so `npx eslint src test` is the check.

---

## 2. Standard Development & Verification Cycle

Always run tests and builds in sequence when making changes:

```bash
# 1. Rebuild styles when editing styles/*.css
node tools/build-css.mjs

# 2. Rebuild the bundled assets when editing assets/*
node tools/build-assets.mjs

# 3. Run TypeScript type check
npm run typecheck        # runs build-assets first; bare `npx tsc --noEmit`
                         # fails on a clean tree because generated/ is ignored

# 4. Run full test suite (must pass 100%)
npm test                 # `pretest` runs both generators

# 5. Lint (scope-aware; catches the global `app`/`moment` a grep cannot)
npx eslint src test
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
# Compiles TS via esbuild, builds CSS, and packages files into dist/chronoanvil/
npm run package
```
* **Packaging Verification**:
  * Validates that `dist/chronoanvil/` contains `main.js`, `manifest.json`, `styles.css`, `LICENSE`, `NOTICE`, and `assets/`.
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
    * `../chronoanvil-builds/chronoanvil-<version>-plugin.zip`
    * `../chronoanvil-source/chronoanvil-source-<version>.zip`
  * Reads back the generated zips to guarantee integrity (rejects hollow or stale archives).
  * Re-run `npm test` after version bump to ensure version assertion tests pass.
