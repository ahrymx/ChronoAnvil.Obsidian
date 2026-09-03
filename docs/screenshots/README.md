# README screenshots

The twelve captures the README's **Visual tour** links to. They are referenced by
path from the front page of the repository — and from the community listing,
which renders the same README — so a rename here is a broken image where it is
seen most. Filenames are the contract; change one and change `README.md` in the
same commit.

`test/review-checklist.test.ts` holds both halves of that contract: every image
the README links must exist here, and every PNG here must be linked by the
README. Adding a capture without a row in the tour fails the suite, and so does
deleting a row without deleting the file.

## Captured

| File | What it shows |
| --- | --- |
| `dashboard.png` | The homepage: year calendar with heat map, the four period dashboards, the open-task rollup and the top of the time grid. The hero image, full width. |
| `diary-entry.png` | A daily entry with compact numberless tracker cells (mood and energy scales, dynamic bedtime/wake-up time buttons with live sleep/wake duration readout, 2-row tags, and diary fields). |
| `charts.png` | A dashboard's **Trends and statistics** section — annual mood heatmap, 90-day sleep and energy line charts with rolling averages, mood summary metrics, and sleep vs mood scatter correlation plot. |
| `study-journal.png` | The Study journal dashboard: subject cards (Linear Algebra, Organic Chemistry, Spanish), topics, confidence ratings, statistics strip, and activity heat map. |
| `period-dashboard.png` | A yearly / period overview dashboard: annual stats, entry density histogram, quarters breakdown cards, and highlights recap digest. |
| `journals.png` | The **Journals** settings panel: the four presets with their identifiers, root folders and structure, and the vault-wide folder emoji list. |
| `section-composer.png` | The section and widget palette modal: modular catalogue of drag-and-drop sections and widgets for customizing notes and dashboards. |
| `quick-capture.png` | The Quick capture modal — destination note, timestamp, and the box. |
| `logbook.png` | A logbook widget with its sub-logbook menu open: named books with entry counts, the Open / Done / Timed tabs, and the composer with its **Now** button. |
| `settings.png` | Configuration and theme customizer: rich page ground textures (scanlines, dot grid, graph paper, weaves) and custom vault banner styling. |

PNG, taken at a normal window width rather than maximised on a large display,
and in whichever theme the rest of the vault is in. `dashboard.png` runs full
width; everything else sits in a two-column table, so keep those between roughly
550 and 750 pixels wide — a wider image is downscaled into that cell and stops
being legible. `logbook.png` is the one exception, at 1182 px: it is a wide
widget and it survives the downscale because its content is large.

## Built

Two of the twelve are generated. Both read the untouched grabs under
`screenshots/readme-update-assets/` and write here, so running either twice
produces the same file rather than compounding on its own output.

| File | Built by |
| --- | --- |
| `themes.png` | `node tools/make-theme-strip.mjs` |
| `time-grid.png` | `node tools/annotate-shot.mjs` |

### `themes.png` — five themes, one page

Five captures of the same homepage at the same scroll position, cut into five
equal bands on four parallel diagonals with an 11 px bevelled seam between them.

The alignment is by window centre, so the windows must be the same size; the
five differ by a pixel or three and the tool centre-crops them to a common size
before anything else. It then crops again to the plugin's own pane, dropping
Obsidian's file sidebar and window chrome — **that second crop is the difference
between a comparison and a collage.** Sliced at full window width, one band
lands on the file tree and another on the empty gutter beside the task panel, so
two of the five show nothing that themes.

The bands are ordered light, dark, light, dark rather than in capture order.
Capture order runs dark, dark, dark, light, light, and composited that way three
of the four seams fall between two dark themes and read as a smudge instead of a
boundary.

**The slant is 0.15, not the 0.35 an earlier version of this note specified.**
0.35 leans a band 481 px sideways; five bands over 1657 px are 331 px wide, so
at that slant every band shears clean past its own width and stops reading as a
panel. 0.35 was right for three bands, which are 552 px wide — wider than the
lean — and is wrong for five. The seam stays wide for its original reason: the
five themes set their own fonts, a line of text lands at a different x in each
band, and a hairline join would read as a rendering fault rather than as a
comparison.

### `time-grid.png` — the grid, with its gestures numbered

The weekly hour grid with three callouts drawn onto it: sweep an empty column to
block out a slot, click a block to edit it, drag a block to move it. The third
is anchored to a drag the capture caught mid-gesture — the Friday block is in
hand and the dashed outline on Sunday is where it would land.

The image carries numbered badges and no words, and the legend lives in the
README as a table. That is not a style choice: the test above requires every
README image to be a `.png` under this directory, so the caption cannot be an
SVG overlay, and rasterising prose would need a font library this tree does not
have. `tools/lib/draw.mjs` therefore hand-codes a bitmap font of three glyphs —
the digits 1, 2 and 3 — and nothing else. A fourth callout means a fourth glyph.

To move a badge, edit the `MARKS` table at the top of `tools/annotate-shot.mjs`;
the coordinates are the only thing in that file that changes when the underlying
capture is retaken.

## Sources, and what is not here

The raw grabs live outside the repository in `screenshots/readme-update-assets/`,
including several that are deliberately unused — the Trackers settings panel, the
settings root, and a second week of the time grid. They are kept because the two
generated images need their sources to be rebuildable.

There is no tour video. A recording was made and the capture is a 38 MB GIF: a
README that inlines it makes every visitor download it before the page settles,
and git would carry it forever. The README linked out to a YouTube upload that
was never made, so for several releases the most prominent link on the community
listing pointed at `youtu.be/REPLACE_WITH_VIDEO_ID`. The link is gone. If the
tour is uploaded, it goes back as a line under the hero image — not as an embed,
and not as a file in this directory.
