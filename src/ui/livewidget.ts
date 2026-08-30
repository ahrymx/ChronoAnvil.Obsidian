// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Generalizes the old private `FrontmatterWidget` (widgets.ts) that the
// week/month summaries used — rebuild on the host note's own metadata
// changing — into a widget that can rebuild on *any* file change matching
// a caller-supplied predicate. The native table widgets (tables.ts) need
// that: logging a lesson has to refresh the subject's Topics table, not
// just re-render when the subject's own index note changes.
//
// The metadataCache "changed" event fires *after* the cache updates, so a
// rebuild always reads the new value. Debounced so a burst of changes
// (e.g. the migration pass rewriting several notes at once) coalesces
// into a single rebuild instead of one per file.

import {
  App,
  Component,
  MarkdownPostProcessorContext,
  MarkdownRenderChild,
  MarkdownView,
  TFile,
} from "obsidian";

export interface LiveWidgetOptions {
  build: () => HTMLElement;
  // Whether a changed file should trigger a rebuild. Typically a scope
  // check — "is this file under my folder?" — rather than an exact path
  // match, so cross-file aggregation (topics-table, confidence-summary,
  // tag-index) stays live.
  shouldRefresh: (changed: TFile) => boolean;
  // Whether a created/deleted/renamed vault path should trigger a rebuild.
  // The metadataCache "changed" event only ever fires for a *file*, and only
  // once its content is parsed — so a widget whose shape is made of folders
  // (the Journals banner: one section per type, one group per subject folder)
  // never hears about a new, renamed or deleted folder at all. Supplying this
  // registers the vault's own create/delete/rename events alongside.
  shouldRefreshPath?: (path: string) => boolean;
  // Coalesce bursts of "changed" events into one rebuild. Default ~150ms.
  debounceMs?: number;
  // Tear-down for the previous build's resources (e.g. a Chart.js instance),
  // run before each rebuild and once on unload. The DOM itself is cleared
  // separately; this is for anything that outlives its element.
  onCleanup?: () => void;
}

const DEFAULT_DEBOUNCE_MS = 150;

export class LiveWidget extends MarkdownRenderChild {
  private timer: number | null = null;

  constructor(
    private app: App,
    hostEl: HTMLElement,
    private opts: LiveWidgetOptions
  ) {
    super(hostEl);
  }

  onload(): void {
    this.rerender();
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (!this.opts.shouldRefresh(file)) return;
        this.scheduleRerender();
      })
    );

    const pathTest = this.opts.shouldRefreshPath;
    if (pathTest) {
      const onPath = (path: string) => {
        if (!pathTest(path)) return;
        this.scheduleRerender();
      };
      this.registerEvent(this.app.vault.on("create", (f) => onPath(f.path)));
      this.registerEvent(this.app.vault.on("delete", (f) => onPath(f.path)));
      // Rename fires with the *new* file and its old path; either side moving
      // in or out of scope is a reason to repaint.
      this.registerEvent(
        this.app.vault.on("rename", (f, oldPath) => {
          onPath(f.path);
          onPath(oldPath);
        })
      );
    }
  }

  // Force a rebuild now, bypassing the debounce. For controls that change what
  // the widget shows without touching any file the scope watches — the
  // Journals banner's own Refresh, which re-reads folders that may have been
  // created outside the vault (synced in, edited on disk).
  refresh(): void {
    if (this.timer != null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.rerender();
  }

  onunload(): void {
    if (this.timer != null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.opts.onCleanup?.();
  }

  private scheduleRerender(): void {
    if (this.timer != null) window.clearTimeout(this.timer);
    const delay = this.opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.rerender();
    }, delay);
  }

  private rerender(): void {
    this.opts.onCleanup?.();
    this.containerEl.empty();
    this.containerEl.appendChild(this.opts.build());
  }
}

// ── WHERE CHRONOANVIL HAS DRAWN, WHEREVER THAT IS ───────────────────────────
//
// `repaintOpenNotes` below could only ever reach a markdown leaf, because
// re-rendering the note was the only way it knew to re-run a block processor.
// That is the whole of the mechanism and it is why the repaint stopped at the
// edge of a MarkdownView: a block rendered anywhere else — a custom view that
// calls `MarkdownRenderer.render`, a dashboard plugin embedding a note, an
// export — has no note to re-render, so it kept whatever words it was drawn
// with until something else happened to rebuild it.
//
// The fix is to stop asking the HOST to re-render and let the block re-run
// itself. Every ChronoAnvil render site registers here, keeps the arguments it was
// called with, and can draw itself again on demand. `repaintOpenNotes` then
// covers markdown leaves the way it always did and every other site directly.
//
// SITES ARE PRUNED, NOT TRACKED. A site is dropped when its element is no
// longer in the document, checked at repaint time rather than watched: a
// detached site costs two fields and a closure until the next repaint notices,
// and that is far cheaper than a MutationObserver per block. The lifecycle
// hooks below still unregister eagerly where Obsidian tells us; this is the
// backstop for the hosts that do not.
interface RenderSite {
  // A FUNCTION, NOT A FIELD, because the inline path swaps its element on every
  // repaint — there is no wrapper to hold still, so the site is asked each time
  // rather than remembering an element that may already be detached.
  el(): HTMLElement;
  repaint(): void;
}

const sites = new Set<RenderSite>();

function registerSite(site: RenderSite): () => void {
  sites.add(site);
  return () => sites.delete(site);
}

// A context whose `addChild` lands somewhere we can unload.
//
// THIS IS WHAT MAKES REPAINTING SAFE TO DO TWICE. The widgets a block draws
// register their own watchers through `ctx.addChild` — that is what `LiveWidget`
// above is — and those children belong to the renderer, which unloads them when
// the note goes away. Re-running a block against that same context would add a
// second set beside the first: the old ones keep their `metadataCache` listener
// and rebuild forever into an element no longer on screen. Ten repaints, ten
// live copies of every widget on the page.
//
// So each drawing gets its own `Component` to hang children on, and the
// generation before it is unloaded first. Everything else is forwarded
// unchanged — `getSectionInfo` in particular, which must keep reaching
// Obsidian's own context to answer truthfully about the file.
function scopedContext(
  ctx: MarkdownPostProcessorContext,
  owner: Component
): MarkdownPostProcessorContext {
  return {
    docId: ctx.docId,
    sourcePath: ctx.sourcePath,
    // A getter rather than a copy: the renderer fills this in and may replace
    // it, and a value read once at mount would freeze the first answer.
    get frontmatter() {
      return ctx.frontmatter;
    },
    addChild: (child) => owner.addChild(child),
    getSectionInfo: (el) => ctx.getSectionInfo(el),
  };
}

export type BlockRenderer = (
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
) => void;

// A fenced ```chronoanvil block, held open so it can be drawn again.
//
// `containerEl` is the element Obsidian handed the processor, and it stays put:
// a repaint empties it and draws into it again, so the removal-driven unload
// that `ctx.addChild` promises still fires at exactly the right moment — when
// the block itself leaves the document, not when its contents are replaced.
class BlockSite extends MarkdownRenderChild {
  private generation: Component | null = null;
  private unregister: (() => void) | null = null;

  constructor(
    el: HTMLElement,
    private source: string,
    private ctx: MarkdownPostProcessorContext,
    private render: BlockRenderer
  ) {
    super(el);
  }

  onload(): void {
    this.draw();
    this.unregister = registerSite({
      el: () => this.containerEl,
      repaint: () => this.repaint(),
    });
  }

  onunload(): void {
    this.unregister?.();
    this.unregister = null;
    this.discard();
  }

  private repaint(): void {
    this.discard();
    this.containerEl.empty();
    this.draw();
  }

  private draw(): void {
    const generation = new Component();
    this.generation = generation;
    generation.load();
    this.render(
      this.source,
      this.containerEl,
      scopedContext(this.ctx, generation)
    );
  }

  private discard(): void {
    this.generation?.unload();
    this.generation = null;
  }
}

// Draw a fenced block and keep it repaintable. The processors in
// ui/widgets/index.ts register through this rather than calling
// `registerMarkdownCodeBlockProcessor` directly.
export function mountBlock(
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  render: BlockRenderer
): void {
  ctx.addChild(new BlockSite(el, source, ctx, render));
}

// The legacy inline `chronoanvil:...` syntax, same treatment.
//
// IT HAS NO ELEMENT OF ITS OWN TO KEEP. The fenced path is given a container and
// draws inside it; this one REPLACES the `<code>` it was written as, so the
// widget is the element and redrawing means swapping one node for another. That
// rules out holding the element still, and it rules out wrapping it — these sit
// in table cells, where an extra span is a layout change to inherit for the sake
// of a repaint.
//
// So the site reports its element through a function and the child anchors on
// the PARENT, which is the one node in this arrangement that does not move.
// Anchoring on the widget would arm `ctx.addChild`'s removal-driven unload
// against our own swap: the first repaint would detach the element the child was
// registered with, Obsidian would unload the child, and the site would quietly
// stop repainting after exactly one try.
class InlineSite extends MarkdownRenderChild {
  private unregister: (() => void) | null = null;

  constructor(
    anchor: HTMLElement,
    private current: HTMLElement,
    private generation: Component,
    private ctx: MarkdownPostProcessorContext,
    private build: (ctx: MarkdownPostProcessorContext) => HTMLElement | null
  ) {
    super(anchor);
  }

  onload(): void {
    this.unregister = registerSite({
      el: () => this.current,
      repaint: () => this.repaint(),
    });
  }

  onunload(): void {
    this.unregister?.();
    this.unregister = null;
    this.generation.unload();
  }

  private repaint(): void {
    const generation = new Component();
    generation.load();
    const next = this.build(scopedContext(this.ctx, generation));
    // A DIRECTIVE THAT NO LONGER BUILDS KEEPS WHAT IS ON SCREEN. `build` returns
    // null for a widget that has been retired or whose tracker was deleted, and
    // the reader is better served by a stale button than by a control silently
    // vanishing out of a table cell mid-session.
    if (!next) {
      generation.unload();
      return;
    }
    this.generation.unload();
    this.generation = generation;
    this.current.replaceWith(next);
    this.current = next;
  }
}

// Replace an inline `<code>` with its widget, and keep it repaintable.
// Does nothing when the directive builds nothing, which leaves the code element
// as written — the behaviour before this path existed.
export function mountInline(
  code: Element,
  ctx: MarkdownPostProcessorContext,
  build: (ctx: MarkdownPostProcessorContext) => HTMLElement | null
): void {
  const generation = new Component();
  generation.load();
  const first = build(scopedContext(ctx, generation));
  if (!first) {
    generation.unload();
    return;
  }
  const anchor = code.parentElement;
  code.replaceWith(first);
  ctx.addChild(
    new InlineSite(anchor ?? first, first, generation, ctx, build)
  );
}

// Repaint every open note. 3.20.1.
//
// WHY THIS IS NEEDED AT ALL. Every live thing in a rendered note refreshes on a
// FILE event — `LiveWidget` watches `metadataCache.changed` and the vault's
// create/delete/rename — because until now everything that could change what a
// note shows was, in the end, a file. A note type's LABEL is not: it lives in
// settings, and renaming one changes the words on buttons, empty states and
// headings in notes no file event will ever mention.
//
// So renaming a note type left every open dashboard stale — a heading reading
// "Seminars" above a button still reading "New Lesson", which is precisely the
// disagreement the rename existed to remove.
//
// WHY NOT `LiveWidget.refresh()`. A widget rebuilds its own subtree, and the
// button beside it is not in that subtree: buttons, headers and the section
// frame are drawn by the block processor, once, when the note is rendered. Only
// re-rendering the note re-runs it. Half a repaint would have fixed the empty
// state and left the button, which is the same complaint one control smaller.
//
// WHY NOT TOUCH THE FILE. Writing a note to provoke a repaint would put an edit
// in the reader's undo history, move its modified time, and — on a synced
// vault — send a change nobody made. The settings changed; the notes did not.
// AND WHY IT NO LONGER STOPS AT A MARKDOWN LEAF (4.18.2). The loop below was the
// whole function, which quietly made "every open note" mean "every note open in
// a markdown tab". A block rendered by any other host — see the site registry
// above — was left saying whatever it said when it was drawn. Those hosts are
// not hypothetical: `MarkdownRenderer.render` is public API and dashboard
// plugins embed notes through it, at which point a kind rename updated the note
// in one pane and not the copy of it in the other.
export function repaintOpenNotes(app: App): void {
  // COLLECTED BEFORE ANYTHING IS RE-RENDERED, and that ordering is the point:
  // `rerender` tears down and rebuilds the preview, taking the sites inside it
  // with it, so a container read afterwards would no longer contain the very
  // elements this list exists to exclude.
  const rerendered: HTMLElement[] = [];
  for (const leaf of app.workspace.getLeavesOfType("markdown")) {
    const view = leaf.view;
    if (view instanceof MarkdownView) {
      rerendered.push(view.containerEl);
      // `true` for a FULL rebuild: a partial one reuses cached sections, and
      // the cached section is exactly the stale thing here.
      view.previewMode?.rerender(true);
    }
  }
  repaintForeignSites(rerendered);
}

// The half of the repaint no note re-render can reach.
//
// SITES INSIDE A REPAINTED VIEW ARE SKIPPED RATHER THAN REPAINTED TWICE. The
// note re-render above already rebuilds them from source, which is the stronger
// operation of the two — it re-reads the file, so it catches an edit the block
// was never told about. Repainting them again would redraw from the source
// string captured at mount, racing Obsidian's teardown to write into elements it
// is in the middle of discarding.
function repaintForeignSites(rerendered: HTMLElement[]): void {
  // A COPY, because `repaint` runs the block's own render path, and a block that
  // draws a nested block would mutate the set mid-iteration.
  for (const site of Array.from(sites)) {
    const el = site.el();
    if (!el.isConnected) {
      sites.delete(site);
      continue;
    }
    if (rerendered.some((root) => root.contains(el))) continue;
    site.repaint();
  }
}
