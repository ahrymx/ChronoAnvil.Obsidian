// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// One card per journal, laid out as a grid. 4.2 §1.
//
// ── WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT YET ────────────────────
//
// THE FRAME, AND THE FRAME ONLY. The reference design is a course-card
// dashboard: a banner, an overflow control on it, a title, a subtitle, and a
// row of quick actions. What is built here is that shell, the grid that holds
// it, and the wiring for the parts that could not be drawn honestly without it.
// The card's CONTENT beyond a name, a count and two actions is deferred.
//
// NOTHING DEAD IS DRAWN, which is the one rule that shaped what "just the
// frame" could include. The reference has four action glyphs per card and this
// has two, because two are all that resolve to something a reader can do today.
// A greyed row of four would look closer to the picture and teach a reader that
// this plugin's controls are decoration — 4.1 §6.2 states the rule for the
// mobile launcher ("a control that cannot do its job should not be drawn") and
// it is not a rule about mobile. The third and fourth glyphs arrive with the
// features behind them.
//
// ── WHY AN ARGUMENT RATHER THAN A NEW KEYWORD ────────────────────────────
//
// `journals:cards`, not `journal-cards`. 4.1 §3 refuses a `widget:` namespace
// on the grounds that one idea gets one name, and this is the same idea as
// `journals` — every journal, drawn — in a second arrangement. The grammar
// already has a slot for that: `keyword[:argument]`, and `journals` had never
// used its argument. A new keyword would be a second name to keep in step with
// the first forever, which is what `RETIRED_WORDS` exists to delete.
//
// AND AN UNKNOWN ARGUMENT IS REFUSED rather than falling back to the bare
// form — see the dispatcher. `journals:card` (singular) silently drawing the
// list is the kind of near-miss nobody debugs, because it looks like the
// feature not working rather than like the word being wrong.
//
// ── THE BANNER, AND WHERE AN IMAGE COMES FROM ────────────────────────────
//
// `banner` in the frontmatter of the journal's own index note, which is the
// convention every Obsidian banner plugin already reads and the one a reader
// most likely already has. NOT a settings key: 4.1 §2.5's argument is that a
// derived value follows a rename and a configured one goes stale, and a
// journal's index note moves with its folder for free.
//
// The fallback is a wash keyed off the journal's own emoji rather than a grey
// box, because the reference design's flat-colour card (the one with no image)
// is the case a new vault is entirely made of, and it has to look deliberate
// rather than unfinished.

import { setIcon } from "obsidian";
import type { MarkdownPostProcessorContext } from "obsidian";

import type AlmanacPlugin from "../main";
import { getFile, getFolder, openFile } from "../core/util";
import { folderNotePath } from "../core/util";
import { emptyCallout } from "../ui/empty";
import { overflowButton } from "../ui/section-frame";
import { journalChildFolders, registeredJournalTypes } from "./journal";
import type { JournalType } from "./journal";
import { countLabel } from "./journals-section";

// The image a journal's card wears, or null for the wash.
//
// READ FROM THE INDEX NOTE'S FRONTMATTER, through the metadata cache rather
// than by reading the file — the cache is what every other widget in this
// plugin reads and it is already warm. A journal whose index note is missing
// (a folder made by hand) gets the wash, which is the same fallback
// `folderLink` makes one file over for the same reason: better a deliberate
// plain thing than a broken reference.
export function bannerOf(plugin: AlmanacPlugin, type: JournalType): string | null {
  const file = getFile(plugin.app, folderNotePath(type.root));
  if (!file) return null;
  const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  const raw = fm.banner;
  if (typeof raw !== "string" || !raw.trim()) return null;
  return raw.trim();
}

// A stable hue for a journal with no banner.
//
// DERIVED FROM THE ID, NOT ASSIGNED. Two journals must not swap colours when a
// third is added or one is renamed, and an assigned palette index would do
// exactly that — it is the same argument `foldKey` makes for keying a fold on
// the type's id rather than on its position. The arithmetic is a sum of code
// points because it has to agree with itself across sessions and nothing here
// is worth a hash function.
export function hueOf(id: string): number {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum = (sum + id.charCodeAt(i) * 31) % 360;
  return sum;
}

// EXPORTED IN 4.15 §4, unchanged. `journal-card:<id>` draws exactly one of
// these and `journals:cards` draws a grid of all of them, so the two must be the
// same object — a card that looked different depending on how many were asked
// for would be two cards with one name.
export function buildCard(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  type: JournalType
): HTMLElement {
  const card = createDiv({ cls: "jjc-card" });

  // ── The banner ─────────────────────────────────────────────────────────
  const banner = card.createDiv({ cls: "jjc-banner" });
  const src = bannerOf(plugin, type);
  if (src) {
    // `getResourcePath` turns a vault path into something the renderer can
    // load; an external URL is passed through. Set as a background rather than
    // an <img> so the crop is CSS's problem and a wrong aspect ratio cannot
    // change the card's height — every card in the grid must be one height or
    // the rows stop reading as rows.
    const file = getFile(plugin.app, src);
    const url = file ? plugin.app.vault.getResourcePath(file) : src;
    banner.style.backgroundImage = `url("${url}")`;
    banner.addClass("has-image");
  } else {
    // The wash. The emoji is the journal's identity glyph — the same one its
    // row in the Journals card wears — so a vault with no images still reads
    // as four distinct things rather than four grey rectangles.
    banner.style.setProperty("--jjc-hue", String(hueOf(type.id)));
    banner.createDiv({ cls: "jjc-glyph", text: type.emoji });
  }

  // The overflow control, on the banner as in the reference. Built ON CLICK,
  // which is `overflowButton`'s own rule: the menu describes the journal as it
  // is when opened rather than as it was when the grid rendered.
  overflowButton(banner, "jjc-menu", (menu) => {
    menu.addItem((i) =>
      i
        .setTitle(`Open ${type.name}`)
        .setIcon("book-open")
        .onClick(() => void openIndex(plugin, type))
    );
    const top = type.levels[0];
    menu.addItem((i) =>
      i
        .setTitle(`New ${top.noun.toLowerCase()}`)
        .setIcon("plus")
        .onClick(() => void plugin.journals.newTopLevel(type))
    );
  });

  // ── The body ───────────────────────────────────────────────────────────
  const body = card.createDiv({ cls: "jjc-body" });
  const title = body.createEl("a", {
    cls: "jjc-title",
    text: type.name,
    href: folderNotePath(type.root).replace(/\.md$/, ""),
  });
  title.addEventListener("click", (evt) => {
    evt.preventDefault();
    void openIndex(plugin, type);
  });

  // The subtitle. The reference puts a course code here — a second, shorter
  // name for the same thing. Almanac has no such second name and inventing one
  // would be the synonym §3 refuses, so the slot carries the fact a reader
  // actually wants at a glance: how much is in there.
  const folder = getFolder(plugin.app, type.root);
  const tops = journalChildFolders(plugin, type, folder);
  body.createDiv({
    cls: "jjc-sub",
    text: countLabel(tops.length, type.levels[0].noun) || "Nothing in it yet",
  });

  // ── The action row ─────────────────────────────────────────────────────
  const actions = card.createDiv({ cls: "jjc-actions" });
  action(actions, "book-open", `Open ${type.name}`, () =>
    void openIndex(plugin, type)
  );
  action(actions, "plus", `New ${type.levels[0].noun.toLowerCase()}`, () =>
    void plugin.journals.newTopLevel(type)
  );

  void ctx;
  return card;
}

async function openIndex(plugin: AlmanacPlugin, type: JournalType): Promise<void> {
  const file = getFile(plugin.app, folderNotePath(type.root));
  if (file) await openFile(plugin.app, file);
}

function action(
  row: HTMLElement,
  icon: string,
  label: string,
  onClick: () => void
): void {
  const btn = row.createEl("button", {
    cls: "jjc-action",
    attr: { type: "button", "aria-label": label, title: label },
  });
  setIcon(btn, icon);
  btn.addEventListener("click", (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    onClick();
  });
}

export function buildJournalCards(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const root = createDiv({ cls: "jjc-grid" });
  const types = registeredJournalTypes(plugin);

  if (types.length === 0) {
    // `emptyCallout` REPLACES content, which is this case: there is no grid to
    // draw and the callout stands in for it. `empty.ts`'s rule wants both what
    // will appear and how to make it happen, and both are sayable here.
    root.addClass("is-empty");
    root.appendChild(
      emptyCallout(
        "book-open",
        "No journals yet",
        "Turn on Study or add a journal in Settings → Almanac → Journals, and each one gets a card here."
      )
    );
    return root;
  }

  for (const type of types) root.appendChild(buildCard(plugin, ctx, type));
  return root;
}
