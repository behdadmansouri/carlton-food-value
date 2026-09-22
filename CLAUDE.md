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
