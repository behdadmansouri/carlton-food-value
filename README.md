# 120 Carlton; Food Value Map

Same question as the [NYFood](https://github.com/behdadmansouri/NYFood) study; $ per 1000 kcal, $ per 20g protein, measured against a grocery baseline; scoped to a 1km radius around 120 Carlton St, Toronto, and including the Loblaws two blocks away as the home-cooked comparison point.

Live page: https://behdadmansouri.github.io/carlton-food-value/

## What this is

25 restaurant venues (7 within 400m) + Loblaws Carlton Street, all within 1km of 120 Carlton St. Real prices (scraped from restaurant sites, delivery listings, Google Maps, or search-engine snippets, September 2026; never fabricated). Nutrition is a component-based estimate from each dish's description (not lab data), confidence-tagged per row.

A second research pass (2026-09-22) went street-by-street through the 0-400m ring specifically, since the first pass under-covered it (3 venues found vs. 7 now), and added 11 more Loblaws options (raw ingredients: salmon, pork chop, ground turkey, canned tuna, lentils, oats, peanut butter, Greek yogurt, black beans, bread, pasta; ready-to-eat: rotisserie combo, mac & cheese, mashed potatoes, chicken strip combos). loblaws.ca blocked live browsing all session, so the newer grocery prices come from search-engine snippets rather than a direct page load; flagged at reduced confidence, and one anomalously-priced item (a suspicious $8 half-rack-of-ribs listing) was dropped rather than included.

Loblaws is scored twice, on purpose: **home-cooked** (you buy raw ingredients and cook them yourself; chicken breast, tofu, ground beef, eggs, all with rice) and **ready-to-eat** (hot bar rotisserie chicken, pre-made sushi, deli sandwich; no cooking, same as ordering out). They land in very different places on the frontier.

The page also has a **channel toggle** (grocery / dine-in / counter takeout / table service / delivery app); restaurant prices scale by the SPEC.md multipliers (1.00 / 1.13 / 1.30 / 1.75x) so you can see the same dish get more expensive as you add tax, tip, and delivery markup. Grocery prices don't move; that's the whole point.

## Data honesty

- Every price traces to a source noted in `data.js`.
- Confidence: `high` = published/chain nutrition or explicit menu weights; `medium` = component estimate from a detailed description; `low` = thin description or a weakly-sourced price.
- A few leads (permanently-closed venues, addresses outside the 1km radius, unconfirmed prices) were dropped rather than guessed; see the research notes in the commit history.
- Grocery shelf prices came from web-indexed Loblaws/No Name listings (loblaws.ca blocked direct scraping); flagged medium confidence in the source notes, worth a live re-check before treating as exact.

## Local dev

Static site, no build step. `python3 -m http.server` and open `index.html`.
