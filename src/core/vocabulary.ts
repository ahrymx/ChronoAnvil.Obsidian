// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The words a reader sees.
//
// WHY THIS FILE EXISTS
//
// Almanac asks a reader to learn nine nouns before they can create one note —
// journal, level, kind, layout, section, tracker, scope, event, page — and
// three of them contradicted each other:
//
//   `type` meant two things, and the frontmatter said the wrong one. A
//   JournalType was "Cook Book"; a JournalKind was "Recipe"; and the key on
//   every note was `type:`, holding the KIND id. So a reader taught "Cook Book
//   is a journal type" in Settings opened a note and read `type: recipe` —
//   the word meaning the other thing, in the place they see it most often.
//
//   `page` was a specific thing (the sub-notes a long note splits across,
//   deliberately excluded from kinds) and also the obvious English word for a
//   note. 2.54.4 needed a test forbidding the loose use in one confirmation
//   window, and needing a test to stop a word drifting is the word telling you
//   it is fighting you.
//
//   `level` and `section` were both "the parts of a thing". A level is a
//   folder depth, a section is a block in a template, and in conversation both
//   become "section" — which is how a bug report about one arrives describing
//   the other.
//
// THE FIX, AND THE HALF THAT IS FREE
//
// A container is a JOURNAL. A note within it is a NOTE TYPE. That makes the
// frontmatter correct rather than contradictory — `type: recipe` is a note
// type — and it needs no migration at all, because the key does not move.
//
// The alternative was renaming the key to `kind:`, which touches every note in
// every vault AND leaves the reader-facing collision standing unless the labels
// change too. So: change the labels, keep the key. Do the free half.
//
// WHAT THIS FILE IS NOT
//
// Not a translation layer, and not a place to put strings. Sentences belong at
// the site that shows them, where their surrounding context is visible. This
// holds the NOUNS only — the handful of words that must be the same in every
// sentence — so that a fourth name for one of them cannot appear without
// editing the file whose whole purpose is preventing that.
//
// Code identifiers deliberately keep their old names. `JournalKind` is still
// `JournalKind`; renaming it touches nine files for no behaviour, and 2.54.8
// established the cheaper pattern when the same thing happened to "variant":
// admit the mapping in one comment, and test the strings.

// ── the containers ────────────────────────────────────────────────────

// A folder tree with its own homepage section, commands and templates.
// `JournalType` in code.
export const JOURNAL = "journal";
export const JOURNALS = "journals";
export const JOURNAL_TITLE = "Journal";
export const JOURNALS_TITLE = "Journals";

// ── the notes ─────────────────────────────────────────────────────────

// What a note is: "Recipe", "Lesson". `JournalKind` in code, and the value of
// the `type:` frontmatter key — which is the whole point of the rename.
export const NOTE_TYPE = "note type";
export const NOTE_TYPES = "note types";
export const NOTE_TYPE_TITLE = "Note type";
export const NOTE_TYPES_TITLE = "Note types";

// ── the structure ─────────────────────────────────────────────────────

// A depth in the folder tree. Qualified, because bare "level" collides with
// "section" in conversation — both being "the parts of a thing".
export const FOLDER_LEVEL = "folder level";
export const FOLDER_LEVELS = "folder levels";

// A block in a template. Unchanged; it has no competitor now that levels are
// qualified.
export const SECTION = "section";
export const SECTIONS = "sections";

// A saved arrangement of sections, offered when creating a note. Unified in
// 2.54.8 after shipping as three words at once; see modals.ts.
export const LAYOUT = "layout";
export const LAYOUTS = "layouts";
export const LAYOUT_TITLE = "Layout";

// A sub-note of a long note. Unchanged and RESERVED: this word means only this,
// and "a note that gets created" is a note.
export const PAGE = "page";
export const PAGES = "pages";

// A standing note that collects items belonging to the diary but not to one
// date — a work log, what you are focused on, links to come back to, the
// meetings in the week ahead. `LogbookDef` in code, and the argument of the
// `logbook:` directive.
//
// THE NOUN IS `logbook` BECAUSE `log` IS ALREADY THE VERB (4.52), and this is
// the collision this file exists to catch rather than one it missed.
// `button:log:<trackerId>:<delta>` has logged a tracker VALUE since 2.56 and is
// written into shipped notes; a `log:` directive beside it would put one word in
// the grammar twice, meaning an action in one place and a container in the
// other. That is `type` meaning two things, exactly, and the fix here was free
// where `type`'s was not: nothing had shipped yet, so the new thing took the
// word that was still available.
//
// A logbook's ITEMS are entries in the ordinary English sense and are never
// called entries in a reader-facing string: an ENTRY is a dated diary note, and
// that word is spoken for. They are items.
export const LOGBOOK = "logbook";
export const LOGBOOKS = "logbooks";
export const LOGBOOK_TITLE = "Logbook";
export const LOGBOOKS_TITLE = "Logbooks";

// ── retired ───────────────────────────────────────────────────────────

// The words that must not appear in a reader-facing string again, and what to
// say instead. Read by test/vocabulary.test.ts, which is the only thing that
// makes any of the above stick — the words drifted three ways inside a single
// release without one.
export const RETIRED_WORDS: { was: string; use: string }[] = [
  { was: "journal type", use: JOURNAL },
  { was: "note kind", use: NOTE_TYPE },
  { was: "note kinds", use: NOTE_TYPES },
  // Retired in 2.57.6, when the diary gained five grains and every one of them
  // became an ENTRY. "Review" described what you do with a monthly note rather
  // than what it is, and it could not survive the other four: nobody calls a
  // daily note a daily review.
  //
  // REGISTERED AS PHRASES, NOT AS THE BARE WORD. "Review" is alive and correct
  // elsewhere — the review queue, the review scopes, `src/review/`, and the
  // Review section on a Study topic all mean the activity. Retiring the word
  // outright would have banned four legitimate things to catch one dead one,
  // which is how a vocabulary registry earns a reputation for being in the way.
  { was: "daily review", use: "daily entry" },
  { was: "weekly review", use: "weekly entry" },
  { was: "monthly review", use: "monthly entry" },
  { was: "quarterly review", use: "quarterly entry" },
  { was: "yearly review", use: "yearly entry" },
  // 3.3.1. The five phrases above are correct and were not enough: every
  // string that survived the 2.57.6 pass used the BARE word for the retired
  // meaning — "Start the review", "0/3 reviews", "New Review", "this month's
  // review" — and none of them contains the phrase "monthly review". The
  // registry caught what it was asked to catch.
  //
  // Banning the bare word is still wrong, for the reason written above: it
  // would take the review queue, the review scopes and a Study topic's Review
  // section with it. So the surviving PHRASES are registered instead, which is
  // the same rule applied to the cases that were missed rather than a new one.
  { was: "start the review", use: "start the entry" },
  { was: "new review", use: "new monthly entry" },
  { was: "this month's review", use: "this month's entry" },
  { was: "review entry", use: "entry" },
];
