// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Body-backed storage for `note:` and `tasks:` widgets.
//
// A widget renders its controls up top (where its ```almanac fence sits) but
// persists its content into the note *body*, wrapped inside a single HTML
// comment:
//
//   <!--almanac:focus
//   whatever the user typed
//   -->
//
// Storing the content *inside* one HTML comment (rather than between two
// separate marker comments) means Obsidian never renders it in either Reading
// mode or Live Preview — comments are dropped natively — so there's no need for
// any plugin-side hiding (no CM6 decoration, no post-processor). The widget is
// the sole reader/writer; the raw file still carries the content in plain text,
// just parked in a comment, so it survives without the plugin.
//
// The functions here are pure string transforms over a file's text so they can
// be unit-tested without a vault. The App-facing read/write wrappers live in
// widgets.ts and call vault.process (atomic read-modify-write) with these.

// Region keys are author-controlled (from the `note:<key>` / `tasks:<key>`
// directive), so keep them to a safe, predictable charset. This both prevents a
// key from smuggling regex metacharacters into the matcher and keeps the on-disk
// markers tidy.
export function isValidNoteKey(key: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(key);
}

function openMarker(key: string): string {
  return `<!--almanac:${key}`;
}

const CLOSE_MARKER = "-->";

// A comment can be closed early by a literal `-->` inside user content, which
// would corrupt everything after it. The widget is the only writer, so sanitize
// on write: split the sequence so it can't terminate the comment. Decoded on
// read. Chosen to be visually unobtrusive and reversible.
const ESCAPED_CLOSE = "--\u200b>"; // zero-width space between the dashes and >
function escapeContent(value: string): string {
  return value.split("-->").join(ESCAPED_CLOSE);
}
function unescapeContent(value: string): string {
  return value.split(ESCAPED_CLOSE).join("-->");
}

// Locate the region for `key`: returns the [start, end) slice covering the whole
// comment (from `<!--almanac:key` through its closing `-->`), plus the inner
// content offsets, or null if absent/unterminated.
interface RegionMatch {
  blockStart: number;
  blockEnd: number;
  contentStart: number;
  contentEnd: number;
}
function findRegion(fileText: string, key: string): RegionMatch | null {
  const open = openMarker(key);
  const start = fileText.indexOf(open);
  if (start === -1) return null;
  // The opener must be followed by end-of-string, whitespace, or a newline —
  // so `almanac:todo` doesn't match a key like `almanac:todo2`.
  const afterKey = fileText.charAt(start + open.length);
  if (afterKey !== "" && !/\s/.test(afterKey)) return null;
  const contentStart = start + open.length;
  const end = fileText.indexOf(CLOSE_MARKER, contentStart);
  if (end === -1) return null;
  return {
    blockStart: start,
    blockEnd: end + CLOSE_MARKER.length,
    contentStart,
    contentEnd: end,
  };
}

// Read the content stored for `key`. Returns "" when the region is absent or
// empty. One bounding newline on each side (the markers sit on their own lines)
// is trimmed, and escaped `-->` sequences are decoded, so a round-trip of a
// value is stable.
export function readNoteRegion(fileText: string, key: string): string {
  const r = findRegion(fileText, key);
  if (!r) return "";
  let inner = fileText.slice(r.contentStart, r.contentEnd);
  if (inner.startsWith("\n")) inner = inner.slice(1);
  if (inner.endsWith("\n")) inner = inner.slice(0, -1);
  return unescapeContent(inner);
}

// Whether a region holds anything the reader would miss.
//
// THE ONE DEFINITION OF "EMPTY", for both halves of the vault. Journal sections
// have refused removal on this condition since 2.59.7 and entry sections do
// since 2.60.3; two spellings of "is there anything in here" would be two
// answers waiting to disagree about a stray space.
//
// WHITESPACE-ONLY COUNTS AS EMPTY, deliberately. Every region ships as a
// marker, a blank line and a closing marker — that blank line is where the
// reader's first keystroke goes — so a byte test would refuse to remove a
// section nobody has ever touched, which is exactly the section someone most
// wants gone.
export function regionHasContent(fileText: string, key: string): boolean {
  return readNoteRegion(fileText, key).trim() !== "";
}

// Every Almanac body region in a file, in document order, as `{key, content}`
// pairs. Where `readNoteRegion` looks up one *known* key, this discovers keys —
// needed by the folder-scoped tasks-table, which aggregates task regions across
// notes it didn't author and so can't name the keys ahead of time. Content is
// decoded and bounding-newline-trimmed exactly as `readNoteRegion` returns it.
// Malformed keys and unterminated comments are skipped.
export function allNoteRegions(
  fileText: string
): { key: string; content: string }[] {
  const out: { key: string; content: string }[] = [];
  const OPEN = "<!--almanac:";
  let from = 0;
  for (;;) {
    const start = fileText.indexOf(OPEN, from);
    if (start === -1) break;
    // Read the key: word chars after the prefix, bounded by the same charset
    // isValidNoteKey enforces on write.
    let i = start + OPEN.length;
    let key = "";
    while (i < fileText.length && /[A-Za-z0-9_-]/.test(fileText[i])) {
      key += fileText[i];
      i++;
    }
    // The key must be non-empty and immediately followed by end/whitespace, so
    // `<!--almanac:` with no key, or a stray colon, doesn't match.
    const after = fileText.charAt(i);
    if (key === "" || (after !== "" && !/\s/.test(after))) {
      from = start + OPEN.length;
      continue;
    }
    const end = fileText.indexOf(CLOSE_MARKER, i);
    if (end === -1) break; // unterminated — nothing after it is parseable
    let inner = fileText.slice(i, end);
    if (inner.startsWith("\n")) inner = inner.slice(1);
    if (inner.endsWith("\n")) inner = inner.slice(0, -1);
    out.push({ key, content: unescapeContent(inner) });
    from = end + CLOSE_MARKER.length;
  }
  return out;
}

// Build the on-disk comment block for a key + value.
//
// AN EMPTY REGION HAS NO BLANK LINE IN IT, and that is a bug fix rather than
// tidiness. The header above promises Obsidian never renders these because
// "comments are dropped natively" — true of a comment Obsidian parses as one
// block. `value` of "" used to produce
//
//   <!--almanac:path
//   ⟨blank⟩
//   -->
//
// and the blank line ends the HTML block early, so the opener and the closer
// both render as paragraphs of literal text. It showed up under an untouched
// Learning Path as two lines of `<!--almanac:path` and `-->` on the page —
// which is EVERY region on first use, since a region is created empty and the
// module's whole design is that no plugin-side hiding is needed.
function buildBlock(key: string, value: string): string {
  const body = escapeContent(value);
  if (body === "") return `${openMarker(key)}\n${CLOSE_MARKER}`;
  return `${openMarker(key)}\n${body}\n${CLOSE_MARKER}`;
}

// Write `value` into the region for `key`, returning the new file text. Replaces
// an existing region in place, else appends a new one (preceded by a blank line).
// Idempotent: writing the same value yields identical text.
export function writeNoteRegion(
  fileText: string,
  key: string,
  value: string
): string {
  const block = buildBlock(key, value);
  const r = findRegion(fileText, key);
  if (r) {
    return fileText.slice(0, r.blockStart) + block + fileText.slice(r.blockEnd);
  }
  // Absent: append. Guarantee exactly one blank line before the new block, and
  // preserve a single trailing newline at end of file.
  const trimmed = fileText.replace(/\s*$/, "");
  const sep = trimmed.length === 0 ? "" : "\n\n";
  return `${trimmed}${sep}${block}\n`;
}

// Append a block of text to the end of `key`'s region, creating the region if
// it doesn't exist yet. Pure, so the exact spacing behaviour is testable.
//
// This is the write path for quick capture, and it is deliberately an append
// rather than a read-then-write-whole-value: a capture must never depend on
// having first read the region into memory, because that read-modify-write
// window is exactly where a concurrent edit gets clobbered. Callers run this
// inside `vault.process`, which serialises it against every other body write.
//
// Existing content is separated from the new block by exactly one blank line,
// so successive captures read as distinct entries rather than one run-on
// paragraph. Appending to an empty region yields just the block, with no
// leading blank line.
export function appendToNoteRegion(
  fileText: string,
  key: string,
  addition: string
): string {
  const body = addition.replace(/\s+$/, "");
  if (!body) return fileText;
  const current = readNoteRegion(fileText, key).replace(/\s+$/, "");
  const next = current.length === 0 ? body : `${current}\n\n${body}`;
  return writeNoteRegion(fileText, key, next);
}

// Ensure every key in `keys` has a (possibly empty) region, appending any that
// are missing in the given order. Used once when a widget first renders so the
// raw body carries a stable anchor. Returns the new text, or null if nothing
// changed (so callers can skip a write).
export function ensureNoteRegions(
  fileText: string,
  keys: string[]
): string | null {
  let text = fileText;
  let changed = false;
  for (const key of keys) {
    const r = findRegion(text, key);
    if (!r) {
      text = writeNoteRegion(text, key, "");
      changed = true;
      continue;
    }
    // REPAIR, not just create.
    //
    // The anchors this function writes were `<!--almanac:path\n\n-->` until
    // 2.56.7 — a blank line between the markers, which ends the HTML block
    // early, so Obsidian printed both markers as literal paragraphs on the
    // page. Fixing `buildBlock` fixed what gets WRITTEN and did nothing for the
    // anchors already sitting in every note that had ever rendered a `path:`,
    // `tasks:` or `note:` widget, which is where the bug is actually visible.
    //
    // This is the hook because it already runs on render and already writes
    // when it has to. Strictly shrinking (it removes a newline), guarded on the
    // region being blank, and idempotent — so it fires once per affected note
    // and then never again, rather than being a migration anybody has to run.
    const body = text.slice(r.contentStart, r.contentEnd);
    if (body.trim() === "" && body !== "\n") {
      text = writeNoteRegion(text, key, "");
      changed = true;
    }
  }
  return changed ? text : null;
}
