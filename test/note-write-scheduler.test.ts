// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The debounce that stands between a reader typing and their note being
// rewritten.
//
// WHY THIS IS THE ONE OF THE SIX THAT GETS RUN RATHER THAN READ. The 5.2 sweep
// found six modules with no test naming them, and five are DOM builders — this
// suite has no DOM environment, so every assertion about them is necessarily
// about their source text. `NoteWriteScheduler` is not: it is a map of timers
// and an injected write target, and every rule in its header is a claim about
// BEHAVIOUR that a structural assertion cannot check. The keying rule in
// particular — "a single per-file timer would make the second field's edit
// discard the first's" — is a data-loss bug described in a comment, with
// nothing until now that would notice the map key losing its second half.

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownPostProcessorContext } from "obsidian";
import { NoteWriteScheduler } from "../src/ui/widgets/note-write-scheduler";

type Write = { path: string; key: string; value: string; baseline?: string };

const ctxFor = (sourcePath: string): MarkdownPostProcessorContext =>
  ({ sourcePath }) as MarkdownPostProcessorContext;

// The module reaches for `window.setTimeout` rather than the bare global,
// because in Obsidian a plugin's timers are the window's. Node has no `window`,
// so the suite supplies one that forwards to the timers vitest is faking.
const installWindow = (): void => {
  (globalThis as { window?: unknown }).window = {
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: number) => clearTimeout(id),
  };
};

describe("the note-write debounce", () => {
  let writes: Write[];
  let scheduler: NoteWriteScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    installWindow();
    writes = [];
    scheduler = new NoteWriteScheduler({
      writeNoteRegionToFile: async (ctx, key, value, baseline) => {
        writes.push({ path: ctx.sourcePath, key, value, baseline });
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { window?: unknown }).window;
  });

  it("coalesces a burst of edits into one write", () => {
    const ctx = ctxFor("Diary/2026-08-30.md");
    for (const value of ["H", "He", "Hel", "Hell", "Hello"]) {
      scheduler.schedule(ctx, "notes", value);
    }
    expect(writes, "nothing written while the reader is still typing").toEqual([]);
    vi.advanceTimersByTime(400);
    expect(writes.map((w) => w.value)).toEqual(["Hello"]);
  });

  it("keeps two fields in one note apart", () => {
    // THE RULE THE MODULE'S HEADER STATES, AND THE BUG IT NAMES. With a
    // per-file key the second schedule cancels the first, and the reader's
    // edit to the first field is silently dropped — no error, no write, the
    // text simply never lands.
    const ctx = ctxFor("Diary/2026-08-30.md");
    scheduler.schedule(ctx, "notes", "a paragraph");
    scheduler.schedule(ctx, "captured", "a fragment");
    vi.advanceTimersByTime(400);
    expect(writes.map((w) => [w.key, w.value]).sort()).toEqual([
      ["captured", "a fragment"],
      ["notes", "a paragraph"],
    ]);
  });

  it("keeps the same field in two notes apart", () => {
    // The other half of the key. Two entries open in a split, both with a
    // `note:notes` field, is an ordinary arrangement.
    scheduler.schedule(ctxFor("Diary/A.md"), "notes", "first");
    scheduler.schedule(ctxFor("Diary/B.md"), "notes", "second");
    vi.advanceTimersByTime(400);
    expect(writes.map((w) => w.path).sort()).toEqual(["Diary/A.md", "Diary/B.md"]);
  });

  it("reports a queued write as pending, and stops once it lands", () => {
    // What the `note:` field asks before deciding whether a change to its
    // region is genuinely external or is its own write coming back round.
    // Rebuilding on the latter drops the cursor mid-word.
    const ctx = ctxFor("Diary/2026-08-30.md");
    expect(scheduler.isPending(ctx, "notes")).toBe(false);
    scheduler.schedule(ctx, "notes", "text");
    expect(scheduler.isPending(ctx, "notes")).toBe(true);
    expect(scheduler.isPending(ctx, "captured"), "a different field").toBe(false);
    vi.advanceTimersByTime(400);
    expect(scheduler.isPending(ctx, "notes")).toBe(false);
  });

  it("flushes now and cancels what was queued", () => {
    const ctx = ctxFor("Diary/2026-08-30.md");
    scheduler.schedule(ctx, "notes", "half a sentence");
    void scheduler.flush(ctx, "notes", "the whole sentence");
    expect(writes.map((w) => w.value)).toEqual(["the whole sentence"]);
    expect(scheduler.isPending(ctx, "notes")).toBe(false);
    // And the cancelled timer does not fire behind it with the stale value,
    // which is the shape that would overwrite a blur with a keystroke.
    vi.advanceTimersByTime(1000);
    expect(writes.map((w) => w.value)).toEqual(["the whole sentence"]);
  });

  it("returns the write from flush rather than voiding it", async () => {
    // 4.27: a caller that needs to act after the bytes have landed can await
    // it. Nothing is obliged to.
    const ctx = ctxFor("Diary/2026-08-30.md");
    const settled = scheduler.flush(ctx, "notes", "text");
    expect(settled).toBeInstanceOf(Promise);
    await expect(settled).resolves.toBeUndefined();
  });

  it("carries the baseline through untouched, absent included", () => {
    // ABSENT IS A REAL ANSWER. The list-shaped widgets serialise a structure
    // they never read as text, so they have no baseline to offer — and "" is
    // not the same claim: it would make every write look like the entire
    // region had been appended underneath the buffer.
    const ctx = ctxFor("Diary/2026-08-30.md");
    scheduler.schedule(ctx, "notes", "new", "old region text");
    scheduler.schedule(ctx, "tasks", "serialised");
    vi.advanceTimersByTime(400);
    const byKey = new Map(writes.map((w) => [w.key, w]));
    expect(byKey.get("notes")!.baseline).toBe("old region text");
    expect(byKey.get("tasks")!.baseline).toBeUndefined();
    expect("baseline" in byKey.get("tasks")!).toBe(true);
  });
});
