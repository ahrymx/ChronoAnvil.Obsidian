// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The ChronoAnvil attachment format — the small line format stored inside a note's
// `<!--chronoanvil:attachments-->` region (see notestore.ts), rendered by the
// `attach:` widget as a gallery of image tiles plus a row of link/file chips.
//
// Everything here is written in *plain markdown*, deliberately: an attachment
// line is exactly what you would have typed by hand, so the region degrades to
// a readable list of links if the plugin is ever removed (uncomment the block
// and it renders natively). Nothing is invented that Obsidian doesn't already
// understand.
//
// On-disk line grammar (one attachment per line, bullet optional on read,
// always written):
//
//   - ![[01 - Material/Attachments/2026/07/Cloud 2026-07-22.png]]        image (vault)
//   - ![[01 - Material/Attachments/2026/07/Cloud.png|A cool cloud]]      image + caption
//   - [[Some Note]]                                             vault file/note
//   - [[Recipes/Bread.md|Sourdough]]                            file + caption
//   - [Market square event](https://example.com/story)          hyperlink
//   - ![NASA photo of the day](https://example.com/apod.jpg)    remote image
//   - Anything else at all                                      free text
//
// Kinds are *derived* from the target, not stored: a target whose extension is
// an image extension is an image; an absolute URL is a link; anything else in
// the vault is a file. The one thing the line shape carries beyond the target
// is whether an external image is embedded (`!`) or shown as a chip — the
// widget's "Show as image / Show as link" toggle.
//
// The free-text fallback exists so that upgrading an older vault is lossless:
// `attachments` used to be a plain `note:` textarea, and whatever prose is
// sitting in that region round-trips untouched instead of being silently
// dropped on the first write.
//
// As with tasks.ts these are pure string<->model transforms so they unit-test
// without a vault; the App-facing file/folder work lives in the widget layer.

export type AttachmentKind = "image" | "file" | "link" | "text";

export interface Attachment {
  kind: AttachmentKind;
  // image/file: a vault path or link target (what goes inside `[[ ]]`).
  // link: an absolute URL. An external image keeps its URL here too.
  // text: always "".
  target: string;
  // Caption / display label. "" means "derive one" — see displayTitle().
  // For a text item this holds the line itself.
  title: string;
}

// Extensions Obsidian will render inline. `svg` is included because Obsidian
// displays it, but note that the widget renders vault images through
// `getResourcePath`, never by inlining file contents.
export const IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "jfif",
  "gif",
  "webp",
  "avif",
  "bmp",
  "svg",
];

// Protocols we're willing to put in an `href`. Everything else — most
// importantly `javascript:`, `data:` and `vbscript:` — is refused outright, so
// a hand-edited (or pasted) region can't turn a click on a chip into script
// execution. `obsidian://` is allowed because it's how Obsidian's own
// deep links work.
const SAFE_PROTOCOLS = ["https://", "http://", "mailto:", "obsidian://"];

// A bullet, if present, is stripped on read and re-added on write.
const BULLET_RE = /^[-*+](?:\s+|$)/;
const WIKI_RE = /^(!?)\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]$/;
const MD_RE = /^(!?)\[([^\]]*)\]\(\s*<?([^)>]+?)>?\s*\)$/;
const BARE_URL_RE = /^<?((?:https?:\/\/|mailto:|obsidian:\/\/)\S+?)>?$/i;

export function isExternalUrl(target: string): boolean {
  const t = target.trim().toLowerCase();
  return SAFE_PROTOCOLS.some((p) => t.startsWith(p));
}

// True only for links we'll hand to an `href`. Anything unrecognised (a bare
// `javascript:` payload, a `data:` blob, a relative path) fails this, and the
// widget renders it as inert text instead of a clickable chip.
export function isSafeUrl(target: string): boolean {
  const t = target.trim();
  // Control characters are never legitimate in a URL and are the classic way
  // to smuggle a scheme past a naive prefix check ("java\nscript:").
  for (let i = 0; i < t.length; i++) {
    if (t.charCodeAt(i) < 0x20 || t.charCodeAt(i) === 0x7f) return false;
  }
  return isExternalUrl(t);
}

// Lowercase extension of a path or URL, without the dot. Query strings and
// fragments are ignored so `photo.jpg?w=800` still reads as an image.
export function extensionOf(target: string): string {
  const clean = target.split(/[?#]/)[0];
  const seg = clean.split("/").pop() ?? "";
  const dot = seg.lastIndexOf(".");
  if (dot <= 0 || dot === seg.length - 1) return "";
  return seg.slice(dot + 1).toLowerCase();
}

export function isImageTarget(target: string): boolean {
  return IMAGE_EXTENSIONS.includes(extensionOf(target));
}

// The bare file name of a vault target, extension stripped — the fallback
// caption for an image tile or a file chip.
export function baseLabel(target: string): string {
  const seg = target.split("/").pop() ?? target;
  const dot = seg.lastIndexOf(".");
  return (dot > 0 ? seg.slice(0, dot) : seg).trim();
}

// Host of an external URL, `www.` dropped — the fallback caption for a link
// chip, and the subtitle shown under a captioned one. `mailto:` returns the
// address itself, which is the only meaningful label it has.
export function hostLabel(url: string): string {
  const t = url.trim();
  if (/^mailto:/i.test(t)) return t.slice("mailto:".length);
  const afterScheme = t.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const host = afterScheme.split(/[/?#]/)[0];
  return host.replace(/^www\./i, "");
}

// What the widget prints on a tile or chip: the caption if there is one, else
// something derived from the target.
export function displayTitle(a: Attachment): string {
  const t = a.title.trim();
  if (t) return t;
  if (a.kind === "text") return "";
  if (isExternalUrl(a.target)) return hostLabel(a.target);
  return baseLabel(a.target);
}

// Parse one line. Returns null for a blank line so callers can skip it; every
// other line yields *something* (free text at worst), which is what makes the
// round-trip lossless.
export function parseAttachmentLine(line: string): Attachment | null {
  const raw = line.trim();
  if (!raw) return null;
  const s = raw.replace(BULLET_RE, "").trim();
  if (!s) return null;

  const wiki = WIKI_RE.exec(s);
  if (wiki) {
    const target = wiki[2].trim();
    const title = (wiki[3] ?? "").trim();
    return { kind: isImageTarget(target) ? "image" : "file", target, title };
  }

  const md = MD_RE.exec(s);
  if (md) {
    const embed = md[1] === "!";
    const title = md[2].trim();
    const target = md[3].trim();
    if (isExternalUrl(target)) {
      // Only an explicit `![...]` embed shows a remote image. A plain link to
      // a .jpg stays a chip: rendering it would fire an unannounced network
      // request from inside a private journal, so that's opt-in per item.
      return { kind: embed ? "image" : "link", target, title };
    }
    return {
      kind: isImageTarget(target) ? "image" : "file",
      target: decodeURI(target),
      title,
    };
  }

  const bare = BARE_URL_RE.exec(s);
  if (bare) return { kind: "link", target: bare[1], title: "" };

  return { kind: "text", target: "", title: s };
}

// Captions live inside `[[a|b]]` / `[t](u)`, so the delimiters can't appear in
// one. Collapse them (and any newline) rather than refusing the caption.
function cleanTitle(title: string): string {
  return title
    .replace(/[[\]|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Spaces in a URL would end the `(...)` early for some parsers; percent-encode
// them and leave everything else as the user gave it.
function cleanUrl(url: string): string {
  return url.trim().replace(/\s/g, "%20");
}

// Serialize back to a canonical line. Re-parsing the result yields an equal
// attachment (round-trip stable).
export function serializeAttachmentLine(a: Attachment): string {
  if (a.kind === "text") return `- ${a.title.trim()}`;

  if (isExternalUrl(a.target)) {
    const bang = a.kind === "image" ? "!" : "";
    const title = cleanTitle(a.title) || hostLabel(a.target);
    return `- ${bang}[${title}](${cleanUrl(a.target)})`;
  }

  const bang = a.kind === "image" ? "!" : "";
  const title = cleanTitle(a.title);
  const target = a.target.trim();
  return title ? `- ${bang}[[${target}|${title}]]` : `- ${bang}[[${target}]]`;
}

export function parseAttachments(regionText: string): Attachment[] {
  const out: Attachment[] = [];
  for (const line of regionText.split("\n")) {
    const a = parseAttachmentLine(line);
    if (a) out.push(a);
  }
  return out;
}

export function serializeAttachments(items: Attachment[]): string {
  return items.map(serializeAttachmentLine).join("\n");
}

// Build an attachment from a target, classifying it the same way the parser
// would. `title` is optional; leave it empty to let displayTitle() derive one.
export function newAttachment(target: string, title = ""): Attachment {
  const t = target.trim();
  const kind: AttachmentKind = isExternalUrl(t)
    ? "link"
    : isImageTarget(t)
      ? "image"
      : "file";
  return { kind, target: t, title: title.trim() };
}

// Accept what a user actually pastes: bare hosts (`example.com`), `www.`
// prefixes and protocol-relative URLs all become https. Returns null when the
// text isn't plausibly a URL, so the caller can fall back to treating it as a
// caption or ignoring it.
export function coerceUrl(text: string): string | null {
  const t = text.trim();
  if (!t || /\s/.test(t)) return null;
  if (isExternalUrl(t)) return t;
  if (/^\/\//.test(t)) return `https:${t}`;
  // A bare domain: at least one dot, a plausible TLD, no scheme we rejected.
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return null; // some other (unsafe) scheme
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) return `https://${t}`;
  return null;
}

// True if this exact target is already in the list — used to make dropping the
// same file twice a no-op instead of a duplicate tile.
export function hasTarget(items: Attachment[], target: string): boolean {
  const t = target.trim().toLowerCase();
  return items.some((a) => a.target.trim().toLowerCase() === t);
}

// Move an item within the list, returning a new array. Out-of-range indices
// return the list unchanged. Used by drag-to-reorder in the gallery.
export function moveAttachment(
  items: Attachment[],
  from: number,
  to: number
): Attachment[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return items;
  }
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// ── File naming ─────────────────────────────────────────────────────────
//
// Where a dropped/pasted file lands is a token pattern, so a vault can choose
// a flat folder, a year/month tree, or per-note folders without any code
// change. Tokens are case-insensitive; unknown tokens are left verbatim so a
// typo is visible rather than silently blanking part of the path.

export type AttachmentTokens = Record<string, string>;

export function applyTokens(pattern: string, tokens: AttachmentTokens): string {
  return pattern.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const v = tokens[key.toLowerCase()];
    return v === undefined ? whole : v;
  });
}

// Characters that are illegal in a file name on some OS, plus the four that
// would break a wikilink (`[ ] | #`) or an Obsidian block ref (`^`).
const ILLEGAL_NAME_CHARS = /[\\/:*?"<>|#^[\]]/g;

export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(ILLEGAL_NAME_CHARS, "-")
    .replace(/\s+/g, " ")
    // A name made only of separators ("///") would otherwise become "---";
    // collapse runs and trim them so it falls through to the fallback.
    .replace(/-{2,}/g, "-")
    .replace(/^[-.\s]+/, "")
    .replace(/[-.\s]+$/, "")
    .slice(0, 120)
    .trim();
  return cleaned || "attachment";
}

// Same rules as a file name, applied per path segment, so a folder pattern
// can't escape its root with `..` or absolute slashes.
export function sanitizeFolderPath(path: string): string {
  return path
    .split("/")
    .map((seg) => seg.trim())
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .map((seg) => sanitizeFileName(seg))
    .join("/");
}

export function splitExtension(fileName: string): {
  base: string;
  ext: string;
} {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return { base: fileName, ext: "" };
  return { base: fileName.slice(0, dot), ext: fileName.slice(dot + 1) };
}

// Extension for a clipboard image, which arrives as a MIME type with no name.
export function extensionForMime(mime: string): string {
  const m = mime.toLowerCase().trim();
  if (!m.startsWith("image/")) return "";
  const sub = m.slice("image/".length).split(";")[0];
  if (sub === "jpeg" || sub === "jpg") return "jpg";
  if (sub === "svg+xml") return "svg";
  if (IMAGE_EXTENSIONS.includes(sub)) return sub;
  return "";
}

// Resolve a collision by appending " 1", " 2", … before the extension.
// `taken` is supplied by the caller (a vault lookup in the widget, a Set in
// tests) so this stays pure.
export function uniquePath(
  desired: string,
  taken: (path: string) => boolean
): string {
  if (!taken(desired)) return desired;
  const slash = desired.lastIndexOf("/");
  const dir = slash === -1 ? "" : desired.slice(0, slash + 1);
  const { base, ext } = splitExtension(desired.slice(slash + 1));
  const suffix = ext ? `.${ext}` : "";
  for (let n = 1; n < 1000; n++) {
    const candidate = `${dir}${base} ${n}${suffix}`;
    if (!taken(candidate)) return candidate;
  }
  // Pathological case only (1000 same-named files in one folder).
  return `${dir}${base} ${Date.now()}${suffix}`;
}
