// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { readCss, readSrc, repoFile, ROOT, styleSheets } from "./sources";
import { ART_PRESETS, DEFAULT_PATHS, normalizeBannerArt } from "../src/core/constants";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import { BANNER_KINDS, SUPPRESSED_KINDS } from "../src/ui/widgets/index";
import {
  BannerScope,
  bannerSurfaceOf,
  hasBanner,
  titleTargetFor,
} from "../src/core/banner-scope";
import { bannerSuppressed } from "../src/ui/vault-banner";
import {
  BRAND_ICON_ID,
  BRAND_ICON_PATHS,
  BRAND_ICON_STROKE,
  BRAND_ICON_SVG,
} from "../src/ui/brand-icon";
import type ChronoAnvilPlugin from "../src/main";

// ── the vault banner (4.51) ───────────────────────────────────────────────
//
// The banner itself is a view-level hook and cannot be reached without a vault,
// so what is checkable here is the QUESTION it asks first — is this note one of
// ours, and which kind — plus the wiring that only ever fails one way: silently.

const scope = (over: Partial<BannerScope> = {}): BannerScope => ({
  flatNotes: ["00 - Infrastructure/Homepage.md", "00 - Infrastructure/Search.md"],
  diaryFolders: ["02 - Diary", "02 - Diary/Daily", "02 - Diary/Weekly"],
  journalRoots: [
    "03 - Journals",
    "03 - Journals/Study",
    "03 - Journals/Cooking",
  ],
  ...over,
});

describe("bannerSurfaceOf", () => {
  it("gives a note outside everything no banner at all", () => {
    // CHRONOANVIL NOTES ONLY, which was the decision (4.51, Q10 sibling): chrome on
    // a note the plugin has nothing to say about is a plugin behaving like a
    // vault skin.
    expect(bannerSurfaceOf("Inbox/Some thought.md", scope())).toBeNull();
    expect(hasBanner("Inbox/Some thought.md", scope())).toBe(false);
  });

  it("recognises the diary, the journals and the homepage", () => {
    expect(bannerSurfaceOf("02 - Diary/Daily/2026-08-20.md", scope())).toBe(
      "diary"
    );
    expect(
      bannerSurfaceOf("03 - Journals/Study/Maths/Maths.md", scope())
    ).toBe("journal");
    expect(bannerSurfaceOf("00 - Infrastructure/Homepage.md", scope())).toBe(
      "home"
    );
  });

  it("covers the Search note as well as the homepage", () => {
    // TWO FLAT DASHBOARDS, NOT ONE (4.51.3). The field was called `home` and
    // Search — a page ChronoAnvil composes, with ChronoAnvil's own banner on it — was
    // outside the bar entirely.
    expect(bannerSurfaceOf("00 - Infrastructure/Search.md", scope())).toBe("home");
  });

  it("covers the diary's and the journals' own folder notes", () => {
    // THE STATE A NEW VAULT STARTS IN (4.51.3). Both roots were missing from
    // the scope, and the journals one is the worse of the two: with no journal
    // registered, `journalRoots` was EMPTY, so the whole journals half of the
    // vault — `03 - Journals/03 - Journals.md` included, which every vault has
    // — had no bar and kept its old banner.
    expect(bannerSurfaceOf("02 - Diary/02 - Diary.md", scope())).toBe("diary");
    expect(bannerSurfaceOf("03 - Journals/03 - Journals.md", scope())).toBe(
      "journal"
    );
  });

  it("treats the homepage as one file and not as a prefix", () => {
    // A folder that happens to share the homepage's name is a folder. Matching
    // it as a prefix would put the homepage's banner — the one with no crumbs,
    // because it is the root — on every note inside it.
    expect(
      bannerSurfaceOf("00 - Infrastructure/Homepage.md/child.md", scope())
    ).toBeNull();
  });

  it("gives a journal's own folder note the journal's banner", () => {
    // `03 - Journals/Study/Study.md` is where the root's folder note lives and
    // it is as much a journal note as anything beneath it. The rule is `p ===
    // root || p.startsWith(prefix)`, and dropping the first half of it leaves
    // exactly one note in each journal with no banner.
    expect(bannerSurfaceOf("03 - Journals/Study/Study.md", scope())).toBe(
      "journal"
    );
  });

  it("does not match a folder whose name merely starts the same way", () => {
    // The whole reason `folderPrefix` appends the slash. Without it
    // `02 - Diary Archive/` is inside `02 - Diary`.
    const s = scope({ diaryFolders: ["02 - Diary"] });
    expect(bannerSurfaceOf("02 - Diary Archive/old.md", s)).toBeNull();
    expect(bannerSurfaceOf("02 - Diary/Daily/2026-08-20.md", s)).toBe("diary");
  });

  it("gives the longest matching root the answer", () => {
    // THE PLUGIN'S OWN RULE, borrowed rather than invented: `journalTypeOfPath`
    // resolves an overlapping pair this way. A reader who points their daily
    // folder at `03 - Journals/Diary` gets the diary's banner there, because
    // that is the more specific claim — and NOT whichever field happens to sit
    // earlier in `settings.paths`.
    const s = scope({
      diaryFolders: ["03 - Journals/Study/Diary"],
      journalRoots: ["03 - Journals/Study"],
    });
    expect(bannerSurfaceOf("03 - Journals/Study/Diary/2026-08-20.md", s)).toBe(
      "diary"
    );
    expect(bannerSurfaceOf("03 - Journals/Study/Maths/Maths.md", s)).toBe(
      "journal"
    );
  });

  it("ignores an empty folder rather than matching every note with it", () => {
    // An unconfigured path is "" and `folderPrefix("")` is "" — which every
    // path in the vault starts with. Without the guard, one blank field in
    // Settings puts a diary banner on every note in the vault.
    const s = scope({ flatNotes: [""], diaryFolders: ["", "02 - Diary"], journalRoots: [""] });
    expect(bannerSurfaceOf("Inbox/Some thought.md", s)).toBeNull();
    expect(bannerSurfaceOf("", s)).toBeNull();
  });
});

describe("titleTargetFor", () => {
  it("edits a diary entry's title property and a journal note's filename", () => {
    // THE ONE CASE THAT BREAKS THE OLDER RULE. A journal note's filename IS its
    // name; a diary entry's filename is a DATE the diary finds it by, so
    // renaming the file does not retitle the entry — it removes it from the
    // diary.
    expect(titleTargetFor("diary", true)).toBe("property");
    expect(titleTargetFor("journal", true)).toBe("filename");
    expect(titleTargetFor("home", true)).toBe("filename");
  });

  it("names a dated ENTRY that way, and never the diary's own pages", () => {
    // 4.51.3, and it arrives with the widened scope: the surface now reaches
    // the diary's folder note and its four period overviews, which are pages
    // whose names are their filenames and which have no entry title to write.
    // `hasDate` is the test because it is what makes a note an entry — the
    // indexer will not index a dated-less diary note at all.
    expect(titleTargetFor("diary", false)).toBe("filename");
  });

  it("is asked of the note, not of its folder", () => {
    // ASSERTED AT THE CALL SITE, because the whole point of the second argument
    // is that it comes from the file. A `true` hard-coded there would pass
    // every row above and be wrong on every dashboard.
    expect(readSrc("vault-banner")).toContain(
      'titleTargetFor(surface, this.dateLabel(file) !== null) === "filename"'
    );
  });
});

describe("the mark on the tile", () => {
  // The tile used to show two initials taken from the vault's folder name.
  // They said nothing about this plugin, on the one square in the interface
  // whose whole job is to say which plugin this is — and the square is the
  // button that opens ChronoAnvil's settings. It draws the mark now.

  it("never leaves the tile empty", () => {
    // The guarantee the initials existed to make, kept by other means: the
    // tile is a fixed square with an accent background, so nothing in it is a
    // coloured hole in the corner of every note. Either a glyph or the mark.
    const src = readSrc("vault-banner");
    expect(src).toContain("if (glyph) tile.setText(glyph);");
    expect(src).toContain(`else setIcon(tile, BRAND_ICON_ID);`);
  });

  it("registers the mark before the ribbon asks for it", () => {
    // addRibbonIcon with an unregistered id renders nothing at all — no
    // button, no error. Order is the whole contract.
    const main = readSrc("main");
    expect(main.indexOf("registerBrandIcon()")).toBeGreaterThan(-1);
    expect(main.indexOf("registerBrandIcon()")).toBeLessThan(
      main.indexOf(`addRibbonIcon(BRAND_ICON_ID`)
    );
  });

  it("draws one mark for the ribbon and the tile, not two", () => {
    // Two copies drift. If either of these stops pointing at brand-icon.ts,
    // the ribbon and the banner are free to disagree about what the product
    // looks like.
    expect(readSrc("main")).toContain('from "./ui/brand-icon"');
    expect(readSrc("vault-banner")).toContain('from "./brand-icon"');
    expect(BRAND_ICON_ID).toBe("chronoanvil-mark");
  });

  it("is stroke-only so it inherits whatever colour it is drawn in", () => {
    // One drawing serves an accent-filled tile and a ribbon button on the
    // sidebar's ground. A fill would need two.
    expect(BRAND_ICON_SVG).toContain('fill="none"');
    expect(BRAND_ICON_SVG).toContain('stroke="currentColor"');
    expect(BRAND_ICON_SVG).not.toContain('fill="#');
  });

  it("carries the stroke weight the mark was drawn for", () => {
    expect(BRAND_ICON_STROKE).toBe(1.5);
    expect(BRAND_ICON_SVG).toContain(`stroke-width="1.5"`);
  });

  it("scales the 24-grid drawing onto the 100 grid addIcon renders on", () => {
    // Authored at 24 to match the Lucide icons it sits beside; rendered at 100
    // because that is the box addIcon draws into. Getting this wrong shows up
    // as a mark that is a quarter of the size of every icon around it.
    expect(BRAND_ICON_SVG).toContain("transform=\"scale(4.1667)\"");
  });

  it("sits centred on the grid", () => {
    // An anvil is bottom-heavy, and drawn naively it hangs low in its box —
    // invisible on a specimen sheet, obvious in a 32px tile next to text.
    const ys: number[] = [];
    for (const d of BRAND_ICON_PATHS) {
      for (const m of d.matchAll(/-?\d+(?:\.\d+)?/g)) ys.push(Number(m[0]));
    }
    // Every coordinate in these paths is absolute and inside the grid.
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(24);
  });

  it("keeps the drawing inside Lucide's safe area", () => {
    // 2..22. Outside it the mark crowds the icons above and below it in the
    // ribbon, which is the one place it cannot be adjusted per-site.
    const verticals = [4, 6.5, 9, 12.75, 16.5, 20];
    expect(Math.min(...verticals)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...verticals)).toBeLessThanOrEqual(22);
    // ...and centred on it: the mark spans 4..20, whose midpoint is the grid's.
    expect((Math.min(...verticals) + Math.max(...verticals)) / 2).toBe(12);
  });

  it("is three parts: slab, hourglass waist, flared base", () => {
    expect(BRAND_ICON_PATHS).toHaveLength(3);
    for (const d of BRAND_ICON_PATHS) expect(d.trimEnd().endsWith("Z")).toBe(true);
  });

  it("no longer offers the vault's initials", () => {
    const src = readSrc("vault-banner");
    expect(src).not.toContain("initialsOf");
    expect(readSrc("settings")).not.toContain("initialsOf");
  });
});

// ── the in-note banners going quiet ──────────────────────────────────────

const fakePlugin = (enabled: boolean): ChronoAnvilPlugin =>
  ({
    settings: {
      banner: { enabled, glyph: "", absorb: true },
      paths: {
        home: "00 - Infrastructure/Homepage.md",
        diaryDaily: "02 - Diary/Daily",
        diaryWeekly: "02 - Diary/Weekly",
        diaryMonthly: "",
        diaryQuarterly: "",
        diaryYearly: "",
      },
      customJournals: [{ root: "03 - Journals/Study" }],
    },
  }) as unknown as ChronoAnvilPlugin;

describe("bannerSuppressed", () => {
  it("silences the in-note header wherever the vault banner draws one", () => {
    expect(
      bannerSuppressed(fakePlugin(true), "02 - Diary/Daily/2026-08-20.md")
    ).toBe(true);
    expect(
      bannerSuppressed(fakePlugin(true), "03 - Journals/Study/Maths/Maths.md")
    ).toBe(true);
  });

  it("leaves a note the bar never reaches showing its own header", () => {
    // The failure this row exists for: suppressing more widely than the banner
    // draws leaves a note with NEITHER banner, which looks like nothing rather
    // than like a bug and so is never reported.
    expect(bannerSuppressed(fakePlugin(true), "Inbox/Some thought.md")).toBe(
      false
    );
  });

  it("reads the same scope the banner draws from", () => {
    // ASSERTED AT BOTH CALL SITES rather than by comparing two vault runs: one
    // function answers "which folders", and the two callers that must agree
    // both ask it.
    const t = readSrc("vault-banner");
    expect(t).toContain("export function bannerScopeOf(plugin: ChronoAnvilPlugin)");
    expect(t).toContain("bannerSurfaceOf(file.path, bannerScopeOf(this.plugin))");
    expect(t).toContain("bannerSurfaceOf(path, bannerScopeOf(plugin))");
    // And nowhere a second reading of the five diary fields.
    expect(t.match(/diaryQuarterly/g)?.length).toBe(1);
  });
});

// ── the wiring ───────────────────────────────────────────────────────────

describe("the in-note header defers to the bar", () => {
  it("suppresses by the one list of banner directives, never a copy of it", () => {
    // THE 4.51 BUG, PINNED (4.51.1). That release wrote its own guard covering
    // the two directives *called* headers and shipped — and the first vault
    // render showed the homepage carrying its old banner card six lines under
    // the new bar, because a dashboard's banner is spelled `title`.
    //
    // `BANNER_KINDS` has been the answer since 4.21 and says so in its own
    // words: *what this set answers is not "which widgets are banners" but
    // "which directives make the fence holding them one", and the page's own
    // name does exactly that.* Asserting the SET is read is the only version of
    // this row that a fourth banner directive cannot break.
    const t = readSrc("widgets");
    expect(t).toContain("SUPPRESSED_KINDS.has(keywordOf(l))");
    // THE THREE ARE STILL ONE LIST, AND IT IS STILL `BANNER_KINDS` — what
    // changed in 4.51.6 is what happens to them. They are no longer dropped;
    // each is REMADE as the page head, so every one of them has to be a case
    // that asks. The row below pins that all three do.
    for (const kind of ["title", "entry-header", "journal-header"]) {
      expect(BANNER_KINDS.has(kind), kind).toBe(true);
      // …and none of them is in the drop list, or the case would never run.
      expect(SUPPRESSED_KINDS.has(kind), kind).toBe(false);
    }
    // WHAT IS LEFT IN THE DROP LIST IS WHAT THE BAR ITSELF DRAWS (4.51.5), and
    // `links:` is the whole of it: the bar carries the scopes now, so a second
    // copy in the note is the same words twice. It is not a banner directive
    // and must not become one — widening `BANNER_KINDS` would change what
    // `blockTitle`, `chromeClasses` and the section editor say about a lone
    // `links:` fence, three answers changed to avoid declaring one set.
    expect(SUPPRESSED_KINDS.has("links")).toBe(true);
    expect(BANNER_KINDS.has("links")).toBe(false);
    expect(SUPPRESSED_KINDS.size).toBe(1);
  });

  it("remakes a banner directive rather than returning null from its case", () => {
    // THE FIRST FIX WAS WORSE THAN THE FAULT. 4.51 suppressed by returning
    // `null` from the widget's case — and `null` from a case is how that loop
    // is told a directive is UNKNOWN, so a suppressed banner rendered a red
    // *"Unknown ChronoAnvil widget: journal-header"* where the banner had been.
    //
    // A suppressed banner is not a directive that failed; it is a line with
    // nothing to draw. So it is answered where the fence's lines are CHOSEN,
    // and the build loop never learns the bar exists.
    //
    // ASSERTED AS A SHAPE, NOT AS TWO POSITIONS. `readSrc` concatenates a split
    // module in filename order, which it warns is *"not meaningful"* — and
    // "Unknown ChronoAnvil widget" is a string this directory holds more than one
    // copy of, so an `indexOf` pair here compares the wrong two.
    const t = readSrc("widgets");
    // What the fence still drops is what the BAR draws, upstream of any build…
    expect(t).toMatch(
      /const drawable = quiet\s*\n\s*\? kept\.filter\(\(\{ l \}\) => !SUPPRESSED_KINDS\.has\(keywordOf\(l\)\)\)/
    );
    expect(t).toMatch(/const lines = drawable\.map/);
    // …and each banner directive answers with an ELEMENT. 4.51.6 gives them
    // something to be — the page head — so the case returns a build, and the
    // `null` that meant *unknown* is never the answer to a suppressed banner.
    // THE GUARD AND THE HEAD ARE ONE PAIR, WRITTEN TWICE — once for the two
    // directives that share an arm, once for `title`. Asserted as the pair
    // rather than as a distance from each `case`, which is a measurement of the
    // comments between them and nothing else.
    const pair = "return livePageHead(this.plugin, ctx);";
    expect(t.split(pair).length - 1).toBe(2);
    for (const kind of ["entry-header", "journal-header", "title"]) {
      expect(t, kind).toContain(`case "${kind}":`);
    }
    // LIVE, AND THAT IS THE 4.51.7 HALF (see §30). The head carries the same
    // frontmatter facts the banner did, so it needs the same repaint — without
    // it an eyebrow that lost the metadata-cache race stays lost.
    expect(readSrc("page-head")).toContain(
      "return liveFrontmatterWidget("
    );
    // And the head itself never answers `null` for a note the bar drew on —
    // it returns null only where there is no file to name, which is the same
    // guard every widget in here opens with.
    expect(readSrc("page-head")).toContain(
      "if (!(file instanceof TFile)) return null;"
    );
  });

  it("draws no block at all for a fence that was only a banner", () => {
    // The homepage's banner is a bare `title` and nothing else, so without this
    // the reader gets an empty framed card where the old banner was — a border
    // around nothing, with a drag handle on it.
    expect(readSrc("widgets")).toContain(
      "if (drawable.length === 0 && kept.length > 0) return;"
    );
  });

  it("keeps the time navigation drawing", () => {
    // `period-nav` IS THE TIME NAVIGATION and it is in neither set. 4.51.1 kept
    // `links:` for this reason and the reason was wrong: the three `links:`
    // lines this plugin composes are `home,today,scopes#diary`,
    // `today,scopes#diary` and `home[,up]` — vault destinations out of
    // `resolveTarget`, which is the table the bar's own row reads. A period
    // dashboard's prev/next is this directive, and an entry's day navigator is
    // on the tracker strip. Neither is suppressed.
    expect(SUPPRESSED_KINDS.has("period-nav")).toBe(false);
    expect(readSrc("entryheader")).toContain("buildEntryNav(plugin, bar, file, c);");
  });

  it("moves the scope menu onto the bar rather than losing it", () => {
    // WHAT THE ROW HAD THAT THE BAR HAD NOT. Dropping it would be 4.51.1 §10
    // again — a menu forked and a control falling out of the crack — so the
    // ladder moves, from the one table that holds it, and only onto the surface
    // where a weekly overview means anything.
    const t = readSrc("vault-banner");
    expect(t).toContain('if (surface === "diary") this.buildScopes(nav, file);');
    expect(t).toContain("reviewScopes(this.plugin, file, file.path)");
    expect(readSrc("links")).toContain("export function reviewScopes(");
    // And the row it came from reads the same function, so the two orders and
    // the two "you are here" readings cannot drift.
    expect(readSrc("links")).toContain(
      "const { targets: resolved, here } = reviewScopes(plugin, file, sourcePath);"
    );
  });

  it("drops the entry's alias editor where the bar draws the same title", () => {
    // Same property, same note, forty pixels apart. The strip keeps what the
    // bar has not got — the navigator between entries — and the date stays on
    // the caption row where 4.21.2 put it, rather than moving up to fill a gap.
    const t = readSrc("entryheader");
    expect(t).toContain("titleElsewhere = false");
    expect(t).toMatch(/if \(titleElsewhere\) \{[\s\S]{0,600}?buildEntryNav\(plugin, bar, file, c\);\s*\n\s*return bar;/);
    expect(readCss()).toContain(".ca-journal-entry-context.ca-jec-nav-only");
  });

  it("quietens the spacer without deleting it", () => {
    // The wordmark on a hairline is a top boundary and the bar is a louder one
    // just above it. But the element's PRIMARY job is not decoration — it is
    // where the cursor lands on open, which is what stops the first fence below
    // it rendering as raw source. Removing it trades a doubled rule for that.
    const t = readSrc("controls");
    expect(t).toContain("export function buildSpacer(quiet = false)");
    expect(t).toContain('if (!quiet) wrap.createSpan({ cls: "ca-journal-spacer-mark"');
    expect(readSrc("widgets")).toContain(
      "buildSpacer(bannerSuppressed(this.plugin, ctx.sourcePath))"
    );
    expect(readCss()).toContain(".ca-journal-spacer.is-quiet");
  });

  it("keeps the directives in the section catalogues", () => {
    // The banner sections stay `required: true` and stay in every template. A
    // release that deleted them would make the setting one-way.
    const t = readSrc("journal-sections");
    expect(t).toContain("journal-header");
  });
});

describe("the banner's hook", () => {
  const banner = () => readSrc("vault-banner");

  it("watches the four events and sweeps once on layout ready", () => {
    // `page-width.ts`'s hook, verb for verb — *"there is no event that means 'a
    // leaf is now showing a different note' on its own"*. Losing any one of
    // these is a banner that is right until the reader does the one thing that
    // event covered.
    const t = banner();
    for (const ev of ["file-open", "layout-change", "active-leaf-change"]) {
      expect(t).toContain(`workspace.on("${ev}", sweep)`);
    }
    expect(t).toContain('metadataCache.on("changed"');
    expect(t).toContain("onLayoutReady(() => this.sweep())");
  });

  it("scopes the metadata pass to the views showing that file", () => {
    // The one event `page-width` did not need. A vault-wide sweep on every
    // metadata change would re-derive every open note each time the reader
    // stops typing.
    expect(banner()).toContain("if (view.file?.path === file.path) this.apply(view)");
  });

  it("removes the old banner before deciding anything", () => {
    // A LEAF IS REUSED ACROSS FILE SWITCHES, so a banner left behind is one
    // that outlives the note that caused it — and every early return below is a
    // path that would leave it. The removal is therefore the first statement,
    // above the settings check and above the surface test.
    const t = banner();
    const remove = t.indexOf(`querySelector(\`:scope > .\${BANNER_CLASS}\`)?.remove()`);
    const surface = t.indexOf("if (!surface) return;");
    expect(remove).toBeGreaterThan(0);
    expect(surface).toBeGreaterThan(remove);
  });

  it("mounts on the leaf, not on anything the note creates", () => {
    // THE BUG THE VAULT RENDER FOUND (4.51.3). 4.51 mounted into
    // `.markdown-preview-sizer` / `.cm-sizer` — elements created by whichever
    // MODE mounts them, so a sweep that runs first (a restored workspace at
    // `onLayoutReady`, which is startup) finds nothing to prepend to. The note
    // then has no bar AND no in-note header, because the suppression is decided
    // by the note's own render and has already run.
    //
    // `view.containerEl` exists for as long as the view does and nothing
    // creates it late.
    const t = banner();
    expect(t).toContain("const host = view.containerEl;");
    expect(t).toContain("host.prepend(this.build(file, surface, host));");
    // The selector STRING, not the words: the module's header still explains
    // which elements it stopped reaching for and why.
    expect(t).not.toContain('".markdown-preview-sizer, .cm-sizer"');
    expect(t).not.toContain("sizersOf");
    // NOT A POST-PROCESSOR EITHER: with no directive there is no block to
    // attach to, and a block would be unloadable — reading view drops sections
    // that scroll away, which is the bug `page-width.ts` paid to learn.
    expect(t).not.toContain("registerMarkdownPostProcessor");
  });

  it("removes the old bar before every early return", () => {
    // One host now rather than a list, and the rule is unchanged: a leaf is
    // reused across file switches, so a bar left behind outlives the note that
    // caused it — and every check below `remove()` is a path that would leave
    // one.
    const t = banner();
    const remove = t.indexOf("host.querySelector");
    expect(remove).toBeGreaterThan(0);
    expect(t.indexOf("if (!surface) return;")).toBeGreaterThan(remove);
  });

  it("opens the menus the old cogs opened, on both surfaces", () => {
    // ONE LIST PER SURFACE, NOT A SECOND ONE. A reader who learns *Template…*
    // on a journal note, or *Wide page* on a dashboard, before turning the bar
    // on has to find it in the same place after.
    //
    // 4.51 got the journal half right and wrote its own two items for the
    // dashboard half — which silently dropped **Wide page**, the one setting on
    // that menu with no other door (4.51.1).
    const t = banner();
    expect(t).toContain("journalBannerMenu(this.plugin, file.path, isIndex)");
    expect(t).toContain("sectionsMenuFor(this.plugin, file.path,");
    // And neither list is re-spelled here.
    expect(t).not.toContain('.setTitle("Edit sections…")');
    expect(t).not.toContain('.setTitle("Wide page")');
  });

  it("carries the vault's four places, and Today is not one of them", () => {
    // 4.51.8, on the reader's instruction: `today` off, `diary` in, and the row
    // reordered so the two halves of the vault sit together — Home, Capture,
    // Diary, Journals.
    //
    // THE ORDER IS ASSERTED, NOT JUST THE MEMBERSHIP, because this row is read
    // left to right and "which four" is a composition decision. `today` is
    // still in `resolveTarget` and still on the command palette; what changed
    // is what the bar spends four slots on.
    const t = banner();
    expect(t).toContain(
      'const NAV_IDS = ["home", "capture", "diary", "journals"] as const;'
    );
    expect(t).not.toMatch(/NAV_IDS[\s\S]{0,80}"today"/);
    // AND THE ICON TABLE ONLY OVERRIDES. `capture` resolves to a pencil that
    // reads as "edit" beside three navigational glyphs; `diary` and `journals`
    // draw the destination table's own icons, so an entry for either would be
    // one more copy to keep in step.
    expect(t).toMatch(/const NAV_ICONS: Record<string, string> = \{\s*\n\s*capture: "plus",\s*\n\s*\};/);
  });

  it("draws no button for a destination that does not resolve", () => {
    // `launcher.ts`'s rule: nothing dead is drawn. A vault with no journals
    // root gets three buttons, not four with one greyed out.
    //
    // AND IT IS **A FILE OR AN ACTION**, WHICH IS THE HALF 4.51 DROPPED. The
    // first vault render drew two buttons out of four: `today` and `capture`
    // are the two rows in `resolveTarget` with `file: null`, documented at both
    // of them as *a destination that is not a file* — so asking only about
    // `.file` silently deletes the two destinations a reader reaches for most.
    expect(banner()).toContain(
      "if (!target || (!target.file && !target.action)) continue;"
    );
  });

  it("prefers the action over the file, as the launcher does", () => {
    // Order matters for `capture`, which is the bar's one action tile: where it
    // lands is a window rather than a note, so a handler that only opened files
    // would do nothing at all. (It mattered for `today` in the same way, which
    // is the case that found the bug — see the row above.)
    const t = banner();
    const act = t.indexOf("if (target.action) target.action();");
    const file = t.indexOf("else if (dest) void openFile(this.app, dest);");
    expect(act).toBeGreaterThan(0);
    expect(file).toBeGreaterThan(act);
  });

  it("marks 'you are here' only where the destination is a note", () => {
    // `capture` opens a window, so there is no note for the bar to be sitting
    // on and `dest` is null.
    expect(banner()).toContain("const on = !!dest && dest.path === file.path;");
  });
});

describe("the bar's own anatomy", () => {
  const banner = () => readSrc("vault-banner");

  it("names the note once, and the trail's tail is not the editor", () => {
    // THE VAULT RENDER'S CLEAREST FAULT (4.51.2), FINISHED (4.51.6). 4.51 drew
    // a trail, a large title under it, and Obsidian drew the inline title under
    // THAT: *Homepage* three times in four centimetres. 4.51.2 removed the
    // bar's own title row; this release moves the name down to the page head,
    // where it is set in a page's face and carries the pencil.
    //
    // So the trail's tail is a BREADCRUMB again — it says where you are, in
    // text, and nothing on the bar renames anything.
    const t = banner();
    expect(t).toContain('const trail = root.createDiv({ cls: "ca-avb-trail" });');
    expect(t).toContain('.createDiv({ cls: "ca-avb-here" })');
    expect(t).toContain(
      '.createSpan({ cls: "ca-avb-here-text", text: this.hereText(file, surface) });'
    );
    expect(t).not.toContain('cls: "avb-titlerow"');
    // The calls, not the words — the comment where the title used to be built
    // names both of them, and it is the record of why they left.
    expect(t).not.toMatch(/attachNoteRename\(/);
    expect(t).not.toMatch(/this\.buildTitle\(/);
  });

  it("gives the rename its own element rather than a row of crumbs", () => {
    // NOT TIDINESS, AND THE REASON OUTLIVED THE BAR'S TITLE. `attachNoteRename`
    // EMPTIES the element it is given when the reader clicks to edit — which is
    // why the name could never be the trail itself, and why the head hands it a
    // `.ca-jph-title` of its own rather than the row holding the eyebrow.
    const t = readSrc("page-head");
    expect(t).toContain('const row = root.createDiv({ cls: "ca-jph-titlerow" });');
    expect(t).toContain('attachNoteRename(app, row, file, "ca-jph-title");');
    // …and the eyebrow is on the head, ABOVE that row, so an edit that empties
    // the title cannot take "Daily entry" with it.
    const eyebrow = t.indexOf('cls: "ca-jph-eyebrow"');
    expect(eyebrow).toBeGreaterThan(0);
    expect(t.indexOf('cls: "ca-jph-titlerow"')).toBeGreaterThan(eyebrow);
    expect(readSrc("header-title")).toContain("row.empty();");
  });

  it("renames the property where the note is called by one", () => {
    // A DATED ENTRY IS NOT CALLED BY ITS FILENAME. `2026-08-20.md` is a slot in
    // a folder; what the reader named it is `title:`, and a pencil on the head
    // of such a note must write there — `titleTargetFor` is the one function
    // that decides which, and the head asks it rather than guessing from the
    // surface.
    const t = readSrc("page-head");
    expect(t).toContain("titleTargetFor(");
    expect(t).toContain("attachPropertyRename(");
    expect(readSrc("header-title")).toContain(
      "export function attachPropertyRename("
    );
  });

  it("does not print the date twice on an untitled entry", () => {
    // An entry with no title of its own is CALLED by its date, so the trail's
    // last step is the date — and the meta slot beside it was printing the same
    // words again, a few pixels to the right. One function answers what the
    // trail says, and the meta asks it rather than re-deriving.
    const t = banner();
    expect(t).toContain("private hereText(file: TFile, surface: BannerSurface)");
    expect(t).toContain("date === this.hereText(file, surface)");
  });

  it("puts the vault's name and its surface beside the mark", () => {
    // A coloured square with two letters in it, alone in a corner, is a
    // bookmark. The second line is the half doing real work: it is the only
    // place on the bar that names the surface — and on a journal it names the
    // JOURNAL, not the word.
    const t = banner();
    expect(t).toContain('idText.createDiv({ cls: "ca-avb-id-name", text: this.app.vault.getName() });');
    expect(t).toContain('cls: "ca-avb-id-sub", text: this.surfaceName(file, surface)');
    expect(t).toContain("if (type) return type.name;");
  });

  it("makes the whole lockup the settings button, not just the square", () => {
    const t = banner();
    expect(t).toContain('id.addEventListener("click", openSettings);');
    expect(t).not.toContain('tile.addEventListener("click"');
  });
});

describe("the settings rows", () => {
  const settings = () => readSrc("settings");

  it("offers the customization options that are actually the reader's", () => {
    const t = settings();
    expect(t).toContain('.setName("Tile")');
    expect(t).toContain('.setName("Background art pattern")');
    expect(t).toContain('.setName("Ambient accent glow")');
  });

  it("re-derives every open note on every one of them", () => {
    // A setting that takes effect on the next file-open is a setting the reader
    // presses twice.
    const t = settings();
    expect(t.match(/this\.plugin\.vaultBanner\.refresh\(\)/g)?.length).toBe(4);
  });

  it("takes the inline-title class off a leaf as readily as it puts it on", () => {
    // THE SAME TRAP AS THE BANNER ITSELF, and it is worse here because what is
    // left behind is invisible: a leaf is reused across file switches, so a
    // class kept on it hides the title of whatever note arrives next —
    // including notes this plugin has nothing to do with. Cleared beside the
    // removal, above every early return.
    const t = readSrc("vault-banner");
    const clear = t.indexOf("host.removeClass(HIDE_TITLE_CLASS);");
    const add = t.indexOf("host.addClass(HIDE_TITLE_CLASS);");
    expect(clear).toBeGreaterThan(0);
    // And it goes on only after the surface test — the setting is *hide it
    // where this names the note*, not *hide it everywhere*.
    expect(add).toBeGreaterThan(t.indexOf("if (!surface) return;"));
  });

  it("stands in for both without taking either out of layout", () => {
    // In Live Preview the inline title and the property panel are both editable
    // regions CodeMirror measures. `display: none` on one mid-session is a
    // stranded cursor and a mis-measured scroll, which this feature is nowhere
    // near worth.
    const css = readCss();
    const at = css.indexOf(".ca-absorb-host-chrome .inline-title,");
    expect(at).toBeGreaterThan(0);
    const rule = css.slice(at, css.indexOf("}", at));
    // THE PANEL IS THE 4.51.6 HALF. The title moved to the page head and the
    // properties moved into a window; leaving Obsidian's own panel drawn would
    // give the reader six rows of the thing the button was supposed to absorb.
    expect(rule).toContain(".ca-absorb-host-chrome .metadata-container");
    expect(rule).toContain("visibility: hidden");
    expect(rule).not.toContain("display: none");
  });

  it("takes the path out of Obsidian's header without taking the header", () => {
    // THE THIRD NAMING (4.51.7), reported off the vault render: the trail says
    // `Diary › Thu 20 Aug 2026`, Obsidian's view header says
    // `02 - Diary / Daily / Day-2026-08-20`, and the head says the date again.
    //
    // Only the LABEL goes. The arrows, the mode toggle and Obsidian's own ⋯ are
    // in that bar too and ChronoAnvil replaces none of them — and `display` is
    // allowed here precisely because a static label is not an editable region
    // CodeMirror measures, which is the whole reason the two rules above use
    // `visibility`.
    const css = readCss();
    const at = css.indexOf(".ca-absorb-host-chrome .view-header-title-container {");
    expect(at).toBeGreaterThan(0);
    expect(css.slice(at, css.indexOf("}", at))).toContain("display: none");
    expect(css).not.toContain(".ca-absorb-host-chrome .view-header {");
  });

  it("caps the tile where it is typed", () => {
    // A twelve-character tile is a broken row, and the reader should see the
    // field refuse rather than find out on a note.
    expect(settings()).toContain("s.banner.glyph = v.trim().slice(0, 4)");
  });
});

describe("the search window", () => {
  const search = () => readSrc("search-all");

  it("reads both halves of the one index", () => {
    // `diary-index.ts` settled this three views before there was a fourth:
    // *one index, one query surface*. Combining the searches is removing a
    // scope restriction, not adding a scanner.
    const t = search();
    expect(t).toContain("readIndex(this.plugin)");
    expect(t).toContain("readJournalIndex(this.plugin, roots)");
    expect(t).not.toContain("getMarkdownFiles()");
  });

  it("asks whether the query narrowed with the DIARY's kinds", () => {
    // ASSERTED AT THE CALL SITE because the two arguments are different lists
    // and the wrong one is silent: handing `queryNarrowsTo` the combined kinds
    // makes every filtered query claim to be the diary's.
    expect(search()).toContain("queryNarrowsTo(q, diaryKinds())");
  });

  it("survives being closed mid-scan", () => {
    // A reader who opens the window during a cold scan and presses Esc. Writing
    // into a closed modal's DOM throws, out of a promise nobody is awaiting.
    expect(search()).toContain("if (!this.resultsEl.isConnected) return;");
  });

  it("keeps the sort out of data.json", () => {
    // SESSION ONLY (4.51, Q13). A persisted sort is invisible state that makes
    // the first search after a restart quietly wrong for somebody who has
    // forgotten setting it.
    const t = search();
    expect(t).toContain("let sessionSort: SortField");
    expect(t).not.toContain("saveSettings");
    expect(readSrc("settings")).not.toContain("sessionSort");
  });

  it("says it is reading rather than showing an empty list", () => {
    // An empty list is a lie for as long as the scan takes, and the scan is the
    // one thing this window made slower.
    expect(search()).toContain('text: "Reading your vault…"');
  });

  it("moves the cursor without rebuilding the list", () => {
    // Two hundred rows rebuilt to change one, and the scroll position lost.
    expect(search()).toContain('rows.forEach((el, i) => el.toggleClass("is-sel"');
  });
});

// ── how it looks ─────────────────────────────────────────────────────────

describe("the banner's stylesheet", () => {
  it("measures itself rather than the window", () => {
    // The collapse is at 330px OF BANNER (4.51, Q5). It is not inside
    // `.ca-journal-widget-block`, which is what every other `@container` rule in
    // styles/ resolves against, so it declares its own — otherwise the query
    // resolves against the viewport and a narrow split never collapses.
    const css = readCss();
    const banner = css.slice(css.indexOf(".ca-vault-banner {"));
    expect(banner).toContain("container-type: inline-size");
    expect(banner).toContain("@container (max-width: 330px)");
  });

  it("drops the nav's words and keeps its icons", () => {
    expect(readCss()).toContain(".ca-vault-banner .ca-avb-btn-label {\n    display: none;\n  }");
  });

  it("lets the search take the room rather than capping it", () => {
    // THE CAP IS GONE (4.51.9), AND WITH IT THE ARGUMENT THAT PUT IT THERE.
    // 4.51.5 capped the field at 460px because uncapped it left the bar as *"a
    // mark, a half-kilometre of empty input, and four buttons pinned to the far
    // edge — three groups that never settle into one object."* Two renders
    // said otherwise: what makes three groups is the GAP, and a cap is what
    // creates the gap. At 620px a wide pane still showed 700px of nothing.
    //
    // `margin-right: auto` went with it: with nothing left to push, a rule that
    // only fires when the field is short is a rule waiting to be wrong.
    const css = readCss();
    const at = css.indexOf(".ca-vault-banner .ca-avb-search {");
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).toContain("flex: 1 1 auto");
    expect(rule).not.toMatch(/max-width/);
    expect(rule).not.toContain("margin-right: auto");
    // And at the collapse it takes a row of its own — a field is the one
    // control here that is worse for being narrow.
    expect(css).toMatch(
      /@container \(max-width: 330px\)[\s\S]*?\.ca-avb-search \{[\s\S]*?flex: 1 0 100%;/
    );
  });

  it("gives the bar a ground of its own", () => {
    // 4.51.2. The first cut was a transparent strip with a hairline under it,
    // on the argument that chrome should be quiet — and with no ground it read
    // as the note's first paragraph rather than as furniture above it.
    const css = readCss();
    const bar = css.slice(css.indexOf(".ca-vault-banner {"), css.indexOf(".ca-vault-banner .ca-avb-global"));
    expect(bar).toContain("background: var(--background-secondary)");
    // A STRIP BETWEEN TWO TOOLBARS SINCE 4.51.3, so a bottom edge rather than a
    // card's four — and `flex: 0 0 auto`, because the leaf is a column flexbox
    // and the view below it is the part that grows.
    expect(bar).toContain("border-bottom: var(--ca-rule-hair) solid");
    expect(bar).toContain("flex: 0 0 auto");
  });

  it("spans its leaf without reaching for a negative margin", () => {
    // It spans the whole leaf for free now that it is outside the note
    // (4.51.3). Doing it from INSIDE the sizer, which is what 4.51.2 would have
    // needed, meant measuring in JavaScript on every resize or a fixed negative
    // margin — and a fixed one overflows the moment a reader turns *readable
    // line length* off, putting a horizontal scrollbar on every note.
    //
    // ASKED OF THE BAR'S OWN RULE, not of the file: `.ca-avb-id` pulls its hover
    // target out over its own padding with a negative margin, which is inside
    // the bar and is not the thing this row is about.
    const css = readCss();
    const at = css.indexOf(".ca-vault-banner {");
    const bar = css.slice(at, css.indexOf("}", at));
    expect(bar).not.toContain("calc(-");
    expect(bar).not.toMatch(/margin[^;]*:\s*[^;]*\s-\d+px/);
    expect(bar).not.toMatch(/width:\s*calc\(100%\s*\+/);
  });

  it("draws its crumbs with the study header's, not a copy of them", () => {
    // Same trail, same `renderCrumb`, same treatment. Restating those eight
    // declarations one stylesheet later is how the two come to disagree about a
    // hover.
    const css = readCss();
    expect(css).toContain(".ca-jsh-crumbs a.ca-jn-pill,\n.ca-vault-banner .ca-avb-trail a.ca-jn-pill {");
  });

  it("outlines the destinations without filling them", () => {
    // TWO REPORTS, ONE RULE. 4.51.2 gave each tile a border AND a ground;
    // 4.51.8 read the *"punchout cards"* complaint as being about both and took
    // both, and the next render said *"the buttons don't have any border
    // lines."* It is the FILL that made them cards — a hairline on the bar's
    // own ground is a button's outline, a hairline around a second ground is a
    // card on a card.
    const css = readCss();
    const at = css.indexOf(".ca-vault-banner .ca-avb-btn {");
    expect(at).toBeGreaterThan(0);
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).toContain("background: none");
    expect(rule).toContain(
      "border: var(--ca-rule-hair) solid var(--background-modifier-border)"
    );
    // The ground appears under the pointer instead — `94-native-tables.css`'s
    // rule, which the cog on the row below has always followed.
    const hov = css.indexOf(".ca-vault-banner .ca-avb-btn:hover {");
    expect(css.slice(hov, css.indexOf("}", hov))).toContain(
      "background: var(--background-modifier-hover)"
    );
    // And "you are here" is the ink FIRST — the glyph and the word, where the
    // reader is already looking — with the outline agreeing now that every tile
    // has one to agree with.
    const on = css.indexOf(".ca-vault-banner .ca-avb-btn.is-on {");
    const onRule = css.slice(on, css.indexOf("}", on));
    expect(onRule).toContain("color: var(--text-accent)");
    expect(onRule).toContain("border-color: var(--interactive-accent)");
  });

  it("reveals the pencil on hover and keeps the cog visible", () => {
    // The cog on the vault banner is always visible for discoverability (with
    // elevated opacity on hover), while the pencil in the page head is hover-revealed.
    const css = readCss();
    expect(css).toContain(".ca-journal-page-head .ca-jph-title:hover .ca-jph-title-edit");
    expect(css).toContain(".ca-vault-banner:hover .ca-avb-cog");
    expect(css).toMatch(
      /@media \(hover: none\) \{\s*\.ca-journal-page-head \.ca-jph-title-edit \{\s*opacity: 0\.55;/
    );
    expect(css).toMatch(
      /@media \(hover: none\) \{\s*\.ca-vault-banner \.ca-avb-cog \{\s*opacity: 0\.65;/
    );
    // And nothing is left behind styling a title the bar no longer draws.
    expect(css).not.toContain(".avb-title");
  });

  it("adds no retired class prefix", () => {
    // The rule `appearance.test.ts` states for `.jkt-`: a new surface is not a
    // reason for a twenty-eighth prefix. `avb-` and `ams-` are two, and they
    // are namespaced under their roots rather than loose.
    const css = readCss();
    expect(css).not.toMatch(/^\.avb-/m);
    expect(css).not.toMatch(/^\.ams-/m);
  });
});

// ── the page head ────────────────────────────────────────────────────────

describe("what the Banner section became", () => {
  const head = () => readSrc("page-head");

  it("names what kind of note this is, which is the one fact the bar cannot", () => {
    // The bar's lockup says *Diary* and its trail says which folder. Neither
    // has anywhere to put "this is a lesson" — and that is the word a reader
    // would use for the note in a sentence.
    const t = head();
    expect(t).toContain("`${CLASS_DEFS[grainOf(plugin, file)].label} entry`");
    expect(t).toContain("`${type.name} · ${named}`");
  });

  it("asks for a grain without walking the folder to get it", () => {
    // `entryContext` answers this, and three call sites here were asking it —
    // but it also walks the grain's whole folder and reads every note's
    // frontmatter to find the neighbours. Right for a navigator, absurd for a
    // label, and the head is now asked twice more per note by the caption and
    // the context strip.
    const t = head();
    expect(t).toContain("function grainOf(plugin: ChronoAnvilPlugin, file: TFile)");
    expect(t).toContain("noteKindOf(");
    expect(t).not.toMatch(/entryContext\(plugin, file\)/);
  });

  it("has an answer on every surface the bar draws on", () => {
    // THE 4.51.6 HOLE (4.51.7 §31). The eyebrow came from `journalTypeOfNote`,
    // which wants the note's own `type:` — so the four DASHBOARDS, which
    // declare none, drew a bare name where every note inside them drew two
    // lines. One row per surface, so a fifth one cannot be added without a
    // decision about what it says.
    const t = head();
    expect(t).toContain('if (role.role === "dashboard") return "Diary";');
    expect(t).toContain('return `${type.name} · Journal`;');
    expect(t).toContain('? "Journals"');
    expect(t).toContain("`Diary · ${OVERVIEW_LABELS[role.unit]}`");
    // AND THE FIFTH, ADDED IN 4.52. A logbook lives under the diary root and in
    // no grain folder, so `noteKindOf` answers null and `grainOf` falls back to
    // `daily` — a work log's head read DAILY ENTRY over its filename. The role
    // is decided by the folder, BEFORE the grain is asked, which is the half
    // that matters: the wrong answer here was confident, not absent.
    expect(t).toContain('return `Diary · ${LOGBOOK_TITLE}`;');
    expect(t).toContain('return { role: "logbook" };');
    expect(t.indexOf("role: \"logbook\"")).toBeLessThan(
      t.indexOf("const grain = grainOf(plugin, file);")
    );
    // AND TWO THAT DELIBERATELY HAVE NONE. An eyebrow reading HOME over a title
    // reading Homepage is the doubling this release removes.
    expect(t).toContain("HOME AND SEARCH GET NONE, DELIBERATELY");
  });

  it("asks which journal a note is IN, not which one claims it", () => {
    // `journalTypeOfNote` is path AND a recognised `type:`, because its callers
    // REFUSE things — a misplaced tracker, a chart on the wrong surface. A
    // label refuses nothing, and asking the strict question left the Study
    // dashboard labelled *Journal* in the bar and blank in the head.
    expect(head()).toContain("journalTypeAtPath(plugin, file.path)");
    const bar = readSrc("vault-banner");
    expect(bar).toContain("journalTypeAtPath(this.plugin, file.path)");
    // The call, not the word — the comment where it used to be is the record.
    expect(bar).not.toMatch(/journalTypeOfNote\(/);
    expect(readSrc("journal")).toContain(
      "export function journalTypeAtPath("
    );
  });

  it("prints the period a dashboard is showing, and hangs no pencil on it", () => {
    // `Monthly.md` on disk, *August 2026* on screen. The filename is plumbing,
    // the period is a fact, and neither is a name the reader typed — so the row
    // is text. The period comes from `periodAnchor`, which is the same seed the
    // band's navigator reads, so the two cannot name different Augusts.
    const t = head();
    expect(t).toContain(
      "title: valueLabel(role.unit, periodAnchor(plugin.app, file, role.unit)),"
    );
    expect(t).toContain('target: "none",');
    expect(t).toContain('if (said.target === "none") {');
    // AND THE GRAIN'S DATE PROPERTY IS THE WRONG ONE TO ASK. `CLASS_DEFS`'
    // monthly `dateProperty` is `month` — an ENTRY's — where a dashboard keeps
    // `month-start`. That mismatch is why the head printed the filename.
    expect(readSrc("periodnav")).toContain("export function periodAnchor(");
    expect(readSrc("periodnav")).toContain("let cur = periodAnchor(app, file, unit);");
  });

  it("names the journal where the note has no kind of its own", () => {
    // A NOTE WITH NO `type` IS STILL SOMETHING. An eyebrow that vanishes on
    // half a journal's notes reads as a rendering fault.
    expect(head()).toContain("return named ? `${type.name} · ${named}` : type.name;");
  });

  it("reads a kind's label and a level's noun, each by its own word", () => {
    // `JournalKind` carries `label` and `JournalLevel` carries `noun`; asking
    // either for the other's field is `undefined` printed as an eyebrow.
    const t = head();
    expect(t).toContain("type.kinds.find((k) => k.id === id)?.label");
    expect(t).toContain("type.levels.find((l) => l.id === id)?.noun");
  });

  it("does not print the date twice on an untitled entry", () => {
    // The rule the bar's meta slot already follows, one surface down: an entry
    // with no title of its own IS called by its date, so a subtitle repeating
    // it is the same words twice.
    expect(head()).toContain("sub: date && date !== title ? date : null,");
    expect(readSrc("study-header")).toContain(
      "if (levelNoun && pageHeadSays(plugin, file, levelNoun)) levelNoun = null;"
    );
  });

  it("carries no properties, and that is the decision", () => {
    // THE REFERENCE DESIGN'S OBVIOUS NEXT MOVE, DECLINED (Q2). A diary entry's
    // properties are Mood, Sleep, Wake-Up and Bedtime — every one of them a
    // tracker, drawn as an EDITABLE cell in the grid directly below this head.
    // Listing them here would be the tracker grid again, read-only, four
    // centimetres higher. The plumbing that is left lives in the window.
    const t = head();
    expect(t).toContain("NO PROPERTIES ON IT, WHICH IS A DECISION");
    expect(t).not.toContain("orderedKeys");
    expect(t).not.toContain("openProperties");
    // EVERY FRONTMATTER READ NAMES ITS PROPERTY. That is the assertion, not a
    // count of them: the head reads `type` for the eyebrow, `title` for the
    // name and `journal`/`type` for the grain, and what would make it a
    // property panel is ENUMERATING them.
    expect(t).not.toMatch(/Object\.(keys|entries)\([^)]*frontmatter/);
    for (const read of t.match(/frontmatter\?\.\[[^\]]*\]/g) ?? []) {
      expect(read, read).toMatch(/frontmatter\?\.\["(type|journal)"\]|TITLE_PROP/);
    }
  });

  it("takes none of the banner's card while the bar is on", () => {
    // BANNER_KINDS always draws the page head directly without legacy banner cards.
    const t = readSrc("widgets");
    expect(t).toContain("if (BANNER_KINDS.has(kind)) {");
    expect(t).toContain("pageHead = widget;");
    // And nothing new paints in their place: a block with no chrome class is a
    // plain flex column, which is what `.ca-journal-widget-block` has always been.
    expect(t).not.toContain('out.push("journal-head-block")');
  });

  it("puts the tracker section's strip under the name, not over it", () => {
    // On a note composed before 4.20 the markers live inside the banner's own
    // fence, so this one block is the head AND the tracker section. Everything
    // that prepends to it does so as that section's head — and the note's name
    // is above all of it.
    const t = readSrc("widgets");
    expect(t).toContain(
      'if (pageHead) pageHead.insertAdjacentElement("afterend", strip);'
    );
    expect(t).toContain(
      'if (pageHead) pageHead.insertAdjacentElement("afterend", facts);'
    );
  });

  it("takes the page's ground rather than another card", () => {
    // Every other block on a ChronoAnvil note is a bordered surface, and a note
    // that opens with one more of them opens with furniture. This is the note's
    // own head — it sits on the page the way a heading does.
    const css = readCss();
    const at = css.indexOf(".ca-journal-page-head {");
    expect(at).toBeGreaterThan(0);
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).not.toContain("background:");
    expect(rule).not.toContain("border-radius");
    expect(rule).toContain("border-bottom:");
  });

  it("sets the name at the size Obsidian's own title had", () => {
    // It STANDS IN for that title, so a reader should not be able to tell that
    // anything moved — except that this one knows what the note is.
    const css = readCss();
    const at = css.indexOf(".ca-journal-page-head .ca-jph-title {");
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).toContain("font-size: var(--ca-text-xl)");
    expect(rule).toContain("cursor: text");
  });

  it("takes the masthead's headline rather than doubling it", () => {
    // The overview band's biggest type is the navigator's own trigger, *"the
    // period's VALUE wearing the title's size"* — the same words the head now
    // prints as the note's name. One token demotes it, which is what that token
    // was extracted for, and the class only goes on while the bar is drawing:
    // with it off there is no head, and the trigger is the page's only headline.
    const cal = readSrc("calendar");
    expect(cal).toContain('band.addClass("ca-job-head-elsewhere");');
    expect(cal).toContain("bannerSuppressed(plugin, ctx.sourcePath)");
    const css = readCss();
    const at = css.indexOf(
      ".ca-journal-overview-banner.ca-job-head-elsewhere .ca-journal-period-nav.ca-jeh-seg {"
    );
    expect(at).toBeGreaterThan(0);
    expect(css.slice(at, css.indexOf("}", at))).toContain("--jpn-headline: 1em");
  });

  it("lives in a stylesheet of its own, not the bar's", () => {
    // It is not the bar: the bar is chrome on the leaf and this is the first
    // thing IN the note. They are related only by what the bar absorbed.
    const sheet = styleSheets().find((s) => s.name === "98-page-head.css");
    expect(sheet).toBeTruthy();
    expect(sheet!.css).toContain(".ca-journal-page-head {");
    const banner = styleSheets().find((s) => s.name === "97-vault-banner.css");
    expect(banner!.css).not.toContain(".ca-journal-page-head");
  });
});

// ── the banner's art presets (4.80) ───────────────────────────────────────
//
// The six patterns were SVG files scaffolded into `00 - Infrastructure/Art/`
// and read back out of the vault. They are data URIs in the stylesheet now,
// and the folder is gone — with it the settings scan that listed whatever
// image the reader had dropped in there, which is the whole reason for the
// change: a scaffolded folder had become a styling API.
//
// WHAT IS ASSERTED IS THE SEAM. A preset is an id in TypeScript and a rule in
// CSS, and neither file can see the other, so an id with no rule (a dropdown
// entry that paints nothing) and a rule with no id (a pattern nothing can
// select) are both invisible to a reader of either half.

describe("banner art presets", () => {
  const css = repoFile("styles/97-vault-banner.css");
  const ids = Object.keys(ART_PRESETS);

  const styled = new Set(
    [...css.matchAll(/\.ca-vault-banner\[data-ca-art="([a-z0-9-]+)"\]/g)].map(
      (m) => m[1]
    )
  );

  it("gives every preset in the table a rule in the stylesheet", () => {
    for (const id of ids) {
      expect(styled.has(id), `${id} has no [data-ca-art] rule`).toBe(true);
    }
  });

  it("gives every rule in the stylesheet a preset in the table", () => {
    for (const id of styled) {
      expect(ART_PRESETS[id], `${id} is styled but not selectable`).toBeDefined();
    }
  });

  it("keys every preset by its own id", () => {
    // The table was keyed by FILENAME until 4.80 and carried the id beside it,
    // so two spellings of one preset could disagree. The key is the id now.
    for (const [key, preset] of Object.entries(ART_PRESETS)) {
      expect(preset.id).toBe(key);
    }
  });

  it("states all four painting facts in each preset's rule", () => {
    // `::after` reads six properties; opacity comes from the slider and the
    // pattern is the preset's own, so a rule that sets the pattern and forgets
    // the size inherits the *previous* preset's geometry from the token file.
    for (const id of ids) {
      const rule = css.slice(
        css.indexOf(`.ca-vault-banner[data-ca-art="${id}"]`),
        css.indexOf("}", css.indexOf(`.ca-vault-banner[data-ca-art="${id}"]`))
      );
      for (const prop of [
        "--ca-header-art-pattern",
        "--ca-header-art-size",
        "--ca-header-art-repeat",
        "--ca-header-art-blend",
      ]) {
        expect(rule, `${id} does not set ${prop}`).toContain(`${prop}:`);
      }
    }
  });

  it("paints from the stylesheet, not from a file in the vault", () => {
    const t = readSrc("vault-banner");
    expect(t).toContain('root.setAttr("data-ca-art", preset.id)');
    // The three reads that made the vault the source of a texture.
    expect(t).not.toContain("getResourcePath");
    expect(t).not.toContain("paths.art");
    // Opacity is the one visual fact still set from TypeScript, because it is
    // the one the reader drags a slider for.
    expect(t).toContain('root.style.setProperty("--ca-header-art-opacity"');
    expect(t).not.toContain('setProperty("--ca-header-art-size"');
  });

  it("no longer offers the reader's own files as patterns", () => {
    const t = readSrc("settings");
    expect(t).not.toContain("artFiles");
    expect(t).not.toContain('child.extension === "svg"');
  });

  it("ships no art folder, and scaffolds none", () => {
    expect(existsSync(join(ROOT, "assets", "art"))).toBe(false);
    expect(readSrc("scaffold")).not.toContain('asset: "art/');
    // The path key went with the folder: a configurable path to a folder
    // nothing writes and nothing reads is a settings row that does nothing.
    expect(DEFAULT_PATHS).not.toHaveProperty("art");
  });

  it("starts on a preset the stylesheet can actually draw", () => {
    const art = DEFAULT_SETTINGS.banner?.art;
    expect(art).toBeDefined();
    expect(ART_PRESETS[art as string]).toBeDefined();
  });
});

describe("normalizeBannerArt", () => {
  it("maps every filename that used to be scaffolded", () => {
    expect(normalizeBannerArt("topography-minimal.svg")).toBe("topography");
    expect(normalizeBannerArt("dot-grid.svg")).toBe("dot-grid");
    expect(normalizeBannerArt("constellations.svg")).toBe("constellations");
    expect(normalizeBannerArt("aurora-mesh.svg")).toBe("aurora-mesh");
    expect(normalizeBannerArt("isometric-grid.svg")).toBe("isometric-grid");
    expect(normalizeBannerArt("subtle-waves.svg")).toBe("subtle-waves");
  });

  it("leaves a value that is already an id alone", () => {
    for (const id of Object.keys(ART_PRESETS)) {
      expect(normalizeBannerArt(id)).toBe(id);
    }
  });

  it("sends a file the reader added to none, not to a default", () => {
    // Their own texture cannot be drawn any more. Substituting one they never
    // chose would change the look of their banner without saying so; a flat
    // banner is the visible version of what happened.
    expect(normalizeBannerArt("my-own-paper.png")).toBe("none");
    expect(normalizeBannerArt("none")).toBe("none");
    expect(normalizeBannerArt(undefined)).toBe("none");
    expect(normalizeBannerArt("")).toBe("none");
  });

  it("runs once on load rather than at every paint", () => {
    const t = readSrc("main");
    expect(t).toContain("this.settings.banner.art = normalizeBannerArt(");
    // The banner NAMES it in a comment, which is the point of the comment; what
    // it must not do is call it, once per paint, on a value already settled.
    expect(readSrc("vault-banner")).not.toContain("normalizeBannerArt(");
  });
});
