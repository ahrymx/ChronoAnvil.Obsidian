// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Body-backed storage for `note:` and `tasks:` widgets.
//
// A widget renders its controls up top (where its ```chronoanvil fence sits) but
// persists its content into the note *body*, wrapped inside a single HTML
// comment:
//
//   <!--chronoanvil:focus
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

// The region key out of a region-backed directive's argument —
// `key[#variant][:placeholder]`.
//
// MOVED HERE FROM `ui/widgets/note-field.ts` IN 4.30, unchanged, and
// re-exported from there so every existing caller is untouched. It reads the
// binding between a directive and the region below it, which is this file's
// subject, and it was in the widget for the accident of the widget having
// needed it first.
//
// THE ONE SPELLING OF THAT BINDING, deliberately. The dispatch in index.ts asks
// it to tell a capture region from prose; 4.30's export asks it of every
// directive on a page to decide which region a heading is named for. A second
// copy would be two answers to "which region is this widget's" — and the export
// would then disagree with the widget about where a reader's words are.
export function noteKeyOf(rest: string): string {
  const colon = rest.indexOf(":");
  const head = (colon === -1 ? rest : rest.slice(0, colon)).trim();
  const hash = head.indexOf("#");
  return (hash === -1 ? head : head.slice(0, hash)).trim();
}

// THE MARKER THIS MODULE WRITES, and the one it still has to read.
//
// The plugin was called Almanac before the rename, and every region it wrote
// opens `<!--almanac:`. Renaming the product does not rename the notes people
// already have, and a region this module cannot find is not a cosmetic problem:
// `readNoteRegion` would return "", the widget would render empty, and the
// first save would write a *second* region beside the first — silently orphaning
// whatever the reader had typed. So writing moved to the new prefix and reading
// accepts both, permanently. `tools/migrate-vault.mjs` rewrites a vault in
// place; this fallback is what makes running it optional rather than urgent.
const OPEN_PREFIX = "<!--chronoanvil:";
const LEGACY_OPEN_PREFIX = "<!--almanac:";
const OPEN_PREFIXES = [OPEN_PREFIX, LEGACY_OPEN_PREFIX];

function openMarker(key: string): string {
  return `${OPEN_PREFIX}${key}`;
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
// comment (from `<!--chronoanvil:key` through its closing `-->`), plus the inner
// content offsets, or null if absent/unterminated.
interface RegionMatch {
  blockStart: number;
  blockEnd: number;
  contentStart: number;
  contentEnd: number;
}
function findRegion(fileText: string, key: string): RegionMatch | null {
  // Current prefix first, so a half-migrated note — one this module has already
  // rewritten once, next to a legacy region it hasn't touched — resolves to the
  // region that is being kept up to date rather than the stale one beside it.
  for (const prefix of OPEN_PREFIXES) {
    const open = `${prefix}${key}`;
    const start = fileText.indexOf(open);
    if (start === -1) continue;
    // The opener must be followed by end-of-string, whitespace, or a newline —
    // so `chronoanvil:todo` doesn't match a key like `chronoanvil:todo2`.
    const afterKey = fileText.charAt(start + open.length);
    if (afterKey !== "" && !/\s/.test(afterKey)) continue;
    const contentStart = start + open.length;
    const end = fileText.indexOf(CLOSE_MARKER, contentStart);
    if (end === -1) continue;
    return {
      blockStart: start,
      blockEnd: end + CLOSE_MARKER.length,
      contentStart,
      contentEnd: end,
    };
  }
  return null;
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

// Every ChronoAnvil body region in a file, in document order, as `{key, content}`
// pairs. Where `readNoteRegion` looks up one *known* key, this discovers keys —
// needed by the folder-scoped tasks-table, which aggregates task regions across
// notes it didn't author and so can't name the keys ahead of time. Content is
// decoded and bounding-newline-trimmed exactly as `readNoteRegion` returns it.
// Malformed keys and unterminated comments are skipped.
export function allNoteRegions(
  fileText: string
): { key: string; content: string }[] {
  const out: { key: string; content: string }[] = [];
  let from = 0;
  for (;;) {
    // Whichever prefix comes first from here, so a vault holding both spellings
    // still yields its regions in document order — the order the tasks-table
    // aggregates them in.
    let start = -1;
    let OPEN = OPEN_PREFIX;
    for (const prefix of OPEN_PREFIXES) {
      const at = fileText.indexOf(prefix, from);
      if (at !== -1 && (start === -1 || at < start)) {
        start = at;
        OPEN = prefix;
      }
    }
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
    // `<!--chronoanvil:` with no key, or a stray colon, doesn't match.
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
//   <!--chronoanvil:path
//   ⟨blank⟩
//   -->
//
// and the blank line ends the HTML block early, so the opener and the closer
// both render as paragraphs of literal text. It showed up under an untouched
// Learning Path as two lines of `<!--chronoanvil:path` and `-->` on the page —
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
  const current = readNoteRegion(fileText, key);
  return writeNoteRegion(fileText, key, joinRegionBlocks(current, body));
}

// The spacing rule for two blocks in one region: exactly one blank line
// between them, and none before the first.
//
// EXTRACTED FROM `appendToNoteRegion` IN 4.27, and the extraction is the point.
// A second caller needed the same rule — `reconcileRegionWrite` below, which
// re-attaches an appended capture on top of a field's whole-region write — and
// the alternative was spelling `${a}\n\n${b}` twice. Two spellings of one
// spacing rule is how a capture ends up with a different gap depending on which
// writer got there last, and the eight cases in `test/capture.test.ts:59-107`
// would only have been guarding one of them.
export function joinRegionBlocks(current: string, addition: string): string {
  const head = current.replace(/\s+$/, "");
  const tail = addition.replace(/\s+$/, "");
  if (!tail) return head;
  return head.length === 0 ? tail : `${head}\n\n${tail}`;
}

// What was appended to `baseline` to arrive at `onDisk`, or null if the change
// between them is not an append.
//
// WHY "IS IT AN APPEND" IS THE QUESTION. A `note:` field holds its own buffer
// after mount so it never rebuilds under the cursor, which means a second
// writer to the same region — a capture — is something the field has to be told
// about rather than something it sees. It cannot merge an arbitrary divergence:
// two writers rewriting the same prose is a conflict, and resolving one is a
// bigger decision than the release that added this. But the one divergence that
// actually happens in this plugin is an append, and an append is trivially
// mergeable: it is text strictly after everything both sides agree on.
//
// So: recognise exactly that, and refuse everything else by returning null. The
// caller then falls back to its old behaviour, which is what it would have done
// with no merge at all.
//
// THE BASELINE IS TRIMMED because `appendToNoteRegion` trims before it joins
// (see `joinRegionBlocks`). A field whose buffer ends in a newline — which is
// most of them, since a textarea invites a trailing return — would otherwise
// never match its own region on disk, and every append would read as a
// conflict.
export function appendedSince(baseline: string, onDisk: string): string | null {
  const base = baseline.replace(/\s+$/, "");
  if (base.length === 0) return onDisk.length === 0 ? null : onDisk;
  if (!onDisk.startsWith(base)) return null;
  const rest = onDisk.slice(base.length);
  if (rest.length === 0) return null;
  // Only a rest that begins with the block separator is an append. Anything
  // else is an edit that happens to share a prefix — "A" → "Ax" is one word
  // being typed, not a second block arriving.
  if (!rest.startsWith("\n\n")) return null;
  return rest.slice(2);
}

// What a field should write, given what it means to write (`next`), the region
// it last agreed with (`baseline`), and what is on disk right now.
//
// THE FIX `test/capture.test.ts:193` ASKED FOR. That test asserts a whole-region
// write drops a capture appended underneath it, and says in its own comment that
// `writeNoteRegion` is right to do what it is told and that the fix belongs in
// "never letting the field write a value older than what's on disk". This is
// that: the write still says what the field means, and anything appended since
// the field last looked rides along after it.
export function reconcileRegionWrite(
  onDisk: string,
  baseline: string,
  next: string
): string {
  const tail = appendedSince(baseline, onDisk);
  return tail == null ? next : joinRegionBlocks(next, tail);
}

// Whether `key`'s region exists in this text.
//
// A PREDICATE, RATHER THAN READING ONE OUT OF A WRITER. `ensureNoteRegions(text,
// [key]) == null` answers the same question and answers it as a side effect of
// being willing to create one, which is a different thing to ask and a worse
// thing to read. Quick capture's destination list needs the question on its own:
// a note whose region is absent is one where a capture would land on disk and
// render nowhere.
export function hasNoteRegion(fileText: string, key: string): boolean {
  return findRegion(fileText, key) != null;
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
    // The anchors this function writes were `<!--chronoanvil:path\n\n-->` until
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
