// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Captured region, drawn as one card per capture. 4.28.
//
// THE LIST ITSELF MOVED TO `log-list.ts` IN 4.52, when the logbook widget
// needed the same one. What is left here is the capture region's own answers to
// that list's four questions, and they are worth having in a file of their own
// rather than as an options literal at the call site:
//
//   NO ADD BOX. A capture arrives from the capture box, which is the whole
//   feature — "capture exists so you don't leave what you were doing" — and a
//   second place to type one into an entry you already have open would be a
//   second answer to a question that has one.
//
//   NO DATE ON THE STAMP. The region lives in a dated entry, so the day is the
//   note's; repeating it on every card would print the entry's own name down
//   the column.
//
//   AND THE NOTE ALWAYS EXISTS, because you are looking at it.

import { MarkdownPostProcessorContext } from "obsidian";
import type { NoteRegionHost } from "./note-regions";
import { isValidNoteKey } from "../../core/notestore";
import { buildLogList } from "./log-list";

export function buildCaptureLog(
  host: NoteRegionHost,
  rest: string,
  ctx: MarkdownPostProcessorContext,
  label: string | null,
  opts: {
    titled: boolean;
    barActions: HTMLElement | null;
    startCollapsed: () => boolean;
    onFold: (v: boolean) => void;
  }
): HTMLElement {
  const key = rest.split(":")[0].split("#")[0].trim();
  if (!isValidNoteKey(key)) {
    const wrap = createDiv({ cls: "ca-journal-capture-log ca-journal-note" });
    wrap.createDiv({
      cls: "ca-journal-widget-error",
      text: `Invalid capture key: "${key}"`,
    });
    return wrap;
  }

  return buildLogList(host, {
    key,
    file: host.fileOf(ctx),
    modifier: "ca-journal-note--capture",
    label,
    titled: opts.titled,
    barActions: opts.barActions,
    startCollapsed: opts.startCollapsed,
    onFold: opts.onFold,
    // NO DATE ON A CAPTURE'S STAMP, which is this file's third answer above and
    // now decides one more thing: the *when* control on a capture card offers
    // the hour and the length, never the day. A capture whose day could be
    // edited would be an item filed into a date the note it lives in is not.
    dated: false,
    emptyText: "Nothing captured yet — the capture box drops thoughts here.",
    add: null,
    createNote: null,
    addChild: (child) => ctx.addChild(child),
  });
}
