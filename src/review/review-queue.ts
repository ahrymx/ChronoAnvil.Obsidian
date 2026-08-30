// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// ── The `review-queue` widget ─────────────────────────────────────────────
//
// What is worth reopening. The only surface in the study journal that gives a
// reason to go back to a note that already exists — everything else here
// reports on notes you are already writing.
//
// Two placements, one rule, the same rule topics-table and confidence-summary
// already use:
//
//   review-queue          on a journal index note → that folder and below
//   review-queue:all      every registered journal at once
//   review-queue:<folder> an explicit folder, for a hand-built dashboard
//
// The scheduling itself is pure and lives in review.ts; this is the Obsidian
// layer — read frontmatter, draw rows, write a stamp.
//
// DESIGN: surfacing, not nagging. No overdue counter, no streak, no colour
// escalating with lateness, no badge on the ribbon. A review queue that guilts
// you is the study-journal version of the "words written" stat already cut
// from the year view: trivial to compute, and exactly the kind of number that
// becomes a target. The queue is capped (see QUEUE_LIMIT) for the same reason
// — the honest failure mode is not "too few items" but "sixty items and no
// idea where to start". A short list is a next action; a long one is a
// backlog.

import { App, MarkdownPostProcessorContext, Notice, TFile, setIcon } from "obsidian";
import { emptyLine } from "../ui/empty";
import type ChronoAnvilPlugin from "../main";
import { getBuiltinTracker } from "../trackers/trackers";
import {
  journalFolderScope,
  journalTypeOfNote,
  ratingTrackerFor,
  registeredJournalTypes,
} from "../journals/journal";
import { PageInfo, pagesUnder } from "../core/query";
import { SCOPE_ALL } from "../core/directive-grammar";
import { openFile, today as todayIso } from "../core/util";
import {
  ReviewInput,
  ReviewItem,
  describeDue,
  describeNext,
  dueItems,
  nextDue,
} from "./review";

// Enough to work through in a sitting. Beyond this the list stops being a
// prompt and starts being a reproach.
const QUEUE_LIMIT = 12;

// The frontmatter keys the queue reads, resolved from the registry rather than
// spelled out — the same rule getBuiltinTracker exists for, so a relabelled or
// (in future) re-keyed built-in doesn't leave this reading a dead property.
interface ReviewProperties {
  confidence: string;
  status: string;
  reviewed: string;
}

export function reviewProperties(plugin: ChronoAnvilPlugin): ReviewProperties {
  return {
    confidence: getBuiltinTracker(plugin, "confidence")?.id ?? "confidence",
    status: getBuiltinTracker(plugin, "status")?.id ?? "status",
    reviewed: getBuiltinTracker(plugin, "reviewed")?.id ?? "reviewed",
  };
}

// The rating property for one note: whatever its *kind* declares it is graded
// into, falling back to the confidence built-in.
//
// Per note rather than per plugin as of 2.36, because a Lesson and a Practice
// note in the same folder are now scheduled off different properties. Only the
// resolution moved — `review.ts` never named a property in the first place
// (`scheduleFor` takes a value, `reviewIntervalDays` takes a number), which is
// why splitting the rating cost the scheduler nothing at all.
export function ratingPropertyOf(
  plugin: ChronoAnvilPlugin,
  notePath: string,
  fmType: unknown,
  fallback: string
): string {
  const type = journalTypeOfNote(plugin, notePath);
  const kindId = typeof fmType === "string" ? fmType : null;
  return ratingTrackerFor(type, kindId) ?? fallback;
}

function readNote(
  plugin: ChronoAnvilPlugin,
  props: ReviewProperties
): (p: PageInfo) => ReviewInput {
  return (p) => ({
    date: p.fm["date"],
    reviewed: p.fm[props.reviewed],
    confidence:
      p.fm[ratingPropertyOf(plugin, p.file.path, p.fm["type"], props.confidence)],
    status: p.fm[props.status],
  });
}

// The folders a queue reads. Kept as the queue's own name for the rule, but
// the rule itself moved to journal.ts in 2.33 when `journal-search` needed the
// identical scoping — two copies of "what does a bare directive mean?" is how
// a queue and a search over the same subject end up covering different notes.
export function queueScope(
  plugin: ChronoAnvilPlugin,
  arg: string,
  hostFolder: string | null
): string[] {
  return journalFolderScope(plugin, arg, hostFolder);
}

// Only notes that are a *kind* of some journal type — a lesson, a practice, a
// recipe. Index notes are excluded here rather than only by scheduleFor's
// missing-date rule, so the reason shows up once in a name instead of twice as
// a side effect: an index holds a current value, a leaf forms the series a
// schedule needs.
function leafNotes(plugin: ChronoAnvilPlugin, pages: PageInfo[]): PageInfo[] {
  const kinds = new Set(
    registeredJournalTypes(plugin).flatMap((t) => t.kinds.map((k) => k.id))
  );
  return pages.filter((p) => {
    const t = p.fm["type"];
    return typeof t === "string" && kinds.has(t);
  });
}

async function stampReviewed(
  app: App,
  file: TFile,
  property: string,
  iso: string
): Promise<void> {
  await app.fileManager.processFrontMatter(file, (fm) => {
    fm[property] = iso;
  });
}

function row(
  root: HTMLElement,
  app: App,
  item: ReviewItem<PageInfo>,
  props: ReviewProperties,
  sourcePath: string
): void {
  const el = root.createDiv({ cls: "ca-jrq-row" });

  const main = el.createDiv({ cls: "ca-jrq-main" });
  const link = main.createEl("a", {
    cls: "internal-link ca-jrq-title",
    text: item.note.file.basename,
    href: item.note.file.path,
    attr: { "data-href": item.note.file.path },
  });
  link.addEventListener("click", (evt) => {
    evt.preventDefault();
    void openFile(app, item.note.file);
  });
  link.addEventListener("mouseover", (evt) => {
    app.workspace.trigger("hover-link", {
      event: evt,
      source: "ca-review-queue",
      hoverParent: el,
      targetEl: link,
      linktext: item.note.file.path,
      sourcePath,
    });
  });

  // The subject/topic the note sits under, so a queue spanning several
  // journals says where each item comes from without a second column.
  const parent = item.note.file.parent?.name;
  const conf = Number(item.note.fm[props.confidence]);
  const bits: string[] = [];
  if (parent) bits.push(parent);
  bits.push(describeDue(item.schedule));
  if (Number.isFinite(conf)) bits.push(`confidence ${conf}/5`);
  if (!item.schedule.everReviewed) bits.push("never reviewed");
  main.createDiv({ cls: "ca-jrq-meta", text: bits.join(" · ") });

  // One button, and it is the whole interaction: "I looked at this." It stamps
  // today and the row leaves the queue. Grading (got it / didn't) belongs to
  // the recall widget, which writes confidence as well — this is the honest
  // minimum for a note you reread without being tested on.
  const done = el.createEl("button", {
    cls: "ca-jrq-done",
    attr: {
      "aria-label": `Mark ${item.note.file.basename} reviewed today`,
      title: "Mark reviewed today",
    },
  });
  setIcon(done, "check");

  done.addEventListener("click", async () => {
    done.disabled = true;
    try {
      // No manual row removal: the frontmatter write fires the metadata
      // cache, the LiveWidget host repaints, and the row leaves because it is
      // no longer due. Two paths to the same repaint is how a list and the
      // files behind it drift apart.
      await stampReviewed(app, item.note.file, props.reviewed, todayIso());
    } catch (e) {
      console.error("[ChronoAnvil] could not stamp reviewed", e);
      new Notice("Couldn't mark that note reviewed — see the console.");
      done.disabled = false;
    }
  });
}

export function buildReviewQueue(
  plugin: ChronoAnvilPlugin,
  arg: string,
  ctx: MarkdownPostProcessorContext,
  hostFolder: string | null
): HTMLElement {
  const app = plugin.app;
  const root = createDiv({ cls: "ca-journal-table ca-journal-review-queue" });

  const folders = queueScope(plugin, arg, hostFolder);
  if (folders.length === 0) {
    // NOTHING IN SCOPE IS A STATE THE READER CAN ACT ON, so it says what will
    // appear here and how to make it happen — `empty.ts`'s rule, applied to the
    // one branch that used to return a blank div.
    //
    // Reachable on a new vault as of 4.1: the journals dashboard carries
    // `review-queue:all` above every journal, and `:all` resolves to no folders
    // until a journal is registered. Before that this directive only ever sat
    // on a journal's own index note, where an empty scope meant a hand-written
    // directive pointing nowhere and a blank was as good an answer as any.
    const line = emptyLine(root, "", "ca-jrq-empty");
    setIcon(line.createSpan({ cls: "ca-jrq-empty-icon" }), "check-check");
    line.createSpan({
      text:
        arg.trim() === SCOPE_ALL
          ? "No journals yet — notes come round for review here once you have one."
          : "Nothing in scope to review.",
    });
    return root;
  }

  const props = reviewProperties(plugin);
  const seen = new Set<string>();
  const pages: PageInfo[] = [];
  for (const folder of folders) {
    for (const p of pagesUnder(app, folder)) {
      if (seen.has(p.file.path)) continue;
      seen.add(p.file.path);
      pages.push(p);
    }
  }

  const notes = leafNotes(plugin, pages);
  const today = todayIso();
  const due = dueItems(notes, readNote(plugin, props), today, QUEUE_LIMIT);

  if (due.length === 0) {
    const next = nextDue(notes, readNote(plugin, props), today);
    // Line-shaped rather than a callout: the queue drew its header and its
    // scope control already, so only this region is empty. See empty.ts.
    const line = emptyLine(root, "", "ca-jrq-empty");
    setIcon(line.createSpan({ cls: "ca-jrq-empty-icon" }), "check-check");
    line.createSpan({
      text: next
        ? `Nothing to review — next ${describeNext(next)}.`
        : notes.length === 0
          ? "No notes here to review yet."
          : "Nothing to review.",
    });
    return root;
  }

  const list = root.createDiv({ cls: "ca-jrq-list" });
  for (const item of due) {
    row(list, app, item, props, ctx.sourcePath);
  }

  // How many are due in total, so a capped list can say what it is hiding
  // rather than silently truncating.
  const total = dueItems(notes, readNote(plugin, props), today).length;
  if (total > due.length) {
    root.createDiv({
      cls: "ca-jrq-more",
      text: `${total - due.length} more waiting — this list shows the ${QUEUE_LIMIT} coldest.`,
    });
  }

  return root;
}
