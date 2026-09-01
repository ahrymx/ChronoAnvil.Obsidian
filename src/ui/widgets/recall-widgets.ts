// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The recall: widget — spaced-repetition cards drawn from a note's own region.
//
// A body-region widget like the ones in ./note-regions.ts, so it takes that
// contract, plus the plugin: unlike a list or a task block, a recall card
// writes a GRADE back to the reviewed note rather than only to the note it is
// drawn in, and finding that note goes through the plugin's own settings for
// where journals live.
//
// That second write is the whole reason this is its own file rather than three
// more functions in note-regions.ts. A list widget owns one region of one note
// and nothing else; a recall card reaches outside the note it is rendered in,
// which is a materially different claim on the vault and worth keeping visible
// at the module boundary rather than buried among widgets that make no such
// claim.

import { MarkdownPostProcessorContext, TFile, Notice, setIcon } from "obsidian";
import { frontmatterOf, getFile, noteTypeOf, today as todayIso } from "../../core/util";
import { isValidNoteKey, readNoteRegion } from "../../core/notestore";
import { pageTypeIds, registeredJournalTypes } from "../../journals/journal";
import { ratingPropertyOf, reviewProperties } from "../../review/review-queue";
import {
  RecallGrade,
  RecallPair,
  confidenceFor,
  describeSession,
  newPair,
  normalizeRecallText,
  owningNotePath,
  parseRecall,
  serializeRecall,
  tally,
} from "../../review/recall";
import type { PluginNoteRegionHost } from "./note-regions";


export async function writeRecallGrade(
  deps: PluginNoteRegionHost,
  file: TFile,
  confidence: number
): Promise<void> {
  const props = reviewProperties(deps.plugin);
  // `|| null` KEEPS THE ABSENT CASE ABSENT. `noteTypeOf` answers "" for a note
  // with no `type:`, and `ratingPropertyOf` distinguishes a string from a null
  // — an empty string would be a kind id nothing matches rather than the
  // question not being asked. What the helper adds here is normalisation:
  // `type: Lesson` used to reach `ratingTrackerFor` unchanged and match no kind.
  const fmType = noteTypeOf(deps.app, file) || null;
  const rating = ratingPropertyOf(
    deps.plugin,
    file.path,
    fmType,
    props.confidence
  );
  const iso = todayIso();
  await deps.app.fileManager.processFrontMatter(file, (fm) => {
    fm[rating] = confidence;
    fm[props.reviewed] = iso;
  });
}


export function recallTarget(
  deps: PluginNoteRegionHost,
  ctx: MarkdownPostProcessorContext
): { file: TFile; name: string; isOwner: boolean } | { reason: string } {
  const host = deps.fileOf(ctx);
  if (!host) return { reason: "This block isn't in a note yet." };

  const fmOf = (f: TFile): Record<string, unknown> =>
    frontmatterOf(deps.app, f);
  const typeOf = (f: TFile): string => {
    const t = fmOf(f)["type"];
    return typeof t === "string" ? t : "";
  };

  const isPage = pageTypeIds(deps.plugin).has(typeOf(host));
  const targetPath = owningNotePath(host.path, isPage);
  const target = targetPath === host.path ? host : getFile(deps.app, targetPath);
  if (!target) {
    // A page whose folder note has been deleted or renamed by hand. The cards
    // still study fine; only the grading has nowhere to land.
    return {
      reason: "Couldn't find the note these cards belong to.",
    };
  }

  // The owner has to be a *kind* of some registered journal type, which is
  // the same test everything else uses to mean "a note that carries a rating".
  const kinds = new Set(
    registeredJournalTypes(deps.plugin).flatMap((t) => t.kinds.map((k) => k.id))
  );
  if (!kinds.has(typeOf(target))) {
    return {
      reason:
        "Grading needs a note that carries a rating — an index note doesn't.",
    };
  }

  return { file: target, name: target.basename, isOwner: target === host };
}


export function buildRecall(
  deps: PluginNoteRegionHost,
  rest: string,
  ctx: MarkdownPostProcessorContext,
  label: string | null
): HTMLElement {
  const key = rest.split(":")[0].trim();
  const wrap = createDiv({ cls: "ca-journal-recall" });

  // ── NO FOLD BAR OF ITS OWN (5.10) ─────────────────────────────────────
  //
  // 5.7 gave this widget a private collapse bar — chevron on the LEFT, an
  // uppercase micro-label, no hairline, no glyph slot — and the `recall`
  // section in `journal-sections.ts` already renders `header:🧠 Recall` above
  // it. So every Study note drew two heads for one section, and the second was
  // removed again by a stylesheet rule
  // (`.ca-journal-sec-block .ca-journal-recall-head { display: none }`): a bar
  // built in TypeScript so that CSS could unbuild it wherever it was wrong,
  // which is to say everywhere the section is composed.
  //
  // The head is the section's. This draws the widget.
  const head = wrap.createDiv({ cls: "ca-journal-recall-head" });
  if (label) head.createDiv({ cls: "ca-journal-recall-label", text: label });
  const tools = head.createDiv({ cls: "ca-jrc-tools" });

  if (!isValidNoteKey(key)) {
    wrap.createDiv({
      cls: "ca-journal-widget-error",
      text: `Invalid recall key: "${key}"`,
    });
    return wrap;
  }

  const body = wrap.createDiv({ cls: "ca-jrc-body" });
  const foot = wrap.createDiv({ cls: "ca-jrc-foot" });

  // The region is the source of truth on load; this is the source of truth
  // while the widget is open — the same contract buildTasks and buildList use.
  let pairs: RecallPair[] = [];
  // This sitting's verdicts, parallel to `pairs`. Deliberately not persisted:
  // see the note in recall.ts on why a card carries no state.
  let grades: (RecallGrade | null)[] = [];
  // Which cards have had their answer shown. Reset by "Start over" so a deck
  // can be run twice in one sitting.
  let revealed: boolean[] = [];
  let editing = false;

  const target = recallTarget(deps, ctx);
  const canGrade = "file" in target;

  const persist = (): void => {
    void deps.writeNoteRegionToFile(ctx, key, serializeRecall(pairs));
  };

  // Every grade rewrites Confidence from the sitting *so far*, rather than
  // waiting for the last card. A session abandoned three cards in is still
  // evidence, and the alternative — write once at the end — silently records
  // nothing for exactly the sittings most worth recording, the ones that went
  // badly enough to stop.
  const grade = async (index: number, g: RecallGrade): Promise<void> => {
    grades[index] = g;
    render();
    if (!("file" in target)) return;
    const conf = confidenceFor(tally(grades, pairs.length));
    if (conf == null) return;
    try {
      await writeRecallGrade(deps, target.file, conf);
    } catch (e) {
      console.error("[ChronoAnvil] could not write recall grade", e);
      new Notice("Couldn't record that grade — see the console.");
    }
  };

  const renderCards = (): void => {
    if (pairs.length === 0) {
      body.createDiv({
        cls: "ca-jrc-empty",
        text: "No cards yet — press the pencil to add some.",
      });
      return;
    }
    pairs.forEach((pair, i) => {
      const card = body.createDiv({
        cls: `ca-jrc-card${grades[i] ? ` is-${grades[i]}` : ""}`,
      });
      card.createDiv({ cls: "ca-jrc-q", text: pair.question || "(no question)" });

      if (!revealed[i]) {
        const show = card.createEl("button", {
          cls: "ca-jrc-reveal",
          text: "Show answer",
          attr: { type: "button" },
        });
        show.addEventListener("click", () => {
          revealed[i] = true;
          render();
        });
        return;
      }

      card.createDiv({
        cls: "ca-jrc-a",
        text: pair.answer || "(no answer written yet)",
      });

      // The two buttons only exist before a verdict; afterwards the card
      // states what you said. A row of live buttons on an answered card
      // invites re-grading until the number comes out flattering, which is
      // the one way a self-graded scale reliably lies.
      if (grades[i]) {
        card.createDiv({
          cls: "ca-jrc-verdict",
          text: grades[i] === "got" ? "Got it" : "Not yet",
        });
        return;
      }
      const row = card.createDiv({ cls: "ca-jrc-grade" });
      const got = row.createEl("button", {
        cls: "ca-jrc-got",
        text: "Got it",
        attr: { type: "button" },
      });
      got.addEventListener("click", () => void grade(i, "got"));
      const missed = row.createEl("button", {
        cls: "ca-jrc-missed",
        text: "Not yet",
        attr: { type: "button" },
      });
      missed.addEventListener("click", () => void grade(i, "missed"));
    });
  };

  const renderEditor = (): void => {
    pairs.forEach((pair, i) => {
      const row = body.createDiv({ cls: "ca-jrc-edit-row" });
      const q = row.createEl("input", {
        type: "text",
        cls: "ca-jrc-edit-q",
        attr: { placeholder: "Question" },
      });
      q.value = pair.question;
      q.addEventListener("blur", () => {
        const v = normalizeRecallText(q.value);
        if (v === pair.question) return;
        pair.question = v;
        persist();
      });

      const a = row.createEl("input", {
        type: "text",
        cls: "ca-jrc-edit-a",
        attr: { placeholder: "Answer" },
      });
      a.value = pair.answer;
      a.addEventListener("blur", () => {
        const v = normalizeRecallText(a.value);
        if (v === pair.answer) return;
        pair.answer = v;
        persist();
      });

      const del = row.createEl("button", {
        cls: "ca-jrc-edit-del",
        attr: { "aria-label": "Delete card", type: "button" },
      });
      setIcon(del, "x");
      del.addEventListener("click", () => {
        pairs.splice(i, 1);
        grades.splice(i, 1);
        revealed.splice(i, 1);
        persist();
        render();
      });
    });

    const addRow = body.createDiv({ cls: "ca-jrc-edit-row ca-jrc-edit-add" });
    const addQ = addRow.createEl("input", {
      type: "text",
      cls: "ca-jrc-edit-q",
      attr: { placeholder: "New question" },
    });
    const addA = addRow.createEl("input", {
      type: "text",
      cls: "ca-jrc-edit-a",
      attr: { placeholder: "Answer" },
    });
    const commitNew = (): void => {
      const question = normalizeRecallText(addQ.value);
      if (!question) return;
      pairs.push(newPair(question, addA.value));
      grades.push(null);
      revealed.push(false);
      addQ.value = "";
      addA.value = "";
      persist();
      render();
      // Focus the fresh add row, which render() has just rebuilt.
      const next = body.querySelector<HTMLInputElement>(
        ".ca-jrc-edit-add .ca-jrc-edit-q"
      );
      next?.focus();
    };
    addA.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitNew();
      }
    });
    addQ.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addA.focus();
      }
    });
    addA.addEventListener("blur", commitNew);
  };

  const renderFoot = (): void => {
    foot.empty();
    if (editing || pairs.length === 0) return;
    const t = tally(grades, pairs.length);
    foot.createSpan({ cls: "ca-jrc-tally", text: describeSession(t) });

    // Only say where the grades land when it isn't this note — on an
    // unpromoted lesson the answer is "here", and saying so every time is
    // chrome. On a page it is the one thing worth stating, because a page
    // carries no rating of its own.
    if ("file" in target && !target.isOwner) {
      foot.createSpan({ cls: "ca-jrc-target", text: `→ ${target.name}` });
    } else if ("reason" in target) {
      foot.createSpan({ cls: "ca-jrc-target ca-jrc-inert", text: target.reason });
    }
  };

  const renderTools = (): void => {
    tools.empty();
    const edit = tools.createEl("button", {
      cls: `ca-jrc-tool${editing ? " is-active" : ""}`,
      attr: {
        "aria-label": editing ? "Done editing" : "Edit cards",
        title: editing ? "Done editing" : "Edit cards",
        type: "button",
      },
    });
    setIcon(edit, editing ? "check" : "pencil");
    edit.addEventListener("click", () => {
      editing = !editing;
      render();
    });

    if (editing || !grades.some(Boolean)) return;
    const again = tools.createEl("button", {
      cls: "ca-jrc-tool",
      attr: {
        "aria-label": "Start over",
        title: "Hide the answers and clear this sitting's grades",
        type: "button",
      },
    });
    setIcon(again, "rotate-ccw");
    again.addEventListener("click", () => {
      // In-memory only. The Confidence already written stands: it was a real
      // reading of a real sitting, and un-writing it on a second run would
      // make the trend a record of your last attempt rather than your last
      // few.
      grades = pairs.map(() => null);
      revealed = pairs.map(() => false);
      render();
    });
  };

  const render = (): void => {
    body.empty();
    body.toggleClass("is-editing", editing);
    if (editing) renderEditor();
    else renderCards();
    renderTools();
    renderFoot();
  };

  const file = deps.fileOf(ctx);
  if (file) {
    void deps.app.vault.read(file).then((text) => {
      pairs = parseRecall(readNoteRegion(text, key));
      grades = pairs.map(() => null);
      revealed = pairs.map(() => false);
      if (!canGrade && pairs.length === 0) editing = true;
      render();
      void deps.ensureNoteRegion(file, key);
    });
  } else {
    render();
  }

  return wrap;
}
