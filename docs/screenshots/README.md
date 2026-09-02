# README screenshots

The eight captures the README's **Visual tour** links to. They are referenced by
path from the front page of the repository — and from the community listing,
which renders the same README — so a rename here is a broken image where it is
seen most. Filenames are the contract; change one and change `README.md` in the
same commit.

| File | What it shows |
| --- | --- |
| `dashboard.png` | The homepage: year calendar with heat map, the four period dashboards, the open-task rollup and the top of the time grid. The widest, most representative page — it is the hero image, full width. |
| `calendar.png` | The diary calendar panel on its own: quarters and months, day dots, special-event stars, and **Coming up**. |
| `diary-entry.png` | A daily entry from its header down: the tracker row (mood and energy scales, bedtime/wake-up times with the derived sleep total, focus), then focus, highlights, challenges, notes, attachments and tasks. |
| `charts.png` | A dashboard's **Trends and statistics** section — five chart blocks: two bar, one line, one summary and one dual-axis time-of-day. |
| `study-journal.png` | The Study journal index: the activity heat map with its streak counters, then subjects with their topics. |
| `week-dashboard.png` | A week dashboard: the entries rolled up beside the week's open tasks. |
| `graph.png` | Obsidian's own graph view of a seeded vault, showing the period chain the diary spine builds and the journals branching off it. |
| `themes.png` | The homepage under three Obsidian themes, composited on two diagonals — neutral grey, warm, cool, left to right. Full width. |

PNG, taken at a normal window width rather than maximised on a large display,
and in whichever theme the rest of the vault is in. `dashboard.png` and
`themes.png` run full width; everything else sits in a two-column table, so keep
those between roughly 550 and 750 pixels wide — a wider image is downscaled into
that cell and stops being legible.

`themes.png` is composited, not captured. Three same-page screenshots are cut on
two parallel diagonals at a slant of 0.35, with the boundaries solved so each
theme gets exactly a third of the canvas, and a bevelled 11 px seam between
them. The seam is wide on purpose: the three themes set their own fonts, so a
line of text lands at a different x in each band, and a hairline join reads as a
rendering fault rather than as a comparison. To rebuild it, re-run the compositor
against three captures of the same scroll position — the alignment is by window
centre, so the windows must be the same size.

## The tour video

The moving tour is **not** in this directory and must not be. The capture is a
38 MB GIF; a README that inlines it makes every visitor download it before the
page settles, and git would carry it forever. The README links out to a YouTube
upload instead. The URL is the one thing in the Visual tour that is still a
placeholder — search `README.md` for `REPLACE_WITH_VIDEO_ID`.
