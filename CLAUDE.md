# Carlton Food Value 🥡

Food-value study for a 1km radius around 120 Carlton St, Toronto: $ per 1000 kcal and $ per 20g
protein per dish, measured against a Loblaws grocery baseline (home-cooked and ready-to-eat,
scored separately). Same methodology as [[NYFood]], scoped to one address instead of a whole
borough. Static site, hosted on GitHub Pages, no build step.

Live: https://behdadmansouri.github.io/carlton-food-value/
Repo: https://github.com/behdadmansouri/carlton-food-value (remote `origin`, this folder is the
working clone)

## Files
| File | Purpose | Created |
|---|---|---|
| CLAUDE.md | This index / project context | 2026-09-22 |
| index.html | Page shell: controls, map, chart, tables | 2026-09-16 |
| app.js | All interactivity: filters, chart, map, matrix, tiers, tells, weighted picks | 2026-09-16 |
| data.js | The dataset itself (`window.CARLTON_DATA`): venues, dishes, grocery items | 2026-09-16 |
| style.css | Styling, dark/light aware | 2026-09-16 |
| README.md | Public-facing repo description and data-honesty notes | 2026-09-16 |
| USAGE.md | How to open, serve and edit the page without Claude | 2026-09-22 |
| memory/changelog.md | One line per user-visible change | 2026-09-22 |

## Two modes: base and pro
The page ships a **pro mode** toggle in the header (persisted in `localStorage` as `carlton.pro`,
**on by default**; only an explicit stored `"off"` opts out). Base mode is the simple instrument. Pro mode adds the NYFood-style layer: six
weighted scoring dimensions, a venue ranking, a continuous max-spend slider (replacing the fixed
$10/$15/$25 tier panel, which is base-only), cuisine checklist, search, solo-vs-shared filter, a
veg column, and per-row expanders showing each dish's provenance note.

Mechanics worth knowing before editing `app.js`:
- CSS gates everything on `html[data-pro="on"]`: `.pro-only` is hidden by default, `.basic-only`
  is hidden while pro is on. `display:revert` is what un-hides, so any element whose *author* CSS
  sets a display (the legend's flex items, the tier grid) needs its own explicit rule.
- Every pro control **starts at its most permissive value**, which is why `state.pro` only has to
  guard the reads inside `filteredRows()` rather than the whole render pipeline.
- `FORMAT_EMOJI` / `CONF_EMOJI` / `CHANNEL_EMOJI` / `CELL_EMOJI` at the top of `app.js` are the
  icon vocabulary: one emoji per concept, reused everywhere that concept renders. Adding a
  format or channel means adding its emoji there, not picking a fresh one at the call site.
- **Zoom is an axis-window change, not a transform.** `view` / `fview` hold the visible slice of
  each chart's fixed domain; `attachZoom` + `zoomAt`/`panBy`/`clampWin` mutate it and redraw. Do
  not "simplify" this into a viewBox scale: that re-thickens strokes, blurs ticks into meaningless
  values, and multiplies the dot radii, which encode kcal. Math is unit-testable in isolation
  (`clampWin`/`zoomAt`/`panBy` take a window and a limit, touch no DOM).
- **Ingredient tags are keyword-derived, and conservative on purpose.** `INGREDIENTS` matches dish
  name + note; ~29 of 167 rows match nothing and are never excluded. If you add keywords, check for
  substring false positives first ("fish" would catch "fish sauce"; "ham " is spaced to miss
  "shawarma").
- **`homeEquivPrice()` takes the MAX of the kcal-based and protein-based home cost**, not the min
  or the mean: matching a dish at home means covering both.
- **`grocery_home` rows get a null markup on purpose** (`HAS_MARKUP`). The baseline is the *median*
  of those same rows, so scoring one against it answers "is this cheaper than a typical home meal"
  while wearing a label that says "vs cooking at home"; red lentils read 0.3× that way, which
  reads as beating cooking by cooking. Do not "fix" the blank cells by restoring the number.
  Ready-to-eat grocery keeps its multiple: that is a real comparison.
- **The frontier's default frame (`HOME_FRAME`, $70/$70) is narrower than its zoom limit**
  (`CHART_LIM`, the full worst-case domain). That is deliberate: the frame fits the data, the
  limit keeps the outliers reachable, and `#chart-offframe` reports how many are cut off.
- Scores are recomputed per render against the currently-visible set, not once globally; "best
  dish in view = 100%" is the definition, so the same dish scores differently under different
  filters. That is deliberate.

## Current state (2026-09-22)
88 venues, 145 priced dishes (21 within 400m), plus Loblaws Carlton Street scored twice
(14 home-cooked ingredient combos, 8 ready-to-eat items). All coordinates are real GPS pins from
Google Maps place pages; all prices trace to a named source (own site, delivery listing, or a
specific review quote) per dish in `data.js`'s `note` field. Confidence-tagged high/medium/low
throughout; never fabricated.

## How this dataset was built
1. First pass: one research agent, live Google Maps + restaurant sites, ~14 venues.
2. Second pass: denser 400m coverage + more Loblaws options (chain fast food, Thai, izakaya).
3. "Maximum venues" pass: 5 parallel research agents, one per geographic zone (north/Church-
   Wellesley, east/Cabbagetown, south/Moss Park, west/College Park, central re-sweep). Ran into
   real trouble: parallel agents shared one Browser tool and hijacked each other's tabs, so 3 of
   5 zones fell back to web search instead of live Maps, producing street-geocoded (non-GPS)
   coordinates and, in one zone, price-range-midpoint prices instead of real named-dish prices.
4. Fix pass: one agent, sequential (no parallel browser use this time), re-verified all 36
   flagged venues against real Google Maps place pages and re-shopped for real prices. 32 got
   corrected coordinates, 30 dishes got upgraded real prices, 0 dropped.

**Lesson for next time a multi-agent research sweep is needed:** the Browser tool (Claude_Browser)
is a single shared pane. Parallel agents that each need their own browsing session will collide.
Either run research agents sequentially, or give each one a distinct method that doesn't need
exclusive browser control (e.g. WebSearch/WebFetch instead of live Maps navigation).

## Known limitations (stated in the page's own footer too)
- Nutrition (kcal/protein) is a component-based estimate from each dish's description, not lab
  data, except chain items and home-cooked grocery meals (marked `high` confidence).
- Channel toggle (grocery/dine-in/counter/table/delivery) applies the same SPEC.md multipliers as
  NYFood (1.00 / 1.13 / 1.30 / 1.75x), not per-venue-verified channel pricing.
- The chart's axis domain is fixed (computed once from the worst-case channel across all dishes)
  specifically so filter toggles never rescale or rebuild the chart, only fade dots in/out.

## Open threads
None outstanding as of 2026-09-22. If asked to find more venues, re-read the "how this dataset
was built" section above before spinning up parallel research agents again.
