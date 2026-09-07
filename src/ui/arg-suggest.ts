// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Type-ahead for a folder answer, and the list it draws.
//
// OBSIDIAN'S CONTROL, NOT ONE OF OURS. `AbstractInputSuggest` attaches a
// suggestion popover to an `<input>` that already exists, and has been public
// API since 2023 — this plugin requires 1.7.0 and builds against
// `obsidian ^1.5.7-1`, both well past it. What is written here is the shell:
// three methods saying which candidates match, how a row is drawn, and what a
// click writes.
//
// WHICH IS NOT THE MODAL §3.2 DECLINED. That aside rejected opening Obsidian's
// FOLDER SUGGEST MODAL from a row of the section editor — a modal on a modal to
// fill one field, taking the answer out of the row the reader is looking at.
// This is the other half of the same API: the field stays in the row and the
// list is a popover over it. The reason the modal was wrong is the reason this
// is right.
//
// THE LIST IS A PURE FUNCTION (`argCandidates`) and the class is a shell around
// it, because `test/obsidian-stub.ts` has no `AbstractInputSuggest` and should
// not grow one whose behaviour a test then asserts against. What matters —
// keywords first, folders filtered, the reader's own typing always available —
// is decided in a function that needs no DOM and is tested in
// `test/section-answers.test.ts`.

import { AbstractInputSuggest, App, TFolder } from "obsidian";

// One row of the list. `keyword` entries are values with names — `all`, meaning
// every registered journal — and are drawn with their name rather than their
// spelling, which is what stops the control presenting a scope keyword as
// though it were a path (3.15 §9.1).
export interface ArgCandidate {
  value: string;
  label: string;
  keyword: boolean;
}

// What to offer for what has been typed so far.
//
// KEYWORDS FIRST AND UNFILTERED WHILE THE FIELD IS EMPTY, because they are the
// answers a reader would not think to type: "every journal" is not a folder
// they could have guessed the spelling of. Once they are typing, a keyword
// competes on the same terms as a folder and drops out when it does not match.
//
// FOLDERS ARE MATCHED ON THE WHOLE PATH, case-insensitively, so `journ` finds
// `03 - Journals` and `Maths` finds `03 - Journals/Maths`. A vault's folder
// list is unbounded (§3.1) and this is the narrowing a `<select>` could not do.
export function argCandidates(
  query: string,
  folders: readonly string[],
  keywords: readonly { value: string; label: string }[] = [],
  limit = 50
): ArgCandidate[] {
  const q = query.trim().toLowerCase();
  const named = keywords
    .filter((k) => !q || k.value.toLowerCase().includes(q) || k.label.toLowerCase().includes(q))
    .map((k) => ({ value: k.value, label: k.label, keyword: true }));
  const paths = folders
    .filter((f) => f && (!q || f.toLowerCase().includes(q)))
    // Shortest first: a parent is a likelier answer than one of its children,
    // and a reader narrowing by typing gets to the deeper ones anyway.
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .map((f) => ({ value: f, label: f, keyword: false }));
  return [...named, ...paths].slice(0, limit);
}

// Every folder in the vault, as paths. The root is excluded: it is spelled ""
// and "" already means something else in this grammar — the host note's own
// folder — so offering it as an entry would put two spellings of two different
// rules in one list.
export function vaultFolders(app: App): string[] {
  return app.vault
    .getAllLoadedFiles()
    .filter((f): f is TFolder => f instanceof TFolder)
    .map((f) => f.path)
    .filter((p) => p && p !== "/");
}

export class ArgSuggest extends AbstractInputSuggest<ArgCandidate> {
  constructor(
    app: App,
    private input: HTMLInputElement,
    private keywords: readonly { value: string; label: string }[],
    private onPick: (value: string) => void
  ) {
    super(app, input);
  }

  getSuggestions(query: string): ArgCandidate[] {
    return argCandidates(query, vaultFolders(this.app), this.keywords);
  }

  renderSuggestion(item: ArgCandidate, el: HTMLElement): void {
    el.setText(item.label);
    // A keyword is not a path and is not drawn as one. The class is the hook
    // for that; the label is what carries it if the theme has no opinion.
    if (item.keyword) el.addClass("ca-arg-keyword");
  }

  selectSuggestion(item: ArgCandidate): void {
    this.input.value = item.value;
    this.onPick(item.value);
    this.close();
  }
}
