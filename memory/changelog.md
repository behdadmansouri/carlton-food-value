# Changelog — Carlton Food Value

One line per user-visible change. The reasoning, numbers and mechanism live in the commit
messages; `git log --grep` answers "why and how".

## 2026-09-22
- Pro mode: a header toggle that adds six weighted scoring dimensions, a venue ranking, a
  continuous max-spend slider (replacing fixed price tiers), cuisine/search/shared filters, and
  per-row source notes. Base mode is unchanged.
- Emoji anchors on every section header and control label, and a consistent icon vocabulary
  (one emoji per format, metric, confidence level and purchase channel) reused across chips,
  legend, every table cell, tooltips, matrix headers, tells and map popups.
- Pro mode now defaults on, with a larger, colour-filled toggle.
- Frontier and fanciness charts zoom (ctrl/cmd+scroll, drag to pan, +/−/reset).
- Each weight slider shows what your top pick actually costs at importance 1 vs 10, in real units.
- Ingredient exclusions (seafood, pork, chicken, beef, lamb, turkey, egg, dairy, plant), derived
  from dish text; dishes matching no keyword are never hidden.
- "× vs home" column: what a dish costs as a multiple of cooking the same calories and protein
  from Loblaws staples.
- Frontier chart now frames $0–$70 on both axes by default (was ~$279, which crushed everything
  into one corner); says how many dishes are off-frame, still zoomable out to reach them.
- "× vs home" no longer shown for home-cooked rows, which were being scored against the median
  home meal and reading as low as 0.3× under a label that claimed otherwise.
