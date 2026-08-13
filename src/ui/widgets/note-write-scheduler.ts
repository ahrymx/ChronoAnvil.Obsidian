// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Debounced writes for the note: field, and the timer table behind them.
//
// WHY THIS IS A CLASS WHEN EVERYTHING ELSE EXTRACTED HERE IS A FUNCTION
//
// Every other extraction out of the Widgets class in 2.56.25 became free
// functions, because every other one was stateless: give it a host and some
// arguments and it returns an element. This one is not. It owns a Map of
// pending timers, and that Map is the whole point — it is what makes a burst of
// keystrokes into one file write rather than forty.
//
// Turning it into free functions would have meant either module-level state,
// which every Widgets instance in every open pane would then share, or passing
// the Map in and out of three functions that exist only to manage it. A small
// object that owns its own table is the honest shape.
//
// It also gets mutable state OUT of the class it came from, which is worth more
// than the line count suggests: `noteWriteTimers` was one of the few pieces of
// mutable state on Widgets, and a reader had no way to tell from the field
// declaration which of the class's forty methods might touch it. Here the
// answer is "the three in this file, and nothing else can".
//
// KEYING
//
// Timers are keyed by (file, region key) so that two note: fields in the same
// note do not cancel each other's writes — a single per-file timer would make
// the second field's edit discard the first's.

import { MarkdownPostProcessorContext } from "obsidian";

/** The one thing the scheduler needs: somewhere to put the text when it fires. */
export interface NoteWriteTarget {
  writeNoteRegionToFile(
    ctx: MarkdownPostProcessorContext,
    key: string,
    value: string
  ): Promise<void>;
}

export class NoteWriteScheduler {
  // Per-(file,key) debounce timers for live-as-you-type body writes. Each write
  // is a full atomic read-modify-write of the file via vault.process, so bursts
  // are coalesced to avoid rewriting the file on every stroke.
  private readonly timers = new Map<string, number>();

  private static readonly DEBOUNCE_MS = 400;

  constructor(private readonly target: NoteWriteTarget) {}

  private keyFor(ctx: MarkdownPostProcessorContext, key: string): string {
    return `${ctx.sourcePath}::${key}`;
  }

  /**
   * True while a write for this field is queued but not yet flushed.
   *
   * The note: field uses this to decide whether an external change to its
   * region is genuinely external, or is just its own pending write coming back
   * round — rebuilding on the latter would drop the cursor mid-word.
   */
  isPending(ctx: MarkdownPostProcessorContext, key: string): boolean {
    return this.timers.has(this.keyFor(ctx, key));
  }

  /** Queue a write, replacing any write already queued for the same field. */
  schedule(
    ctx: MarkdownPostProcessorContext,
    key: string,
    value: string
  ): void {
    const tk = this.keyFor(ctx, key);
    const existing = this.timers.get(tk);
    if (existing != null) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      this.timers.delete(tk);
      void this.target.writeNoteRegionToFile(ctx, key, value);
    }, NoteWriteScheduler.DEBOUNCE_MS);
    this.timers.set(tk, timer);
  }

  /** Write now, cancelling anything queued. Used on blur, where waiting is wrong. */
  flush(ctx: MarkdownPostProcessorContext, key: string, value: string): void {
    const tk = this.keyFor(ctx, key);
    const existing = this.timers.get(tk);
    if (existing != null) {
      window.clearTimeout(existing);
      this.timers.delete(tk);
    }
    void this.target.writeNoteRegionToFile(ctx, key, value);
  }
}
