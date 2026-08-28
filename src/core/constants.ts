// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Central configuration defaults shared across the plugin.
// Every path here is overridable from the settings tab, but the defaults
// reproduce the original vault layout exactly.

import type { BuiltinKind, TrackerDef } from "../trackers/trackers";

// The four top-level roots, named once so every derived path below (and every
// default a new custom journal picks up) follows a rename here instead of
// repeating the literal. The numeric prefix keeps them ordered in the file
// explorer; the names say what each one is *for*:
//
//   00 - Infrastructure  the machinery: templates, documentation, .base files
//   01 - Material        the raw stuff entries are made from and point at
//        ├── Staging     captured, not yet filed — a transit lounge
//        └── Attachments images and documents notes link to — a permanent store
//   02 - Diary           dated entries — daily notes and monthly reviews
//   03 - Journals        subject-shaped notes — Study and any custom type
//
// Each root names a *role*, not its contents. An earlier layout used
// "00 - Templates & Assets" and "01 - Inbox", and both aged badly: the first
// stopped being accurate the moment documentation and .base files moved in,
// and the second suggested a queue you're failing to empty rather than a place
// things pass through on the way somewhere.
//
// Staging and Attachments share a parent despite opposite lifecycles (one you
// want empty, one only grows) because what they have in common is what matters
// for placement: neither is a journal entry. Both are the material entries are
// built from. "Material" is deliberately abstract enough to take a third child
// later — clippings, voice memos, scans — without needing another top-level
// number.
export const ROOT_INFRASTRUCTURE = "00 - Infrastructure";
export const ROOT_MATERIAL = "01 - Material";
export const ROOT_DIARY = "02 - Diary";
export const ROOT_JOURNALS = "03 - Journals";
// Study's own folder, one tenant of the journals root rather than the whole of
// it. Until 2.45 Study *was* the journals root, which made a custom journal's
// root a direct child of the journals root — see deriveJournalFolders.
export const ROOT_STUDY = `${ROOT_JOURNALS}/Study`;

export const TEMPLATES_ROOT = `${ROOT_INFRASTRUCTURE}/Templates`;

// ── the banner's background art (4.80) ───────────────────────────────────
//
// A PRESET IS A NAME AND A DEFAULT STRENGTH, and nothing else. Until 4.80 it
// was also a filename, a background-size, a repeat, a position and a blend
// mode — because the pattern itself was an SVG file scaffolded into
// `00 - Infrastructure/Art/`, which meant TypeScript had to describe how to
// paint a file it could only reach through the vault.
//
// THE FOLDER IS GONE. The six patterns are data URIs in `97-vault-banner.css`,
// selected by `data-am-art` on the banner root, and every visual fact about a
// preset — its geometry, how it tiles, how it blends — is a declaration in
// that file rather than a string here. What is left in TypeScript is what the
// settings tab needs to draw a dropdown, which is the only reason this table
// still exists.
//
// The reason the folder went: it was scanned for whatever `.svg`, `.png` or
// `.jpg` the reader had dropped into it, which made "bring your own texture"
// an accidental feature of a plugin that does not otherwise invite people to
// author their own styles. `test/vault-banner.test.ts` holds the two halves
// together — an id here with no rule there is a dropdown entry that paints
// nothing, and it is caught rather than seen.
export interface ArtPresetSpec {
  id: string;
  name: string;
  defaultOpacity: number;
}

export const ART_PRESETS: Record<string, ArtPresetSpec> = {
  topography: {
    id: "topography",
    name: "Topography (Contour lines)",
    defaultOpacity: 18,
  },
  "dot-grid": {
    id: "dot-grid",
    name: "Dot Matrix (Technical grid)",
    defaultOpacity: 25,
  },
  constellations: {
    id: "constellations",
    name: "Constellations (Geometric nodes)",
    defaultOpacity: 22,
  },
  "aurora-mesh": {
    id: "aurora-mesh",
    name: "Aurora Mesh (Luminous gradient)",
    defaultOpacity: 35,
  },
  "isometric-grid": {
    id: "isometric-grid",
    name: "Isometric Grid (3D cube lattice)",
    defaultOpacity: 16,
  },
  "subtle-waves": {
    id: "subtle-waves",
    name: "Minimal Waves (Ripples)",
    defaultOpacity: 20,
  },
};

// What `banner.art` used to hold: the filename of a scaffolded SVG. Read once
// on load by `normalizeBannerArt`, never at paint time — a fallback evaluated
// on every read is the re-derivation this codebase removes on sight.
//
// A VALUE THAT IS NEITHER A PRESET ID NOR A NAME BELOW is a file the reader
// put in the Art folder themselves. It becomes "none" rather than a preset:
// the vault is no longer read for textures, and quietly substituting a pattern
// they did not choose would be worse than the flat banner that says so.
export const LEGACY_ART_FILES: Record<string, string> = {
  "topography-minimal.svg": "topography",
  "dot-grid.svg": "dot-grid",
  "constellations.svg": "constellations",
  "aurora-mesh.svg": "aurora-mesh",
  "isometric-grid.svg": "isometric-grid",
  "subtle-waves.svg": "subtle-waves",
};

// Where a saved `banner.art` lands in the current vocabulary. Preset ids pass
// through, the six shipped filenames map, everything else goes flat.
export function normalizeBannerArt(saved: string | undefined): string {
  if (!saved || saved === "none") return "none";
  if (ART_PRESETS[saved]) return saved;
  return LEGACY_ART_FILES[saved] ?? "none";
}

export const DEFAULT_PATHS = {
  // The page both banners live on. Named "Journal Home.md" until 2.51, which
  // was the name of one of the two cards on it doing duty as the name of the
  // whole page: the page has been a Diary card plus a Journals card since 2.8,
  // and the area titlebars (2.18.3) say so in the UI — "Diary · 02 - Diary/" on
  // one, "Journals · 03 - Journals/" on the other. "Homepage" names the page.
  home: "Homepage.md",
  // ── 01 - Material ────────────────────────────────────────────────────
  materialRoot: ROOT_MATERIAL,
  // The capture folder: anything grabbed before it has a home.
  staging: `${ROOT_MATERIAL}/Staging`,
  // Shared parent of diaryDaily/diaryMonthly — the default scope for the
  // `tag-index` widget (was hard-coded as `"02 - Diary"` inside the old
  // dataviewjs block). Kept as its own setting rather than derived from
  // diaryDaily so a vault where the two live under different parents can
  // still point tag-index somewhere sensible.
  diaryRoot: ROOT_DIARY,
  // ── The diary's five grains ──────────────────────────────────────────
  //
  // ONE RULE, as of 2.57: a folder holds that period's entries, and its FOLDER
  // NOTE is that period's dashboard, which summarises the grain below it.
  //
  // Before 2.57 there were three rules pretending to be one. `Weekly/` held
  // *daily* entries and its folder note was the weekly dashboard — defensible
  // while a week was only a way of reading days back, and indefensible the
  // moment weekly entries existed. Meanwhile Quarter.md and Year.md were bare
  // notes rather than folder notes, so the same role had two mechanisms.
  //
  // Daily is the one asymmetry left and it is deliberate: there is no daily
  // dashboard, because a daily entry IS the note. Inventing one to fill the
  // slot would be symmetry for its own sake.
  //
  // Entries are `Day-`, `Week-`, `Month-`, `Quarter-`, `Year-` prefixed, so a
  // filename says its grain without its folder.
  diaryDaily: `${ROOT_DIARY}/Daily`,
  diaryWeekly: `${ROOT_DIARY}/Weekly`,
  diaryMonthly: `${ROOT_DIARY}/Monthly`,
  diaryQuarterly: `${ROOT_DIARY}/Quarterly`,
  diaryYearly: `${ROOT_DIARY}/Yearly`,
  // The special-events note. One file, holding every recurring and single
  // event in its frontmatter (see events.ts for why it lives in the vault
  // rather than data.json). Sits beside the entries it decorates rather than
  // under the infrastructure root: a birthday is content, not machinery.
  events: `${ROOT_DIARY}/Events.md`,
  // The retrieval note: search, on-this-day and the full timeline. A note
  // rather than a custom view, because every other surface in the plugin is a
  // note — so it is linkable, bookmarkable and editable like the rest, and a
  // user who wants only the search box can delete the other two blocks.
  search: `${ROOT_DIARY}/Search.md`,
  // THE DIARY'S UNDATED LAYER (4.52). One folder holding one note per logbook —
  // a work log, what you are focused on, links to come back to, the meetings in
  // the week ahead.
  //
  // UNDER THE DIARY, NOT UNDER `01 - Material`, and the two roots' own comments
  // decide it. Material holds "the raw stuff entries are made from and point
  // at": Staging is a transit lounge and Attachments is a store, and neither is
  // prose somebody wrote on purpose. A work log is written, not collected. The
  // precedent is `events` four lines up, which sits beside the entries it
  // decorates on exactly this argument — "a birthday is content, not
  // machinery".
  //
  // A FOLDER RATHER THAN ONE `Logbooks.md`, because a logbook is a note: it can
  // be opened, linked, searched and exported on its own, and a reader who keeps
  // six of them does not get one page six screens long. The folder's own note
  // (`folderNotePath`) carries a widget per logbook, which is how a click on the
  // folder lands somewhere — the gap 4.1 §2 closed at `02 - Diary/`.
  logbooks: `${ROOT_DIARY}/Logbooks`,
  // The shared root for every journal type. Each type — Study included — owns
  // one folder beneath it. Named for the role, not for Study, which is only one
  // of its tenants; before 2.45 that sentence was aspirational, because Study's
  // root *was* this path.
  journalsRoot: ROOT_JOURNALS,
  // Study's own root, one level down, exactly where a custom journal's derived
  // root lands (`${journalsRoot}/${name}`). A plain concrete string like every
  // other path rather than something computed at read time, so it is as
  // renameable as any of them and PathWatch carries it along when the journals
  // root is renamed.
  infrastructureRoot: ROOT_INFRASTRUCTURE,
  templates: TEMPLATES_ROOT,
  templatesDiary: `${TEMPLATES_ROOT}/Diary`,
  documentation: `${ROOT_INFRASTRUCTURE}/Documentation`,
  // Deliberately *not* under the infrastructure root: a photo taken on a
  // Wednesday in July is content, not vault machinery, and filing it beside the
  // templates means any export or sync of "my diary" either drags the system
  // folder along or leaves the images behind.
  attachments: `${ROOT_MATERIAL}/Attachments`,
  // Where "export as plain markdown" writes (4.31). A ROOT of its own rather
  // than a child of the infrastructure one, and deliberately: this holds copies
  // of the reader's writing, which is content by the same argument
  // `attachments` makes one line up — a folder of everything you wrote is the
  // last thing that should be filed under machinery.
  //
  // A REAL PATH KEY RATHER THAN A CONSTANT, so PathWatch follows a rename of the
  // folder in the file explorer for free (folders are carried automatically;
  // only `FILE_PATH_KEYS` are special-cased). A reader who moves it keeps it.
  exportRoot: "Almanac Export",
};

// Which root each of the remaining paths sits under.
//
// Every path in DEFAULT_PATHS is a plain, concrete string — there is no
// resolution layer and nothing is computed at read time, so the places that
// read `paths.x` stay exactly as simple as they were, and a child path is as
// real and as renameable as any other. This map exists for two narrow jobs:
// letting the settings tab show which paths a root owns, and letting an edit to
// a root carry its children along by prefix (the same remap PathWatch performs
// when a folder is renamed in the file explorer).
export const ROOT_CHILDREN: Record<string, (keyof typeof DEFAULT_PATHS)[]> = {
  infrastructureRoot: ["templates", "templatesDiary", "documentation"],
  materialRoot: ["staging", "attachments"],
  diaryRoot: [
    "diaryDaily",
    "diaryWeekly",
    "diaryMonthly",
    "diaryQuarterly",
    "diaryYearly",
    "events",
    "search",
    "logbooks",
  ],
  // NO FIXED SUB-PATHS (3.21), and the empty list is the statement rather than
  // an omission: the journals root is still a root this table accounts for, and
  // it now has no configured children. Study's was the one, because Study was
  // the one journal whose folder lived in `paths` rather than in its own
  // config. Every journal's root is its config's now, so renaming the journals
  // root remaps them through `remapConfiguredPaths` over `customJournals`
  // rather than through here.
  journalsRoot: [],
  // NO FIXED SUB-PATHS EITHER (4.31), and for a sharper reason than the journals
  // root's: the export MIRRORS each note's vault path beneath this folder, so
  // its children are whatever the vault happens to contain today. There is
  // nothing to configure and nothing that could go stale, which is the whole
  // argument for mirroring rather than inventing a naming scheme.
  exportRoot: [],
};

// Defaults for the `attach:` widget's file handling. `subfolder` is a token
// pattern *below* paths.attachments — a year/month tree by default, because a
// daily journal generates attachments forever and a single flat folder with
// four thousand screenshots in it is miserable to browse in the file explorer
// (and slow to sync). Set it to "" for one flat folder.
export const DEFAULT_ATTACHMENT_OPTIONS = {
  // "almanac" = paths.attachments + subfolder; "obsidian" = defer to the
  // vault's own Files & Links attachment setting; "note" = next to the note.
  location: "almanac" as "almanac" | "obsidian" | "note",
  subfolder: "{yyyy}/{mm}",
  namePattern: "{name} {date} {time}",
  // Ask before moving a file to the trash when removing its tile. The plain
  // "Remove" action never touches the file — this governs "Remove and delete".
  confirmDelete: true,
};

// The Journals section's title. Read only by journals-section.ts, which keys
// the section's fold state on it — the widget renders its own bar rather than
// sitting under a `header:` one, so the title has to be agreed somewhere.
//
// `JOURNALS_HEADING` (the `## 📚 Journals` markdown form) sat beside this until
// 2.41 as the anchor the home-note migration searched for. Nothing carries that
// layout, and the migration is gone.
export const JOURNALS_TITLE = "📚 Journals";

// The directive that *is* the Journals section as of 2.13.9: one line in one
// ```almanac fence, rendering the whole section — hero band, per-type header
// rows, subject groups, topic rows — as a single widget, the way `diary`
// renders the whole Diary section. Both titles above are kept only so the
// migration can find and replace an older, markdown-generated container.
export const JOURNALS_DIRECTIVE = "journals";

// ── AND THE ONE QUESTION EVERYTHING ELSE ASKS ABOUT IT (4.38.3) ──────────
//
// "Does this note already carry the Journals section?" was asked in FOUR places,
// each with its own spelling of the answer, and three of them were wrong the
// moment 4.37 introduced `journals:cards`:
//
//   • `ensureJournalsBlock` compared a line to `JOURNALS_DIRECTIVE` exactly, so
//     it saw `journals:cards` as *absent* and appended a SECOND block. That is
//     the one a reader hit on a clean vault: install, add Study — which calls
//     `rebuildJournalHome` — and the homepage silently gained a duplicate
//     Journals section before repair had ever run.
//   • `journals-dashboard-sections.ts`'s `locate` did the same, which turned
//     4.37's migration into a page that grew a section on every repair (4.38.2).
//   • `home-sections.ts`'s `locate` was widened by hand in 4.37 to `journals\S*`,
//     which is why the homepage never duplicated *through repair* — a fourth
//     spelling that happened to be right.
//
// AN ARGUMENT IS AN ARRANGEMENT, NOT A DIFFERENT SECTION. `journals` and
// `journals:cards` are one section drawn two ways, so every "is it here?" must
// answer yes to both. Having said that once, here, is the fix; the three patches
// that preceded it each corrected one caller and left the others to be found by a
// reader.
//
// `journals-header:study` MUST NOT MATCH. It is a different widget sharing seven
// letters, and it sits on every journal dashboard — so the directive is matched
// whole, with an optional `:argument`, never by prefix. `journals\S*` did match it
// and got away with it only because no page composes both.
const JOURNALS_DIRECTIVE_BODY = "journals(?::[a-z-]+)?";

// For a probe over a whole note — what `locate` uses.
export const JOURNALS_DIRECTIVE_LINE = new RegExp(
  `^${JOURNALS_DIRECTIVE_BODY}\\s*$`,
  "m"
);

// For a single line already in hand — what the fence walkers use.
const JOURNALS_DIRECTIVE_EXACT = new RegExp(`^${JOURNALS_DIRECTIVE_BODY}$`);
export const isJournalsDirective = (line: string): boolean =>
  JOURNALS_DIRECTIVE_EXACT.test(line.trim());

// Per-note chart region. The chart manager owns the body of this section:
// everything between this heading and the next heading of the same or higher
// level (or end of file). No invisible marker text — the heading itself is the
// boundary. This
// keeps edit mode clean and means every dashboard carrying this heading gets a
// managed chart area.
//
// SENTENCE CASE SINCE 4.26, AND IT WAS THE LAST TITLE TO GET THERE. 4.25 put
// every other section title into sentence case and reverted this one, because
// it is not only a display string: it is the ANCHOR `charts.ts::sectionBounds`
// hands to `util.ts::locateSection`, and that match was exact. Renaming it then
// would have unhooked the two pre-2.1 Trends migrations from the very notes
// they exist to repair, with no error to show for it — `locateSection` returns
// null for "not found" and for "found under its old name" alike.
//
// `locateSection` takes a list of historical spellings now, so the rename is
// safe and the old notes are still found. See TRENDS_HEADINGS_PAST below.
export const TRENDS_HEADING = "## 📊 Trends and statistics";

// Every spelling this heading has shipped under, newest first, EXCLUDING the
// current one.
//
// WHAT BELONGS HERE, AND WHAT MUST NOT. Only strings Almanac itself has written
// into a note. A reader who retitles their own Trends bar has made it theirs —
// `retitleTrends` rewrites a title only when it is on this list, so an unknown
// title is left alone rather than "corrected" to the house spelling. That is
// the whole reason this is a list of exact strings and not a case-insensitive
// compare, which could not tell the two apart.
//
// APPEND, NEVER EDIT. A vault can be older than any one release, so a spelling
// dropped from this list becomes a note nobody can find again.
export const TRENDS_HEADINGS_PAST: readonly string[] = [
  "## 📊 Trends and Statistics",
];

// The literal tokens of an ```almanac fenced block and the `header:` directive
// inside it. Centralised so the section-locator (util.ts::locateSection), the
// widget renderer, and the home/chart rebuilders all agree on the exact syntax
// — a change here (e.g. the fence language tag) propagates to every consumer
// instead of needing a hand-edit in each. FENCE_OPEN is the info-string line;
// FENCE_CLOSE is the bare closing line.
export const FENCE_OPEN = "```almanac";
export const FENCE_CLOSE = "```";
export const HEADER_PREFIX = "header:";

// Fallback emojis when a name isn't in the maps below.
export const DEFAULT_SUBJECT_EMOJI = "📚";
export const DEFAULT_TOPIC_EMOJI = "📂";

// ── Trackers ───────────────────────────────────────────────────────────
// Marker lines used to delimit the plugin-managed region inside the daily
// template's frontmatter block and its ```almanac widget block. Both are
// plain "# " comments — YAML treats them as comments in frontmatter, and
// widgets.ts already strips any fenced-block line starting with "#", so
// the same marker text works, unmodified, in both places.
export const TRACKER_MARK_START = "# almanac:trackers:start";
export const TRACKER_MARK_END = "# almanac:trackers:end";

// The derived Sleep tracker's property/column key. Referenced by the sync
// (Diary.base column), the widget (readout) and the derived-value writer.
export const SLEEP_TRACKER_ID = "Sleep";

// ── Special events ─────────────────────────────────────────────────────
// The frontmatter key holding the event list in the events note, and the key
// stamped into a diary entry naming the events that fell on its date.
//
// The list key is namespaced (`almanac-events`) because it is plugin-managed
// structured data and a collision with a user's own `events` property would be
// destructive. The per-entry key is the bare `events` precisely because it is
// *not* plugin-managed after it's written — it's there for the user to query in
// Bases or decorate the page with, so it gets the obvious name.
export const EVENTS_PROPERTY = "almanac-events";
export const ENTRY_EVENTS_PROPERTY = "events";

// The frontmatter property a journal LEAF note carries its date in.
//
// Named here in 3.8 because two places have to agree about it and until now
// only one of them read it: `readJournalIndex` has always used it as its
// `dateKey`, and `bridgeCatalogue` decided whether a kind was dated by
// asserting that its template writes one. Now that the second reads the
// templates instead of asserting about them, the two are asking one question
// and a literal in each would be two places to change it.
//
// The bare word, unlike the diary's `journal-date`, and deliberately: a journal
// note is the reader's own document and its properties are ones they will query
// in Bases, so the obvious name wins — the same argument
// `ENTRY_EVENTS_PROPERTY` makes two lines up.
export const JOURNAL_DATE_PROPERTY = "date";

// The body region quick capture appends to. Its own key rather than `log` or
// `attachments`: captures are raw fragments, `log` is prose written on purpose,
// and `attachments` is counted-not-searchable by the diary index — putting
// text there would make it invisible to search.
export const CAPTURE_NOTE_KEY = "capture";

// The body region a LOGBOOK's items live in (4.52).
//
// ONE CONSTANT, NOT ONE KEY PER LOGBOOK, and the id is why. `logbook:work`
// names a NOTE — `02 - Diary/Logbooks/Work log.md` — and reads the region
// inside it; the id is not a region key and must never become one. A key made
// from the id would have to survive `isValidNoteKey` for a word a reader typed,
// and would orphan the whole region the day that id was corrected.
//
// It also means the widget asks one question of any note it is pointed at
// ("what is in your logbook region"), which is what lets `logbook:work` sit on
// the homepage and on `Work log.md` itself and mean the same thing in both.
export const LOGBOOK_NOTE_KEY = "logbook";

// The directive that draws one. Named beside the region it reads for the reason
// `JOURNALS_DIRECTIVE` is named at all: three modules have to agree on the word
// — the dispatch switch, the widget registry and the plain-markdown export —
// and a literal in each is three places a rename has to land.
//
// THE SAME STRING AS THE REGION KEY, AND THAT IS A COINCIDENCE WORTH NAMING.
// They are two facts — what the fence says, and what the comment in the body
// says — that happen to be spelled alike because both are "logbook". Keeping
// them as two constants is what lets either move without the other.
export const LOGBOOK_KEYWORD = "logbook";

// Default faces for a scale picker, low → high, mapped across the tracker's
// min..max range. Editable per-vault in Settings → Trackers (any scale row).
// Named DEFAULT_MOOD_FACES for history; it is the default for every scale
// built-in, not just Mood.
export const DEFAULT_MOOD_FACES = ["😞", "😕", "😐", "🙂", "😄"];
// A distinct face set for Energy, so an enabled Mood + Energy don't render two
// identical emoji rows the eye can't tell apart at a glance.
export const DEFAULT_ENERGY_FACES = ["🪫", "😴", "😐", "🙂", "⚡"];
export const DEFAULT_FOCUS_FACES = ["🌫️", "😵‍💫", "😐", "🎯", "🧠"];

// The built-in trackers, in the canonical order they always render (in
// Settings and in the note): the three diary scales, the sleep trio, then the
// two journal built-ins. Unlike a custom tracker, a built-in's id/type/range are fixed and it
// can't be deleted — only turned on or off (Sleep is governed by
// settings.sleepEnabled). Mood additionally owns the heat-map + face settings.
//
// All of them sit on the daily diary surface, and that is locked too: each
// measures a day (see normalizeTrackers). The surface dropdown is therefore
// absent from the built-in rows rather than present-but-disabled — there is no
// second answer to offer.
//
// These reproduce the plugin's original hard-coded Mood/Wake/Bed fields, plus
// the new coupled Sleep value derived from Wake-Up + Bedtime.
export const DEFAULT_TRACKERS: TrackerDef[] = [
  {
    id: "Mood",
    label: "☀️ Mood",
    type: "scale",
    min: 1,
    max: 5,
    step: 1,
    builtin: "mood",
    heatmap: true,
    faces: [...DEFAULT_MOOD_FACES],
    surface: { kind: "diary", classes: ["daily"] },
    showInTemplate: true,
    showInBase: true,
  },
  {
    id: "Energy",
    label: "⚡ Energy",
    type: "scale",
    min: 1,
    max: 5,
    step: 1,
    builtin: "energy",
    faces: [...DEFAULT_ENERGY_FACES],
    surface: { kind: "diary", classes: ["daily"] },
    // Ships defined but off: the scale family exists so these are one toggle
    // away, not so every vault gets three emoji rows it didn't ask for. Mood
    // is the one that ships enabled, exactly as before.
    showInTemplate: false,
    showInBase: false,
  },
  {
    id: "Focus",
    label: "🎯 Focus",
    type: "scale",
    min: 1,
    max: 5,
    step: 1,
    builtin: "focus",
    faces: [...DEFAULT_FOCUS_FACES],
    surface: { kind: "diary", classes: ["daily"] },
    showInTemplate: false,
    showInBase: false,
  },
  {
    id: "Wake-Up",
    label: "😴 Wake-Up",
    type: "time",
    builtin: "wake",
    surface: { kind: "diary", classes: ["daily"] },
    showInTemplate: true,
    showInBase: true,
  },
  {
    id: "Bedtime",
    label: "🌙 Bedtime",
    type: "time",
    builtin: "bed",
    surface: { kind: "diary", classes: ["daily"] },
    showInTemplate: true,
    showInBase: true,
  },
  {
    id: SLEEP_TRACKER_ID,
    label: "🛌 Sleep",
    type: "number",
    unit: "h",
    min: 0,
    max: 24,
    step: 0.5,
    builtin: "sleep",
    derived: true,
    // No input widget — computed from Wake-Up + Bedtime on write. It only
    // needs to exist as a column + chartable property, so it never goes in the
    // daily widget block.
    surface: { kind: "diary", classes: ["daily"] },
    showInTemplate: false,
    showInBase: true,
  },
  // ── the journal built-ins ────────────────────────────────────────────
  // `typeId: null` — every registered journal, including one created
  // tomorrow. That is the whole of "a new custom journal gets confidence and
  // status": no seeding, no per-type copies, and no two registry entries
  // sharing an id (which the registry cannot represent, since the id is the
  // frontmatter property and getTracker's key at once).
  //
  // Neither is seeded onto a template or a Diary.base column — both flags are
  // diary-only and normalizeTrackers forces them off here. Placement is the
  // template's, which is why the four study templates carry the directives
  // directly.
  {
    id: "confidence",
    label: "🎯 Confidence",
    type: "number",
    min: 1,
    max: 5,
    step: 1,
    builtin: "confidence",
    // A `number`, not a `scale`, and the choice is load-bearing rather than
    // conservative. A 1–5 bounded ordinal is exactly what `scale` is for and
    // the face picker would suit it — but `scale` also carries the diary
    // calendar's heat map, whose source reads paths.diaryDaily. A journal
    // tracker promoted to source it would colour a calendar it can never
    // supply a value to. settings-editors.ts refuses that promotion anyway;
    // choosing `number` means the built-in doesn't depend on the guard holding.
    surface: { kind: "journal", typeId: null },
    showInTemplate: false,
    showInBase: false,
  },
  {
    id: "accuracy",
    label: "✔️ Accuracy",
    type: "number",
    min: 1,
    max: 5,
    step: 1,
    builtin: "accuracy",
    // Confidence's sibling, and deliberately not Confidence.
    //
    // Both are written by grading a Recall deck and both are 1–5, which is
    // exactly why they were one property until 2.36 and exactly why that was
    // wrong. A Lesson's rating answers *did I remember this*; a Practice
    // note's answers *did I get these right*. Averaging the two gives a number
    // per topic that means neither — and `topics-table`'s column,
    // `confidence-summary` and `journal-breakdown` were all averaging them,
    // because `confidenceKinds` returned every kind of the type. Item 1's
    // whole case was that a comparison across topics finally compares
    // something measured; half the measurements were a different measurement.
    //
    // A second `typeId: null` singleton rather than a per-type copy, for the
    // reason every journal built-in is one: the id is the frontmatter key, the
    // `tracker:` argument and getTracker's key at once, so it has to be
    // globally unique. Which *kinds* carry it is said on the kind (see
    // JournalKind.trackers), which is where that knowledge actually lives.
    surface: { kind: "journal", typeId: null },
    showInTemplate: false,
    showInBase: false,
  },
  {
    id: "reviewed",
    label: "🔁 Last reviewed",
    type: "date",
    builtin: "reviewed",
    // The one stamp the review queue reads. A built-in rather than a property
    // the queue writes on its own authority, for the reason the other two are:
    // the name is load-bearing outside the registry (review.ts computes a due
    // date from it), so it is locked, and being `typeId: null` means every
    // journal type has it — including one created after this shipped.
    //
    // Absent means "never reviewed", which is the correct starting state for
    // every note that already exists, and is why this needs no migration.
    surface: { kind: "journal", typeId: null },
    showInTemplate: false,
    showInBase: false,
  },
  {
    id: "status",
    label: "📌 Status",
    type: "select",
    // One vocabulary for every level. Before this, leaves carried
    // in-progress/completed and index notes active/paused/done — two
    // vocabularies one TrackerDef cannot hold, since it has one `options`
    // string and there is no per-kind axis. Unified this way (rather than the
    // other) because it keeps `status != "completed"` working verbatim in both
    // `base` blocks on the topic template, and gives leaves the pause state
    // the indexes had. The cost is cosmetic: an index note now reads
    // "In Progress" where it used to read "Active".
    options: "in-progress=In Progress,paused=Paused,completed=Completed",
    builtin: "status",
    surface: { kind: "journal", typeId: null },
    showInTemplate: false,
    showInBase: false,
  },
  {
    // See the note under this list for why this one is here, and what `any`
    // buys that a diary surface with every grain ticked would not.
    id: "tags",
    label: "Tags",
    type: "tags",
    builtin: "tags",
    surface: { kind: "any" },
    showInTemplate: false,
    showInBase: false,
  },
];

// THE GLOBAL BUILT-IN. Tags is the only one whose surface is `any`, and the
// only one whose value is a list — see `trackers/tags.ts` for why it is a
// tracker at all (an Obsidian tag inside a fence is not a tag, and this plugin
// fences everything).
//
// `showInTemplate: false` and nothing seeds it: it exists in every vault, on
// every note, and appears where a reader puts it. That is the same shape
// Energy and Focus ship in — present, off, one tap away from "+ Add tracker" —
// and it is what "global but not automatic" means here. `showInBase` is false
// and forced: a list is not a column.
// Canonical render/normalise order for the built-ins: the three scales, then
// the sleep trio.
export const BUILTIN_ORDER: BuiltinKind[] = [
  "mood",
  "energy",
  "focus",
  "wake",
  "bed",
  "sleep",
  "confidence",
  "accuracy",
  "status",
  "reviewed",
  // Last, because the order is read as a list in Settings and this is the one
  // that belongs to no grain and no journal type. The diary trio, then the
  // sleep trio, then the journal pair, then the one that is everywhere.
  "tags",
];

// A fresh copy of a built-in's fixed definition, by kind. Used to inject a
// missing built-in and to re-assert its locked fields (type, derived) during
// normalisation, without disturbing the user's on/off + Mood settings.
export function builtinTemplate(kind: BuiltinKind): TrackerDef {
  const def = DEFAULT_TRACKERS.find((t) => t.builtin === kind);
  if (!def) throw new Error(`No built-in template for kind: ${kind}`);
  return { ...def, faces: def.faces ? [...def.faces] : undefined };
}

// ── Logbooks ──────────────────────────────────────────────────────────
//
// The diary's third layer. An ENTRY says what a day was like; an EVENT says
// what a day is; a LOGBOOK holds what belongs to the diary and to no single day
// — a work log, what you are focused on now, links to come back to, the
// meetings ahead.
//
// A REGISTRY RATHER THAN FOUR FEATURES, on the argument `DEFAULT_TRACKERS` and
// `customJournals` already make twice over: the four below are instances of one
// thing, and a reader who keeps a fifth kind of list should not need a release.

export interface LogbookDef {
  // The `logbook:` directive's argument, and the def's identity. A slug,
  // assigned once and never rewritten — the same contract `EventDef.id` has and
  // for the same reason: it is written into notes, where an opaque hash would
  // be unreadable and a renamed one would silently unhook every widget.
  id: string;
  // What the note is called and what the widget's bar says. A LABEL, freely
  // retyped, which is exactly why it is not what `path` is derived from.
  name: string;
  // An emoji, on `FlatSection.icon`'s idiom and `WidgetSpec.glyph`'s — a list
  // that mixed emoji with Lucide ids would draw two sizes of one slot.
  icon: string;
  // Where the items come from.
  //
  //   `region` — the note's own `<!--almanac:logbook-->` block, which is where
  //   a reader's own logbook keeps its items.
  //
  //   `events` — the events note, filtered to the ones carrying a time. See
  //   `Meetings` below: a meeting is a dated fact with an hour on it, and
  //   `EventDef` has modelled dated facts, painted them on the calendar and
  //   listed them in the agenda since 2.20. A second store of dated things the
  //   calendar knows nothing about is the failure this avoids.
  source: "region" | "events";
  // The note. STORED, NOT DERIVED FROM `name`, which is the one place logbooks
  // depart from the folder-note convention every dashboard in this plugin
  // follows. A folder note is derived because the FOLDER is the identity; here
  // the ID is, and the name is a label. Derived, retitling "Work log" to "Work"
  // would orphan the note; stored, the note keeps its items and PathWatch moves
  // the string when the file moves in the explorer.
  path: string;
  // One sentence, shown in the empty state and in the settings row. Optional
  // because a reader's own logbook needs no blurb to work, and absent draws
  // nothing rather than a placeholder.
  blurb?: string;
  // Which swatch this book's items wear on the time grid. One of
  // `EVENT_COLORS`. 4.55.
  //
  // THE EVENT PALETTE, NOT A SECOND ONE. The grid draws events and logbook
  // items side by side, and two colour systems in one view would be two designs
  // in one view. The eight are already picked for legibility in both themes,
  // and the stored value is the NAME — a hex here would let a reader choose
  // something unreadable in one of them, which is the argument `EVENT_COLORS`
  // makes in its own comment.
  //
  // A COLOUR AND AN ICON, WHICH IS ONE DECORATION EACH FOR TWO SURFACES: the
  // icon names the book in a list, where a coloured square would be a dot
  // beside an emoji; the colour tells its items apart on a grid, where an emoji
  // in an 11px block would be most of the block.
  color: string;
}

// The four that ship. Every one of them is editable and removable; what they
// are is a starting vocabulary, not a fixed set.
export const DEFAULT_LOGBOOKS: LogbookDef[] = [
  {
    id: "work",
    name: "Work log",
    icon: "💼",
    source: "region",
    path: `${DEFAULT_PATHS.logbooks}/Work log.md`,
    color: "teal",
    blurb: "What you worked on, stamped with when — across days, not inside one.",
  },
  {
    // "CURRENT FOCUS", NOT "FOCUS", AND IT IS A COLLISION RATHER THAN A
    // FLOURISH: `DEFAULT_TRACKERS` ships a built-in `Focus`, a 1-5 daily scale
    // with its own faces. Two things called Focus in one settings tab is
    // `vocabulary.ts`'s opening complaint at reader scale. The name is a
    // setting, so this is a default and not a decree.
    id: "focus",
    name: "Current focus",
    icon: "🎯",
    source: "region",
    path: `${DEFAULT_PATHS.logbooks}/Current focus.md`,
    color: "green",
    blurb: "What you are working towards now, and when that changed.",
  },
  {
    id: "review",
    name: "Review links",
    icon: "🔗",
    source: "region",
    path: `${DEFAULT_PATHS.logbooks}/Review links.md`,
    color: "grey",
    blurb: "Things to come back to, crossed off when you have.",
  },
  {
    id: "meetings",
    name: "Meetings",
    icon: "🗓️",
    source: "events",
    path: `${DEFAULT_PATHS.logbooks}/Meetings.md`,
    color: "blue",
    blurb: "Everything scheduled ahead, from the events note, soonest first.",
  },
];

// Seed map for the built-in Study journal type. Matched case-insensitively
// (see journal.ts's lookupEmoji) against a folder name at *either* level —
// Subject or Topic — since a folder only needs one emoji regardless of
// which level it lives at. Prior to 1.8.0 this was two separate maps (one
// per level); they merged cleanly (no overlapping names) into this single
// list, which is what Settings → Journal types now edits as one textarea.
// Unknown names fall back to DEFAULT_SUBJECT_EMOJI (top level) / DEFAULT_
// TOPIC_EMOJI (nested) — fully editable in settings either way.
export const DEFAULT_FOLDER_EMOJIS: Record<string, string> = {
  // former subject-level entries
  Development: "💻",
  Programming: "💻",
  Mathematics: "📐",
  Math: "📐",
  Science: "🔬",
  Physics: "🔭",
  Chemistry: "⚗️",
  Biology: "🧬",
  History: "📜",
  Geography: "🗺️",
  Languages: "🗣️",
  Language: "🗣️",
  Music: "🎵",
  Art: "🎨",
  Design: "🎨",
  Writing: "✍️",
  Philosophy: "🧠",
  Psychology: "🧠",
  Business: "💼",
  Finance: "💰",
  Economics: "📈",
  Health: "🩺",
  Fitness: "🏋️",
  Cooking: "🍳",
  // former topic-level entries
  Linux: "🐧",
  Python: "🐍",
  JavaScript: "🟨",
  TypeScript: "🔷",
  Java: "☕",
  Rust: "🦀",
  Go: "🐹",
  Docker: "🐳",
  Kubernetes: "☸️",
  Git: "🔧",
  SQL: "🗃️",
  React: "⚛️",
  Networking: "🌐",
  Security: "🔒",
  Algebra: "➗",
  Geometry: "📐",
  Calculus: "∫",
  Statistics: "📊",
  Trigonometry: "📐",
};

// Directives this plugin used to ship and no longer does.
//
// Two jobs, and the second is the one that matters.
//
// The renderer stops shouting `Unknown Almanac widget` at a note that is not
// broken but merely old — `year-nav` was not a typo, it was retired into the
// Yearly Overview banner in 2.52, and a red error with no hint of what replaced
// it is the worst of both. And `layout.ts` reads this to know which stray
// directives are plugin debris it may remove, as against user-added widgets it
// must never touch.
//
// It also makes retiring a directive a decision with a cost attached. `year-nav`
// was deleted in one commit with no thought for the notes carrying it, which was
// fine under "no userbase" and produced a red error in the developer's own vault
// within the hour.
//
// THIS IS NOT A COMPATIBILITY LAYER. 2.41 deleted the pre-userbase one on
// purpose. An entry holds a name and a sentence, never a shim, and is deletable
// once no plausible vault still carries the directive — a release or two, not
// forever. "We already have somewhere to put retired things" is precisely how
// the layer 2.41 removed gets rebuilt one entry at a time.
export const RETIRED_WIDGETS: Record<string, { since: string; note: string }> = {
  "year-nav": {
    since: "2.52",
    note: "moved into the Yearly Overview banner",
  },
  // THREE REPLACEMENTS THAT NEVER REMOVED WHAT THEY REPLACED (3.11 §7.1).
  // Each of these has had a successor for at least a release, each successor
  // is what every shipped note actually carries, and each original went on
  // dispatching — which is how `confidence-summary` came to be a documented
  // widget no template writes and no catalogue offers.
  "confidence-summary": {
    since: "3.11",
    note: "replaced by the stats band, which states the same numbers as a band",
  },
  nav: {
    since: "3.11",
    note: "folded into entry-header",
  },
  // NEVER USED BY ANY SHIPPED NOTE, which is the unusual part and the reason
  // this one is worth a sentence. `buildCalendarRegion`'s comment claimed both
  // spellings were "still used by the review dashboards"; no dashboard has
  // ever contained either. The monthly dashboard's day grid and year grid are
  // drawn inside `month-summary`, and the homepage's calendar is `diary:N` —
  // which shares the builder and is NOT retired.
  calendar: {
    since: "3.11",
    note: "the diary calendar is drawn by diary: on the homepage and by month-summary on the dashboard",
  },
  // `topics-table` IS NOT HERE, AND 4.16 §3 IS THE ARGUMENT FOR THAT. It was
  // replaced by `level-index` and every Subject index note in every vault still
  // carries the word — which is exactly the shape this table cannot hold. An
  // entry here is an instruction to `planLayout`: repair emits "remove
  // <keyword>" for anything named in it, so retiring a word that still renders
  // would have repair delete a working table out of a reader's note on its next
  // run. The test one file over states the rule in those words.
  //
  // A SUPERSEDED SPELLING THAT STILL DRAWS BELONGS IN `NOT_PAGE_WIDGETS` AS AN
  // `alias`, which is where `confidence-trend` already sits for the same reason
  // in the same words — "kept because it sits in shipped Topic notes".
};

// ── Obsidian's own DOM, named once ────────────────────────────────────────

// Class names OBSIDIAN owns and Almanac only reads.
//
// WHY A TABLE FOR EIGHT STRINGS USED IN ONE FILE. Every one of them is
// load-bearing, and one of them being wrong has already cost a release:
// `markdown-rendered` is the note's container in reading view AND the container
// of a single code-block widget inside `.cm-embed-block`, so treating it as
// "the note" made every fence in Live Preview see only itself — a section's
// scope stopped at its own ```almanac block, and folding stopped with it.
//
// The plugin's entire section system is derived from block-level sibling walks
// over these containers. So the question worth being able to answer cheaply is
// "what breaks if Obsidian renames a container class", and today that is
// answered by grepping string literals across a 1,300-line file. It should be
// answered by reading one table.
//
// IT BUYS NOTHING ELSE, and that is worth stating plainly: this is a pure move
// with no behaviour attached. It is the pattern `RETIRED_WIDGETS`,
// `MANAGED_ARGS` and `STUDY_COMPOSED` already use — a fact that must hold in
// several places, written once, with a test whose only job is to notice a
// second copy appearing.
//
// THE ENTRIES ARE GROUPED BY WHOSE QUESTION THEY ANSWER, because they are not
// interchangeable strings:
//
//   - `noteContainer` — the four containers whose children are a note's blocks.
//     Reading view has one spelling, Live Preview two, and the fourth is the
//     ambiguous one described above.
//   - `widgetWrapper` — the exclusion that disambiguates `markdownRendered`.
//   - `editorLine` — a Live Preview source line. Never hidden by a fold and
//     still a member of its section, which is the one place the fold walk and
//     the paint pass disagree on purpose.
//   - `viewChrome` — the leaf's own furniture, which is NOT part of the
//     document: Obsidian makes it once per leaf and reuses it across file
//     switches, so a class written onto it outlives the note that wrote it.
export const OBSIDIAN_DOM = {
  previewSection: "markdown-preview-section",
  cmSizer: "cm-sizer",
  cmContent: "cm-content",
  markdownRendered: "markdown-rendered",
  widgetWrapper: "cm-embed-block",
  editorLine: "cm-line",
  viewFooter: "mod-footer",
  viewUi: "mod-ui",

  // Heading markers, and THE THREE §5's SURVEY MISSED. It named eight class
  // names by grepping string literals; these three are written inside regexes,
  // so they did not turn up — and they are exactly as load-bearing as the
  // containers. Without them a section in Live Preview ran straight through the
  // note's own headings, which is the one boundary the fold rule says it must
  // respect: a bar titles a widget section, a heading is the note's structure.
  //
  // Not containers, so they answer a different question — "how do I recognise a
  // heading on each surface" rather than "whose children are the note's
  // blocks" — but they are Obsidian's names and they belong in Obsidian's
  // table.
  readingHeadingWrapper: "el-h", // el-h1 … el-h6, reading view
  editorHeading: "HyperMD-header",
  editorHeadingLevel: "cm-header",
} as const;
